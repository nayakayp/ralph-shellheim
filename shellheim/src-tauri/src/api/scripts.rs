//! Scripts API handlers
//!
//! Manages executable scripts that can be run on servers via SSH.

use crate::api::identities::get_decrypted_identity;
use crate::db;
use crate::models::{
    CreateScriptRequest, ExecuteScriptRequest, Script, ScriptExecutionResult, UpdateScriptRequest,
    EntryRow,
};
use crate::ssh;
use sqlx::Row;
use std::time::Instant;
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

/// List all scripts for the authenticated user
#[command]
pub async fn list_scripts(token: String) -> Result<Vec<Script>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Listing scripts for account: {}", account_id);

    let pool = db::pool();

    let scripts: Vec<Script> = sqlx::query_as(
        r#"
        SELECT id, account_id, name, content, description, category, 
               target_os, interpreter, run_as_sudo, timeout_seconds,
               created_at, updated_at
        FROM scripts
        WHERE account_id = ?
        ORDER BY category ASC, name ASC
        "#,
    )
    .bind(&account_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list scripts: {}", e))?;

    info!("Found {} scripts", scripts.len());
    Ok(scripts)
}

/// Get a single script by ID
#[command]
pub async fn get_script(token: String, script_id: String) -> Result<Script, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Getting script: {} for account: {}", script_id, account_id);

    let pool = db::pool();

    let script: Script = sqlx::query_as(
        r#"
        SELECT id, account_id, name, content, description, category,
               target_os, interpreter, run_as_sudo, timeout_seconds,
               created_at, updated_at
        FROM scripts WHERE id = ? AND account_id = ?
        "#,
    )
    .bind(&script_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Script not found".to_string())?;

    Ok(script)
}

