//! Identities (credentials) API handlers
//!
//! Manages SSH keys, passwords, and other credentials with AES-256-GCM encryption.

use crate::db;
use crate::models::{CreateIdentityRequest, Identity, UpdateIdentityRequest};
use crate::utils::encryption;
use sqlx::Row;
use tauri::command;
use tracing::info;
use uuid::Uuid;

/// Master encryption key - in production, this should be derived from user's password
/// or stored securely in the system keychain
fn get_encryption_key() -> [u8; 32] {
    // TODO: In production, derive from user password or use system keychain
    // For now, use a fixed key for development
    let mut key = [0u8; 32];
    key.copy_from_slice(b"shellheim_dev_key_32bytes_long!!");
    key
}

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

/// Encrypt a string if present
fn encrypt_optional(value: &Option<String>, key: &[u8; 32]) -> Result<Option<String>, String> {
    match value {
        Some(v) if !v.is_empty() => {
            encryption::encrypt(v, key)
                .map(Some)
                .map_err(|e| format!("Encryption error: {}", e))
        }
        _ => Ok(None),
    }
}

/// Decrypt a string if present
fn decrypt_optional(value: &Option<String>, key: &[u8; 32]) -> Result<Option<String>, String> {
    match value {
        Some(v) if !v.is_empty() => {
            encryption::decrypt(v, key)
                .map(Some)
                .map_err(|e| format!("Decryption error: {}", e))
        }
        _ => Ok(None),
    }
}

#[command]
pub async fn list_identities(token: String) -> Result<Vec<Identity>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Listing identities for account: {}", account_id);
    
    let pool = db::pool();
    
    let identities: Vec<Identity> = sqlx::query_as(
        r#"
        SELECT * FROM identities
        WHERE account_id = ?
        ORDER BY name ASC
        "#,
    )
    .bind(&account_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list identities: {}", e))?;
    
    info!("Found {} identities", identities.len());
    Ok(identities)
}

#[command]
pub async fn get_identity(token: String, identity_id: String) -> Result<Identity, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Getting identity: {} for account: {}", identity_id, account_id);
    
    let pool = db::pool();
    
    let identity: Identity = sqlx::query_as(
        "SELECT * FROM identities WHERE id = ? AND account_id = ?"
    )
    .bind(&identity_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Identity not found".to_string())?;
    
    Ok(identity)
}

