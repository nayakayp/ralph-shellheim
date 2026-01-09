//! SFTP Client implementation using russh-sftp
//!
//! Handles SFTP connections and file operations.

use async_trait::async_trait;
use russh::client::{self, Config, Handle, Handler};
use russh::Disconnect;
use russh_keys::key::PrivateKeyWithHashAlg;
use russh_sftp::client::SftpSession;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{debug, error, info, warn};

/// File entry in a directory listing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<i64>, // Unix timestamp
    pub permissions: Option<u32>,
    pub owner: Option<u32>,
    pub group: Option<u32>,
}

/// File stats
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileStats {
    pub size: u64,
    pub is_dir: bool,
    pub is_file: bool,
    pub is_symlink: bool,
    pub modified: Option<i64>,
    pub accessed: Option<i64>,
    pub permissions: Option<u32>,
    pub owner: Option<u32>,
    pub group: Option<u32>,
}

/// SFTP client handler (minimal - just for auth/connection)
pub struct SftpClientHandler {
    pub session_id: String,
    pub expected_fingerprint: Option<String>,
}

#[async_trait]
impl Handler for SftpClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh_keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        let fingerprint = server_public_key
            .fingerprint(russh_keys::HashAlg::Sha256)
            .to_string();

        if let Some(ref expected) = self.expected_fingerprint {
            if expected == &fingerprint {
                Ok(true)
            } else {
                error!(
                    "SFTP[{}] HOST KEY MISMATCH! Expected: {}, Got: {}",
                    self.session_id, expected, fingerprint
                );
                Ok(false)
            }
        } else {
            // For SFTP, we should always have a known host from SSH connection
            warn!(
                "SFTP[{}] No expected fingerprint provided",
                self.session_id
            );
            Ok(true)
        }
    }
}

/// Active SFTP connection with client
pub struct SftpConnection {
    /// The russh client handle
    pub handle: Handle<SftpClientHandler>,
    /// The SFTP session
    pub sftp: SftpSession,
}

impl SftpConnection {
    /// List directory contents
    pub async fn list_dir(&self, path: &str) -> Result<Vec<FileEntry>, String> {
        let path = if path.is_empty() { "." } else { path };

        debug!("SFTP listing directory: {}", path);

        let read_dir = self
            .sftp
            .read_dir(path)
            .await
            .map_err(|e| format!("Failed to read directory '{}': {}", path, e))?;

        let mut entries = Vec::new();

        for item in read_dir {
            let name = item.file_name();
            let metadata = item.metadata();

            let full_path = if path == "." || path == "/" {
                if path == "/" {
                    format!("/{}", name)
                } else {
                    name.clone()
                }
            } else {
                format!("{}/{}", path.trim_end_matches('/'), name)
            };

            let file_type = metadata.file_type();
            let is_dir = file_type.is_dir();

            entries.push(FileEntry {
                name,
                path: full_path,
                is_dir,
                size: metadata.size.unwrap_or(0),
                modified: metadata.mtime.map(|t| t as i64),
                permissions: metadata.permissions,
                owner: metadata.uid,
                group: metadata.gid,
            });
        }

        // Sort: directories first, then alphabetically
        entries.sort_by(|a, b| {
            match (a.is_dir, b.is_dir) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            }
        });

