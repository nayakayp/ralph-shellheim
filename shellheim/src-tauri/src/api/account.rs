//! Account API handlers

use crate::db;
use crate::models::{Account, CreateAccountRequest, LoginRequest, LoginResponse};
use bcrypt::{hash, verify, DEFAULT_COST};
use sqlx::Row;
use tauri::command;
use tracing::{error, info};
use uuid::Uuid;

/// Create a new account with bcrypt password hashing
#[command]
pub async fn create_account(request: CreateAccountRequest) -> Result<Account, String> {
    info!("Creating account: {}", request.username);

    // Validate input
    if request.username.len() < 3 {
        return Err("Username must be at least 3 characters".to_string());
    }
    if request.password.len() < 8 {
        return Err("Password must be at least 8 characters".to_string());
    }

    let pool = db::pool();

    // Check if username already exists
    let existing: Option<(i32,)> = sqlx::query_as(
        "SELECT 1 FROM accounts WHERE username = ? LIMIT 1"
    )
    .bind(&request.username)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    if existing.is_some() {
        return Err("Username already exists".to_string());
    }

    // Hash password with bcrypt
    let password_hash = hash(&request.password, DEFAULT_COST)
        .map_err(|e| format!("Failed to hash password: {}", e))?;

    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    // Insert account
    sqlx::query(
        r#"
        INSERT INTO accounts (id, username, password_hash, display_name, totp_enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&request.username)
    .bind(&password_hash)
    .bind(&request.display_name)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create account: {}", e))?;

    info!("Account created successfully: {}", id);

    Ok(Account {
        id,
        username: request.username,
        password_hash: String::new(), // Don't expose hash
        display_name: request.display_name,
        avatar_url: None,
        totp_secret: None,
        totp_enabled: false,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// Login with username/password verification
#[command]
pub async fn login(request: LoginRequest) -> Result<LoginResponse, String> {
    info!("Login attempt for: {}", request.username);
    info!("Password length: {}", request.password.len());

    let pool = db::pool();

    // Find account by username
    let result = sqlx::query_as::<_, Account>(
        "SELECT * FROM accounts WHERE username = ? LIMIT 1"
    )
    .bind(&request.username)
    .fetch_optional(pool)
    .await;
    
    let account = match result {
        Ok(Some(acc)) => acc,
        Ok(None) => {
            error!("Account not found for username: {}", request.username);
            return Err("Invalid username or password".to_string());
        }
        Err(e) => {
            error!("Database query error: {:?}", e);
            return Err(format!("Database error: {}", e));
        }
    };
    
    info!("Account found, hash prefix: {}...", &account.password_hash[..20]);
    info!("Verifying password '{}' (len={}) against hash", &request.password[..2], request.password.len());

    // Verify password
    let valid = verify(&request.password, &account.password_hash)
        .map_err(|e| {
            error!("Password verification error: {}", e);
            "Invalid username or password".to_string()
        })?;

    info!("Bcrypt verify result: {}", valid);
    
    if !valid {
        error!("Password mismatch for user: {}", request.username);
        return Err("Invalid username or password".to_string());
    }

    // Check TOTP if enabled
    if account.totp_enabled {
        if request.totp_code.is_none() {
            return Err("TOTP code required".to_string());
        }
        // TODO: Verify TOTP code
    }

    // Create session token
    let token = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let session_id = Uuid::new_v4().to_string();

    // Store session in database
    sqlx::query(
        r#"
        INSERT INTO sessions (id, account_id, token, expires_at, created_at)
        VALUES (?, ?, ?, datetime('now', '+7 days'), ?)
        "#,
    )
    .bind(&session_id)
    .bind(&account.id)
    .bind(&token)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create session: {}", e))?;

    info!("Login successful for: {}", account.username);

    // Return sanitized account (no password hash)
    Ok(LoginResponse {
        token,
        account: Account {
            password_hash: String::new(),
            totp_secret: None,
            ..account
        },
    })
}

/// Logout by invalidating session token
#[command]
pub async fn logout(token: String) -> Result<(), String> {
    info!("Logout request");

    let pool = db::pool();

    sqlx::query("DELETE FROM sessions WHERE token = ?")
        .bind(&token)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to logout: {}", e))?;

    info!("Logout successful");
    Ok(())
}

/// Get current user from session token
#[command]
pub async fn get_current_user(token: String) -> Result<Account, String> {
    let pool = db::pool();

    // Find session and join with account
    let row = sqlx::query(
        r#"
        SELECT a.* FROM accounts a
        INNER JOIN sessions s ON s.account_id = a.id
        WHERE s.token = ? AND s.expires_at > datetime('now')
        LIMIT 1
        "#,
    )
    .bind(&token)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Session expired or invalid".to_string())?;

    // Map row to Account
    let account = Account {
        id: row.get("id"),
        username: row.get("username"),
        password_hash: String::new(), // Don't expose
        display_name: row.get("display_name"),
        avatar_url: row.get("avatar_url"),
        totp_secret: None, // Don't expose
        totp_enabled: row.get("totp_enabled"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    };

    Ok(account)
}

/// Check if any accounts exist (for first-run detection)
#[command]
pub async fn has_accounts() -> Result<bool, String> {
    let pool = db::pool();

    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM accounts")
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?;

    Ok(count.0 > 0)
}
