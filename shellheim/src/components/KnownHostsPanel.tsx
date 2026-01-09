import { useState, useEffect, useCallback } from "react";
import type { KnownHost } from "../types/known_host";
import { listKnownHosts, deleteKnownHost } from "../lib/api";
import "./KnownHostsPanel.css";

interface KnownHostsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KnownHostsPanel({ isOpen, onClose }: KnownHostsPanelProps) {
  const [knownHosts, setKnownHosts] = useState<KnownHost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadKnownHosts = useCallback(async () => {
    try {
      setError("");
      setIsLoading(true);
      const data = await listKnownHosts();
      setKnownHosts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load known hosts");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadKnownHosts();
    }
  }, [isOpen, loadKnownHosts]);

  const handleDelete = async (host: KnownHost) => {
    if (!confirm(`Remove trusted host "${host.host}:${host.port}"? You'll need to verify its host key again on next connection.`)) {
      return;
    }

    try {
      setDeletingId(host.id);
      await deleteKnownHost(host.id);
      setKnownHosts((prev) => prev.filter((h) => h.id !== host.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete known host");
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getKeyTypeIcon = (keyType: string) => {
    if (keyType.includes("ed25519")) {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      );
    }
    if (keyType.includes("ecdsa")) {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <ellipse cx="12" cy="12" rx="3" ry="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
        </svg>
      );
    }
    // RSA
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    );
  };

  const getKeyTypeName = (keyType: string) => {
    if (keyType.includes("ed25519")) return "Ed25519";
    if (keyType.includes("ecdsa-sha2-nistp256")) return "ECDSA P-256";
    if (keyType.includes("ecdsa-sha2-nistp384")) return "ECDSA P-384";
    if (keyType.includes("ecdsa-sha2-nistp521")) return "ECDSA P-521";
    if (keyType.includes("rsa")) return "RSA";
    return keyType;
  };

  if (!isOpen) return null;

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="known-hosts-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <div className="panel-title">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12l2 2 4-4" />
              <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
            </svg>
            <h2>Known Hosts</h2>
            <span className="count-badge">{knownHosts.length}</span>
          </div>
          <button className="panel-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="panel-toolbar">
          <p className="panel-description">
            Trusted SSH server host keys. Remove a host to re-verify its key on next connection.
          </p>
        </div>

        <div className="panel-content">
          {error && <div className="panel-error">{error}</div>}

          {isLoading ? (
            <div className="panel-loading">
              <div className="spinner" />
              <p>Loading known hosts...</p>
            </div>
          ) : knownHosts.length === 0 ? (
            <div className="panel-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 12l2 2 4-4" />
                <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
              </svg>
              <h3>No trusted hosts yet</h3>
              <p>Host keys will appear here after you connect to SSH servers</p>
            </div>
          ) : (
            <div className="known-hosts-list">
              {knownHosts.map((host) => (
                <div key={host.id} className="known-host-card">
                  <div className="known-host-icon">
                    {getKeyTypeIcon(host.key_type)}
                  </div>
                  <div className="known-host-info">
                    <div className="known-host-header">
                      <span className="known-host-address">
                        {host.host}
                        <span className="known-host-port">:{host.port}</span>
                      </span>
                      <span className="known-host-key-type">{getKeyTypeName(host.key_type)}</span>
                    </div>
                    <div className="known-host-fingerprint" title={host.fingerprint}>
                      {host.fingerprint}
                    </div>
                    <div className="known-host-dates">
                      <span title={`Added: ${new Date(host.added_at).toLocaleString()}`}>
                        Added {formatDate(host.added_at)}
                      </span>
                      <span className="date-separator">•</span>
                      <span title={`Last seen: ${new Date(host.last_seen_at).toLocaleString()}`}>
                        Last seen {formatDate(host.last_seen_at)}
                      </span>
                    </div>
                  </div>
                  <div className="known-host-actions">
                    <button
                      className="delete-host-btn"
                      onClick={() => handleDelete(host)}
                      disabled={deletingId === host.id}
                      title="Remove trusted host"
                    >
                      {deletingId === host.id ? (
                        <div className="spinner-small" />
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
