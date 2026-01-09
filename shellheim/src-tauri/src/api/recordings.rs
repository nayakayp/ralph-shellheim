//! Recordings API handlers

use crate::db;
use crate::models::{
    Recording, RecordingInfo, StartRecordingRequest, StartRecordingResponse,
    StopRecordingRequest, StopRecordingResponse, UpdateRecordingRequest,
};
use crate::ssh::{RecordingManager, SessionManager};
use sqlx::Row;
use std::fs;
use tauri::command;
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

/// Start recording a session
#[command]
pub async fn start_recording(
    token: String,
    request: StartRecordingRequest,
) -> Result<StartRecordingResponse, String> {
    info!("Start recording request for session: {}", request.session_id);

    let account_id = get_account_id_from_token(&token).await?;

    // Get session to verify ownership and get details
    let session_manager = SessionManager::instance();
    let session = session_manager
        .get_session(&request.session_id)
        .ok_or_else(|| "Session not found".to_string())?;

    if session.account_id != account_id {
        return Err("Session not found".to_string());
    }

    // Generate recording ID
    let recording_id = uuid::Uuid::new_v4().to_string();

    // Start recording in memory
    let recording_manager = RecordingManager::instance();
    let active_recording = recording_manager.start_recording(
        recording_id.clone(),
        request.session_id.clone(),
        session.entry_id.clone(),
        account_id.clone(),
        session.terminal_cols,
        session.terminal_rows,
    )?;

    // Generate name if not provided
    let name = request.name.unwrap_or_else(|| {
        format!(
            "Recording {}",
            active_recording.started_at.format("%Y-%m-%d %H:%M")
        )
    });

    // Save to database
    let pool = db::pool();
    let started_at = active_recording.started_at.to_rfc3339();
    let file_path = active_recording.file_path.to_string_lossy().to_string();

    sqlx::query(
        r#"
        INSERT INTO recordings 
        (id, account_id, entry_id, session_id, name, description, file_path, terminal_cols, terminal_rows, started_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&recording_id)
    .bind(&account_id)
    .bind(&session.entry_id)
    .bind(&request.session_id)
    .bind(&name)
    .bind(&request.description)
    .bind(&file_path)
    .bind(session.terminal_cols as i32)
    .bind(session.terminal_rows as i32)
    .bind(&started_at)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to save recording: {}", e))?;

    info!("Recording {} started for session {}", recording_id, request.session_id);

    Ok(StartRecordingResponse {
        recording_id,
        session_id: request.session_id,
        started_at,
    })
}

/// Stop an active recording
#[command]
pub async fn stop_recording(
    token: String,
    request: StopRecordingRequest,
) -> Result<StopRecordingResponse, String> {
    info!("Stop recording request: {}", request.recording_id);

    let account_id = get_account_id_from_token(&token).await?;

    // Verify ownership
    let pool = db::pool();
    let _recording: Recording = sqlx::query_as(
        "SELECT * FROM recordings WHERE id = ? AND account_id = ?",
    )
    .bind(&request.recording_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Recording not found".to_string())?;

    // Stop the recording in memory
    let recording_manager = RecordingManager::instance();
    let (duration_secs, file_size) = recording_manager.stop_recording(&request.recording_id)?;

    // Update database with final stats
    let ended_at = chrono::Utc::now().to_rfc3339();
    
    sqlx::query(
        "UPDATE recordings SET duration_secs = ?, file_size = ?, ended_at = ? WHERE id = ?",
    )
    .bind(duration_secs)
    .bind(file_size as i64)
    .bind(&ended_at)
    .bind(&request.recording_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to update recording: {}", e))?;

    info!("Recording {} stopped: {:.2}s, {} bytes", request.recording_id, duration_secs, file_size);

    Ok(StopRecordingResponse {
        recording_id: request.recording_id,
        duration_secs,
        file_size: file_size as i64,
    })
}

/// List all recordings for current user
#[command]
pub async fn list_recordings(token: String) -> Result<Vec<RecordingInfo>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    let pool = db::pool();

    let recordings: Vec<Recording> = sqlx::query_as(
        "SELECT * FROM recordings WHERE account_id = ? ORDER BY started_at DESC",
    )
    .bind(&account_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    Ok(recordings.into_iter().map(Into::into).collect())
}

/// List recordings for a specific entry
#[command]
pub async fn list_entry_recordings(
    token: String,
    entry_id: String,
) -> Result<Vec<RecordingInfo>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    let pool = db::pool();

    let recordings: Vec<Recording> = sqlx::query_as(
        "SELECT * FROM recordings WHERE account_id = ? AND entry_id = ? ORDER BY started_at DESC",
    )
    .bind(&account_id)
    .bind(&entry_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    Ok(recordings.into_iter().map(Into::into).collect())
}

/// Get recording file content for playback
#[command]
pub async fn get_recording_content(
    token: String,
    recording_id: String,
) -> Result<String, String> {
    let account_id = get_account_id_from_token(&token).await?;
    let pool = db::pool();

    let recording: Recording = sqlx::query_as(
        "SELECT * FROM recordings WHERE id = ? AND account_id = ?",
    )
    .bind(&recording_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Recording not found".to_string())?;

    // Check if recording is still active
    let recording_manager = RecordingManager::instance();
    if recording_manager.get_recording(&recording_id).is_some() {
        return Err("Recording is still active".to_string());
    }

    // Read file content
    let content = fs::read_to_string(&recording.file_path)
        .map_err(|e| format!("Failed to read recording file: {}", e))?;

    Ok(content)
}

/// Get recording info
#[command]
pub async fn get_recording(
    token: String,
    recording_id: String,
) -> Result<RecordingInfo, String> {
    let account_id = get_account_id_from_token(&token).await?;
    let pool = db::pool();

    let recording: Recording = sqlx::query_as(
        "SELECT * FROM recordings WHERE id = ? AND account_id = ?",
    )
    .bind(&recording_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Recording not found".to_string())?;

    Ok(recording.into())
}

/// Update recording metadata
#[command]
pub async fn update_recording(
    token: String,
    recording_id: String,
    request: UpdateRecordingRequest,
) -> Result<RecordingInfo, String> {
    let account_id = get_account_id_from_token(&token).await?;
    let pool = db::pool();

    // Verify ownership
    let existing: Recording = sqlx::query_as(
        "SELECT * FROM recordings WHERE id = ? AND account_id = ?",
    )
    .bind(&recording_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Recording not found".to_string())?;

    // Build update query
    let name = request.name.unwrap_or(existing.name);
    let description = request.description.or(existing.description);

    sqlx::query(
        "UPDATE recordings SET name = ?, description = ? WHERE id = ?",
    )
    .bind(&name)
    .bind(&description)
    .bind(&recording_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to update recording: {}", e))?;

    // Return updated recording
    get_recording(token, recording_id).await
}

/// Delete a recording
#[command]
pub async fn delete_recording(
    token: String,
    recording_id: String,
) -> Result<(), String> {
    let account_id = get_account_id_from_token(&token).await?;
    let pool = db::pool();

    // Get recording to find file path
    let recording: Recording = sqlx::query_as(
        "SELECT * FROM recordings WHERE id = ? AND account_id = ?",
    )
    .bind(&recording_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Recording not found".to_string())?;

    // Cancel if still active
    let recording_manager = RecordingManager::instance();
    recording_manager.cancel_recording(&recording_id);

    // Delete file
    if let Err(e) = fs::remove_file(&recording.file_path) {
        tracing::warn!("Failed to delete recording file: {}", e);
    }

    // Delete from database
    sqlx::query("DELETE FROM recordings WHERE id = ?")
        .bind(&recording_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to delete recording: {}", e))?;

    info!("Deleted recording: {}", recording_id);
    Ok(())
}

/// Check if a session is currently being recorded
#[command]
pub async fn is_session_recording(
    token: String,
    session_id: String,
) -> Result<Option<String>, String> {
    let account_id = get_account_id_from_token(&token).await?;

    // Verify session ownership
    let session_manager = SessionManager::instance();
    if let Some(session) = session_manager.get_session(&session_id) {
        if session.account_id != account_id {
            return Err("Session not found".to_string());
        }
    } else {
        return Err("Session not found".to_string());
    }

    // Check if recording exists
    let recording_manager = RecordingManager::instance();
    let recording_id = recording_manager
        .get_session_recording(&session_id)
        .map(|r| r.id.clone());

    Ok(recording_id)
}
