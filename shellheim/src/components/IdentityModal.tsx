import { useState } from "react";
import type { Identity, CreateIdentityRequest, UpdateIdentityRequest } from "../types/identity";
import "./IdentityModal.css";

interface IdentityModalProps {
  identity?: Identity; // If provided, we're editing
  onClose: () => void;
  onSubmit: (request: CreateIdentityRequest | UpdateIdentityRequest) => Promise<void>;
}

export function IdentityModal({ identity, onClose, onSubmit }: IdentityModalProps) {
  const [name, setName] = useState(identity?.name || "");
  const [username, setUsername] = useState(identity?.username || "");
  const [password, setPassword] = useState("");
  const [sshKey, setSshKey] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [credentialType, setCredentialType] = useState<"password" | "ssh_key">("password");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const isEditing = !!identity;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    if (!isEditing) {
      // For new identities, must have at least username + password or SSH key
      if (!username.trim() && !password && !sshKey) {
        setError("At least username or credentials required");
        return;
      }
    }

    setIsLoading(true);
    try {
      const request: CreateIdentityRequest | UpdateIdentityRequest = {
        name: name.trim(),
        username: username.trim() || undefined,
        password: password || undefined,
        ssh_key: sshKey || undefined,
        passphrase: passphrase || undefined,
      };

      await onSubmit(request);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save identity");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setSshKey(content);
    };
    reader.readAsText(file);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content identity-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditing ? "Edit Identity" : "Add Identity"}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="modal-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="identity-name">Name</label>
            <input
              id="identity-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Production Server Key"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="root"
            />
          </div>

          <div className="credential-tabs">
            <button
              type="button"
              className={`tab ${credentialType === "password" ? "active" : ""}`}
              onClick={() => setCredentialType("password")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Password
            </button>
            <button
              type="button"
              className={`tab ${credentialType === "ssh_key" ? "active" : ""}`}
              onClick={() => setCredentialType("ssh_key")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
              </svg>
              SSH Key
            </button>
          </div>

          {credentialType === "password" && (
            <div className="form-group password-field">
              <label htmlFor="password">Password</label>
              <div className="password-input-wrapper">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isEditing ? "Leave empty to keep current" : "Enter password"}
                />
                <button
                  type="button"
                  className="toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          {credentialType === "ssh_key" && (
            <>
              <div className="form-group">
                <label htmlFor="ssh-key">Private Key</label>
                <div className="ssh-key-input">
                  <textarea
                    id="ssh-key"
                    value={sshKey}
                    onChange={(e) => setSshKey(e.target.value)}
                    placeholder={isEditing ? "Leave empty to keep current" : "Paste your private key or upload a file"}
                    rows={5}
                  />
                  <label className="file-upload-btn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Upload
                    <input type="file" accept=".pem,.pub,.key,*" onChange={handleFileUpload} />
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="passphrase">Passphrase (optional)</label>
                <div className="password-input-wrapper">
                  <input
                    id="passphrase"
                    type={showPassword ? "text" : "password"}
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="Key passphrase"
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isLoading}>
              {isLoading ? "Saving..." : isEditing ? "Save Changes" : "Add Identity"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
