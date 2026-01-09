import { useState, useEffect, useCallback } from "react";
import { CheckCircle, X, Stack, Globe, Lock, Trash } from "@phosphor-icons/react";
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
      return <Stack size={16} />;
    }
    if (keyType.includes("ecdsa")) {
      return <Globe size={16} />;
    }
    // RSA
    return <Lock size={16} />;
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
            <CheckCircle size={22} />
            <h2>Known Hosts</h2>
            <span className="count-badge">{knownHosts.length}</span>
          </div>
          <button className="panel-close" onClick={onClose}>
            <X size={20} />
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
              <CheckCircle size={48} weight="light" />
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
                        <Trash size={16} />
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
