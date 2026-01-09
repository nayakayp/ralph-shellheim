import { useState, useEffect, useCallback } from "react";
import { Key, X, Plus } from "@phosphor-icons/react";
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
            <Key size={22} />
            <h2>Identities</h2>
            <span className="count-badge">{identities.length}</span>
          </div>
          <button className="panel-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="panel-toolbar">
          <p className="panel-description">
            Store SSH keys and passwords securely for quick server access
          </p>
          <button className="add-identity-btn" onClick={handleAdd}>
            <Plus size={16} />
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
              <Key size={48} weight="light" />
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
