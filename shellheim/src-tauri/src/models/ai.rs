//! AI settings and command generation models

use serde::{Deserialize, Serialize};

/// AI settings stored in database
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AiSettings {
    pub id: String,
    pub account_id: String,
    #[serde(skip_serializing)]
    pub api_key_encrypted: Option<String>,
    pub api_endpoint: String,
    pub model: String,
    pub temperature: f64,
    pub system_prompt: Option<String>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// AI settings info returned to frontend (without encrypted key)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiSettingsInfo {
    pub id: String,
    pub account_id: String,
    pub has_api_key: bool,
    pub api_endpoint: String,
    pub model: String,
    pub temperature: f64,
    pub system_prompt: Option<String>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

impl From<AiSettings> for AiSettingsInfo {
    fn from(settings: AiSettings) -> Self {
        Self {
            id: settings.id,
            account_id: settings.account_id,
            has_api_key: settings.api_key_encrypted.is_some(),
            api_endpoint: settings.api_endpoint,
            model: settings.model,
            temperature: settings.temperature,
            system_prompt: settings.system_prompt,
            enabled: settings.enabled,
            created_at: settings.created_at,
            updated_at: settings.updated_at,
        }
    }
}

/// Request to update AI settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateAiSettingsRequest {
    pub api_key: Option<String>,
    pub api_endpoint: Option<String>,
    pub model: Option<String>,
    pub temperature: Option<f64>,
    pub system_prompt: Option<String>,
    pub enabled: Option<bool>,
}

/// Request to generate a command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateCommandRequest {
    pub prompt: String,
    /// Server OS context (e.g., "Ubuntu 22.04", "CentOS 8")
    pub server_os: Option<String>,
    /// Shell type (e.g., "bash", "zsh", "sh")
    pub shell_type: Option<String>,
    /// Current working directory
    pub current_directory: Option<String>,
}

/// Response from command generation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateCommandResponse {
    pub command: String,
    pub explanation: Option<String>,
    pub warnings: Vec<String>,
}

/// Message format for OpenAI-compatible chat API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

/// OpenAI-compatible chat completion request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<AiMessage>,
    pub temperature: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
}

/// OpenAI-compatible chat completion response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionResponse {
    pub id: String,
    pub object: String,
    pub created: i64,
    pub model: String,
    pub choices: Vec<ChatChoice>,
    pub usage: Option<ChatUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatChoice {
    pub index: i32,
    pub message: AiMessage,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// Test connection response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestConnectionResponse {
    pub success: bool,
    pub message: String,
    pub model_available: bool,
}
