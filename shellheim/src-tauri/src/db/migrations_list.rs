//! Database migrations list

use tauri_plugin_sql::{Migration, MigrationKind};

pub fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_accounts_table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS accounts (
                    id TEXT PRIMARY KEY NOT NULL,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    display_name TEXT,
                    avatar_url TEXT,
                    totp_secret TEXT,
                    totp_enabled INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_sessions_table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY NOT NULL,
                    account_id TEXT NOT NULL,
                    token TEXT UNIQUE NOT NULL,
                    expires_at TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_identities_table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS identities (
                    id TEXT PRIMARY KEY NOT NULL,
                    account_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    username TEXT,
                    password_encrypted TEXT,
                    ssh_key_encrypted TEXT,
                    passphrase_encrypted TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create_folders_table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS folders (
                    id TEXT PRIMARY KEY NOT NULL,
                    account_id TEXT NOT NULL,
                    parent_id TEXT,
                    name TEXT NOT NULL,
                    icon TEXT,
                    color TEXT,
                    sort_order INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
                    FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "create_entries_table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS entries (
                    id TEXT PRIMARY KEY NOT NULL,
                    account_id TEXT NOT NULL,
                    folder_id TEXT,
                    entry_type TEXT NOT NULL DEFAULT 'server',
                    name TEXT NOT NULL,
                    host TEXT,
                    port INTEGER DEFAULT 22,
                    protocol TEXT DEFAULT 'ssh',
                    description TEXT,
                    icon TEXT,
                    color TEXT,
                    sort_order INTEGER DEFAULT 0,
                    last_connected_at TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
                    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "create_entry_identities_table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS entry_identities (
                    entry_id TEXT NOT NULL,
                    identity_id TEXT NOT NULL,
                    priority INTEGER DEFAULT 0,
                    PRIMARY KEY (entry_id, identity_id),
                    FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
                    FOREIGN KEY (identity_id) REFERENCES identities(id) ON DELETE CASCADE
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "create_tags_table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS tags (
                    id TEXT PRIMARY KEY NOT NULL,
                    account_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    color TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "create_entry_tags_table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS entry_tags (
                    entry_id TEXT NOT NULL,
                    tag_id TEXT NOT NULL,
                    PRIMARY KEY (entry_id, tag_id),
                    FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
                    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "create_snippets_table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS snippets (
                    id TEXT PRIMARY KEY NOT NULL,
                    account_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    content TEXT NOT NULL,
                    description TEXT,
                    category TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "create_audit_logs_table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id TEXT PRIMARY KEY NOT NULL,
                    account_id TEXT,
                    action TEXT NOT NULL,
                    target_type TEXT,
                    target_id TEXT,
                    details TEXT,
                    ip_address TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
                );
            "#,
            kind: MigrationKind::Up,
        },
    ]
}
