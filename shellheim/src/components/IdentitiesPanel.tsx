import { useState, useEffect, useCallback } from "react";
import type { Identity, CreateIdentityRequest, UpdateIdentityRequest } from "../types/identity";
import { listIdentities, createIdentity, updateIdentity, deleteIdentity } from "../lib/api";
import { IdentityList } from "./IdentityList";
import { IdentityModal } from "./IdentityModal";
import "./IdentitiesPanel.css";

interface IdentitiesPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function IdentitiesPanel({ isOpen, onClose }: IdentitiesPanelProps) {
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingIdentity, setEditingIdentity] = useState<Identity | undefined>();
  const [error, setError] = useState("");

  const loadIdentities = useCallback(async () => {
    try {
      setError("");
      setIsLoading(true);
      const data = await listIdentities();
      setIdentities(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load identities");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadIdentities();
    }
  }, [isOpen, loadIdentities]);

  const handleAdd = () => {
    setEditingIdentity(undefined);
    setShowModal(true);
  };

  const handleEdit = (identity: Identity) => {
    setEditingIdentity(identity);
    setShowModal(true);
  };

  const handleDelete = async (identity: Identity) => {
    if (!confirm(`Delete "${identity.name}"? This cannot be undone.`)) return;

    try {
      await deleteIdentity(identity.id);
      setIdentities((prev) => prev.filter((i) => i.id !== identity.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete identity");
    }
  };

  const handleSubmit = async (request: CreateIdentityRequest | UpdateIdentityRequest) => {
    if (editingIdentity) {
      const updated = await updateIdentity(editingIdentity.id, request as UpdateIdentityRequest);
      setIdentities((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    } else {
      const created = await createIdentity(request as CreateIdentityRequest);
      setIdentities((prev) => [...prev, created]);
    }
    setShowModal(false);
  };

  if (!isOpen) return null;

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="identities-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <div className="panel-title">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
            <h2>Identities</h2>
            <span className="count-badge">{identities.length}</span>
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
            Store SSH keys and passwords securely for quick server access
          </p>
          <button className="add-identity-btn" onClick={handleAdd}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Identity
          </button>
        </div>

        <div className="panel-content">
          {error && <div className="panel-error">{error}</div>}

          {isLoading ? (
            <div className="panel-loading">
              <div className="spinner" />
              <p>Loading identities...</p>
            </div>
          ) : identities.length === 0 ? (
            <div className="panel-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
              </svg>
              <h3>No identities yet</h3>
              <p>Add SSH keys or passwords to connect to your servers</p>
              <button className="btn-primary" onClick={handleAdd}>
                Add Your First Identity
              </button>
            </div>
          ) : (
            <IdentityList
              identities={identities}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
        </div>

        {showModal && (
          <IdentityModal
            identity={editingIdentity}
            onClose={() => setShowModal(false)}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  );
}
