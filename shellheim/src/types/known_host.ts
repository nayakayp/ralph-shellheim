// Known hosts types for SSH host key verification

export interface KnownHost {
  id: string;
  host: string;
  port: number;
  key_type: string;
  fingerprint: string;
  added_at: string;
  last_seen_at: string;
}

export type HostKeyStatus =
  | { status: "Known" }
  | { status: "Unknown"; key_type: string; fingerprint: string }
  | { status: "Changed"; key_type: string; new_fingerprint: string; old_fingerprint: string };

export interface TrustHostKeyRequest {
  host: string;
  port: number;
  key_type: string;
  fingerprint: string;
  public_key_base64: string;
  replace: boolean;
}

export interface CheckHostKeyRequest {
  host: string;
  port: number;
  key_type: string;
  fingerprint: string;
}
