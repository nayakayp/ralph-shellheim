//! Script model for automated command execution

use serde::{Deserialize, Serialize};

/// Target operating system for script execution
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ScriptOs {
    #[default]
    Any,
    Linux,
    Ubuntu,
    Debian,
    Centos,
    Fedora,
    Alpine,
    Macos,
    Windows,
    Proxmox,
}

impl ScriptOs {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "linux" => Self::Linux,
            "ubuntu" => Self::Ubuntu,
            "debian" => Self::Debian,
            "centos" => Self::Centos,
            "fedora" => Self::Fedora,
            "alpine" => Self::Alpine,
            "macos" | "darwin" => Self::Macos,
            "windows" => Self::Windows,
            "proxmox" | "pve" => Self::Proxmox,
            _ => Self::Any,
        }
    }
    
    pub fn as_str(&self) -> &str {
        match self {
            Self::Any => "any",
            Self::Linux => "linux",
            Self::Ubuntu => "ubuntu",
            Self::Debian => "debian",
            Self::Centos => "centos",
            Self::Fedora => "fedora",
            Self::Alpine => "alpine",
            Self::Macos => "macos",
            Self::Windows => "windows",
            Self::Proxmox => "proxmox",
        }
    }
}

/// Script database row
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Script {
    pub id: String,
    pub account_id: String,
    pub name: String,
    pub content: String,
    pub description: Option<String>,
    pub category: Option<String>,
    /// Target OS (stored as string in SQLite)
    pub target_os: String,
    /// Shell interpreter (bash, sh, powershell, etc.)
    pub interpreter: String,
    /// Run as sudo if true
    pub run_as_sudo: bool,
    /// Timeout in seconds (0 = no timeout)
    pub timeout_seconds: i32,
    pub created_at: String,
    pub updated_at: String,
}

/// Request to create a new script
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateScriptRequest {
    pub name: String,
    pub content: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub target_os: Option<String>,
    pub interpreter: Option<String>,
    pub run_as_sudo: Option<bool>,
    pub timeout_seconds: Option<i32>,
}

/// Request to update an existing script
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateScriptRequest {
    pub name: Option<String>,
    pub content: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
    pub target_os: Option<String>,
    pub interpreter: Option<String>,
    pub run_as_sudo: Option<bool>,
    pub timeout_seconds: Option<i32>,
}

/// Request to execute a script on a server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecuteScriptRequest {
    /// Script ID to execute
    pub script_id: String,
    /// Entry ID (server) to execute on
    pub entry_id: String,
    /// Identity ID for SSH credentials
    pub identity_id: String,
    /// Optional environment variables
    pub env_vars: Option<std::collections::HashMap<String, String>>,
}

/// Result of script execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptExecutionResult {
    pub script_id: String,
    pub entry_id: String,
    pub success: bool,
    pub exit_code: i32,
    pub output: String,
    pub executed_at: String,
    pub duration_ms: u64,
}
