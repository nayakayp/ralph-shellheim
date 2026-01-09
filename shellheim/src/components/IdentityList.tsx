import { Key, User, PencilSimple, Trash } from "@phosphor-icons/react";
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
            <Key size={20} />
          </div>
          
          <div className="identity-info">
            <span className="identity-name">{identity.name}</span>
            {identity.username && (
              <span className="identity-username">
                <User size={12} />
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
              <PencilSimple size={16} />
            </button>
            <button
              className="action-btn delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(identity);
              }}
              title="Delete"
            >
              <Trash size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
