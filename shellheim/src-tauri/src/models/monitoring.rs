//! Monitoring models for server health checks and resource statistics

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

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

// ============================================================
// Server Resource Statistics (collected via SSH)
// ============================================================

/// Server resource statistics row from database
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct ServerStatsRow {
    pub id: String,
    pub account_id: String,
    pub entry_id: String,
    // CPU metrics
    pub cpu_usage_percent: Option<f64>,
    pub cpu_cores: Option<i32>,
    pub load_avg_1: Option<f64>,
    pub load_avg_5: Option<f64>,
    pub load_avg_15: Option<f64>,
    // Memory metrics (in bytes)
    pub memory_total: Option<i64>,
    pub memory_used: Option<i64>,
    pub memory_free: Option<i64>,
    pub memory_cached: Option<i64>,
    pub swap_total: Option<i64>,
    pub swap_used: Option<i64>,
    // Disk metrics (in bytes)
    pub disk_total: Option<i64>,
    pub disk_used: Option<i64>,
    pub disk_free: Option<i64>,
    pub disk_path: Option<String>,
    // Network metrics
    pub net_rx_bytes: Option<i64>,
    pub net_tx_bytes: Option<i64>,
    pub net_interface: Option<String>,
    // System info
    pub uptime_seconds: Option<i64>,
    pub os_name: Option<String>,
    pub kernel_version: Option<String>,
    pub hostname: Option<String>,
    // Timestamps
    pub collected_at: String,
}

/// Server stats for API response (simplified)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerStats {
    pub id: String,
    pub entry_id: String,
    // CPU
    pub cpu_usage_percent: Option<f64>,
    pub cpu_cores: Option<i32>,
    pub load_avg: Option<(f64, f64, f64)>,
    // Memory
    pub memory: Option<MemoryStats>,
    pub swap: Option<SwapStats>,
    // Disk
    pub disk: Option<DiskStats>,
    // Network
    pub network: Option<NetworkStats>,
    // System
    pub uptime_seconds: Option<i64>,
    pub os_name: Option<String>,
    pub kernel_version: Option<String>,
    pub hostname: Option<String>,
    pub collected_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryStats {
    pub total: i64,
    pub used: i64,
    pub free: i64,
    pub cached: i64,
    pub usage_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwapStats {
    pub total: i64,
    pub used: i64,
    pub usage_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskStats {
    pub path: String,
    pub total: i64,
    pub used: i64,
    pub free: i64,
    pub usage_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkStats {
    pub interface: String,
    pub rx_bytes: i64,
    pub tx_bytes: i64,
}

impl From<ServerStatsRow> for ServerStats {
    fn from(row: ServerStatsRow) -> Self {
        let memory = if let (Some(total), Some(used), Some(free)) = 
            (row.memory_total, row.memory_used, row.memory_free) {
            let usage_percent = if total > 0 {
                (used as f64 / total as f64) * 100.0
            } else {
                0.0
            };
            Some(MemoryStats {
                total,
                used,
                free,
                cached: row.memory_cached.unwrap_or(0),
                usage_percent,
            })
        } else {
            None
        };

        let swap = if let (Some(total), Some(used)) = (row.swap_total, row.swap_used) {
            let usage_percent = if total > 0 {
                (used as f64 / total as f64) * 100.0
            } else {
                0.0
            };
            Some(SwapStats {
                total,
                used,
                usage_percent,
            })
        } else {
            None
        };

        let disk = if let (Some(total), Some(used), Some(free)) = 
            (row.disk_total, row.disk_used, row.disk_free) {
            let usage_percent = if total > 0 {
                (used as f64 / total as f64) * 100.0
            } else {
                0.0
            };
            Some(DiskStats {
                path: row.disk_path.unwrap_or_else(|| "/".to_string()),
                total,
                used,
                free,
                usage_percent,
            })
        } else {
            None
        };

        let network = if let (Some(rx), Some(tx)) = (row.net_rx_bytes, row.net_tx_bytes) {
            Some(NetworkStats {
                interface: row.net_interface.unwrap_or_else(|| "eth0".to_string()),
                rx_bytes: rx,
                tx_bytes: tx,
            })
        } else {
            None
        };

        let load_avg = if let (Some(l1), Some(l5), Some(l15)) = 
            (row.load_avg_1, row.load_avg_5, row.load_avg_15) {
            Some((l1, l5, l15))
        } else {
            None
        };

        ServerStats {
            id: row.id,
            entry_id: row.entry_id,
            cpu_usage_percent: row.cpu_usage_percent,
            cpu_cores: row.cpu_cores,
            load_avg,
            memory,
            swap,
            disk,
            network,
            uptime_seconds: row.uptime_seconds,
            os_name: row.os_name,
            kernel_version: row.kernel_version,
            hostname: row.hostname,
            collected_at: row.collected_at,
        }
    }
}

/// Request to collect stats for an entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectStatsRequest {
    pub entry_id: String,
}

/// Historical stats query
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatsHistoryRequest {
    pub entry_id: String,
    /// Timeframe: 1h, 6h, 24h
    pub timeframe: Option<String>,
    /// Max number of data points
    pub limit: Option<i32>,
}

/// Stats history response with time series data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatsHistory {
    pub entry_id: String,
    pub timeframe: String,
    pub data_points: Vec<ServerStats>,
}