#[command]
pub async fn create_identity(
    token: String,
    request: CreateIdentityRequest,
) -> Result<Identity, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Creating identity: {} for account: {}", request.name, account_id);
    
    // Validate required fields
    if request.name.trim().is_empty() {
        return Err("Name is required".to_string());
    }
    
    // Must have at least username, password, or SSH key
    if request.username.is_none() && request.password.is_none() && request.ssh_key.is_none() {
        return Err("At least one credential (username, password, or SSH key) is required".to_string());
    }
    
    let key = get_encryption_key();
    let pool = db::pool();
    
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    
    // Encrypt sensitive fields
    let password_encrypted = encrypt_optional(&request.password, &key)?;
    let ssh_key_encrypted = encrypt_optional(&request.ssh_key, &key)?;
    let passphrase_encrypted = encrypt_optional(&request.passphrase, &key)?;
    
    sqlx::query(
        r#"
        INSERT INTO identities (
            id, account_id, name, username, password_encrypted,
            ssh_key_encrypted, passphrase_encrypted, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&account_id)
    .bind(&request.name)
    .bind(&request.username)
    .bind(&password_encrypted)
    .bind(&ssh_key_encrypted)
    .bind(&passphrase_encrypted)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create identity: {}", e))?;
    
    info!("Identity created successfully: {}", id);
    
    Ok(Identity {
        id,
        account_id,
        name: request.name,
        username: request.username,
        password_encrypted,
        ssh_key_encrypted,
        passphrase_encrypted,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[command]
pub async fn update_identity(
    token: String,
    identity_id: String,
    request: UpdateIdentityRequest,
) -> Result<Identity, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Updating identity: {} for account: {}", identity_id, account_id);
    
    let key = get_encryption_key();
    let pool = db::pool();
    
    // Verify identity belongs to account
    let existing: Option<Identity> = sqlx::query_as(
        "SELECT * FROM identities WHERE id = ? AND account_id = ?"
    )
    .bind(&identity_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;
    
    let identity = existing.ok_or_else(|| "Identity not found".to_string())?;
    
    let now = chrono::Utc::now().to_rfc3339();
    
    // Update fields, encrypting new values if provided
    let new_name = request.name.unwrap_or(identity.name.clone());
    let new_username = if request.username.is_some() {
        request.username
    } else {
        identity.username.clone()
    };
    
    // Only re-encrypt if new value provided
    let new_password = if request.password.is_some() {
        encrypt_optional(&request.password, &key)?
    } else {
        identity.password_encrypted.clone()
    };
    
    let new_ssh_key = if request.ssh_key.is_some() {
        encrypt_optional(&request.ssh_key, &key)?
    } else {
        identity.ssh_key_encrypted.clone()
    };
    
    let new_passphrase = if request.passphrase.is_some() {
        encrypt_optional(&request.passphrase, &key)?
    } else {
        identity.passphrase_encrypted.clone()
    };
    
    sqlx::query(
        r#"
        UPDATE identities SET
            name = ?, username = ?, password_encrypted = ?,
            ssh_key_encrypted = ?, passphrase_encrypted = ?, updated_at = ?
        WHERE id = ? AND account_id = ?
        "#,
    )
    .bind(&new_name)
    .bind(&new_username)
    .bind(&new_password)
    .bind(&new_ssh_key)
    .bind(&new_passphrase)
    .bind(&now)
    .bind(&identity_id)
    .bind(&account_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to update identity: {}", e))?;
    
    info!("Identity updated successfully: {}", identity_id);
    
    Ok(Identity {
        id: identity_id,
        account_id,
        name: new_name,
        username: new_username,
        password_encrypted: new_password,
        ssh_key_encrypted: new_ssh_key,
        passphrase_encrypted: new_passphrase,
        created_at: identity.created_at,
        updated_at: now,
    })
}

#[command]
pub async fn delete_identity(token: String, identity_id: String) -> Result<(), String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Deleting identity: {} for account: {}", identity_id, account_id);
    
    let pool = db::pool();
    
    let result = sqlx::query(
        "DELETE FROM identities WHERE id = ? AND account_id = ?"
    )
    .bind(&identity_id)
    .bind(&account_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to delete identity: {}", e))?;
    
    if result.rows_affected() == 0 {
        return Err("Identity not found".to_string());
    }
    
    info!("Identity deleted successfully: {}", identity_id);
    Ok(())
}

/// Get decrypted credentials for an identity (for SSH connections)
/// This is an internal function, not exposed as a Tauri command
pub async fn get_decrypted_identity(
    token: &str,
    identity_id: &str,
) -> Result<crate::models::DecryptedIdentity, String> {
    let account_id = get_account_id_from_token(token).await?;
    
    let pool = db::pool();
    let key = get_encryption_key();
    
    let identity: Identity = sqlx::query_as(
        "SELECT * FROM identities WHERE id = ? AND account_id = ?"
    )
    .bind(identity_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Identity not found".to_string())?;
    
    // Decrypt sensitive fields
    let password = decrypt_optional(&identity.password_encrypted, &key)?;
    let ssh_key = decrypt_optional(&identity.ssh_key_encrypted, &key)?;
    let passphrase = decrypt_optional(&identity.passphrase_encrypted, &key)?;
    
    Ok(crate::models::DecryptedIdentity {
        id: identity.id,
        name: identity.name,
        username: identity.username,
        password,
        ssh_key,
        passphrase,
    })
}
