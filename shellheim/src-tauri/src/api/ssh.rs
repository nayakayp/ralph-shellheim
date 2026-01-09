//! SSH API handlers

use crate::api::identities::get_decrypted_identity;
use crate::db;
use crate::models::EntryRow;
use crate::ssh::{self, ConnectRequest, ResizeRequest, SendDataRequest, SessionManager, SshSessionInfo};
use sqlx::Row;
use tauri::{command, AppHandle};
use tracing::info;

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

#[command]
pub async fn connect_ssh(
    app: AppHandle,
    token: String,
    request: ConnectRequest,
) -> Result<SshSessionInfo, String> {
    info!("SSH connect request for entry: {}", request.entry_id);

    // 1. Get entry details
    let (entry, account_id) = get_entry_internal(&token, &request.entry_id).await?;

    let host = entry
        .host
        .ok_or_else(|| "Entry has no host configured".to_string())?;
    let port = entry.port.unwrap_or(22) as u16;

    // 2. Get identity for authentication
    let identity_id = if let Some(id) = request.identity_id.as_ref() {
        Some(id.clone())
    } else {
        // Get first linked identity
        let ids = get_identity_ids_for_entry(&request.entry_id).await?;
        ids.into_iter().next()
    };

    let identity_id =
        identity_id.ok_or_else(|| "No identity configured for this server".to_string())?;

    // 3. Get decrypted credentials
    let identity = get_decrypted_identity(&token, &identity_id).await?;

    let username = identity
        .username
        .ok_or_else(|| "Identity has no username".to_string())?;

    // 4. Connect via russh
    let connection = ssh::connect(
        uuid::Uuid::new_v4().to_string(), // temp session id for logging
        &host,
        port,
        &username,
        identity.password.as_deref(),
        identity.ssh_key.as_deref(),
        identity.passphrase.as_deref(),
        request.cols,
        request.rows,
        app,
    )
    .await?;

    // 5. Create session in manager
    let manager = SessionManager::instance();
    let session = manager.create_session(
        request.entry_id.clone(),
        account_id,
        host.clone(),
        port,
        username,
        connection,
    );

    // 6. Update last_connected_at
    let pool = db::pool();
    let now = chrono::Utc::now().to_rfc3339();
    let _ = sqlx::query("UPDATE entries SET last_connected_at = ? WHERE id = ?")
        .bind(&now)
        .bind(&request.entry_id)
        .execute(pool)
        .await;

    info!("SSH session created: {}", session.id);

    Ok(SshSessionInfo {
        session_id: session.id.clone(),
        entry_id: request.entry_id,
        host,
        port,
        connected_at: session.created_at.to_rfc3339(),
    })
}

#[command]
pub async fn disconnect_ssh(token: String, session_id: String) -> Result<(), String> {
    info!("SSH disconnect request for session: {}", session_id);

    let manager = SessionManager::instance();

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

#[command]
pub async fn send_data(token: String, request: SendDataRequest) -> Result<(), String> {
    // Verify session ownership
    let manager = SessionManager::instance();
    if let Some(session) = manager.get_session(&request.session_id) {
        let account_id = get_account_id_from_token(&token).await?;
        if session.account_id != account_id {
            return Err("Session not found".to_string());
        }
    } else {
        return Err(format!("Session not found: {}", request.session_id));
    }

    manager
        .send_data(&request.session_id, request.data.as_bytes())
        .await
}

#[command]
pub async fn resize_terminal(token: String, request: ResizeRequest) -> Result<(), String> {
    info!(
        "Resize terminal: {} to {}x{}",
        request.session_id, request.cols, request.rows
    );

    // Verify session ownership
    let manager = SessionManager::instance();
    if let Some(session) = manager.get_session(&request.session_id) {
        let account_id = get_account_id_from_token(&token).await?;
        if session.account_id != account_id {
            return Err("Session not found".to_string());
        }
    } else {
        return Err(format!("Session not found: {}", request.session_id));
    }

    manager
        .resize_terminal(&request.session_id, request.cols, request.rows)
        .await
}

/// Get list of active sessions for current user
#[command]
pub async fn list_ssh_sessions(token: String) -> Result<Vec<SshSessionInfo>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    let manager = SessionManager::instance();

    let sessions = manager.get_account_sessions(&account_id);

    Ok(sessions
        .into_iter()
        .map(|s| SshSessionInfo {
            session_id: s.id.clone(),
            entry_id: s.entry_id.clone(),
            host: s.host.clone(),
            port: s.port,
            connected_at: s.created_at.to_rfc3339(),
        })
        .collect())
}
