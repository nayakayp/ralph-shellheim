//! Telnet module for managing Telnet connections
//!
//! Provides Telnet protocol support for terminal connections.

mod client;
mod connection;

pub use client::{connect, TelnetConnection, TelnetDataEvent, TelnetCloseEvent};
pub use connection::*;
