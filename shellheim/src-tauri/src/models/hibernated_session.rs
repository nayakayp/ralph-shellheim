//! Hibernated session model

use serde::{Deserialize, Serialize};

/// Hibernated session stored in database
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct HibernatedSessionRow {
    pub id: String,
    pub account_id: String,
    pub entry_id: String,
    pub host: String,
    pub port: i32,
    pub username: String,
    pub identity_id: Option<String>,
    pub terminal_buffer: Option<String>,
    pub terminal_cols: Option<i32>,
    pub terminal_rows: Option<i32>,
    pub hibernated_at: String,
    pub created_at: String,
}

/// Hibernated session info for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HibernatedSession {
    pub id: String,
    pub entry_id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub terminal_cols: u32,
    pub terminal_rows: u32,
    pub hibernated_at: String,
    pub created_at: String,
}

impl From<HibernatedSessionRow> for HibernatedSession {
    fn from(row: HibernatedSessionRow) -> Self {
        Self {
            id: row.id,
            entry_id: row.entry_id,
            host: row.host,
            port: row.port as u16,
            username: row.username,
            terminal_cols: row.terminal_cols.unwrap_or(80) as u32,
            terminal_rows: row.terminal_rows.unwrap_or(24) as u32,
            hibernated_at: row.hibernated_at,
            created_at: row.created_at,
        }
    }
}

/// Request to hibernate a session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HibernateSessionRequest {
    pub session_id: String,
    /// Terminal buffer content captured from frontend
    pub terminal_buffer: Option<String>,
}

/// Request to resume a hibernated session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeSessionRequest {
    pub hibernated_session_id: String,
    pub cols: u32,
    pub rows: u32,
}

/// Response when resuming a session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeSessionResponse {
    pub session_id: String,
    pub entry_id: String,
    pub host: String,
    pub port: u16,
    pub connected_at: String,
    /// Terminal buffer content to restore
    pub terminal_buffer: Option<String>,
}
