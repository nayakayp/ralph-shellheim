// Monitoring types for server health checks

export type HealthStatus = 'online' | 'offline' | 'checking' | 'error' | 'unknown';

export interface HealthCheckResult {
  entry_id: string;
  status: HealthStatus;
  response_time_ms: number | null;
  error: string | null;
  checked_at: string;
  port: number | null;
  host: string | null;
}

export interface MonitoringStats {
  total: number;
  online: number;
  offline: number;
  errors: number;
  unknown: number;
  generated_at: string;
}

// Status colors for UI display
export const STATUS_COLORS: Record<HealthStatus, string> = {
  online: '#9ece6a',   // Green
  offline: '#f7768e',  // Red
  checking: '#7aa2f7', // Blue
  error: '#ff9e64',    // Orange
  unknown: '#565f89',  // Gray
};

// Status labels for display
export const STATUS_LABELS: Record<HealthStatus, string> = {
  online: 'Online',
  offline: 'Offline',
  checking: 'Checking...',
  error: 'Error',
  unknown: 'Not Checked',
};

// Get status icon character
export function getStatusIcon(status: HealthStatus): string {
  switch (status) {
    case 'online':
      return '●';
    case 'offline':
      return '○';
    case 'checking':
      return '◎';
    case 'error':
      return '⚠';
    case 'unknown':
      return '◌';
  }
}

// Format response time for display
export function formatResponseTime(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// Format relative time from ISO string
export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  
  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString();
}

// ============================================================
// Server Resource Statistics Types
// ============================================================

export interface MemoryStats {
  total: number;
  used: number;
  free: number;
  cached: number;
  usage_percent: number;
}

export interface SwapStats {
  total: number;
  used: number;
  usage_percent: number;
}

export interface DiskStats {
  path: string;
  total: number;
  used: number;
  free: number;
  usage_percent: number;
}

export interface NetworkStats {
  interface: string;
  rx_bytes: number;
  tx_bytes: number;
}

export interface ServerStats {
  id: string;
  entry_id: string;
  // CPU
  cpu_usage_percent: number | null;
  cpu_cores: number | null;
  load_avg: [number, number, number] | null;
  // Memory
  memory: MemoryStats | null;
  swap: SwapStats | null;
  // Disk
  disk: DiskStats | null;
  // Network
  network: NetworkStats | null;
  // System
  uptime_seconds: number | null;
  os_name: string | null;
  kernel_version: string | null;
  hostname: string | null;
  collected_at: string;
}

export interface StatsHistory {
  entry_id: string;
  timeframe: string;
  data_points: ServerStats[];
}

// Format bytes to human-readable string
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// Format uptime seconds to readable string
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// Format percentage for display
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
