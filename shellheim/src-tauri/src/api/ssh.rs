//! SSH API handlers

use crate::ssh::{ConnectRequest, ResizeRequest, SendDataRequest, SessionManager, SshSessionInfo};
use tauri::command;
use tracing::info;

#[command]
pub async fn connect_ssh(token: String, request: ConnectRequest) -> Result<SshSessionInfo, String> {
    info!("SSH connect request for entry: {}", request.entry_id);
    
    // TODO: Implement full SSH connection
    // 1. Lookup entry from database
    // 2. Get associated identity
    // 3. Decrypt credentials
    // 4. Establish SSH connection via russh
    // 5. Create PTY session
    // 6. Return session info
    
    Err("SSH connect not yet implemented".to_string())
}

#[command]
pub async fn disconnect_ssh(token: String, session_id: String) -> Result<(), String> {
    info!("SSH disconnect request for session: {}", session_id);
    
    let manager = SessionManager::instance();
    
    if manager.remove_session(&session_id).is_some() {
        Ok(())
    } else {
        Err(format!("Session not found: {}", session_id))
    }
}

#[command]
pub async fn send_data(token: String, request: SendDataRequest) -> Result<(), String> {
    info!("Sending data to session: {}", request.session_id);
    
    // TODO: Implement data sending to SSH channel
    Err("Send data not yet implemented".to_string())
}

#[command]
pub async fn resize_terminal(token: String, request: ResizeRequest) -> Result<(), String> {
    info!(
        "Resize terminal: {} to {}x{}",
        request.session_id, request.cols, request.rows
    );
    
    // TODO: Implement terminal resize
    Err("Resize terminal not yet implemented".to_string())
}
