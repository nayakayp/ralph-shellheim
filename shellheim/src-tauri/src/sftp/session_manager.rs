//! SFTP Session Manager
//!
//! Manages active SFTP connections and provides session lifecycle management.

use super::client::SftpConnection;
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::info;

/// SFTP session with connection
pub struct SftpSessionEntry {
    pub id: String,
    pub entry_id: String,
    pub account_id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub identity_id: Option<String>,
    pub current_path: RwLock<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    /// The active SFTP connection
    pub connection: Mutex<Option<SftpConnection>>,
}

impl SftpSessionEntry {
    /// Check if the session has an active connection
    pub async fn is_connected(&self) -> bool {
        self.connection.lock().await.is_some()
    }

    /// Get the current path
    pub fn get_current_path(&self) -> String {
        self.current_path.read().clone()
    }

    /// Set the current path
    pub fn set_current_path(&self, path: String) {
        *self.current_path.write() = path;
    }
}

/// Global SFTP session manager instance
static SFTP_SESSION_MANAGER: Lazy<SftpSessionManager> = Lazy::new(SftpSessionManager::new);

/// SFTP Session Manager
pub struct SftpSessionManager {
    sessions: RwLock<HashMap<String, Arc<SftpSessionEntry>>>,
}

impl SftpSessionManager {
    /// Create a new session manager
    fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
        }
    }

    /// Initialize the session manager
    pub fn init() {
        let _ = &*SFTP_SESSION_MANAGER;
        info!("SFTP Session Manager initialized");
    }

    /// Get the global session manager instance
    pub fn instance() -> &'static SftpSessionManager {
        &SFTP_SESSION_MANAGER
    }

    /// Create a new SFTP session with connection
    pub fn create_session(
        &self,
        entry_id: String,
        account_id: String,
        host: String,
        port: u16,
        username: String,
        identity_id: Option<String>,
        initial_path: String,
        connection: SftpConnection,
    ) -> Arc<SftpSessionEntry> {
        let session_id = uuid::Uuid::new_v4().to_string();

        let session = Arc::new(SftpSessionEntry {
            id: session_id.clone(),
            entry_id,
            account_id,
            host,
            port,
            username,
            identity_id,
            current_path: RwLock::new(initial_path),
            created_at: chrono::Utc::now(),
            connection: Mutex::new(Some(connection)),
        });

        self.sessions
            .write()
            .insert(session_id.clone(), session.clone());

        info!("Created SFTP session: {}", session_id);
        session
    }

    /// Get a session by ID
    pub fn get_session(&self, session_id: &str) -> Option<Arc<SftpSessionEntry>> {
        self.sessions.read().get(session_id).cloned()
    }

    /// Remove a session and close its connection
    pub async fn remove_session(&self, session_id: &str) -> Option<Arc<SftpSessionEntry>> {
        let session = self.sessions.write().remove(session_id);

        if let Some(ref s) = session {
            let mut conn_guard = s.connection.lock().await;
            if let Some(conn) = conn_guard.take() {
                if let Err(e) = conn.close().await {
                    tracing::warn!("Error closing SFTP connection: {}", e);
                }
            }
            info!("Removed SFTP session: {}", session_id);
        }

        session
    }

    /// Get all sessions for an account
    pub fn get_account_sessions(&self, account_id: &str) -> Vec<Arc<SftpSessionEntry>> {
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
}
