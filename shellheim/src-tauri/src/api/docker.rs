//! Docker API handlers
//!
//! Manages Docker containers on remote servers via SSH commands.

use crate::db;
use crate::models::EntryRow;
use crate::ssh::execute_command;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tauri::command;
use tracing::info;

/// Docker container information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Container {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: String,
    pub state: String,
    pub ports: String,
    pub created: String,
}

/// Docker container stats
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerStats {
    pub container_id: String,
    pub name: String,
    pub cpu_percent: f64,
    pub memory_usage: String,
    pub memory_limit: String,
    pub memory_percent: f64,
    pub net_io: String,
    pub block_io: String,
}

/// Docker image information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DockerImage {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
    pub created: String,
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

/// Helper to get credentials for an entry
async fn get_entry_credentials(entry: &EntryRow, account_id: &str) -> Result<(String, Option<String>, Option<String>, Option<String>), String> {
    let pool = db::pool();
    
    // Get identity linked to this entry
    let identity: Option<(String, Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
        r#"
        SELECT i.username, i.password_encrypted, i.ssh_key_encrypted, i.passphrase_encrypted
        FROM identities i
        JOIN entry_identities ei ON i.id = ei.identity_id
        WHERE ei.entry_id = ? AND i.account_id = ?
        ORDER BY ei.priority DESC
        LIMIT 1
        "#
    )
    .bind(&entry.id)
    .bind(account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    
    if let Some((username, password, ssh_key, passphrase)) = identity {
        Ok((username, password, ssh_key, passphrase))
    } else {
        Err("No credentials found for entry".to_string())
    }
}

/// Helper to execute a Docker command on remote server
async fn execute_docker_command(token: &str, entry_id: &str, cmd: &str) -> Result<String, String> {
    let account_id = get_account_id_from_token(token).await?;
    let pool = db::pool();
    
    // Fetch entry
    let entry: EntryRow = sqlx::query_as(
        "SELECT * FROM entries WHERE id = ? AND account_id = ?"
    )
    .bind(entry_id)
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Entry not found".to_string())?;
    
    let host = entry.host.as_ref().ok_or("Entry has no host")?;
    let port = entry.port.unwrap_or(22) as u16;
    
    // Get credentials
    let (username, password, ssh_key, passphrase) = get_entry_credentials(&entry, &account_id).await?;
    
    // Execute command
    execute_command(
        host,
        port,
        &username,
        password.as_deref(),
        ssh_key.as_deref(),
        passphrase.as_deref(),
        cmd,
        30, // 30 second timeout
    ).await
}

/// List Docker containers on a remote server
#[command]
pub async fn list_docker_containers(
    token: String,
    entry_id: String,
    all: bool,
) -> Result<Vec<Container>, String> {
    info!("Listing Docker containers for entry: {}", entry_id);

    let all_flag = if all { "-a" } else { "" };
    let cmd = format!(
        r#"docker ps {} --format '{{{{.ID}}}}|{{{{.Names}}}}|{{{{.Image}}}}|{{{{.Status}}}}|{{{{.State}}}}|{{{{.Ports}}}}|{{{{.CreatedAt}}}}'"#,
        all_flag
    );

    let output = execute_docker_command(&token, &entry_id, &cmd).await?;
    let mut containers = Vec::new();

    for line in output.lines() {
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() >= 7 {
            containers.push(Container {
                id: parts[0].to_string(),
                name: parts[1].to_string(),
                image: parts[2].to_string(),
                status: parts[3].to_string(),
                state: parts[4].to_string(),
                ports: parts[5].to_string(),
                created: parts[6].to_string(),
            });
        }
    }

    info!("Found {} containers", containers.len());
    Ok(containers)
}

/// Get container stats (CPU, memory usage)
#[command]
pub async fn get_container_stats(
    token: String,
    entry_id: String,
    container_id: String,
) -> Result<ContainerStats, String> {
    info!("Getting stats for container: {}", container_id);

    let cmd = format!(
        r#"docker stats {} --no-stream --format '{{{{.Container}}}}|{{{{.Name}}}}|{{{{.CPUPerc}}}}|{{{{.MemUsage}}}}|{{{{.MemPerc}}}}|{{{{.NetIO}}}}|{{{{.BlockIO}}}}'"#,
        container_id
    );

    let output = execute_docker_command(&token, &entry_id, &cmd).await?;

    let line = output.lines().next().ok_or("No stats output")?;
    let parts: Vec<&str> = line.split('|').collect();
    if parts.len() < 7 {
        return Err("Invalid stats format".to_string());
    }

    // Parse memory usage (format: "123MiB / 1GiB")
    let mem_parts: Vec<&str> = parts[3].split('/').collect();
    let mem_usage = mem_parts.get(0).unwrap_or(&"0").trim().to_string();
    let mem_limit = mem_parts.get(1).unwrap_or(&"0").trim().to_string();

    // Parse CPU percent (format: "12.34%")
    let cpu_str = parts[2].trim_end_matches('%');
    let cpu_percent: f64 = cpu_str.parse().unwrap_or(0.0);

    // Parse memory percent
    let mem_pct_str = parts[4].trim_end_matches('%');
    let memory_percent: f64 = mem_pct_str.parse().unwrap_or(0.0);

    Ok(ContainerStats {
        container_id: parts[0].to_string(),
        name: parts[1].to_string(),
        cpu_percent,
        memory_usage: mem_usage,
        memory_limit: mem_limit,
        memory_percent,
        net_io: parts[5].to_string(),
        block_io: parts[6].to_string(),
    })
}

/// Start a Docker container
#[command]
pub async fn start_docker_container(
    token: String,
    entry_id: String,
    container_id: String,
) -> Result<String, String> {
    info!("Starting container: {}", container_id);
    let cmd = format!("docker start {}", container_id);
    let output = execute_docker_command(&token, &entry_id, &cmd).await?;
    info!("Container started: {}", container_id);
    Ok(output)
}

/// Stop a Docker container
#[command]
pub async fn stop_docker_container(
    token: String,
    entry_id: String,
    container_id: String,
) -> Result<String, String> {
    info!("Stopping container: {}", container_id);
    let cmd = format!("docker stop {}", container_id);
    let output = execute_docker_command(&token, &entry_id, &cmd).await?;
    info!("Container stopped: {}", container_id);
    Ok(output)
}

/// Restart a Docker container
#[command]
pub async fn restart_docker_container(
    token: String,
    entry_id: String,
    container_id: String,
) -> Result<String, String> {
    info!("Restarting container: {}", container_id);
    let cmd = format!("docker restart {}", container_id);
    let output = execute_docker_command(&token, &entry_id, &cmd).await?;
    info!("Container restarted: {}", container_id);
    Ok(output)
}

/// Get container logs
#[command]
pub async fn get_docker_logs(
    token: String,
    entry_id: String,
    container_id: String,
    tail: Option<u32>,
) -> Result<String, String> {
    info!("Getting logs for container: {}", container_id);
    let tail_arg = tail.unwrap_or(100);
    let cmd = format!("docker logs --tail {} {} 2>&1", tail_arg, container_id);
    execute_docker_command(&token, &entry_id, &cmd).await
}

/// List Docker images on a remote server
#[command]
pub async fn list_docker_images(token: String, entry_id: String) -> Result<Vec<DockerImage>, String> {
    info!("Listing Docker images for entry: {}", entry_id);

    let cmd = r#"docker images --format '{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedAt}}'"#;
    let output = execute_docker_command(&token, &entry_id, cmd).await?;
    let mut images = Vec::new();

    for line in output.lines() {
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() >= 5 {
            images.push(DockerImage {
                id: parts[0].to_string(),
                repository: parts[1].to_string(),
                tag: parts[2].to_string(),
                size: parts[3].to_string(),
                created: parts[4].to_string(),
            });
        }
    }

    info!("Found {} images", images.len());
    Ok(images)
}

/// Remove a Docker container
#[command]
pub async fn remove_docker_container(
    token: String,
    entry_id: String,
    container_id: String,
    force: bool,
) -> Result<String, String> {
    info!("Removing container: {}", container_id);
    let force_flag = if force { "-f" } else { "" };
    let cmd = format!("docker rm {} {}", force_flag, container_id);
    let output = execute_docker_command(&token, &entry_id, &cmd).await?;
    info!("Container removed: {}", container_id);
    Ok(output)
}

/// Pull a Docker image
#[command]
pub async fn pull_docker_image(
    token: String,
    entry_id: String,
    image: String,
) -> Result<String, String> {
    info!("Pulling image: {}", image);
    let cmd = format!("docker pull {}", image);
    let output = execute_docker_command(&token, &entry_id, &cmd).await?;
    info!("Image pulled: {}", image);
    Ok(output)
}

/// Check if Docker is available on the remote server
#[command]
pub async fn check_docker_available(token: String, entry_id: String) -> Result<bool, String> {
    info!("Checking Docker availability for entry: {}", entry_id);
    let cmd = "docker --version";
    match execute_docker_command(&token, &entry_id, cmd).await {
        Ok(output) => Ok(output.contains("Docker")),
        Err(_) => Ok(false),
    }
}
