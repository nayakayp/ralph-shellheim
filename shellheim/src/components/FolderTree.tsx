import { useState, useCallback, useRef } from "react";
import { CaretRight, Folder, FolderOpen, Desktop, Plus, Trash } from "@phosphor-icons/react";
import type { FolderNode, CreateFolderRequest } from "../types/folder";
import "./FolderTree.css";

interface FolderTreeProps {
  folders: FolderNode[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder: (request: CreateFolderRequest) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onMoveFolder: (folderId: string, newParentId: string | null) => Promise<void>;
  onReorderFolders: (folderIds: string[], parentId: string | null) => Promise<void>;
  onMoveEntryToFolder?: (entryId: string, folderId: string | null) => Promise<void>;
  rootEntryCount: number;
}

interface DragState {
  type: "folder" | "entry";
  id: string;
  parentId: string | null;
}

export function FolderTree({
  folders,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  onDeleteFolder,
  onMoveFolder,
  onReorderFolders: _onReorderFolders, // Reserved for future intra-parent reordering
  onMoveEntryToFolder,
  rootEntryCount,
}: FolderTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null | "root">(null);
  const dragPreviewRef = useRef<HTMLDivElement>(null);

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

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, folderId: string, parentId: string | null) => {
    e.stopPropagation();
    setDragState({ type: "folder", id: folderId, parentId });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-folder", folderId);
    
    // Create a custom drag preview
    const target = e.currentTarget as HTMLElement;
    if (target) {
      e.dataTransfer.setDragImage(target, 0, 0);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, targetId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Check if we're dragging a folder or entry
    const hasFolderData = e.dataTransfer.types.includes("application/x-folder");
    const hasEntryData = e.dataTransfer.types.includes("application/x-entry");
    
    if (!hasFolderData && !hasEntryData) return;
    
    // If dragging a folder, prevent dropping on itself or its descendants
    if (hasFolderData && dragState?.type === "folder") {
      if (targetId === dragState.id) return;
      // Would need to check descendants, but that's validated on the backend
    }
    
    e.dataTransfer.dropEffect = "move";
    setDropTargetId(targetId);
  }, [dragState]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only clear if we're leaving to an element outside the tree
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDropTargetId(null);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetId(null);
    
    const folderId = e.dataTransfer.getData("application/x-folder");
    const entryId = e.dataTransfer.getData("application/x-entry");
    
    if (folderId && folderId !== targetId) {
      try {
        await onMoveFolder(folderId, targetId);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to move folder");
      }
    } else if (entryId && onMoveEntryToFolder) {
      try {
        await onMoveEntryToFolder(entryId, targetId);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to move server");
      }
    }
    
    setDragState(null);
  }, [onMoveFolder, onMoveEntryToFolder]);

  const handleDragEnd = useCallback(() => {
    setDragState(null);
    setDropTargetId(null);
  }, []);

  const renderFolder = (node: FolderNode, depth: number = 0) => {
    const isExpanded = expandedIds.has(node.id);
    const isSelected = selectedFolderId === node.id;
    const hasChildren = node.children.length > 0;
    const isDragging = dragState?.id === node.id;
    const isDropTarget = dropTargetId === node.id;

    return (
      <div key={node.id} className="folder-item-container">
        <div
          className={`folder-item ${isSelected ? "selected" : ""} ${isDragging ? "dragging" : ""} ${isDropTarget ? "drop-target" : ""}`}
          style={{ "--folder-depth": depth } as React.CSSProperties}
          onClick={() => onSelectFolder(node.id)}
          draggable
          onDragStart={(e) => handleDragStart(e, node.id, node.parent_id)}
          onDragOver={(e) => handleDragOver(e, node.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, node.id)}
          onDragEnd={handleDragEnd}
        >
          {hasChildren ? (
            <button
              className="folder-expand-btn"
              onClick={(e) => toggleExpand(node.id, e)}
            >
              <CaretRight
                size={12}
                style={{ transform: isExpanded ? "rotate(90deg)" : "none" }}
              />
            </button>
          ) : (
            <span className="folder-expand-placeholder" />
          )}
          
          {isExpanded ? (
            <FolderOpen className="folder-icon" size={16} color={node.color || "currentColor"} />
          ) : (
            <Folder className="folder-icon" size={16} color={node.color || "currentColor"} />
          )}
          
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
              <Plus size={12} />
            </button>
            <button
              className="folder-action-btn delete"
              onClick={(e) => handleDelete(node.id, node.name, e)}
              title="Delete folder"
            >
              <Trash size={12} />
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
    <div className="folder-tree" ref={dragPreviewRef}>
      <div className="folder-tree-header">
        <h3>Folders</h3>
        <button
          className="folder-add-btn"
          onClick={() => startCreating(null)}
          title="New folder"
        >
          <Plus size={14} />
        </button>
      </div>
      
      {/* All servers (root) */}
      <div
        className={`folder-item root ${selectedFolderId === null ? "selected" : ""} ${dropTargetId === "root" ? "drop-target" : ""}`}
        onClick={() => onSelectFolder(null)}
        onDragOver={(e) => handleDragOver(e, null)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, null)}
      >
        <Desktop className="folder-icon" size={16} />
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
