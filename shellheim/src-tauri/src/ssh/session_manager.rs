//! SSH Session Manager
//!
//! Manages active SSH connections, handles session lifecycle,
//! and provides session sharing capabilities.

use super::client::ActiveConnection;
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::info;

/// Maximum terminal buffer size (200KB, matching Nexterm)
const MAX_BUFFER_SIZE: usize = 200 * 1024;

/// Active SSH session with connection
pub struct SshSession {
    pub id: String,
    pub entry_id: String,
    pub account_id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub identity_id: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub is_hibernated: bool,
    pub terminal_cols: u32,
    pub terminal_rows: u32,
    /// Terminal output buffer for hibernation restore
    terminal_buffer: RwLock<String>,
    /// The active SSH connection (wrapped in async mutex for mutable access)
    pub connection: Mutex<Option<ActiveConnection>>,
}

impl SshSession {
    /// Check if the session has an active connection
    pub async fn is_connected(&self) -> bool {
        self.connection.lock().await.is_some()
    }

    /// Append data to the terminal buffer
    pub fn append_to_buffer(&self, data: &str) {
        let mut buffer = self.terminal_buffer.write();
        buffer.push_str(data);
        // Trim from the start if buffer exceeds max size
        if buffer.len() > MAX_BUFFER_SIZE {
            let excess = buffer.len() - MAX_BUFFER_SIZE;
            buffer.drain(..excess);
        }
    }

    /// Get the terminal buffer content
    pub fn get_buffer(&self) -> String {
        self.terminal_buffer.read().clone()
    }

    /// Clear the terminal buffer
    pub fn clear_buffer(&self) {
        self.terminal_buffer.write().clear();
    }
}

/// Global session manager instance
static SESSION_MANAGER: Lazy<SessionManager> = Lazy::new(SessionManager::new);

/// SSH Session Manager
pub struct SessionManager {
    sessions: RwLock<HashMap<String, Arc<SshSession>>>,
}

impl SessionManager {
    /// Create a new session manager
    fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
        }
    }

    /// Initialize the session manager (called once at startup)
    pub fn init() {
        // Access the lazy static to ensure it's initialized
        let _ = &*SESSION_MANAGER;
        info!("SSH Session Manager initialized");
    }

    /// Get the global session manager instance
    pub fn instance() -> &'static SessionManager {
        &SESSION_MANAGER
    }

    /// Create a new SSH session with connection using a pre-generated session ID
    pub fn create_session(
        &self,
        session_id: String,
        entry_id: String,
        account_id: String,
        host: String,
        port: u16,
        username: String,
        identity_id: Option<String>,
        terminal_cols: u32,
        terminal_rows: u32,
        connection: ActiveConnection,
    ) -> Arc<SshSession> {
        let session = Arc::new(SshSession {
            id: session_id.clone(),
            entry_id,
            account_id,
            host,
            port,
            username,
            identity_id,
            created_at: chrono::Utc::now(),
            is_hibernated: false,
            terminal_cols,
            terminal_rows,
            terminal_buffer: RwLock::new(String::new()),
            connection: Mutex::new(Some(connection)),
        });

        self.sessions.write().insert(session_id.clone(), session.clone());

        info!("Created SSH session: {}", session_id);
        session
    }

    /// Get a session by ID
    pub fn get_session(&self, session_id: &str) -> Option<Arc<SshSession>> {
        self.sessions.read().get(session_id).cloned()
    }

    /// Remove a session and close its connection
    pub async fn remove_session(&self, session_id: &str) -> Option<Arc<SshSession>> {
        let session = self.sessions.write().remove(session_id);
        
        if let Some(ref s) = session {
            // Close the connection if it exists
            let mut conn_guard = s.connection.lock().await;
            if let Some(conn) = conn_guard.take() {
                if let Err(e) = conn.close().await {
                    tracing::warn!("Error closing SSH connection: {}", e);
                }
            }
            info!("Removed SSH session: {}", session_id);
        }
        
        session
    }

    /// Get all sessions for an account
    pub fn get_account_sessions(&self, account_id: &str) -> Vec<Arc<SshSession>> {
        self.sessions
            .read()
            .values()
            .filter(|s| s.account_id == account_id)
            .cloned()
            .collect()
    }

    /// Get session count
    pub fn session_count(&self) -> usize {
        self.sessions.read().len()
    }

    /// Send data to a session's terminal
    pub async fn send_data(&self, session_id: &str, data: &[u8]) -> Result<(), String> {
        let session = self
            .get_session(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;

        let conn_guard = session.connection.lock().await;
        let conn = conn_guard
            .as_ref()
            .ok_or_else(|| "Connection not active".to_string())?;

        conn.send_data(data).await
    }

    /// Resize a session's terminal
    pub async fn resize_terminal(
        &self,
        session_id: &str,
        cols: u32,
        rows: u32,
    ) -> Result<(), String> {
        let session = self
            .get_session(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;

        let conn_guard = session.connection.lock().await;
        let conn = conn_guard
            .as_ref()
            .ok_or_else(|| "Connection not active".to_string())?;

        conn.resize(cols, rows).await
    }
}
