import { useCallback, useState } from "react";
import { Terminal, File, Monitor, DotsSixVertical, FileText, PencilSimple, Trash } from "@phosphor-icons/react";
import type { Entry } from "../types/entry";
import "./ServerList.css";

interface ServerListProps {
  entries: Entry[];
  onConnect: (entry: Entry) => void;
  onConnectSftp?: (entry: Entry) => void;
  onEdit: (entry: Entry) => void;
  onDelete: (entry: Entry) => void;
  onReorderEntries?: (entryIds: string[], folderId: string | null) => Promise<void>;
  currentFolderId: string | null;
}

export function ServerList({ 
  entries, 
  onConnect, 
  onConnectSftp, 
  onEdit, 
  onDelete,
  onReorderEntries,
  currentFolderId,
}: ServerListProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const getProtocolIcon = (protocol?: string) => {
    switch (protocol) {
      case "ssh":
        return <Terminal size={18} weight="regular" />;
      case "sftp":
        return <File size={18} weight="regular" />;
      default:
        return <Monitor size={18} weight="regular" />;
    }
  };

  const getStatusColor = (entry: Entry) => {
    // For now, all are offline. Later we can add connection status
    return entry.last_connected_at ? "#22c55e" : "#6b7280";
  };

  // Drag handlers for reordering
  const handleDragStart = useCallback((e: React.DragEvent, index: number, entry: Entry) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-entry", entry.id);
    e.dataTransfer.setData("text/plain", entry.name);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes("application/x-entry")) return;
    e.dataTransfer.dropEffect = "move";
    setDropTargetIndex(index);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if we're leaving to an element outside the card
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDropTargetIndex(null);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDropTargetIndex(null);
    
    if (draggedIndex === null || draggedIndex === dropIndex || !onReorderEntries) {
      setDraggedIndex(null);
      return;
    }

    // Create new order
    const newOrder = [...entries];
    const [draggedItem] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(dropIndex, 0, draggedItem);
    
    const entryIds = newOrder.map(e => e.id);
    
    try {
      await onReorderEntries(entryIds, currentFolderId);
    } catch (err) {
      console.error("Failed to reorder entries:", err);
    }
    
    setDraggedIndex(null);
  }, [draggedIndex, entries, onReorderEntries, currentFolderId]);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDropTargetIndex(null);
  }, []);

  return (
    <div className="server-list">
      {entries.map((entry, index) => (
        <div 
          key={entry.id} 
          className={`server-card ${draggedIndex === index ? "dragging" : ""} ${dropTargetIndex === index ? "drop-target" : ""}`}
          onClick={() => onConnect(entry)}
          draggable
          onDragStart={(e) => handleDragStart(e, index, entry)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, index)}
          onDragEnd={handleDragEnd}
        >
          <div className="server-drag-handle" onClick={(e) => e.stopPropagation()}>
            <DotsSixVertical size={12} weight="bold" />
          </div>
          
          <div className="server-icon" style={{ color: entry.color || "#0ea5e9" }}>
            {getProtocolIcon(entry.protocol)}
            <span 
              className="server-status" 
              style={{ backgroundColor: getStatusColor(entry) }}
            />
          </div>
          
          <div className="server-info">
            <div className="server-name">{entry.name}</div>
            <div className="server-host">
              {entry.host}:{entry.port}
              <span className="server-protocol">{entry.protocol?.toUpperCase()}</span>
            </div>
            {entry.description && (
              <div className="server-description">{entry.description}</div>
            )}
          </div>
          
          <div className="server-actions" onClick={(e) => e.stopPropagation()}>
            {onConnectSftp && (
              <button 
                className="action-btn action-btn-sftp" 
                onClick={() => onConnectSftp(entry)}
                title="Open SFTP"
              >
                <FileText size={16} weight="regular" />
              </button>
            )}
            <button 
              className="action-btn" 
              onClick={() => onEdit(entry)}
              title="Edit"
            >
              <PencilSimple size={16} weight="regular" />
            </button>
            <button 
              className="action-btn action-btn-danger" 
              onClick={() => onDelete(entry)}
              title="Delete"
            >
              <Trash size={16} weight="regular" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
