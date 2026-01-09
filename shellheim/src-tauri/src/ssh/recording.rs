//! Recording Manager
//!
//! Manages active terminal session recordings in asciinema v2 format.
//! Recordings are written incrementally to files during the session.

use once_cell::sync::Lazy;
use parking_lot::RwLock;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;
use tracing::{info, warn};

/// Active recording state
pub struct ActiveRecording {
    pub id: String,
    pub session_id: String,
    pub entry_id: String,
    pub account_id: String,
    pub file_path: PathBuf,
    pub terminal_cols: u32,
    pub terminal_rows: u32,
    pub started_at: chrono::DateTime<chrono::Utc>,
    start_instant: Instant,
    writer: RwLock<BufWriter<File>>,
}

impl ActiveRecording {
    /// Write output data to the recording in asciinema v2 format
    /// Each event is: [timestamp, "o", data]
    pub fn write_output(&self, data: &str) {
        let elapsed = self.start_instant.elapsed().as_secs_f64();
        let escaped = serde_json::to_string(data).unwrap_or_else(|_| "\"\"".to_string());
        let line = format!("[{:.6}, \"o\", {}]\n", elapsed, escaped);
        
        let mut writer = self.writer.write();
        if let Err(e) = writer.write_all(line.as_bytes()) {
            warn!("Failed to write recording data: {}", e);
        }
    }

    /// Write input data to the recording (optional, for input capture)
    pub fn write_input(&self, data: &str) {
        let elapsed = self.start_instant.elapsed().as_secs_f64();
        let escaped = serde_json::to_string(data).unwrap_or_else(|_| "\"\"".to_string());
        let line = format!("[{:.6}, \"i\", {}]\n", elapsed, escaped);
        
        let mut writer = self.writer.write();
        if let Err(e) = writer.write_all(line.as_bytes()) {
            warn!("Failed to write recording input: {}", e);
        }
    }

    /// Get duration in seconds
    pub fn duration_secs(&self) -> f64 {
        self.start_instant.elapsed().as_secs_f64()
    }

    /// Flush and finalize the recording
    pub fn finalize(&self) -> std::io::Result<u64> {
        let mut writer = self.writer.write();
        writer.flush()?;
        drop(writer);
        
        // Get final file size
        let metadata = fs::metadata(&self.file_path)?;
        Ok(metadata.len())
    }
}

/// Global recording manager instance
static RECORDING_MANAGER: Lazy<RecordingManager> = Lazy::new(RecordingManager::new);

/// Recording Manager
pub struct RecordingManager {
    /// Active recordings by recording ID
    recordings: RwLock<HashMap<String, Arc<ActiveRecording>>>,
    /// Recording ID by session ID (for quick lookup)
    session_recordings: RwLock<HashMap<String, String>>,
    /// Base directory for recordings
    recordings_dir: RwLock<Option<PathBuf>>,
}

impl RecordingManager {
    fn new() -> Self {
        Self {
            recordings: RwLock::new(HashMap::new()),
            session_recordings: RwLock::new(HashMap::new()),
            recordings_dir: RwLock::new(None),
        }
    }

    /// Initialize the recording manager with app data directory
    pub fn init(app_data_dir: PathBuf) {
        let recordings_dir = app_data_dir.join("recordings");
        
        // Create recordings directory if it doesn't exist
        if let Err(e) = fs::create_dir_all(&recordings_dir) {
            warn!("Failed to create recordings directory: {}", e);
        }
        
        *RECORDING_MANAGER.recordings_dir.write() = Some(recordings_dir);
        info!("Recording Manager initialized");
    }

