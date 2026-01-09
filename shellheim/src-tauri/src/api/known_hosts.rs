//! Known hosts API handlers

use crate::db;
use crate::models::{HostKeyStatus, KnownHost, KnownHostRow, TrustHostKeyRequest};
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

/// List all known hosts for current user
#[command]
pub async fn list_known_hosts(token: String) -> Result<Vec<KnownHost>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    let pool = db::pool();

    let rows: Vec<KnownHostRow> = sqlx::query_as(
        "SELECT * FROM known_hosts WHERE account_id = ? ORDER BY host, port",
    )
    .bind(&account_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to fetch known hosts: {}", e))?;

    Ok(rows.into_iter().map(KnownHost::from).collect())
}

/// Check if a host key is known/trusted
#[command]
pub async fn check_host_key(
    token: String,
    host: String,
    port: i32,
    key_type: String,
    fingerprint: String,
) -> Result<HostKeyStatus, String> {
    let account_id = get_account_id_from_token(&token).await?;
    let pool = db::pool();

    // Look up existing known host
    let existing: Option<KnownHostRow> = sqlx::query_as(
        "SELECT * FROM known_hosts WHERE account_id = ? AND host = ? AND port = ?",
    )
    .bind(&account_id)
    .bind(&host)
    .bind(port)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    match existing {
        Some(known) => {
            if known.fingerprint == fingerprint {
                // Key matches - update last_seen_at
                let now = chrono::Utc::now().to_rfc3339();
                let _ = sqlx::query(
                    "UPDATE known_hosts SET last_seen_at = ? WHERE id = ?",
                )
                .bind(&now)
                .bind(&known.id)
                .execute(pool)
                .await;

                Ok(HostKeyStatus::Known)
            } else {
                // Key changed - potential MITM!
                Ok(HostKeyStatus::Changed {
                    key_type,
                    new_fingerprint: fingerprint,
                    old_fingerprint: known.fingerprint,
                })
            }
        }
        None => {
            // Unknown host
            Ok(HostKeyStatus::Unknown {
                key_type,
                fingerprint,
            })
        }
    }
}

/// Trust/add a host key to known_hosts
#[command]
pub async fn trust_host_key(
    token: String,
    request: TrustHostKeyRequest,
) -> Result<KnownHost, String> {
    let account_id = get_account_id_from_token(&token).await?;
    let pool = db::pool();
    let now = chrono::Utc::now().to_rfc3339();

    if request.replace {
        // Delete existing entry first
        let _ = sqlx::query(
            "DELETE FROM known_hosts WHERE account_id = ? AND host = ? AND port = ?",
        )
        .bind(&account_id)
        .bind(&request.host)
        .bind(request.port)
        .execute(pool)
        .await;
    }

    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        r#"
        INSERT INTO known_hosts (id, account_id, host, port, key_type, fingerprint, public_key_base64, added_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&account_id)
    .bind(&request.host)
    .bind(request.port)
    .bind(&request.key_type)
    .bind(&request.fingerprint)
    .bind(&request.public_key_base64)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to add known host: {}", e))?;

    info!(
        "Added known host: {}:{} ({}) - {}",
        request.host, request.port, request.key_type, request.fingerprint
    );

    Ok(KnownHost {
        id,
        host: request.host,
        port: request.port,
        key_type: request.key_type,
        fingerprint: request.fingerprint,
        added_at: now.clone(),
        last_seen_at: now,
    })
}

/// Delete a known host entry
#[command]
pub async fn delete_known_host(token: String, id: String) -> Result<(), String> {
    let account_id = get_account_id_from_token(&token).await?;
    let pool = db::pool();

    let result = sqlx::query(
        "DELETE FROM known_hosts WHERE id = ? AND account_id = ?",
    )
    .bind(&id)
    .bind(&account_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    if result.rows_affected() == 0 {
        return Err("Known host not found".to_string());
    }

    info!("Deleted known host: {}", id);
    Ok(())
}

/// Internal function to check host key during SSH connection
/// Returns (is_known, fingerprint, key_type, public_key_base64)
pub async fn lookup_known_host(
    account_id: &str,
    host: &str,
    port: u16,
) -> Result<Option<(String, String)>, String> {
    let pool = db::pool();

    let existing: Option<KnownHostRow> = sqlx::query_as(
        "SELECT * FROM known_hosts WHERE account_id = ? AND host = ? AND port = ?",
    )
    .bind(account_id)
    .bind(host)
    .bind(port as i32)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    Ok(existing.map(|k| (k.fingerprint, k.public_key_base64)))
}
