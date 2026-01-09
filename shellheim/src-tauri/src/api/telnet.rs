//! Telnet API handlers

use crate::db;
use crate::models::EntryRow;
use crate::telnet::{self, TelnetConnectRequest, TelnetConnection, TelnetResizeRequest, TelnetSendDataRequest, TelnetSessionInfo};
use once_cell::sync::Lazy;
use parking_lot::RwLock;

use sqlx::Row;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{command, AppHandle};
use tokio::sync::Mutex;
use tracing::info;

/// Telnet session with connection
pub struct TelnetSession {
    pub id: String,
    pub entry_id: String,
    pub account_id: String,
    pub host: String,
    pub port: u16,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub terminal_cols: u32,
    pub terminal_rows: u32,
    /// The active Telnet connection
    pub connection: Mutex<Option<TelnetConnection>>,
}

/// Global Telnet session manager
static TELNET_SESSIONS: Lazy<RwLock<HashMap<String, Arc<TelnetSession>>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));

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

/// Connect to a Telnet server
#[command]
pub async fn connect_telnet(
    app: AppHandle,
    token: String,
    request: TelnetConnectRequest,
) -> Result<TelnetSessionInfo, String> {
    info!("Telnet connect request for entry: {}", request.entry_id);

    // 1. Get entry details
    let (entry, account_id) = get_entry_internal(&token, &request.entry_id).await?;

    // Verify protocol is telnet
    if entry.protocol.as_deref() != Some("telnet") {
        return Err("Entry is not configured for Telnet protocol".to_string());
    }

    let host = entry
        .host
        .ok_or_else(|| "Entry has no host configured".to_string())?;
    let port = entry.port.unwrap_or(23) as u16; // Telnet default port is 23

    // 2. Generate session ID
    let session_id = uuid::Uuid::new_v4().to_string();

    // 3. Connect via Telnet
    let connection = telnet::connect(
        session_id.clone(),
        &host,
        port,
        request.cols,
        request.rows,
        app,
    )
    .await?;

    // 4. Create session
    let session = Arc::new(TelnetSession {
        id: session_id.clone(),
        entry_id: request.entry_id.clone(),
        account_id,
        host: host.clone(),
        port,
        created_at: chrono::Utc::now(),
        terminal_cols: request.cols,
        terminal_rows: request.rows,
        connection: Mutex::new(Some(connection)),
    });

    TELNET_SESSIONS.write().insert(session_id.clone(), session.clone());

    // 5. Update last_connected_at
    let pool = db::pool();
    let now = chrono::Utc::now().to_rfc3339();
    let _ = sqlx::query("UPDATE entries SET last_connected_at = ? WHERE id = ?")
        .bind(&now)
        .bind(&request.entry_id)
        .execute(pool)
        .await;

    info!("Telnet session created: {}", session_id);

    Ok(TelnetSessionInfo {
        session_id: session.id.clone(),
        entry_id: request.entry_id,
        host,
        port,
        connected_at: session.created_at.to_rfc3339(),
    })
}

/// Disconnect a Telnet session
#[command]
pub async fn disconnect_telnet(token: String, session_id: String) -> Result<(), String> {
    info!("Telnet disconnect request for session: {}", session_id);

    let account_id = get_account_id_from_token(&token).await?;

    // Get and remove session
    let session = TELNET_SESSIONS.write().remove(&session_id);

    if let Some(session) = session {
        // Verify ownership
        if session.account_id != account_id {
            // Put it back
            TELNET_SESSIONS.write().insert(session_id.clone(), session);
            return Err("Session not found".to_string());
        }

        // Close the connection
        let mut conn_guard = session.connection.lock().await;
        if let Some(conn) = conn_guard.take() {
            if let Err(e) = conn.close().await {
                tracing::warn!("Error closing Telnet connection: {}", e);
            }
        }

        info!("Telnet session removed: {}", session_id);
        Ok(())
    } else {
        Err(format!("Session not found: {}", session_id))
    }
}

/// Send data to a Telnet session
#[command]
pub async fn send_telnet_data(token: String, request: TelnetSendDataRequest) -> Result<(), String> {
    info!(
        "send_telnet_data called for session: {}, data len: {}",
        request.session_id,
        request.data.len()
    );

    let account_id = get_account_id_from_token(&token).await?;

    // Get session
    let session = TELNET_SESSIONS
        .read()
        .get(&request.session_id)
        .cloned()
        .ok_or_else(|| format!("Session not found: {}", request.session_id))?;

    // Verify ownership
    if session.account_id != account_id {
        return Err("Session not found".to_string());
    }

    // Send data
    let conn_guard = session.connection.lock().await;
    let conn = conn_guard
        .as_ref()
        .ok_or_else(|| "Connection not active".to_string())?;

    conn.send_data(request.data.as_bytes()).await
}

/// Resize Telnet terminal (sends NAWS if negotiated)
#[command]
pub async fn resize_telnet_terminal(
    token: String,
    request: TelnetResizeRequest,
) -> Result<(), String> {
    info!(
        "resize_telnet_terminal called for session: {}, size: {}x{}",
        request.session_id, request.cols, request.rows
    );

    let account_id = get_account_id_from_token(&token).await?;

    // Get session
    let session = TELNET_SESSIONS
        .read()
        .get(&request.session_id)
        .cloned()
        .ok_or_else(|| format!("Session not found: {}", request.session_id))?;

    // Verify ownership
    if session.account_id != account_id {
        return Err("Session not found".to_string());
    }

    // Resize
    let conn_guard = session.connection.lock().await;
    let conn = conn_guard
        .as_ref()
        .ok_or_else(|| "Connection not active".to_string())?;

    conn.resize(request.cols, request.rows).await
}

/// Get list of active Telnet sessions for current user
#[command]
pub async fn list_telnet_sessions(token: String) -> Result<Vec<TelnetSessionInfo>, String> {
    let account_id = get_account_id_from_token(&token).await?;

    let sessions: Vec<TelnetSessionInfo> = TELNET_SESSIONS
        .read()
        .values()
        .filter(|s| s.account_id == account_id)
        .map(|s| TelnetSessionInfo {
            session_id: s.id.clone(),
            entry_id: s.entry_id.clone(),
            host: s.host.clone(),
            port: s.port,
            connected_at: s.created_at.to_rfc3339(),
        })
        .collect();

    Ok(sessions)
}
