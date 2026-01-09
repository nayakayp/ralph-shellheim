//! SSH Session Manager
//! 
//! Manages active SSH connections, handles session lifecycle,
//! and provides session sharing capabilities.

use once_cell::sync::Lazy;
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;
use tracing::info;

/// Active SSH session info
#[derive(Debug)]
pub struct SshSession {
    pub id: String,
    pub entry_id: String,
    pub account_id: String,
    pub host: String,
    pub port: u16,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub is_hibernated: bool,
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

    /// Create a new SSH session
    pub fn create_session(
        &self,
        entry_id: String,
        account_id: String,
        host: String,
        port: u16,
    ) -> String {
        let session_id = uuid::Uuid::new_v4().to_string();
        
        let session = Arc::new(SshSession {
            id: session_id.clone(),
            entry_id,
            account_id,
            host,
            port,
            created_at: chrono::Utc::now(),
            is_hibernated: false,
        });

        self.sessions.write().insert(session_id.clone(), session);
        
        info!("Created SSH session: {}", session_id);
        session_id
    }

    /// Get a session by ID
    pub fn get_session(&self, session_id: &str) -> Option<Arc<SshSession>> {
        self.sessions.read().get(session_id).cloned()
    }

    /// Remove a session
    pub fn remove_session(&self, session_id: &str) -> Option<Arc<SshSession>> {
        let session = self.sessions.write().remove(session_id);
        if session.is_some() {
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
}
