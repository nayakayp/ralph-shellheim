//! SSH Client implementation using russh
//!
//! Handles SSH connections, authentication, and PTY sessions.

use super::recording::RecordingManager;
use super::session_manager::SessionManager;
use async_trait::async_trait;
use russh::client::{self, Config, Handle, Handler};
use russh::{Channel, ChannelId, Disconnect};
use russh_keys::key::PrivateKeyWithHashAlg;
use std::sync::Arc;
use tauri::AppHandle;
use tauri::Emitter;
use tokio::sync::Mutex;
use tracing::{debug, error, info, warn};

/// Host key information captured during connection
#[derive(Debug, Clone)]
pub struct HostKeyInfo {
    pub key_type: String,
    pub fingerprint: String,
    pub public_key_base64: String,
}

/// SSH client handler for russh callbacks
pub struct SshClientHandler {
    /// The session ID this handler belongs to
    pub session_id: String,
    /// Tauri app handle for emitting events
    pub app_handle: AppHandle,
    /// Expected fingerprint for host key verification (None = capture mode)
    pub expected_fingerprint: Option<String>,
    /// Captured host key info (for first-time connections)
    pub captured_host_key: Arc<Mutex<Option<HostKeyInfo>>>,
}

#[async_trait]
impl Handler for SshClientHandler {
    type Error = russh::Error;

    /// Called when the server sends data on a channel
    async fn data(
        &mut self,
        channel: ChannelId,
        data: &[u8],
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        let text = String::from_utf8_lossy(data).to_string();
        debug!(
            "SSH[{}] channel {:?} received {} bytes",
            self.session_id,
            channel,
            data.len()
        );

        // Append to terminal buffer for hibernation support
        if let Some(session) = SessionManager::instance().get_session(&self.session_id) {
            session.append_to_buffer(&text);
        }

        // Record if session has active recording
        RecordingManager::instance().record_output(&self.session_id, &text);

        // Emit data to frontend
        if let Err(e) = self.app_handle.emit(
            &format!("ssh-data-{}", self.session_id),
            SshDataEvent {
                session_id: self.session_id.clone(),
                data: text,
            },
        ) {
            error!("Failed to emit SSH data: {}", e);
        }

        Ok(())
    }

    /// Called when the server sends extended data (stderr)
    async fn extended_data(
        &mut self,
        channel: ChannelId,
        ext: u32,
        data: &[u8],
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        let text = String::from_utf8_lossy(data).to_string();
        debug!(
            "SSH[{}] channel {:?} extended data (ext={}): {} bytes",
            self.session_id,
            channel,
            ext,
            data.len()
        );

        // Append to terminal buffer for hibernation support
        if let Some(session) = SessionManager::instance().get_session(&self.session_id) {
            session.append_to_buffer(&text);
        }

        // Record if session has active recording
        RecordingManager::instance().record_output(&self.session_id, &text);

        // Emit extended data (stderr) to frontend
        if let Err(e) = self.app_handle.emit(
            &format!("ssh-data-{}", self.session_id),
            SshDataEvent {
                session_id: self.session_id.clone(),
                data: text,
            },
        ) {
            error!("Failed to emit SSH extended data: {}", e);
        }

        Ok(())
    }

    /// Called when the server closes the channel
    async fn channel_close(
        &mut self,
        channel: ChannelId,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        info!("SSH[{}] channel {:?} closed", self.session_id, channel);

        // Emit close event to frontend
        if let Err(e) = self.app_handle.emit(
            &format!("ssh-close-{}", self.session_id),
            SshCloseEvent {
                session_id: self.session_id.clone(),
                reason: "Channel closed".to_string(),
            },
        ) {
            error!("Failed to emit SSH close event: {}", e);
        }

        Ok(())
    }

    /// Called when the server sends EOF on a channel
    async fn channel_eof(
        &mut self,
        channel: ChannelId,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        info!("SSH[{}] channel {:?} EOF", self.session_id, channel);
        Ok(())
    }

