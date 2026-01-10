import { useState } from "react";
import { X, Lock, Key, Eye, EyeSlash, UploadSimple } from "@phosphor-icons/react";
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
            <X size={20} />
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
              <Lock size={16} />
              Password
            </button>
            <button
              type="button"
              className={`tab ${credentialType === "ssh_key" ? "active" : ""}`}
              onClick={() => setCredentialType("ssh_key")}
            >
              <Key size={16} />
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
                    <EyeSlash size={18} />
                  ) : (
                    <Eye size={18} />
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
                    <UploadSimple size={16} />
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
                      <EyeSlash size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={isLoading}>
              {isLoading ? "Saving..." : isEditing ? "Save Changes" : "Add Identity"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