/// Create a new script
#[command]
pub async fn create_script(token: String, request: CreateScriptRequest) -> Result<Script, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!(
        "Creating script: {} for account: {}",
        request.name, account_id
    );

    // Validate required fields
    if request.name.trim().is_empty() {
        return Err("Name is required".to_string());
    }
    if request.content.trim().is_empty() {
        return Err("Script content is required".to_string());
    }

    let pool = db::pool();

    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let target_os = request.target_os.unwrap_or_else(|| "any".to_string());
    let interpreter = request.interpreter.unwrap_or_else(|| "bash".to_string());
    let run_as_sudo = request.run_as_sudo.unwrap_or(false);
    let timeout_seconds = request.timeout_seconds.unwrap_or(60);

    sqlx::query(
        r#"
        INSERT INTO scripts (
            id, account_id, name, content, description, category,
            target_os, interpreter, run_as_sudo, timeout_seconds,
            created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&account_id)
    .bind(&request.name)
    .bind(&request.content)
    .bind(&request.description)
    .bind(&request.category)
    .bind(&target_os)
    .bind(&interpreter)
    .bind(run_as_sudo)
    .bind(timeout_seconds)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create script: {}", e))?;

    info!("Script created successfully: {}", id);

    Ok(Script {
        id,
        account_id,
        name: request.name,
        content: request.content,
        description: request.description,
        category: request.category,
        target_os,
        interpreter,
        run_as_sudo,
        timeout_seconds,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// Update an existing script
#[command]
pub async fn update_script(
    token: String,
    script_id: String,
    request: UpdateScriptRequest,
) -> Result<Script, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!(
        "Updating script: {} for account: {}",
        script_id, account_id
    );

    let pool = db::pool();

    // Verify script belongs to account
    let existing: Option<Script> = sqlx::query_as(
        r#"
        SELECT id, account_id, name, content, description, category,
               target_os, interpreter, run_as_sudo, timeout_seconds,
               created_at, updated_at
        FROM scripts WHERE id = ? AND account_id = ?
        "#,
    )
    .bind(&script_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    let script = existing.ok_or_else(|| "Script not found".to_string())?;

    let now = chrono::Utc::now().to_rfc3339();

    // Update fields
    let new_name = request.name.unwrap_or(script.name.clone());
    let new_content = request.content.unwrap_or(script.content.clone());
    let new_description = if request.description.is_some() {
        request.description
    } else {
        script.description.clone()
    };
    let new_category = if request.category.is_some() {
        request.category
    } else {
        script.category.clone()
    };
    let new_target_os = request.target_os.unwrap_or(script.target_os.clone());
    let new_interpreter = request.interpreter.unwrap_or(script.interpreter.clone());
    let new_run_as_sudo = request.run_as_sudo.unwrap_or(script.run_as_sudo);
    let new_timeout_seconds = request.timeout_seconds.unwrap_or(script.timeout_seconds);

    sqlx::query(
        r#"
        UPDATE scripts SET
            name = ?, content = ?, description = ?, category = ?,
            target_os = ?, interpreter = ?, run_as_sudo = ?, timeout_seconds = ?,
            updated_at = ?
        WHERE id = ? AND account_id = ?
        "#,
    )
    .bind(&new_name)
    .bind(&new_content)
    .bind(&new_description)
    .bind(&new_category)
    .bind(&new_target_os)
    .bind(&new_interpreter)
    .bind(new_run_as_sudo)
    .bind(new_timeout_seconds)
    .bind(&now)
    .bind(&script_id)
    .bind(&account_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to update script: {}", e))?;

    info!("Script updated successfully: {}", script_id);

    Ok(Script {
        id: script_id,
        account_id,
        name: new_name,
        content: new_content,
        description: new_description,
        category: new_category,
        target_os: new_target_os,
        interpreter: new_interpreter,
        run_as_sudo: new_run_as_sudo,
        timeout_seconds: new_timeout_seconds,
        created_at: script.created_at,
        updated_at: now,
    })
}

/// Delete a script
#[command]
pub async fn delete_script(token: String, script_id: String) -> Result<(), String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!(
        "Deleting script: {} for account: {}",
        script_id, account_id
    );

    let pool = db::pool();

    let result = sqlx::query("DELETE FROM scripts WHERE id = ? AND account_id = ?")
        .bind(&script_id)
        .bind(&account_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to delete script: {}", e))?;

    if result.rows_affected() == 0 {
        return Err("Script not found".to_string());
    }

    info!("Script deleted successfully: {}", script_id);
    Ok(())
}

/// List scripts by category
#[command]
pub async fn list_scripts_by_category(
    token: String,
    category: Option<String>,
) -> Result<Vec<Script>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!(
        "Listing scripts for account: {} with category: {:?}",
        account_id, category
    );

    let pool = db::pool();

    let scripts: Vec<Script> = match category {
        Some(cat) => {
            sqlx::query_as(
                r#"
                SELECT id, account_id, name, content, description, category,
                       target_os, interpreter, run_as_sudo, timeout_seconds,
                       created_at, updated_at
                FROM scripts
                WHERE account_id = ? AND category = ?
                ORDER BY name ASC
                "#,
            )
            .bind(&account_id)
            .bind(&cat)
            .fetch_all(pool)
            .await
        }
        None => {
            // Return scripts without category
            sqlx::query_as(
                r#"
                SELECT id, account_id, name, content, description, category,
                       target_os, interpreter, run_as_sudo, timeout_seconds,
                       created_at, updated_at
                FROM scripts
                WHERE account_id = ? AND (category IS NULL OR category = '')
                ORDER BY name ASC
                "#,
            )
            .bind(&account_id)
            .fetch_all(pool)
            .await
        }
    }
    .map_err(|e| format!("Failed to list scripts: {}", e))?;

    Ok(scripts)
}

/// Get all unique script categories for the user
#[command]
pub async fn list_script_categories(token: String) -> Result<Vec<String>, String> {
    let account_id = get_account_id_from_token(&token).await?;

    let pool = db::pool();

    let rows: Vec<(Option<String>,)> = sqlx::query_as(
        r#"
        SELECT DISTINCT category FROM scripts
        WHERE account_id = ? AND category IS NOT NULL AND category != ''
        ORDER BY category ASC
        "#,
    )
    .bind(&account_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list categories: {}", e))?;

    let categories: Vec<String> = rows.into_iter().filter_map(|(c,)| c).collect();

    Ok(categories)
}

/// Search scripts by name or content
#[command]
pub async fn search_scripts(token: String, query: String) -> Result<Vec<Script>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!(
        "Searching scripts for account: {} with query: {}",
        account_id, query
    );

    let pool = db::pool();
    let search_pattern = format!("%{}%", query);

    let scripts: Vec<Script> = sqlx::query_as(
        r#"
        SELECT id, account_id, name, content, description, category,
               target_os, interpreter, run_as_sudo, timeout_seconds,
               created_at, updated_at
        FROM scripts
        WHERE account_id = ? AND (
            name LIKE ? OR content LIKE ? OR description LIKE ?
        )
        ORDER BY name ASC
        "#,
    )
    .bind(&account_id)
    .bind(&search_pattern)
    .bind(&search_pattern)
    .bind(&search_pattern)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to search scripts: {}", e))?;

    info!("Found {} scripts matching query", scripts.len());
    Ok(scripts)
}

/// Execute a script on a server via SSH
#[command]
pub async fn execute_script(
    token: String,
    request: ExecuteScriptRequest,
) -> Result<ScriptExecutionResult, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!(
        "Executing script {} on entry {} for account: {}",
        request.script_id, request.entry_id, account_id
    );

    let pool = db::pool();

    // Get script
    let script: Script = sqlx::query_as(
        r#"
        SELECT id, account_id, name, content, description, category,
               target_os, interpreter, run_as_sudo, timeout_seconds,
               created_at, updated_at
        FROM scripts WHERE id = ? AND account_id = ?
        "#,
    )
    .bind(&request.script_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Script not found".to_string())?;

    // Get entry (server)
    let entry: EntryRow =
        sqlx::query_as("SELECT * FROM entries WHERE id = ? AND account_id = ?")
            .bind(&request.entry_id)
            .bind(&account_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Database error: {}", e))?
            .ok_or_else(|| "Entry not found".to_string())?;

    // Get decrypted identity for credentials
    let identity = get_decrypted_identity(&token, &request.identity_id).await?;

    // Build the command to execute
    let mut command = script.content.clone();

    // Add sudo prefix if required
    if script.run_as_sudo {
        command = format!("sudo {}", command);
    }

    // Wrap in interpreter
    let full_command = format!("{} -c '{}'", script.interpreter, command.replace("'", "'\"'\"'"));

    // Get host and port from entry
    let host = entry
        .host
        .ok_or_else(|| "Entry has no host configured".to_string())?;
    let port = entry.port.unwrap_or(22) as u16;
    let username = identity
        .username
        .ok_or_else(|| "Identity has no username".to_string())?;

    info!(
        "Connecting to {}:{} as {} to execute script",
        host, port, username
    );

    let start_time = Instant::now();

    // Execute command via SSH
    let timeout_secs = if script.timeout_seconds > 0 {
        script.timeout_seconds as u64
    } else {
        60 // Default 60 seconds
    };
    
    let result = ssh::execute_command(
        &host,
        port,
        &username,
        identity.password.as_deref(),
        identity.ssh_key.as_deref(),
        identity.passphrase.as_deref(),
        &full_command,
        timeout_secs,
    )
    .await;

    let duration_ms = start_time.elapsed().as_millis() as u64;

    match result {
        Ok(output) => {
            info!(
                "Script executed successfully on {}",
                host
            );
            Ok(ScriptExecutionResult {
                script_id: request.script_id,
                entry_id: request.entry_id,
                success: true,
                exit_code: 0,
                output,
                executed_at: chrono::Utc::now().to_rfc3339(),
                duration_ms,
            })
        }
        Err(e) => {
            info!("Script execution failed on {}: {}", host, e);
            Ok(ScriptExecutionResult {
                script_id: request.script_id,
                entry_id: request.entry_id,
                success: false,
                exit_code: -1,
                output: e,
                executed_at: chrono::Utc::now().to_rfc3339(),
                duration_ms,
            })
        }
    }
}
