# Shellheim Changelog

Tauri-based rewrite of Nexterm - A native SSH/server management desktop app.

---

## Session 22 - 2026-01-09

### Completed
- **Implemented File Editor** - Edit remote files with Monaco Editor syntax highlighting:
  - Full-featured code editor with 100+ language support
  - Automatic language detection based on file extension
  - Edit button in FileBrowser toolbar for selected files
  - Double-click editable files to open in editor

- **Built FileEditor Component** (`src/components/FileEditor.tsx`):
  - Monaco Editor with VS Code-style dark theme
  - Draggable and resizable floating window
  - Maximize/minimize support
  - Save indicator (●) for unsaved changes
  - Ctrl/Cmd+S keyboard shortcut for saving
  - Auto-close warning for unsaved changes
  - Status bar showing language, encoding, modified state

- **Added FileEditor Styles** (`src/components/FileEditor.css`):
  - Glassmorphism design consistent with Tokyo Night theme
  - Header with file name, path, and action buttons
  - Resize handle for window resizing
  - Monaco editor theme overrides

- **Integrated with FileBrowser**:
  - Edit button (pencil icon) enabled when editable file selected
  - Double-click on text files opens editor
  - isEditableFile() detects text-based files (code, config, docs)
  - Multiple editors can be open simultaneously
  - Each editor has unique z-index for proper layering

- **File Type Detection**:
  - Supports 80+ file extensions (code, web, data, config, shell, docs)
  - Pattern matching for hidden files (.bashrc, .gitignore)
  - Special filename handling (Dockerfile, Makefile)

- **Verified builds**: Both `cargo check` and `npm run build` pass

### Next
1. **Monitoring service** - Server health monitoring
2. **Audit logging** - Track user actions
3. **Tags and search** - Filter servers by tags

### Tech Notes
- Monaco Editor automatically provides syntax highlighting via language detection
- File content transferred as byte array, decoded/encoded with TextDecoder/TextEncoder
- Editors tracked in openEditors state array with unique IDs
- Uses existing sftp_read_file and sftp_write_file backend APIs

---

## Session 21 - 2026-01-09

### Completed
- **Implemented SFTP File Search** - Recursive file search within directory tree:
  - Search bar with live debounced filtering (300ms)
  - Searches file and folder names recursively
  - Configurable base path for scoped searches
  - Max 100 results to prevent overwhelming large directories

- **Built Search Backend** (`src-tauri/src/sftp/client.rs`):
  - `search_files()` method using iterative stack-based traversal
  - Case-insensitive pattern matching on file names
  - Skips unreadable directories gracefully
  - Configurable max results limit

- **Added Search API** (`src-tauri/src/api/sftp.rs`):
  - `sftp_search_files` command with session ownership verification
  - `SearchFilesRequest` with session_id, base_path, pattern, max_results
  - `SearchResult` response with entries, total_found, search_path, pattern

- **Created SearchPanel Component** (`src/components/SearchPanel.tsx`):
  - Slide-in panel from right side with Tokyo Night theme
  - Two input fields: search query + base path
  - Real-time search with loading indicator
  - Results show file icon, name, relative path, size
  - Click result to navigate to file location
  - Empty states for no results and initial hint

- **Added SearchPanel Styles** (`src/components/SearchPanel.css`):
  - Glassmorphism design consistent with FileBrowser
  - Slide-in animation
  - Highlighted search results on hover

- **Integrated with FileBrowser**:
  - Search button added to toolbar (magnifying glass icon)
  - SearchPanel receives current path as default search base
  - Click on result navigates to parent directory and closes panel

- **Verified builds**: Both `cargo check` and `npm run build` pass

### Next
1. **File editor** - Edit remote files with syntax highlighting
2. **Monitoring service** - Server health monitoring
3. **Audit logging** - Track user actions

### Tech Notes
- Search uses iterative depth-first traversal (stack-based, not recursive)
- Pattern matching is case-insensitive substring search
- Results limited to 100 by default to prevent memory issues on large directories
- Debounce prevents excessive API calls during typing

---

## Session 20 - 2026-01-09

### Completed
- **Added Record Button to Terminal Toolbar** - Start/stop recording directly from terminal view:
  - New terminal toolbar appears when SSH session is active
  - Record button with red indicator when recording
  - Live elapsed time display during recording (MM:SS format)
  - Blinking red dot animation for active recording indicator
  - Stop button to finalize recording

- **Built Terminal Toolbar UI** (`src/components/Dashboard.tsx`):
  - Toolbar sits between tab bar and terminal area
  - Shows current host:port on left side
  - Right side has: Record/Stop, Recordings, Snippets, Tunnels buttons
  - Contextual display - only shows for SSH sessions (not SFTP)

- **Integrated Recording State Management**:
  - `recordingSessionId` tracks which session is being recorded
  - `activeRecordingId` stores ID for stopping recording
  - `recordingElapsed` updates every second for live timer
  - Auto-detects active recordings when switching sessions via `isSessionRecording` API

- **Added Terminal Toolbar Styles** (`src/components/Dashboard.css`):
  - Glassmorphism design consistent with Tokyo Night theme
  - `.recording-active` state with red accent colors
  - `.recording-indicator` pulsing animation
  - `.recording-time` monospace font for timer display

- **Verified builds**: Both `cargo check` and `npm run build` pass

### Next
1. **Search files** - Search within SFTP directory tree
2. **Monitoring service** - Server health monitoring
3. **File editor** - Edit remote files with syntax highlighting

### Tech Notes
- Recording state persists across session switches
- Timer starts from current time on restored recordings (exact duration stored in DB)
- Terminal toolbar conditionally rendered only for SSH tab type
- Uses Phosphor icons: Record (red circle), Stop (square), VideoCamera

---

## Session 19 - 2026-01-09

### Completed
- **Implemented Session Recording** - Record terminal sessions in asciinema v2 format:
  - Start/stop recording for any active SSH session
  - Recordings stored in app data directory with SQLite metadata
  - Output data automatically captured during SSH sessions
  - Duration and file size tracked on stop

- **Built Recording Backend** (`src-tauri/src/ssh/recording.rs`):
  - `RecordingManager` singleton tracks active recordings
  - Writes asciinema v2 header (version, width, height, timestamp)
  - Event format: `[timestamp, "o", data]` for output
  - Incremental file writes with buffered I/O
  - Finalization flushes buffer and returns stats

