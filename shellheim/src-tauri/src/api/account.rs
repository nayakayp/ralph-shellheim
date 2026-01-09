//! Account API handlers

use crate::models::{Account, CreateAccountRequest, LoginRequest, LoginResponse};
use tauri::command;
use tracing::info;

#[command]
pub async fn create_account(request: CreateAccountRequest) -> Result<Account, String> {
    info!("Creating account: {}", request.username);
    
    // TODO: Implement account creation with bcrypt password hashing
    // For now, return a placeholder
    Err("Account creation not yet implemented".to_string())
}

#[command]
pub async fn login(request: LoginRequest) -> Result<LoginResponse, String> {
    info!("Login attempt for: {}", request.username);
    
    // TODO: Implement login with password verification and session creation
    Err("Login not yet implemented".to_string())
}

#[command]
pub async fn logout(token: String) -> Result<(), String> {
    info!("Logout request");
    
    // TODO: Implement session invalidation
    Err("Logout not yet implemented".to_string())
}

#[command]
pub async fn get_current_user(token: String) -> Result<Account, String> {
    // TODO: Implement current user lookup from session token
    Err("Get current user not yet implemented".to_string())
}