    /// Check the server's public key (host key verification)
    async fn check_server_key(
        &mut self,
        server_public_key: &russh_keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        // Get key type from algorithm
        let key_type = server_public_key.algorithm().as_str().to_string();

        // Get SHA256 fingerprint (russh_keys uses SHA256 by default)
        let fingerprint = server_public_key.fingerprint(russh_keys::HashAlg::Sha256).to_string();

        // Get base64-encoded public key
        let public_key_base64 = server_public_key.to_openssh().unwrap_or_default();

        info!(
            "SSH[{}] server key: {} {}",
            self.session_id, key_type, fingerprint
        );

        // Store the captured host key info
        {
            let mut captured = self.captured_host_key.lock().await;
            *captured = Some(HostKeyInfo {
                key_type: key_type.clone(),
                fingerprint: fingerprint.clone(),
                public_key_base64,
            });
        }

        // If we have an expected fingerprint, verify it matches
        if let Some(ref expected) = self.expected_fingerprint {
            if expected == &fingerprint {
                info!("SSH[{}] host key verified successfully", self.session_id);
                Ok(true)
            } else {
                error!(
                    "SSH[{}] HOST KEY MISMATCH! Expected: {}, Got: {}",
                    self.session_id, expected, fingerprint
                );
                // Reject the connection - key has changed!
                Ok(false)
            }
        } else {
            // No expected fingerprint - this is a first-time connection
            // We accept to capture the key, but the caller should handle Unknown status
            info!(
                "SSH[{}] no expected fingerprint, accepting key for capture",
                self.session_id
            );
            Ok(true)
        }
    }
}

/// Event payload for SSH data
#[derive(Clone, serde::Serialize)]
pub struct SshDataEvent {
    pub session_id: String,
    pub data: String,
}

/// Event payload for SSH close
#[derive(Clone, serde::Serialize)]
pub struct SshCloseEvent {
    pub session_id: String,
    pub reason: String,
}

/// Active SSH connection with handle and channel
pub struct ActiveConnection {
    /// The russh client handle (wrapped in Arc for sharing with tunnels)
    handle_inner: Handle<SshClientHandler>,
    /// The PTY channel (wrapped in Arc<Mutex> for sharing)
    pub channel: Arc<Mutex<Channel<client::Msg>>>,
    /// Terminal dimensions
    pub cols: u32,
    pub rows: u32,
}

impl ActiveConnection {
    /// Create a new active connection
    pub fn new(handle: Handle<SshClientHandler>, channel: Arc<Mutex<Channel<client::Msg>>>, cols: u32, rows: u32) -> Self {
        Self {
            handle_inner: handle,
            channel,
            cols,
            rows,
        }
    }

    /// Get a reference to the SSH handle for opening additional channels
    pub fn handle(&self) -> &Handle<SshClientHandler> {
        &self.handle_inner
    }

    /// Open a direct-tcpip channel for port forwarding
    pub async fn open_direct_tcpip(
        &self,
        remote_host: &str,
        remote_port: u32,
        originator_address: &str,
        originator_port: u32,
    ) -> Result<Channel<client::Msg>, String> {
        self.handle_inner
            .channel_open_direct_tcpip(remote_host, remote_port, originator_address, originator_port)
            .await
            .map_err(|e| format!("Failed to open direct-tcpip channel: {}", e))
    }

    /// Send data to the SSH channel
    pub async fn send_data(&self, data: &[u8]) -> Result<(), String> {
        let channel = self.channel.lock().await;
        channel
            .data(data)
            .await
            .map_err(|e| format!("Failed to send data: {}", e))
    }

    /// Resize the PTY
    pub async fn resize(&self, cols: u32, rows: u32) -> Result<(), String> {
        let channel = self.channel.lock().await;
        channel
            .window_change(cols, rows, 0, 0)
            .await
            .map_err(|e| format!("Failed to resize: {}", e))
    }

