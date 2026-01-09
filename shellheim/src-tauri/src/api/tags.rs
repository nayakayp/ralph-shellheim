//! Tags API handlers

use crate::db;
use crate::models::{CreateTagRequest, Tag, UpdateTagRequest};
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

/// List all tags for the authenticated user
#[command]
pub async fn list_tags(token: String) -> Result<Vec<Tag>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Listing tags for account: {}", account_id);

    let pool = db::pool();

    let tags: Vec<Tag> = sqlx::query_as(
        r#"
        SELECT id, account_id, name, color, created_at
        FROM tags
        WHERE account_id = ?
        ORDER BY name ASC
        "#,
    )
    .bind(&account_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list tags: {}", e))?;

    info!("Found {} tags", tags.len());
    Ok(tags)
}

/// Get a single tag by ID
#[command]
pub async fn get_tag(token: String, tag_id: String) -> Result<Tag, String> {
    let account_id = get_account_id_from_token(&token).await?;

    let pool = db::pool();

    let tag: Tag = sqlx::query_as(
        "SELECT id, account_id, name, color, created_at FROM tags WHERE id = ? AND account_id = ?",
    )
    .bind(&tag_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Tag not found".to_string())?;

    Ok(tag)
}

/// Create a new tag
#[command]
pub async fn create_tag(token: String, request: CreateTagRequest) -> Result<Tag, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Creating tag: {} for account: {}", request.name, account_id);

    if request.name.trim().is_empty() {
        return Err("Tag name is required".to_string());
    }

    let pool = db::pool();

    // Check for duplicate tag name
    let existing: Option<(i32,)> = sqlx::query_as(
        "SELECT 1 FROM tags WHERE account_id = ? AND LOWER(name) = LOWER(?)",
    )
    .bind(&account_id)
    .bind(&request.name)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    if existing.is_some() {
        return Err("Tag with this name already exists".to_string());
    }

    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        r#"
        INSERT INTO tags (id, account_id, name, color, created_at)
        VALUES (?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&account_id)
    .bind(&request.name)
    .bind(&request.color)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create tag: {}", e))?;

    info!("Tag created: {}", id);

    Ok(Tag {
        id,
        account_id,
        name: request.name,
        color: request.color,
        created_at: now,
    })
}

