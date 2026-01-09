//! Integrations API handlers
//!
//! Manages external integrations like Proxmox VE.

use crate::db;
use crate::models::{
    CreateIntegrationRequest, Integration, IntegrationInfo, ProxmoxClusterInfo,
    ProxmoxResource, SyncResult, UpdateIntegrationRequest,
};
use crate::proxmox::ProxmoxClient;
use crate::utils::encryption;
use sqlx::Row;
use tauri::command;
use tracing::info;
use uuid::Uuid;

/// Master encryption key
fn get_encryption_key() -> [u8; 32] {
    let mut key = [0u8; 32];
    key.copy_from_slice(b"shellheim_dev_key_32bytes_long!!");
    key
}

/// Helper to get account_id from session token
async fn get_account_id_from_token(token: &str) -> Result<String, String> {
    let pool = db::pool();

    let row = sqlx::query(
        r#"
        SELECT account_id FROM sessions
        WHERE token = ? AND expires_at > datetime('now')
        LIMIT 1
        "#,
    )
    .bind(token)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Session expired or invalid".to_string())?;

    Ok(row.get("account_id"))
}

/// Decrypt integration password
fn decrypt_password(encrypted: &Option<String>, key: &[u8; 32]) -> Result<Option<String>, String> {
    match encrypted {
        Some(v) if !v.is_empty() => encryption::decrypt(v, key)
            .map(Some)
            .map_err(|e| format!("Decryption error: {}", e)),
        _ => Ok(None),
    }
}

/// List all integrations for the user
#[command]
pub async fn list_integrations(token: String) -> Result<Vec<IntegrationInfo>, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Listing integrations for account: {}", account_id);

    let pool = db::pool();

    let integrations: Vec<Integration> = sqlx::query_as(
        r#"
        SELECT * FROM integrations
        WHERE account_id = ?
        ORDER BY name ASC
        "#,
    )
    .bind(&account_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list integrations: {}", e))?;

    info!("Found {} integrations", integrations.len());
    Ok(integrations.into_iter().map(IntegrationInfo::from).collect())
}

