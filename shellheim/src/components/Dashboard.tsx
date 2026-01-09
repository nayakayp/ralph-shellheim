import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { SignOut, Stack, CheckCircle, Key, Plus, Desktop, Terminal as TerminalIcon, VideoCamera, Record, Stop } from "@phosphor-icons/react";
import type { Account } from "../types/auth";
import type { Entry, CreateEntryRequest, UpdateEntryRequest } from "../types/entry";
import type { SshSessionInfo, HibernatedSession } from "../types/ssh";
import type { SftpSessionInfo } from "../types/sftp";
import type { Folder, CreateFolderRequest } from "../types/folder";
import type { HostKeyStatus } from "../types/known_host";
import { buildFolderTree } from "../types/folder";
import { listEntries, createEntry, updateEntry, deleteEntry, connectSsh, listFolders, createFolder, deleteFolder, getFolderCounts, hibernateSession, listHibernatedSessions, resumeSession, deleteHibernatedSession, connectSftp, disconnectSftp, moveFolder, reorderFolders, moveEntry, reorderEntries, sendSshData, startRecording, stopRecording, isSessionRecording } from "../lib/api";
import type { Snippet } from "../types/snippet";
import { formatDuration } from "../types/recording";
import { ServerList } from "./ServerList";
import { AddServerModal } from "./AddServerModal";
import { EditServerModal } from "./EditServerModal";
import { IdentitiesPanel } from "./IdentitiesPanel";
import { FolderTree } from "./FolderTree";
import { HostKeyDialog } from "./HostKeyDialog";
import { KnownHostsPanel } from "./KnownHostsPanel";
import { TunnelPanel } from "./TunnelPanel";
import { SnippetsPanel } from "./SnippetsPanel";
import { RecordingsPanel } from "./RecordingsPanel";
import Terminal from "./Terminal/Terminal";
import { TerminalTabs } from "./Terminal/TerminalTabs";
import { FileBrowser } from "./FileBrowser";
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
  const [showKnownHosts, setShowKnownHosts] = useState(false);
  const [showTunnels, setShowTunnels] = useState(false);
  const [showSnippets, setShowSnippets] = useState(false);
  const [showRecordings, setShowRecordings] = useState(false);
  const [error, setError] = useState("");
  
  // Multiple SSH sessions state
  const [sessions, setSessions] = useState<SshSessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeTabType, setActiveTabType] = useState<"ssh" | "sftp">("ssh");
  const [hibernatedSessions, setHibernatedSessions] = useState<HibernatedSession[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showServerPanel, setShowServerPanel] = useState(false);
  
  // SFTP sessions state
  const [sftpSessions, setSftpSessions] = useState<SftpSessionInfo[]>([]);
  
  // Recording state
  const [recordingSessionId, setRecordingSessionId] = useState<string | null>(null); // Which session is being recorded
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null); // Recording ID for stopping
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null); // For elapsed time display
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  
  // Terminal refs for extracting buffer during hibernation
  const terminalRefs = useRef<Map<string, { getBuffer: () => string }>>(new Map());
  
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
      const [entriesData, foldersData, countsData, hibernatedData] = await Promise.all([
        listEntries(),
        listFolders(),
        getFolderCounts(),
        listHibernatedSessions(),
      ]);
      setEntries(entriesData);
      setFolders(foldersData);
      setFolderCounts(new Map(countsData));
      setHibernatedSessions(hibernatedData);
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

  const handleConnectSftp = async (entry: Entry) => {
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
      const session = await connectSftp({
        entry_id: entry.id,
      });
      
      setSftpSessions((prev) => [...prev, session]);
      setActiveSessionId(session.session_id);
      setActiveTabType("sftp");
      setShowServerPanel(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect";
      setError(`SFTP connection failed: ${message}`);
      console.error("SFTP connect error:", err);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCloseSftpTab = async (sessionId: string) => {
    try {
      await disconnectSftp(sessionId);
    } catch (err) {
      console.error("Error disconnecting SFTP:", err);
    }
    
    setSftpSessions((prev) => {
      const newSessions = prev.filter((s) => s.session_id !== sessionId);
      
      // If closing the active tab, switch to another
      if (activeSessionId === sessionId && activeTabType === "sftp") {
        if (newSessions.length > 0) {
          setActiveSessionId(newSessions[0].session_id);
        } else if (sessions.length > 0) {
          setActiveSessionId(sessions[0].session_id);
          setActiveTabType("ssh");
        } else {
          setActiveSessionId(null);
        }
      }
      
      return newSessions;
    });
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

  const handleMoveFolder = async (folderId: string, newParentId: string | null) => {
    const updated = await moveFolder(folderId, newParentId);
    setFolders((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  };

  const handleReorderFolders = async (folderIds: string[], parentId: string | null) => {
    await reorderFolders(folderIds, parentId);
    // Refetch folders to get updated sort_order values
    const updatedFolders = await listFolders();
    setFolders(updatedFolders);
  };

  const handleMoveEntryToFolder = async (entryId: string, folderId: string | null) => {
    const updated = await moveEntry(entryId, folderId);
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    // Update folder counts
    const counts = await getFolderCounts();
    setFolderCounts(counts);
  };

  const handleReorderEntries = async (entryIds: string[], folderId: string | null) => {
    await reorderEntries(entryIds, folderId);
    // Refetch entries to get updated sort_order values
    const updatedEntries = await listEntries();
    setEntries(updatedEntries);
  };

  const handleExecuteSnippet = async (snippet: Snippet) => {
    // Execute snippet in active SSH session
    if (!activeSessionId || activeTabType !== "ssh") {
      alert("No active SSH session. Connect to a server first.");
      return;
    }
    
    try {
      // Send snippet content to terminal, followed by Enter
      await sendSshData({
        session_id: activeSessionId,
        data: snippet.content + "\n",
      });
    } catch (err) {
      console.error("Failed to execute snippet:", err);
      alert("Failed to execute snippet: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  // Recording handlers
  const handleStartRecording = async () => {
    if (!activeSessionId || activeTabType !== "ssh") {
      alert("No active SSH session. Connect to a server first.");
      return;
    }
    
    // Check if this session is already being recorded
    if (recordingSessionId === activeSessionId) {
      return;
    }
    
    try {
      const activeSession = sessions.find(s => s.session_id === activeSessionId);
      const response = await startRecording({
        session_id: activeSessionId,
        name: activeSession ? `${activeSession.host} - ${new Date().toLocaleString()}` : undefined,
      });
      
      setRecordingSessionId(activeSessionId);
      setActiveRecordingId(response.recording_id);
      setRecordingStartTime(Date.now());
      setRecordingElapsed(0);
    } catch (err) {
      console.error("Failed to start recording:", err);
      alert("Failed to start recording: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  const handleStopRecording = async () => {
    if (!activeRecordingId) return;
    
    try {
      await stopRecording({ recording_id: activeRecordingId });
      setRecordingSessionId(null);
      setActiveRecordingId(null);
      setRecordingStartTime(null);
      setRecordingElapsed(0);
    } catch (err) {
      console.error("Failed to stop recording:", err);
      alert("Failed to stop recording: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  // Check if active session is being recorded
  const isActiveSessionRecording = activeSessionId && recordingSessionId === activeSessionId;

  // Update elapsed time for recording
  useEffect(() => {
    if (!recordingStartTime) return;
    
    const interval = setInterval(() => {
      setRecordingElapsed(Math.floor((Date.now() - recordingStartTime) / 1000));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [recordingStartTime]);

  // Check for active recording on session switch
  useEffect(() => {
    const checkRecording = async () => {
      if (!activeSessionId || activeTabType !== "ssh") return;
      
      try {
        const recordingId = await isSessionRecording(activeSessionId);
        if (recordingId) {
          setRecordingSessionId(activeSessionId);
          setActiveRecordingId(recordingId);
          // Note: We don't know exact start time, but can show as recording
          if (!recordingStartTime) {
            setRecordingStartTime(Date.now());
          }
        }
      } catch (err) {
        console.error("Failed to check recording status:", err);
      }
    };
    
    checkRecording();
  }, [activeSessionId, activeTabType]);

  const handleSelectTab = (sessionId: string, tabType: "ssh" | "sftp") => {
    setActiveSessionId(sessionId);
    setActiveTabType(tabType);
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

  const handleHibernateTab = async (sessionId: string) => {
    try {
      // Get terminal buffer from the terminal component
      const terminalRef = terminalRefs.current.get(sessionId);
      const terminalBuffer = terminalRef?.getBuffer?.();
      
      await hibernateSession({
        sessionId,
        terminalBuffer,
      });
      
      // Remove from active sessions
      setSessions((prev) => {
        const newSessions = prev.filter((s) => s.session_id !== sessionId);
        if (activeSessionId === sessionId && newSessions.length > 0) {
          setActiveSessionId(newSessions[0].session_id);
        } else if (newSessions.length === 0) {
          setActiveSessionId(null);
        }
        return newSessions;
      });
      
      // Refetch hibernated sessions list
      const updatedHibernated = await listHibernatedSessions();
      setHibernatedSessions(updatedHibernated);
      
      // Clean up terminal ref
      terminalRefs.current.delete(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to hibernate session");
    }
  };

  const handleResumeSession = async (hibernated: HibernatedSession) => {
    if (isConnecting) return;
    setIsConnecting(true);
    setError("");
    
    try {
      const response = await resumeSession({
        hibernatedSessionId: hibernated.id,
        cols: hibernated.terminalCols || 120,
        rows: hibernated.terminalRows || 30,
      });
      
      // Create new session with optional buffer for restoration
      const session: SshSessionInfo = {
        session_id: response.sessionId,
        entry_id: response.entryId,
        host: response.host,
        port: response.port,
        connected_at: response.connectedAt,
        initialBuffer: response.terminalBuffer, // Pass buffer for terminal restoration
      };
      
      setSessions((prev) => [...prev, session]);
      setActiveSessionId(session.session_id);
      
      // Remove from hibernated list
      setHibernatedSessions((prev) => prev.filter((h) => h.id !== hibernated.id));
      
      setShowServerPanel(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resume session");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDeleteHibernated = async (id: string) => {
    if (!confirm("Delete this hibernated session?")) return;
    
    try {
      await deleteHibernatedSession(id);
      setHibernatedSessions((prev) => prev.filter((h) => h.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete hibernated session");
    }
  };

  const handleNewConnection = () => {
    setShowServerPanel(true);
  };

  const handleTerminalClose = (sessionId: string) => {
    handleCloseTab(sessionId);
  };

  // Terminal mode: show terminals if we have any sessions (or hibernated sessions to show in tabs)
  if (sessions.length > 0 || hibernatedSessions.length > 0 || sftpSessions.length > 0) {
    const activeSession = sessions.find(s => s.session_id === activeSessionId);
    
    return (
      <div className="dashboard terminal-mode">
        <TerminalTabs
          sessions={sessions}
          sftpSessions={sftpSessions}
          activeSessionId={activeSessionId}
          activeTabType={activeTabType}
          hibernatedSessions={hibernatedSessions}
          onSelectTab={handleSelectTab}
          onCloseTab={handleCloseTab}
          onCloseSftpTab={handleCloseSftpTab}
          onHibernateTab={handleHibernateTab}
          onResumeSession={handleResumeSession}
          onDeleteHibernated={handleDeleteHibernated}
          onNewConnection={handleNewConnection}
        />
        
        {/* Terminal toolbar with recording controls */}
        {activeSessionId && activeTabType === "ssh" && (
          <div className="terminal-toolbar">
            <div className="terminal-toolbar-left">
              <span className="session-host">
                {activeSession?.host}:{activeSession?.port}
              </span>
            </div>
            <div className="terminal-toolbar-right">
              {isActiveSessionRecording ? (
                <button 
                  className="toolbar-btn recording-active"
                  onClick={handleStopRecording}
                  title="Stop Recording"
                >
                  <span className="recording-indicator" />
                  <Stop size={16} weight="fill" />
                  <span className="recording-time">{formatDuration(recordingElapsed)}</span>
                  Stop Recording
                </button>
              ) : (
                <button 
                  className="toolbar-btn"
                  onClick={handleStartRecording}
                  title="Start Recording"
                >
                  <Record size={16} weight="fill" />
                  Record
                </button>
              )}
              <button 
                className="toolbar-btn"
                onClick={() => setShowRecordings(true)}
                title="View Recordings"
              >
                <VideoCamera size={16} />
                Recordings
              </button>
              <button 
                className="toolbar-btn"
                onClick={() => setShowSnippets(true)}
                title="Command Snippets"
              >
                <TerminalIcon size={16} />
                Snippets
              </button>
              <button 
                className="toolbar-btn"
                onClick={() => setShowTunnels(true)}
                title="SSH Tunnels"
              >
                <Stack size={16} />
                Tunnels
              </button>
            </div>
          </div>
        )}
        
        <div className="terminal-area">
          {sessions.map((session) => (
            <Terminal
              key={session.session_id}
              sessionId={session.session_id}
              host={`${session.host}:${session.port}`}
              isActive={session.session_id === activeSessionId && activeTabType === "ssh"}
              initialBuffer={session.initialBuffer}
              onClose={() => handleTerminalClose(session.session_id)}
            />
          ))}
          {sftpSessions.map((session) => (
            <div 
              key={session.session_id}
              className={`sftp-browser-wrapper ${session.session_id === activeSessionId && activeTabType === "sftp" ? "active" : ""}`}
            >
              <FileBrowser
                session={session}
                onClose={() => handleCloseSftpTab(session.session_id)}
              />
            </div>
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
                    onConnectSftp={handleConnectSftp}
                    onEdit={(entry) => { setShowServerPanel(false); handleEdit(entry); }}
                    onDelete={handleDelete}
                    onReorderEntries={handleReorderEntries}
                    currentFolderId={null}
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

        <KnownHostsPanel
          isOpen={showKnownHosts}
          onClose={() => setShowKnownHosts(false)}
        />

        <TunnelPanel
          isOpen={showTunnels}
          onClose={() => setShowTunnels(false)}
          sessions={sessions}
        />

        <SnippetsPanel
          isOpen={showSnippets}
          onClose={() => setShowSnippets(false)}
          onExecute={handleExecuteSnippet}
        />

        <RecordingsPanel
          isOpen={showRecordings}
          onClose={() => setShowRecordings(false)}
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
            <SignOut size={18} />
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
          onMoveFolder={handleMoveFolder}
          onReorderFolders={handleReorderFolders}
          onMoveEntryToFolder={handleMoveEntryToFolder}
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
              <button className="toolbar-btn" onClick={() => setShowRecordings(true)} title="View Session Recordings">
                <VideoCamera size={18} />
                Recordings
              </button>
              <button className="toolbar-btn" onClick={() => setShowSnippets(true)} title="Manage Command Snippets">
                <TerminalIcon size={18} />
                Snippets
              </button>
              <button className="toolbar-btn" onClick={() => setShowTunnels(true)} title="Manage SSH Tunnels">
                <Stack size={18} />
                Tunnels
              </button>
              <button className="toolbar-btn" onClick={() => setShowKnownHosts(true)} title="Manage Known Hosts">
                <CheckCircle size={18} />
                Hosts
              </button>
              <button className="toolbar-btn" onClick={() => setShowIdentities(true)} title="Manage Identities">
                <Key size={18} />
                Identities
              </button>
              <button className="add-btn" onClick={() => setShowAddModal(true)}>
                <Plus size={18} />
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
                  <Desktop size={64} weight="light" />
                </div>
                <h2>{selectedFolderId ? "No servers in this folder" : "No servers yet"}</h2>
                <p>{selectedFolderId ? "Add a server to this folder" : "Add your first SSH server to get started"}</p>
                <button className="add-server-btn" onClick={() => setShowAddModal(true)}>
                  <Plus size={20} />
                  Add Server
                </button>
              </div>
            ) : (
              <ServerList
                entries={filteredEntries}
                onConnect={handleConnect}
                onConnectSftp={handleConnectSftp}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onReorderEntries={handleReorderEntries}
                currentFolderId={selectedFolderId}
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

      <KnownHostsPanel
        isOpen={showKnownHosts}
        onClose={() => setShowKnownHosts(false)}
      />

      <TunnelPanel
        isOpen={showTunnels}
        onClose={() => setShowTunnels(false)}
        sessions={sessions}
      />

      <SnippetsPanel
        isOpen={showSnippets}
        onClose={() => setShowSnippets(false)}
        onExecute={handleExecuteSnippet}
      />

      <RecordingsPanel
        isOpen={showRecordings}
        onClose={() => setShowRecordings(false)}
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
