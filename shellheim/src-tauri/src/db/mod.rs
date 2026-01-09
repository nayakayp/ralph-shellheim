//! Database module for Shellheim
//! 
//! Handles SQLite database initialization, migrations, and connection pooling.

mod migrations_list;
pub mod schema;

use anyhow::Result;
use once_cell::sync::OnceCell;
use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
use std::path::Path;
use tauri_plugin_sql::Migration;
use tracing::info;

/// Global database pool
static DB_POOL: OnceCell<Pool<Sqlite>> = OnceCell::new();

/// Get the database pool
pub fn pool() -> &'static Pool<Sqlite> {
    DB_POOL.get().expect("Database not initialized")
}

/// Initialize the database
pub async fn init(app_data_dir: &Path) -> Result<()> {
    let db_path = app_data_dir.join("shellheim.db");
    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());
    
    info!("Initializing database at: {}", db_path.display());
    
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;
    
    // Run migrations
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await?;
    
    DB_POOL.set(pool).expect("Database already initialized");
    
    info!("Database initialized successfully");
    Ok(())
}

/// Return migrations for tauri-plugin-sql
pub fn migrations() -> Vec<Migration> {
    migrations_list::get_migrations()
}
