//! Entry (server/connection) model

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Entry {
    pub id: String,
    pub account_id: String,
    pub folder_id: Option<String>,
    pub entry_type: String,
    pub name: String,
    pub host: Option<String>,
    pub port: Option<i32>,
    pub protocol: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub sort_order: i32,
    pub last_connected_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateEntryRequest {
    pub folder_id: Option<String>,
    pub entry_type: Option<String>,
    pub name: String,
    pub host: Option<String>,
    pub port: Option<i32>,
    pub protocol: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub identity_ids: Option<Vec<String>>,
    pub tag_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateEntryRequest {
    pub folder_id: Option<String>,
    pub name: Option<String>,
    pub host: Option<String>,
    pub port: Option<i32>,
    pub protocol: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub sort_order: Option<i32>,
    pub identity_ids: Option<Vec<String>>,
    pub tag_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    Ssh,
    Sftp,
    Rdp,
    Vnc,
    Telnet,
}

impl Default for Protocol {
    fn default() -> Self {
        Protocol::Ssh
    }
}
