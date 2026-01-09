//! Encryption utilities for credential storage
//!
//! Uses AES-GCM for encrypting sensitive data like passwords and SSH keys.

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rand::RngCore;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum EncryptionError {
    #[error("Encryption failed: {0}")]
    EncryptionFailed(String),
    
    #[error("Decryption failed: {0}")]
    DecryptionFailed(String),
    
    #[error("Invalid key")]
    InvalidKey,
    
    #[error("Base64 decode error: {0}")]
    Base64Error(String),
}

/// Encrypt data using AES-256-GCM
pub fn encrypt(plaintext: &str, key: &[u8; 32]) -> Result<String, EncryptionError> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|_| EncryptionError::InvalidKey)?;
    
    // Generate random nonce
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    // Encrypt
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| EncryptionError::EncryptionFailed(e.to_string()))?;
    
    // Combine nonce + ciphertext and encode as base64
    let mut combined = nonce_bytes.to_vec();
    combined.extend(ciphertext);
    
    Ok(BASE64.encode(combined))
}

/// Decrypt data using AES-256-GCM
pub fn decrypt(ciphertext_b64: &str, key: &[u8; 32]) -> Result<String, EncryptionError> {
    let combined = BASE64
        .decode(ciphertext_b64)
        .map_err(|e| EncryptionError::Base64Error(e.to_string()))?;
    
    if combined.len() < 12 {
        return Err(EncryptionError::DecryptionFailed("Data too short".to_string()));
    }
    
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|_| EncryptionError::InvalidKey)?;
    
    let nonce = Nonce::from_slice(&combined[..12]);
    let ciphertext = &combined[12..];
    
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| EncryptionError::DecryptionFailed(e.to_string()))?;
    
    String::from_utf8(plaintext)
        .map_err(|e| EncryptionError::DecryptionFailed(e.to_string()))
}

/// Derive encryption key from password using Argon2
pub fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; 32], EncryptionError> {
    use argon2::{Argon2, PasswordHasher};
    use argon2::password_hash::SaltString;
    
    let salt_str = SaltString::encode_b64(salt)
        .map_err(|e| EncryptionError::EncryptionFailed(e.to_string()))?;
    
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt_str)
        .map_err(|e| EncryptionError::EncryptionFailed(e.to_string()))?;
    
    let hash_bytes = hash.hash.ok_or_else(|| {
        EncryptionError::EncryptionFailed("Hash generation failed".to_string())
    })?;
    
    let mut key = [0u8; 32];
    key.copy_from_slice(&hash_bytes.as_bytes()[..32]);
    Ok(key)
}

/// Generate a random 32-byte key
pub fn generate_key() -> [u8; 32] {
    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);
    key
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt() {
        let key = generate_key();
        let plaintext = "Hello, World! 🔐";
        
        let encrypted = encrypt(plaintext, &key).unwrap();
        let decrypted = decrypt(&encrypted, &key).unwrap();
        
        assert_eq!(plaintext, decrypted);
    }
}