/// Get a single integration
#[command]
pub async fn get_integration(token: String, integration_id: String) -> Result<IntegrationInfo, String> {
    let account_id = get_account_id_from_token(&token).await?;

    let pool = db::pool();

    let integration: Integration = sqlx::query_as(
        "SELECT * FROM integrations WHERE id = ? AND account_id = ?",
    )
    .bind(&integration_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Integration not found".to_string())?;

    Ok(IntegrationInfo::from(integration))
}

/// Create a new integration
#[command]
pub async fn create_integration(
    token: String,
    request: CreateIntegrationRequest,
) -> Result<IntegrationInfo, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Creating integration: {} for account: {}", request.name, account_id);

    // Validate
    if request.name.trim().is_empty() {
        return Err("Name is required".to_string());
    }
    if request.host.trim().is_empty() {
        return Err("Host is required".to_string());
    }
    if request.username.trim().is_empty() {
        return Err("Username is required".to_string());
    }
    if request.password.trim().is_empty() {
        return Err("Password is required".to_string());
    }

    let port = request.port.unwrap_or(8006);
    let verify_ssl = request.verify_ssl.unwrap_or(false);

    // Test connection first
    let client = ProxmoxClient::new(&request.host, port, verify_ssl)?;
    client
        .create_ticket(&request.username, &request.password)
        .await?;

    info!("Proxmox connection verified successfully");

    let key = get_encryption_key();
    let pool = db::pool();

    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    // Encrypt password
    let password_encrypted = encryption::encrypt(&request.password, &key)
        .map_err(|e| format!("Encryption error: {}", e))?;

    sqlx::query(
        r#"
        INSERT INTO integrations (
            id, account_id, integration_type, name, host, port, username,
            password_encrypted, verify_ssl, status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'online', ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&account_id)
    .bind(&request.integration_type)
    .bind(&request.name)
    .bind(&request.host)
    .bind(port)
    .bind(&request.username)
    .bind(&password_encrypted)
    .bind(verify_ssl)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create integration: {}", e))?;

    info!("Integration created successfully: {}", id);

    Ok(IntegrationInfo {
        id,
        account_id,
        integration_type: request.integration_type,
        name: request.name,
        host: request.host,
        port,
        username: request.username,
        verify_ssl,
        status: "online".to_string(),
        last_sync_at: None,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// Update an integration
#[command]
pub async fn update_integration(
    token: String,
    integration_id: String,
    request: UpdateIntegrationRequest,
) -> Result<IntegrationInfo, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Updating integration: {}", integration_id);

    let pool = db::pool();
    let key = get_encryption_key();

    // Verify ownership
    let existing: Integration = sqlx::query_as(
        "SELECT * FROM integrations WHERE id = ? AND account_id = ?",
    )
    .bind(&integration_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Integration not found".to_string())?;

    let now = chrono::Utc::now().to_rfc3339();

    // Check which fields changed before moving
    let host_changed = request.host.is_some();
    let port_changed = request.port.is_some();
    let username_changed = request.username.is_some();
    let password_changed = request.password.is_some();

    let new_name = request.name.unwrap_or(existing.name.clone());
    let new_host = request.host.unwrap_or(existing.host.clone());
    let new_port = request.port.unwrap_or(existing.port);
    let new_username = request.username.unwrap_or(existing.username.clone());
    let new_verify_ssl = request.verify_ssl.unwrap_or(existing.verify_ssl);

    // Re-encrypt password if changed
    let new_password_encrypted = if let Some(ref password) = request.password {
        Some(
            encryption::encrypt(password, &key)
                .map_err(|e| format!("Encryption error: {}", e))?,
        )
    } else {
        existing.password_encrypted.clone()
    };

    // Test connection if credentials changed
    if host_changed || port_changed || username_changed || password_changed {
        let test_password = if let Some(ref pwd) = request.password {
            pwd.clone()
        } else {
            decrypt_password(&existing.password_encrypted, &key)?
                .ok_or_else(|| "No password found".to_string())?
        };

        let client = ProxmoxClient::new(&new_host, new_port, new_verify_ssl)?;
        client.create_ticket(&new_username, &test_password).await?;
        info!("Updated Proxmox connection verified");
    }

    sqlx::query(
        r#"
        UPDATE integrations SET
            name = ?, host = ?, port = ?, username = ?,
            password_encrypted = ?, verify_ssl = ?, updated_at = ?
        WHERE id = ? AND account_id = ?
        "#,
    )
    .bind(&new_name)
    .bind(&new_host)
    .bind(new_port)
    .bind(&new_username)
    .bind(&new_password_encrypted)
    .bind(new_verify_ssl)
    .bind(&now)
    .bind(&integration_id)
    .bind(&account_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to update integration: {}", e))?;

    info!("Integration updated: {}", integration_id);

    Ok(IntegrationInfo {
        id: integration_id,
        account_id,
        integration_type: existing.integration_type,
        name: new_name,
        host: new_host,
        port: new_port,
        username: new_username,
        verify_ssl: new_verify_ssl,
        status: existing.status,
        last_sync_at: existing.last_sync_at,
        created_at: existing.created_at,
        updated_at: now,
    })
}

/// Delete an integration and all its resources
#[command]
pub async fn delete_integration(token: String, integration_id: String) -> Result<(), String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Deleting integration: {}", integration_id);

    let pool = db::pool();

    // Delete entries first (cascade doesn't work well with ALTER TABLE)
    sqlx::query("DELETE FROM entries WHERE integration_id = ?")
        .bind(&integration_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to delete entries: {}", e))?;

    // Delete folders
    sqlx::query("DELETE FROM folders WHERE integration_id = ?")
        .bind(&integration_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to delete folders: {}", e))?;

    // Delete integration
    let result = sqlx::query("DELETE FROM integrations WHERE id = ? AND account_id = ?")
        .bind(&integration_id)
        .bind(&account_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to delete integration: {}", e))?;

    if result.rows_affected() == 0 {
        return Err("Integration not found".to_string());
    }

    info!("Integration deleted: {}", integration_id);
    Ok(())
}

/// Sync resources from Proxmox
#[command]
pub async fn sync_integration(token: String, integration_id: String) -> Result<SyncResult, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Syncing integration: {}", integration_id);

    let pool = db::pool();
    let key = get_encryption_key();

    // Get integration
    let integration: Integration = sqlx::query_as(
        "SELECT * FROM integrations WHERE id = ? AND account_id = ?",
    )
    .bind(&integration_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Integration not found".to_string())?;

    // Decrypt password
    let password = decrypt_password(&integration.password_encrypted, &key)?
        .ok_or_else(|| "No password found".to_string())?;

    // Connect to Proxmox
    let client = ProxmoxClient::new(&integration.host, integration.port, integration.verify_ssl)?;
    let ticket = client
        .create_ticket(&integration.username, &password)
        .await?;

    // Get all nodes
    let nodes = client.get_nodes(&ticket).await?;
    info!("Found {} nodes", nodes.len());

    // Delete existing folders and entries for this integration
    sqlx::query("DELETE FROM entries WHERE integration_id = ?")
        .bind(&integration_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to clear entries: {}", e))?;

    sqlx::query("DELETE FROM folders WHERE integration_id = ?")
        .bind(&integration_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to clear folders: {}", e))?;

    let mut folders_created = 0;
    let mut entries_created = 0;
    let now = chrono::Utc::now().to_rfc3339();

    for node in &nodes {
        // Create folder for node
        let folder_id = Uuid::new_v4().to_string();
        let folder_name = format!("{} - {}", integration.name, node.node);

        sqlx::query(
            r#"
            INSERT INTO folders (id, account_id, integration_id, name, icon, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'server', ?, ?)
            "#,
        )
        .bind(&folder_id)
        .bind(&account_id)
        .bind(&integration_id)
        .bind(&folder_name)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to create folder: {}", e))?;

        folders_created += 1;

        // Create shell entry for node
        let shell_id = Uuid::new_v4().to_string();
        sqlx::query(
            r#"
            INSERT INTO entries (
                id, account_id, integration_id, folder_id, entry_type, protocol,
                name, icon, pve_node, pve_vmid, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, 'pve-shell', 'terminal', ?, 'terminal', ?, NULL, ?, ?)
            "#,
        )
        .bind(&shell_id)
        .bind(&account_id)
        .bind(&integration_id)
        .bind(&folder_id)
        .bind(format!("{} Shell", node.node))
        .bind(&node.node)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to create shell entry: {}", e))?;

        entries_created += 1;

        // Get VMs for this node
        if let Ok(vms) = client.get_qemu_vms(&ticket, &node.node).await {
            for vm in vms {
                let entry_id = Uuid::new_v4().to_string();
                let vm_name = vm.name.unwrap_or_else(|| format!("VM {}", vm.vmid));

                sqlx::query(
                    r#"
                    INSERT INTO entries (
                        id, account_id, integration_id, folder_id, entry_type, protocol,
                        name, icon, pve_node, pve_vmid, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, 'pve-qemu', 'vnc', ?, 'server', ?, ?, ?, ?)
                    "#,
                )
                .bind(&entry_id)
                .bind(&account_id)
                .bind(&integration_id)
                .bind(&folder_id)
                .bind(&vm_name)
                .bind(&node.node)
                .bind(vm.vmid)
                .bind(&now)
                .bind(&now)
                .execute(pool)
                .await
                .map_err(|e| format!("Failed to create VM entry: {}", e))?;

                entries_created += 1;
            }
        }

        // Get LXC containers for this node
        if let Ok(containers) = client.get_lxc_containers(&ticket, &node.node).await {
            for ct in containers {
                let entry_id = Uuid::new_v4().to_string();
                let ct_name = ct.name.unwrap_or_else(|| format!("CT {}", ct.vmid));

                sqlx::query(
                    r#"
                    INSERT INTO entries (
                        id, account_id, integration_id, folder_id, entry_type, protocol,
                        name, icon, pve_node, pve_vmid, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, 'pve-lxc', 'terminal', ?, 'linux', ?, ?, ?, ?)
                    "#,
                )
                .bind(&entry_id)
                .bind(&account_id)
                .bind(&integration_id)
                .bind(&folder_id)
                .bind(&ct_name)
                .bind(&node.node)
                .bind(ct.vmid)
                .bind(&now)
                .bind(&now)
                .execute(pool)
                .await
                .map_err(|e| format!("Failed to create container entry: {}", e))?;

                entries_created += 1;
            }
        }
    }

    // Update last_sync_at and status
    sqlx::query(
        "UPDATE integrations SET last_sync_at = ?, status = 'online', updated_at = ? WHERE id = ?",
    )
    .bind(&now)
    .bind(&now)
    .bind(&integration_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to update integration: {}", e))?;

    info!(
        "Sync complete: {} folders, {} entries",
        folders_created, entries_created
    );

    Ok(SyncResult {
        folders_created,
        entries_created,
        nodes_found: nodes.len() as i32,
    })
}

/// Get Proxmox cluster info (live data)
#[command]
pub async fn get_proxmox_cluster_info(
    token: String,
    integration_id: String,
) -> Result<ProxmoxClusterInfo, String> {
    let account_id = get_account_id_from_token(&token).await?;

    let pool = db::pool();
    let key = get_encryption_key();

    let integration: Integration = sqlx::query_as(
        "SELECT * FROM integrations WHERE id = ? AND account_id = ?",
    )
    .bind(&integration_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Integration not found".to_string())?;

    let password = decrypt_password(&integration.password_encrypted, &key)?
        .ok_or_else(|| "No password found".to_string())?;

    let client = ProxmoxClient::new(&integration.host, integration.port, integration.verify_ssl)?;
    let ticket = client
        .create_ticket(&integration.username, &password)
        .await?;

    let nodes = client.get_nodes(&ticket).await?;

    let mut all_resources = Vec::new();
    let mut total_vms = 0;
    let mut total_containers = 0;
    let mut running_vms = 0;
    let mut running_containers = 0;

    for node in &nodes {
        // Get VMs
        if let Ok(vms) = client.get_qemu_vms(&ticket, &node.node).await {
            for vm in &vms {
                total_vms += 1;
                if vm.status == "running" {
                    running_vms += 1;
                }
                all_resources.push(ProxmoxResource {
                    id: format!("qemu/{}", vm.vmid),
                    node: node.node.clone(),
                    name: vm.name.clone().unwrap_or_else(|| format!("VM {}", vm.vmid)),
                    vmid: Some(vm.vmid),
                    resource_type: "qemu".to_string(),
                    status: vm.status.clone(),
                    cpu: vm.cpu,
                    mem: vm.mem,
                    maxmem: vm.maxmem,
                });
            }
        }

        // Get containers
        if let Ok(containers) = client.get_lxc_containers(&ticket, &node.node).await {
            for ct in &containers {
                total_containers += 1;
                if ct.status == "running" {
                    running_containers += 1;
                }
                all_resources.push(ProxmoxResource {
                    id: format!("lxc/{}", ct.vmid),
                    node: node.node.clone(),
                    name: ct.name.clone().unwrap_or_else(|| format!("CT {}", ct.vmid)),
                    vmid: Some(ct.vmid),
                    resource_type: "lxc".to_string(),
                    status: ct.status.clone(),
                    cpu: ct.cpu,
                    mem: ct.mem,
                    maxmem: ct.maxmem,
                });
            }
        }
    }

    Ok(ProxmoxClusterInfo {
        nodes: nodes
            .into_iter()
            .map(|n| crate::models::ProxmoxNode {
                node: n.node,
                status: n.status,
                cpu: n.cpu,
                maxcpu: n.maxcpu,
                mem: n.mem,
                maxmem: n.maxmem,
                disk: n.disk,
                maxdisk: n.maxdisk,
                uptime: n.uptime,
            })
            .collect(),
        resources: all_resources,
        total_vms,
        total_containers,
        running_vms,
        running_containers,
    })
}

/// Start a VM or container
#[command]
pub async fn start_pve_resource(
    token: String,
    entry_id: String,
) -> Result<String, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Starting PVE resource: {}", entry_id);

    let pool = db::pool();
    let key = get_encryption_key();

    // Get entry
    let entry: crate::models::EntryRow = sqlx::query_as(
        "SELECT * FROM entries WHERE id = ? AND account_id = ?",
    )
    .bind(&entry_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Entry not found".to_string())?;

    let integration_id = entry
        .integration_id
        .ok_or_else(|| "Not a PVE entry".to_string())?;

    let pve_node = entry
        .pve_node
        .ok_or_else(|| "Missing PVE node".to_string())?;

    let pve_vmid = entry.pve_vmid.ok_or_else(|| "Missing PVE VMID".to_string())?;

    let vm_type = if entry.entry_type == "pve-qemu" {
        "qemu"
    } else if entry.entry_type == "pve-lxc" {
        "lxc"
    } else {
        return Err("Cannot start shell entry".to_string());
    };

    // Get integration
    let integration: Integration = sqlx::query_as(
        "SELECT * FROM integrations WHERE id = ?",
    )
    .bind(&integration_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Integration not found".to_string())?;

    let password = decrypt_password(&integration.password_encrypted, &key)?
        .ok_or_else(|| "No password".to_string())?;

    let client = ProxmoxClient::new(&integration.host, integration.port, integration.verify_ssl)?;
    let ticket = client
        .create_ticket(&integration.username, &password)
        .await?;

    client.start_vm(&ticket, &pve_node, pve_vmid, vm_type).await
}

/// Stop a VM or container (force)
#[command]
pub async fn stop_pve_resource(
    token: String,
    entry_id: String,
) -> Result<String, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Stopping PVE resource: {}", entry_id);

    let pool = db::pool();
    let key = get_encryption_key();

    let entry: crate::models::EntryRow = sqlx::query_as(
        "SELECT * FROM entries WHERE id = ? AND account_id = ?",
    )
    .bind(&entry_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Entry not found".to_string())?;

    let integration_id = entry
        .integration_id
        .ok_or_else(|| "Not a PVE entry".to_string())?;

    let pve_node = entry
        .pve_node
        .ok_or_else(|| "Missing PVE node".to_string())?;

    let pve_vmid = entry.pve_vmid.ok_or_else(|| "Missing PVE VMID".to_string())?;

    let vm_type = if entry.entry_type == "pve-qemu" {
        "qemu"
    } else if entry.entry_type == "pve-lxc" {
        "lxc"
    } else {
        return Err("Cannot stop shell entry".to_string());
    };

    let integration: Integration = sqlx::query_as(
        "SELECT * FROM integrations WHERE id = ?",
    )
    .bind(&integration_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Integration not found".to_string())?;

    let password = decrypt_password(&integration.password_encrypted, &key)?
        .ok_or_else(|| "No password".to_string())?;

    let client = ProxmoxClient::new(&integration.host, integration.port, integration.verify_ssl)?;
    let ticket = client
        .create_ticket(&integration.username, &password)
        .await?;

    client.stop_vm(&ticket, &pve_node, pve_vmid, vm_type).await
}

/// Shutdown a VM or container (graceful)
#[command]
pub async fn shutdown_pve_resource(
    token: String,
    entry_id: String,
) -> Result<String, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Shutting down PVE resource: {}", entry_id);

    let pool = db::pool();
    let key = get_encryption_key();

    let entry: crate::models::EntryRow = sqlx::query_as(
        "SELECT * FROM entries WHERE id = ? AND account_id = ?",
    )
    .bind(&entry_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Entry not found".to_string())?;

    let integration_id = entry
        .integration_id
        .ok_or_else(|| "Not a PVE entry".to_string())?;

    let pve_node = entry
        .pve_node
        .ok_or_else(|| "Missing PVE node".to_string())?;

    let pve_vmid = entry.pve_vmid.ok_or_else(|| "Missing PVE VMID".to_string())?;

    let vm_type = if entry.entry_type == "pve-qemu" {
        "qemu"
    } else if entry.entry_type == "pve-lxc" {
        "lxc"
    } else {
        return Err("Cannot shutdown shell entry".to_string());
    };

    let integration: Integration = sqlx::query_as(
        "SELECT * FROM integrations WHERE id = ?",
    )
    .bind(&integration_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Integration not found".to_string())?;

    let password = decrypt_password(&integration.password_encrypted, &key)?
        .ok_or_else(|| "No password".to_string())?;

    let client = ProxmoxClient::new(&integration.host, integration.port, integration.verify_ssl)?;
    let ticket = client
        .create_ticket(&integration.username, &password)
        .await?;

    client
        .shutdown_vm(&ticket, &pve_node, pve_vmid, vm_type)
        .await
}
