//! Monitoring models for server health checks

use serde::{Deserialize, Serialize};

/// Server health status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HealthStatus {
    /// Server is reachable and responding
    Online,
    /// Server is not reachable
    Offline,
    /// Health check is in progress
    Checking,
    /// Health check failed with error
    Error,
    /// Server has not been checked yet
    Unknown,
}

impl Default for HealthStatus {
    fn default() -> Self {
        HealthStatus::Unknown
    }
}

/// Result of a health check for a single entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheckResult {
    /// Entry ID that was checked
    pub entry_id: String,
    /// Health status
    pub status: HealthStatus,
    /// Response time in milliseconds (if online)
    pub response_time_ms: Option<u64>,
    /// Error message (if error)
    pub error: Option<String>,
    /// Timestamp of the check (ISO 8601)
    pub checked_at: String,
    /// Port that was checked
    pub port: Option<i32>,
    /// Host that was checked
    pub host: Option<String>,
}

/// Request to check health of multiple entries
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheckRequest {
    /// Entry IDs to check (if empty, check all entries for user)
    pub entry_ids: Option<Vec<String>>,
    /// Timeout in milliseconds (default: 5000)
    pub timeout_ms: Option<u64>,
}

/// Aggregated monitoring statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitoringStats {
    /// Total number of entries
    pub total: u32,
    /// Number of online entries
    pub online: u32,
    /// Number of offline entries
    pub offline: u32,
    /// Number of entries with errors
    pub errors: u32,
    /// Number of entries not yet checked
    pub unknown: u32,
    /// Timestamp of stats generation
    pub generated_at: String,
}

impl Default for MonitoringStats {
    fn default() -> Self {
        MonitoringStats {
            total: 0,
            online: 0,
            offline: 0,
            errors: 0,
            unknown: 0,
            generated_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}
