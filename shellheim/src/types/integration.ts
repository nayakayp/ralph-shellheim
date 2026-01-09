// Integration types for Proxmox VE and other external systems

export interface Integration {
  id: string;
  account_id: string;
  integration_type: string;
  name: string;
  host: string;
  port: number;
  username: string;
  verify_ssl: boolean;
  status: string;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateIntegrationRequest {
  integration_type: string;
  name: string;
  host: string;
  port?: number;
  username: string;
  password: string;
  verify_ssl?: boolean;
}

export interface UpdateIntegrationRequest {
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  verify_ssl?: boolean;
}

export interface SyncResult {
  folders_created: number;
  entries_created: number;
  nodes_found: number;
}

// Proxmox-specific types

export interface ProxmoxNode {
  node: string;
  status: string;
  cpu: number | null;
  maxcpu: number | null;
  mem: number | null;
  maxmem: number | null;
  disk: number | null;
  maxdisk: number | null;
  uptime: number | null;
}

export interface ProxmoxResource {
  id: string;
  node: string;
  name: string;
  vmid: number | null;
  resource_type: string; // "qemu", "lxc", "shell"
  status: string;
  cpu: number | null;
  mem: number | null;
  maxmem: number | null;
}

export interface ProxmoxClusterInfo {
  nodes: ProxmoxNode[];
  resources: ProxmoxResource[];
  total_vms: number;
  total_containers: number;
  running_vms: number;
  running_containers: number;
}

// Entry types for PVE resources
export type PveEntryType = 'pve-qemu' | 'pve-lxc' | 'pve-shell';

export function isPveEntry(entryType: string): entryType is PveEntryType {
  return ['pve-qemu', 'pve-lxc', 'pve-shell'].includes(entryType);
}

export function getPveIcon(entryType: string): string {
  switch (entryType) {
    case 'pve-qemu':
      return '🖥️';
    case 'pve-lxc':
      return '📦';
    case 'pve-shell':
      return '⌨️';
    default:
      return '🖥️';
  }
}

export function getPveTypeName(entryType: string): string {
  switch (entryType) {
    case 'pve-qemu':
      return 'VM';
    case 'pve-lxc':
      return 'Container';
    case 'pve-shell':
      return 'Shell';
    default:
      return 'Unknown';
  }
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '-';
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatUptime(seconds: number | null): string {
  if (seconds === null) return '-';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}
