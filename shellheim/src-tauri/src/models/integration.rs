//! Integration model for external systems (Proxmox VE, etc.)

use serde::{Deserialize, Serialize};

/// Integration types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum IntegrationType {
    Proxmox,
}

impl std::fmt::Display for IntegrationType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            IntegrationType::Proxmox => write!(f, "proxmox"),
        }
    }
}

/// Integration database row
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Integration {
    pub id: String,
    pub account_id: String,
    pub integration_type: String,
    pub name: String,
    pub host: String,
    pub port: i32,
    pub username: String,
    #[serde(skip_serializing)]
    pub password_encrypted: Option<String>,
    pub verify_ssl: bool,
    pub status: String,
    pub last_sync_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// API response (without sensitive data)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegrationInfo {
    pub id: String,
    pub account_id: String,
    pub integration_type: String,
    pub name: String,
    pub host: String,
    pub port: i32,
    pub username: String,
    pub verify_ssl: bool,
    pub status: String,
    pub last_sync_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<Integration> for IntegrationInfo {
    fn from(i: Integration) -> Self {
        Self {
            id: i.id,
            account_id: i.account_id,
            integration_type: i.integration_type,
            name: i.name,
            host: i.host,
            port: i.port,
            username: i.username,
            verify_ssl: i.verify_ssl,
            status: i.status,
            last_sync_at: i.last_sync_at,
            created_at: i.created_at,
            updated_at: i.updated_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateIntegrationRequest {
    pub integration_type: String,
    pub name: String,
    pub host: String,
    pub port: Option<i32>,
    pub username: String,
    pub password: String,
    pub verify_ssl: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateIntegrationRequest {
    pub name: Option<String>,
    pub host: Option<String>,
    pub port: Option<i32>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub verify_ssl: Option<bool>,
}

// ============ Proxmox API Response Types ============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxmoxNode {
    pub node: String,
    pub status: String,
    pub cpu: Option<f64>,
    pub maxcpu: Option<i32>,
    pub mem: Option<i64>,
    pub maxmem: Option<i64>,
    pub disk: Option<i64>,
    pub maxdisk: Option<i64>,
    pub uptime: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxmoxVm {
    pub vmid: i32,
    pub name: Option<String>,
    pub status: String,
    #[serde(rename = "type")]
    pub vm_type: Option<String>,
    pub cpu: Option<f64>,
    pub maxcpu: Option<i32>,
    pub mem: Option<i64>,
    pub maxmem: Option<i64>,
    pub disk: Option<i64>,
    pub maxdisk: Option<i64>,
    pub uptime: Option<i64>,
    pub netin: Option<i64>,
    pub netout: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxmoxResource {
    pub id: String,
    pub node: String,
    pub name: String,
    pub vmid: Option<i32>,
    pub resource_type: String, // "qemu", "lxc", "shell"
    pub status: String,
    pub cpu: Option<f64>,
    pub mem: Option<i64>,
    pub maxmem: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxmoxClusterInfo {
    pub nodes: Vec<ProxmoxNode>,
    pub resources: Vec<ProxmoxResource>,
    pub total_vms: i32,
    pub total_containers: i32,
    pub running_vms: i32,
    pub running_containers: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub folders_created: i32,
    pub entries_created: i32,
    pub nodes_found: i32,
}
