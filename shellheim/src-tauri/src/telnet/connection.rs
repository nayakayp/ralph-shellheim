//! Telnet connection request/response types

use serde::{Deserialize, Serialize};

/// Request to establish a Telnet connection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelnetConnectRequest {
    /// Entry ID to connect to
    pub entry_id: String,
    /// Terminal columns
    pub cols: u32,
    /// Terminal rows
    pub rows: u32,
}

/// Active Telnet session info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelnetSessionInfo {
    /// Unique session identifier
    pub session_id: String,
    /// Entry ID this session is connected to
    pub entry_id: String,
    /// Remote host
    pub host: String,
    /// Remote port
    pub port: u16,
    /// When the session was created (ISO 8601)
    pub connected_at: String,
}

/// Request to send data to a Telnet session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelnetSendDataRequest {
    /// Session to send data to
    pub session_id: String,
    /// Data to send (UTF-8 string)
    pub data: String,
}

/// Request to resize Telnet terminal (NAWS option if supported)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelnetResizeRequest {
    /// Session to resize
    pub session_id: String,
    /// New column count
    pub cols: u32,
    /// New row count  
    pub rows: u32,
}
