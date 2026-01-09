//! SSH Tunnel Manager
//!
//! Handles local and remote port forwarding through SSH connections.
//! - Local forwarding: Listen on local port, forward to remote host:port via SSH
//! - Remote forwarding: Listen on remote port, forward to local host:port

use once_cell::sync::Lazy;
use parking_lot::RwLock;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tracing::{debug, error, info, warn};

use super::SessionManager;

/// Tunnel type
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TunnelType {
    Local,
    Remote,
}

/// Tunnel status
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TunnelStatus {
    Active,
    Stopped,
    Error,
}

/// Tunnel information
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelInfo {
    pub id: String,
    pub session_id: String,
    pub account_id: String,
    pub tunnel_type: TunnelType,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
    pub status: TunnelStatus,
    pub created_at: String,
    pub error_message: Option<String>,
}

/// Request to create a tunnel
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTunnelRequest {
    pub session_id: String,
    pub tunnel_type: TunnelType,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
}

/// Event for tunnel status changes
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelStatusEvent {
    pub tunnel_id: String,
    pub status: TunnelStatus,
    pub error_message: Option<String>,
}

/// Active tunnel with its runtime state
pub struct ActiveTunnel {
    pub info: RwLock<TunnelInfo>,
    /// Cancellation signal to stop the tunnel
    cancel_tx: tokio::sync::watch::Sender<bool>,
}

impl ActiveTunnel {
    /// Stop the tunnel
    pub fn stop(&self) {
        let _ = self.cancel_tx.send(true);
    }

    /// Get tunnel info
    pub fn get_info(&self) -> TunnelInfo {
        self.info.read().clone()
    }

    /// Update tunnel status
    pub fn update_status(&self, status: TunnelStatus, error_message: Option<String>) {
        let mut info = self.info.write();
        info.status = status;
        info.error_message = error_message;
    }
}

/// Global tunnel manager instance
static TUNNEL_MANAGER: Lazy<TunnelManager> = Lazy::new(TunnelManager::new);

/// SSH Tunnel Manager
pub struct TunnelManager {
    tunnels: RwLock<HashMap<String, Arc<ActiveTunnel>>>,
}

impl TunnelManager {
    /// Create a new tunnel manager
    fn new() -> Self {
        Self {
            tunnels: RwLock::new(HashMap::new()),
        }
    }

    /// Initialize the tunnel manager (called once at startup)
    pub fn init() {
        let _ = &*TUNNEL_MANAGER;
        info!("SSH Tunnel Manager initialized");
    }