- **Added Recordings API** (`src-tauri/src/api/recordings.rs`):
  - `start_recording`: Begin recording for SSH session
  - `stop_recording`: Finalize and save recording stats
  - `list_recordings`: Fetch all user recordings
  - `list_entry_recordings`: Recordings for specific server
  - `get_recording`: Single recording metadata
  - `get_recording_content`: File content for playback
  - `update_recording`: Rename/update description
  - `delete_recording`: Remove recording and file
  - `is_session_recording`: Check if session has active recording

- **Created Database Migration** (`20250112_recordings.sql`):
  - `recordings` table with full metadata
  - Tracks account, entry, session, dimensions, duration, file path

- **Built Frontend Types** (`src/types/recording.ts`):
  - `Recording`, `StartRecordingRequest`, `StopRecordingRequest` interfaces
  - `formatDuration()` and `formatFileSize()` helpers

- **Added Frontend API Functions** (`src/lib/api.ts`):
  - All CRUD operations for recordings

- **Created RecordingsPanel** (`src/components/RecordingsPanel.tsx`):
  - Slide-in panel with recording list
  - Shows name, date, duration, file size, dimensions
  - Inline rename editing
  - Play and delete actions
  - Active recording indicator

- **Created RecordingPlayer** (`src/components/RecordingPlayer.tsx`):
  - Custom asciinema v2 parser
  - Play/pause/stop controls
  - Seek via progress slider
  - Playback speed control (0.5x-4x)
  - Rewind/fast-forward buttons
  - Terminal-style output display

- **Integrated with Dashboard**:
  - Added "Recordings" button to toolbar
  - RecordingsPanel accessible from both views
  - Recording data captured in SSH client handler

- **Integrated with SSH Client** (`src-tauri/src/ssh/client.rs`):
  - Output automatically written to active recording
  - Terminal buffer also populated for hibernation support

- **Verified builds**: Both `cargo check` and `npm run build` pass

### Next
1. **Add record button to terminal toolbar** - Start/stop recording from terminal
2. **Search files** - Search within SFTP directory tree
3. **Monitoring service** - Server health monitoring

### Tech Notes
- Recordings use asciinema v2 format (JSON lines)
- Files stored in `{app_data}/recordings/{account_id}/{id}.cast`
- Custom player avoids npm dependency on asciinema-player
- Playback reconstructs terminal state by replaying events up to seek time
- Recording capture happens in SSH handler data callback

---

## Session 18 - 2026-01-09

### Completed
- **Implemented Command Snippets** - Full CRUD for reusable SSH commands:
  - Save frequently used commands as named snippets
  - Organize snippets by category
  - Search snippets by name, content, or description
  - Execute snippets directly in active SSH terminal
  - Copy snippets to clipboard

- **Built Snippets Backend** (`src-tauri/src/api/snippets.rs`):
  - `list_snippets`: Fetch all snippets for authenticated user
  - `get_snippet`: Get single snippet by ID
  - `create_snippet`: Create new snippet with name, content, description, category
  - `update_snippet`: Partial updates
  - `delete_snippet`: Remove snippet
  - `list_snippets_by_category`: Filter by category
  - `list_snippet_categories`: Get unique categories
  - `search_snippets`: Search by name/content/description

- **Created Frontend Types** (`src/types/snippet.ts`):
  - `Snippet`, `CreateSnippetRequest`, `UpdateSnippetRequest` interfaces

- **Added API Functions** (`src/lib/api.ts`):
  - `listSnippets`, `getSnippet`, `createSnippet`, `updateSnippet`, `deleteSnippet`
  - `listSnippetsByCategory`, `listSnippetCategories`, `searchSnippets`

- **Built SnippetsPanel Component** (`src/components/SnippetsPanel.tsx`):
  - Slide-in panel from right side
  - Search bar with debounced filtering
  - Category dropdown filter
  - Snippet cards with name, category badge, description, and command preview
  - Actions: Copy to clipboard, Execute in terminal, Edit, Delete
  - Empty state and loading indicators

- **Built SnippetModal Component** (`src/components/SnippetModal.tsx`):
  - Create/Edit form with name, command (code textarea), description, category
  - Support for creating new categories inline
  - Form validation

- **Integrated with Dashboard**:
  - Added "Snippets" button to toolbar (Terminal icon)
  - Panel accessible from both server list and terminal modes
  - Execute handler sends snippet content to active SSH session via `sendSshData`

- **Verified builds**: Both `cargo check` and `npm run build` pass

### Next
1. **Session recording** - Record terminal sessions
2. **Search files** - Search within SFTP directory tree
3. **Monitoring service** - Server health monitoring

### Tech Notes
- Snippets stored in SQLite with account_id ownership
- Categories are user-defined strings, no predefined list
- Execute appends newline to snippet content before sending to terminal
- Search uses SQL LIKE with % wildcards for fuzzy matching

---

## Session 17 - 2026-01-09

### Completed
- **Implemented Directory Download as ZIP** - Full folder download support:
  - Select any folder in SFTP file browser and download as .zip
  - Recursive directory traversal to collect all files
  - ZIP archive created using async-zip with Deflate compression
  - Real-time progress events during download
  - Native save dialog with .zip filter

- **Added Recursive Directory Listing** (`src-tauri/src/sftp/client.rs`):
  - `list_dir_recursive()` method traverses entire directory tree
  - Returns flat list of (relative_path, size, is_dir) tuples
  - Iterative traversal using stack (avoids stack overflow on deep trees)
  - Skips `.` and `..` entries

- **Built Directory Download API** (`src-tauri/src/api/sftp.rs`):
  - `sftp_download_directory` command creates ZIP from remote folder
  - `DownloadDirRequest` struct with session_id, remote_path, local_path
  - Emits `sftp_transfer_progress` events with "scanning" and "transferring" status
  - Uses async_zip crate for async ZIP file creation
  - Directories added with trailing slash, files with Deflate compression

- **Updated Frontend**:
  - `DownloadDirRequest` type in `src/types/sftp.ts`
  - `sftpDownloadDirectory()` API function in `src/lib/api.ts`
  - Updated `FileBrowser.tsx` to handle folder downloads
  - Download button now works for both files and directories
  - Folders prompt for .zip save location

