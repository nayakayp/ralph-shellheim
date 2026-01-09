//! Telnet Client implementation
//!
//! Handles Telnet connections with basic protocol negotiation.

use std::sync::Arc;
use tauri::AppHandle;
use tauri::Emitter;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tracing::{debug, error, info, warn};

/// Telnet protocol constants
mod telnet_protocol {
    pub const IAC: u8 = 255;  // Interpret As Command
    pub const DONT: u8 = 254;
    pub const DO: u8 = 253;
    pub const WONT: u8 = 252;
    pub const WILL: u8 = 251;
    pub const SB: u8 = 250;   // Sub-negotiation Begin
    pub const SE: u8 = 240;   // Sub-negotiation End
    
    // Options
    pub const OPT_ECHO: u8 = 1;
    pub const OPT_SGA: u8 = 3;  // Suppress Go Ahead
    pub const OPT_NAWS: u8 = 31; // Negotiate About Window Size
    pub const OPT_TERMINAL_TYPE: u8 = 24;
}

/// Event payload for Telnet data
#[derive(Clone, serde::Serialize)]
pub struct TelnetDataEvent {
    pub session_id: String,
    pub data: String,
}

/// Event payload for Telnet close
#[derive(Clone, serde::Serialize)]
pub struct TelnetCloseEvent {
    pub session_id: String,
    pub reason: String,
}

/// Active Telnet connection
pub struct TelnetConnection {
    /// Session ID for this connection
    session_id: String,
    /// TCP stream writer half (wrapped in Mutex for shared access)
    writer: Arc<Mutex<tokio::net::tcp::OwnedWriteHalf>>,
    /// Terminal dimensions
    pub cols: u32,
    pub rows: u32,
    /// Whether NAWS (window size negotiation) is enabled
    naws_enabled: Arc<Mutex<bool>>,
    /// Shutdown signal sender
    shutdown_tx: tokio::sync::watch::Sender<bool>,
}

impl TelnetConnection {
    /// Send data to the Telnet connection
    pub async fn send_data(&self, data: &[u8]) -> Result<(), String> {
        let mut writer = self.writer.lock().await;
        writer
            .write_all(data)
            .await
            .map_err(|e| format!("Failed to send data: {}", e))?;
        writer
            .flush()
            .await
            .map_err(|e| format!("Failed to flush: {}", e))
    }

    /// Resize the terminal (sends NAWS if negotiated)
    pub async fn resize(&self, cols: u32, rows: u32) -> Result<(), String> {
        let naws = *self.naws_enabled.lock().await;
        if naws {
            let naws_data = vec![
                telnet_protocol::IAC,
                telnet_protocol::SB,
                telnet_protocol::OPT_NAWS,
                (cols >> 8) as u8,
                (cols & 0xFF) as u8,
                (rows >> 8) as u8,
                (rows & 0xFF) as u8,
                telnet_protocol::IAC,
                telnet_protocol::SE,
            ];
            self.send_data(&naws_data).await?;
            info!("Telnet[{}] sent NAWS resize: {}x{}", self.session_id, cols, rows);
        }
        Ok(())
    }

    /// Close the connection
    pub async fn close(self) -> Result<(), String> {
        // Signal shutdown to the reader task
        let _ = self.shutdown_tx.send(true);
        
        // Close the writer
        let mut writer = self.writer.lock().await;
        if let Err(e) = writer.shutdown().await {
            warn!("Error shutting down Telnet connection: {}", e);
        }
        
        info!("Telnet[{}] connection closed", self.session_id);
        Ok(())
    }
}

