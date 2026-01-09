//! Session model

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Session {
    pub id: String,
    pub account_id: String,
    pub token: String,
    pub expires_at: String,
    pub created_at: String,
}
