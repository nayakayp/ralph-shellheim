//! Entries (servers/connections) API handlers

use crate::db;
use crate::models::{CreateEntryRequest, Entry, EntryRow, UpdateEntryRequest};
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

/// Helper to fetch identity_ids for an entry
async fn get_identity_ids_for_entry(entry_id: &str) -> Result<Vec<String>, String> {
    let pool = db::pool();
    
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT identity_id FROM entry_identities WHERE entry_id = ? ORDER BY priority ASC"
    )
    .bind(entry_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to fetch identities: {}", e))?;
    
    Ok(rows.into_iter().map(|r| r.0).collect())
}

/// Helper to sync identity_ids for an entry
async fn sync_entry_identities(entry_id: &str, identity_ids: &[String]) -> Result<(), String> {
    let pool = db::pool();
    
    // Delete existing links
    sqlx::query("DELETE FROM entry_identities WHERE entry_id = ?")
        .bind(entry_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to clear identities: {}", e))?;
    
    // Insert new links
    for (priority, identity_id) in identity_ids.iter().enumerate() {
        sqlx::query(
            "INSERT INTO entry_identities (entry_id, identity_id, priority) VALUES (?, ?, ?)"
        )
        .bind(entry_id)
        .bind(identity_id)
        .bind(priority as i32)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to link identity: {}", e))?;
    }
    
    Ok(())
}

/// Helper to sync tag_ids for an entry
async fn sync_entry_tags(entry_id: &str, tag_ids: &[String], account_id: &str) -> Result<(), String> {
    let pool = db::pool();
    
    // Delete existing links
    sqlx::query("DELETE FROM entry_tags WHERE entry_id = ?")
        .bind(entry_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to clear tags: {}", e))?;
    
    // Insert new links (only for tags owned by this account)
    for tag_id in tag_ids {
        // Verify tag belongs to account
        let tag_exists: Option<(i32,)> =
            sqlx::query_as("SELECT 1 FROM tags WHERE id = ? AND account_id = ?")
                .bind(tag_id)
                .bind(account_id)
                .fetch_optional(pool)
                .await
                .map_err(|e| format!("Database error: {}", e))?;
        
        if tag_exists.is_none() {
            continue;
        }
        
        sqlx::query("INSERT INTO entry_tags (entry_id, tag_id) VALUES (?, ?)")
            .bind(entry_id)
            .bind(tag_id)
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to link tag: {}", e))?;
    }
    
    Ok(())
}

#[command]
pub async fn list_entries(token: String, folder_id: Option<String>) -> Result<Vec<Entry>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Listing entries for account: {}, folder: {:?}", account_id, folder_id);
    
    let pool = db::pool();
    
    let rows: Vec<EntryRow> = match folder_id {
        Some(fid) => {
            sqlx::query_as(
                r#"
                SELECT * FROM entries
                WHERE account_id = ? AND folder_id = ?
                ORDER BY sort_order ASC, name ASC
                "#,
            )
            .bind(&account_id)
            .bind(&fid)
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to list entries: {}", e))?
        }
        None => {
            sqlx::query_as(
                r#"
                SELECT * FROM entries
                WHERE account_id = ?
                ORDER BY sort_order ASC, name ASC
                "#,
            )
            .bind(&account_id)
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to list entries: {}", e))?
        }
    };
    
    // Fetch identity_ids for each entry
    let mut entries = Vec::with_capacity(rows.len());
    for row in rows {
        let identity_ids = get_identity_ids_for_entry(&row.id).await?;
        entries.push(row.with_identities(identity_ids));
    }
    
    info!("Found {} entries", entries.len());
    Ok(entries)
}

#[command]
pub async fn create_entry(token: String, request: CreateEntryRequest) -> Result<Entry, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Creating entry: {} for account: {}", request.name, account_id);
    
    // Validate required fields
    if request.name.trim().is_empty() {
        return Err("Name is required".to_string());
    }
    
    let pool = db::pool();
    
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let entry_type = request.entry_type.unwrap_or_else(|| "server".to_string());
    let protocol = request.protocol.clone().unwrap_or_else(|| "ssh".to_string());
    let port = request.port.unwrap_or(22);
    
    // Get max sort_order for this folder
    let max_order: (i32,) = sqlx::query_as(
        r#"
        SELECT COALESCE(MAX(sort_order), 0) FROM entries
        WHERE account_id = ? AND folder_id IS ?
        "#,
    )
    .bind(&account_id)
    .bind(&request.folder_id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Failed to get sort order: {}", e))?;
    
    let sort_order = max_order.0 + 1;
    
    sqlx::query(
        r#"
        INSERT INTO entries (
            id, account_id, folder_id, entry_type, name, host, port, protocol,
            description, icon, color, sort_order, jump_host_id, mac_address, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&account_id)
    .bind(&request.folder_id)
    .bind(&entry_type)
    .bind(&request.name)
    .bind(&request.host)
    .bind(port)
    .bind(&protocol)
    .bind(&request.description)
    .bind(&request.icon)
    .bind(&request.color)
    .bind(sort_order)
    .bind(&request.jump_host_id)
    .bind(&request.mac_address)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create entry: {}", e))?;
    
    // Link identities if provided
    let identity_ids = request.identity_ids.clone().unwrap_or_default();
    if !identity_ids.is_empty() {
        sync_entry_identities(&id, &identity_ids).await?;
    }
    
    // Link tags if provided
    let tag_ids = request.tag_ids.clone().unwrap_or_default();
    if !tag_ids.is_empty() {
        sync_entry_tags(&id, &tag_ids, &account_id).await?;
    }
    
    info!("Entry created successfully: {}", id);
    
    Ok(Entry {
        id,
        account_id,
        folder_id: request.folder_id,
        integration_id: None,
        entry_type,
        name: request.name,
        host: request.host,
        port: Some(port),
        protocol: Some(protocol),
        description: request.description,
        icon: request.icon,
        color: request.color,
        sort_order,
        last_connected_at: None,
        pve_node: None,
        pve_vmid: None,
        jump_host_id: request.jump_host_id,
        mac_address: request.mac_address,
        created_at: now.clone(),
        updated_at: now,
        identity_ids,
    })
}

#[command]
pub async fn update_entry(
    token: String,
    entry_id: String,
    request: UpdateEntryRequest,
) -> Result<Entry, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Updating entry: {} for account: {}", entry_id, account_id);
    
    let pool = db::pool();
    
    // Verify entry belongs to account
    let existing: Option<EntryRow> = sqlx::query_as(
        "SELECT * FROM entries WHERE id = ? AND account_id = ?"
    )
    .bind(&entry_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;
    
    let entry = existing.ok_or_else(|| "Entry not found".to_string())?;
    
    let now = chrono::Utc::now().to_rfc3339();
    
    // Build update query dynamically
    let new_name = request.name.unwrap_or(entry.name.clone());
    let new_host = request.host.or(entry.host.clone());
    let new_port = request.port.or(entry.port);
    let new_protocol = request.protocol.or(entry.protocol.clone());
    let new_description = request.description.or(entry.description.clone());
    let new_icon = request.icon.or(entry.icon.clone());
    let new_color = request.color.or(entry.color.clone());
    let new_folder_id = request.folder_id.or(entry.folder_id.clone());
    let new_sort_order = request.sort_order.unwrap_or(entry.sort_order);
    let new_jump_host_id = if request.jump_host_id.is_some() {
        request.jump_host_id.clone()
    } else {
        entry.jump_host_id.clone()
    };
    let new_mac_address = if request.mac_address.is_some() {
        request.mac_address.clone()
    } else {
        entry.mac_address.clone()
    };
    
    sqlx::query(
        r#"
        UPDATE entries SET
            folder_id = ?, name = ?, host = ?, port = ?, protocol = ?,
            description = ?, icon = ?, color = ?, sort_order = ?, jump_host_id = ?, mac_address = ?, updated_at = ?
        WHERE id = ? AND account_id = ?
        "#,
    )
    .bind(&new_folder_id)
    .bind(&new_name)
    .bind(&new_host)
    .bind(new_port)
    .bind(&new_protocol)
    .bind(&new_description)
    .bind(&new_icon)
    .bind(&new_color)
    .bind(new_sort_order)
    .bind(&new_jump_host_id)
    .bind(&new_mac_address)
    .bind(&now)
    .bind(&entry_id)
    .bind(&account_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to update entry: {}", e))?;
    
    // Update identities if provided
    let identity_ids = if let Some(ids) = request.identity_ids {
        sync_entry_identities(&entry_id, &ids).await?;
        ids
    } else {
        get_identity_ids_for_entry(&entry_id).await?
    };
    
    // Update tags if provided
    if let Some(tag_ids) = request.tag_ids {
        sync_entry_tags(&entry_id, &tag_ids, &account_id).await?;
    }
    
    info!("Entry updated successfully: {}", entry_id);
    
    Ok(Entry {
        id: entry_id,
        account_id,
        folder_id: new_folder_id,
        integration_id: entry.integration_id,
        entry_type: entry.entry_type,
        name: new_name,
        host: new_host,
        port: new_port,
        protocol: new_protocol,
        description: new_description,
        icon: new_icon,
        color: new_color,
        sort_order: new_sort_order,
        last_connected_at: entry.last_connected_at,
        pve_node: entry.pve_node,
        pve_vmid: entry.pve_vmid,
        jump_host_id: new_jump_host_id,
        mac_address: new_mac_address,
        created_at: entry.created_at,
        updated_at: now,
        identity_ids,
    })
}

#[command]
pub async fn delete_entry(token: String, entry_id: String) -> Result<(), String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Deleting entry: {} for account: {}", entry_id, account_id);
    
    let pool = db::pool();
    
    let result = sqlx::query(
        "DELETE FROM entries WHERE id = ? AND account_id = ?"
    )
    .bind(&entry_id)
    .bind(&account_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to delete entry: {}", e))?;
    
    if result.rows_affected() == 0 {
        return Err("Entry not found".to_string());
    }
    
    info!("Entry deleted successfully: {}", entry_id);
    Ok(())
}

/// Get a single entry by ID
#[command]
pub async fn get_entry(token: String, entry_id: String) -> Result<Entry, String> {
    let account_id = get_account_id_from_token(&token).await?;
    
    let pool = db::pool();
    
    let row: EntryRow = sqlx::query_as(
        "SELECT * FROM entries WHERE id = ? AND account_id = ?"
    )
    .bind(&entry_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Entry not found".to_string())?;
    
    let identity_ids = get_identity_ids_for_entry(&entry_id).await?;
    
    Ok(row.with_identities(identity_ids))
}

/// Reorder entries (batch update sort_order values)
#[command]
pub async fn reorder_entries(
    token: String,
    entry_ids: Vec<String>,
    folder_id: Option<String>,
) -> Result<(), String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Reordering {} entries for account: {}", entry_ids.len(), account_id);
    
    let pool = db::pool();
    
    // Update sort_order for each entry
    for (index, entry_id) in entry_ids.iter().enumerate() {
        let result = sqlx::query(
            r#"
            UPDATE entries SET sort_order = ?, folder_id = ?, updated_at = ?
            WHERE id = ? AND account_id = ?
            "#,
        )
        .bind(index as i32)
        .bind(&folder_id)
        .bind(chrono::Utc::now().to_rfc3339())
        .bind(entry_id)
        .bind(&account_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to update entry order: {}", e))?;
        
        if result.rows_affected() == 0 {
            return Err(format!("Entry not found: {}", entry_id));
        }
    }
    
    info!("Entries reordered successfully");
    Ok(())
}

/// Move an entry to a new folder
#[command]
pub async fn move_entry(
    token: String,
    entry_id: String,
    folder_id: Option<String>,
) -> Result<Entry, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Moving entry {} to folder {:?}", entry_id, folder_id);
    
    let pool = db::pool();
    
    // Verify entry exists and belongs to account
    let existing: Option<EntryRow> = sqlx::query_as(
        "SELECT * FROM entries WHERE id = ? AND account_id = ?"
    )
    .bind(&entry_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;
    
    let entry = existing.ok_or_else(|| "Entry not found".to_string())?;
    
    // If target folder specified, verify it exists
    if let Some(ref fid) = folder_id {
        let folder_exists: Option<(i32,)> = sqlx::query_as(
            "SELECT 1 FROM folders WHERE id = ? AND account_id = ?"
        )
        .bind(fid)
        .bind(&account_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?;
        
        if folder_exists.is_none() {
            return Err("Target folder not found".to_string());
        }
    }
    
    // Get max sort_order in target folder
    let max_order: (i32,) = sqlx::query_as(
        r#"
        SELECT COALESCE(MAX(sort_order), 0) FROM entries
        WHERE account_id = ? AND folder_id IS ?
        "#,
    )
    .bind(&account_id)
    .bind(&folder_id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Failed to get sort order: {}", e))?;
    
    let new_sort_order = max_order.0 + 1;
    let now = chrono::Utc::now().to_rfc3339();
    
    sqlx::query(
        r#"
        UPDATE entries SET folder_id = ?, sort_order = ?, updated_at = ?
        WHERE id = ? AND account_id = ?
        "#,
    )
    .bind(&folder_id)
    .bind(new_sort_order)
    .bind(&now)
    .bind(&entry_id)
    .bind(&account_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to move entry: {}", e))?;
    
    let identity_ids = get_identity_ids_for_entry(&entry_id).await?;
    
    Ok(Entry {
        id: entry_id,
        account_id,
        folder_id,
        integration_id: entry.integration_id,
        entry_type: entry.entry_type,
        name: entry.name,
        host: entry.host,
        port: entry.port,
        protocol: entry.protocol,
        description: entry.description,
        icon: entry.icon,
        color: entry.color,
        sort_order: new_sort_order,
        last_connected_at: entry.last_connected_at,
        pve_node: entry.pve_node,
        pve_vmid: entry.pve_vmid,
        jump_host_id: entry.jump_host_id,
        mac_address: entry.mac_address,
        created_at: entry.created_at,
        updated_at: now,
        identity_ids,
    })
}

/// Get linked identities for an entry (returns IDs only, for connection use)
#[command]
pub async fn get_entry_identities(token: String, entry_id: String) -> Result<Vec<String>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    
    let pool = db::pool();
    
    // Verify entry belongs to account
    let exists: Option<(i32,)> = sqlx::query_as(
        "SELECT 1 FROM entries WHERE id = ? AND account_id = ?"
    )
    .bind(&entry_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;
    
    if exists.is_none() {
        return Err("Entry not found".to_string());
    }
    
    get_identity_ids_for_entry(&entry_id).await
}