/// Connect to a Telnet server
pub async fn connect(
    session_id: String,
    host: &str,
    port: u16,
    cols: u32,
    rows: u32,
    app_handle: AppHandle,
) -> Result<TelnetConnection, String> {
    info!("Telnet[{}] connecting to {}:{}", session_id, host, port);

    // Connect via TCP
    let stream = TcpStream::connect((host, port))
        .await
        .map_err(|e| format!("Failed to connect to {}:{}: {}", host, port, e))?;

    info!("Telnet[{}] connected to {}:{}", session_id, host, port);

    // Split stream into reader and writer
    let (reader, writer) = stream.into_split();
    let writer = Arc::new(Mutex::new(writer));
    let naws_enabled = Arc::new(Mutex::new(false));

    // Create shutdown channel
    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);

    // Spawn reader task
    let reader_session_id = session_id.clone();
    let reader_app_handle = app_handle.clone();
    let reader_writer = writer.clone();
    let reader_naws = naws_enabled.clone();
    
    tokio::spawn(async move {
        telnet_reader_task(
            reader_session_id,
            reader,
            reader_writer,
            reader_naws,
            reader_app_handle,
            shutdown_rx,
            cols,
            rows,
        )
        .await;
    });

    Ok(TelnetConnection {
        session_id,
        writer,
        cols,
        rows,
        naws_enabled,
        shutdown_tx,
    })
}