    /// Get the global recording manager instance
    pub fn instance() -> &'static RecordingManager {
        &RECORDING_MANAGER
    }

    /// Get the recordings directory
    pub fn recordings_dir(&self) -> Option<PathBuf> {
        self.recordings_dir.read().clone()
    }

    /// Start a new recording for a session
    pub fn start_recording(
        &self,
        recording_id: String,
        session_id: String,
        entry_id: String,
        account_id: String,
        terminal_cols: u32,
        terminal_rows: u32,
    ) -> Result<Arc<ActiveRecording>, String> {
        // Check if session already has a recording
        if self.session_recordings.read().contains_key(&session_id) {
            return Err("Session already has an active recording".to_string());
        }

        let recordings_dir = self.recordings_dir.read()
            .clone()
            .ok_or_else(|| "Recording manager not initialized".to_string())?;

        // Create file path: recordings/{account_id}/{recording_id}.cast
        let account_dir = recordings_dir.join(&account_id);
        if let Err(e) = fs::create_dir_all(&account_dir) {
            return Err(format!("Failed to create account recordings directory: {}", e));
        }

        let file_path = account_dir.join(format!("{}.cast", recording_id));
        
        // Create file and writer
        let file = File::create(&file_path)
            .map_err(|e| format!("Failed to create recording file: {}", e))?;
        let mut writer = BufWriter::new(file);

        let started_at = chrono::Utc::now();

        // Write asciinema v2 header
        let header = serde_json::json!({
            "version": 2,
            "width": terminal_cols,
            "height": terminal_rows,
            "timestamp": started_at.timestamp(),
            "env": {
                "SHELL": "/bin/bash",
                "TERM": "xterm-256color"
            }
        });
        
        writeln!(writer, "{}", header)
            .map_err(|e| format!("Failed to write recording header: {}", e))?;

        let recording = Arc::new(ActiveRecording {
            id: recording_id.clone(),
            session_id: session_id.clone(),
            entry_id,
            account_id,
            file_path,
            terminal_cols,
            terminal_rows,
            started_at,
            start_instant: Instant::now(),
            writer: RwLock::new(writer),
        });

        // Store in both maps
        self.recordings.write().insert(recording_id.clone(), recording.clone());
        self.session_recordings.write().insert(session_id.clone(), recording_id.clone());

        info!("Started recording {} for session {}", recording_id, session_id);

        Ok(recording)
    }

    /// Get recording by ID
    pub fn get_recording(&self, recording_id: &str) -> Option<Arc<ActiveRecording>> {
        self.recordings.read().get(recording_id).cloned()
    }

    /// Get recording for a session
    pub fn get_session_recording(&self, session_id: &str) -> Option<Arc<ActiveRecording>> {
        let recording_id = self.session_recordings.read().get(session_id).cloned()?;
        self.get_recording(&recording_id)
    }

    /// Check if session has an active recording
    pub fn is_session_recording(&self, session_id: &str) -> bool {
        self.session_recordings.read().contains_key(session_id)
    }

    /// Stop and finalize a recording
    pub fn stop_recording(&self, recording_id: &str) -> Result<(f64, u64), String> {
        let recording = self.recordings.write().remove(recording_id)
            .ok_or_else(|| "Recording not found".to_string())?;

        // Remove from session map
        self.session_recordings.write().remove(&recording.session_id);

        // Finalize the recording
        let duration = recording.duration_secs();
        let file_size = recording.finalize()
            .map_err(|e| format!("Failed to finalize recording: {}", e))?;

        info!("Stopped recording {}: {:.2}s, {} bytes", recording_id, duration, file_size);

        Ok((duration, file_size))
    }

    /// Write output data to the recording for a session (if recording)
    pub fn record_output(&self, session_id: &str, data: &str) {
        if let Some(recording) = self.get_session_recording(session_id) {
            recording.write_output(data);
        }
    }

    /// Write input data to the recording for a session (if recording)
    pub fn record_input(&self, session_id: &str, data: &str) {
        if let Some(recording) = self.get_session_recording(session_id) {
            recording.write_input(data);
        }
    }

    /// Cancel a recording (remove without finalizing metadata in DB)
    pub fn cancel_recording(&self, recording_id: &str) -> Option<PathBuf> {
        let recording = self.recordings.write().remove(recording_id)?;
        self.session_recordings.write().remove(&recording.session_id);
        
        // Try to delete the file
        let path = recording.file_path.clone();
        if let Err(e) = fs::remove_file(&path) {
            warn!("Failed to delete cancelled recording file: {}", e);
        }

        info!("Cancelled recording {}", recording_id);
        Some(path)
    }

    /// Get all active recordings for an account
    pub fn get_account_recordings(&self, account_id: &str) -> Vec<Arc<ActiveRecording>> {
        self.recordings.read()
            .values()
            .filter(|r| r.account_id == account_id)
            .cloned()
            .collect()
    }
}
