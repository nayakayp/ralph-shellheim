# Shellheim Changelog

Tauri-based rewrite of Nexterm - A native SSH/server management desktop app.

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
- [ ] Folder organization
- [x] Basic React UI shell

### Phase 2: SSH Core (Target: Session 6-15)
- [ ] SSH terminal connections via russh
- [ ] Terminal UI with xterm.js
- [ ] SFTP file management
- [ ] Session management (hibernate, resume)
- [ ] Port forwarding

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
