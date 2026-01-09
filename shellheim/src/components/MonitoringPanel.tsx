import { useState, useEffect, useCallback, useRef } from "react";
import {
  Heartbeat,
  X,
  ArrowClockwise,
  CheckCircle,
  XCircle,
  Warning,
  Question,
  Spinner,
  Timer,
  Pause,
  Play,
} from "@phosphor-icons/react";
import type { HealthCheckResult, MonitoringStats, HealthStatus } from "../types/monitoring";
import { STATUS_COLORS, STATUS_LABELS, formatResponseTime, formatRelativeTime } from "../types/monitoring";
import type { Entry } from "../types/entry";
import { listEntries, checkEntriesHealth, getCachedHealth, getMonitoringStats } from "../lib/api";
import "./MonitoringPanel.css";

// Refresh interval options in seconds
const REFRESH_INTERVALS = [
  { label: "Off", value: 0 },
  { label: "30s", value: 30 },
  { label: "1m", value: 60 },
  { label: "2m", value: 120 },
  { label: "5m", value: 300 },
] as const;

const STORAGE_KEY = "shellheim_monitoring_interval";

interface MonitoringPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MonitoringPanel({ isOpen, onClose }: MonitoringPanelProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [healthResults, setHealthResults] = useState<Map<string, HealthCheckResult>>(new Map());
  const [stats, setStats] = useState<MonitoringStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState("");
  
  // Auto-refresh state
  const [refreshInterval, setRefreshInterval] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseInt(saved, 10) : 60; // Default 1 minute
  });
  const [countdown, setCountdown] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load entries and cached health data
  const loadData = useCallback(async () => {
    try {
      setError("");
      setIsLoading(true);
      
      const [entriesData, cachedHealth, statsData] = await Promise.all([
        listEntries(),
        getCachedHealth(),
        getMonitoringStats(),
      ]);
      
      setEntries(entriesData.filter(e => e.host)); // Only entries with hosts
      setStats(statsData);
      
      // Build health results map
      const healthMap = new Map<string, HealthCheckResult>();
      for (const result of cachedHealth) {
        healthMap.set(result.entry_id, result);
      }
      setHealthResults(healthMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check health of all entries
  const checkAllHealth = async () => {
    try {
      setIsChecking(true);
      setError("");
      
      const results = await checkEntriesHealth(undefined, 5000);
      
      // Update health results map
      const healthMap = new Map<string, HealthCheckResult>(healthResults);
      for (const result of results) {
        healthMap.set(result.entry_id, result);
      }
      setHealthResults(healthMap);
      
      // Refresh stats
      const statsData = await getMonitoringStats();
      setStats(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Health check failed");
    } finally {
      setIsChecking(false);
    }
  };

  // Handle interval change
  const handleIntervalChange = (newInterval: number) => {
    setRefreshInterval(newInterval);
    localStorage.setItem(STORAGE_KEY, String(newInterval));
    setCountdown(newInterval);
    setIsPaused(false);
  };

  // Toggle pause/resume
  const togglePause = () => {
    setIsPaused(!isPaused);
  };

  // Auto-refresh timer effect
  useEffect(() => {
    // Clear existing timers
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    // Don't run if panel closed, no interval, or paused
    if (!isOpen || refreshInterval === 0 || isPaused) {
      return;
    }

    // Reset countdown
    setCountdown(refreshInterval);

    // Countdown timer (updates every second)
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          return refreshInterval; // Reset after reaching 0
        }
        return prev - 1;
      });
    }, 1000);

    // Health check timer
    intervalRef.current = setInterval(() => {
      if (!isChecking) {
        checkAllHealth();
      }
    }, refreshInterval * 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [isOpen, refreshInterval, isPaused, isChecking]);

  // Initial data load
  useEffect(() => {
    if (isOpen) {
      loadData();
      // Reset countdown when opening
      if (refreshInterval > 0) {
        setCountdown(refreshInterval);
      }
    }
  }, [isOpen, loadData, refreshInterval]);

  // Get status icon component
  const getStatusIcon = (status: HealthStatus) => {
    switch (status) {
      case 'online':
        return <CheckCircle weight="fill" />;
      case 'offline':
        return <XCircle weight="fill" />;
      case 'checking':
        return <Spinner className="checking-animation" />;
      case 'error':
        return <Warning weight="fill" />;
      default:
        return <Question />;
    }
  };

  if (!isOpen) return null;

  // Format countdown display
  const formatCountdown = (secs: number) => {
    if (secs >= 60) {
      const mins = Math.floor(secs / 60);
      const remainSecs = secs % 60;
      return remainSecs > 0 ? `${mins}m ${remainSecs}s` : `${mins}m`;
    }
    return `${secs}s`;
  };

  return (
    <div className="monitoring-panel">
      <div className="monitoring-header">
        <div className="monitoring-title">
          <Heartbeat size={22} weight="bold" />
          <span>Server Monitoring</span>
        </div>
        <div className="monitoring-actions">
          <button 
            className="monitoring-btn primary"
            onClick={checkAllHealth}
            disabled={isChecking}
            title="Check all servers"
          >
            <ArrowClockwise 
              size={18} 
              className={isChecking ? "checking-animation" : ""}
            />
          </button>
          <button 
            className="monitoring-btn"
            onClick={onClose}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Auto-refresh controls */}
      <div className="monitoring-refresh-bar">
        <div className="refresh-label">
          <Timer size={16} />
          <span>Auto-refresh</span>
        </div>
        <div className="refresh-controls">
          <div className="refresh-intervals">
            {REFRESH_INTERVALS.map(({ label, value }) => (
              <button
                key={value}
                className={`interval-btn ${refreshInterval === value ? "active" : ""}`}
                onClick={() => handleIntervalChange(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {refreshInterval > 0 && (
            <>
              <button
                className={`pause-btn ${isPaused ? "paused" : ""}`}
                onClick={togglePause}
                title={isPaused ? "Resume" : "Pause"}
              >
                {isPaused ? <Play size={14} weight="fill" /> : <Pause size={14} weight="fill" />}
              </button>
              <div className={`countdown-display ${isPaused ? "paused" : ""}`}>
                {isPaused ? "Paused" : formatCountdown(countdown)}
              </div>
            </>
          )}
        </div>
      </div>

      {stats && (
        <div className="monitoring-stats">
          <div className="stat-card">
            <span className="stat-value online">{stats.online}</span>
            <span className="stat-label">Online</span>
          </div>
          <div className="stat-card">
            <span className="stat-value offline">{stats.offline}</span>
            <span className="stat-label">Offline</span>
          </div>
          <div className="stat-card">
            <span className="stat-value error">{stats.errors}</span>
            <span className="stat-label">Errors</span>
          </div>
          <div className="stat-card">
            <span className="stat-value unknown">{stats.unknown}</span>
            <span className="stat-label">Unknown</span>
          </div>
        </div>
      )}

      <div className="monitoring-list">
        {isLoading ? (
          <div className="monitoring-loading">
            <div className="spinner" />
            <span>Loading servers...</span>
          </div>
        ) : error ? (
          <div className="monitoring-error">
            <Warning size={48} />
            <p>{error}</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="monitoring-empty">
            <Heartbeat size={48} />
            <h3>No servers to monitor</h3>
            <p>Add servers with host addresses to enable monitoring.</p>
          </div>
        ) : (
          entries.map((entry) => {
            const health = healthResults.get(entry.id);
            const status: HealthStatus = health?.status ?? 'unknown';
            
            return (
              <div key={entry.id} className="monitoring-item">
                <div className="monitoring-item-info">
                  <div className="monitoring-item-name">{entry.name}</div>
                  <div className="monitoring-item-host">
                    {entry.host}:{entry.port || 22}
                  </div>
                </div>
                <div className="monitoring-item-status">
                  <span 
                    className={`status-badge ${status}`}
                    style={{ borderColor: STATUS_COLORS[status] }}
                  >
                    {getStatusIcon(status)}
                    {STATUS_LABELS[status]}
                  </span>
                  {health?.response_time_ms !== null && health?.response_time_ms !== undefined && (
                    <span className="response-time">
                      {formatResponseTime(health.response_time_ms)}
                    </span>
                  )}
                  {health?.checked_at && (
                    <span className="check-time">
                      {formatRelativeTime(health.checked_at)}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
