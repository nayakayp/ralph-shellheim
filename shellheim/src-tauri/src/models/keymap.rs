//! Keymap model for customizable keyboard shortcuts

use serde::{Deserialize, Serialize};

/// Keymap entry - stores user-defined keyboard shortcuts
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Keymap {
    pub id: String,
    pub account_id: String,
    pub action: String,        // e.g., "command_palette", "new_connection", "close_tab"
    pub key: String,           // e.g., "p", "n", "w"
    pub modifiers: String,     // e.g., "ctrl", "ctrl+shift", "meta"
    pub description: String,   // Human-readable description
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateKeymapRequest {
    pub action: String,
    pub key: String,
    pub modifiers: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateKeymapRequest {
    pub key: Option<String>,
    pub modifiers: Option<String>,
    pub enabled: Option<bool>,
}

/// Default keymaps that ship with the application
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefaultKeymap {
    pub action: String,
    pub key: String,
    pub modifiers: String,
    pub description: String,
}

impl DefaultKeymap {
    /// Get all default keymaps
    pub fn defaults() -> Vec<DefaultKeymap> {
        vec![
            DefaultKeymap {
                action: "command_palette".to_string(),
                key: "p".to_string(),
                modifiers: "ctrl".to_string(),
                description: "Open command palette".to_string(),
            },
            DefaultKeymap {
                action: "new_connection".to_string(),
                key: "n".to_string(),
                modifiers: "ctrl+shift".to_string(),
                description: "Add new server".to_string(),
            },
            DefaultKeymap {
                action: "close_tab".to_string(),
                key: "w".to_string(),
                modifiers: "ctrl".to_string(),
                description: "Close current tab".to_string(),
            },
            DefaultKeymap {
                action: "next_tab".to_string(),
                key: "Tab".to_string(),
                modifiers: "ctrl".to_string(),
                description: "Switch to next tab".to_string(),
            },
            DefaultKeymap {
                action: "prev_tab".to_string(),
                key: "Tab".to_string(),
                modifiers: "ctrl+shift".to_string(),
                description: "Switch to previous tab".to_string(),
            },
            DefaultKeymap {
                action: "toggle_sidebar".to_string(),
                key: "b".to_string(),
                modifiers: "ctrl".to_string(),
                description: "Toggle sidebar visibility".to_string(),
            },
            DefaultKeymap {
                action: "search_servers".to_string(),
                key: "f".to_string(),
                modifiers: "ctrl".to_string(),
                description: "Search servers".to_string(),
            },
            DefaultKeymap {
                action: "open_sftp".to_string(),
                key: "e".to_string(),
                modifiers: "ctrl+shift".to_string(),
                description: "Open SFTP file manager".to_string(),
            },
            DefaultKeymap {
                action: "open_snippets".to_string(),
                key: "s".to_string(),
                modifiers: "ctrl+shift".to_string(),
                description: "Open snippets panel".to_string(),
            },
            DefaultKeymap {
                action: "disconnect".to_string(),
                key: "d".to_string(),
                modifiers: "ctrl+shift".to_string(),
                description: "Disconnect current session".to_string(),
            },
            DefaultKeymap {
                action: "copy_terminal".to_string(),
                key: "c".to_string(),
                modifiers: "ctrl+shift".to_string(),
                description: "Copy selected terminal text".to_string(),
            },
            DefaultKeymap {
                action: "paste_terminal".to_string(),
                key: "v".to_string(),
                modifiers: "ctrl+shift".to_string(),
                description: "Paste into terminal".to_string(),
            },
        ]
    }
}
