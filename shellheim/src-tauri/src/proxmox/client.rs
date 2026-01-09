//! Proxmox VE API Client
//! 
//! Communicates with Proxmox VE API for cluster management.

use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Proxmox API authentication ticket
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxmoxTicket {
    pub ticket: String,
    pub csrf_prevention_token: String,
    pub username: String,
}

/// Proxmox API response wrapper
#[derive(Debug, Deserialize)]
struct ProxmoxResponse<T> {
    data: T,
}

/// Proxmox ticket response
#[derive(Debug, Deserialize)]
struct TicketData {
    ticket: String,
    #[serde(rename = "CSRFPreventionToken")]
    csrf_prevention_token: String,
    username: String,
}

/// Node from /nodes endpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PveNode {
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

/// VM/Container from /nodes/{node}/qemu or /lxc endpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PveVm {
    pub vmid: i32,
    pub name: Option<String>,
    pub status: String,
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

/// VM/Container status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PveVmStatus {
    pub status: String,
    pub vmid: Option<i32>,
    pub name: Option<String>,
    pub uptime: Option<i64>,
    pub cpu: Option<f64>,
    pub mem: Option<i64>,
    pub maxmem: Option<i64>,
    pub disk: Option<i64>,
    pub maxdisk: Option<i64>,
}

/// Proxmox VE API client
pub struct ProxmoxClient {
    client: Client,
    base_url: String,
}

impl ProxmoxClient {
    /// Create a new Proxmox client
    /// 
    /// # Arguments
    /// * `host` - Proxmox server hostname or IP
    /// * `port` - Proxmox API port (default 8006)
    /// * `verify_ssl` - Whether to verify SSL certificates
    pub fn new(host: &str, port: i32, verify_ssl: bool) -> Result<Self, String> {
        let client = Client::builder()
            .danger_accept_invalid_certs(!verify_ssl)
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let base_url = format!("https://{}:{}/api2/json", host, port);

        Ok(Self { client, base_url })
    }

    /// Authenticate and get a ticket
    pub async fn create_ticket(&self, username: &str, password: &str) -> Result<ProxmoxTicket, String> {
        let url = format!("{}/access/ticket", self.base_url);
        
        let response = self.client
            .post(&url)
            .form(&[("username", username), ("password", password)])
            .send()
            .await
            .map_err(|e| format!("Failed to connect to Proxmox: {}", e))?;

        if response.status() == StatusCode::UNAUTHORIZED {
            return Err("Invalid username or password".to_string());
        }

        if !response.status().is_success() {
            return Err(format!("Proxmox API error: {}", response.status()));
        }

        let result: ProxmoxResponse<TicketData> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse ticket response: {}", e))?;

        Ok(ProxmoxTicket {
            ticket: result.data.ticket,
            csrf_prevention_token: result.data.csrf_prevention_token,
            username: result.data.username,
        })
    }

    /// Get all nodes in the cluster
    pub async fn get_nodes(&self, ticket: &ProxmoxTicket) -> Result<Vec<PveNode>, String> {
        let url = format!("{}/nodes", self.base_url);
        
        let response = self.client
            .get(&url)
            .header("Cookie", format!("PVEAuthCookie={}", ticket.ticket))
            .send()
            .await
            .map_err(|e| format!("Failed to get nodes: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to get nodes: {}", response.status()));
        }

        let result: ProxmoxResponse<Vec<PveNode>> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse nodes response: {}", e))?;