    /// Get the global tunnel manager instance
    pub fn instance() -> &'static TunnelManager {
        &TUNNEL_MANAGER
    }

    /// Create and start a local port forwarding tunnel
    pub async fn create_local_tunnel(
        &self,
        request: CreateTunnelRequest,
        account_id: String,
        app_handle: AppHandle,
    ) -> Result<TunnelInfo, String> {
        let tunnel_id = uuid::Uuid::new_v4().to_string();

        // Create tunnel info
        let info = TunnelInfo {
            id: tunnel_id.clone(),
            session_id: request.session_id.clone(),
            account_id: account_id.clone(),
            tunnel_type: TunnelType::Local,
            local_port: request.local_port,
            remote_host: request.remote_host.clone(),
            remote_port: request.remote_port,
            status: TunnelStatus::Active,
            created_at: chrono::Utc::now().to_rfc3339(),
            error_message: None,
        };

        // Create cancellation channel
        let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);

        // Bind to local port
        let bind_addr: SocketAddr = format!("127.0.0.1:{}", request.local_port)
            .parse()
            .map_err(|e| format!("Invalid local port: {}", e))?;

        let listener = TcpListener::bind(bind_addr)
            .await
            .map_err(|e| format!("Failed to bind to {}: {}", bind_addr, e))?;

        info!(
            "Local tunnel {} listening on {} -> {}:{}",
            tunnel_id, bind_addr, request.remote_host, request.remote_port
        );

        // Store the tunnel first
        let tunnel = Arc::new(ActiveTunnel {
            info: RwLock::new(info.clone()),
            cancel_tx,
        });

        self.tunnels
            .write()
            .insert(tunnel_id.clone(), tunnel.clone());

        // Spawn the tunnel listener task
        let tunnel_id_clone = tunnel_id.clone();
        let session_id = request.session_id.clone();
        let remote_host = request.remote_host.clone();
        let remote_port = request.remote_port;
        let app_handle_clone = app_handle.clone();

        tokio::spawn(async move {
            run_local_tunnel(
                tunnel_id_clone,
                session_id,
                listener,
                remote_host,
                remote_port,
                cancel_rx,
                app_handle_clone,
            )
            .await;
        });

        // Emit status event
        emit_tunnel_status(&app_handle, &tunnel_id, TunnelStatus::Active, None);

        Ok(info)
    }

    /// Create and start a remote port forwarding tunnel
    /// Note: Remote port forwarding works differently - SSH server listens on remote port
    /// and forwards connections to us. This requires tcpip-forward request.
    pub async fn create_remote_tunnel(
        &self,
        request: CreateTunnelRequest,
        account_id: String,
        app_handle: AppHandle,
    ) -> Result<TunnelInfo, String> {
        let tunnel_id = uuid::Uuid::new_v4().to_string();

        // For remote tunneling, we open a direct-tcpip channel to initiate the connection
        // Get the SSH session
        let ssh_manager = SessionManager::instance();
        let session = ssh_manager
            .get_session(&request.session_id)
            .ok_or_else(|| "SSH session not found".to_string())?;

        // Open direct-tcpip channel
        let channel = {
            let conn_guard = session.connection.lock().await;
            let connection = conn_guard
                .as_ref()
                .ok_or_else(|| "SSH connection not active".to_string())?;
            
            connection
                .open_direct_tcpip(
                    &request.remote_host,
                    request.remote_port as u32,
                    "127.0.0.1",
                    request.local_port as u32,
                )
                .await?
        };

        // Create tunnel info
        let info = TunnelInfo {
            id: tunnel_id.clone(),
            session_id: request.session_id.clone(),
            account_id: account_id.clone(),
            tunnel_type: TunnelType::Remote,
            local_port: request.local_port,
            remote_host: request.remote_host.clone(),
            remote_port: request.remote_port,
            status: TunnelStatus::Active,
            created_at: chrono::Utc::now().to_rfc3339(),
            error_message: None,
        };

        // Create cancellation channel
        let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);

        info!(
            "Remote tunnel {} created: remote {}:{} -> local {}",
            tunnel_id, request.remote_host, request.remote_port, request.local_port
        );

        // Store the tunnel first
        let tunnel = Arc::new(ActiveTunnel {
            info: RwLock::new(info.clone()),
            cancel_tx,
        });

        self.tunnels
            .write()
            .insert(tunnel_id.clone(), tunnel.clone());

        // Spawn the remote tunnel handler
        let tunnel_id_clone = tunnel_id.clone();
        let local_port = request.local_port;
        let app_handle_clone = app_handle.clone();

        tokio::spawn(async move {
            run_remote_tunnel(
                tunnel_id_clone,
                channel,
                local_port,
                cancel_rx,
                app_handle_clone,
            )
            .await;
        });

        // Emit status event
        emit_tunnel_status(&app_handle, &tunnel_id, TunnelStatus::Active, None);

        Ok(info)
    }

    /// Stop a tunnel by ID
    pub fn stop_tunnel(
        &self,
        tunnel_id: &str,
        app_handle: &AppHandle,
    ) -> Result<(), String> {
        let tunnel = self
            .tunnels
            .write()
            .remove(tunnel_id)
            .ok_or_else(|| format!("Tunnel not found: {}", tunnel_id))?;

        tunnel.stop();

        info!("Stopped tunnel: {}", tunnel_id);

        // Emit status event
        emit_tunnel_status(app_handle, tunnel_id, TunnelStatus::Stopped, None);

        Ok(())
    }

    /// Get tunnel by ID
    pub fn get_tunnel(&self, tunnel_id: &str) -> Option<Arc<ActiveTunnel>> {
        self.tunnels.read().get(tunnel_id).cloned()
    }

    /// Get all tunnels for an account
    pub fn get_account_tunnels(&self, account_id: &str) -> Vec<TunnelInfo> {
        self.tunnels
            .read()
            .values()
            .filter_map(|tunnel| {
                let info = tunnel.get_info();
                if info.account_id == account_id {
                    Some(info)
                } else {
                    None
                }
            })
            .collect()
    }

    /// Get all tunnels for a session
    pub fn get_session_tunnels(&self, session_id: &str) -> Vec<TunnelInfo> {
        self.tunnels
            .read()
            .values()
            .filter_map(|tunnel| {
                let info = tunnel.get_info();
                if info.session_id == session_id {
                    Some(info)
                } else {
                    None
                }
            })
            .collect()
    }

    /// Stop all tunnels for a session (called when SSH session closes)
    pub fn stop_session_tunnels(&self, session_id: &str, app_handle: &AppHandle) {
        // Collect tunnel IDs to stop
        let tunnel_ids: Vec<String> = self
            .tunnels
            .read()
            .iter()
            .filter_map(|(id, tunnel)| {
                let info = tunnel.get_info();
                if info.session_id == session_id {
                    Some(id.clone())
                } else {
                    None
                }
            })
            .collect();

        for tunnel_id in tunnel_ids {
            let _ = self.stop_tunnel(&tunnel_id, app_handle);
        }
    }

    /// Update tunnel status (internal use)
    pub fn update_tunnel_status(
        &self,
        tunnel_id: &str,
        status: TunnelStatus,
        error_message: Option<String>,
    ) {
        if let Some(tunnel) = self.tunnels.read().get(tunnel_id) {
            tunnel.update_status(status, error_message);
        }
    }
}

