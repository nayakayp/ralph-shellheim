// Tauri API bindings
import { invoke } from "@tauri-apps/api/core";
import type { Account, CreateAccountRequest, LoginRequest, LoginResponse } from "../types/auth";
import type { Entry, CreateEntryRequest, UpdateEntryRequest } from "../types/entry";
import type { Identity, CreateIdentityRequest, UpdateIdentityRequest } from "../types/identity";
import type { ConnectRequest, SshSessionInfo, SendDataRequest, ResizeRequest } from "../types/ssh";
import type { Folder, CreateFolderRequest, UpdateFolderRequest } from "../types/folder";

// Storage key for auth token
const TOKEN_KEY = "shellheim_token";
const ACCOUNT_KEY = "shellheim_account";

// Get stored token
export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

// Get stored account
export function getStoredAccount(): Account | null {
  const data = localStorage.getItem(ACCOUNT_KEY);
  return data ? JSON.parse(data) : null;
}

// Store auth data
export function storeAuth(token: string, account: Account): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
}

// Clear auth data
export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ACCOUNT_KEY);
}

// Account API
export async function hasAccounts(): Promise<boolean> {
  return invoke<boolean>("has_accounts");
}

export async function createAccount(request: CreateAccountRequest): Promise<Account> {
  return invoke<Account>("create_account", { request });
}

export async function login(request: LoginRequest): Promise<LoginResponse> {
  const response = await invoke<LoginResponse>("login", { request });
  storeAuth(response.token, response.account);
  return response;
}

export async function logout(): Promise<void> {
  const token = getStoredToken();
  if (token) {
    await invoke("logout", { token });
  }
  clearAuth();
}

export async function getCurrentUser(): Promise<Account | null> {
  const token = getStoredToken();
  if (!token) return null;
  
  try {
    return await invoke<Account>("get_current_user", { token });
  } catch {
    clearAuth();
    return null;
  }
}

// Entry/Server API
export async function listEntries(folderId?: string): Promise<Entry[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Entry[]>("list_entries", { token, folderId });
}

export async function getEntry(entryId: string): Promise<Entry> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Entry>("get_entry", { token, entryId });
}

export async function createEntry(request: CreateEntryRequest): Promise<Entry> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Entry>("create_entry", { token, request });
}

export async function updateEntry(entryId: string, request: UpdateEntryRequest): Promise<Entry> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Entry>("update_entry", { token, entryId, request });
}

export async function deleteEntry(entryId: string): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("delete_entry", { token, entryId });
}

// Identity/Credential API
export async function listIdentities(): Promise<Identity[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Identity[]>("list_identities", { token });
}

export async function getIdentity(identityId: string): Promise<Identity> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Identity>("get_identity", { token, identityId });
}

export async function createIdentity(request: CreateIdentityRequest): Promise<Identity> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Identity>("create_identity", { token, request });
}

export async function updateIdentity(identityId: string, request: UpdateIdentityRequest): Promise<Identity> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Identity>("update_identity", { token, identityId, request });
}

export async function deleteIdentity(identityId: string): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("delete_identity", { token, identityId });
}

// SSH API
export async function connectSsh(request: ConnectRequest): Promise<SshSessionInfo> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<SshSessionInfo>("connect_ssh", { token, request });
}

export async function disconnectSsh(sessionId: string): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("disconnect_ssh", { token, sessionId });
}

export async function sendSshData(request: SendDataRequest): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("send_data", { token, request });
}

export async function resizeSshTerminal(request: ResizeRequest): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("resize_terminal", { token, request });
}

export async function listSshSessions(): Promise<SshSessionInfo[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<SshSessionInfo[]>("list_ssh_sessions", { token });
}

// Folder API
export async function listFolders(): Promise<Folder[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Folder[]>("list_folders", { token });
}

export async function getFolder(folderId: string): Promise<Folder> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Folder>("get_folder", { token, folderId });
}

export async function createFolder(request: CreateFolderRequest): Promise<Folder> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Folder>("create_folder", { token, request });
}

export async function updateFolder(folderId: string, request: UpdateFolderRequest): Promise<Folder> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Folder>("update_folder", { token, folderId, request });
}

export async function deleteFolder(folderId: string): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("delete_folder", { token, folderId });
}

export async function getFolderCounts(): Promise<Array<[string, number]>> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Array<[string, number]>>("get_folder_counts", { token });
}
