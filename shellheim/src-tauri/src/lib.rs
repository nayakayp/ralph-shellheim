//! Shellheim - A native SSH/server management desktop application
//! 
//! This is a Tauri-based rewrite of Nexterm, providing SSH terminal access,
//! SFTP file management, and server monitoring capabilities.

pub mod db;
pub mod ssh;
pub mod api;
pub mod services;
pub mod models;
pub mod utils;

use tauri::Manager;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

/// Initialize the Tauri application with all plugins and services
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing for logging
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "shellheim=debug,tauri=info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("Starting Shellheim...");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_sql::Builder::new()
            .add_migrations("sqlite:shellheim.db", db::migrations())
            .build())
        .setup(|app| {
            info!("Shellheim initialized successfully");
            
            // Initialize database and services
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = initialize_app(&app_handle).await {
                    tracing::error!("Failed to initialize app: {}", e);
                }
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Account commands
            api::account::create_account,
            api::account::login,
            api::account::logout,
            api::account::get_current_user,
            api::account::has_accounts,
            
            // Entry/Server commands
            api::entries::list_entries,
            api::entries::get_entry,
            api::entries::create_entry,
            api::entries::update_entry,
            api::entries::delete_entry,
            api::entries::get_entry_identities,
            
            // Identity commands
            api::identities::list_identities,
            api::identities::get_identity,
            api::identities::create_identity,
            api::identities::update_identity,
            api::identities::delete_identity,
            
            // SSH commands
            api::ssh::connect_ssh,
            api::ssh::disconnect_ssh,
            api::ssh::send_data,
            api::ssh::resize_terminal,
            
            // Folder commands
            api::folders::list_folders,
            api::folders::create_folder,
            api::folders::update_folder,
            api::folders::delete_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Initialize application services after Tauri setup
async fn initialize_app(app: &tauri::AppHandle) -> anyhow::Result<()> {
    // Get app data directory
    let app_data = app.path().app_data_dir()?;
    std::fs::create_dir_all(&app_data)?;
    
    info!("App data directory: {:?}", app_data);
    
    // Initialize database
    db::init(&app_data).await?;
    
    // Initialize SSH session manager
    ssh::SessionManager::init();
    
    info!("All services initialized");
    Ok(())
}
