//! Monitoring API handlers for server health checks and resource statistics

use crate::db;
use crate::models::{EntryRow, HealthCheckResult, HealthStatus, MonitoringStats, ServerStats, ServerStatsRow, StatsHistory};
use crate::services::{parse_stats_output, STATS_COLLECTION_SCRIPT};
use crate::ssh::execute_command;
use std::collections::HashMap;
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use once_cell::sync::Lazy;
use sqlx::Row;
use tracing::{debug, info};

/// Cache for health check results (entry_id -> result)
static HEALTH_CACHE: Lazy<Mutex<HashMap<String, HealthCheckResult>>> = 
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Get account ID from token
async fn get_account_id(token: &str) -> Result<String, String> {
    let pool = db::pool();
    
    let row = sqlx::query(
        "SELECT account_id FROM sessions WHERE token = ? AND expires_at > datetime('now')"
    )
    .bind(token)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Invalid or expired token".to_string())?;
    
    Ok(row.get("account_id"))
}

/// Perform a TCP port check to determine if a host is reachable
fn check_tcp_port(host: &str, port: i32, timeout_ms: u64) -> HealthCheckResult {
    let now = chrono::Utc::now().to_rfc3339();
    let addr_str = format!("{}:{}", host, port);
    
    debug!("Checking TCP port: {}", addr_str);
    
    let start = Instant::now();
    let timeout = Duration::from_millis(timeout_ms);
    
    // Resolve hostname to socket address
    let addr: SocketAddr = match addr_str.to_socket_addrs() {
        Ok(mut addrs) => match addrs.next() {
            Some(addr) => addr,
            None => {
                return HealthCheckResult {
                    entry_id: String::new(),
                    status: HealthStatus::Error,
                    response_time_ms: None,
                    error: Some("Could not resolve hostname".to_string()),
                    checked_at: now,
                    port: Some(port),
                    host: Some(host.to_string()),
                };
            }
        },
        Err(e) => {
            return HealthCheckResult {
                entry_id: String::new(),
                status: HealthStatus::Error,
                response_time_ms: None,
                error: Some(format!("DNS resolution failed: {}", e)),
                checked_at: now,
                port: Some(port),
                host: Some(host.to_string()),
            };
        }
    };
    
    match TcpStream::connect_timeout(&addr, timeout) {
        Ok(_) => {
            let elapsed = start.elapsed().as_millis() as u64;
            debug!("Host {} is online ({}ms)", addr_str, elapsed);
            HealthCheckResult {
                entry_id: String::new(), // Will be set by caller
                status: HealthStatus::Online,
                response_time_ms: Some(elapsed),
                error: None,
                checked_at: now,
                port: Some(port),
                host: Some(host.to_string()),
            }
        }
        Err(e) => {
            let error_msg = e.to_string();
            debug!("Host {} is offline: {}", addr_str, error_msg);
            
            // Determine if it's a connection refused (offline) or other error
            let status = if error_msg.contains("refused") || error_msg.contains("timed out") {
                HealthStatus::Offline
            } else {
                HealthStatus::Error
            };
            
            HealthCheckResult {
                entry_id: String::new(),
                status,
                response_time_ms: None,
                error: Some(error_msg),
                checked_at: now,
                port: Some(port),
                host: Some(host.to_string()),
            }
        }
    }
}