/// Emit tunnel status event to frontend
fn emit_tunnel_status(
    app_handle: &AppHandle,
    tunnel_id: &str,
    status: TunnelStatus,
    error_message: Option<String>,
) {
    let event = TunnelStatusEvent {
        tunnel_id: tunnel_id.to_string(),
        status,
        error_message,
    };

    if let Err(e) = app_handle.emit(&format!("tunnel-status-{}", tunnel_id), event.clone()) {
        warn!("Failed to emit tunnel status event: {}", e);
    }

    // Also emit a general tunnel event
    if let Err(e) = app_handle.emit("tunnel-status", event) {
        warn!("Failed to emit general tunnel status event: {}", e);
    }
}

/// Run local port forwarding tunnel
async fn run_local_tunnel(
    tunnel_id: String,
    session_id: String,
    listener: TcpListener,
    remote_host: String,
    remote_port: u16,
    mut cancel_rx: tokio::sync::watch::Receiver<bool>,
    app_handle: AppHandle,
) {
    let manager = TunnelManager::instance();

    loop {
        tokio::select! {
            // Check for cancellation
            _ = cancel_rx.changed() => {
                if *cancel_rx.borrow() {
                    info!("Local tunnel {} cancelled", tunnel_id);
                    break;
                }
            }

            // Accept new connections
            accept_result = listener.accept() => {
                match accept_result {
                    Ok((stream, peer_addr)) => {
                        debug!("Tunnel {}: connection from {}", tunnel_id, peer_addr);

                        // Clone data for the connection handler
                        let session_id = session_id.clone();
                        let remote_host = remote_host.clone();
                        let tunnel_id_clone = tunnel_id.clone();

                        // Spawn handler for this connection
                        tokio::spawn(async move {
                            if let Err(e) = handle_local_connection(
                                stream,
                                &session_id,
                                &remote_host,
                                remote_port,
                            ).await {
                                debug!("Tunnel {} connection error: {}", tunnel_id_clone, e);
                            }
                        });
                    }
                    Err(e) => {
                        error!("Tunnel {} accept error: {}", tunnel_id, e);
                        manager.update_tunnel_status(
                            &tunnel_id,
                            TunnelStatus::Error,
                            Some(e.to_string()),
                        );
                        emit_tunnel_status(
                            &app_handle,
                            &tunnel_id,
                            TunnelStatus::Error,
                            Some(e.to_string()),
                        );
                        break;
                    }
                }
            }
        }
    }

    info!("Local tunnel {} listener stopped", tunnel_id);
}

