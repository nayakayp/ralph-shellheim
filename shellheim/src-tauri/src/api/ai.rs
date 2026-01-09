//! AI command suggestion API handlers
//!
//! Provides OpenAI-compatible API integration for generating shell commands
//! from natural language prompts.

use crate::db;
use crate::models::{
    AiMessage, AiSettings, AiSettingsInfo, ChatCompletionRequest, ChatCompletionResponse,
    GenerateCommandRequest, GenerateCommandResponse, TestConnectionResponse,
    UpdateAiSettingsRequest,
};
use crate::utils::encryption;
use sqlx::Row;
use tauri::command;
use tracing::{error, info};
use uuid::Uuid;

/// Master encryption key - in production, this should be derived from user's password
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

/// Encrypt a string if present
fn encrypt_value(value: &str, key: &[u8; 32]) -> Result<String, String> {
    encryption::encrypt(value, key).map_err(|e| format!("Encryption error: {}", e))
}

/// Decrypt a string if present
fn decrypt_value(value: &str, key: &[u8; 32]) -> Result<String, String> {
    encryption::decrypt(value, key).map_err(|e| format!("Decryption error: {}", e))
}

/// Get AI settings for the current user
#[command]
pub async fn get_ai_settings(token: String) -> Result<AiSettingsInfo, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Getting AI settings for account: {}", account_id);

    let pool = db::pool();

    let settings: Option<AiSettings> = sqlx::query_as(
        "SELECT * FROM ai_settings WHERE account_id = ? LIMIT 1",
    )
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    match settings {
        Some(s) => Ok(AiSettingsInfo::from(s)),
        None => {
            // Return default settings if none exist
            Ok(AiSettingsInfo {
                id: String::new(),
                account_id,
                has_api_key: false,
                api_endpoint: "https://api.openai.com/v1".to_string(),
                model: "gpt-4o-mini".to_string(),
                temperature: 0.7,
                system_prompt: None,
                enabled: false,
                created_at: String::new(),
                updated_at: String::new(),
            })
        }
    }
}

/// Update AI settings
#[command]
pub async fn update_ai_settings(
    token: String,
    request: UpdateAiSettingsRequest,
) -> Result<AiSettingsInfo, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Updating AI settings for account: {}", account_id);

    let key = get_encryption_key();
    let pool = db::pool();
    let now = chrono::Utc::now().to_rfc3339();

    // Check if settings exist
    let existing: Option<AiSettings> = sqlx::query_as(
        "SELECT * FROM ai_settings WHERE account_id = ? LIMIT 1",
    )
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    let settings = if let Some(existing) = existing {
        // Update existing settings
        let api_key_encrypted = if let Some(ref api_key) = request.api_key {
            if api_key.is_empty() {
                None
            } else {
                Some(encrypt_value(api_key, &key)?)
            }
        } else {
            existing.api_key_encrypted
        };

        let api_endpoint = request.api_endpoint.unwrap_or(existing.api_endpoint);
        let model = request.model.unwrap_or(existing.model);
        let temperature = request.temperature.unwrap_or(existing.temperature);
        let system_prompt = if request.system_prompt.is_some() {
            request.system_prompt
        } else {
            existing.system_prompt
        };
        let enabled = request.enabled.unwrap_or(existing.enabled);

        sqlx::query(
            r#"
            UPDATE ai_settings SET
                api_key_encrypted = ?, api_endpoint = ?, model = ?,
                temperature = ?, system_prompt = ?, enabled = ?, updated_at = ?
            WHERE account_id = ?
            "#,
        )
        .bind(&api_key_encrypted)
        .bind(&api_endpoint)
        .bind(&model)
        .bind(temperature)
        .bind(&system_prompt)
        .bind(enabled)
        .bind(&now)
        .bind(&account_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to update AI settings: {}", e))?;

        AiSettings {
            id: existing.id,
            account_id,
            api_key_encrypted,
            api_endpoint,
            model,
            temperature,
            system_prompt,
            enabled,
            created_at: existing.created_at,
            updated_at: now,
        }
    } else {
        // Create new settings
        let id = Uuid::new_v4().to_string();

        let api_key_encrypted = if let Some(ref api_key) = request.api_key {
            if api_key.is_empty() {
                None
            } else {
                Some(encrypt_value(api_key, &key)?)
            }
        } else {
            None
        };

        let api_endpoint = request
            .api_endpoint
            .unwrap_or_else(|| "https://api.openai.com/v1".to_string());
        let model = request
            .model
            .unwrap_or_else(|| "gpt-4o-mini".to_string());
        let temperature = request.temperature.unwrap_or(0.7);
        let system_prompt = request.system_prompt;
        let enabled = request.enabled.unwrap_or(false);

        sqlx::query(
            r#"
            INSERT INTO ai_settings (
                id, account_id, api_key_encrypted, api_endpoint, model,
                temperature, system_prompt, enabled, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(&account_id)
        .bind(&api_key_encrypted)
        .bind(&api_endpoint)
        .bind(&model)
        .bind(temperature)
        .bind(&system_prompt)
        .bind(enabled)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to create AI settings: {}", e))?;

        AiSettings {
            id,
            account_id,
            api_key_encrypted,
            api_endpoint,
            model,
            temperature,
            system_prompt,
            enabled,
            created_at: now.clone(),
            updated_at: now,
        }
    };

    info!("AI settings updated successfully");
    Ok(AiSettingsInfo::from(settings))
}

/// Test AI API connection
#[command]
pub async fn test_ai_connection(token: String) -> Result<TestConnectionResponse, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!("Testing AI connection for account: {}", account_id);

    let key = get_encryption_key();
    let pool = db::pool();

    let settings: AiSettings = sqlx::query_as(
        "SELECT * FROM ai_settings WHERE account_id = ? LIMIT 1",
    )
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "AI settings not configured".to_string())?;

    let api_key = settings
        .api_key_encrypted
        .as_ref()
        .map(|k| decrypt_value(k, &key))
        .transpose()?
        .ok_or_else(|| "API key not configured".to_string())?;

    // Make a simple test request
    let client = reqwest::Client::new();
    let url = format!("{}/chat/completions", settings.api_endpoint.trim_end_matches('/'));

    let request = ChatCompletionRequest {
        model: settings.model.clone(),
        messages: vec![AiMessage {
            role: "user".to_string(),
            content: "Say 'test successful' in exactly two words.".to_string(),
        }],
        temperature: 0.0,
        max_tokens: Some(10),
    };

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    if response.status().is_success() {
        let _body: ChatCompletionResponse = response
            .json()
            .await
            .map_err(|e| format!("Invalid response format: {}", e))?;

        Ok(TestConnectionResponse {
            success: true,
            message: "Connection successful".to_string(),
            model_available: true,
        })
    } else {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        error!("AI API error: {} - {}", status, error_text);

        Ok(TestConnectionResponse {
            success: false,
            message: format!("API error ({}): {}", status, error_text),
            model_available: false,
        })
    }
}

