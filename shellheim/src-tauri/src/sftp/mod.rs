//! SFTP module for secure file transfer
//!
//! Provides SFTP client functionality using russh-sftp for file browsing,
//! upload, download, and file management operations.

mod client;
mod session_manager;

pub use client::*;
pub use session_manager::*;