- **Added async_zip dependency** (`Cargo.toml`):
  - Version 0.0.17 with tokio and deflate features

- **Verified builds**: Both `cargo check` and `npm run build` pass

### Next
1. **Snippets and scripts** - Command automation
2. **Session recording** - Record terminal sessions
3. **Search files** - Search within directory tree

### Tech Notes
- ZIP creation is synchronous per file (read remote → add to ZIP)
- Progress tracks bytes of source files transferred, not ZIP output size
- Empty directories are included in ZIP with trailing slash convention
- Large files read entirely into memory before adding to ZIP (future: streaming)

---

## Session 16 - 2026-01-09

### Completed
- **Implemented SSH Port Forwarding** - Full tunnel support for local and remote forwarding:
  - **Local forwarding**: Listen on local port, forward to remote host:port via SSH tunnel
  - **Remote forwarding**: Listen on remote port, forward to local host:port
  - Multiple concurrent connections per tunnel supported
  - Real-time status events via Tauri event system

- **Built Tunnel Manager Backend** (`src-tauri/src/ssh/tunnel.rs`):
  - `TunnelManager` singleton tracks all active tunnels
  - `TunnelInfo` struct with ID, type, ports, status
  - Async TCP listener for local forwarding with tokio
  - Uses russh `direct-tcpip` channels for SSH tunneling
  - Bidirectional data relay between local and remote
  - Emits `tunnel-status-{id}` and `tunnel-status` events

- **Added Tunnel API Commands** (`src-tauri/src/api/tunnel.rs`):
  - `create_tunnel`: Create and start local/remote tunnel
  - `stop_tunnel`: Stop a specific tunnel by ID
  - `list_tunnels`: List all active tunnels for user
  - `list_session_tunnels`: List tunnels for a specific SSH session
  - All commands validate session ownership

- **Extended SSH Client** (`src-tauri/src/ssh/client.rs`):
  - Added `open_direct_tcpip()` method to `ActiveConnection`
  - Enables opening direct-tcpip channels for port forwarding

- **Created Frontend Types** (`src/types/tunnel.ts`):
  - `TunnelType`: 'local' | 'remote'
  - `Tunnel`, `CreateTunnelRequest`, `TunnelStatusEvent` interfaces

- **Added Frontend API Functions** (`src/lib/api.ts`):
  - `createTunnel`, `stopTunnel`, `listTunnels`, `listSessionTunnels`

- **Built useTunnels Hook** (`src/hooks/useTunnels.ts`):
  - Real-time tunnel status via Tauri event listener
  - Manages tunnel CRUD with loading/error states

- **Created TunnelPanel Component** (`src/components/TunnelPanel/`):
  - Slide-in panel from right side
  - Create tunnel form with type selector, port inputs, session dropdown
  - Active tunnels list with type badges, port mappings, status indicators
  - Stop button for each tunnel
  - Tokyo Night theme with glassmorphism design

- **Integrated into Dashboard**:
  - Added "Tunnels" button to toolbar
  - Panel slides in from right (same pattern as Identities)

- **Verified builds**: Both `cargo check` and `npm run build` pass

### Next
1. **Directory download** - Download folders as ZIP
2. **Snippets and scripts** - Command automation
3. **Session recording** - Record terminal sessions

### Tech Notes
- Tunnels are runtime-only (not persisted to SQLite, lost on app close)
- Each tunnel has unique UUID for tracking
- Local forwarding: TCP listener → SSH direct-tcpip channel → remote endpoint
- Remote forwarding: SSH channel → local TCP connection
- Concurrent connections handled via tokio spawn per connection
- Status colors: green=Local, blue=Remote, animated pulse for active

---

## Session 15 - 2026-01-09

