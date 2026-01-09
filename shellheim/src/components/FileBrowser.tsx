import { useState, useEffect, useCallback } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  CaretLeft,
  House,
  ArrowClockwise,
  UploadSimple,
  DownloadSimple,
  FolderPlus,
  Trash,
  List,
  SquaresFour,
  MagnifyingGlass,
} from '@phosphor-icons/react';
import type { FileEntry, SftpSessionInfo } from '../types/sftp';
import { formatFileSize, formatPermissions, getFileIcon } from '../types/sftp';
import {
  sftpListDir,
  sftpCreateDir,
  sftpDeleteFile,
  sftpDeleteDir,
  sftpRename,
  disconnectSftp,
  sftpDownloadFile,
  sftpUploadFiles,
  sftpDownloadDirectory,
} from '../lib/api';
import { TransferProgress, useTransferProgress } from './TransferProgress';
import { SearchPanel } from './SearchPanel';
import './FileBrowser.css';

interface FileBrowserProps {
  session: SftpSessionInfo;
  onClose: () => void;
}

export function FileBrowser({ session, onClose }: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState(session.current_path);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  
  // Transfer progress tracking
  const { transfers, addTransfer, clearTransfer, clearCompleted } = useTransferProgress();

  // Load directory contents
  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    setSelectedItems(new Set());
    
    try {
      const files = await sftpListDir({
        session_id: session.session_id,
        path,
      });
      setEntries(files);
      setCurrentPath(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load directory');
    } finally {
      setLoading(false);
    }
  }, [session.session_id]);

  // Initial load
  useEffect(() => {
    loadDirectory(currentPath);
  }, []);

  // Navigate to a directory
  const handleNavigate = (entry: FileEntry) => {
    if (entry.is_dir) {
      loadDirectory(entry.path);
    }
  };

  // Go up one directory
  const handleGoUp = () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    loadDirectory(parentPath);
  };

  // Go to home
  const handleGoHome = () => {
    loadDirectory(session.current_path);
  };

  // Refresh current directory
  const handleRefresh = () => {
    loadDirectory(currentPath);
  };

  // Create new folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    
    try {
      const newPath = currentPath === '/' 
        ? `/${newFolderName}` 
        : `${currentPath}/${newFolderName}`;
      
      await sftpCreateDir({
        session_id: session.session_id,
        path: newPath,
      });
      
      setNewFolderName('');
      setShowNewFolderInput(false);
      handleRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create folder');
    }
  };

  // Delete selected items
  const handleDelete = async () => {
    if (selectedItems.size === 0) return;
    
    const confirmMsg = selectedItems.size === 1
      ? 'Delete this item?'
      : `Delete ${selectedItems.size} items?`;
    
    if (!confirm(confirmMsg)) return;

    try {
      for (const path of selectedItems) {
        const entry = entries.find(e => e.path === path);
        if (!entry) continue;
        
        if (entry.is_dir) {
          await sftpDeleteDir({
            session_id: session.session_id,
            path,
          });
        } else {
          await sftpDeleteFile({
            session_id: session.session_id,
            path,
          });
        }
      }
      
      setSelectedItems(new Set());
      handleRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete item(s)');
    }
  };

  // Rename item
  const handleRename = async (oldPath: string) => {
    if (!renamingValue.trim() || renamingValue === oldPath.split('/').pop()) {
      setRenaming(null);
      return;
    }

    try {
      const parentPath = oldPath.split('/').slice(0, -1).join('/') || '/';
      const newPath = parentPath === '/'
        ? `/${renamingValue}`
        : `${parentPath}/${renamingValue}`;
      
      await sftpRename({
        session_id: session.session_id,
        old_path: oldPath,
        new_path: newPath,
      });
      
      setRenaming(null);
      handleRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rename');
    }
  };

  // Toggle selection
  const handleSelect = (path: string, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (event.ctrlKey || event.metaKey) {
      // Multi-select
      const newSelected = new Set(selectedItems);
      if (newSelected.has(path)) {
        newSelected.delete(path);
      } else {
        newSelected.add(path);
      }
      setSelectedItems(newSelected);
    } else {
      // Single select
      setSelectedItems(new Set([path]));
    }
  };

  // Disconnect
  const handleDisconnect = async () => {
    try {
      await disconnectSftp(session.session_id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disconnect');
    }
  };

  // Upload files
  const handleUpload = async () => {
    try {
      const selected = await open({
        multiple: true,
        directory: false,
        title: 'Select files to upload',
      });
      
      if (!selected || (Array.isArray(selected) && selected.length === 0)) {
        return; // User cancelled
      }

      const paths = Array.isArray(selected) ? selected : [selected];
      
      // Start upload
      const transferId = await sftpUploadFiles({
        session_id: session.session_id,
        local_paths: paths,
        remote_dir: currentPath,
      });
      
      // Track the transfer
      const fileName = paths.length === 1 
        ? paths[0].split('/').pop() || 'file'
        : `${paths.length} files`;
      addTransfer(transferId, fileName, 'upload');
      
      // Refresh after a short delay to see new files
      setTimeout(() => handleRefresh(), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    }
  };

  // Download selected files or directories
  const handleDownload = async () => {
    if (selectedItems.size === 0) return;

    // Separate files and directories
    const selectedEntries = entries.filter(e => selectedItems.has(e.path));
    const filesToDownload = selectedEntries.filter(e => !e.is_dir);
    const dirsToDownload = selectedEntries.filter(e => e.is_dir);

    try {
      // Download directories as ZIP files
      for (const dir of dirsToDownload) {
        const savePath = await save({
          defaultPath: `${dir.name}.zip`,
          title: `Save ${dir.name} as ZIP`,
          filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
        });

        if (!savePath) continue; // User cancelled

        const transferId = await sftpDownloadDirectory({
          session_id: session.session_id,
          remote_path: dir.path,
          local_path: savePath,
        });

        addTransfer(transferId, `${dir.name}.zip`, 'download');
      }

      // Download individual files
      for (const file of filesToDownload) {
        const savePath = await save({
          defaultPath: file.name,
          title: `Save ${file.name}`,
        });

        if (!savePath) continue; // User cancelled

        const transferId = await sftpDownloadFile({
          session_id: session.session_id,
          remote_path: file.path,
          local_path: savePath,
        });

        addTransfer(transferId, file.name, 'download');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    }
  };

  // Format timestamp
  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return '-';
    return new Date(timestamp * 1000).toLocaleString();
  };

  // Get breadcrumb parts
  const breadcrumbs = currentPath === '/' 
    ? ['/'] 
    : ['/', ...currentPath.split('/').filter(Boolean)];

  return (
    <div className="file-browser">
      {/* Header */}
      <div className="fb-header">
        <div className="fb-header-left">
          <div className="fb-icon">📁</div>
          <div className="fb-title">
            <h2>File Browser</h2>
            <span className="fb-host">{session.host}:{session.port}</span>
          </div>
        </div>
        <button className="fb-close" onClick={handleDisconnect} title="Disconnect">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Toolbar */}
      <div className="fb-toolbar">
        <div className="fb-nav-buttons">
          <button onClick={handleGoUp} title="Go up" disabled={currentPath === '/'}>
            <CaretLeft size={16} />
          </button>
          <button onClick={handleGoHome} title="Home">
            <House size={16} />
          </button>
          <button onClick={handleRefresh} title="Refresh" disabled={loading}>
            <ArrowClockwise size={16} className={loading ? 'spinning' : ''} />
          </button>
        </div>

        <div className="fb-breadcrumb">
          {breadcrumbs.map((part, idx) => {
            const path = idx === 0 
              ? '/' 
              : '/' + breadcrumbs.slice(1, idx + 1).join('/');
            
            return (
              <span key={idx}>
                {idx > 0 && <span className="fb-sep">/</span>}
                <button 
                  className="fb-crumb"
                  onClick={() => loadDirectory(path)}
                >
                  {part === '/' ? '~' : part}
                </button>
              </span>
            );
          })}
        </div>

        <div className="fb-actions">
          <button 
            onClick={() => setShowSearch(true)} 
            title="Search files"
            className={`fb-action-btn fb-action-search ${showSearch ? 'active' : ''}`}
          >
            <MagnifyingGlass size={16} />
          </button>
          <button 
            onClick={handleUpload} 
            title="Upload files"
            className="fb-action-btn fb-action-upload"
          >
            <UploadSimple size={16} />
          </button>
          <button 
            onClick={handleDownload} 
            disabled={selectedItems.size === 0}
            title="Download selected"
            className="fb-action-btn fb-action-download"
          >
            <DownloadSimple size={16} />
          </button>
          <button 
            onClick={() => setShowNewFolderInput(true)} 
            title="New folder"
            className="fb-action-btn"
          >
            <FolderPlus size={16} />
          </button>
          <button 
            onClick={handleDelete} 
            disabled={selectedItems.size === 0}
            title="Delete selected"
            className="fb-action-btn fb-action-danger"
          >
            <Trash size={16} />
          </button>
          <div className="fb-view-toggle">
            <button 
              className={viewMode === 'list' ? 'active' : ''} 
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <List size={16} />
            </button>
            <button 
              className={viewMode === 'grid' ? 'active' : ''} 
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >
              <SquaresFour size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* New folder input */}
      {showNewFolderInput && (
        <div className="fb-new-folder">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="New folder name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') {
                setShowNewFolderInput(false);
                setNewFolderName('');
              }
            }}
          />
          <button onClick={handleCreateFolder}>Create</button>
          <button onClick={() => { setShowNewFolderInput(false); setNewFolderName(''); }}>Cancel</button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="fb-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Content */}
      <div className={`fb-content ${viewMode}`}>
        {loading ? (
          <div className="fb-loading">
            <div className="spinner" />
            <p>Loading...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="fb-empty">
            <p>This folder is empty</p>
          </div>
        ) : viewMode === 'list' ? (
          <table className="fb-table">
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th>Size</th>
                <th>Modified</th>
                <th>Permissions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.path}
                  className={selectedItems.has(entry.path) ? 'selected' : ''}
                  onClick={(e) => handleSelect(entry.path, e)}
                  onDoubleClick={() => handleNavigate(entry)}
                >
                  <td className="fb-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(entry.path)}
                      onChange={() => {}}
                    />
                  </td>
                  <td className="fb-name">
                    <span className="fb-file-icon">{getFileIcon(entry.name, entry.is_dir)}</span>
                    {renaming === entry.path ? (
                      <input
                        type="text"
                        value={renamingValue}
                        onChange={(e) => setRenamingValue(e.target.value)}
                        onBlur={() => handleRename(entry.path)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(entry.path);
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span 
                        className="fb-file-name"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setRenaming(entry.path);
                          setRenamingValue(entry.name);
                        }}
                      >
                        {entry.name}
                      </span>
                    )}
                  </td>
                  <td className="fb-size">{entry.is_dir ? '-' : formatFileSize(entry.size)}</td>
                  <td className="fb-modified">{formatTime(entry.modified)}</td>
                  <td className="fb-perms">{formatPermissions(entry.permissions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="fb-grid">
            {entries.map((entry) => (
              <div
                key={entry.path}
                className={`fb-grid-item ${selectedItems.has(entry.path) ? 'selected' : ''}`}
                onClick={(e) => handleSelect(entry.path, e)}
                onDoubleClick={() => handleNavigate(entry)}
              >
                <span className="fb-grid-icon">{getFileIcon(entry.name, entry.is_dir)}</span>
                <span className="fb-grid-name" title={entry.name}>{entry.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="fb-status">
        <span>{entries.length} items</span>
        {selectedItems.size > 0 && <span>{selectedItems.size} selected</span>}
      </div>

      {/* Transfer progress overlay */}
      <TransferProgress
        transfers={transfers}
        onClear={clearTransfer}
        onClearAll={clearCompleted}
      />

      {/* Search panel */}
      {showSearch && (
        <SearchPanel
          sessionId={session.session_id}
          currentPath={currentPath}
          onNavigate={(path) => loadDirectory(path)}
          onClose={() => setShowSearch(false)}
        />
      )}
    </div>
  );
}
