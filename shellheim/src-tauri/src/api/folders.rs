//! Folders API handlers

use crate::db;
use crate::models::{CreateFolderRequest, Folder, UpdateFolderRequest};
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

#[command]
pub async fn list_folders(token: String) -> Result<Vec<Folder>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Listing folders for account: {}", account_id);
    
    let pool = db::pool();
    
    let folders: Vec<Folder> = sqlx::query_as(
        r#"
        SELECT * FROM folders
        WHERE account_id = ?
        ORDER BY sort_order ASC, name ASC
        "#,
    )
    .bind(&account_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list folders: {}", e))?;
    
    info!("Found {} folders", folders.len());
    Ok(folders)
}

#[command]
pub async fn get_folder(token: String, folder_id: String) -> Result<Folder, String> {
    let account_id = get_account_id_from_token(&token).await?;
    
    let pool = db::pool();
    
    let folder: Folder = sqlx::query_as(
        "SELECT * FROM folders WHERE id = ? AND account_id = ?"
    )
    .bind(&folder_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Folder not found".to_string())?;
    
    Ok(folder)
}

#[command]
pub async fn create_folder(token: String, request: CreateFolderRequest) -> Result<Folder, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Creating folder: {} for account: {}", request.name, account_id);
    
    // Validate name
    if request.name.trim().is_empty() {
        return Err("Folder name is required".to_string());
    }
    
    let pool = db::pool();
    
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    
    // Get max sort_order for this parent
    let max_order: (i32,) = sqlx::query_as(
        r#"
        SELECT COALESCE(MAX(sort_order), 0) FROM folders
        WHERE account_id = ? AND parent_id IS ?
        "#,
    )
    .bind(&account_id)
    .bind(&request.parent_id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Failed to get sort order: {}", e))?;
    
    let sort_order = max_order.0 + 1;
    
    // Validate parent exists if specified
    if let Some(ref parent_id) = request.parent_id {
        let parent_exists: Option<(i32,)> = sqlx::query_as(
            "SELECT 1 FROM folders WHERE id = ? AND account_id = ?"
        )
        .bind(parent_id)
        .bind(&account_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?;
        
        if parent_exists.is_none() {
            return Err("Parent folder not found".to_string());
        }
    }
    
    sqlx::query(
        r#"
        INSERT INTO folders (
            id, account_id, parent_id, name, icon, color, sort_order, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&account_id)
    .bind(&request.parent_id)
    .bind(&request.name)
    .bind(&request.icon)
    .bind(&request.color)
    .bind(sort_order)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create folder: {}", e))?;
    
    info!("Folder created successfully: {}", id);
    
    Ok(Folder {
        id,
        account_id,
        parent_id: request.parent_id,
        name: request.name,
        icon: request.icon,
        color: request.color,
        sort_order,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[command]
pub async fn update_folder(
    token: String,
    folder_id: String,
    request: UpdateFolderRequest,
) -> Result<Folder, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Updating folder: {} for account: {}", folder_id, account_id);
    
    let pool = db::pool();
    
    // Verify folder belongs to account
    let existing: Option<Folder> = sqlx::query_as(
        "SELECT * FROM folders WHERE id = ? AND account_id = ?"
    )
    .bind(&folder_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;
    
    let folder = existing.ok_or_else(|| "Folder not found".to_string())?;
    
    // Prevent folder from being its own parent
    if let Some(ref new_parent) = request.parent_id {
        if new_parent == &folder_id {
            return Err("Folder cannot be its own parent".to_string());
        }
    }
    
    let now = chrono::Utc::now().to_rfc3339();
    
    let new_name = request.name.unwrap_or(folder.name.clone());
    let new_parent_id = request.parent_id.or(folder.parent_id.clone());
    let new_icon = request.icon.or(folder.icon.clone());
    let new_color = request.color.or(folder.color.clone());
    let new_sort_order = request.sort_order.unwrap_or(folder.sort_order);
    
    sqlx::query(
        r#"
        UPDATE folders SET
            parent_id = ?, name = ?, icon = ?, color = ?, sort_order = ?, updated_at = ?
        WHERE id = ? AND account_id = ?
        "#,
    )
    .bind(&new_parent_id)
    .bind(&new_name)
    .bind(&new_icon)
    .bind(&new_color)
    .bind(new_sort_order)
    .bind(&now)
    .bind(&folder_id)
    .bind(&account_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to update folder: {}", e))?;
    
    info!("Folder updated successfully: {}", folder_id);
    
    Ok(Folder {
        id: folder_id,
        account_id,
        parent_id: new_parent_id,
        name: new_name,
        icon: new_icon,
        color: new_color,
        sort_order: new_sort_order,
        created_at: folder.created_at,
        updated_at: now,
    })
}

#[command]
pub async fn delete_folder(token: String, folder_id: String) -> Result<(), String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Deleting folder: {} for account: {}", folder_id, account_id);
    
    let pool = db::pool();
    
    // Check for child folders
    let has_children: Option<(i32,)> = sqlx::query_as(
        "SELECT 1 FROM folders WHERE parent_id = ? AND account_id = ? LIMIT 1"
    )
    .bind(&folder_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;
    
    if has_children.is_some() {
        return Err("Cannot delete folder with subfolders".to_string());
    }
    
    // Check for entries in folder
    let has_entries: Option<(i32,)> = sqlx::query_as(
        "SELECT 1 FROM entries WHERE folder_id = ? AND account_id = ? LIMIT 1"
    )
    .bind(&folder_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;
    
    if has_entries.is_some() {
        return Err("Cannot delete folder with servers. Move servers first.".to_string());
    }
    
    let result = sqlx::query(
        "DELETE FROM folders WHERE id = ? AND account_id = ?"
    )
    .bind(&folder_id)
    .bind(&account_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to delete folder: {}", e))?;
    
    if result.rows_affected() == 0 {
        return Err("Folder not found".to_string());
    }
    
    info!("Folder deleted successfully: {}", folder_id);
    Ok(())
}

/// Get entry count for each folder
#[command]
pub async fn get_folder_counts(token: String) -> Result<Vec<(String, i32)>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    
    let pool = db::pool();
    
    let counts: Vec<(String, i32)> = sqlx::query_as(
        r#"
        SELECT folder_id, COUNT(*) as count FROM entries
        WHERE account_id = ? AND folder_id IS NOT NULL
        GROUP BY folder_id
        "#,
    )
    .bind(&account_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to get folder counts: {}", e))?;
    
    Ok(counts)
}