/// Handle a single local forwarding connection
async fn handle_local_connection(
    mut local_stream: TcpStream,
    session_id: &str,
    remote_host: &str,
    remote_port: u16,
) -> Result<(), String> {
    // Get SSH session and open direct-tcpip channel
    let ssh_manager = SessionManager::instance();
    let session = ssh_manager
        .get_session(session_id)
        .ok_or_else(|| "SSH session not found".to_string())?;

    let channel = {
        let conn_guard = session.connection.lock().await;
        let connection = conn_guard
            .as_ref()
            .ok_or_else(|| "SSH connection not active".to_string())?;
        
        connection
            .open_direct_tcpip(
                remote_host,
                remote_port as u32,
                "127.0.0.1",
                0,
            )
            .await?
    };

    debug!(
        "Opened direct-tcpip channel to {}:{}",
        remote_host, remote_port
    );

    // Split local stream
    let (mut local_read, mut local_write) = local_stream.split();

    // Get channel stream for reading/writing
    let mut channel_stream = channel.into_stream();

    // Bidirectional copy
    let (mut channel_read, mut channel_write) = tokio::io::split(&mut channel_stream);

    let local_to_remote = async {
        let mut buf = [0u8; 8192];
        loop {
            match local_read.read(&mut buf).await {
                Ok(0) => break Ok(()),
                Ok(n) => {
                    if channel_write.write_all(&buf[..n]).await.is_err() {
                        break Err("Write to remote failed");
                    }
                }
                Err(_) => break Err("Read from local failed"),
            }
        }
    };

    let remote_to_local = async {
        let mut buf = [0u8; 8192];
        loop {
            match channel_read.read(&mut buf).await {
                Ok(0) => break Ok(()),
                Ok(n) => {
                    if local_write.write_all(&buf[..n]).await.is_err() {
                        break Err("Write to local failed");
                    }
                }
                Err(_) => break Err("Read from remote failed"),
            }
        }
    };

    // Run both directions concurrently
    tokio::select! {
        result = local_to_remote => {
            if let Err(e) = result {
                debug!("Local to remote: {}", e);
            }
        }
        result = remote_to_local => {
            if let Err(e) = result {
                debug!("Remote to local: {}", e);
            }
        }
    }

    debug!("Connection to {}:{} closed", remote_host, remote_port);
    Ok(())
}

/// Run remote port forwarding tunnel
async fn run_remote_tunnel(
    tunnel_id: String,
    channel: russh::Channel<russh::client::Msg>,
    local_port: u16,
    mut cancel_rx: tokio::sync::watch::Receiver<bool>,
    app_handle: AppHandle,
) {
    let manager = TunnelManager::instance();

    // Connect to local port
    let local_addr = format!("127.0.0.1:{}", local_port);
    let local_stream = match TcpStream::connect(&local_addr).await {
        Ok(stream) => stream,
        Err(e) => {
            error!("Remote tunnel {}: failed to connect to local {}: {}", tunnel_id, local_addr, e);
            manager.update_tunnel_status(&tunnel_id, TunnelStatus::Error, Some(e.to_string()));
            emit_tunnel_status(&app_handle, &tunnel_id, TunnelStatus::Error, Some(e.to_string()));
            return;
        }
    };

    let (mut local_read, mut local_write) = tokio::io::split(local_stream);
    let mut channel_stream = channel.into_stream();
    let (mut channel_read, mut channel_write) = tokio::io::split(&mut channel_stream);

    let local_to_remote = async {
        let mut buf = [0u8; 8192];
        loop {
            match local_read.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    if channel_write.write_all(&buf[..n]).await.is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    };

    let remote_to_local = async {
        let mut buf = [0u8; 8192];
        loop {
            match channel_read.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    if local_write.write_all(&buf[..n]).await.is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    };

    tokio::select! {
        _ = cancel_rx.changed() => {
            if *cancel_rx.borrow() {
                info!("Remote tunnel {} cancelled", tunnel_id);
            }
        }
        _ = local_to_remote => {}
        _ = remote_to_local => {}
    }

    info!("Remote tunnel {} closed", tunnel_id);
}
