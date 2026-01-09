//! Backup/Export data models

use serde::{Deserialize, Serialize};

/// Complete user data export
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportData {
    /// Export format version
    pub version: String,
    /// Export timestamp
    pub exported_at: String,
    /// Application name
    pub app: String,
    /// User data
    pub data: UserData,
}

/// All user data for export
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserData {
    /// Folders
    pub folders: Vec<ExportFolder>,
    /// Server entries (without encrypted fields)
    pub entries: Vec<ExportEntry>,
    /// Identities (credentials - without encrypted values)
    pub identities: Vec<ExportIdentity>,
    /// Tags
    pub tags: Vec<ExportTag>,
    /// Entry-tag relationships
    pub entry_tags: Vec<EntryTagRelation>,
    /// Entry-identity relationships
    pub entry_identities: Vec<EntryIdentityRelation>,
    /// Snippets
    pub snippets: Vec<ExportSnippet>,
}

/// Folder export format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportFolder {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub sort_order: i32,
}

/// Entry export format (no encrypted data)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportEntry {
    pub id: String,
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
}

/// Identity export format (no secrets, just metadata)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportIdentity {
    pub id: String,
    pub name: String,
    pub username: Option<String>,
    /// Indicates if password was set (not the actual password)
    pub has_password: bool,
    /// Indicates if SSH key was set (not the actual key)
    pub has_ssh_key: bool,
}

/// Tag export format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportTag {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
}

/// Entry-Tag relationship
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntryTagRelation {
    pub entry_id: String,
    pub tag_id: String,
}

/// Entry-Identity relationship
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntryIdentityRelation {
    pub entry_id: String,
    pub identity_id: String,
    pub priority: i32,
}

/// Snippet export format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportSnippet {
    pub id: String,
    pub name: String,
    pub content: String,
    pub description: Option<String>,
    pub category: Option<String>,
}

/// Import options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportOptions {
    /// Whether to merge with existing data or replace
    #[serde(default)]
    pub merge: bool,
    /// Import folders
    #[serde(default = "default_true")]
    pub import_folders: bool,
    /// Import entries
    #[serde(default = "default_true")]
    pub import_entries: bool,
    /// Import identities (metadata only)
    #[serde(default = "default_true")]
    pub import_identities: bool,
    /// Import tags
    #[serde(default = "default_true")]
    pub import_tags: bool,
    /// Import snippets
    #[serde(default = "default_true")]
    pub import_snippets: bool,
}

fn default_true() -> bool {
    true
}

impl Default for ImportOptions {
    fn default() -> Self {
        Self {
            merge: true,
            import_folders: true,
            import_entries: true,
            import_identities: true,
            import_tags: true,
            import_snippets: true,
        }
    }
}

/// Import result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub success: bool,
    pub folders_imported: i32,
    pub entries_imported: i32,
    pub identities_imported: i32,
    pub tags_imported: i32,
    pub snippets_imported: i32,
    pub errors: Vec<String>,
}
