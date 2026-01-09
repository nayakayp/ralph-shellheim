-- Session recordings table for terminal replay
-- Stores asciinema v2 format recordings

CREATE TABLE IF NOT EXISTS recordings (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL,
    entry_id TEXT NOT NULL,
    session_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    duration_secs REAL DEFAULT 0,
    file_path TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    terminal_cols INTEGER DEFAULT 80,
    terminal_rows INTEGER DEFAULT 24,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recordings_account ON recordings(account_id);
CREATE INDEX IF NOT EXISTS idx_recordings_entry ON recordings(entry_id);
CREATE INDEX IF NOT EXISTS idx_recordings_started ON recordings(started_at);
