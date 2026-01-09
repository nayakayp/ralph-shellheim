//! Known host model for SSH host key verification

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// Database row for known_hosts table
#[derive(Debug, Clone, FromRow)]
pub struct KnownHostRow {
    pub id: String,
    pub account_id: String,
    pub host: String,
    pub port: i32,
    pub key_type: String,
    pub fingerprint: String,
    pub public_key_base64: String,
    pub added_at: String,
    pub last_seen_at: String,
}

/// Known host response for API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnownHost {
    pub id: String,
    pub host: String,
    pub port: i32,
    pub key_type: String,
    pub fingerprint: String,
    pub added_at: String,
    pub last_seen_at: String,
}

impl From<KnownHostRow> for KnownHost {
    fn from(row: KnownHostRow) -> Self {
        Self {
            id: row.id,
            host: row.host,
            port: row.port,
            key_type: row.key_type,
            fingerprint: row.fingerprint,
            added_at: row.added_at,
            last_seen_at: row.last_seen_at,
        }
    }
}

/// Host key verification result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status")]
pub enum HostKeyStatus {
    /// Host key matches known host
    Known,
    /// Host is not in known_hosts (first connection)
    Unknown {
        key_type: String,
        fingerprint: String,
    },
    /// Host key has changed (potential MITM attack!)
    Changed {
        key_type: String,
        new_fingerprint: String,
        old_fingerprint: String,
    },
}

/// Request to add/trust a host key
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustHostKeyRequest {
    pub host: String,
    pub port: i32,
    pub key_type: String,
    pub fingerprint: String,
    pub public_key_base64: String,
    /// If true, replace existing key (for Changed status)
    pub replace: bool,
}
