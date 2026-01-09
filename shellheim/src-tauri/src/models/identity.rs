//! Identity (credentials) model

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Identity {
    pub id: String,
    pub account_id: String,
    pub name: String,
    pub username: Option<String>,
    #[serde(skip_serializing)]
    pub password_encrypted: Option<String>,
    #[serde(skip_serializing)]
    pub ssh_key_encrypted: Option<String>,
    #[serde(skip_serializing)]
    pub passphrase_encrypted: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Identity with decrypted fields (for internal use)
#[derive(Debug, Clone)]
pub struct DecryptedIdentity {
    pub id: String,
    pub name: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub ssh_key: Option<String>,
    pub passphrase: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateIdentityRequest {
    pub name: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub ssh_key: Option<String>,
    pub passphrase: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateIdentityRequest {
    pub name: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub ssh_key: Option<String>,
    pub passphrase: Option<String>,
}