    /// Close the connection
    pub async fn close(self) -> Result<(), String> {
        // Close the channel first
        {
            let channel = self.channel.lock().await;
            if let Err(e) = channel.close().await {
                warn!("Error closing channel: {}", e);
            }
        }

        // Disconnect the session
        self.handle_inner
            .disconnect(Disconnect::ByApplication, "User disconnected", "en")
            .await
            .map_err(|e| format!("Failed to disconnect: {}", e))
    }
}

/// Result of SSH connection attempt
pub enum ConnectResult {
    /// Connection successful
    Connected(ActiveConnection),
    /// Host key needs verification (first connection or changed)
    HostKeyVerificationNeeded(HostKeyInfo),
}

/// Connect to an SSH server and open a PTY session
pub async fn connect(
    session_id: String,
    host: &str,
    port: u16,
    username: &str,
    password: Option<&str>,
    ssh_key: Option<&str>,
    passphrase: Option<&str>,
    cols: u32,
    rows: u32,
    expected_fingerprint: Option<String>,
    app_handle: AppHandle,
) -> Result<ConnectResult, String> {
    info!(
        "SSH[{}] connecting to {}@{}:{}",
        session_id, username, host, port
    );

    // Create client config
    let config = Config::default();
    let config = Arc::new(config);

    // Shared state for capturing host key
    let captured_host_key = Arc::new(Mutex::new(None));

    // Create handler
    let handler = SshClientHandler {
        session_id: session_id.clone(),
        app_handle,
        expected_fingerprint: expected_fingerprint.clone(),
        captured_host_key: captured_host_key.clone(),
    };

    // Connect to server
    let mut session = client::connect(config, (host, port), handler)
        .await
        .map_err(|e| format!("Failed to connect to {}:{}: {}", host, port, e))?;

    info!("SSH[{}] connected, authenticating...", session_id);

    // If no expected fingerprint was provided, check what we captured
    if expected_fingerprint.is_none() {
        let captured = captured_host_key.lock().await;
        if let Some(host_key) = captured.clone() {
            // Return for user verification
            info!(
                "SSH[{}] host key captured, needs verification: {}",
                session_id, host_key.fingerprint
            );
            // Disconnect since we need user confirmation first
            let _ = session
                .disconnect(Disconnect::ByApplication, "Host key verification needed", "en")
                .await;
            return Ok(ConnectResult::HostKeyVerificationNeeded(host_key));
        }
    }

    // Authenticate
    let auth_success = if let Some(key_str) = ssh_key {
        // SSH key authentication
        authenticate_with_key(&mut session, username, key_str, passphrase).await?
    } else if let Some(pwd) = password {
        // Password authentication
        session
            .authenticate_password(username, pwd)
            .await
            .map_err(|e| format!("Password auth error: {}", e))?
    } else {
        return Err("No authentication method available (need password or SSH key)".to_string());
    };

    if !auth_success {
        return Err("Authentication failed".to_string());
    }

    info!("SSH[{}] authenticated successfully", session_id);

    // Open a session channel
    let channel = session
        .channel_open_session()
        .await
        .map_err(|e| format!("Failed to open session: {}", e))?;

    info!("SSH[{}] session opened", session_id);

    // Request PTY
    channel
        .request_pty(
            false,
            "xterm-256color",
            cols,
            rows,
            0,
            0,
            &[], // No special terminal modes
        )
        .await
        .map_err(|e| format!("Failed to request PTY: {}", e))?;

    info!("SSH[{}] PTY requested ({}x{})", session_id, cols, rows);

    // Start shell
    channel
        .request_shell(false)
        .await
        .map_err(|e| format!("Failed to start shell: {}", e))?;

    info!("SSH[{}] shell started", session_id);

    // The Handler's data() callback already handles incoming data from the SSH channel
    // and emits events to the frontend. No need for a separate reader task.
    // 
    // The channel is wrapped in Arc<Mutex> so send_data() can access it.
    let channel = Arc::new(Mutex::new(channel));

    Ok(ConnectResult::Connected(ActiveConnection::new(
        session,
        channel,
        cols,
        rows,
    )))
}