/// Update an existing tag
#[command]
pub async fn update_tag(
    token: String,
    tag_id: String,
    request: UpdateTagRequest,
) -> Result<Tag, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Updating tag: {} for account: {}", tag_id, account_id);

    let pool = db::pool();

    // Get existing tag
    let existing: Tag = sqlx::query_as(
        "SELECT id, account_id, name, color, created_at FROM tags WHERE id = ? AND account_id = ?",
    )
    .bind(&tag_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Tag not found".to_string())?;

    let new_name = request.name.unwrap_or(existing.name);
    let new_color = request.color.or(existing.color);

    // Check for duplicate name (excluding current tag)
    if let Some(ref name) = Some(&new_name) {
        let duplicate: Option<(i32,)> = sqlx::query_as(
            "SELECT 1 FROM tags WHERE account_id = ? AND LOWER(name) = LOWER(?) AND id != ?",
        )
        .bind(&account_id)
        .bind(name)
        .bind(&tag_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?;

        if duplicate.is_some() {
            return Err("Tag with this name already exists".to_string());
        }
    }

    sqlx::query(
        r#"
        UPDATE tags SET name = ?, color = ?
        WHERE id = ? AND account_id = ?
        "#,
    )
    .bind(&new_name)
    .bind(&new_color)
    .bind(&tag_id)
    .bind(&account_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to update tag: {}", e))?;

    info!("Tag updated: {}", tag_id);

    Ok(Tag {
        id: tag_id,
        account_id,
        name: new_name,
        color: new_color,
        created_at: existing.created_at,
    })
}

/// Delete a tag
#[command]
pub async fn delete_tag(token: String, tag_id: String) -> Result<(), String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Deleting tag: {} for account: {}", tag_id, account_id);

    let pool = db::pool();

    let result = sqlx::query("DELETE FROM tags WHERE id = ? AND account_id = ?")
        .bind(&tag_id)
        .bind(&account_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to delete tag: {}", e))?;

    if result.rows_affected() == 0 {
        return Err("Tag not found".to_string());
    }

    info!("Tag deleted: {}", tag_id);
    Ok(())
}

/// Add tags to an entry
#[command]
pub async fn add_entry_tags(
    token: String,
    entry_id: String,
    tag_ids: Vec<String>,
) -> Result<(), String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Adding {} tags to entry: {}", tag_ids.len(), entry_id);

    let pool = db::pool();

    // Verify entry belongs to account
    let entry_exists: Option<(i32,)> =
        sqlx::query_as("SELECT 1 FROM entries WHERE id = ? AND account_id = ?")
            .bind(&entry_id)
            .bind(&account_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Database error: {}", e))?;

    if entry_exists.is_none() {
        return Err("Entry not found".to_string());
    }

    // Insert tag links (ignore duplicates)
    for tag_id in &tag_ids {
        // Verify tag belongs to account
        let tag_exists: Option<(i32,)> =
            sqlx::query_as("SELECT 1 FROM tags WHERE id = ? AND account_id = ?")
                .bind(tag_id)
                .bind(&account_id)
                .fetch_optional(pool)
                .await
                .map_err(|e| format!("Database error: {}", e))?;

        if tag_exists.is_none() {
            continue; // Skip invalid tags
        }

        sqlx::query(
            "INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)",
        )
        .bind(&entry_id)
        .bind(tag_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to add tag: {}", e))?;
    }

    info!("Tags added to entry: {}", entry_id);
    Ok(())
}

/// Remove tags from an entry
#[command]
pub async fn remove_entry_tags(
    token: String,
    entry_id: String,
    tag_ids: Vec<String>,
) -> Result<(), String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Removing {} tags from entry: {}", tag_ids.len(), entry_id);

    let pool = db::pool();

    // Verify entry belongs to account
    let entry_exists: Option<(i32,)> =
        sqlx::query_as("SELECT 1 FROM entries WHERE id = ? AND account_id = ?")
            .bind(&entry_id)
            .bind(&account_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Database error: {}", e))?;

    if entry_exists.is_none() {
        return Err("Entry not found".to_string());
    }

    for tag_id in &tag_ids {
        sqlx::query("DELETE FROM entry_tags WHERE entry_id = ? AND tag_id = ?")
            .bind(&entry_id)
            .bind(tag_id)
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to remove tag: {}", e))?;
    }

    info!("Tags removed from entry: {}", entry_id);
    Ok(())
}

/// Set all tags for an entry (replace existing)
#[command]
pub async fn set_entry_tags(
    token: String,
    entry_id: String,
    tag_ids: Vec<String>,
) -> Result<(), String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Setting {} tags on entry: {}", tag_ids.len(), entry_id);

    let pool = db::pool();

    // Verify entry belongs to account
    let entry_exists: Option<(i32,)> =
        sqlx::query_as("SELECT 1 FROM entries WHERE id = ? AND account_id = ?")
            .bind(&entry_id)
            .bind(&account_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Database error: {}", e))?;

    if entry_exists.is_none() {
        return Err("Entry not found".to_string());
    }

    // Clear existing tags
    sqlx::query("DELETE FROM entry_tags WHERE entry_id = ?")
        .bind(&entry_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to clear tags: {}", e))?;

    // Add new tags
    for tag_id in &tag_ids {
        // Verify tag belongs to account
        let tag_exists: Option<(i32,)> =
            sqlx::query_as("SELECT 1 FROM tags WHERE id = ? AND account_id = ?")
                .bind(tag_id)
                .bind(&account_id)
                .fetch_optional(pool)
                .await
                .map_err(|e| format!("Database error: {}", e))?;

        if tag_exists.is_none() {
            continue;
        }

        sqlx::query("INSERT INTO entry_tags (entry_id, tag_id) VALUES (?, ?)")
            .bind(&entry_id)
            .bind(tag_id)
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to add tag: {}", e))?;
    }

    info!("Tags set on entry: {}", entry_id);
    Ok(())
}

/// Get tags for an entry
#[command]
pub async fn get_entry_tags(token: String, entry_id: String) -> Result<Vec<Tag>, String> {
    let account_id = get_account_id_from_token(&token).await?;

    let pool = db::pool();

    // Verify entry belongs to account
    let entry_exists: Option<(i32,)> =
        sqlx::query_as("SELECT 1 FROM entries WHERE id = ? AND account_id = ?")
            .bind(&entry_id)
            .bind(&account_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Database error: {}", e))?;

    if entry_exists.is_none() {
        return Err("Entry not found".to_string());
    }

    let tags: Vec<Tag> = sqlx::query_as(
        r#"
        SELECT t.id, t.account_id, t.name, t.color, t.created_at
        FROM tags t
        INNER JOIN entry_tags et ON t.id = et.tag_id
        WHERE et.entry_id = ?
        ORDER BY t.name ASC
        "#,
    )
    .bind(&entry_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to get entry tags: {}", e))?;

    Ok(tags)
}

/// List entries by tag
#[command]
pub async fn list_entries_by_tag(
    token: String,
    tag_id: String,
) -> Result<Vec<String>, String> {
    let account_id = get_account_id_from_token(&token).await?;

    let pool = db::pool();

    // Verify tag belongs to account
    let tag_exists: Option<(i32,)> =
        sqlx::query_as("SELECT 1 FROM tags WHERE id = ? AND account_id = ?")
            .bind(&tag_id)
            .bind(&account_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Database error: {}", e))?;

    if tag_exists.is_none() {
        return Err("Tag not found".to_string());
    }

    let entry_ids: Vec<(String,)> = sqlx::query_as(
        r#"
        SELECT e.id
        FROM entries e
        INNER JOIN entry_tags et ON e.id = et.entry_id
        WHERE et.tag_id = ? AND e.account_id = ?
        ORDER BY e.name ASC
        "#,
    )
    .bind(&tag_id)
    .bind(&account_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list entries by tag: {}", e))?;

    Ok(entry_ids.into_iter().map(|r| r.0).collect())
}

/// Get tag usage counts (number of entries per tag)
#[command]
pub async fn get_tag_counts(token: String) -> Result<Vec<(String, i32)>, String> {
    let account_id = get_account_id_from_token(&token).await?;

    let pool = db::pool();

    let counts: Vec<(String, i32)> = sqlx::query_as(
        r#"
        SELECT t.id, COALESCE(COUNT(et.entry_id), 0) as count
        FROM tags t
        LEFT JOIN entry_tags et ON t.id = et.tag_id
        WHERE t.account_id = ?
        GROUP BY t.id
        "#,
    )
    .bind(&account_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to get tag counts: {}", e))?;

    Ok(counts)
}
