// SSH session types

import type { HostKeyStatus } from "./known_host";

export interface ConnectRequest {
  entry_id: string;
  identity_id?: string;
  cols: number;
  rows: number;
}

export interface SshSessionInfo {
  session_id: string;
  entry_id: string;
  host: string;
  port: number;
  connected_at: string;
}

// SSH connection response - can be connected or need host key verification
export type ConnectSshResponse =
  | { type: "Connected" } & SshSessionInfo
  | { type: "HostKeyVerification"; host: string; port: number; status: HostKeyStatus };

export interface ResizeRequest {
  session_id: string;
  cols: number;
  rows: number;
}

export interface SendDataRequest {
  session_id: string;
  data: string;
}

export interface SshDataEvent {
  session_id: string;
  data: string;
}

export interface SshCloseEvent {
  session_id: string;
  reason: string;
}
