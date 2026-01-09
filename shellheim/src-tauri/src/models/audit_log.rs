//! Audit log model for tracking user actions

use serde::{Deserialize, Serialize};

/// Action types for audit logging
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AuditAction {
    // Authentication
    Login,
    Logout,
    LoginFailed,
    
    // Server entries
    EntryCreate,
    EntryUpdate,
    EntryDelete,
    
    // Identities
    IdentityCreate,
    IdentityUpdate,
    IdentityDelete,
    
    // Folders
    FolderCreate,
    FolderUpdate,
    FolderDelete,
    
    // SSH/SFTP
    SshConnect,
    SshDisconnect,
    SftpConnect,
    SftpDisconnect,
    
    // File operations
    FileUpload,
    FileDownload,
    FileDelete,
    FileCreate,
    FileRename,
    FileEdit,
    
    // Tunnels
    TunnelCreate,
    TunnelClose,
    
    // Recordings
    RecordingStart,
    RecordingStop,
    RecordingDelete,
    
    // Snippets
    SnippetCreate,
    SnippetUpdate,
    SnippetDelete,
    SnippetExecute,
    
    // Settings
    SettingsUpdate,
    PasswordChange,
}

impl std::fmt::Display for AuditAction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            AuditAction::Login => "LOGIN",
            AuditAction::Logout => "LOGOUT",
            AuditAction::LoginFailed => "LOGIN_FAILED",
            AuditAction::EntryCreate => "ENTRY_CREATE",
            AuditAction::EntryUpdate => "ENTRY_UPDATE",
            AuditAction::EntryDelete => "ENTRY_DELETE",
            AuditAction::IdentityCreate => "IDENTITY_CREATE",
            AuditAction::IdentityUpdate => "IDENTITY_UPDATE",
            AuditAction::IdentityDelete => "IDENTITY_DELETE",
            AuditAction::FolderCreate => "FOLDER_CREATE",
            AuditAction::FolderUpdate => "FOLDER_UPDATE",
            AuditAction::FolderDelete => "FOLDER_DELETE",
            AuditAction::SshConnect => "SSH_CONNECT",
            AuditAction::SshDisconnect => "SSH_DISCONNECT",
            AuditAction::SftpConnect => "SFTP_CONNECT",
            AuditAction::SftpDisconnect => "SFTP_DISCONNECT",
            AuditAction::FileUpload => "FILE_UPLOAD",
            AuditAction::FileDownload => "FILE_DOWNLOAD",
            AuditAction::FileDelete => "FILE_DELETE",
            AuditAction::FileCreate => "FILE_CREATE",
            AuditAction::FileRename => "FILE_RENAME",
            AuditAction::FileEdit => "FILE_EDIT",
            AuditAction::TunnelCreate => "TUNNEL_CREATE",
            AuditAction::TunnelClose => "TUNNEL_CLOSE",
            AuditAction::RecordingStart => "RECORDING_START",
            AuditAction::RecordingStop => "RECORDING_STOP",
            AuditAction::RecordingDelete => "RECORDING_DELETE",
            AuditAction::SnippetCreate => "SNIPPET_CREATE",
            AuditAction::SnippetUpdate => "SNIPPET_UPDATE",
            AuditAction::SnippetDelete => "SNIPPET_DELETE",
            AuditAction::SnippetExecute => "SNIPPET_EXECUTE",
            AuditAction::SettingsUpdate => "SETTINGS_UPDATE",
            AuditAction::PasswordChange => "PASSWORD_CHANGE",
        };
        write!(f, "{}", s)
    }
}

/// Resource types for audit logs
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ResourceType {
    Entry,
    Identity,
    Folder,
    Session,
    Recording,
    Snippet,
    Tunnel,
    File,
    Account,
}

impl std::fmt::Display for ResourceType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            ResourceType::Entry => "entry",
            ResourceType::Identity => "identity",
            ResourceType::Folder => "folder",
            ResourceType::Session => "session",
            ResourceType::Recording => "recording",
            ResourceType::Snippet => "snippet",
            ResourceType::Tunnel => "tunnel",
            ResourceType::File => "file",
            ResourceType::Account => "account",
        };
        write!(f, "{}", s)
    }
}

/// Audit log entry stored in database
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AuditLog {
    pub id: String,
    pub account_id: String,
    pub action: String,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    pub resource_name: Option<String>,
    pub details: Option<String>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub created_at: String,
}

/// Audit log info for frontend display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLogInfo {
    pub id: String,
    pub action: String,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    pub resource_name: Option<String>,
    pub details: Option<serde_json::Value>,
    pub created_at: String,
}

impl From<AuditLog> for AuditLogInfo {
    fn from(log: AuditLog) -> Self {
        let details = log.details.as_ref().and_then(|d| serde_json::from_str(d).ok());
        Self {
            id: log.id,
            action: log.action,
            resource_type: log.resource_type,
            resource_id: log.resource_id,
            resource_name: log.resource_name,
            details,
            created_at: log.created_at,
        }
    }
}

/// Request to create an audit log entry
#[derive(Debug, Clone)]
pub struct CreateAuditLog {
    pub account_id: String,
    pub action: AuditAction,
    pub resource_type: Option<ResourceType>,
    pub resource_id: Option<String>,
    pub resource_name: Option<String>,
    pub details: Option<serde_json::Value>,
}

/// Filter options for listing audit logs
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AuditLogFilter {
    pub action: Option<String>,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    pub from_date: Option<String>,
    pub to_date: Option<String>,
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}
