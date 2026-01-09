import { useState, useEffect, useCallback } from "react";
import { X, Play, Stop, ArrowClockwise, Package, Cube, Note, ArrowsClockwise, Trash, ChartLine } from "@phosphor-icons/react";
import type { Container, ContainerStats, DockerImage } from "../types/docker";
import type { Entry } from "../types/entry";
import {
  listDockerContainers,
  getContainerStats,
  startDockerContainer,
  stopDockerContainer,
  restartDockerContainer,
  getDockerLogs,
  listDockerImages,
  removeDockerContainer,
  checkDockerAvailable,
} from "../lib/api";
import "./DockerPanel.css";

interface DockerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  entry: Entry;
}

type TabType = "containers" | "images";

export function DockerPanel({ isOpen, onClose, entry }: DockerPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>("containers");
  const [containers, setContainers] = useState<Container[]>([]);
  const [images, setImages] = useState<DockerImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null);
  const [containerStats, setContainerStats] = useState<ContainerStats | null>(null);
  const [containerLogs, setContainerLogs] = useState<string>("");
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [dockerAvailable, setDockerAvailable] = useState(true);

  const loadContainers = useCallback(async () => {
    if (!entry?.id) return;
    try {
      setError("");
      setIsLoading(true);
      const data = await listDockerContainers(entry.id, showAll);
      setContainers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load containers");
    } finally {
      setIsLoading(false);
    }
  }, [entry?.id, showAll]);

  const loadImages = useCallback(async () => {
    if (!entry?.id) return;
    try {
      setError("");
      setIsLoading(true);
      const data = await listDockerImages(entry.id);
      setImages(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load images");
    } finally {
      setIsLoading(false);
    }
  }, [entry?.id]);

  const checkDocker = useCallback(async () => {
    if (!entry?.id) return;
    try {
      const available = await checkDockerAvailable(entry.id);
      setDockerAvailable(available);
    } catch {
      setDockerAvailable(false);
    }
  }, [entry?.id]);

  useEffect(() => {
    if (isOpen && entry?.id) {
      checkDocker();
      if (activeTab === "containers") {
        loadContainers();
      } else {
        loadImages();
      }
    }
  }, [isOpen, entry?.id, activeTab, loadContainers, loadImages, checkDocker]);

  const handleStart = async (container: Container) => {
    setActionLoading(container.id);
    try {
      await startDockerContainer(entry.id, container.id);
      await loadContainers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to start container");
    } finally {
      setActionLoading(null);
    }
  };

  const handleStop = async (container: Container) => {
    setActionLoading(container.id);
    try {
      await stopDockerContainer(entry.id, container.id);
      await loadContainers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to stop container");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestart = async (container: Container) => {
    setActionLoading(container.id);
    try {
      await restartDockerContainer(entry.id, container.id);
      await loadContainers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to restart container");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async (container: Container) => {
    if (!confirm(`Remove container "${container.name}"? This cannot be undone.`)) return;
    setActionLoading(container.id);
    try {
      await removeDockerContainer(entry.id, container.id, true);
      await loadContainers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove container");
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewLogs = async (container: Container) => {
    try {
      const logs = await getDockerLogs(entry.id, container.id, 200);
      setContainerLogs(logs);
      setSelectedContainer(container);
      setShowLogsModal(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to get logs");
    }
  };

  const handleViewStats = async (container: Container) => {
    try {
      const stats = await getContainerStats(entry.id, container.id);
      setContainerStats(stats);
      setSelectedContainer(container);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to get stats");
    }
  };

  const getStateColor = (state: string): string => {
    switch (state.toLowerCase()) {
      case "running":
        return "#73daca";
      case "exited":
        return "#f7768e";
      case "paused":
        return "#ff9e64";
      case "created":
        return "#7aa2f7";
      default:
        return "#a9b1d6";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="docker-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <div className="panel-title">
            <Package size={22} />
            <h2>Docker</h2>
            <span className="host-badge">{entry?.name}</span>
          </div>
          <button className="panel-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {!dockerAvailable ? (
          <div className="panel-content">
            <div className="panel-empty">
              <Package size={48} weight="light" />
              <h3>Docker Not Available</h3>
              <p>Docker is not installed or not accessible on this server.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="panel-tabs">
              <button
                className={`tab-btn ${activeTab === "containers" ? "active" : ""}`}
                onClick={() => setActiveTab("containers")}
              >
                <Cube size={16} />
                Containers
                <span className="tab-count">{containers.length}</span>
              </button>
              <button
                className={`tab-btn ${activeTab === "images" ? "active" : ""}`}
                onClick={() => setActiveTab("images")}
              >
                <Package size={16} />
                Images
                <span className="tab-count">{images.length}</span>
              </button>
              <div className="tab-actions">
                {activeTab === "containers" && (
                  <label className="show-all-toggle">
                    <input
                      type="checkbox"
                      checked={showAll}
                      onChange={(e) => setShowAll(e.target.checked)}
                    />
                    Show all
                  </label>
                )}
                <button className="refresh-btn" onClick={activeTab === "containers" ? loadContainers : loadImages}>
                  <ArrowsClockwise size={16} />
                </button>
              </div>
            </div>

            <div className="panel-content">
              {error && <div className="panel-error">{error}</div>}

              {isLoading ? (
                <div className="panel-loading">
                  <div className="spinner" />
                  <p>Loading...</p>
                </div>
              ) : activeTab === "containers" ? (
                containers.length === 0 ? (
                  <div className="panel-empty">
                    <Cube size={48} weight="light" />
                    <h3>No containers</h3>
                    <p>{showAll ? "No containers found on this server" : "No running containers. Toggle 'Show all' to see stopped containers."}</p>
                  </div>
                ) : (
                  <div className="containers-list">
                    {containers.map((container) => (
                      <div key={container.id} className="container-card">
                        <div className="container-header">
                          <div className="container-info">
                            <span
                              className="container-state"
                              style={{ backgroundColor: getStateColor(container.state) }}
                            />
                            <h4 className="container-name">{container.name}</h4>
                            <span className="container-id">{container.id.slice(0, 12)}</span>
                          </div>
                          <div className="container-actions">
                            {container.state.toLowerCase() === "running" ? (
                              <>
                                <button
                                  className="action-btn stop"
                                  onClick={() => handleStop(container)}
                                  disabled={actionLoading === container.id}
                                  title="Stop"
                                >
                                  <Stop size={14} weight="fill" />
                                </button>
                                <button
                                  className="action-btn restart"
                                  onClick={() => handleRestart(container)}
                                  disabled={actionLoading === container.id}
                                  title="Restart"
                                >
                                  <ArrowClockwise size={14} />
                                </button>
                              </>
                            ) : (
                              <button
                                className="action-btn start"
                                onClick={() => handleStart(container)}
                                disabled={actionLoading === container.id}
                                title="Start"
                              >
                                <Play size={14} weight="fill" />
                              </button>
                            )}
                            <button
                              className="action-btn logs"
                              onClick={() => handleViewLogs(container)}
                              title="View Logs"
                            >
                              <Note size={14} />
                            </button>
                            {container.state.toLowerCase() === "running" && (
                              <button
                                className="action-btn stats"
                                onClick={() => handleViewStats(container)}
                                title="View Stats"
                              >
                                <ChartLine size={14} />
                              </button>
                            )}
                            <button
                              className="action-btn remove"
                              onClick={() => handleRemove(container)}
                              disabled={actionLoading === container.id}
                              title="Remove"
                            >
                              <Trash size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="container-details">
                          <div className="detail-row">
                            <span className="detail-label">Image:</span>
                            <span className="detail-value">{container.image}</span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">Status:</span>
                            <span className="detail-value">{container.status}</span>
                          </div>
                          {container.ports && (
                            <div className="detail-row">
                              <span className="detail-label">Ports:</span>
                              <span className="detail-value ports">{container.ports}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                images.length === 0 ? (
                  <div className="panel-empty">
                    <Package size={48} weight="light" />
                    <h3>No images</h3>
                    <p>No Docker images found on this server</p>
                  </div>
                ) : (
                  <div className="images-list">
                    {images.map((image) => (
                      <div key={image.id} className="image-card">
                        <div className="image-info">
                          <h4 className="image-repo">{image.repository}</h4>
                          <span className="image-tag">{image.tag}</span>
                        </div>
                        <div className="image-meta">
                          <span className="image-size">{image.size}</span>
                          <span className="image-id">{image.id.slice(0, 12)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </>
        )}

        {/* Logs Modal */}
        {showLogsModal && selectedContainer && (
          <div className="logs-modal-overlay" onClick={() => setShowLogsModal(false)}>
            <div className="logs-modal" onClick={(e) => e.stopPropagation()}>
              <div className="logs-header">
                <h3>Logs: {selectedContainer.name}</h3>
                <button className="modal-close" onClick={() => setShowLogsModal(false)}>
                  <X size={18} />
                </button>
              </div>
              <pre className="logs-content">{containerLogs || "No logs available"}</pre>
            </div>
          </div>
        )}

        {/* Stats Display */}
        {containerStats && selectedContainer && !showLogsModal && (
          <div className="stats-overlay" onClick={() => setContainerStats(null)}>
            <div className="stats-popup" onClick={(e) => e.stopPropagation()}>
              <h4>{selectedContainer.name} Stats</h4>
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-label">CPU</span>
                  <span className="stat-value">{containerStats.cpu_percent.toFixed(1)}%</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Memory</span>
                  <span className="stat-value">{containerStats.memory_usage} / {containerStats.memory_limit}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Net I/O</span>
                  <span className="stat-value">{containerStats.net_io}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Block I/O</span>
                  <span className="stat-value">{containerStats.block_io}</span>
                </div>
              </div>
              <button className="close-stats" onClick={() => setContainerStats(null)}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
