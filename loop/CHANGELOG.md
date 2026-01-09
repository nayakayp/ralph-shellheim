# Shellheim Changelog

Tauri-based rewrite of Nexterm - A native SSH/server management desktop app.

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
- [ ] Account management (create, login, logout, 2FA)
- [ ] Entry/server CRUD
- [ ] Identity management with encryption
- [ ] Folder organization
- [ ] Basic React UI shell

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
