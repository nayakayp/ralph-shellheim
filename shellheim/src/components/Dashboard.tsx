import { useState, useEffect, useCallback } from "react";
import type { Account } from "../types/auth";
import type { Entry, CreateEntryRequest, UpdateEntryRequest } from "../types/entry";
import { listEntries, createEntry, updateEntry, deleteEntry } from "../lib/api";
import { ServerList } from "./ServerList";
import { AddServerModal } from "./AddServerModal";
import { EditServerModal } from "./EditServerModal";
import { IdentitiesPanel } from "./IdentitiesPanel";
import "./Dashboard.css";

interface DashboardProps {
  account: Account;
  onLogout: () => Promise<void>;
}

export function Dashboard({ account, onLogout }: DashboardProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [showIdentities, setShowIdentities] = useState(false);
  const [error, setError] = useState("");

  const loadEntries = useCallback(async () => {
    try {
      setError("");
      const data = await listEntries();
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load servers");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleAddServer = async (request: CreateEntryRequest) => {
    const newEntry = await createEntry(request);
    setEntries((prev) => [...prev, newEntry]);
  };

  const handleUpdateServer = async (request: UpdateEntryRequest) => {
    if (!editingEntry) return;
    const updated = await updateEntry(editingEntry.id, request);
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  };

  const handleConnect = (entry: Entry) => {
    // TODO: Implement SSH connection
    console.log("Connect to:", entry.name);
  };

  const handleEdit = (entry: Entry) => {
    setEditingEntry(entry);
  };

  const handleDelete = async (entry: Entry) => {
    if (!confirm(`Delete "${entry.name}"?`)) return;
    
    try {
      await deleteEntry(entry.id);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete server");
    }
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            <polyline points="7 9 12 4 17 9" />
            <line x1="12" y1="4" x2="12" y2="16" />
          </svg>
          <span>Shellheim</span>
        </div>
        
        <div className="dashboard-user">
          <div className="user-avatar">
            {(account.display_name || account.username).charAt(0).toUpperCase()}
          </div>
          <div className="user-info">
            <span className="user-name">{account.display_name || account.username}</span>
            <span className="user-role">@{account.username}</span>
          </div>
          <button className="logout-btn" onClick={onLogout}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </header>

      <div className="dashboard-toolbar">
        <div className="toolbar-left">
          <h1>Servers</h1>
          <span className="server-count">{entries.length}</span>
        </div>
        <div className="toolbar-right">
          <button className="toolbar-btn" onClick={() => setShowIdentities(true)} title="Manage Identities">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
            Identities
          </button>
          <button className="add-btn" onClick={() => setShowAddModal(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Server
          </button>
        </div>
      </div>

      <main className="dashboard-main">
        {error && <div className="dashboard-error">{error}</div>}
        
        {isLoading ? (
          <div className="loading-state">
            <div className="spinner" />
            <p>Loading servers...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <h2>No servers yet</h2>
            <p>Add your first SSH server to get started</p>
            <button className="add-server-btn" onClick={() => setShowAddModal(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Server
            </button>
          </div>
        ) : (
          <ServerList
            entries={entries}
            onConnect={handleConnect}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}
      </main>

      {showAddModal && (
        <AddServerModal
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddServer}
        />
      )}

      {editingEntry && (
        <EditServerModal
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSubmit={handleUpdateServer}
        />
      )}

      <IdentitiesPanel
        isOpen={showIdentities}
        onClose={() => setShowIdentities(false)}
      />
    </div>
  );
}
