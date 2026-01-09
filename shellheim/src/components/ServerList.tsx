import { useCallback, useState, useEffect } from "react";
import { Terminal, File, Monitor, DotsSixVertical, FileText, PencilSimple, Trash, ChartLine, Package } from "@phosphor-icons/react";
import type { Entry } from "../types/entry";
import type { Tag } from "../types/tag";
import { getContrastColor } from "../types/tag";
import { getEntryTags } from "../lib/api";
import "./ServerList.css";

interface ServerListProps {
  entries: Entry[];
  onConnect: (entry: Entry) => void;
  onConnectSftp?: (entry: Entry) => void;
  onViewStats?: (entry: Entry) => void;
  onViewDocker?: (entry: Entry) => void;
  onEdit: (entry: Entry) => void;
  onDelete: (entry: Entry) => void;
  onReorderEntries?: (entryIds: string[], folderId: string | null) => Promise<void>;
  currentFolderId: string | null;
}

export function ServerList({ 
  entries, 
  onConnect, 
  onConnectSftp, 
  onViewStats,
  onViewDocker,
  onEdit, 
  onDelete,
  onReorderEntries,
  currentFolderId,
}: ServerListProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [entryTags, setEntryTags] = useState<Map<string, Tag[]>>(new Map());

  // Fetch tags for all entries
  useEffect(() => {
    async function fetchAllTags() {
      const tagsMap = new Map<string, Tag[]>();
      
      await Promise.all(
        entries.map(async (entry) => {
          try {
            const tags = await getEntryTags(entry.id);
            tagsMap.set(entry.id, tags);
          } catch (err) {
            console.error(`Failed to fetch tags for entry ${entry.id}:`, err);
            tagsMap.set(entry.id, []);
          }
        })
      );
      
      setEntryTags(tagsMap);
    }
    
    if (entries.length > 0) {
      fetchAllTags();
    } else {
      setEntryTags(new Map());
    }
  }, [entries]);

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
            {entryTags.get(entry.id)?.length ? (
              <div className="server-tags">
                {entryTags.get(entry.id)?.map((tag) => (
                  <span
                    key={tag.id}
                    className="server-tag-chip"
                    style={{
                      backgroundColor: tag.color || '#6b7280',
                      color: getContrastColor(tag.color || '#6b7280'),
                    }}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          
          <div className="server-actions" onClick={(e) => e.stopPropagation()}>
            {onViewStats && (entry.protocol === "ssh" || !entry.protocol) && (
              <button 
                className="action-btn action-btn-stats" 
                onClick={() => onViewStats(entry)}
                title="View Stats"
              >
                <ChartLine size={16} weight="regular" />
              </button>
            )}
            {onViewDocker && (entry.protocol === "ssh" || !entry.protocol) && (
              <button 
                className="action-btn action-btn-docker" 
                onClick={() => onViewDocker(entry)}
                title="Docker"
              >
                <Package size={16} weight="regular" />
              </button>
            )}
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
