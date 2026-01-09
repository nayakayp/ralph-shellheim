//! SFTP API handlers
//!
//! Tauri commands for SFTP file operations: browsing, upload, download, etc.

use crate::api::identities::get_decrypted_identity;
use crate::api::known_hosts::lookup_known_host;
use crate::db;
use crate::models::EntryRow;
use crate::sftp::{self, FileEntry, FileStats, SftpSessionManager};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tauri::command;
use tracing::info;

/// SFTP session info returned to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SftpSessionInfo {
    pub session_id: String,
    pub entry_id: String,
    pub host: String,
    pub port: u16,
    pub current_path: String,
    pub connected_at: String,
}

/// Request to connect SFTP
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectSftpRequest {
    pub entry_id: String,
    pub identity_id: Option<String>,
}

/// Request to list directory
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListDirRequest {
    pub session_id: String,
    pub path: String,
}

/// Request for file operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileOpRequest {
    pub session_id: String,
    pub path: String,
}

/// Request for rename operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenameRequest {
    pub session_id: String,
    pub old_path: String,
    pub new_path: String,
}

/// Request for file upload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadRequest {
    pub session_id: String,
    pub path: String,
    pub data: Vec<u8>,
}

/// Helper to get account_id from session token
async fn get_account_id_from_token(token: &str) -> Result<String, String> {
    let pool = db::pool();

    let row = sqlx::query(
        r#"
        SELECT account_id FROM sessions
        WHERE token = ? AND expires_at > datetime('now')
        LIMIT 1
        "#,
    )
    .bind(token)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Session expired or invalid".to_string())?;

    Ok(row.get("account_id"))
}

