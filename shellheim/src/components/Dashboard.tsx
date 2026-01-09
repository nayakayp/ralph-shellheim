import { useState, useEffect, useCallback, useMemo } from "react";
import type { Account } from "../types/auth";
import type { Entry, CreateEntryRequest, UpdateEntryRequest } from "../types/entry";
import type { SshSessionInfo } from "../types/ssh";
import type { Folder, CreateFolderRequest } from "../types/folder";
import type { HostKeyStatus } from "../types/known_host";
import { buildFolderTree } from "../types/folder";
import { listEntries, createEntry, updateEntry, deleteEntry, connectSsh, listFolders, createFolder, deleteFolder, getFolderCounts } from "../lib/api";
import { ServerList } from "./ServerList";
import { AddServerModal } from "./AddServerModal";
import { EditServerModal } from "./EditServerModal";
import { IdentitiesPanel } from "./IdentitiesPanel";
import { FolderTree } from "./FolderTree";
import { HostKeyDialog } from "./HostKeyDialog";
import Terminal from "./Terminal/Terminal";
import { TerminalTabs } from "./Terminal/TerminalTabs";
import "./Dashboard.css";

interface DashboardProps {
  account: Account;
  onLogout: () => Promise<void>;
}

export function Dashboard({ account, onLogout }: DashboardProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderCounts, setFolderCounts] = useState<Map<string, number>>(new Map());
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
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
  
  // Host key verification state
  const [hostKeyVerification, setHostKeyVerification] = useState<{
    entry: Entry;
    host: string;
    port: number;
    status: HostKeyStatus;
  } | null>(null);

  // Build folder tree from flat list
  const folderTree = useMemo(() => buildFolderTree(folders, folderCounts), [folders, folderCounts]);
  
  // Filter entries by selected folder
  const filteredEntries = useMemo(() => {
    if (selectedFolderId === null) {
      return entries; // Show all
    }
    return entries.filter((e) => e.folder_id === selectedFolderId);
  }, [entries, selectedFolderId]);

  // Count entries at root (no folder)
  const rootEntryCount = useMemo(() => entries.length, [entries]);

  const loadData = useCallback(async () => {
    try {
      setError("");
      const [entriesData, foldersData, countsData] = await Promise.all([
        listEntries(),
        listFolders(),
        getFolderCounts(),
      ]);
      setEntries(entriesData);
      setFolders(foldersData);
      setFolderCounts(new Map(countsData));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddServer = async (request: CreateEntryRequest) => {
    const newEntry = await createEntry(request);
    setEntries((prev) => [...prev, newEntry]);
    // Update folder counts
    if (newEntry.folder_id) {
      setFolderCounts((prev) => {
        const next = new Map(prev);
        next.set(newEntry.folder_id!, (prev.get(newEntry.folder_id!) || 0) + 1);
        return next;
      });
    }
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
      const response = await connectSsh({
        entry_id: entry.id,
        cols: 120,
        rows: 30,
      });
      
      if (response.type === "Connected") {
        // Successfully connected - add to sessions
        const session: SshSessionInfo = {
          session_id: response.session_id,
          entry_id: response.entry_id,
          host: response.host,
          port: response.port,
          connected_at: response.connected_at,
        };
        setSessions((prev) => [...prev, session]);
        setActiveSessionId(session.session_id);
        setShowServerPanel(false);
      } else if (response.type === "HostKeyVerification") {
        // Need to verify host key first
        setHostKeyVerification({
          entry,
          host: response.host,
          port: response.port,
          status: response.status,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect";
      setError(`Connection failed: ${message}`);
      console.error("SSH connect error:", err);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleHostKeyAccept = async () => {
    if (!hostKeyVerification) return;
    
    // Close the dialog and retry connection
    const entry = hostKeyVerification.entry;
    setHostKeyVerification(null);
    
    // Retry connection (now the host key should be trusted)
    await handleConnect(entry);
  };

  const handleHostKeyReject = () => {
    setHostKeyVerification(null);
    setError("Connection cancelled: Host key not trusted");
  };

  const handleEdit = (entry: Entry) => {
    setEditingEntry(entry);
  };

  const handleDelete = async (entry: Entry) => {
    if (!confirm(`Delete "${entry.name}"?`)) return;
    
    try {
      await deleteEntry(entry.id);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      // Update folder counts
      if (entry.folder_id) {
        setFolderCounts((prev) => {
          const next = new Map(prev);
          const current = prev.get(entry.folder_id!) || 0;
          if (current > 1) {
            next.set(entry.folder_id!, current - 1);
          } else {
            next.delete(entry.folder_id!);
          }
          return next;
        });
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete server");
    }
  };

  const handleCreateFolder = async (request: CreateFolderRequest) => {
    const newFolder = await createFolder(request);
    setFolders((prev) => [...prev, newFolder]);
  };

  const handleDeleteFolder = async (folderId: string) => {
    await deleteFolder(folderId);
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    if (selectedFolderId === folderId) {
      setSelectedFolderId(null);
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
            folders={folders}
            selectedFolderId={selectedFolderId}
            onClose={() => setShowAddModal(false)}
            onSubmit={handleAddServer}
          />
        )}

        {editingEntry && (
          <EditServerModal
            entry={editingEntry}
            folders={folders}
            onClose={() => setEditingEntry(null)}
            onSubmit={handleUpdateServer}
          />
        )}

        <IdentitiesPanel
          isOpen={showIdentities}
          onClose={() => setShowIdentities(false)}
        />

        {hostKeyVerification && (
          <HostKeyDialog
            host={hostKeyVerification.host}
            port={hostKeyVerification.port}
            status={hostKeyVerification.status}
            onAccept={handleHostKeyAccept}
            onReject={handleHostKeyReject}
          />
        )}
      </div>
    );
  }

  // Regular dashboard mode with folder sidebar
  return (
    <div className="dashboard with-sidebar">
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

      <div className="dashboard-body">
        {/* Folder sidebar */}
        <FolderTree
          folders={folderTree}
          selectedFolderId={selectedFolderId}
          onSelectFolder={setSelectedFolderId}
          onCreateFolder={handleCreateFolder}
          onDeleteFolder={handleDeleteFolder}
          rootEntryCount={rootEntryCount}
        />

        {/* Main content */}
        <div className="dashboard-content">
          <div className="dashboard-toolbar">
            <div className="toolbar-left">
              <h1>{selectedFolderId ? folders.find((f) => f.id === selectedFolderId)?.name || "Servers" : "All Servers"}</h1>
              <span className="server-count">{filteredEntries.length}</span>
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
            ) : filteredEntries.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </div>
                <h2>{selectedFolderId ? "No servers in this folder" : "No servers yet"}</h2>
                <p>{selectedFolderId ? "Add a server to this folder" : "Add your first SSH server to get started"}</p>
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
                entries={filteredEntries}
                onConnect={handleConnect}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            )}
          </main>
        </div>
      </div>

      {showAddModal && (
        <AddServerModal
          folders={folders}
          selectedFolderId={selectedFolderId}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddServer}
        />
      )}

      {editingEntry && (
        <EditServerModal
          entry={editingEntry}
          folders={folders}
          onClose={() => setEditingEntry(null)}
          onSubmit={handleUpdateServer}
        />
      )}

      <IdentitiesPanel
        isOpen={showIdentities}
        onClose={() => setShowIdentities(false)}
      />

      {hostKeyVerification && (
        <HostKeyDialog
          host={hostKeyVerification.host}
          port={hostKeyVerification.port}
          status={hostKeyVerification.status}
          onAccept={handleHostKeyAccept}
          onReject={handleHostKeyReject}
        />
      )}
    </div>
  );
}
