// Authentication types

export interface Account {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  totp_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAccountRequest {
  username: string;
  password: string;
  display_name?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
  totp_code?: string;
}

export interface LoginResponse {
  token: string;
  account: Account;
}
