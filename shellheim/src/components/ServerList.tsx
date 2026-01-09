import type { Entry } from "../types/entry";
import "./ServerList.css";

interface ServerListProps {
  entries: Entry[];
  onConnect: (entry: Entry) => void;
  onConnectSftp?: (entry: Entry) => void;
  onEdit: (entry: Entry) => void;
  onDelete: (entry: Entry) => void;
}

export function ServerList({ entries, onConnect, onConnectSftp, onEdit, onDelete }: ServerListProps) {
  const getProtocolIcon = (protocol?: string) => {
    switch (protocol) {
      case "ssh":
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M6 8h.01" />
            <path d="M10 8h.01" />
            <path d="M14 8h.01" />
          </svg>
        );
      case "sftp":
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        );
      default:
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        );
    }
  };

  const getStatusColor = (entry: Entry) => {
    // For now, all are offline. Later we can add connection status
    return entry.last_connected_at ? "#22c55e" : "#6b7280";
  };

  return (
    <div className="server-list">
      {entries.map((entry) => (
        <div key={entry.id} className="server-card" onClick={() => onConnect(entry)}>
          <div className="server-icon" style={{ color: entry.color || "#6366f1" }}>
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
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </button>
            )}
            <button 
              className="action-btn" 
              onClick={() => onEdit(entry)}
              title="Edit"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button 
              className="action-btn action-btn-danger" 
              onClick={() => onDelete(entry)}
              title="Delete"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