        Ok(result.data)
    }

    /// Get QEMU VMs for a node
    pub async fn get_qemu_vms(&self, ticket: &ProxmoxTicket, node: &str) -> Result<Vec<PveVm>, String> {
        let url = format!("{}/nodes/{}/qemu", self.base_url, node);
        
        let response = self.client
            .get(&url)
            .header("Cookie", format!("PVEAuthCookie={}", ticket.ticket))
            .send()
            .await
            .map_err(|e| format!("Failed to get VMs: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to get VMs: {}", response.status()));
        }

        let result: ProxmoxResponse<Vec<PveVm>> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse VMs response: {}", e))?;

        Ok(result.data)
    }

    /// Get LXC containers for a node
    pub async fn get_lxc_containers(&self, ticket: &ProxmoxTicket, node: &str) -> Result<Vec<PveVm>, String> {
        let url = format!("{}/nodes/{}/lxc", self.base_url, node);
        
        let response = self.client
            .get(&url)
            .header("Cookie", format!("PVEAuthCookie={}", ticket.ticket))
            .send()
            .await
            .map_err(|e| format!("Failed to get containers: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to get containers: {}", response.status()));
        }

        let result: ProxmoxResponse<Vec<PveVm>> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse containers response: {}", e))?;

        Ok(result.data)
    }

    /// Get status of a VM or container
    pub async fn get_vm_status(
        &self,
        ticket: &ProxmoxTicket,
        node: &str,
        vmid: i32,
        vm_type: &str, // "qemu" or "lxc"
    ) -> Result<PveVmStatus, String> {
        let url = format!("{}/nodes/{}/{}/{}/status/current", self.base_url, node, vm_type, vmid);
        
        let response = self.client
            .get(&url)
            .header("Cookie", format!("PVEAuthCookie={}", ticket.ticket))
            .send()
            .await
            .map_err(|e| format!("Failed to get VM status: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to get VM status: {}", response.status()));
        }

        let result: ProxmoxResponse<PveVmStatus> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse VM status: {}", e))?;

        Ok(result.data)
    }

    /// Start a VM or container
    pub async fn start_vm(
        &self,
        ticket: &ProxmoxTicket,
        node: &str,
        vmid: i32,
        vm_type: &str,
    ) -> Result<String, String> {
        let url = format!("{}/nodes/{}/{}/{}/status/start", self.base_url, node, vm_type, vmid);
        
        let response = self.client
            .post(&url)
            .header("Cookie", format!("PVEAuthCookie={}", ticket.ticket))
            .header("CSRFPreventionToken", &ticket.csrf_prevention_token)
            .send()
            .await
            .map_err(|e| format!("Failed to start VM: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to start VM: {}", response.status()));
        }

        Ok("Started".to_string())
    }

    /// Stop a VM or container (force)
    pub async fn stop_vm(
        &self,
        ticket: &ProxmoxTicket,
        node: &str,
        vmid: i32,
        vm_type: &str,
    ) -> Result<String, String> {
        let url = format!("{}/nodes/{}/{}/{}/status/stop", self.base_url, node, vm_type, vmid);
        
        let response = self.client
            .post(&url)
            .header("Cookie", format!("PVEAuthCookie={}", ticket.ticket))
            .header("CSRFPreventionToken", &ticket.csrf_prevention_token)
            .send()
            .await
            .map_err(|e| format!("Failed to stop VM: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to stop VM: {}", response.status()));
        }

        Ok("Stopped".to_string())
    }

    /// Shutdown a VM or container (graceful)
    pub async fn shutdown_vm(
        &self,
        ticket: &ProxmoxTicket,
        node: &str,
        vmid: i32,
        vm_type: &str,
    ) -> Result<String, String> {
        let url = format!("{}/nodes/{}/{}/{}/status/shutdown", self.base_url, node, vm_type, vmid);
        
        let response = self.client
            .post(&url)
            .header("Cookie", format!("PVEAuthCookie={}", ticket.ticket))
            .header("CSRFPreventionToken", &ticket.csrf_prevention_token)
            .send()
            .await
            .map_err(|e| format!("Failed to shutdown VM: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to shutdown VM: {}", response.status()));
        }

        Ok("Shutting down".to_string())
    }

    /// Open LXC console (returns VNC ticket for WebSocket connection)
    pub async fn open_lxc_console(
        &self,
        ticket: &ProxmoxTicket,
        node: &str,
        vmid: i32,
    ) -> Result<LxcConsoleTicket, String> {
        let url = format!("{}/nodes/{}/lxc/{}/termproxy", self.base_url, node, vmid);
        
        let response = self.client
            .post(&url)
            .header("Cookie", format!("PVEAuthCookie={}", ticket.ticket))
            .header("CSRFPreventionToken", &ticket.csrf_prevention_token)
            .send()
            .await
            .map_err(|e| format!("Failed to open console: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to open console: {}", response.status()));
        }

        let result: ProxmoxResponse<LxcConsoleTicket> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse console response: {}", e))?;

        Ok(result.data)
    }

    /// Open QEMU VNC console
    pub async fn open_vnc_console(
        &self,
        ticket: &ProxmoxTicket,
        node: &str,
        vmid: i32,
    ) -> Result<VncConsoleTicket, String> {
        let url = format!("{}/nodes/{}/qemu/{}/vncproxy", self.base_url, node, vmid);
        
        let response = self.client
            .post(&url)
            .header("Cookie", format!("PVEAuthCookie={}", ticket.ticket))
            .header("CSRFPreventionToken", &ticket.csrf_prevention_token)
            .send()
            .await
            .map_err(|e| format!("Failed to open VNC: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to open VNC: {}", response.status()));
        }

        let result: ProxmoxResponse<VncConsoleTicket> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse VNC response: {}", e))?;

        Ok(result.data)
    }
}

/// LXC console ticket for WebSocket connection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LxcConsoleTicket {
    pub port: String,
    pub ticket: String,
    pub user: String,
}

/// VNC console ticket
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VncConsoleTicket {
    pub port: i32,
    pub ticket: String,
    pub user: String,
    pub cert: Option<String>,
    pub upid: Option<String>,
}