/// Helper to get entry with ownership check
async fn get_entry_internal(token: &str, entry_id: &str) -> Result<(EntryRow, String), String> {
    let account_id = get_account_id_from_token(token).await?;
    let pool = db::pool();

    let entry: EntryRow = sqlx::query_as("SELECT * FROM entries WHERE id = ? AND account_id = ?")
        .bind(entry_id)
        .bind(&account_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .ok_or_else(|| "Entry not found".to_string())?;

    Ok((entry, account_id))
}

/// Helper to get identity IDs for an entry
async fn get_identity_ids_for_entry(entry_id: &str) -> Result<Vec<String>, String> {
    let pool = db::pool();

    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT identity_id FROM entry_identities WHERE entry_id = ? ORDER BY priority ASC",
    )
    .bind(entry_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to fetch identities: {}", e))?;

    Ok(rows.into_iter().map(|r| r.0).collect())
}

/// Connect to SFTP server
#[command]
pub async fn connect_sftp(
    token: String,
    request: ConnectSftpRequest,
) -> Result<SftpSessionInfo, String> {
    info!("SFTP connect request for entry: {}", request.entry_id);

    // 1. Get entry details
    let (entry, account_id) = get_entry_internal(&token, &request.entry_id).await?;

    let host = entry
        .host
        .ok_or_else(|| "Entry has no host configured".to_string())?;
    let port = entry.port.unwrap_or(22) as u16;

    // 2. Get known host fingerprint
    let known_host = lookup_known_host(&account_id, &host, port).await?;
    let expected_fingerprint = known_host.map(|(fp, _)| fp);

    // 3. Get identity for authentication
    let identity_id = if let Some(id) = request.identity_id.as_ref() {
        Some(id.clone())
    } else {
        let ids = get_identity_ids_for_entry(&request.entry_id).await?;
        ids.into_iter().next()
    };

    let identity_id =
        identity_id.ok_or_else(|| "No identity configured for this server".to_string())?;

    // 4. Get decrypted credentials
    let identity = get_decrypted_identity(&token, &identity_id).await?;

    let username = identity
        .username
        .ok_or_else(|| "Identity has no username".to_string())?;

    // 5. Connect via SFTP
    let connection = sftp::connect(
        uuid::Uuid::new_v4().to_string(),
        &host,
        port,
        &username,
        identity.password.as_deref(),
        identity.ssh_key.as_deref(),
        identity.passphrase.as_deref(),
        expected_fingerprint,
    )
    .await?;

    // 6. Get home directory
    let home_path = connection.get_home_dir().await.unwrap_or_else(|_| "/".to_string());

    // 7. Create session
    let manager = SftpSessionManager::instance();
    let session = manager.create_session(
        request.entry_id.clone(),
        account_id,
        host.clone(),
        port,
        username,
        Some(identity_id),
        home_path.clone(),
        connection,
    );

    info!("SFTP session created: {}", session.id);

    Ok(SftpSessionInfo {
        session_id: session.id.clone(),
        entry_id: request.entry_id,
        host,
        port,
        current_path: home_path,
        connected_at: session.created_at.to_rfc3339(),
    })
}

/// Disconnect SFTP session
#[command]
pub async fn disconnect_sftp(token: String, session_id: String) -> Result<(), String> {
    info!("SFTP disconnect request for session: {}", session_id);

    let manager = SftpSessionManager::instance();

    // Verify session belongs to user
    if let Some(session) = manager.get_session(&session_id) {
        let account_id = get_account_id_from_token(&token).await?;
        if session.account_id != account_id {
            return Err("Session not found".to_string());
        }
    }

    manager
        .remove_session(&session_id)
        .await
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    Ok(())
}

/// List directory contents
#[command]
pub async fn sftp_list_dir(
    token: String,
    request: ListDirRequest,
) -> Result<Vec<FileEntry>, String> {
    let manager = SftpSessionManager::instance();

    // Verify session ownership
    let session = manager
        .get_session(&request.session_id)
        .ok_or_else(|| "Session not found".to_string())?;

    let account_id = get_account_id_from_token(&token).await?;
    if session.account_id != account_id {
        return Err("Session not found".to_string());
    }

    // Get connection and list directory
    let conn_guard = session.connection.lock().await;
    let conn = conn_guard
        .as_ref()
        .ok_or_else(|| "Connection not active".to_string())?;

    let entries = conn.list_dir(&request.path).await?;

    // Update current path
    session.set_current_path(request.path);

    Ok(entries)
}

/// Get file stats
#[command]
pub async fn sftp_stat(token: String, request: FileOpRequest) -> Result<FileStats, String> {
    let manager = SftpSessionManager::instance();

    let session = manager
        .get_session(&request.session_id)
        .ok_or_else(|| "Session not found".to_string())?;

    let account_id = get_account_id_from_token(&token).await?;
    if session.account_id != account_id {
        return Err("Session not found".to_string());
    }

    let conn_guard = session.connection.lock().await;
    let conn = conn_guard
        .as_ref()
        .ok_or_else(|| "Connection not active".to_string())?;

    conn.stat(&request.path).await
}

/// Read file contents
#[command]
pub async fn sftp_read_file(token: String, request: FileOpRequest) -> Result<Vec<u8>, String> {
    let manager = SftpSessionManager::instance();

    let session = manager
        .get_session(&request.session_id)
        .ok_or_else(|| "Session not found".to_string())?;

    let account_id = get_account_id_from_token(&token).await?;
    if session.account_id != account_id {
        return Err("Session not found".to_string());
    }

    let conn_guard = session.connection.lock().await;
    let conn = conn_guard
        .as_ref()
        .ok_or_else(|| "Connection not active".to_string())?;

    conn.read_file(&request.path).await
}

/// Write file contents
#[command]
pub async fn sftp_write_file(token: String, request: UploadRequest) -> Result<(), String> {
    let manager = SftpSessionManager::instance();

    let session = manager
        .get_session(&request.session_id)
        .ok_or_else(|| "Session not found".to_string())?;

    let account_id = get_account_id_from_token(&token).await?;
    if session.account_id != account_id {
        return Err("Session not found".to_string());
    }

    let conn_guard = session.connection.lock().await;
    let conn = conn_guard
        .as_ref()
        .ok_or_else(|| "Connection not active".to_string())?;

    conn.write_file(&request.path, &request.data).await
}

/// Delete a file
#[command]
pub async fn sftp_delete_file(token: String, request: FileOpRequest) -> Result<(), String> {
    let manager = SftpSessionManager::instance();

    let session = manager
        .get_session(&request.session_id)
        .ok_or_else(|| "Session not found".to_string())?;

    let account_id = get_account_id_from_token(&token).await?;
    if session.account_id != account_id {
        return Err("Session not found".to_string());
    }

    let conn_guard = session.connection.lock().await;
    let conn = conn_guard
        .as_ref()
        .ok_or_else(|| "Connection not active".to_string())?;

    conn.delete_file(&request.path).await
}

/// Delete a directory
#[command]
pub async fn sftp_delete_dir(token: String, request: FileOpRequest) -> Result<(), String> {
    let manager = SftpSessionManager::instance();

    let session = manager
        .get_session(&request.session_id)
        .ok_or_else(|| "Session not found".to_string())?;

    let account_id = get_account_id_from_token(&token).await?;
    if session.account_id != account_id {
        return Err("Session not found".to_string());
    }

    let conn_guard = session.connection.lock().await;
    let conn = conn_guard
        .as_ref()
        .ok_or_else(|| "Connection not active".to_string())?;

    conn.delete_dir(&request.path).await
}

/// Create a directory
#[command]
pub async fn sftp_create_dir(token: String, request: FileOpRequest) -> Result<(), String> {
    let manager = SftpSessionManager::instance();

    let session = manager
        .get_session(&request.session_id)
        .ok_or_else(|| "Session not found".to_string())?;

    let account_id = get_account_id_from_token(&token).await?;
    if session.account_id != account_id {
        return Err("Session not found".to_string());
    }

    let conn_guard = session.connection.lock().await;
    let conn = conn_guard
        .as_ref()
        .ok_or_else(|| "Connection not active".to_string())?;

    conn.create_dir(&request.path).await
}

/// Rename a file or directory
#[command]
pub async fn sftp_rename(token: String, request: RenameRequest) -> Result<(), String> {
    let manager = SftpSessionManager::instance();

    let session = manager
        .get_session(&request.session_id)
        .ok_or_else(|| "Session not found".to_string())?;

    let account_id = get_account_id_from_token(&token).await?;
    if session.account_id != account_id {
        return Err("Session not found".to_string());
    }

    let conn_guard = session.connection.lock().await;
    let conn = conn_guard
        .as_ref()
        .ok_or_else(|| "Connection not active".to_string())?;

    conn.rename(&request.old_path, &request.new_path).await
}

/// Get current session info
#[command]
pub async fn sftp_get_session(
    token: String,
    session_id: String,
) -> Result<SftpSessionInfo, String> {
    let manager = SftpSessionManager::instance();

    let session = manager
        .get_session(&session_id)
        .ok_or_else(|| "Session not found".to_string())?;

    let account_id = get_account_id_from_token(&token).await?;
    if session.account_id != account_id {
        return Err("Session not found".to_string());
    }

    Ok(SftpSessionInfo {
        session_id: session.id.clone(),
        entry_id: session.entry_id.clone(),
        host: session.host.clone(),
        port: session.port,
        current_path: session.get_current_path(),
        connected_at: session.created_at.to_rfc3339(),
    })
}

/// List active SFTP sessions for current user
#[command]
pub async fn list_sftp_sessions(token: String) -> Result<Vec<SftpSessionInfo>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    let manager = SftpSessionManager::instance();

    let sessions = manager.get_account_sessions(&account_id);

    Ok(sessions
        .into_iter()
        .map(|s| SftpSessionInfo {
            session_id: s.id.clone(),
            entry_id: s.entry_id.clone(),
            host: s.host.clone(),
            port: s.port,
            current_path: s.get_current_path(),
            connected_at: s.created_at.to_rfc3339(),
        })
        .collect())
}
