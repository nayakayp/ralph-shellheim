import { useState, useCallback } from "react";
import type { FolderNode, CreateFolderRequest } from "../types/folder";
import "./FolderTree.css";

interface FolderTreeProps {
  folders: FolderNode[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder: (request: CreateFolderRequest) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  rootEntryCount: number;
}

export function FolderTree({
  folders,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  onDeleteFolder,
  rootEntryCount,
}: FolderTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);

  const toggleExpand = useCallback((folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const startCreating = useCallback((parentId: string | null = null, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setNewFolderParentId(parentId);
    setNewFolderName("");
    setIsCreating(true);
  }, []);

  const cancelCreating = useCallback(() => {
    setIsCreating(false);
    setNewFolderName("");
    setNewFolderParentId(null);
  }, []);

  const handleCreateSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    
    try {
      await onCreateFolder({
        name: newFolderName.trim(),
        parent_id: newFolderParentId,
      });
      cancelCreating();
    } catch (err) {
      console.error("Failed to create folder:", err);
    }
  }, [newFolderName, newFolderParentId, onCreateFolder, cancelCreating]);

  const handleDelete = useCallback(async (folderId: string, folderName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete folder "${folderName}"?`)) return;
    
    try {
      await onDeleteFolder(folderId);
      if (selectedFolderId === folderId) {
        onSelectFolder(null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete folder");
    }
  }, [onDeleteFolder, selectedFolderId, onSelectFolder]);

  const renderFolder = (node: FolderNode, depth: number = 0) => {
    const isExpanded = expandedIds.has(node.id);
    const isSelected = selectedFolderId === node.id;
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.id} className="folder-item-container">
        <div
          className={`folder-item ${isSelected ? "selected" : ""}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => onSelectFolder(node.id)}
        >
          {hasChildren ? (
            <button
              className="folder-expand-btn"
              onClick={(e) => toggleExpand(node.id, e)}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ transform: isExpanded ? "rotate(90deg)" : "none" }}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ) : (
            <span className="folder-expand-placeholder" />
          )}
          
          <svg
            className="folder-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke={node.color || "currentColor"}
            strokeWidth="2"
          >
            {isExpanded ? (
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            ) : (
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11z" />
            )}
          </svg>
          
          <span className="folder-name">{node.name}</span>
          
          {node.entryCount > 0 && (
            <span className="folder-count">{node.entryCount}</span>
          )}
          
          <div className="folder-actions">
            <button
              className="folder-action-btn"
              onClick={(e) => startCreating(node.id, e)}
              title="Add subfolder"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button
              className="folder-action-btn delete"
              onClick={(e) => handleDelete(node.id, node.name, e)}
              title="Delete folder"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>
        
        {hasChildren && isExpanded && (
          <div className="folder-children">
            {node.children.map((child) => renderFolder(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="folder-tree">
      <div className="folder-tree-header">
        <h3>Folders</h3>
        <button
          className="folder-add-btn"
          onClick={() => startCreating(null)}
          title="New folder"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      
      {/* All servers (root) */}
      <div
        className={`folder-item root ${selectedFolderId === null ? "selected" : ""}`}
        onClick={() => onSelectFolder(null)}
      >
        <svg
          className="folder-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
        <span className="folder-name">All Servers</span>
        {rootEntryCount > 0 && (
          <span className="folder-count">{rootEntryCount}</span>
        )}
      </div>
      
      {/* Folder tree */}
      <div className="folder-list">
        {folders.map((folder) => renderFolder(folder))}
      </div>
      
      {/* Create folder form */}
      {isCreating && (
        <div className="folder-create-overlay" onClick={cancelCreating}>
          <form
            className="folder-create-form"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateSubmit}
          >
            <input
              type="text"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              autoFocus
            />
            <div className="folder-create-actions">
              <button type="button" onClick={cancelCreating}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={!newFolderName.trim()}>
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