/// Reader task that handles incoming Telnet data and protocol negotiation
async fn telnet_reader_task(
    session_id: String,
    mut reader: tokio::net::tcp::OwnedReadHalf,
    writer: Arc<Mutex<tokio::net::tcp::OwnedWriteHalf>>,
    naws_enabled: Arc<Mutex<bool>>,
    app_handle: AppHandle,
    mut shutdown_rx: tokio::sync::watch::Receiver<bool>,
    cols: u32,
    rows: u32,
) {
    let mut buffer = [0u8; 4096];
    let mut output_buffer = Vec::new();

    loop {
        tokio::select! {
            // Check for shutdown signal
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    info!("Telnet[{}] reader task shutting down", session_id);
                    break;
                }
            }
            
            // Read from socket
            result = reader.read(&mut buffer) => {
                match result {
                    Ok(0) => {
                        // Connection closed
                        info!("Telnet[{}] connection closed by remote", session_id);
                        if let Err(e) = app_handle.emit(
                            &format!("telnet-close-{}", session_id),
                            TelnetCloseEvent {
                                session_id: session_id.clone(),
                                reason: "Connection closed".to_string(),
                            },
                        ) {
                            error!("Failed to emit Telnet close event: {}", e);
                        }
                        break;
                    }
                    Ok(n) => {
                        // Process received data
                        let data = &buffer[..n];
                        debug!("Telnet[{}] received {} bytes", session_id, n);

                        // Parse telnet protocol commands and extract regular data
                        let (text_data, responses) = parse_telnet_data(
                            data,
                            &naws_enabled,
                            cols,
                            rows,
                        ).await;

                        // Send protocol responses
                        if !responses.is_empty() {
                            let mut writer_guard = writer.lock().await;
                            for response in responses {
                                if let Err(e) = writer_guard.write_all(&response).await {
                                    warn!("Failed to send Telnet response: {}", e);
                                }
                            }
                            let _ = writer_guard.flush().await;
                        }

                        // Emit text data to frontend
                        if !text_data.is_empty() {
                            output_buffer.extend_from_slice(&text_data);
                            let text = String::from_utf8_lossy(&output_buffer).to_string();
                            output_buffer.clear();

                            if let Err(e) = app_handle.emit(
                                &format!("telnet-data-{}", session_id),
                                TelnetDataEvent {
                                    session_id: session_id.clone(),
                                    data: text,
                                },
                            ) {
                                error!("Failed to emit Telnet data: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        error!("Telnet[{}] read error: {}", session_id, e);
                        if let Err(e) = app_handle.emit(
                            &format!("telnet-close-{}", session_id),
                            TelnetCloseEvent {
                                session_id: session_id.clone(),
                                reason: format!("Read error: {}", e),
                            },
                        ) {
                            error!("Failed to emit Telnet close event: {}", e);
                        }
                        break;
                    }
                }
            }
        }
    }
}

/// Parse Telnet data, handling IAC commands and returning text data + responses
async fn parse_telnet_data(
    data: &[u8],
    naws_enabled: &Arc<Mutex<bool>>,
    cols: u32,
    rows: u32,
) -> (Vec<u8>, Vec<Vec<u8>>) {
    let mut text_data = Vec::new();
    let mut responses = Vec::new();
    let mut i = 0;

    while i < data.len() {
        if data[i] == telnet_protocol::IAC {
            if i + 1 >= data.len() {
                break;
            }

            match data[i + 1] {
                telnet_protocol::IAC => {
                    // Escaped IAC (255 255 = literal 255)
                    text_data.push(telnet_protocol::IAC);
                    i += 2;
                }
                telnet_protocol::DO => {
                    if i + 2 >= data.len() {
                        break;
                    }
                    let option = data[i + 2];
                    let response = handle_do(option, naws_enabled, cols, rows).await;
                    responses.push(response);
                    i += 3;
                }
                telnet_protocol::DONT => {
                    if i + 2 >= data.len() {
                        break;
                    }
                    let option = data[i + 2];
                    // Respond with WONT
                    responses.push(vec![telnet_protocol::IAC, telnet_protocol::WONT, option]);
                    i += 3;
                }
                telnet_protocol::WILL => {
                    if i + 2 >= data.len() {
                        break;
                    }
                    let option = data[i + 2];
                    let response = handle_will(option);
                    responses.push(response);
                    i += 3;
                }
                telnet_protocol::WONT => {
                    if i + 2 >= data.len() {
                        break;
                    }
                    let option = data[i + 2];
                    // Acknowledge with DONT
                    responses.push(vec![telnet_protocol::IAC, telnet_protocol::DONT, option]);
                    i += 3;
                }
                telnet_protocol::SB => {
                    // Sub-negotiation - find SE
                    if let Some(se_pos) = find_subnegotiation_end(&data[i..]) {
                        // Skip sub-negotiation for now
                        i += se_pos + 1;
                    } else {
                        i += 2;
                    }
                }
                _ => {
                    // Unknown command, skip IAC and command byte
                    i += 2;
                }
            }
        } else {
            // Regular data
            text_data.push(data[i]);
            i += 1;
        }
    }

    (text_data, responses)
}

/// Handle DO command from server
async fn handle_do(
    option: u8,
    naws_enabled: &Arc<Mutex<bool>>,
    cols: u32,
    rows: u32,
) -> Vec<u8> {
    match option {
        telnet_protocol::OPT_NAWS => {
            // We support NAWS - send WILL and then the window size
            *naws_enabled.lock().await = true;
            let mut response = vec![telnet_protocol::IAC, telnet_protocol::WILL, option];
            // Also send window size immediately
            response.extend_from_slice(&[
                telnet_protocol::IAC,
                telnet_protocol::SB,
                telnet_protocol::OPT_NAWS,
                (cols >> 8) as u8,
                (cols & 0xFF) as u8,
                (rows >> 8) as u8,
                (rows & 0xFF) as u8,
                telnet_protocol::IAC,
                telnet_protocol::SE,
            ]);
            response
        }
        telnet_protocol::OPT_TERMINAL_TYPE => {
            // We support terminal type negotiation
            vec![telnet_protocol::IAC, telnet_protocol::WILL, option]
        }
        telnet_protocol::OPT_SGA => {
            // Suppress Go Ahead - we support this
            vec![telnet_protocol::IAC, telnet_protocol::WILL, option]
        }
        _ => {
            // Don't support this option
            vec![telnet_protocol::IAC, telnet_protocol::WONT, option]
        }
    }
}

/// Handle WILL command from server
fn handle_will(option: u8) -> Vec<u8> {
    match option {
        telnet_protocol::OPT_ECHO | telnet_protocol::OPT_SGA => {
            // Accept echo and SGA from server
            vec![telnet_protocol::IAC, telnet_protocol::DO, option]
        }
        _ => {
            // Don't accept other options
            vec![telnet_protocol::IAC, telnet_protocol::DONT, option]
        }
    }
}

/// Find the end of a sub-negotiation (IAC SE)
fn find_subnegotiation_end(data: &[u8]) -> Option<usize> {
    for i in 0..data.len().saturating_sub(1) {
        if data[i] == telnet_protocol::IAC && data[i + 1] == telnet_protocol::SE {
            return Some(i + 1);
        }
    }
    None
}
