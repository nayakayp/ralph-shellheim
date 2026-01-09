//! Entries (servers/connections) API handlers

use crate::models::{CreateEntryRequest, Entry, UpdateEntryRequest};
use tauri::command;
use tracing::info;

#[command]
pub async fn list_entries(token: String, folder_id: Option<String>) -> Result<Vec<Entry>, String> {
    info!("Listing entries for folder: {:?}", folder_id);
    
    // TODO: Implement entry listing from database
    Ok(vec![])
}

#[command]
pub async fn create_entry(token: String, request: CreateEntryRequest) -> Result<Entry, String> {
    info!("Creating entry: {}", request.name);
    
    // TODO: Implement entry creation
    Err("Create entry not yet implemented".to_string())
}

#[command]
pub async fn update_entry(
    token: String,
    entry_id: String,
    request: UpdateEntryRequest,
) -> Result<Entry, String> {
    info!("Updating entry: {}", entry_id);
    
    // TODO: Implement entry update
    Err("Update entry not yet implemented".to_string())
}

#[command]
pub async fn delete_entry(token: String, entry_id: String) -> Result<(), String> {
    info!("Deleting entry: {}", entry_id);
    
    // TODO: Implement entry deletion
    Err("Delete entry not yet implemented".to_string())
}