/// Check health of a single entry by ID
#[tauri::command]
pub async fn check_entry_health(
    token: String,
    entry_id: String,
    timeout_ms: Option<u64>,
) -> Result<HealthCheckResult, String> {
    let account_id = get_account_id(&token).await?;
    let pool = db::pool();
    
    // Fetch entry with ownership check
    let entry: EntryRow = sqlx::query_as(
        "SELECT * FROM entries WHERE id = ? AND account_id = ?"
    )
    .bind(&entry_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Entry not found".to_string())?;
    
    // Check if entry has host and port
    let host = entry.host.ok_or_else(|| "Entry has no host configured".to_string())?;
    let port = entry.port.unwrap_or(22); // Default to SSH port
    
    let timeout = timeout_ms.unwrap_or(5000);
    
    // Perform health check in blocking thread (TCP connect is blocking)
    let host_clone = host.clone();
    let mut result = tokio::task::spawn_blocking(move || {
        check_tcp_port(&host_clone, port, timeout)
    })
    .await
    .map_err(|e| e.to_string())?;
    
    result.entry_id = entry_id.clone();
    
    // Cache the result
    if let Ok(mut cache) = HEALTH_CACHE.lock() {
        cache.insert(entry_id, result.clone());
    }
    
    Ok(result)
}

/// Check health of multiple entries
#[tauri::command]
pub async fn check_entries_health(
    token: String,
    entry_ids: Option<Vec<String>>,
    timeout_ms: Option<u64>,
) -> Result<Vec<HealthCheckResult>, String> {
    let account_id = get_account_id(&token).await?;
    let pool = db::pool();
    
    // Fetch entries
    let entries: Vec<EntryRow> = if let Some(ids) = &entry_ids {
        if ids.is_empty() {
            return Ok(vec![]);
        }
        
        // Build query for specific IDs
        let placeholders: Vec<_> = ids.iter().map(|_| "?").collect();
        let query = format!(
            "SELECT * FROM entries WHERE account_id = ? AND id IN ({})",
            placeholders.join(", ")
        );
        
        let mut q = sqlx::query_as::<_, EntryRow>(&query).bind(&account_id);
        for id in ids {
            q = q.bind(id);
        }
        
        q.fetch_all(pool).await.map_err(|e| e.to_string())?
    } else {
        // Fetch all entries for user
        sqlx::query_as::<_, EntryRow>(
            "SELECT * FROM entries WHERE account_id = ?"
        )
        .bind(&account_id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?
    };
    
    let timeout = timeout_ms.unwrap_or(5000);
    
    // Check each entry in parallel using tokio tasks
    let mut handles = Vec::new();
    
    for entry in entries {
        let entry_id = entry.id.clone();
        let host = entry.host.clone();
        let port = entry.port.unwrap_or(22);
        
        let handle = tokio::spawn(async move {
            if let Some(h) = host {
                let h_clone = h.clone();
                let mut result = tokio::task::spawn_blocking(move || {
                    check_tcp_port(&h_clone, port, timeout)
                })
                .await
                .unwrap_or_else(|_| HealthCheckResult {
                    entry_id: String::new(),
                    status: HealthStatus::Error,
                    response_time_ms: None,
                    error: Some("Task panicked".to_string()),
                    checked_at: chrono::Utc::now().to_rfc3339(),
                    port: Some(port),
                    host: Some(h),
                });
                
                result.entry_id = entry_id;
                result
            } else {
                HealthCheckResult {
                    entry_id,
                    status: HealthStatus::Unknown,
                    response_time_ms: None,
                    error: Some("No host configured".to_string()),
                    checked_at: chrono::Utc::now().to_rfc3339(),
                    port: None,
                    host: None,
                }
            }
        });
        
        handles.push(handle);
    }
    
    // Collect results
    let mut results = Vec::new();
    for handle in handles {
        if let Ok(result) = handle.await {
            // Cache the result
            if let Ok(mut cache) = HEALTH_CACHE.lock() {
                cache.insert(result.entry_id.clone(), result.clone());
            }
            results.push(result);
        }
    }
    
    info!("Checked health of {} entries", results.len());
    Ok(results)
}

/// Get cached health status for entries (no network calls)
#[tauri::command]
pub async fn get_cached_health(
    token: String,
    entry_ids: Option<Vec<String>>,
) -> Result<Vec<HealthCheckResult>, String> {
    // Verify token is valid
    let _ = get_account_id(&token).await?;
    
    let cache = HEALTH_CACHE.lock().map_err(|e| e.to_string())?;
    
    let results: Vec<HealthCheckResult> = if let Some(ids) = entry_ids {
        ids.iter()
            .filter_map(|id| cache.get(id).cloned())
            .collect()
    } else {
        cache.values().cloned().collect()
    };
    
    Ok(results)
}

/// Get monitoring statistics
#[tauri::command]
pub async fn get_monitoring_stats(
    token: String,
) -> Result<MonitoringStats, String> {
    let account_id = get_account_id(&token).await?;
    let pool = db::pool();
    
    // Get total entry count
    let total: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM entries WHERE account_id = ?"
    )
    .bind(&account_id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    
    // Count statuses from cache
    let cache = HEALTH_CACHE.lock().map_err(|e| e.to_string())?;
    
    let mut online = 0u32;
    let mut offline = 0u32;
    let mut errors = 0u32;
    let mut checked_count = 0u32;
    
    for result in cache.values() {
        checked_count += 1;
        match result.status {
            HealthStatus::Online => online += 1,
            HealthStatus::Offline => offline += 1,
            HealthStatus::Error => errors += 1,
            _ => {}
        }
    }
    
    let unknown = (total.0 as u32).saturating_sub(checked_count);
    
    Ok(MonitoringStats {
        total: total.0 as u32,
        online,
        offline,
        errors,
        unknown,
        generated_at: chrono::Utc::now().to_rfc3339(),
    })
}

/// Clear health cache for specific entries or all
#[tauri::command]
pub async fn clear_health_cache(
    token: String,
    entry_ids: Option<Vec<String>>,
) -> Result<(), String> {
    // Verify token
    let _ = get_account_id(&token).await?;
    
    let mut cache = HEALTH_CACHE.lock().map_err(|e| e.to_string())?;
    
    if let Some(ids) = entry_ids {
        for id in ids {
            cache.remove(&id);
        }
    } else {
        cache.clear();
    }
    
    Ok(())
}

// ============================================================
// Server Resource Statistics API
// ============================================================

/// Helper to get credentials for an entry
async fn get_entry_credentials(entry: &EntryRow, account_id: &str) -> Result<(String, Option<String>, Option<String>, Option<String>), String> {
    let pool = db::pool();
    
    // Get identity linked to this entry
    let identity: Option<(String, Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
        r#"
        SELECT i.username, i.password_encrypted, i.ssh_key_encrypted, i.passphrase_encrypted
        FROM identities i
        JOIN entry_identities ei ON i.id = ei.identity_id
        WHERE ei.entry_id = ? AND i.account_id = ?
        ORDER BY ei.priority DESC
        LIMIT 1
        "#
    )
    .bind(&entry.id)
    .bind(account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    
    if let Some((username, password, ssh_key, passphrase)) = identity {
        Ok((username, password, ssh_key, passphrase))
    } else {
        Err("No credentials found for entry".to_string())
    }
}

/// Collect server stats for a single entry
#[tauri::command]
pub async fn collect_server_stats(
    token: String,
    entry_id: String,
) -> Result<ServerStats, String> {
    let account_id = get_account_id(&token).await?;
    let pool = db::pool();
    
    // Fetch entry
    let entry: EntryRow = sqlx::query_as(
        "SELECT * FROM entries WHERE id = ? AND account_id = ?"
    )
    .bind(&entry_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Entry not found".to_string())?;
    
    let host = entry.host.as_ref().ok_or("Entry has no host")?;
    let port = entry.port.unwrap_or(22) as u16;
    
    // Get credentials
    let (username, password, ssh_key, passphrase) = get_entry_credentials(&entry, &account_id).await?;
    
    // Execute stats collection command
    info!("Collecting stats for {} ({}:{})", entry.name, host, port);
    
    let output = execute_command(
        host,
        port,
        &username,
        password.as_deref(),
        ssh_key.as_deref(),
        passphrase.as_deref(),
        STATS_COLLECTION_SCRIPT,
        30, // 30 second timeout
    ).await?;
    
    // Parse output
    let raw_stats = parse_stats_output(&output);
    
    // Generate ID and timestamp
    let id = uuid::Uuid::new_v4().to_string();
    let collected_at = chrono::Utc::now().to_rfc3339();
    
    // Save to database
    sqlx::query(
        r#"
        INSERT INTO server_stats (
            id, account_id, entry_id,
            cpu_usage_percent, cpu_cores, load_avg_1, load_avg_5, load_avg_15,
            memory_total, memory_used, memory_free, memory_cached, swap_total, swap_used,
            disk_total, disk_used, disk_free, disk_path,
            net_rx_bytes, net_tx_bytes, net_interface,
            uptime_seconds, os_name, kernel_version, hostname,
            collected_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#
    )
    .bind(&id)
    .bind(&account_id)
    .bind(&entry_id)
    .bind(raw_stats.cpu_usage_percent)
    .bind(raw_stats.cpu_cores)
    .bind(raw_stats.load_avg_1)
    .bind(raw_stats.load_avg_5)
    .bind(raw_stats.load_avg_15)
    .bind(raw_stats.memory_total)
    .bind(raw_stats.memory_used)
    .bind(raw_stats.memory_free)
    .bind(raw_stats.memory_cached)
    .bind(raw_stats.swap_total)
    .bind(raw_stats.swap_used)
    .bind(raw_stats.disk_total)
    .bind(raw_stats.disk_used)
    .bind(raw_stats.disk_free)
    .bind(&raw_stats.disk_path)
    .bind(raw_stats.net_rx_bytes)
    .bind(raw_stats.net_tx_bytes)
    .bind(&raw_stats.net_interface)
    .bind(raw_stats.uptime_seconds)
    .bind(&raw_stats.os_name)
    .bind(&raw_stats.kernel_version)
    .bind(&raw_stats.hostname)
    .bind(&collected_at)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    
    info!("Stats collected for {} and saved", entry.name);
    
    // Convert to API response
    let row = ServerStatsRow {
        id,
        account_id,
        entry_id,
        cpu_usage_percent: raw_stats.cpu_usage_percent,
        cpu_cores: raw_stats.cpu_cores,
        load_avg_1: raw_stats.load_avg_1,
        load_avg_5: raw_stats.load_avg_5,
        load_avg_15: raw_stats.load_avg_15,
        memory_total: raw_stats.memory_total,
        memory_used: raw_stats.memory_used,
        memory_free: raw_stats.memory_free,
        memory_cached: raw_stats.memory_cached,
        swap_total: raw_stats.swap_total,
        swap_used: raw_stats.swap_used,
        disk_total: raw_stats.disk_total,
        disk_used: raw_stats.disk_used,
        disk_free: raw_stats.disk_free,
        disk_path: Some(raw_stats.disk_path),
        net_rx_bytes: raw_stats.net_rx_bytes,
        net_tx_bytes: raw_stats.net_tx_bytes,
        net_interface: Some(raw_stats.net_interface),
        uptime_seconds: raw_stats.uptime_seconds,
        os_name: raw_stats.os_name,
        kernel_version: raw_stats.kernel_version,
        hostname: raw_stats.hostname,
        collected_at,
    };
    
    Ok(ServerStats::from(row))
}

/// Get latest stats for an entry
#[tauri::command]
pub async fn get_latest_server_stats(
    token: String,
    entry_id: String,
) -> Result<Option<ServerStats>, String> {
    let account_id = get_account_id(&token).await?;
    let pool = db::pool();
    
    let row: Option<ServerStatsRow> = sqlx::query_as(
        r#"
        SELECT * FROM server_stats 
        WHERE entry_id = ? AND account_id = ?
        ORDER BY collected_at DESC
        LIMIT 1
        "#
    )
    .bind(&entry_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(row.map(ServerStats::from))
}

/// Get stats history for an entry
#[tauri::command]
pub async fn get_server_stats_history(
    token: String,
    entry_id: String,
    timeframe: Option<String>,
    limit: Option<i32>,
) -> Result<StatsHistory, String> {
    let account_id = get_account_id(&token).await?;
    let pool = db::pool();
    
    let timeframe_str = timeframe.clone().unwrap_or_else(|| "1h".to_string());
    let max_items = limit.unwrap_or(60).min(1000);
    
    // Calculate time threshold based on timeframe
    let hours = match timeframe_str.as_str() {
        "1h" => 1,
        "6h" => 6,
        "24h" => 24,
        _ => 1,
    };
    
    let threshold = chrono::Utc::now() - chrono::Duration::hours(hours);
    let threshold_str = threshold.to_rfc3339();
    
    let rows: Vec<ServerStatsRow> = sqlx::query_as(
        r#"
        SELECT * FROM server_stats 
        WHERE entry_id = ? AND account_id = ? AND collected_at >= ?
        ORDER BY collected_at ASC
        LIMIT ?
        "#
    )
    .bind(&entry_id)
    .bind(&account_id)
    .bind(&threshold_str)
    .bind(max_items)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(StatsHistory {
        entry_id,
        timeframe: timeframe_str,
        data_points: rows.into_iter().map(ServerStats::from).collect(),
    })
}

/// Delete old stats (retention cleanup)
#[tauri::command]
pub async fn cleanup_server_stats(
    token: String,
    retention_hours: Option<i32>,
) -> Result<u64, String> {
    let account_id = get_account_id(&token).await?;
    let pool = db::pool();
    
    let hours = retention_hours.unwrap_or(24);
    let threshold = chrono::Utc::now() - chrono::Duration::hours(hours.into());
    let threshold_str = threshold.to_rfc3339();
    
    let result = sqlx::query(
        "DELETE FROM server_stats WHERE account_id = ? AND collected_at < ?"
    )
    .bind(&account_id)
    .bind(&threshold_str)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    
    let deleted = result.rows_affected();
    info!("Cleaned up {} old stats records", deleted);
    
    Ok(deleted)
}
