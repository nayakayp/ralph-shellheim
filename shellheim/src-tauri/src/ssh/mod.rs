//! SSH module for managing SSH connections

mod client;
mod connection;
mod session_manager;

pub use client::{connect, ActiveConnection, ConnectResult, HostKeyInfo, SshDataEvent, SshCloseEvent};
pub use connection::*;
pub use session_manager::SessionManager;
