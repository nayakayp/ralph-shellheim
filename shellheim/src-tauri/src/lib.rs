//! Shellheim - A native SSH/server management desktop application
//! 
//! This is a Tauri-based rewrite of Nexterm, providing SSH terminal access,
//! SFTP file management, and server monitoring capabilities.

pub mod db;
pub mod ssh;
pub mod sftp;
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
            api::entries::reorder_entries,
            api::entries::move_entry,
            
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
            api::ssh::list_ssh_sessions,
            api::ssh::hibernate_session,
            api::ssh::list_hibernated_sessions,
            api::ssh::resume_session,
            api::ssh::delete_hibernated_session,
            
            // Folder commands
            api::folders::list_folders,
            api::folders::get_folder,
            api::folders::create_folder,
            api::folders::update_folder,
            api::folders::delete_folder,
            api::folders::get_folder_counts,
            api::folders::reorder_folders,
            api::folders::move_folder,
            
            // Known hosts commands
            api::known_hosts::list_known_hosts,
            api::known_hosts::check_host_key,
            api::known_hosts::trust_host_key,
            api::known_hosts::delete_known_host,
            
            // SFTP commands
            api::sftp::connect_sftp,
            api::sftp::disconnect_sftp,
            api::sftp::sftp_list_dir,
            api::sftp::sftp_search_files,
            api::sftp::sftp_stat,
            api::sftp::sftp_read_file,
            api::sftp::sftp_write_file,
            api::sftp::sftp_delete_file,
            api::sftp::sftp_delete_dir,
            api::sftp::sftp_create_dir,
            api::sftp::sftp_rename,
            api::sftp::sftp_get_session,
            api::sftp::list_sftp_sessions,
            api::sftp::sftp_download_file,
            api::sftp::sftp_upload_files,
            api::sftp::sftp_download_directory,
            
            // Tunnel commands
            api::tunnel::create_tunnel,
            api::tunnel::stop_tunnel,
            api::tunnel::list_tunnels,
            api::tunnel::list_session_tunnels,
            
            // Snippet commands
            api::snippets::list_snippets,
            api::snippets::get_snippet,
            api::snippets::create_snippet,
            api::snippets::update_snippet,
            api::snippets::delete_snippet,
            api::snippets::list_snippets_by_category,
            api::snippets::list_snippet_categories,
            api::snippets::search_snippets,
            
            // Recording commands
            api::recordings::start_recording,
            api::recordings::stop_recording,
            api::recordings::list_recordings,
            api::recordings::list_entry_recordings,
            api::recordings::get_recording,
            api::recordings::get_recording_content,
            api::recordings::update_recording,
            api::recordings::delete_recording,
            api::recordings::is_session_recording,
            
            // Audit commands
            api::audit::list_audit_logs,
            api::audit::get_audit_log_count,
            api::audit::get_audit_action_types,
            api::audit::delete_old_audit_logs,
            api::audit::clear_audit_logs,
            
            // Tag commands
            api::tags::list_tags,
            api::tags::get_tag,
            api::tags::create_tag,
            api::tags::update_tag,
            api::tags::delete_tag,
            api::tags::add_entry_tags,
            api::tags::remove_entry_tags,
            api::tags::set_entry_tags,
            api::tags::get_entry_tags,
            api::tags::list_entries_by_tag,
            api::tags::get_tag_counts,
            
            // Monitoring commands
            api::monitoring::check_entry_health,
            api::monitoring::check_entries_health,
            api::monitoring::get_cached_health,
            api::monitoring::get_monitoring_stats,
            api::monitoring::clear_health_cache,
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
    
    // Initialize SSH tunnel manager
    ssh::TunnelManager::init();
    
    // Initialize recording manager
    ssh::RecordingManager::init(app_data.clone());
    
    // Initialize SFTP session manager
    sftp::SftpSessionManager::init();
    
    info!("All services initialized");
    Ok(())
}
