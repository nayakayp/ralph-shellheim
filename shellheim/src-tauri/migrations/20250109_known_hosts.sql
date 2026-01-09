-- Known hosts table for SSH host key verification
-- Stores fingerprints of verified server public keys

CREATE TABLE IF NOT EXISTS known_hosts (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 22,
    key_type TEXT NOT NULL,           -- e.g., 'ssh-ed25519', 'ssh-rsa', 'ecdsa-sha2-nistp256'
    fingerprint TEXT NOT NULL,        -- SHA256 fingerprint of the public key
    public_key_base64 TEXT NOT NULL,  -- Full public key in base64
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    UNIQUE (account_id, host, port)
);

CREATE INDEX IF NOT EXISTS idx_known_hosts_account ON known_hosts(account_id);
CREATE INDEX IF NOT EXISTS idx_known_hosts_lookup ON known_hosts(account_id, host, port);
