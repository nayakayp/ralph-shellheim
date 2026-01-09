//! Backup/Export API handlers

use crate::db;
use crate::models::{
    ExportData, ExportEntry, ExportFolder, ExportIdentity, ExportSnippet, ExportTag,
    EntryIdentityRelation, EntryTagRelation, ImportOptions, ImportResult, UserData,
};
use chrono::Utc;
use sqlx::Row;
use tracing::info;
use uuid::Uuid;

/// Helper function to get account_id from token
async fn get_account_id(token: &str) -> Result<String, String> {
    let pool = db::pool();
    
    let row = sqlx::query(
        r#"
        SELECT account_id FROM sessions 
        WHERE token = ? AND expires_at > datetime('now')
        "#
    )
    .bind(token)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Invalid or expired session".to_string())?;
    
    Ok(row.get("account_id"))
}

/// Export all user configuration data as JSON
#[tauri::command]
pub async fn export_config(token: String) -> Result<ExportData, String> {
    let account_id = get_account_id(&token).await?;
    let pool = db::pool();
    
    info!("Exporting configuration for account: {}", account_id);
    
    // Fetch folders
    let folder_rows: Vec<(String, Option<String>, String, Option<String>, Option<String>, i32)> = 
        sqlx::query_as(
            r#"
            SELECT id, parent_id, name, icon, color, sort_order 
            FROM folders WHERE account_id = ?
            "#
        )
        .bind(&account_id)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to fetch folders: {}", e))?;
    
    let folders: Vec<ExportFolder> = folder_rows
        .into_iter()
        .map(|(id, parent_id, name, icon, color, sort_order)| ExportFolder {
            id,
            parent_id,
            name,
            icon,
            color,
            sort_order,
        })
        .collect();
    
    // Fetch entries
    let entry_rows: Vec<(String, Option<String>, String, String, Option<String>, Option<i32>, Option<String>, Option<String>, Option<String>, Option<String>, i32)> = 
        sqlx::query_as(
            r#"
            SELECT id, folder_id, entry_type, name, host, port, protocol, description, icon, color, sort_order 
            FROM entries WHERE account_id = ?
            "#
        )
        .bind(&account_id)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to fetch entries: {}", e))?;
    
    let entries: Vec<ExportEntry> = entry_rows
        .into_iter()
        .map(|(id, folder_id, entry_type, name, host, port, protocol, description, icon, color, sort_order)| ExportEntry {
            id,
            folder_id,
            entry_type,
            name,
            host,
            port,
            protocol,
            description,
            icon,
            color,
            sort_order,
        })
        .collect();
    
    // Fetch identities (metadata only, no secrets)
    let identity_rows: Vec<(String, String, Option<String>, Option<String>, Option<String>)> = 
        sqlx::query_as(
            r#"
            SELECT id, name, username, password_encrypted, ssh_key_encrypted 
            FROM identities WHERE account_id = ?
            "#
        )
        .bind(&account_id)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to fetch identities: {}", e))?;
    
    let identities: Vec<ExportIdentity> = identity_rows
        .into_iter()
        .map(|(id, name, username, password_encrypted, ssh_key_encrypted)| ExportIdentity {
            id,
            name,
            username,
            has_password: password_encrypted.is_some(),
            has_ssh_key: ssh_key_encrypted.is_some(),
        })
        .collect();
    
    // Fetch tags
    let tag_rows: Vec<(String, String, Option<String>)> = sqlx::query_as(
        r#"
        SELECT id, name, color FROM tags WHERE account_id = ?
        "#
    )
    .bind(&account_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to fetch tags: {}", e))?;
    
    let tags: Vec<ExportTag> = tag_rows
        .into_iter()
        .map(|(id, name, color)| ExportTag { id, name, color })
        .collect();
    
    // Fetch entry-tag relationships
    let entry_tag_rows: Vec<(String, String)> = sqlx::query_as(
        r#"
        SELECT et.entry_id, et.tag_id 
        FROM entry_tags et
        INNER JOIN entries e ON et.entry_id = e.id
        WHERE e.account_id = ?
        "#
    )
    .bind(&account_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to fetch entry tags: {}", e))?;
    
    let entry_tags: Vec<EntryTagRelation> = entry_tag_rows
        .into_iter()
        .map(|(entry_id, tag_id)| EntryTagRelation { entry_id, tag_id })
        .collect();
    
    // Fetch entry-identity relationships
    let entry_identity_rows: Vec<(String, String, i32)> = sqlx::query_as(
        r#"
        SELECT ei.entry_id, ei.identity_id, ei.priority 
        FROM entry_identities ei
        INNER JOIN entries e ON ei.entry_id = e.id
        WHERE e.account_id = ?
        "#
    )
    .bind(&account_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to fetch entry identities: {}", e))?;
    
    let entry_identities: Vec<EntryIdentityRelation> = entry_identity_rows
        .into_iter()
        .map(|(entry_id, identity_id, priority)| EntryIdentityRelation {
            entry_id,
            identity_id,
            priority,
        })
        .collect();
    
    // Fetch snippets
    let snippet_rows: Vec<(String, String, String, Option<String>, Option<String>)> = 
        sqlx::query_as(
            r#"
            SELECT id, name, content, description, category 
            FROM snippets WHERE account_id = ?
            "#
        )
        .bind(&account_id)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to fetch snippets: {}", e))?;
    
    let snippets: Vec<ExportSnippet> = snippet_rows
        .into_iter()
        .map(|(id, name, content, description, category)| ExportSnippet {
            id,
            name,
            content,
            description,
            category,
        })
        .collect();
    
    let export = ExportData {
        version: "1.0".to_string(),
        exported_at: Utc::now().to_rfc3339(),
        app: "Shellheim".to_string(),
        data: UserData {
            folders,
            entries,
            identities,
            tags,
            entry_tags,
            entry_identities,
            snippets,
        },
    };
    
    info!(
        "Export complete: {} folders, {} entries, {} identities, {} tags, {} snippets",
        export.data.folders.len(),
        export.data.entries.len(),
        export.data.identities.len(),
        export.data.tags.len(),
        export.data.snippets.len()
    );
    
    Ok(export)
}

/// Import configuration data from JSON
#[tauri::command]
pub async fn import_config(
    token: String,
    export_data: ExportData,
    options: ImportOptions,
) -> Result<ImportResult, String> {
    let account_id = get_account_id(&token).await?;
    let pool = db::pool();
    
    info!("Importing configuration for account: {}", account_id);
    
    let mut result = ImportResult {
        success: true,
        folders_imported: 0,
        entries_imported: 0,
        identities_imported: 0,
        tags_imported: 0,
        snippets_imported: 0,
        errors: Vec::new(),
    };
    
    // ID mapping for relationships (old ID -> new ID)
    let mut folder_id_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut entry_id_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut identity_id_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut tag_id_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    
    let now = Utc::now().to_rfc3339();
    
    // If not merging, clear existing data first
    if !options.merge {
        info!("Replacing existing data (merge=false)");
        
        // Delete in correct order due to foreign keys
        let _ = sqlx::query("DELETE FROM entry_tags WHERE entry_id IN (SELECT id FROM entries WHERE account_id = ?)")
            .bind(&account_id)
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM entry_identities WHERE entry_id IN (SELECT id FROM entries WHERE account_id = ?)")
            .bind(&account_id)
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM entries WHERE account_id = ?")
            .bind(&account_id)
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM folders WHERE account_id = ?")
            .bind(&account_id)
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM identities WHERE account_id = ?")
            .bind(&account_id)
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM tags WHERE account_id = ?")
            .bind(&account_id)
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM snippets WHERE account_id = ?")
            .bind(&account_id)
            .execute(pool)
            .await;
    }
    
    // Import folders (need to handle parent relationships correctly)
    if options.import_folders {
        // First pass: create all folders with null parent
        for folder in &export_data.data.folders {
            let new_id = Uuid::new_v4().to_string();
            folder_id_map.insert(folder.id.clone(), new_id.clone());
            
            match sqlx::query(
                r#"
                INSERT INTO folders (id, account_id, parent_id, name, icon, color, sort_order, created_at, updated_at)
                VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)
                "#
            )
            .bind(&new_id)
            .bind(&account_id)
            .bind(&folder.name)
            .bind(&folder.icon)
            .bind(&folder.color)
            .bind(folder.sort_order)
            .bind(&now)
            .bind(&now)
            .execute(pool)
            .await {
                Ok(_) => result.folders_imported += 1,
                Err(e) => {
                    result.errors.push(format!("Failed to import folder '{}': {}", folder.name, e));
                }
            }
        }
        
        // Second pass: update parent relationships
        for folder in &export_data.data.folders {
            if let Some(old_parent_id) = &folder.parent_id {
                if let (Some(new_id), Some(new_parent_id)) = 
                    (folder_id_map.get(&folder.id), folder_id_map.get(old_parent_id)) 
                {
                    let _ = sqlx::query("UPDATE folders SET parent_id = ? WHERE id = ?")
                        .bind(new_parent_id)
                        .bind(new_id)
                        .execute(pool)
                        .await;
                }
            }
        }
    }
    
    // Import tags
    if options.import_tags {
        for tag in &export_data.data.tags {
            let new_id = Uuid::new_v4().to_string();
            tag_id_map.insert(tag.id.clone(), new_id.clone());
            
            match sqlx::query(
                r#"
                INSERT INTO tags (id, account_id, name, color, created_at)
                VALUES (?, ?, ?, ?, ?)
                "#
            )
            .bind(&new_id)
            .bind(&account_id)
            .bind(&tag.name)
            .bind(&tag.color)
            .bind(&now)
            .execute(pool)
            .await {
                Ok(_) => result.tags_imported += 1,
                Err(e) => {
                    result.errors.push(format!("Failed to import tag '{}': {}", tag.name, e));
                }
            }
        }
    }
    
    // Import identities (metadata only - user will need to re-enter credentials)
    if options.import_identities {
        for identity in &export_data.data.identities {
            let new_id = Uuid::new_v4().to_string();
            identity_id_map.insert(identity.id.clone(), new_id.clone());
            
            match sqlx::query(
                r#"
                INSERT INTO identities (id, account_id, name, username, password_encrypted, ssh_key_encrypted, passphrase_encrypted, created_at, updated_at)
                VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
                "#
            )
            .bind(&new_id)
            .bind(&account_id)
            .bind(&identity.name)
            .bind(&identity.username)
            .bind(&now)
            .bind(&now)
            .execute(pool)
            .await {
                Ok(_) => result.identities_imported += 1,
                Err(e) => {
                    result.errors.push(format!("Failed to import identity '{}': {}", identity.name, e));
                }
            }
        }
    }
    
    // Import entries
    if options.import_entries {
        for entry in &export_data.data.entries {
            let new_id = Uuid::new_v4().to_string();
            entry_id_map.insert(entry.id.clone(), new_id.clone());
            
            // Map folder_id if present
            let new_folder_id = entry.folder_id.as_ref()
                .and_then(|old_id| folder_id_map.get(old_id).cloned());
            
            match sqlx::query(
                r#"
                INSERT INTO entries (id, account_id, folder_id, entry_type, name, host, port, protocol, description, icon, color, sort_order, last_connected_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
                "#
            )
            .bind(&new_id)
            .bind(&account_id)
            .bind(&new_folder_id)
            .bind(&entry.entry_type)
            .bind(&entry.name)
            .bind(&entry.host)
            .bind(entry.port)
            .bind(&entry.protocol)
            .bind(&entry.description)
            .bind(&entry.icon)
            .bind(&entry.color)
            .bind(entry.sort_order)
            .bind(&now)
            .bind(&now)
            .execute(pool)
            .await {
                Ok(_) => result.entries_imported += 1,
                Err(e) => {
                    result.errors.push(format!("Failed to import entry '{}': {}", entry.name, e));
                }
            }
        }
        
        // Import entry-tag relationships
        if options.import_tags {
            for rel in &export_data.data.entry_tags {
                if let (Some(new_entry_id), Some(new_tag_id)) = 
                    (entry_id_map.get(&rel.entry_id), tag_id_map.get(&rel.tag_id))
                {
                    let _ = sqlx::query(
                        "INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)"
                    )
                    .bind(new_entry_id)
                    .bind(new_tag_id)
                    .execute(pool)
                    .await;
                }
            }
        }
        
        // Import entry-identity relationships
        if options.import_identities {
            for rel in &export_data.data.entry_identities {
                if let (Some(new_entry_id), Some(new_identity_id)) = 
                    (entry_id_map.get(&rel.entry_id), identity_id_map.get(&rel.identity_id))
                {
                    let _ = sqlx::query(
                        "INSERT OR IGNORE INTO entry_identities (entry_id, identity_id, priority) VALUES (?, ?, ?)"
                    )
                    .bind(new_entry_id)
                    .bind(new_identity_id)
                    .bind(rel.priority)
                    .execute(pool)
                    .await;
                }
            }
        }
    }
    
    // Import snippets
    if options.import_snippets {
        for snippet in &export_data.data.snippets {
            let new_id = Uuid::new_v4().to_string();
            
            match sqlx::query(
                r#"
                INSERT INTO snippets (id, account_id, name, content, description, category, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                "#
            )
            .bind(&new_id)
            .bind(&account_id)
            .bind(&snippet.name)
            .bind(&snippet.content)
            .bind(&snippet.description)
            .bind(&snippet.category)
            .bind(&now)
            .bind(&now)
            .execute(pool)
            .await {
                Ok(_) => result.snippets_imported += 1,
                Err(e) => {
                    result.errors.push(format!("Failed to import snippet '{}': {}", snippet.name, e));
                }
            }
        }
    }
    
    result.success = result.errors.is_empty();
    
    info!(
        "Import complete: {} folders, {} entries, {} identities, {} tags, {} snippets, {} errors",
        result.folders_imported,
        result.entries_imported,
        result.identities_imported,
        result.tags_imported,
        result.snippets_imported,
        result.errors.len()
    );
    
    Ok(result)
}

/// Get export statistics (counts of exportable items)
#[tauri::command]
pub async fn get_export_stats(token: String) -> Result<ExportStats, String> {
    let account_id = get_account_id(&token).await?;
    let pool = db::pool();
    
    let folders: i32 = sqlx::query_scalar::<_, i32>("SELECT COUNT(*) FROM folders WHERE account_id = ?")
        .bind(&account_id)
        .fetch_one(pool)
        .await
        .unwrap_or(0);
    
    let entries: i32 = sqlx::query_scalar::<_, i32>("SELECT COUNT(*) FROM entries WHERE account_id = ?")
        .bind(&account_id)
        .fetch_one(pool)
        .await
        .unwrap_or(0);
    
    let identities: i32 = sqlx::query_scalar::<_, i32>("SELECT COUNT(*) FROM identities WHERE account_id = ?")
        .bind(&account_id)
        .fetch_one(pool)
        .await
        .unwrap_or(0);
    
    let tags: i32 = sqlx::query_scalar::<_, i32>("SELECT COUNT(*) FROM tags WHERE account_id = ?")
        .bind(&account_id)
        .fetch_one(pool)
        .await
        .unwrap_or(0);
    
    let snippets: i32 = sqlx::query_scalar::<_, i32>("SELECT COUNT(*) FROM snippets WHERE account_id = ?")
        .bind(&account_id)
        .fetch_one(pool)
        .await
        .unwrap_or(0);
    
    Ok(ExportStats {
        folders,
        entries,
        identities,
        tags,
        snippets,
    })
}

/// Export statistics
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ExportStats {
    pub folders: i32,
    pub entries: i32,
    pub identities: i32,
    pub tags: i32,
    pub snippets: i32,
}
