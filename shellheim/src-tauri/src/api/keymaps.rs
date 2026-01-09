//! Keymaps API handlers
//!
//! Manages customizable keyboard shortcuts per user.

use crate::db;
use crate::models::{CreateKeymapRequest, DefaultKeymap, Keymap, UpdateKeymapRequest};
use sqlx::Row;
use tauri::command;
use tracing::info;
use uuid::Uuid;

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

/// Initialize default keymaps for a user (called on first access)
async fn ensure_default_keymaps(account_id: &str) -> Result<(), String> {
    let pool = db::pool();

    // Check if user has any keymaps
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM keymaps WHERE account_id = ?")
        .bind(account_id)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?;

    if count.0 > 0 {
        return Ok(()); // User already has keymaps
    }

    info!("Initializing default keymaps for account: {}", account_id);

    let now = chrono::Utc::now().to_rfc3339();
    let defaults = DefaultKeymap::defaults();

    for default in defaults {
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            r#"
            INSERT INTO keymaps (
                id, account_id, action, key, modifiers, description, enabled, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(account_id)
        .bind(&default.action)
        .bind(&default.key)
        .bind(&default.modifiers)
        .bind(&default.description)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to insert default keymap: {}", e))?;
    }

    info!("Default keymaps initialized for account: {}", account_id);
    Ok(())
}

/// List all keymaps for the authenticated user
#[command]
pub async fn list_keymaps(token: String) -> Result<Vec<Keymap>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Listing keymaps for account: {}", account_id);

    // Ensure defaults exist
    ensure_default_keymaps(&account_id).await?;

    let pool = db::pool();

    let keymaps: Vec<Keymap> = sqlx::query_as(
        r#"
        SELECT * FROM keymaps
        WHERE account_id = ?
        ORDER BY action ASC
        "#,
    )
    .bind(&account_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list keymaps: {}", e))?;

    info!("Found {} keymaps", keymaps.len());
    Ok(keymaps)
}

/// Get a single keymap by ID
#[command]
pub async fn get_keymap(token: String, keymap_id: String) -> Result<Keymap, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Getting keymap: {} for account: {}", keymap_id, account_id);

    let pool = db::pool();

    let keymap: Keymap = sqlx::query_as("SELECT * FROM keymaps WHERE id = ? AND account_id = ?")
        .bind(&keymap_id)
        .bind(&account_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .ok_or_else(|| "Keymap not found".to_string())?;

    Ok(keymap)
}

/// Create a new custom keymap
#[command]
pub async fn create_keymap(token: String, request: CreateKeymapRequest) -> Result<Keymap, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!(
        "Creating keymap: {} for account: {}",
        request.action, account_id
    );

    // Validate required fields
    if request.action.trim().is_empty() {
        return Err("Action is required".to_string());
    }
    if request.key.trim().is_empty() {
        return Err("Key is required".to_string());
    }

    let pool = db::pool();

    // Check for duplicate action
    let existing: Option<(String,)> =
        sqlx::query_as("SELECT id FROM keymaps WHERE account_id = ? AND action = ?")
            .bind(&account_id)
            .bind(&request.action)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Database error: {}", e))?;

    if existing.is_some() {
        return Err(format!(
            "Keymap for action '{}' already exists",
            request.action
        ));
    }

    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let description = request.description.unwrap_or_else(|| request.action.clone());

    sqlx::query(
        r#"
        INSERT INTO keymaps (
            id, account_id, action, key, modifiers, description, enabled, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&account_id)
    .bind(&request.action)
    .bind(&request.key)
    .bind(&request.modifiers)
    .bind(&description)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create keymap: {}", e))?;

    info!("Keymap created successfully: {}", id);

    Ok(Keymap {
        id,
        account_id,
        action: request.action,
        key: request.key,
        modifiers: request.modifiers,
        description,
        enabled: true,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// Update an existing keymap
#[command]
pub async fn update_keymap(
    token: String,
    keymap_id: String,
    request: UpdateKeymapRequest,
) -> Result<Keymap, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!(
        "Updating keymap: {} for account: {}",
        keymap_id, account_id
    );

    let pool = db::pool();

    // Verify keymap belongs to account
    let existing: Option<Keymap> =
        sqlx::query_as("SELECT * FROM keymaps WHERE id = ? AND account_id = ?")
            .bind(&keymap_id)
            .bind(&account_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Database error: {}", e))?;

    let keymap = existing.ok_or_else(|| "Keymap not found".to_string())?;

    let now = chrono::Utc::now().to_rfc3339();

    // Update fields
    let new_key = request.key.unwrap_or(keymap.key.clone());
    let new_modifiers = request.modifiers.unwrap_or(keymap.modifiers.clone());
    let new_enabled = request.enabled.unwrap_or(keymap.enabled);

    sqlx::query(
        r#"
        UPDATE keymaps SET
            key = ?, modifiers = ?, enabled = ?, updated_at = ?
        WHERE id = ? AND account_id = ?
        "#,
    )
    .bind(&new_key)
    .bind(&new_modifiers)
    .bind(new_enabled)
    .bind(&now)
    .bind(&keymap_id)
    .bind(&account_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to update keymap: {}", e))?;

    info!("Keymap updated successfully: {}", keymap_id);

    Ok(Keymap {
        id: keymap_id,
        account_id,
        action: keymap.action,
        key: new_key,
        modifiers: new_modifiers,
        description: keymap.description,
        enabled: new_enabled,
        created_at: keymap.created_at,
        updated_at: now,
    })
}

/// Delete a keymap (restores to default on next list)
#[command]
pub async fn delete_keymap(token: String, keymap_id: String) -> Result<(), String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!(
        "Deleting keymap: {} for account: {}",
        keymap_id, account_id
    );

    let pool = db::pool();

    let result = sqlx::query("DELETE FROM keymaps WHERE id = ? AND account_id = ?")
        .bind(&keymap_id)
        .bind(&account_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to delete keymap: {}", e))?;

    if result.rows_affected() == 0 {
        return Err("Keymap not found".to_string());
    }

    info!("Keymap deleted successfully: {}", keymap_id);
    Ok(())
}

/// Reset all keymaps to defaults
#[command]
pub async fn reset_keymaps_to_defaults(token: String) -> Result<Vec<Keymap>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Resetting keymaps to defaults for account: {}", account_id);

    let pool = db::pool();

    // Delete all existing keymaps
    sqlx::query("DELETE FROM keymaps WHERE account_id = ?")
        .bind(&account_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to delete keymaps: {}", e))?;

    // Re-initialize defaults
    ensure_default_keymaps(&account_id).await?;

    // Return the fresh list
    list_keymaps(token).await
}

/// Check for keymap conflicts
#[command]
pub async fn check_keymap_conflict(
    token: String,
    key: String,
    modifiers: String,
    exclude_id: Option<String>,
) -> Result<Option<Keymap>, String> {
    let account_id = get_account_id_from_token(&token).await?;

    let pool = db::pool();

    let keymap: Option<Keymap> = match exclude_id {
        Some(id) => {
            sqlx::query_as(
                r#"
                SELECT * FROM keymaps
                WHERE account_id = ? AND key = ? AND modifiers = ? AND id != ? AND enabled = 1
                "#,
            )
            .bind(&account_id)
            .bind(&key)
            .bind(&modifiers)
            .bind(&id)
            .fetch_optional(pool)
            .await
        }
        None => {
            sqlx::query_as(
                r#"
                SELECT * FROM keymaps
                WHERE account_id = ? AND key = ? AND modifiers = ? AND enabled = 1
                "#,
            )
            .bind(&account_id)
            .bind(&key)
            .bind(&modifiers)
            .fetch_optional(pool)
            .await
        }
    }
    .map_err(|e| format!("Database error: {}", e))?;

    Ok(keymap)
}

/// Get default keymaps (without saving)
#[command]
pub async fn get_default_keymaps() -> Result<Vec<DefaultKeymap>, String> {
    Ok(DefaultKeymap::defaults())
}
