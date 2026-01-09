import { useState, useEffect, useCallback } from "react";
import type { Account } from "../types/auth";
import type { Entry, CreateEntryRequest, UpdateEntryRequest } from "../types/entry";
import type { SshSessionInfo } from "../types/ssh";
import { listEntries, createEntry, updateEntry, deleteEntry, connectSsh } from "../lib/api";
import { ServerList } from "./ServerList";
import { AddServerModal } from "./AddServerModal";
import { EditServerModal } from "./EditServerModal";
import { IdentitiesPanel } from "./IdentitiesPanel";
import Terminal from "./Terminal/Terminal";
import { TerminalTabs } from "./Terminal/TerminalTabs";
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
  
  // Multiple SSH sessions state
  const [sessions, setSessions] = useState<SshSessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showServerPanel, setShowServerPanel] = useState(false);

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

  const handleConnect = async (entry: Entry) => {
    if (isConnecting) return;
    
    // Check if entry has an identity
    if (!entry.identity_ids || entry.identity_ids.length === 0) {
      alert("This server has no credentials configured. Please edit it and add an identity first.");
      setEditingEntry(entry);
      return;
    }
    
    setIsConnecting(true);
    setError("");
    
    try {
      const session = await connectSsh({
        entry_id: entry.id,
        cols: 120,
        rows: 30,
      });
      
      // Add to sessions list and make active
      setSessions((prev) => [...prev, session]);
      setActiveSessionId(session.session_id);
      setShowServerPanel(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect";
      setError(`Connection failed: ${message}`);
      console.error("SSH connect error:", err);
    } finally {
      setIsConnecting(false);
    }
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

  const handleSelectTab = (sessionId: string) => {
    setActiveSessionId(sessionId);
  };

  const handleCloseTab = (sessionId: string) => {
    setSessions((prev) => {
      const newSessions = prev.filter((s) => s.session_id !== sessionId);
      
      // If closing the active tab, switch to another
      if (activeSessionId === sessionId) {
        const closingIndex = prev.findIndex((s) => s.session_id === sessionId);
        if (newSessions.length > 0) {
          // Switch to the next tab, or previous if at the end
          const newIndex = Math.min(closingIndex, newSessions.length - 1);
          setActiveSessionId(newSessions[newIndex].session_id);
        } else {
          setActiveSessionId(null);
        }
      }
      
      return newSessions;
    });
  };

  const handleNewConnection = () => {
    setShowServerPanel(true);
  };

  const handleTerminalClose = (sessionId: string) => {
    handleCloseTab(sessionId);
  };

  // Terminal mode: show terminals if we have any sessions
  if (sessions.length > 0) {
    return (
      <div className="dashboard terminal-mode">
        <TerminalTabs
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectTab={handleSelectTab}
          onCloseTab={handleCloseTab}
          onNewConnection={handleNewConnection}
        />
        <div className="terminal-area">
          {sessions.map((session) => (
            <Terminal
              key={session.session_id}
              sessionId={session.session_id}
              host={`${session.host}:${session.port}`}
              isActive={session.session_id === activeSessionId}
              onClose={() => handleTerminalClose(session.session_id)}
            />
          ))}
        </div>
        
        {/* Server panel overlay for new connections */}
        {showServerPanel && (
          <div className="server-panel-overlay">
            <div className="server-panel">
              <div className="server-panel-header">
                <h2>Connect to Server</h2>
                <button className="close-panel-btn" onClick={() => setShowServerPanel(false)}>
                  ✕
                </button>
              </div>
              <div className="server-panel-body">
                {isConnecting && (
                  <div className="connecting-inline">
                    <div className="spinner" />
                    <span>Connecting...</span>
                  </div>
                )}
                {error && <div className="panel-error">{error}</div>}
                {isLoading ? (
                  <div className="loading-state">
                    <div className="spinner" />
                    <p>Loading servers...</p>
                  </div>
                ) : entries.length === 0 ? (
                  <div className="panel-empty">
                    <p>No servers configured</p>
                    <button onClick={() => { setShowServerPanel(false); setShowAddModal(true); }}>
                      Add Server
                    </button>
                  </div>
                ) : (
                  <ServerList
                    entries={entries}
                    onConnect={handleConnect}
                    onEdit={(entry) => { setShowServerPanel(false); handleEdit(entry); }}
                    onDelete={handleDelete}
                  />
                )}
              </div>
            </div>
          </div>
        )}

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

  // Regular dashboard mode
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
        
        {isConnecting && (
          <div className="connecting-overlay">
            <div className="connecting-modal">
              <div className="spinner" />
              <p>Connecting...</p>
            </div>
          </div>
        )}
        
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