        Ok(entries)
    }

    /// Get file/directory stats
    pub async fn stat(&self, path: &str) -> Result<FileStats, String> {
        let metadata = self
            .sftp
            .metadata(path)
            .await
            .map_err(|e| format!("Failed to stat '{}': {}", path, e))?;

        let file_type = metadata.file_type();

        Ok(FileStats {
            size: metadata.size.unwrap_or(0),
            is_dir: file_type.is_dir(),
            is_file: file_type.is_file(),
            is_symlink: file_type.is_symlink(),
            modified: metadata.mtime.map(|t| t as i64),
            accessed: metadata.atime.map(|t| t as i64),
            permissions: metadata.permissions,
            owner: metadata.uid,
            group: metadata.gid,
        })
    }

    /// Read file contents
    pub async fn read_file(&self, path: &str) -> Result<Vec<u8>, String> {
        debug!("SFTP reading file: {}", path);

        self.sftp
            .read(path)
            .await
            .map_err(|e| format!("Failed to read file '{}': {}", path, e))
    }

    /// Write file contents
    pub async fn write_file(&self, path: &str, data: &[u8]) -> Result<(), String> {
        debug!("SFTP writing file: {} ({} bytes)", path, data.len());

        // Create/truncate the file and write data
        let mut file = self
            .sftp
            .create(path)
            .await
            .map_err(|e| format!("Failed to create file '{}': {}", path, e))?;

        use tokio::io::AsyncWriteExt;
        file.write_all(data)
            .await
            .map_err(|e| format!("Failed to write file: {}", e))?;

        Ok(())
    }

    /// Delete a file
    pub async fn delete_file(&self, path: &str) -> Result<(), String> {
        debug!("SFTP deleting file: {}", path);
        self.sftp
            .remove_file(path)
            .await
            .map_err(|e| format!("Failed to delete '{}': {}", path, e))
    }

    /// Delete a directory (must be empty)
    pub async fn delete_dir(&self, path: &str) -> Result<(), String> {
        debug!("SFTP deleting directory: {}", path);
        self.sftp
            .remove_dir(path)
            .await
            .map_err(|e| format!("Failed to delete directory '{}': {}", path, e))
    }

    /// Create a directory
    pub async fn create_dir(&self, path: &str) -> Result<(), String> {
        debug!("SFTP creating directory: {}", path);
        self.sftp
            .create_dir(path)
            .await
            .map_err(|e| format!("Failed to create directory '{}': {}", path, e))
    }

    /// Rename/move a file or directory
    pub async fn rename(&self, old_path: &str, new_path: &str) -> Result<(), String> {
        debug!("SFTP renaming: {} -> {}", old_path, new_path);
        self.sftp
            .rename(old_path, new_path)
            .await
            .map_err(|e| format!("Failed to rename '{}' to '{}': {}", old_path, new_path, e))
    }

    /// Get the current working directory (home directory)
    pub async fn get_home_dir(&self) -> Result<String, String> {
        self.sftp
            .canonicalize(".")
            .await
            .map_err(|e| format!("Failed to get home directory: {}", e))
    }

    /// Resolve a path to its absolute form
    pub async fn realpath(&self, path: &str) -> Result<String, String> {
        self.sftp
            .canonicalize(path)
            .await
            .map_err(|e| format!("Failed to resolve path '{}': {}", path, e))
    }

    /// Close the connection
    pub async fn close(self) -> Result<(), String> {
        self.sftp
            .close()
            .await
            .map_err(|e| format!("Failed to close SFTP session: {}", e))?;

        self.handle
            .disconnect(Disconnect::ByApplication, "SFTP session closed", "en")
            .await
            .map_err(|e| format!("Failed to disconnect: {}", e))
    }
}

/// Connect to an SFTP server
pub async fn connect(
    session_id: String,
    host: &str,
    port: u16,
    username: &str,
    password: Option<&str>,
    ssh_key: Option<&str>,
    passphrase: Option<&str>,
    expected_fingerprint: Option<String>,
) -> Result<SftpConnection, String> {
    info!(
        "SFTP[{}] connecting to {}@{}:{}",
        session_id, username, host, port
    );

    let config = Config::default();
    let config = Arc::new(config);

    let handler = SftpClientHandler {
        session_id: session_id.clone(),
        expected_fingerprint,
    };

    // Connect to server
    let mut session = client::connect(config, (host, port), handler)
        .await
        .map_err(|e| format!("Failed to connect to {}:{}: {}", host, port, e))?;

    info!("SFTP[{}] connected, authenticating...", session_id);

    // Authenticate
    let auth_success = if let Some(key_str) = ssh_key {
        authenticate_with_key(&mut session, username, key_str, passphrase).await?
    } else if let Some(pwd) = password {
        session
            .authenticate_password(username, pwd)
            .await
            .map_err(|e| format!("Password auth error: {}", e))?
    } else {
        return Err("No authentication method available".to_string());
    };

    if !auth_success {
        return Err("Authentication failed".to_string());
    }

    info!("SFTP[{}] authenticated, opening SFTP subsystem...", session_id);

    // Open channel for SFTP
    let channel = session
        .channel_open_session()
        .await
        .map_err(|e| format!("Failed to open channel: {}", e))?;

    // Request SFTP subsystem
    channel
        .request_subsystem(false, "sftp")
        .await
        .map_err(|e| format!("Failed to request SFTP subsystem: {}", e))?;

    info!("SFTP[{}] subsystem opened, initializing SFTP session...", session_id);

    // Initialize SFTP session
    let sftp = SftpSession::new(channel.into_stream())
        .await
        .map_err(|e| format!("Failed to initialize SFTP session: {}", e))?;

    info!("SFTP[{}] session ready", session_id);

    Ok(SftpConnection {
        handle: session,
        sftp,
    })
}

/// Authenticate using SSH key
async fn authenticate_with_key(
    session: &mut Handle<SftpClientHandler>,
    username: &str,
    key_str: &str,
    passphrase: Option<&str>,
) -> Result<bool, String> {
    let keypair = if let Some(pass) = passphrase {
        russh_keys::decode_secret_key(key_str, Some(pass))
            .map_err(|e| format!("Failed to decode SSH key with passphrase: {}", e))?
    } else {
        russh_keys::decode_secret_key(key_str, None)
            .map_err(|e| format!("Failed to decode SSH key: {}", e))?
    };

    let key_with_alg = PrivateKeyWithHashAlg::new(Arc::new(keypair), None)
        .map_err(|e| format!("Failed to create key wrapper: {}", e))?;

    session
        .authenticate_publickey(username, key_with_alg)
        .await
        .map_err(|e| format!("Public key auth error: {}", e))
}
