import { useState, useEffect, useCallback } from "react";
import { VideoCamera, X, Play, Trash, Clock, HardDrive, PencilSimple } from "@phosphor-icons/react";
import type { Recording, UpdateRecordingRequest } from "../types/recording";
import { formatDuration, formatFileSize } from "../types/recording";
import { listRecordings, deleteRecording, updateRecording } from "../lib/api";
import { RecordingPlayer } from "./RecordingPlayer";
import "./RecordingsPanel.css";

interface RecordingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RecordingsPanel({ isOpen, onClose }: RecordingsPanelProps) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [playingRecording, setPlayingRecording] = useState<Recording | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const loadRecordings = useCallback(async () => {
    try {
      setError("");
      setIsLoading(true);
      const data = await listRecordings();
      setRecordings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recordings");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadRecordings();
    }
  }, [isOpen, loadRecordings]);

  const handleDelete = async (recording: Recording) => {
    if (!confirm(`Delete "${recording.name}"? This cannot be undone.`)) return;

    try {
      await deleteRecording(recording.id);
      setRecordings((prev) => prev.filter((r) => r.id !== recording.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete recording");
    }
  };

  const handlePlay = (recording: Recording) => {
    if (recording.ended_at) {
      setPlayingRecording(recording);
    } else {
      alert("Recording is still in progress");
    }
  };

  const handleStartEdit = (recording: Recording) => {
    setEditingId(recording.id);
    setEditName(recording.name);
  };

  const handleSaveEdit = async (recording: Recording) => {
    if (!editName.trim()) return;
    
    try {
      const request: UpdateRecordingRequest = { name: editName.trim() };
      const updated = await updateRecording(recording.id, request);
      setRecordings((prev) => prev.map((r) => r.id === updated.id ? updated : r));
      setEditingId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update recording");
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  if (!isOpen) return null;

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="recordings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <div className="panel-title">
            <VideoCamera size={22} />
            <h2>Recordings</h2>
            <span className="count-badge">{recordings.length}</span>
          </div>
          <button className="panel-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="panel-toolbar">
          <p className="panel-description">
            Terminal session recordings in asciinema format
          </p>
        </div>

        <div className="panel-content">
          {error && <div className="panel-error">{error}</div>}

          {isLoading ? (
            <div className="panel-loading">
              <div className="spinner" />
              <p>Loading recordings...</p>
            </div>
          ) : recordings.length === 0 ? (
            <div className="panel-empty">
              <VideoCamera size={48} weight="light" />
              <h3>No recordings yet</h3>
              <p>
                Start recording a session using the record button in the terminal toolbar
              </p>
            </div>
          ) : (
            <div className="recordings-list">
              {recordings.map((recording) => (
                <div key={recording.id} className="recording-card">
                  <div className="recording-header">
                    <div className="recording-info">
                      {editingId === recording.id ? (
                        <div className="recording-edit-name">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveEdit(recording);
                              if (e.key === "Escape") handleCancelEdit();
                            }}
                            autoFocus
                          />
                          <button onClick={() => handleSaveEdit(recording)}>Save</button>
                          <button onClick={handleCancelEdit}>Cancel</button>
                        </div>
                      ) : (
                        <h4 className="recording-name">
                          {recording.name}
                          <button 
                            className="edit-name-btn"
                            onClick={() => handleStartEdit(recording)}
                            title="Edit name"
                          >
                            <PencilSimple size={12} />
                          </button>
                        </h4>
                      )}
                      <div className="recording-meta">
                        <span className="recording-date">
                          {new Date(recording.started_at).toLocaleDateString()} {new Date(recording.started_at).toLocaleTimeString()}
                        </span>
                        {!recording.ended_at && (
                          <span className="recording-status recording">● Recording</span>
                        )}
                      </div>
                    </div>
                    <div className="recording-actions">
                      <button
                        className="recording-action-btn play"
                        onClick={() => handlePlay(recording)}
                        disabled={!recording.ended_at}
                        title={recording.ended_at ? "Play recording" : "Recording in progress"}
                      >
                        <Play size={14} />
                      </button>
                      <button
                        className="recording-action-btn delete"
                        onClick={() => handleDelete(recording)}
                        title="Delete recording"
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="recording-stats">
                    <span className="stat">
                      <Clock size={14} />
                      {formatDuration(recording.duration_secs)}
                    </span>
                    <span className="stat">
                      <HardDrive size={14} />
                      {formatFileSize(recording.file_size)}
                    </span>
                    {recording.terminal_cols && recording.terminal_rows && (
                      <span className="stat">
                        {recording.terminal_cols}×{recording.terminal_rows}
                      </span>
                    )}
                  </div>
                  {recording.description && (
                    <p className="recording-description">{recording.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {playingRecording && (
          <RecordingPlayer
            recording={playingRecording}
            onClose={() => setPlayingRecording(null)}
          />
        )}
      </div>
    </div>
  );
}