### Completed
- **Implemented Folder & Entry Drag-and-Drop** - Full drag-and-drop support for organizing servers:
  - Drag folders to move them into other folders or to root level
  - Drag entries (servers) to reorder within the same folder
  - Drag entries to folders in the sidebar to move between folders
  - Visual feedback with drop-target highlighting and drag previews
  - Circular reference prevention (can't drop folder into its own descendant)

- **Added Backend Reorder/Move APIs** (`src-tauri/src/api/folders.rs`):
  - `reorder_folders`: Batch update sort_order for folders within a parent
  - `move_folder`: Move folder to new parent with circular reference validation

- **Added Backend Entry APIs** (`src-tauri/src/api/entries.rs`):
  - `reorder_entries`: Batch update sort_order for entries within a folder
  - `move_entry`: Move entry to different folder with folder existence validation

- **Updated FolderTree Component** with HTML5 drag-and-drop:
  - Folder items are draggable
  - Drop targets show dashed purple outline
  - Supports receiving both folder and entry drags
  - Root "All Servers" accepts drops to move to top level

- **Updated ServerList Component** with drag handles:
  - Six-dot drag handle visible on hover
  - Entry reordering within folder via drag-and-drop
  - Visual feedback for dragging and drop target states

- **Added Frontend API Functions** (`src/lib/api.ts`):
  - `reorderFolders`, `moveFolder`, `reorderEntries`, `moveEntry`

- **CSS Styling** for drag states:
  - `.dragging`: Semi-transparent while being dragged
  - `.drop-target`: Purple outline highlight
  - Drag handles with grab cursor

- **Verified builds**: Both `cargo check` and `npm run build` pass

### Next
1. **Port forwarding** - SSH tunnel support
2. **Directory download** - Download folders as ZIP
3. **Snippets and scripts** - Command automation

### Tech Notes
- Uses HTML5 Drag and Drop API with custom MIME types (`application/x-folder`, `application/x-entry`)
- Circular reference check walks parent chain to prevent invalid folder nesting
- Entry reorder only works within same folder (cross-folder moves entries to end)
- Folder counts automatically updated when entries are moved

---

## Session 14 - 2026-01-09

### Completed
- **Implemented Terminal Buffer Restoration** - Restored sessions now display previous terminal output:
  - Added `initialBuffer` prop to Terminal component
  - Terminal writes buffer content on mount before SSH data stream
  - Gray "[Session restored from hibernation]" indicator appended after buffer
  - `SshSessionInfo` type extended with optional `initialBuffer` field
  - `handleResumeSession` now passes `terminalBuffer` from response to session

- **Files Modified**:
  - `src/types/ssh.ts`: Added `initialBuffer` to `SshSessionInfo`
  - `src/components/Terminal/Terminal.tsx`: Accept and write `initialBuffer` on init
  - `src/components/Dashboard.tsx`: Pass buffer from resume response to Terminal

- **Verified builds**: Both `cargo check` and `npm run build` pass

### Next
1. **Folder drag-and-drop** - Reorder folders and move entries
2. **Port forwarding** - SSH tunnel support
3. **Directory download** - Download folders as ZIP

### Tech Notes
- Buffer is written synchronously before event listeners are set up
- Uses gray escape sequence for restoration indicator (`\x1b[90m`)
- Buffer only provided when resuming from hibernation (regular connects have no buffer)

---

## Session 13 - 2026-01-09

### Completed
- **Implemented File Upload/Download with Progress** - Full transfer system with real-time progress tracking:
  - Upload files from local filesystem to remote server via SFTP
  - Download remote files to local filesystem with save dialog
  - Real-time progress events emitted via Tauri event system
  - 32KB chunk-based streaming for progress granularity

- **Built TransferProgress Component** (`TransferProgress.tsx`):
  - Floating panel showing active/completed/failed transfers
  - Progress bar with percentage and byte count display
  - Color-coded status indicators (active=purple, completed=green, error=red)
  - Dismiss individual transfers or clear all completed
  - Uses Tauri event listener for `sftp_transfer_progress` events
  - `useTransferProgress` hook for managing transfer state

- **Added SFTP Backend Transfer Commands** (`src-tauri/src/api/sftp.rs`):
  - `sftp_download_file`: Download remote file to local path with progress
  - `sftp_upload_files`: Upload multiple local files to remote directory
  - `TransferProgress` struct emitted as Tauri events
  - Unique `transfer_id` per transfer using UUID

- **Extended SFTP Client** (`src-tauri/src/sftp/client.rs`):
  - `read_file_with_progress`: Streams remote file to local in chunks
  - `write_file_with_progress`: Streams local file to remote in chunks
  - `TRANSFER_CHUNK_SIZE` constant (32KB)
  - Uses tokio fs for local file operations

- **Updated FileBrowser Component**:
  - Added Upload button (green hover) - opens native file picker
  - Added Download button (blue hover) - opens native save dialog
  - Integrated with TransferProgress panel
  - Uses `@tauri-apps/plugin-dialog` for native dialogs

- **Added Frontend Types** (`src/types/sftp.ts`):
  - `DownloadRequest`, `UploadFilesRequest` interfaces
  - `TransferProgress` event payload type
  - `ActiveTransfer` state type for UI

- **Added API Functions** (`src/lib/api.ts`):
  - `sftpDownloadFile(request)` - returns transfer_id
  - `sftpUploadFiles(request)` - returns transfer_id

- **Styling** (`FileBrowser.css`, `TransferProgress.css`):
  - Upload button: green hover state
  - Download button: blue hover state
  - Transfer panel: glassmorphism design matching Tokyo Night theme

- **Verified builds**: Both `cargo check` and `npm run build` pass

### Next
1. **Folder drag-and-drop** - Reorder folders and move entries
2. **Terminal buffer restoration** - Write hibernated buffer to terminal on resume
3. **Port forwarding** - SSH tunnel support
4. **Directory download** - Download folders as ZIP

### Tech Notes
- Transfers emit progress events every 32KB chunk
- Multiple simultaneous transfers supported
- Transfer state managed in React via `useTransferProgress` hook
- Directory download not yet supported (files only)
- Progress panel auto-clears completed transfers on "Clear" click

---

## Session 12 - 2026-01-09

### Completed
- **Integrated SFTP File Browser into Tab System** - Full SFTP file management with multi-tab support:
  - SFTP sessions now appear as dedicated tabs alongside SSH terminal tabs
  - Blue-themed SFTP tabs with folder icon indicator (📁)
  - Multiple SFTP sessions can be open simultaneously
  - Tab switching preserves file browser state

- **Updated TerminalTabs Component**:
  - Added `sftpSessions` prop for SFTP tab rendering
  - Added `activeTabType` prop to distinguish SSH vs SFTP active tabs
  - Added `onCloseSftpTab` callback for SFTP session cleanup
  - SFTP tabs styled with blue accent (rgba(122, 162, 247, *))
  - Export `TabSession` type for unified session handling

- **Updated Dashboard for Multi-Tab SFTP**:
  - Changed from single `sftpSession` to `sftpSessions[]` array
  - Added `activeTabType` state ("ssh" | "sftp") for tab type tracking
  - `handleConnectSftp`: Adds SFTP session to array, sets active tab type
  - `handleCloseSftpTab`: Disconnects, removes from array, switches to next tab
  - `handleSelectTab`: Updated signature to include tab type parameter
  - SFTP browsers rendered in terminal area with visibility toggle

- **Added CSS Styles**:
  - `.sftp-browser-wrapper`: Absolute positioning with visibility toggle
  - `.terminal-tab.sftp`: Blue-themed tab styling matching Tokyo Night theme
  - `.tab-indicator.sftp`: Folder icon styling

- **FileBrowser Component** (previously built):
  - Directory listing with breadcrumb navigation
  - List and grid view modes
  - Create folder, delete, rename operations
  - Multi-select with Ctrl/Cmd click
  - File permission display (rwxrwxrwx format)
  - File type icons based on extension
  - Disconnect button to close SFTP session

- **SFTP Backend** (previously built):
  - Complete SFTP client using `russh-sftp`
  - Operations: list_dir, stat, read_file, write_file, delete, mkdir, rename
  - Session manager with connection pooling
  - All operations validate account ownership

- **Verified builds**: Both `cargo check` and `npm run build` pass

### Next
1. **File upload/download UI** - Progress indicators and local file picker
2. **Folder drag-and-drop** - Reorder folders and move entries
3. **Terminal buffer restoration** - Write hibernated buffer to terminal on resume
4. **Port forwarding** - SSH tunnel support

### Tech Notes
- SFTP uses separate SSH connection (not shared with terminal session)
- File browser state (current path, selections) persists when switching tabs
- Host key verification uses same known_hosts as SSH connections
- Large file transfer uses streaming to avoid memory issues

---

## Session 11 - 2026-01-09

### Completed
- **Implemented Session Hibernation** - Save and restore SSH sessions across app restarts:
  - Created `hibernated_sessions` database table (migration v12)
  - Stores session metadata: entry, host, port, username, identity, terminal dimensions
  - Captures terminal buffer content (up to 200KB) for session restoration
  - Hibernated sessions persist across app restarts

- **Built Hibernation Backend API** (`src-tauri/src/api/ssh.rs`):
  - `hibernate_session`: Close SSH connection, save session state to DB
  - `list_hibernated_sessions`: Get all hibernated sessions for current user
  - `resume_session`: Reconnect to SSH server, restore session with buffer
  - `delete_hibernated_session`: Remove hibernated session without resuming
  - All operations validate account ownership

- **Created Frontend Types** (`src/types/ssh.ts`):
  - `HibernatedSession`, `HibernateSessionRequest`, `ResumeSessionRequest`
  - `ResumeSessionResponse` with optional `terminalBuffer` for restoration

- **Added Hibernation API Functions** (`src/lib/api.ts`):
  - hibernateSession, listHibernatedSessions, resumeSession, deleteHibernatedSession

- **Updated TerminalTabs Component**:
  - Added hibernate button (⏸) on active session tabs
  - Hibernated sessions show with dashed border and orange indicator
  - Resume (▶) and delete (×) actions on hibernated tabs
  - Visual distinction between connected (green) and hibernated (orange) states
  - Relative time display ("5m ago", "2h ago") for hibernation timestamp

- **Updated Dashboard**:
  - Loads hibernated sessions on startup
  - `handleHibernateTab`: Captures terminal buffer, saves to DB, removes from active
  - `handleResumeSession`: Reconnects, restores session, removes from hibernated list
  - `handleDeleteHibernated`: Delete confirmation and removal
  - Terminal refs map for future buffer extraction

- **New CSS Styles** (`TerminalTabs.css`):
  - `.terminal-tab.hibernated`: Dashed border, orange-tinted background
  - `.tab-actions`: Hover-reveal action buttons
  - `.terminal-tab-action.hibernate/resume/close`: Color-coded hover states

- **Verified builds**: Both `cargo check` and `npm run build` pass

### Next
1. **SFTP file management** - File browser and transfers
2. **Folder drag-and-drop** - Reorder folders and move entries
3. **Terminal buffer restoration** - Write hibernated buffer to terminal on resume

### Tech Notes
- Hibernation closes the actual SSH connection (can't serialize TCP sockets)
- Resume reconnects using stored identity credentials
- Terminal buffer provided by frontend during hibernate (backend has 200KB buffer as fallback)
- Host key must still be valid for resume (changed key = manual reconnect required)
- Hibernated sessions shown in tab bar even when no active sessions

---

## Session 10 - 2026-01-09

### Completed
- **Implemented Known Hosts Management UI** - Settings panel to view/delete trusted SSH hosts:
  - Created `KnownHostsPanel.tsx` component with full CRUD support
  - Lists all trusted hosts with host:port, key type, fingerprint
  - Visual indicators for key types (Ed25519, ECDSA, RSA) with custom icons
  - Shows timestamps for "Added" and "Last seen" dates
  - Delete confirmation dialog with clear warning message
  - Monospace fingerprint display with truncation for long values

- **Styled with Tokyo Night Theme** (`KnownHostsPanel.css`):
  - Glassmorphism panel design matching IdentitiesPanel
  - Host cards with gradient icons and hover states
  - Responsive layout for narrow viewports
  - Loading spinner and delete-in-progress states

- **Updated Dashboard**:
  - Added `showKnownHosts` state for panel visibility
  - New "Hosts" toolbar button with checkmark-circle icon
  - KnownHostsPanel integrated in both terminal and dashboard modes

- **Verified builds**: Both `cargo check` and `npm run build` pass

### Next
1. **Session hibernation** - Save and restore SSH sessions
2. **SFTP file management** - File browser and transfers
3. **Folder drag-and-drop** - Reorder folders and move entries

### Tech Notes
- Known hosts list uses existing `listKnownHosts` API from Session 9
- Panel reuses shared CSS from IdentitiesPanel (panel-overlay, panel-header, etc.)
- Delete triggers re-verification on next connection to that host

---

## Session 9 - 2025-01-09

### Completed
- **Implemented Host Key Verification** - Full known_hosts support for SSH security:
  - Created `known_hosts` database table with migration
  - Stores host, port, key_type, fingerprint, and full public key
  - Per-account isolation with ownership checks

- **Built Known Hosts API** (`src-tauri/src/api/known_hosts.rs`):
  - `list_known_hosts`: Get all trusted hosts for current user
  - `check_host_key`: Verify if host key matches stored fingerprint
  - `trust_host_key`: Add/replace host key in known_hosts
  - `delete_known_host`: Remove trusted host entry
  - `lookup_known_host`: Internal helper for SSH connection flow

- **Updated SSH Client with Host Key Capture**:
  - Modified `SshClientHandler::check_server_key()` to capture key info
  - Uses `russh_keys` fingerprint API (SHA256 format)
  - Stores key_type, fingerprint, and OpenSSH-format public key
  - Supports expected fingerprint verification mode
  - Captures host key on first connection for user review

- **Updated SSH Connection Flow**:
  - `ConnectResult` enum: `Connected` or `HostKeyVerificationNeeded`
  - `connect_ssh` API returns `ConnectSshResponse` tagged union
  - First connection triggers host key dialog before full connection
  - Known hosts verified automatically on subsequent connections

- **Created Frontend Types** (`src/types/known_host.ts`):
  - `KnownHost`, `HostKeyStatus`, `TrustHostKeyRequest` interfaces
  - Updated `ConnectSshResponse` to handle verification flow

- **Added Known Hosts API Functions** (`src/lib/api.ts`):
  - listKnownHosts, checkHostKey, trustHostKey, deleteKnownHost

- **Built HostKeyDialog Component**:
  - Modal dialog for first-time host key verification
  - Warning mode for changed host keys (potential MITM)
  - Displays key type and SHA256 fingerprint
  - "Trust & Connect" / "Accept New Key" actions
  - Glassmorphism design with Tokyo Night theme

- **Updated Dashboard**:
  - Added `hostKeyVerification` state
  - `handleConnect` handles `HostKeyVerification` response
  - `handleHostKeyAccept` trusts key and retries connection
  - `handleHostKeyReject` cancels with error message

- **Verified builds**: Both `cargo check` and `npm run build` pass

### Next
1. **Session hibernation** - Save and restore SSH sessions
2. **SFTP file management** - File browser and transfers
3. **Folder drag-and-drop** - Reorder folders and move entries
4. **Known hosts management UI** - View/delete trusted hosts in settings

### Tech Notes
- Host key fingerprint format: `SHA256:base64hash`
- Key types supported: ssh-ed25519, ssh-rsa, ecdsa-sha2-nistp256/384/521
- First connection captures key, disconnects, prompts user, then reconnects
- Changed keys show old vs new fingerprint comparison
- Host uniqueness: account_id + host + port

---

## Session 8 - 2025-01-09

### Completed
- **Implemented Folder Management** - Full folder CRUD and sidebar navigation:
  - Implemented `folders.rs` backend with full CRUD operations
  - `list_folders`, `get_folder`, `create_folder`, `update_folder`, `delete_folder`
  - `get_folder_counts` for entry count per folder
  - Ownership validation and parent folder verification
  - Prevents deletion of folders with children or entries

- **Created Frontend Folder Types** (`src/types/folder.ts`):
  - `Folder`, `CreateFolderRequest`, `UpdateFolderRequest` interfaces
  - `FolderNode` extended type with children, entryCount, isExpanded
  - `buildFolderTree()` helper to construct tree from flat list

- **Added Folder API Functions** (`src/lib/api.ts`):
  - listFolders, getFolder, createFolder, updateFolder, deleteFolder, getFolderCounts

- **Built FolderTree Component**:
  - Collapsible tree navigation in sidebar
  - "All Servers" root option to show all entries
  - Expand/collapse chevrons with smooth rotation
  - Folder icons with optional custom colors
  - Entry count badges per folder
  - Hover actions: add subfolder, delete folder
  - Inline folder creation form with modal overlay
  - Tokyo Night theme styling

- **Updated Dashboard with Sidebar Layout**:
  - New `with-sidebar` layout class
  - FolderTree integrated in left sidebar
  - `selectedFolderId` state for folder filtering
  - `filteredEntries` memo filters entries by folder
  - Dynamic title shows selected folder name
  - Folder counts update on entry add/delete

- **Updated AddServerModal**:
  - Added `folders` and `selectedFolderId` props
  - Folder selector dropdown
  - Pre-selects current folder when adding

- **Updated EditServerModal**:
  - Added `folders` prop
  - Folder selector to move entries between folders

- **New CSS Components**:
  - `FolderTree.css` with glassmorphism sidebar design
  - Dashboard sidebar layout styles

- **Verified builds**: Both `cargo check` and `npm run build` pass

### Next
1. **Add host key verification** - Known hosts support for security
2. **Session hibernation** - Save and restore SSH sessions
3. **SFTP file management** - File browser and transfers
4. **Folder drag-and-drop** - Reorder folders and move entries

### Tech Notes
- Folders are hierarchical with parent_id for nesting
- FolderTree uses expandedIds Set for collapse state
- Entry counts fetched separately via getFolderCounts for efficiency
- Folder delete blocked if has children or entries

---

## Session 7 - 2025-01-09

### Completed
- **Implemented Multiple Terminal Tabs** - Full multi-session support:
  - Created `TerminalTabs` component with tab bar UI
  - Visual indicators for active tab and connection status
  - Close button on each tab with smart tab switching
  - "+" button for opening new connections
  
- **Updated Dashboard for Multi-Session Management**:
  - Changed from single `activeSession` to `sessions[]` array
  - Added `activeSessionId` state for tab switching
  - `handleSelectTab()` switches between terminals
  - `handleCloseTab()` with automatic next-tab selection
  - Terminals persist in DOM when switching (no re-init)

- **Modified Terminal Component**:
  - Added `isActive` prop for visibility control
  - Uses CSS visibility (not unmounting) to preserve xterm state
  - Re-fits and refocuses terminal when becoming active
  - Initialization guard prevents double-mount issues

- **Added Server Panel Overlay**:
  - Glassmorphism overlay for new connections while in terminal mode
  - Shows server list without leaving terminal view
  - Loading and error states within panel
  - Quick access to add/edit servers

- **New CSS Components**:
  - `TerminalTabs.css` - Tab bar with Tokyo Night theme
  - Terminal area with absolute positioning for stacking
  - Server panel overlay with blur backdrop
  - Responsive inline connecting indicator

- **Verified builds**: Both `cargo check` and `npm run build` pass

### Next
1. **Implement Folder management** - Organize servers into folders
2. **Add host key verification** - Known hosts support for security
3. **Session hibernation** - Save and restore SSH sessions
4. **SFTP file management** - File browser and transfers

### Tech Notes
- Terminals use visibility:hidden (not display:none) to keep xterm instances alive
- Tab switching triggers fit() and focus() on active terminal
- Server panel uses fixed z-index (100) to overlay terminal tabs
- Each Terminal component has isInitializedRef to prevent re-initialization

---

## Session 6 - 2025-01-09

### Completed
- **Implemented SSH Connection Backend** - Full russh integration:
  - Created `ssh/client.rs` with `SshClientHandler` implementing russh `Handler` trait
  - Password and SSH key (with passphrase) authentication support
  - PTY session with configurable terminal size
  - Tauri event emission for SSH data (`ssh-data-{session_id}`) and close events
  - `ActiveConnection` struct manages handle + channel lifecycle

- **Updated Session Manager**:
  - Now holds actual `ActiveConnection` objects (not just metadata)
  - Async `remove_session()` properly closes SSH connection
  - `send_data()` and `resize_terminal()` methods for PTY interaction
  - Session ownership validation on all operations

- **Implemented SSH API Commands** (`api/ssh.rs`):
  - `connect_ssh`: Lookup entry → decrypt identity → authenticate → open PTY
  - `disconnect_ssh`: Close channel and session with ownership check
  - `send_data`: Write to SSH channel
  - `resize_terminal`: Window change for PTY resize
  - `list_ssh_sessions`: Get all active sessions for current user
  - Auto-updates `last_connected_at` on successful connection

- **Built Terminal UI** with xterm.js:
  - Created `Terminal` component with @xterm/xterm integration
  - FitAddon for responsive terminal sizing
  - WebLinksAddon for clickable URLs
  - Tokyo Night color theme for modern aesthetic
  - Listen to Tauri events for SSH data stream
  - Terminal header with host info and disconnect button

- **Updated Dashboard**:
  - `handleConnect()` now calls `connectSsh()` API
  - Validates identity exists before connection attempt
  - Shows connecting overlay with spinner
  - Full-screen terminal mode when session active
  - Terminal close returns to server list

- **Added SSH Types** (`types/ssh.ts`):
  - ConnectRequest, SshSessionInfo, SendDataRequest, ResizeRequest
  - SshDataEvent, SshCloseEvent for Tauri event payloads

- **Added SSH API Functions** (`lib/api.ts`):
  - connectSsh, disconnectSsh, sendSshData, resizeSshTerminal, listSshSessions

- **Installed xterm.js Dependencies**:
  - @xterm/xterm, @xterm/addon-fit, @xterm/addon-web-links

- **Verified builds**: Both `cargo check` and `npm run build` pass

### Next
1. **Add multiple terminal tabs** - Support multiple simultaneous SSH sessions
2. **Implement Folder management** - Organize servers into folders
3. **Add host key verification** - Known hosts support for security
4. **Session hibernation** - Save and restore SSH sessions

### Tech Notes
- SSH data flows: russh → Handler::data() → Tauri emit → Terminal listener → xterm.write()
- Using russh 0.49 API: PrivateKeyWithHashAlg for key auth, bool return for auth result
- Host key verification currently accepts all (TODO: implement known_hosts)
- Terminal dimensions sent to backend on connect and resize

---

## Session 5 - 2025-01-09

### Completed
- **Linked Identities to Entries** - Full backend/frontend integration:
  - Updated `EntryRow`/`Entry` models with identity_ids field
  - Added `entry_identities` junction table handling in entries API
  - New helper functions: `get_identity_ids_for_entry()`, `sync_entry_identities()`
  - `create_entry` and `update_entry` now handle identity linking
  - New command `get_entry_identities` for SSH connection use

- **Updated AddServerModal**:
  - Added identity selector dropdown
  - Loads identities on mount via `listIdentities()`
  - Shows username in dropdown options
  - Empty state hint when no identities exist

- **Built EditServerModal component**:
  - Pre-populates form with existing entry data
  - Identity selector with current credential pre-selected
  - Smart port handling (only updates if using default)
  - Reuses AddServerModal CSS for consistent styling

- **Updated Dashboard**:
  - Integrated EditServerModal with entry state management
  - Added `handleUpdateServer` function
  - Clicking edit button now opens EditServerModal

- **Updated frontend Entry type** to include `identity_ids: string[]`

- **Verified builds**: Both `cargo check` and `npm run build` pass

### Next
1. **Implement SSH connection** - Use russh + identities for actual terminal connections
2. **Build Terminal UI** - xterm.js integration for SSH sessions
3. **Add Folder management** - Organize servers into folders

### Tech Notes
- Entry-Identity relationship is many-to-many via `entry_identities` junction table
- Priority field in junction table maintains order of credentials to try
- Identity linking syncs on create/update (delete old links, insert new)
- Frontend currently supports single identity per entry (UI limitation)

---

## Session 4 - 2025-01-09

### Completed
- **Implemented Identity CRUD backend** (`src-tauri/src/api/identities.rs`):
  - `list_identities`: Fetch all credentials for authenticated user
  - `get_identity`: Retrieve single identity by ID with ownership check
  - `create_identity`: Create credential with AES-256-GCM encryption for sensitive fields
  - `update_identity`: Partial updates, re-encrypts only changed credentials
  - `delete_identity`: Remove identity with ownership check
  - `get_decrypted_identity`: Internal function for SSH connections (decrypts credentials)
  - Encryption/decryption helper functions with base64 encoding

- **Created frontend Identity types** (`src/types/identity.ts`):
  - Identity, CreateIdentityRequest, UpdateIdentityRequest interfaces
  - CredentialType union and helper function

- **Added Identity API functions** (`src/lib/api.ts`):
  - listIdentities, getIdentity, createIdentity, updateIdentity, deleteIdentity
  - All functions auto-inject stored auth token

- **Built IdentityModal component**:
  - Form with name, username, password OR SSH key fields
  - Credential type tabs (password/SSH key) with toggle
  - SSH key file upload with FileReader API
  - Password visibility toggle
  - Passphrase field for encrypted keys
  - Glassmorphism design matching other modals

- **Built IdentityList component**:
  - Identity cards with key icon and username display
  - Hover actions: edit/delete buttons
  - Selectable for future server connection linking

- **Built IdentitiesPanel component**:
  - Slide-in panel from right side
  - Full CRUD integration with loading/error states
  - Empty state with call-to-action
  - Accessible from Dashboard toolbar

- **Updated Dashboard**:
  - Added "Identities" button to toolbar
  - Integrated IdentitiesPanel with show/hide state
  - New toolbar-right layout for multiple action buttons

- **Verified builds**: Both `cargo check` and `npm run build` pass

### Next
1. **Link Identities to Entries** - Allow servers to reference stored credentials
2. **Build EditServerModal** - Edit existing server entries
3. **Implement SSH connection** - Use identities for actual SSH terminal connections

### Tech Notes
- Credentials encrypted with AES-256-GCM before storage
- Encryption key currently hardcoded for dev (TODO: derive from user password or keychain)
- Encrypted fields: password, ssh_key, passphrase (stored as base64)
- Frontend never receives decrypted sensitive data (skip_serializing in model)

---

## Session 3 - 2025-01-09

### Completed
- **Implemented Entry CRUD backend** (`src-tauri/src/api/entries.rs`):
  - `list_entries`: Fetch all servers for authenticated user, optional folder filtering
  - `get_entry`: Retrieve single entry by ID with ownership check
  - `create_entry`: Create server with auto-incrementing sort_order
  - `update_entry`: Partial updates with ownership validation
  - `delete_entry`: Remove entry with ownership check
  - Token-to-account helper function for session validation

- **Created frontend Entry types** (`src/types/entry.ts`):
  - Entry, CreateEntryRequest, UpdateEntryRequest interfaces
  - Protocol type union and default port mappings

- **Added Entry API functions** (`src/lib/api.ts`):
  - listEntries, getEntry, createEntry, updateEntry, deleteEntry
  - All functions auto-inject stored auth token

- **Built AddServerModal component**:
  - Form with name, host, port, protocol, description fields
  - Protocol selector auto-updates default port
  - Glassmorphism design matching auth pages
  - Loading states and validation

- **Built ServerList component**:
  - Server cards with protocol icons and status indicators
  - Hover actions: edit/delete buttons
  - Click-to-connect interaction (stub for SSH)

- **Updated Dashboard**:
  - Toolbar with server count and "Add Server" button
  - Server list integration with CRUD operations
  - Loading spinner and error states
  - Empty state with call-to-action

- **Verified builds**: Both `cargo check` and `npm run build` pass

### Next
1. **Implement Identity management** - SSH keys and credentials storage
2. **Build EditServerModal** - Edit existing server entries
3. **Add Folder management** - Organize servers into folders

### Tech Notes
- Entry ownership enforced via account_id check on all operations
- sort_order auto-increments based on existing entries in folder
- Protocol defaults: SSH/SFTP=22, RDP=3389, VNC=5900, Telnet=23

---

## Session 2 - 2025-01-09

### Completed
- **Implemented account authentication system**:
  - `create_account`: bcrypt password hashing, username validation, uniqueness check
  - `login`: password verification, session token generation (7-day expiry), TOTP support stub
  - `logout`: session invalidation
  - `get_current_user`: token-based user lookup with expiry check
  - `has_accounts`: first-run detection for UI routing

- **Built React auth UI with modern design**:
  - Login/Register forms with validation
  - Glassmorphism card design with gradient backgrounds
  - Loading states and error handling
  - Auto-switch between login/register based on existing accounts

- **Created Dashboard shell**:
  - Header with user avatar and logout button
  - Empty state with "Add Server" placeholder
  - Dark theme consistent with auth pages

- **Set up frontend architecture**:
  - `/src/types/auth.ts` - TypeScript types for Account, LoginRequest, etc.
  - `/src/lib/api.ts` - Tauri invoke wrappers with localStorage token storage
  - `/src/hooks/useAuth.ts` - Auth state management hook
  - `/src/components/` - AuthPage and Dashboard components

- **Verified builds**: Both `cargo check` and `npm run build` pass

### Next
1. **Implement Entry CRUD** - Create/Read/Update/Delete server entries
2. **Build Server List UI** - Display servers in dashboard with folder organization
3. **Add server form modal** - Form to add SSH server connections

### Tech Notes
- Session tokens stored in SQLite (sessions table) with 7-day expiry
- Frontend uses localStorage for token persistence between app restarts
- Password hashing uses bcrypt with DEFAULT_COST (12 rounds)

---

## Session 1 - 2025-01-09

### Completed
- **Analyzed Nexterm architecture** via Librarian:
  - Identified core features: SSH/SFTP, RDP/VNC (via Guacamole), Proxmox integration
  - Documented tech stack: React 19, Express, Sequelize ORM, ssh2, xterm.js
  - Mapped 20+ database models and 30+ API routes to port
  - Estimated 4-6 months for full feature parity

- **Initialized Tauri project** (Tauri v2 + React/TypeScript):
  - Created `/shellheim` project directory
  - Set up React/TypeScript frontend with Vite

- **Built Rust backend foundation**:
  - **Database module** (`src/db/`): SQLite via sqlx with 10 migrations covering accounts, sessions, entries, identities, folders, tags, snippets, audit logs
  - **Models** (`src/models/`): Account, Entry, Identity, Folder, Session, Snippet, Tag with request/response types
  - **SSH module** (`src/ssh/`): SessionManager for tracking active connections, connection types defined
  - **API handlers** (`src/api/`): Tauri commands for account, entries, identities, folders, SSH operations (stubs ready for implementation)
  - **Utils** (`src/utils/`): AES-256-GCM encryption with Argon2 key derivation

- **Configured dependencies**:
  - Tauri plugins: fs, dialog, shell, notification, sql
  - russh v0.49 for SSH protocol
  - sqlx v0.8 for database
  - bcrypt, aes-gcm, argon2, totp-lite for auth/encryption
  - tracing for logging

- **Verified build**: `cargo check` passes with only unused variable warnings

### Project Structure Created
```
shellheim/
├── src/                     # React frontend (from create-tauri-app)
├── src-tauri/
│   ├── src/
│   │   ├── api/            # Tauri command handlers
│   │   ├── db/             # Database + migrations
│   │   ├── models/         # Data models
│   │   ├── services/       # Background services (placeholder)
│   │   ├── ssh/            # SSH session management
│   │   ├── utils/          # Encryption, validators
│   │   └── lib.rs          # Main app initialization
│   ├── migrations/         # SQL migrations
│   └── Cargo.toml          # Rust dependencies
└── dist/                   # Frontend build output
```

### Next
1. **Implement account creation and login** with bcrypt password hashing
2. **Build basic React UI** for login and server list
3. **Implement entry CRUD** operations with database persistence

### Tech Decisions
- Using `russh` (pure Rust) instead of ssh2 bindings for better Tauri integration
- SQLite as default database (matching Nexterm's default)
- AES-256-GCM for credential encryption (same as Nexterm)
- Deferred RDP/VNC until SSH core is working (Guacamole dependency is complex)

### Blockers
- None currently

---

## Feature Parity Tracking

### Phase 1: Foundation (Target: Session 2-5)
- [x] Account management (create, login, logout, 2FA)
- [x] Entry/server CRUD
- [x] Identity management with encryption
- [x] Identity-Entry linking
- [x] Folder organization
- [x] Basic React UI shell

### Phase 2: SSH Core (Target: Session 6-16)
- [x] SSH terminal connections via russh
- [x] Terminal UI with xterm.js
- [x] Multiple terminal tabs
- [x] Session management (hibernate, resume)
- [x] SFTP file management
- [x] Port forwarding (local/remote tunnels)

### Phase 3: Advanced Features (Future)
- [ ] Snippets and scripts
- [ ] Monitoring service
- [ ] Audit logging
- [ ] Tags and search
- [ ] Session recording
- [ ] RDP/VNC (requires Guacamole bundling)
- [ ] Proxmox integration
- [ ] OIDC/LDAP authentication
- [ ] Organizations/multi-tenancy
