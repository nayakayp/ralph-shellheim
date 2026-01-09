//! Entry (server/connection) model

use serde::{Deserialize, Serialize};

/// Database row representation (without identity_ids)
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EntryRow {
    pub id: String,
    pub account_id: String,
    pub folder_id: Option<String>,
    pub integration_id: Option<String>,
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
    pub pve_node: Option<String>,
    pub pve_vmid: Option<i32>,
    pub jump_host_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// API response representation (includes identity_ids)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entry {
    pub id: String,
    pub account_id: String,
    pub folder_id: Option<String>,
    pub integration_id: Option<String>,
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
    pub pve_node: Option<String>,
    pub pve_vmid: Option<i32>,
    pub jump_host_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub identity_ids: Vec<String>,
}

impl EntryRow {
    /// Convert to Entry with identity_ids
    pub fn with_identities(self, identity_ids: Vec<String>) -> Entry {
        Entry {
            id: self.id,
            account_id: self.account_id,
            folder_id: self.folder_id,
            integration_id: self.integration_id,
            entry_type: self.entry_type,
            name: self.name,
            host: self.host,
            port: self.port,
            protocol: self.protocol,
            description: self.description,
            icon: self.icon,
            color: self.color,
            sort_order: self.sort_order,
            last_connected_at: self.last_connected_at,
            pve_node: self.pve_node,
            pve_vmid: self.pve_vmid,
            jump_host_id: self.jump_host_id,
            created_at: self.created_at,
            updated_at: self.updated_at,
            identity_ids,
        }
    }
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
    pub jump_host_id: Option<String>,
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
    pub jump_host_id: Option<String>,
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
