//! Audit log API handlers

use crate::db;
use crate::models::{
    AuditLog, AuditLogFilter, AuditLogInfo, AuditAction, CreateAuditLog, ResourceType,
};
use sqlx::Row;
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

/// Create an audit log entry (internal function, not a command)
pub async fn create_audit_log(log: CreateAuditLog) -> Result<(), String> {
    let pool = db::pool();
    let id = uuid::Uuid::new_v4().to_string();
    let details_json = log.details.map(|d| d.to_string());
    
    sqlx::query(
        r#"
        INSERT INTO audit_logs 
        (id, account_id, action, resource_type, resource_id, resource_name, details)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&log.account_id)
    .bind(log.action.to_string())
    .bind(log.resource_type.map(|r| r.to_string()))
    .bind(&log.resource_id)
    .bind(&log.resource_name)
    .bind(&details_json)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create audit log: {}", e))?;

    Ok(())
}

/// Log an action (convenience wrapper)
pub async fn log_action(
    account_id: &str,
    action: AuditAction,
    resource_type: Option<ResourceType>,
    resource_id: Option<&str>,
    resource_name: Option<&str>,
    details: Option<serde_json::Value>,
) {
    let log = CreateAuditLog {
        account_id: account_id.to_string(),
        action,
        resource_type,
        resource_id: resource_id.map(|s| s.to_string()),
        resource_name: resource_name.map(|s| s.to_string()),
        details,
    };
    
    if let Err(e) = create_audit_log(log).await {
        tracing::warn!("Failed to create audit log: {}", e);
    }
}

/// List audit logs for current user
#[command]
pub async fn list_audit_logs(
    token: String,
    filter: Option<AuditLogFilter>,
) -> Result<Vec<AuditLogInfo>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    let pool = db::pool();
    let filter = filter.unwrap_or_default();

    // Build query with filters
    let mut query = String::from(
        "SELECT * FROM audit_logs WHERE account_id = ?"
    );
    let mut bindings: Vec<String> = vec![account_id.clone()];

    if let Some(action) = &filter.action {
        query.push_str(" AND action = ?");
        bindings.push(action.clone());
    }

    if let Some(resource_type) = &filter.resource_type {
        query.push_str(" AND resource_type = ?");
        bindings.push(resource_type.clone());
    }

    if let Some(resource_id) = &filter.resource_id {
        query.push_str(" AND resource_id = ?");
        bindings.push(resource_id.clone());
    }

    if let Some(from_date) = &filter.from_date {
        query.push_str(" AND created_at >= ?");
        bindings.push(from_date.clone());
    }

    if let Some(to_date) = &filter.to_date {
        query.push_str(" AND created_at <= ?");
        bindings.push(to_date.clone());
    }

    query.push_str(" ORDER BY created_at DESC");

    let limit = filter.limit.unwrap_or(100).min(500);
    let offset = filter.offset.unwrap_or(0);
    query.push_str(&format!(" LIMIT {} OFFSET {}", limit, offset));

    // Execute query with bindings
    let mut q = sqlx::query_as::<_, AuditLog>(&query);
    for binding in bindings {
        q = q.bind(binding);
    }

    let logs = q
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?;

    Ok(logs.into_iter().map(Into::into).collect())
}

/// Get audit log count for current user
#[command]
pub async fn get_audit_log_count(
    token: String,
    filter: Option<AuditLogFilter>,
) -> Result<i64, String> {
    let account_id = get_account_id_from_token(&token).await?;
    let pool = db::pool();
    let filter = filter.unwrap_or_default();

    // Build count query with filters
    let mut query = String::from(
        "SELECT COUNT(*) as count FROM audit_logs WHERE account_id = ?"
    );
    let mut bindings: Vec<String> = vec![account_id.clone()];

    if let Some(action) = &filter.action {
        query.push_str(" AND action = ?");
        bindings.push(action.clone());
    }

    if let Some(resource_type) = &filter.resource_type {
        query.push_str(" AND resource_type = ?");
        bindings.push(resource_type.clone());
    }

    if let Some(from_date) = &filter.from_date {
        query.push_str(" AND created_at >= ?");
        bindings.push(from_date.clone());
    }

    if let Some(to_date) = &filter.to_date {
        query.push_str(" AND created_at <= ?");
        bindings.push(to_date.clone());
    }

    // Execute query
    let mut q = sqlx::query(&query);
    for binding in bindings {
        q = q.bind(binding);
    }

    let row = q
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?;

    Ok(row.get::<i64, _>("count"))
}

/// Get distinct action types from audit logs
#[command]
pub async fn get_audit_action_types(token: String) -> Result<Vec<String>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    let pool = db::pool();

    let rows = sqlx::query(
        "SELECT DISTINCT action FROM audit_logs WHERE account_id = ? ORDER BY action"
    )
    .bind(&account_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    Ok(rows.iter().map(|r| r.get::<String, _>("action")).collect())
}

/// Delete old audit logs (retention policy)
#[command]
pub async fn delete_old_audit_logs(
    token: String,
    days_to_keep: i32,
) -> Result<i64, String> {
    let account_id = get_account_id_from_token(&token).await?;
    let pool = db::pool();

    if days_to_keep < 1 {
        return Err("days_to_keep must be at least 1".to_string());
    }

    let result = sqlx::query(
        &format!(
            "DELETE FROM audit_logs WHERE account_id = ? AND created_at < datetime('now', '-{} days')",
            days_to_keep
        )
    )
    .bind(&account_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    let deleted = result.rows_affected() as i64;
    info!("Deleted {} old audit logs for account {}", deleted, account_id);
    
    Ok(deleted)
}

/// Clear all audit logs for current user
#[command]
pub async fn clear_audit_logs(token: String) -> Result<i64, String> {
    let account_id = get_account_id_from_token(&token).await?;
    let pool = db::pool();

    let result = sqlx::query("DELETE FROM audit_logs WHERE account_id = ?")
        .bind(&account_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?;

    let deleted = result.rows_affected() as i64;
    info!("Cleared {} audit logs for account {}", deleted, account_id);
    
    Ok(deleted)
}
