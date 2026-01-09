//! SSH API handlers

use crate::api::identities::get_decrypted_identity;
use crate::api::known_hosts::lookup_known_host;
use crate::db;
use crate::models::{
    EntryRow, HibernateSessionRequest, HibernatedSession, HibernatedSessionRow, HostKeyStatus,
    ResumeSessionRequest, ResumeSessionResponse,
};
use crate::ssh::{
    self, ConnectRequest, ConnectResult, JumpConnectResult, JumpHostConfig, ResizeRequest, 
    SendDataRequest, SessionManager, SshSessionInfo,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tauri::{command, AppHandle};
use tracing::info;

/// Response for SSH connection attempt
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ConnectSshResponse {
    /// Connection successful
    Connected(SshSessionInfo),
    /// Host key verification needed
    HostKeyVerification {
        host: String,
        port: u16,
        status: HostKeyStatus,
    },
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

#[command]
pub async fn connect_ssh(
    app: AppHandle,
    token: String,
    request: ConnectRequest,
) -> Result<ConnectSshResponse, String> {
    info!("SSH connect request for entry: {}", request.entry_id);

    // 1. Get entry details
    let (entry, account_id) = get_entry_internal(&token, &request.entry_id).await?;

    let host = entry
        .host
        .ok_or_else(|| "Entry has no host configured".to_string())?;
    let port = entry.port.unwrap_or(22) as u16;

    // 2. Check known hosts for this server
    let known_host = lookup_known_host(&account_id, &host, port).await?;
    let expected_fingerprint = known_host.as_ref().map(|(fp, _)| fp.clone());

    // 3. Get identity for authentication
    let identity_id = if let Some(id) = request.identity_id.as_ref() {
        Some(id.clone())
    } else {
        // Get first linked identity
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

    // 5. Generate session ID upfront so it's consistent for both connect() and session manager
    let session_id = uuid::Uuid::new_v4().to_string();

    // 6. Check if this entry has a jump host configured
    if let Some(jump_host_id) = &entry.jump_host_id {
        // Connect via jump host
        return connect_via_jump_host(
            app,
            &token,
            &account_id,
            session_id,
            jump_host_id,
            &request.entry_id,
            &host,
            port,
            &username,
            identity.password.as_deref(),
            identity.ssh_key.as_deref(),
            identity.passphrase.as_deref(),
            request.cols,
            request.rows,
            expected_fingerprint,
            &identity_id,
            known_host,
        ).await;
    }

    // 7. Direct connect via russh with host key verification
    let result = ssh::connect(
        session_id.clone(),
        &host,
        port,
        &username,
        identity.password.as_deref(),
        identity.ssh_key.as_deref(),
        identity.passphrase.as_deref(),
        request.cols,
        request.rows,
        expected_fingerprint.clone(),
        app,
    )
    .await?;

    match result {
        ConnectResult::Connected(connection) => {
            // 8. Create session in manager with the same session_id used in connect()
            let manager = SessionManager::instance();
            let session = manager.create_session(
                session_id,
                request.entry_id.clone(),
                account_id,
                host.clone(),
                port,
                username,
                Some(identity_id),
                request.cols,
                request.rows,
                connection,
            );

            // 9. Update last_connected_at
            let pool = db::pool();
            let now = chrono::Utc::now().to_rfc3339();
            let _ = sqlx::query("UPDATE entries SET last_connected_at = ? WHERE id = ?")
                .bind(&now)
                .bind(&request.entry_id)
                .execute(pool)
                .await;

            info!("SSH session created: {}", session.id);

            Ok(ConnectSshResponse::Connected(SshSessionInfo {
                session_id: session.id.clone(),
                entry_id: request.entry_id,
                host,
                port,
                connected_at: session.created_at.to_rfc3339(),
            }))
        }
        ConnectResult::HostKeyVerificationNeeded(host_key) => {
            // Need user confirmation for this host key
            let status = if known_host.is_some() {
                // Key has changed from what we knew
                let (old_fp, _) = known_host.unwrap();
                HostKeyStatus::Changed {
                    key_type: host_key.key_type,
                    new_fingerprint: host_key.fingerprint,
                    old_fingerprint: old_fp,
                }
            } else {
                // First time seeing this host
                HostKeyStatus::Unknown {
                    key_type: host_key.key_type,
                    fingerprint: host_key.fingerprint,
                }
            };

            info!(
                "SSH connection to {}:{} requires host key verification",
                host, port
            );

            Ok(ConnectSshResponse::HostKeyVerification {
                host,
                port,
                status,
            })
        }
    }
}

/// Helper function to connect via a jump host
async fn connect_via_jump_host(
    app: AppHandle,
    token: &str,
    account_id: &str,
    session_id: String,
    jump_host_id: &str,
    target_entry_id: &str,
    target_host: &str,
    target_port: u16,
    target_username: &str,
    target_password: Option<&str>,
    target_ssh_key: Option<&str>,
    target_passphrase: Option<&str>,
    cols: u32,
    rows: u32,
    target_expected_fingerprint: Option<String>,
    target_identity_id: &str,
    target_known_host: Option<(String, String)>,
) -> Result<ConnectSshResponse, String> {
    info!("Connecting via jump host: {}", jump_host_id);

    let pool = db::pool();

    // 1. Get jump host entry details
    let jump_entry: EntryRow = sqlx::query_as("SELECT * FROM entries WHERE id = ? AND account_id = ?")
        .bind(jump_host_id)
        .bind(account_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .ok_or_else(|| "Jump host entry not found".to_string())?;

    let jump_host = jump_entry
        .host
        .ok_or_else(|| "Jump host has no host configured".to_string())?;
    let jump_port = jump_entry.port.unwrap_or(22) as u16;

    // 2. Check known hosts for jump host
    let jump_known_host = lookup_known_host(account_id, &jump_host, jump_port).await?;
    let jump_expected_fingerprint = jump_known_host.as_ref().map(|(fp, _)| fp.clone());

    // 3. Get identity for jump host
    let jump_identity_ids = get_identity_ids_for_entry(jump_host_id).await?;
    let jump_identity_id = jump_identity_ids
        .into_iter()
        .next()
        .ok_or_else(|| "No identity configured for jump host".to_string())?;

    let jump_identity = get_decrypted_identity(token, &jump_identity_id).await?;

    let jump_username = jump_identity
        .username
        .ok_or_else(|| "Jump host identity has no username".to_string())?;

    // 4. Build jump host config
    let jump_config = JumpHostConfig {
        host: jump_host.clone(),
        port: jump_port,
        username: jump_username,
        password: jump_identity.password,
        ssh_key: jump_identity.ssh_key,
        passphrase: jump_identity.passphrase,
        expected_fingerprint: jump_expected_fingerprint,
    };

    // 5. Connect via jump host
    let result = ssh::connect_via_jump(
        session_id.clone(),
        jump_config,
        target_host,
        target_port,
        target_username,
        target_password,
        target_ssh_key,
        target_passphrase,
        cols,
        rows,
        target_expected_fingerprint.clone(),
        app,
    )
    .await?;

    match result {
        JumpConnectResult::Connected(jump_connection) => {
            // 6. Create session in manager
            let manager = SessionManager::instance();
            let session = manager.create_session(
                session_id,
                target_entry_id.to_string(),
                account_id.to_string(),
                target_host.to_string(),
                target_port,
                target_username.to_string(),
                Some(target_identity_id.to_string()),
                cols,
                rows,
                jump_connection.target_connection,
            );

            // 7. Update last_connected_at
            let now = chrono::Utc::now().to_rfc3339();
            let _ = sqlx::query("UPDATE entries SET last_connected_at = ? WHERE id = ?")
                .bind(&now)
                .bind(target_entry_id)
                .execute(pool)
                .await;

            info!("SSH session created via jump host: {}", session.id);

            Ok(ConnectSshResponse::Connected(SshSessionInfo {
                session_id: session.id.clone(),
                entry_id: target_entry_id.to_string(),
                host: target_host.to_string(),
                port: target_port,
                connected_at: session.created_at.to_rfc3339(),
            }))
        }
        JumpConnectResult::JumpHostKeyVerificationNeeded(host_key) => {
            // Need verification for jump host
            let status = if jump_known_host.is_some() {
                let (old_fp, _) = jump_known_host.unwrap();
                HostKeyStatus::Changed {
                    key_type: host_key.key_type,
                    new_fingerprint: host_key.fingerprint,
                    old_fingerprint: old_fp,
                }
            } else {
                HostKeyStatus::Unknown {
                    key_type: host_key.key_type,
                    fingerprint: host_key.fingerprint,
                }
            };

            info!(
                "Jump host {}:{} requires host key verification",
                jump_host, jump_port
            );

            Ok(ConnectSshResponse::HostKeyVerification {
                host: jump_host,
                port: jump_port,
                status,
            })
        }
        JumpConnectResult::TargetHostKeyVerificationNeeded(host_key) => {
            // Need verification for target host
            let status = if target_known_host.is_some() {
                let (old_fp, _) = target_known_host.unwrap();
                HostKeyStatus::Changed {
                    key_type: host_key.key_type,
                    new_fingerprint: host_key.fingerprint,
                    old_fingerprint: old_fp,
                }
            } else {
                HostKeyStatus::Unknown {
                    key_type: host_key.key_type,
                    fingerprint: host_key.fingerprint,
                }
            };

            info!(
                "Target host {}:{} requires host key verification (via jump host)",
                target_host, target_port
            );

            Ok(ConnectSshResponse::HostKeyVerification {
                host: target_host.to_string(),
                port: target_port,
                status,
            })
        }
    }
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
    info!("send_data called for session: {}, data len: {}", request.session_id, request.data.len());
    
    // Verify session ownership
    let manager = SessionManager::instance();
    info!("send_data: got manager");
    
    if let Some(session) = manager.get_session(&request.session_id) {
        info!("send_data: found session, verifying token");
        let account_id = get_account_id_from_token(&token).await?;
        info!("send_data: got account_id");
        if session.account_id != account_id {
            return Err("Session not found".to_string());
        }
    } else {
        return Err(format!("Session not found: {}", request.session_id));
    }

    info!("send_data: calling manager.send_data");
    let result = manager
        .send_data(&request.session_id, request.data.as_bytes())
        .await;
    
    if let Err(ref e) = result {
        info!("send_data error: {}", e);
    } else {
        info!("send_data success for session: {}", request.session_id);
    }
    
    result
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

/// Hibernate an active SSH session (close connection but save state for resume)
#[command]
pub async fn hibernate_session(
    token: String,
    request: HibernateSessionRequest,
) -> Result<HibernatedSession, String> {
    info!("Hibernate session request: {}", request.session_id);

    let account_id = get_account_id_from_token(&token).await?;
    let manager = SessionManager::instance();

    // 1. Get the session and verify ownership
    let session = manager
        .get_session(&request.session_id)
        .ok_or_else(|| "Session not found".to_string())?;

    if session.account_id != account_id {
        return Err("Session not found".to_string());
    }

    // 2. Capture session state before closing
    // Use frontend-provided buffer if available, otherwise use backend buffer
    let terminal_buffer = request.terminal_buffer.unwrap_or_else(|| session.get_buffer());
    let hibernated_at = chrono::Utc::now().to_rfc3339();
    let created_at = session.created_at.to_rfc3339();

    // 3. Save to database
    let pool = db::pool();
    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        r#"
        INSERT INTO hibernated_sessions 
        (id, account_id, entry_id, host, port, username, identity_id, terminal_buffer, terminal_cols, terminal_rows, hibernated_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&session.account_id)
    .bind(&session.entry_id)
    .bind(&session.host)
    .bind(session.port as i32)
    .bind(&session.username)
    .bind(&session.identity_id)
    .bind(&terminal_buffer)
    .bind(session.terminal_cols as i32)
    .bind(session.terminal_rows as i32)
    .bind(&hibernated_at)
    .bind(&created_at)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to save hibernated session: {}", e))?;

    // 4. Close the active session
    manager.remove_session(&request.session_id).await;

    info!("Session {} hibernated as {}", request.session_id, id);

    Ok(HibernatedSession {
        id,
        entry_id: session.entry_id.clone(),
        host: session.host.clone(),
        port: session.port,
        username: session.username.clone(),
        terminal_cols: session.terminal_cols,
        terminal_rows: session.terminal_rows,
        hibernated_at,
        created_at,
    })
}

/// List hibernated sessions for current user
#[command]
pub async fn list_hibernated_sessions(token: String) -> Result<Vec<HibernatedSession>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    let pool = db::pool();

    let rows: Vec<HibernatedSessionRow> = sqlx::query_as(
        "SELECT * FROM hibernated_sessions WHERE account_id = ? ORDER BY hibernated_at DESC",
    )
    .bind(&account_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    Ok(rows.into_iter().map(|r| r.into()).collect())
}

/// Resume a hibernated session (reconnect and restore terminal state)
#[command]
pub async fn resume_session(
    app: AppHandle,
    token: String,
    request: ResumeSessionRequest,
) -> Result<ResumeSessionResponse, String> {
    info!(
        "Resume session request: {}",
        request.hibernated_session_id
    );

    let account_id = get_account_id_from_token(&token).await?;
    let pool = db::pool();

    // 1. Get hibernated session
    let hibernated: HibernatedSessionRow = sqlx::query_as(
        "SELECT * FROM hibernated_sessions WHERE id = ? AND account_id = ?",
    )
    .bind(&request.hibernated_session_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Hibernated session not found".to_string())?;

    // 2. Get identity credentials
    let identity_id = hibernated
        .identity_id
        .as_ref()
        .ok_or_else(|| "No identity configured for this session".to_string())?;

    let identity = get_decrypted_identity(&token, identity_id).await?;

    // 3. Check known hosts
    let known_host =
        lookup_known_host(&account_id, &hibernated.host, hibernated.port as u16).await?;
    let expected_fingerprint = known_host.map(|(fp, _)| fp);

    // 4. Generate session ID upfront so it's consistent
    let session_id = uuid::Uuid::new_v4().to_string();

    // 5. Reconnect via russh
    let result = ssh::connect(
        session_id.clone(),
        &hibernated.host,
        hibernated.port as u16,
        &hibernated.username,
        identity.password.as_deref(),
        identity.ssh_key.as_deref(),
        identity.passphrase.as_deref(),
        request.cols,
        request.rows,
        expected_fingerprint,
        app,
    )
    .await?;

    match result {
        ConnectResult::Connected(connection) => {
            // 6. Create new session with the same session_id used in connect()
            let manager = SessionManager::instance();
            let session = manager.create_session(
                session_id,
                hibernated.entry_id.clone(),
                account_id,
                hibernated.host.clone(),
                hibernated.port as u16,
                hibernated.username.clone(),
                hibernated.identity_id.clone(),
                request.cols,
                request.rows,
                connection,
            );

            // 6. Delete hibernated session from database
            sqlx::query("DELETE FROM hibernated_sessions WHERE id = ?")
                .bind(&request.hibernated_session_id)
                .execute(pool)
                .await
                .map_err(|e| format!("Failed to delete hibernated session: {}", e))?;

            // 7. Update last_connected_at
            let now = chrono::Utc::now().to_rfc3339();
            let _ = sqlx::query("UPDATE entries SET last_connected_at = ? WHERE id = ?")
                .bind(&now)
                .bind(&hibernated.entry_id)
                .execute(pool)
                .await;

            info!("Session {} resumed as {}", request.hibernated_session_id, session.id);

            Ok(ResumeSessionResponse {
                session_id: session.id.clone(),
                entry_id: hibernated.entry_id,
                host: hibernated.host,
                port: hibernated.port as u16,
                connected_at: session.created_at.to_rfc3339(),
                terminal_buffer: hibernated.terminal_buffer,
            })
        }
        ConnectResult::HostKeyVerificationNeeded(_) => {
            Err("Host key changed since session was hibernated. Please reconnect manually.".to_string())
        }
    }
}

/// Delete a hibernated session without resuming
#[command]
pub async fn delete_hibernated_session(
    token: String,
    hibernated_session_id: String,
) -> Result<(), String> {
    let account_id = get_account_id_from_token(&token).await?;
    let pool = db::pool();

    let result = sqlx::query("DELETE FROM hibernated_sessions WHERE id = ? AND account_id = ?")
        .bind(&hibernated_session_id)
        .bind(&account_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?;

    if result.rows_affected() == 0 {
        return Err("Hibernated session not found".to_string());
    }

    info!("Deleted hibernated session: {}", hibernated_session_id);
    Ok(())
}
