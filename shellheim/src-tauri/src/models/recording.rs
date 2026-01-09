//! Recording model for terminal session recordings

use serde::{Deserialize, Serialize};

/// Recording metadata stored in database
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Recording {
    pub id: String,
    pub account_id: String,
    pub entry_id: String,
    pub session_id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub duration_secs: Option<f64>,
    pub file_path: String,
    pub file_size: Option<i64>,
    pub terminal_cols: Option<i32>,
    pub terminal_rows: Option<i32>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub created_at: String,
}

/// Request to start a new recording
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartRecordingRequest {
    pub session_id: String,
    pub name: Option<String>,
    pub description: Option<String>,
}

/// Response after starting a recording
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartRecordingResponse {
    pub recording_id: String,
    pub session_id: String,
    pub started_at: String,
}

/// Request to stop an active recording
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StopRecordingRequest {
    pub recording_id: String,
}

/// Response after stopping a recording
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StopRecordingResponse {
    pub recording_id: String,
    pub duration_secs: f64,
    pub file_size: i64,
}

/// Recording info without file path (for listing)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingInfo {
    pub id: String,
    pub entry_id: String,
    pub session_id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub duration_secs: Option<f64>,
    pub file_size: Option<i64>,
    pub terminal_cols: Option<i32>,
    pub terminal_rows: Option<i32>,
    pub started_at: String,
    pub ended_at: Option<String>,
}

impl From<Recording> for RecordingInfo {
    fn from(r: Recording) -> Self {
        Self {
            id: r.id,
            entry_id: r.entry_id,
            session_id: r.session_id,
            name: r.name,
            description: r.description,
            duration_secs: r.duration_secs,
            file_size: r.file_size,
            terminal_cols: r.terminal_cols,
            terminal_rows: r.terminal_rows,
            started_at: r.started_at,
            ended_at: r.ended_at,
        }
    }
}

/// Update recording request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateRecordingRequest {
    pub name: Option<String>,
    pub description: Option<String>,
}
