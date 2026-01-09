import { useState, useEffect, useCallback, useRef } from "react";
import {
  Cpu,
  Memory,
  HardDrive,
  ArrowsDownUp,
  X,
  ArrowClockwise,
  Timer,
  Desktop,
  Clock,
  Spinner,
  Warning,
  ChartLine,
} from "@phosphor-icons/react";
import type { ServerStats, StatsHistory } from "../types/monitoring";
import { formatBytes, formatUptime, formatPercent, formatRelativeTime } from "../types/monitoring";
import type { Entry } from "../types/entry";
import { collectServerStats, getLatestServerStats, getServerStatsHistory } from "../lib/api";
import "./ServerStatsPanel.css";

interface ServerStatsPanelProps {
  entry: Entry;
  isOpen: boolean;
  onClose: () => void;
}

type Timeframe = "1h" | "6h" | "24h";

export function ServerStatsPanel({ entry, isOpen, onClose }: ServerStatsPanelProps) {
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [history, setHistory] = useState<StatsHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCollecting, setIsCollecting] = useState(false);
  const [error, setError] = useState("");
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load latest stats and history
  const loadStats = useCallback(async () => {
    if (!entry.id) return;
    try {
      setError("");
      const [latestStats, historyData] = await Promise.all([
        getLatestServerStats(entry.id),
        getServerStatsHistory(entry.id, timeframe, 60),
      ]);
      setStats(latestStats);
      setHistory(historyData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setIsLoading(false);
    }
  }, [entry.id, timeframe]);

  // Collect fresh stats
  const handleCollect = async () => {
    if (!entry.id) return;
    try {
      setIsCollecting(true);
      setError("");
      const freshStats = await collectServerStats(entry.id);
      setStats(freshStats);
      // Refresh history too
      const historyData = await getServerStatsHistory(entry.id, timeframe, 60);
      setHistory(historyData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to collect stats");
    } finally {
      setIsCollecting(false);
    }
  };

  // Auto-refresh effect
  useEffect(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
    }

    if (autoRefresh && isOpen) {
      refreshTimerRef.current = setInterval(() => {
        handleCollect();
      }, 60000); // Every 60 seconds
    }

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [autoRefresh, isOpen, entry.id]);

  // Initial load
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      loadStats();
    }
  }, [isOpen, loadStats]);

  if (!isOpen) return null;

  return (
    <div className="stats-panel-overlay" onClick={onClose}>
      <div className="stats-panel" onClick={(e) => e.stopPropagation()}>
        <div className="stats-header">
          <div className="stats-title">
            <ChartLine size={22} weight="bold" />
            <div className="stats-title-info">
              <span className="stats-server-name">{entry.name}</span>
              <span className="stats-server-host">
                {entry.host}:{entry.port || 22}
              </span>
            </div>
          </div>
          <div className="stats-actions">
            <button
              className={`stats-btn ${autoRefresh ? "active" : ""}`}
              onClick={() => setAutoRefresh(!autoRefresh)}
              title={autoRefresh ? "Stop auto-refresh" : "Start auto-refresh (1m)"}
            >
              <Timer size={18} weight={autoRefresh ? "fill" : "regular"} />
            </button>
            <button
              className="stats-btn primary"
              onClick={handleCollect}
              disabled={isCollecting}
              title="Collect fresh stats"
            >
              <ArrowClockwise
                size={18}
                className={isCollecting ? "spinning" : ""}
              />
            </button>
            <button className="stats-btn" onClick={onClose} title="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Timeframe selector */}
        <div className="stats-timeframe-bar">
          <div className="timeframe-label">History</div>
          <div className="timeframe-buttons">
            {(["1h", "6h", "24h"] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                className={`timeframe-btn ${timeframe === tf ? "active" : ""}`}
                onClick={() => setTimeframe(tf)}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        <div className="stats-content">
          {isLoading ? (
            <div className="stats-loading">
              <Spinner size={32} className="spinning" />
              <span>Loading stats...</span>
            </div>
          ) : error ? (
            <div className="stats-error">
              <Warning size={48} />
              <p>{error}</p>
              <button className="stats-retry-btn" onClick={handleCollect}>
                Try Again
              </button>
            </div>
          ) : !stats ? (
            <div className="stats-empty">
              <ChartLine size={48} />
              <h3>No stats collected</h3>
              <p>Click refresh to collect server stats</p>
              <button className="stats-collect-btn" onClick={handleCollect}>
                <ArrowClockwise size={18} />
                Collect Stats
              </button>
            </div>
          ) : (
            <>
              {/* System Info Bar */}
              <div className="stats-system-bar">
                <div className="system-info-item">
                  <Desktop size={16} />
                  <span>{stats.hostname || "Unknown"}</span>
                </div>
                <div className="system-info-item">
                  <span>{stats.os_name || "Unknown OS"}</span>
                </div>
                <div className="system-info-item">
                  <Clock size={16} />
                  <span>
                    Up {stats.uptime_seconds ? formatUptime(stats.uptime_seconds) : "-"}
                  </span>
                </div>
                <div className="system-info-item timestamp">
                  Updated {formatRelativeTime(stats.collected_at)}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="stats-grid">
                {/* CPU Card */}
                <div className="stat-card cpu">
                  <div className="stat-card-header">
                    <Cpu size={20} weight="bold" />
                    <span>CPU</span>
                  </div>
                  <div className="stat-card-content">
                    <div className="stat-main-value">
                      {stats.cpu_usage_percent !== null
                        ? formatPercent(stats.cpu_usage_percent)
                        : "-"}
                    </div>
                    <div className="stat-progress-bar">
                      <div
                        className="stat-progress-fill cpu"
                        style={{
                          width: `${stats.cpu_usage_percent || 0}%`,
                        }}
                      />
                    </div>
                    <div className="stat-details">
                      <div className="stat-detail-row">
                        <span>Cores</span>
                        <span>{stats.cpu_cores || "-"}</span>
                      </div>
                      {stats.load_avg && (
                        <div className="stat-detail-row">
                          <span>Load</span>
                          <span>
                            {stats.load_avg[0].toFixed(2)}, {stats.load_avg[1].toFixed(2)},{" "}
                            {stats.load_avg[2].toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Memory Card */}
                <div className="stat-card memory">
                  <div className="stat-card-header">
                    <Memory size={20} weight="bold" />
                    <span>Memory</span>
                  </div>
                  <div className="stat-card-content">
                    <div className="stat-main-value">
                      {stats.memory
                        ? formatPercent(stats.memory.usage_percent)
                        : "-"}
                    </div>
                    <div className="stat-progress-bar">
                      <div
                        className="stat-progress-fill memory"
                        style={{
                          width: `${stats.memory?.usage_percent || 0}%`,
                        }}
                      />
                    </div>
                    {stats.memory && (
                      <div className="stat-details">
                        <div className="stat-detail-row">
                          <span>Used</span>
                          <span>
                            {formatBytes(stats.memory.used)} /{" "}
                            {formatBytes(stats.memory.total)}
                          </span>
                        </div>
                        <div className="stat-detail-row">
                          <span>Cached</span>
                          <span>{formatBytes(stats.memory.cached)}</span>
                        </div>
                      </div>
                    )}
                    {stats.swap && stats.swap.total > 0 && (
                      <div className="stat-swap">
                        <span className="swap-label">Swap</span>
                        <span className="swap-value">
                          {formatBytes(stats.swap.used)} /{" "}
                          {formatBytes(stats.swap.total)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Disk Card */}
                <div className="stat-card disk">
                  <div className="stat-card-header">
                    <HardDrive size={20} weight="bold" />
                    <span>Disk ({stats.disk?.path || "/"})</span>
                  </div>
                  <div className="stat-card-content">
                    <div className="stat-main-value">
                      {stats.disk
                        ? formatPercent(stats.disk.usage_percent)
                        : "-"}
                    </div>
                    <div className="stat-progress-bar">
                      <div
                        className="stat-progress-fill disk"
                        style={{
                          width: `${stats.disk?.usage_percent || 0}%`,
                        }}
                      />
                    </div>
                    {stats.disk && (
                      <div className="stat-details">
                        <div className="stat-detail-row">
                          <span>Used</span>
                          <span>
                            {formatBytes(stats.disk.used)} /{" "}
                            {formatBytes(stats.disk.total)}
                          </span>
                        </div>
                        <div className="stat-detail-row">
                          <span>Free</span>
                          <span>{formatBytes(stats.disk.free)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Network Card */}
                <div className="stat-card network">
                  <div className="stat-card-header">
                    <ArrowsDownUp size={20} weight="bold" />
                    <span>Network ({stats.network?.interface || "eth0"})</span>
                  </div>
                  <div className="stat-card-content">
                    {stats.network ? (
                      <div className="stat-network-values">
                        <div className="network-stat rx">
                          <span className="network-label">↓ RX</span>
                          <span className="network-value">
                            {formatBytes(stats.network.rx_bytes)}
                          </span>
                        </div>
                        <div className="network-stat tx">
                          <span className="network-label">↑ TX</span>
                          <span className="network-value">
                            {formatBytes(stats.network.tx_bytes)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="stat-main-value">-</div>
                    )}
                  </div>
                </div>
              </div>

              {/* History Chart placeholder - could add Chart.js or similar */}
              {history && history.data_points.length > 1 && (
                <div className="stats-history">
                  <div className="history-header">
                    <span>History ({history.timeframe})</span>
                    <span className="history-count">
                      {history.data_points.length} data points
                    </span>
                  </div>
                  <div className="history-mini-chart">
                    {history.data_points.slice(-30).map((point) => (
                      <div
                        key={point.id}
                        className="history-bar"
                        style={{
                          height: `${Math.min(point.cpu_usage_percent || 0, 100)}%`,
                        }}
                        title={`CPU: ${point.cpu_usage_percent?.toFixed(1)}% at ${formatRelativeTime(point.collected_at)}`}
                      />
                    ))}
                  </div>
                  <div className="history-legend">
                    <span>CPU Usage Over Time</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
