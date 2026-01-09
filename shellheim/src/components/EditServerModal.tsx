import { useState, useEffect } from "react";
import { X } from "@phosphor-icons/react";
import type { Entry, UpdateEntryRequest, Protocol } from "../types/entry";
import type { Identity } from "../types/identity";
import type { Folder } from "../types/folder";
import { PROTOCOL_DEFAULTS } from "../types/entry";
import { listIdentities } from "../lib/api";
import "./AddServerModal.css"; // Reuse same modal styles

interface EditServerModalProps {
  entry: Entry;
  folders: Folder[];
  onClose: () => void;
  onSubmit: (request: UpdateEntryRequest) => Promise<void>;
}

export function EditServerModal({ entry, folders, onClose, onSubmit }: EditServerModalProps) {
  const [name, setName] = useState(entry.name);
  const [host, setHost] = useState(entry.host || "");
  const [port, setPort] = useState(entry.port || 22);
  const [protocol, setProtocol] = useState<Protocol>((entry.protocol as Protocol) || "ssh");
  const [description, setDescription] = useState(entry.description || "");
  const [selectedIdentityId, setSelectedIdentityId] = useState<string>(
    entry.identity_ids?.[0] || ""
  );
  const [folderId, setFolderId] = useState<string>(entry.folder_id || "");
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Load identities for the dropdown
    listIdentities()
      .then(setIdentities)
      .catch(console.error);
  }, []);

  const handleProtocolChange = (newProtocol: Protocol) => {
    setProtocol(newProtocol);
    // Only update port if it matches the old protocol's default
    const oldDefault = PROTOCOL_DEFAULTS[(entry.protocol as Protocol) || "ssh"];
    if (port === oldDefault) {
      setPort(PROTOCOL_DEFAULTS[newProtocol]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!host.trim()) {
      setError("Host is required");
      return;
    }

    setIsLoading(true);
    try {
      await onSubmit({
        name: name.trim(),
        host: host.trim(),
        port,
        protocol,
        description: description.trim() || undefined,
        identity_ids: selectedIdentityId ? [selectedIdentityId] : [],
        folder_id: folderId || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update server");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Server</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="modal-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Server"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="host">Host</label>
            <input
              id="host"
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="192.168.1.100 or example.com"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="protocol">Protocol</label>
              <select
                id="protocol"
                value={protocol}
                onChange={(e) => handleProtocolChange(e.target.value as Protocol)}
              >
                <option value="ssh">SSH</option>
                <option value="sftp">SFTP</option>
                <option value="telnet">Telnet</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="port">Port</label>
              <input
                id="port"
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value) || 22)}
                min="1"
                max="65535"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="folder">Folder</label>
            <select
              id="folder"
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
            >
              <option value="">No folder</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="identity">Credentials</label>
            <select
              id="identity"
              value={selectedIdentityId}
              onChange={(e) => setSelectedIdentityId(e.target.value)}
              className="identity-select"
            >
              <option value="">No credentials</option>
              {identities.map((identity) => (
                <option key={identity.id} value={identity.id}>
                  {identity.name} {identity.username ? `(${identity.username})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="description">Description (optional)</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Production web server..."
              rows={2}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isLoading}>
              {isLoading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
