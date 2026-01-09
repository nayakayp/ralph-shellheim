// SSH Tunnel types

export type TunnelType = 'local' | 'remote';

export type TunnelStatus = 'active' | 'stopped' | 'error';

export interface Tunnel {
  id: string;
  sessionId: string;
  tunnelType: TunnelType;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  status: TunnelStatus;
  createdAt: string;
  errorMessage?: string;
}

export interface CreateTunnelRequest {
  sessionId: string;
  tunnelType: TunnelType;
  localPort: number;
  remoteHost: string;
  remotePort: number;
}

export interface TunnelStatusEvent {
  tunnelId: string;
  status: TunnelStatus;
  errorMessage?: string;
}
