//! Snippets API handlers
//!
//! Manages reusable command snippets that can be executed across SSH sessions.

use crate::db;
use crate::models::{CreateSnippetRequest, Snippet, UpdateSnippetRequest};
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

/// List all snippets for the authenticated user
#[command]
pub async fn list_snippets(token: String) -> Result<Vec<Snippet>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Listing snippets for account: {}", account_id);

    let pool = db::pool();

    let snippets: Vec<Snippet> = sqlx::query_as(
        r#"
        SELECT * FROM snippets
        WHERE account_id = ?
        ORDER BY category ASC, name ASC
        "#,
    )
    .bind(&account_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list snippets: {}", e))?;

    info!("Found {} snippets", snippets.len());
    Ok(snippets)
}

/// Get a single snippet by ID
#[command]
pub async fn get_snippet(token: String, snippet_id: String) -> Result<Snippet, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!(
        "Getting snippet: {} for account: {}",
        snippet_id, account_id
    );

    let pool = db::pool();

    let snippet: Snippet =
        sqlx::query_as("SELECT * FROM snippets WHERE id = ? AND account_id = ?")
            .bind(&snippet_id)
            .bind(&account_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Database error: {}", e))?
            .ok_or_else(|| "Snippet not found".to_string())?;

    Ok(snippet)
}

/// Create a new snippet
#[command]
pub async fn create_snippet(token: String, request: CreateSnippetRequest) -> Result<Snippet, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!(
        "Creating snippet: {} for account: {}",
        request.name, account_id
    );

    // Validate required fields
    if request.name.trim().is_empty() {
        return Err("Name is required".to_string());
    }
    if request.content.trim().is_empty() {
        return Err("Command content is required".to_string());
    }

    let pool = db::pool();

    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        r#"
        INSERT INTO snippets (
            id, account_id, name, content, description, category, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&account_id)
    .bind(&request.name)
    .bind(&request.content)
    .bind(&request.description)
    .bind(&request.category)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create snippet: {}", e))?;

    info!("Snippet created successfully: {}", id);

    Ok(Snippet {
        id,
        account_id,
        name: request.name,
        content: request.content,
        description: request.description,
        category: request.category,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// Update an existing snippet
#[command]
pub async fn update_snippet(
    token: String,
    snippet_id: String,
    request: UpdateSnippetRequest,
) -> Result<Snippet, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!(
        "Updating snippet: {} for account: {}",
        snippet_id, account_id
    );

    let pool = db::pool();

    // Verify snippet belongs to account
    let existing: Option<Snippet> =
        sqlx::query_as("SELECT * FROM snippets WHERE id = ? AND account_id = ?")
            .bind(&snippet_id)
            .bind(&account_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Database error: {}", e))?;

    let snippet = existing.ok_or_else(|| "Snippet not found".to_string())?;

    let now = chrono::Utc::now().to_rfc3339();

    // Update fields
    let new_name = request.name.unwrap_or(snippet.name.clone());
    let new_content = request.content.unwrap_or(snippet.content.clone());
    let new_description = if request.description.is_some() {
        request.description
    } else {
        snippet.description.clone()
    };
    let new_category = if request.category.is_some() {
        request.category
    } else {
        snippet.category.clone()
    };

    sqlx::query(
        r#"
        UPDATE snippets SET
            name = ?, content = ?, description = ?, category = ?, updated_at = ?
        WHERE id = ? AND account_id = ?
        "#,
    )
    .bind(&new_name)
    .bind(&new_content)
    .bind(&new_description)
    .bind(&new_category)
    .bind(&now)
    .bind(&snippet_id)
    .bind(&account_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to update snippet: {}", e))?;

    info!("Snippet updated successfully: {}", snippet_id);

    Ok(Snippet {
        id: snippet_id,
        account_id,
        name: new_name,
        content: new_content,
        description: new_description,
        category: new_category,
        created_at: snippet.created_at,
        updated_at: now,
    })
}

/// Delete a snippet
#[command]
pub async fn delete_snippet(token: String, snippet_id: String) -> Result<(), String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!(
        "Deleting snippet: {} for account: {}",
        snippet_id, account_id
    );

    let pool = db::pool();

    let result = sqlx::query("DELETE FROM snippets WHERE id = ? AND account_id = ?")
        .bind(&snippet_id)
        .bind(&account_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to delete snippet: {}", e))?;

    if result.rows_affected() == 0 {
        return Err("Snippet not found".to_string());
    }

    info!("Snippet deleted successfully: {}", snippet_id);
    Ok(())
}

/// List snippets by category
#[command]
pub async fn list_snippets_by_category(
    token: String,
    category: Option<String>,
) -> Result<Vec<Snippet>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!(
        "Listing snippets for account: {} with category: {:?}",
        account_id, category
    );

    let pool = db::pool();

    let snippets: Vec<Snippet> = match category {
        Some(cat) => {
            sqlx::query_as(
                r#"
                SELECT * FROM snippets
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
            // Return snippets without category
            sqlx::query_as(
                r#"
                SELECT * FROM snippets
                WHERE account_id = ? AND (category IS NULL OR category = '')
                ORDER BY name ASC
                "#,
            )
            .bind(&account_id)
            .fetch_all(pool)
            .await
        }
    }
    .map_err(|e| format!("Failed to list snippets: {}", e))?;

    Ok(snippets)
}

/// Get all unique categories for the user
#[command]
pub async fn list_snippet_categories(token: String) -> Result<Vec<String>, String> {
    let account_id = get_account_id_from_token(&token).await?;

    let pool = db::pool();

    let rows: Vec<(Option<String>,)> = sqlx::query_as(
        r#"
        SELECT DISTINCT category FROM snippets
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

/// Search snippets by name or content
#[command]
pub async fn search_snippets(token: String, query: String) -> Result<Vec<Snippet>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!(
        "Searching snippets for account: {} with query: {}",
        account_id, query
    );

    let pool = db::pool();
    let search_pattern = format!("%{}%", query);

    let snippets: Vec<Snippet> = sqlx::query_as(
        r#"
        SELECT * FROM snippets
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
    .map_err(|e| format!("Failed to search snippets: {}", e))?;

    info!("Found {} snippets matching query", snippets.len());
    Ok(snippets)
}
