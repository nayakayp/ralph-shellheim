//! SSH module for managing SSH connections

mod client;
mod connection;
mod recording;
mod session_manager;
pub mod tunnel;

pub use client::{connect, ActiveConnection, ConnectResult, HostKeyInfo, SshDataEvent, SshCloseEvent};
pub use connection::*;
pub use recording::RecordingManager;
pub use session_manager::SessionManager;
pub use tunnel::TunnelManager;
