import type { Identity } from "../types/identity";
import "./IdentityList.css";

interface IdentityListProps {
  identities: Identity[];
  onEdit: (identity: Identity) => void;
  onDelete: (identity: Identity) => void;
  onSelect?: (identity: Identity) => void;
  selectedId?: string;
}

export function IdentityList({ identities, onEdit, onDelete, onSelect, selectedId }: IdentityListProps) {
  return (
    <div className="identity-list">
      {identities.map((identity) => (
        <div
          key={identity.id}
          className={`identity-card ${selectedId === identity.id ? "selected" : ""}`}
          onClick={() => onSelect?.(identity)}
        >
          <div className="identity-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
          </div>
          
          <div className="identity-info">
            <span className="identity-name">{identity.name}</span>
            {identity.username && (
              <span className="identity-username">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                {identity.username}
              </span>
            )}
          </div>
          
          <div className="identity-actions">
            <button
              className="action-btn"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(identity);
              }}
              title="Edit"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button
              className="action-btn delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(identity);
              }}
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
