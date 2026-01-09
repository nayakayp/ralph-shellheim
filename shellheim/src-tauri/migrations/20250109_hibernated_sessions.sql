-- Hibernated SSH sessions table
-- Stores session state for reconnection after app restart

CREATE TABLE IF NOT EXISTS hibernated_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL,
    entry_id TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 22,
    username TEXT NOT NULL,
    identity_id TEXT,
    terminal_buffer TEXT,               -- Saved terminal output (compressed base64)
    terminal_cols INTEGER DEFAULT 80,
    terminal_rows INTEGER DEFAULT 24,
    hibernated_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL,           -- Original session start time
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
    FOREIGN KEY (identity_id) REFERENCES identities(id) ON DELETE SET NULL
);

-- Index for fast lookup by account
CREATE INDEX IF NOT EXISTS idx_hibernated_sessions_account ON hibernated_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_hibernated_sessions_entry ON hibernated_sessions(entry_id);
