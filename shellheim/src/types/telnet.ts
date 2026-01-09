// Telnet types

/** Request to establish a Telnet connection */
export interface TelnetConnectRequest {
  entry_id: string;
  cols: number;
  rows: number;
}

/** Active Telnet session info */
export interface TelnetSessionInfo {
  session_id: string;
  entry_id: string;
  host: string;
  port: number;
  connected_at: string;
}

/** Request to send data to a Telnet session */
export interface TelnetSendDataRequest {
  session_id: string;
  data: string;
}

/** Request to resize Telnet terminal */
export interface TelnetResizeRequest {
  session_id: string;
  cols: number;
  rows: number;
}

/** Telnet data event from backend */
export interface TelnetDataEvent {
  session_id: string;
  data: string;
}

/** Telnet close event from backend */
export interface TelnetCloseEvent {
  session_id: string;
  reason: string;
}
