import { useState, useEffect } from "react";
import { X } from "@phosphor-icons/react";
import type { Entry, CreateEntryRequest, Protocol } from "../types/entry";
import type { Identity } from "../types/identity";
import type { Folder } from "../types/folder";
import { PROTOCOL_DEFAULTS } from "../types/entry";
import { listIdentities, listEntries } from "../lib/api";
import { TagSelector } from "./TagSelector";
import "./AddServerModal.css";

interface AddServerModalProps {
  folders: Folder[];
  selectedFolderId: string | null;
  onClose: () => void;
  onSubmit: (request: CreateEntryRequest) => Promise<void>;
}

export function AddServerModal({ folders, selectedFolderId, onClose, onSubmit }: AddServerModalProps) {
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(22);
  const [protocol, setProtocol] = useState<Protocol>("ssh");
  const [description, setDescription] = useState("");
  const [selectedIdentityId, setSelectedIdentityId] = useState<string>("");
  const [folderId, setFolderId] = useState<string>(selectedFolderId || "");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [jumpHostId, setJumpHostId] = useState<string>("");
  const [macAddress, setMacAddress] = useState<string>("");
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [sshEntries, setSshEntries] = useState<Entry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Load identities for the dropdown
    listIdentities()
      .then(setIdentities)
      .catch(console.error);
    
    // Load SSH entries for jump host selection
    listEntries()
      .then((entries) => {
        // Filter to only SSH-compatible entries (ssh protocol or no protocol)
        const sshOnly = entries.filter(
          (e) => !e.protocol || e.protocol === 'ssh'
        );
        setSshEntries(sshOnly);
      })
      .catch(console.error);
  }, []);

  // Update folder when selectedFolderId prop changes
  useEffect(() => {
    setFolderId(selectedFolderId || "");
  }, [selectedFolderId]);

  const handleProtocolChange = (newProtocol: Protocol) => {
    setProtocol(newProtocol);
    setPort(PROTOCOL_DEFAULTS[newProtocol]);
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
        entry_type: "server",
        identity_ids: selectedIdentityId ? [selectedIdentityId] : undefined,
        folder_id: folderId || undefined,
        tag_ids: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        jump_host_id: jumpHostId || undefined,
        mac_address: macAddress.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create server");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Server</h2>
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
            <label htmlFor="folder">Folder (optional)</label>
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
            <label htmlFor="identity">Credentials (optional)</label>
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
            {identities.length === 0 && (
              <span className="form-hint">No identities yet. Create one in the Identities panel.</span>
            )}
          </div>

          {(protocol === 'ssh' || protocol === 'sftp') && (
            <div className="form-group">
              <label htmlFor="jumpHost">Jump Host / Bastion (optional)</label>
              <select
                id="jumpHost"
                value={jumpHostId}
                onChange={(e) => setJumpHostId(e.target.value)}
              >
                <option value="">Direct connection</option>
                {sshEntries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} ({entry.host}:{entry.port || 22})
                  </option>
                ))}
              </select>
              {jumpHostId && (
                <span className="form-hint">
                  🔗 Connection will tunnel through the selected jump host.
                </span>
              )}
            </div>
          )}

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

          <div className="form-group">
            <label>Tags (optional)</label>
            <TagSelector
              selectedTagIds={selectedTagIds}
              onChange={setSelectedTagIds}
            />
          </div>

          <div className="form-group">
            <label htmlFor="macAddress">MAC Address (optional)</label>
            <input
              id="macAddress"
              type="text"
              value={macAddress}
              onChange={(e) => setMacAddress(e.target.value)}
              placeholder="AA:BB:CC:DD:EE:FF"
            />
            <span className="form-hint">For Wake-on-LAN to power on sleeping servers</span>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={isLoading}>
              {isLoading ? "Creating..." : "Add Server"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