/// Generate a shell command from natural language
#[command]
pub async fn generate_command(
    token: String,
    request: GenerateCommandRequest,
) -> Result<GenerateCommandResponse, String> {
    let account_id = get_account_id_from_token(&token).await?;
    info!(
        "Generating command for account: {}, prompt: {}",
        account_id, request.prompt
    );

    let key = get_encryption_key();
    let pool = db::pool();

    let settings: AiSettings = sqlx::query_as(
        "SELECT * FROM ai_settings WHERE account_id = ? LIMIT 1",
    )
    .bind(&account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "AI settings not configured".to_string())?;

    if !settings.enabled {
        return Err("AI command generation is disabled".to_string());
    }

    let api_key = settings
        .api_key_encrypted
        .as_ref()
        .map(|k| decrypt_value(k, &key))
        .transpose()?
        .ok_or_else(|| "API key not configured".to_string())?;

    // Build system prompt with context
    let mut system_parts = vec![
        "You are a shell command assistant. Generate shell commands based on user requests.".to_string(),
        "IMPORTANT: Respond ONLY with a JSON object in this exact format:".to_string(),
        r#"{"command": "the shell command", "explanation": "brief explanation", "warnings": ["warning1", "warning2"]}"#.to_string(),
        "Do not include any other text before or after the JSON.".to_string(),
    ];

    if let Some(ref os) = request.server_os {
        system_parts.push(format!("Target OS: {}", os));
    }

    if let Some(ref shell) = request.shell_type {
        system_parts.push(format!("Shell: {}", shell));
    }

    if let Some(ref cwd) = request.current_directory {
        system_parts.push(format!("Current directory: {}", cwd));
    }

    // Add custom system prompt if configured
    if let Some(ref custom_prompt) = settings.system_prompt {
        if !custom_prompt.is_empty() {
            system_parts.push(format!("Additional context: {}", custom_prompt));
        }
    }

    let system_prompt = system_parts.join("\n");

    let client = reqwest::Client::new();
    let url = format!(
        "{}/chat/completions",
        settings.api_endpoint.trim_end_matches('/')
    );

    let chat_request = ChatCompletionRequest {
        model: settings.model,
        messages: vec![
            AiMessage {
                role: "system".to_string(),
                content: system_prompt,
            },
            AiMessage {
                role: "user".to_string(),
                content: request.prompt,
            },
        ],
        temperature: settings.temperature,
        max_tokens: Some(500),
    };

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&chat_request)
        .send()
        .await
        .map_err(|e| format!("API request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        error!("AI API error: {} - {}", status, error_text);
        return Err(format!("API error ({}): {}", status, error_text));
    }

    let completion: ChatCompletionResponse = response
        .json()
        .await
        .map_err(|e| format!("Invalid response format: {}", e))?;

    let content = completion
        .choices
        .first()
        .map(|c| c.message.content.clone())
        .ok_or_else(|| "No response from AI".to_string())?;

    // Parse the JSON response
    parse_command_response(&content)
}

/// Parse the AI response into a structured command response
fn parse_command_response(content: &str) -> Result<GenerateCommandResponse, String> {
    // Try to parse as JSON first
    if let Ok(response) = serde_json::from_str::<GenerateCommandResponse>(content) {
        return Ok(response);
    }

    // Try to extract JSON from the response (in case there's extra text)
    if let Some(start) = content.find('{') {
        if let Some(end) = content.rfind('}') {
            let json_str = &content[start..=end];
            if let Ok(response) = serde_json::from_str::<GenerateCommandResponse>(json_str) {
                return Ok(response);
            }
        }
    }

    // Fallback: treat the entire content as the command
    let content_trimmed = content.trim();
    
    // Remove markdown code blocks if present
    let command = if content_trimmed.starts_with("```") {
        content_trimmed
            .lines()
            .skip(1)
            .take_while(|l| !l.starts_with("```"))
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        content_trimmed.to_string()
    };

    Ok(GenerateCommandResponse {
        command,
        explanation: None,
        warnings: vec![],
    })
}
