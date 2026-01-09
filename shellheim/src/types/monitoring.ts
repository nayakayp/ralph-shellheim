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
