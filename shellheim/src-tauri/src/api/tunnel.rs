//! SSH Tunnel API handlers

use crate::db;
use crate::ssh::tunnel::{CreateTunnelRequest, TunnelInfo, TunnelManager, TunnelType};
use crate::ssh::SessionManager;
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

/// Create a new SSH tunnel
#[command]
pub async fn create_tunnel(
    app: AppHandle,
    token: String,
    request: CreateTunnelRequest,
) -> Result<TunnelInfo, String> {
    info!(
        "Create tunnel request: {:?} for session {}",
        request.tunnel_type, request.session_id
    );

    let account_id = get_account_id_from_token(&token).await?;

    // Get the SSH session and verify ownership
    let ssh_manager = SessionManager::instance();
    let session = ssh_manager
        .get_session(&request.session_id)
        .ok_or_else(|| "SSH session not found".to_string())?;

    if session.account_id != account_id {
        return Err("SSH session not found".to_string());
    }

    // Verify connection is active
    {
        let conn_guard = session.connection.lock().await;
        if conn_guard.is_none() {
            return Err("SSH connection not active".to_string());
        }
    }

    // Create the tunnel
    let tunnel_manager = TunnelManager::instance();

    match request.tunnel_type {
        TunnelType::Local => {
            tunnel_manager
                .create_local_tunnel(request, account_id, app)
                .await
        }
        TunnelType::Remote => {
            tunnel_manager
                .create_remote_tunnel(request, account_id, app)
                .await
        }
    }
}

/// Stop a tunnel
#[command]
pub async fn stop_tunnel(
    app: AppHandle,
    token: String,
    tunnel_id: String,
) -> Result<(), String> {
    info!("Stop tunnel request: {}", tunnel_id);

    let account_id = get_account_id_from_token(&token).await?;
    let tunnel_manager = TunnelManager::instance();

    // Verify tunnel ownership
    let tunnel = tunnel_manager
        .get_tunnel(&tunnel_id)
        .ok_or_else(|| "Tunnel not found".to_string())?;

    {
        let info = tunnel.get_info();
        if info.account_id != account_id {
            return Err("Tunnel not found".to_string());
        }
    }

    tunnel_manager.stop_tunnel(&tunnel_id, &app)
}

/// List all active tunnels for the current user
#[command]
pub async fn list_tunnels(token: String) -> Result<Vec<TunnelInfo>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    let tunnel_manager = TunnelManager::instance();

    Ok(tunnel_manager.get_account_tunnels(&account_id))
}

/// List tunnels for a specific SSH session
#[command]
pub async fn list_session_tunnels(
    token: String,
    session_id: String,
) -> Result<Vec<TunnelInfo>, String> {
    let account_id = get_account_id_from_token(&token).await?;

    // Verify session ownership
    let ssh_manager = SessionManager::instance();
    let session = ssh_manager
        .get_session(&session_id)
        .ok_or_else(|| "SSH session not found".to_string())?;

    if session.account_id != account_id {
        return Err("SSH session not found".to_string());
    }

    let tunnel_manager = TunnelManager::instance();
    Ok(tunnel_manager.get_session_tunnels(&session_id))
}