/// Authenticate using SSH key
async fn authenticate_with_key(
    session: &mut Handle<SshClientHandler>,
    username: &str,
    key_str: &str,
    passphrase: Option<&str>,
) -> Result<bool, String> {
    // Parse the SSH key
    let keypair = if let Some(pass) = passphrase {
        russh_keys::decode_secret_key(key_str, Some(pass))
            .map_err(|e| format!("Failed to decode SSH key with passphrase: {}", e))?
    } else {
        russh_keys::decode_secret_key(key_str, None)
            .map_err(|e| format!("Failed to decode SSH key: {}", e))?
    };

    // Create PrivateKeyWithHashAlg wrapper (None for hash alg = auto-detect)
    let key_with_alg = PrivateKeyWithHashAlg::new(Arc::new(keypair), None)
        .map_err(|e| format!("Failed to create key wrapper: {}", e))?;

    session
        .authenticate_publickey(username, key_with_alg)
        .await
        .map_err(|e| format!("Public key auth error: {}", e))
}

/// Configuration for a jump host connection
#[derive(Debug, Clone)]
pub struct JumpHostConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: Option<String>,
    pub ssh_key: Option<String>,
    pub passphrase: Option<String>,
    pub expected_fingerprint: Option<String>,
}

/// Connect through a jump host (bastion/proxy)
/// 
/// This establishes an SSH connection to the jump host, then creates a
/// direct-tcpip channel to forward traffic to the target host.
pub async fn connect_via_jump(
    session_id: String,
    jump: JumpHostConfig,
    target_host: &str,
    target_port: u16,
    _target_username: &str,
    _target_password: Option<&str>,
    _target_ssh_key: Option<&str>,
    _target_passphrase: Option<&str>,
    _cols: u32,
    _rows: u32,
    _target_expected_fingerprint: Option<String>,
    app_handle: AppHandle,
) -> Result<ConnectResult, String> {
    info!(
        "SSH[{}] connecting via jump host {}@{}:{} to {}:{}",
        session_id, jump.username, jump.host, jump.port, target_host, target_port
    );

    // 1. Connect to jump host
    let config = Arc::new(Config::default());
    let captured_host_key = Arc::new(Mutex::new(None));
    
    let jump_handler = SshClientHandler {
        session_id: format!("{}-jump", session_id),
        app_handle: app_handle.clone(),
        expected_fingerprint: jump.expected_fingerprint.clone(),
        captured_host_key: captured_host_key.clone(),
    };

    let mut jump_session = client::connect(config.clone(), (&*jump.host, jump.port), jump_handler)
        .await
        .map_err(|e| format!("Failed to connect to jump host {}:{}: {}", jump.host, jump.port, e))?;

    info!("SSH[{}] connected to jump host, authenticating...", session_id);

    // Check jump host key if first time
    if jump.expected_fingerprint.is_none() {
        let captured = captured_host_key.lock().await;
        if let Some(host_key) = captured.clone() {
            info!(
                "SSH[{}] jump host key needs verification: {}",
                session_id, host_key.fingerprint
            );
            let _ = jump_session
                .disconnect(Disconnect::ByApplication, "Jump host key verification needed", "en")
                .await;
            return Ok(ConnectResult::HostKeyVerificationNeeded(host_key));
        }
    }

    // 2. Authenticate to jump host
    let jump_auth_success = if let Some(ref key_str) = jump.ssh_key {
        authenticate_with_key(&mut jump_session, &jump.username, key_str, jump.passphrase.as_deref()).await?
    } else if let Some(ref pwd) = jump.password {
        jump_session
            .authenticate_password(&jump.username, pwd)
            .await
            .map_err(|e| format!("Jump host password auth error: {}", e))?
    } else {
        return Err("No authentication method for jump host".to_string());
    };

    if !jump_auth_success {
        return Err("Jump host authentication failed".to_string());
    }

    info!("SSH[{}] jump host authenticated, opening tunnel to {}:{}", session_id, target_host, target_port);

    // 3. Open direct-tcpip channel to target
    let tunnel_channel = jump_session
        .channel_open_direct_tcpip(target_host, target_port as u32, "127.0.0.1", 0)
        .await
        .map_err(|e| format!("Failed to open tunnel to {}:{}: {}", target_host, target_port, e))?;

    info!("SSH[{}] tunnel opened, connecting to target SSH", session_id);

    // 4. Create a custom Stream from the channel for the target SSH connection
    // russh doesn't directly support connecting through a channel, so we need 
    // to use a different approach: use the AsyncRead/AsyncWrite on the channel
    
    // For russh, we need to create a new SSH session over the tunneled channel
    // This is complex because russh expects a TcpStream. We'll use tokio's duplex
    // to bridge the channel to the SSH client.
    
    let (client_read, client_write) = tokio::io::duplex(65536);
    
    // Spawn a task to bridge the tunnel channel with the duplex
    let tunnel_channel = Arc::new(Mutex::new(tunnel_channel));
    let tunnel_channel_reader = tunnel_channel.clone();
    let tunnel_channel_writer = tunnel_channel.clone();
    
    // Write from client to channel
    let session_id_writer = session_id.clone();
    tokio::spawn(async move {
        use tokio::io::AsyncReadExt;
        let mut client_read = client_read;
        let mut buf = [0u8; 8192];
        loop {
            match client_read.read(&mut buf).await {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let channel = tunnel_channel_writer.lock().await;
                    if let Err(e) = channel.data(&buf[..n]).await {
                        warn!("SSH[{}] tunnel write error: {}", session_id_writer, e);
                        break;
                    }
                }
                Err(e) => {
                    warn!("SSH[{}] client read error: {}", session_id_writer, e);
                    break;
                }
            }
        }
    });
    
    // Note: Reading from the tunnel channel back to the client is handled by 
    // the target SSH handler's data callback. The duplex write side will be
    // used when we connect the target SSH session.
    
    // For now, we use a simpler approach: connect directly with the tunnel
    // We'll rely on the proxy's direct-tcpip channel to forward the connection
    
    // Actually, russh's connect() expects an address, not a stream.
    // The proper way to do this is to implement a custom AsyncRead+AsyncWrite
    // wrapper around the channel. This is complex.
    //
    // Alternative approach: Use the jump host's connection to open a session
    // on the target by using the direct-tcpip tunnel as a TCP proxy, then
    // doing SSH client protocol over it.
    //
    // For simplicity in this iteration, let's store the jump connection info
    // and do the nested SSH over the tunnel using russh's stream_connect.
    
    // russh doesn't have stream_connect, so we need a workaround.
    // Let's use a simpler design: store jump host connection in session manager
    // and do proper nested SSH in a future iteration.
    //
    // For now, we'll note that jump host support requires complex stream bridging.
    // Let's implement a basic version that at least opens the tunnel.
    
    drop(client_write); // Drop unused for now
    drop(tunnel_channel_reader);
    
    // For this iteration, we'll do a simpler approach:
    // Just use the jump host to port forward, and note that full nested SSH
    // requires additional work. 
    //
    // However, we CAN make this work by using russh's ability to run the protocol
    // over any AsyncRead + AsyncWrite stream. Let's try a different approach:
    // use the channel itself as the transport.
    
    // The russh crate has connect_stream() in newer versions. Let's check.
    // For now, return an error indicating jump host support is partial.
    
    Err("Jump host support requires connecting SSH over the tunnel channel. \
         This feature is planned for a future update. \
         The jump host connection was successful, but nested SSH is not yet implemented.".to_string())
}
