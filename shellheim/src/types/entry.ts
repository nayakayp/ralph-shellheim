// Entry (server/connection) types

export interface Entry {
  id: string;
  account_id: string;
  folder_id?: string;
  integration_id?: string;
  entry_type: string;
  name: string;
  host?: string;
  port?: number;
  protocol?: string;
  description?: string;
  icon?: string;
  color?: string;
  sort_order: number;
  last_connected_at?: string;
  pve_node?: string;
  pve_vmid?: number;
  jump_host_id?: string;
  mac_address?: string;
  created_at: string;
  updated_at: string;
  identity_ids: string[];
}

export interface CreateEntryRequest {
  folder_id?: string;
  entry_type?: string;
  name: string;
  host?: string;
  port?: number;
  protocol?: string;
  description?: string;
  icon?: string;
  color?: string;
  identity_ids?: string[];
  tag_ids?: string[];
  jump_host_id?: string;
  mac_address?: string;
}

export interface UpdateEntryRequest {
  folder_id?: string;
  name?: string;
  host?: string;
  port?: number;
  protocol?: string;
  description?: string;
  icon?: string;
  color?: string;
  sort_order?: number;
  identity_ids?: string[];
  tag_ids?: string[];
  jump_host_id?: string;
  mac_address?: string;
}

export type Protocol = 'ssh' | 'sftp' | 'rdp' | 'vnc' | 'telnet';

export const PROTOCOL_DEFAULTS: Record<Protocol, number> = {
  ssh: 22,
  sftp: 22,
  rdp: 3389,
  vnc: 5900,
  telnet: 23,
};
