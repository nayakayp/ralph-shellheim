//! Wake-on-LAN API handlers

use std::net::UdpSocket;
use tauri::command;
use tracing::info;

/// Parse MAC address string (supports formats: AA:BB:CC:DD:EE:FF, AA-BB-CC-DD-EE-FF, AABBCCDDEEFF)
fn parse_mac_address(mac: &str) -> Result<[u8; 6], String> {
    let clean: String = mac.chars().filter(|c| c.is_ascii_hexdigit()).collect();
    if clean.len() != 12 {
        return Err("Invalid MAC address format".to_string());
    }
    
    let mut bytes = [0u8; 6];
    for i in 0..6 {
        bytes[i] = u8::from_str_radix(&clean[i*2..i*2+2], 16)
            .map_err(|_| "Invalid MAC address")?;
    }
    Ok(bytes)
}

/// Create WoL magic packet (6x 0xFF + 16x MAC address)
fn create_magic_packet(mac: [u8; 6]) -> [u8; 102] {
    let mut packet = [0xFFu8; 102];
    for i in 0..16 {
        packet[6 + i*6..6 + (i+1)*6].copy_from_slice(&mac);
    }
    packet
}

/// Send Wake-on-LAN magic packet to wake a sleeping server
#[command]
pub async fn send_wol(mac_address: String, broadcast_address: Option<String>) -> Result<(), String> {
    info!("Sending WoL packet to MAC: {}", mac_address);
    
    let mac = parse_mac_address(&mac_address)?;
    let packet = create_magic_packet(mac);
    
    let socket = UdpSocket::bind("0.0.0.0:0")
        .map_err(|e| format!("Failed to bind socket: {}", e))?;
    
    socket.set_broadcast(true)
        .map_err(|e| format!("Failed to enable broadcast: {}", e))?;
    
    let broadcast = broadcast_address.unwrap_or_else(|| "255.255.255.255".to_string());
    let target = format!("{}:9", broadcast);
    
    socket.send_to(&packet, &target)
        .map_err(|e| format!("Failed to send WoL packet: {}", e))?;
    
    info!("WoL packet sent successfully to {}", target);
    Ok(())
}
