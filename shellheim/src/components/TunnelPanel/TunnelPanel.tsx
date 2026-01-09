import { useState, useCallback } from "react";
import { Stack, X, Plus, CaretDown, Info, Stop } from "@phosphor-icons/react";
import type { Tunnel, TunnelType, CreateTunnelRequest } from "../../types/tunnel";
import type { SshSessionInfo } from "../../types/ssh";
import { useTunnels } from "../../hooks/useTunnels";
import "./TunnelPanel.css";

interface TunnelPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: SshSessionInfo[];
}

export function TunnelPanel({ isOpen, onClose, sessions }: TunnelPanelProps) {
  const { tunnels, isLoading, createTunnel, stopTunnel } = useTunnels();
  
  // Form state
  const [showForm, setShowForm] = useState(false);
  const [tunnelType, setTunnelType] = useState<TunnelType>("local");
  const [localPort, setLocalPort] = useState("");
  const [remoteHost, setRemoteHost] = useState("");
  const [remotePort, setRemotePort] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [stoppingTunnelId, setStoppingTunnelId] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setTunnelType("local");
    setLocalPort("");
    setRemoteHost("");
    setRemotePort("");
    setSelectedSessionId("");
    setFormError("");
  }, []);

  const handleCreateTunnel = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedSessionId) {
      setFormError("Please select a session");
      return;
    }
    
    if (!localPort || !remotePort) {
      setFormError("Please fill in all port fields");
      return;
    }

    const localPortNum = parseInt(localPort, 10);
    const remotePortNum = parseInt(remotePort, 10);

    if (isNaN(localPortNum) || localPortNum < 1 || localPortNum > 65535) {
      setFormError("Local port must be between 1 and 65535");
      return;
    }

    if (isNaN(remotePortNum) || remotePortNum < 1 || remotePortNum > 65535) {
      setFormError("Remote port must be between 1 and 65535");
      return;
    }

    setIsCreating(true);
    setFormError("");

    try {
      const request: CreateTunnelRequest = {
        sessionId: selectedSessionId,
        tunnelType,
        localPort: localPortNum,
        remoteHost: remoteHost || "localhost",
        remotePort: remotePortNum,
      };

      await createTunnel(request);
      resetForm();
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create tunnel");
    } finally {
      setIsCreating(false);
    }
  };

  const handleStopTunnel = async (tunnelId: string) => {
    setStoppingTunnelId(tunnelId);
    try {
      await stopTunnel(tunnelId);
    } catch (err) {
      console.error("Failed to stop tunnel:", err);
    } finally {
      setStoppingTunnelId(null);
    }
  };

  const getSessionLabel = (sessionId: string): string => {
    const session = sessions.find((s) => s.session_id === sessionId);
    if (!session) return sessionId.slice(0, 8);
    return `${session.host}:${session.port}`;
  };

  const formatTunnelMapping = (tunnel: Tunnel) => {
    if (tunnel.tunnelType === "local") {
      return (
        <>
          <span className="port">localhost:{tunnel.localPort}</span>
          <span className="arrow">→</span>
          <span className="host">{tunnel.remoteHost}:{tunnel.remotePort}</span>
        </>
      );
    } else {
      return (
        <>
          <span className="host">localhost:{tunnel.remotePort}</span>
          <span className="arrow">←</span>
          <span className="port">:{tunnel.localPort}</span>
        </>
      );
    }
  };

  if (!isOpen) return null;

  const activeTunnels = tunnels.filter((t) => t.status === "active" || t.status === "error");

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="tunnel-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="panel-header">
          <div className="panel-title">
            <Stack size={22} />
            <h2>SSH Tunnels</h2>
            <span className="count-badge">{activeTunnels.length}</span>
          </div>
          <button className="panel-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Create Tunnel Form Section */}
        <div className="tunnel-form-section">
          <button
            className={`tunnel-form-toggle ${showForm ? "expanded" : ""}`}
            onClick={() => setShowForm(!showForm)}
          >
            <span>
              <Plus size={16} style={{ marginRight: 8, verticalAlign: "middle" }} />
              Create New Tunnel
            </span>
            <CaretDown size={16} />
          </button>

          {showForm && (
            <form className="tunnel-form" onSubmit={handleCreateTunnel}>
              {formError && <div className="tunnel-form-error">{formError}</div>}

              {sessions.length === 0 && (
                <div className="no-sessions-warning">
                  <Info size={16} />
                  No active SSH sessions. Connect to a server first.
                </div>
              )}

              <div className="form-group">
                <label>Tunnel Type</label>
                <div className="type-selector">
                  <button
                    type="button"
                    className={`type-btn ${tunnelType === "local" ? "active local" : ""}`}
                    onClick={() => setTunnelType("local")}
                  >
                    Local Forward
                  </button>
                  <button
                    type="button"
                    className={`type-btn ${tunnelType === "remote" ? "active remote" : ""}`}
                    onClick={() => setTunnelType("remote")}
                  >
                    Remote Forward
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>Session</label>
                <select
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  disabled={sessions.length === 0}
                >
                  <option value="">Select a session...</option>
                  {sessions.map((session) => (
                    <option key={session.session_id} value={session.session_id}>
                      {session.host}:{session.port}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Local Port</label>
                  <input
                    type="number"
                    placeholder="8080"
                    value={localPort}
                    onChange={(e) => setLocalPort(e.target.value)}
                    min="1"
                    max="65535"
                  />
                </div>
                <div className="form-group">
                  <label>Remote Port</label>
                  <input
                    type="number"
                    placeholder="80"
                    value={remotePort}
                    onChange={(e) => setRemotePort(e.target.value)}
                    min="1"
                    max="65535"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Remote Host</label>
                <input
                  type="text"
                  placeholder="localhost"
                  value={remoteHost}
                  onChange={(e) => setRemoteHost(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="create-tunnel-btn"
                disabled={isCreating || sessions.length === 0}
              >
                {isCreating ? (
                  <>
                    <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2, marginRight: 0 }} />
                    Creating...
                  </>
                ) : (
                  <>
                    <Stack size={16} />
                    Create Tunnel
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Active Tunnels List */}
        <div className="tunnels-section">
          <div className="tunnels-section-header">
            <h3>Active Tunnels</h3>
            <span className="count">({activeTunnels.length})</span>
          </div>

          {isLoading ? (
            <div className="tunnels-loading">
              <div className="spinner" />
              <p>Loading tunnels...</p>
            </div>
          ) : activeTunnels.length === 0 ? (
            <div className="tunnels-empty">
              <Stack size={48} weight="light" />
              <h3>No active tunnels</h3>
              <p>Create a tunnel to forward ports through your SSH connections</p>
            </div>
          ) : (
            activeTunnels.map((tunnel) => (
              <div key={tunnel.id} className="tunnel-card">
                <div className="tunnel-card-header">
                  <span className={`tunnel-type-badge ${tunnel.tunnelType}`}>
                    {tunnel.tunnelType === "local" ? "LOCAL" : "REMOTE"}
                  </span>
                  <div className="tunnel-status">
                    <span className={`status-dot ${tunnel.status}`} />
                    <span>{tunnel.status}</span>
                  </div>
                </div>

                <div className="tunnel-mapping">
                  {formatTunnelMapping(tunnel)}
                </div>

                {tunnel.errorMessage && (
                  <div className="tunnel-error">{tunnel.errorMessage}</div>
                )}

                <div className="tunnel-card-footer">
                  <div className="tunnel-session">
                    Session: <strong>{getSessionLabel(tunnel.sessionId)}</strong>
                  </div>
                  <button
                    className="stop-tunnel-btn"
                    onClick={() => handleStopTunnel(tunnel.id)}
                    disabled={stoppingTunnelId === tunnel.id}
                  >
                    {stoppingTunnelId === tunnel.id ? (
                      <>Stopping...</>
                    ) : (
                      <>
                        <Stop size={12} weight="fill" />
                        Stop
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
