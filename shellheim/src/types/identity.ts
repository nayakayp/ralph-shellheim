// Identity (credential) types

export interface Identity {
  id: string;
  account_id: string;
  name: string;
  username?: string;
  // Note: encrypted fields are not exposed to frontend
  // password_encrypted, ssh_key_encrypted, passphrase_encrypted are excluded
  created_at: string;
  updated_at: string;
}

export interface CreateIdentityRequest {
  name: string;
  username?: string;
  password?: string;
  ssh_key?: string;
  passphrase?: string;
}

export interface UpdateIdentityRequest {
  name?: string;
  username?: string;
  password?: string;
  ssh_key?: string;
  passphrase?: string;
}

// Credential type for UI display
export type CredentialType = 'password' | 'ssh_key' | 'both';

// Helper to determine what credentials an identity has
export function getCredentialType(identity: Identity & { hasPassword?: boolean; hasSshKey?: boolean }): CredentialType {
  const hasPassword = identity.hasPassword ?? false;
  const hasSshKey = identity.hasSshKey ?? false;
  
  if (hasPassword && hasSshKey) return 'both';
  if (hasSshKey) return 'ssh_key';
  return 'password';
}
