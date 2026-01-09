// Tauri API bindings
import { invoke as tauriInvoke } from "@tauri-apps/api/core";

// Check if running in Tauri context
declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}
const isTauri = typeof window !== "undefined" && window.__TAURI_INTERNALS__;

// Wrapper that throws helpful error when not in Tauri
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    throw new Error(`Tauri not available. Run the app with 'npm run tauri dev' instead of 'npm run dev'.`);
  }
  return tauriInvoke<T>(cmd, args);
}
import type { Account, CreateAccountRequest, LoginRequest, LoginResponse } from "../types/auth";
import type { Entry, CreateEntryRequest, UpdateEntryRequest } from "../types/entry";
import type { Identity, CreateIdentityRequest, UpdateIdentityRequest } from "../types/identity";
import type { Folder, CreateFolderRequest, UpdateFolderRequest } from "../types/folder";
import type { KnownHost, TrustHostKeyRequest } from "../types/known_host";
import type { ConnectRequest, SendDataRequest, ResizeRequest, ConnectSshResponse, HibernatedSession, HibernateSessionRequest, ResumeSessionRequest, ResumeSessionResponse } from "../types/ssh";
import type { SftpSessionInfo, FileEntry, FileStats, ConnectSftpRequest, ListDirRequest, FileOpRequest, RenameRequest, UploadRequest, DownloadRequest, UploadFilesRequest, DownloadDirRequest, SearchFilesRequest, SearchResult } from "../types/sftp";
import type { Tunnel, CreateTunnelRequest } from "../types/tunnel";
import type { Snippet, CreateSnippetRequest, UpdateSnippetRequest } from "../types/snippet";
import type { Recording, StartRecordingRequest, StartRecordingResponse, StopRecordingRequest, StopRecordingResponse, UpdateRecordingRequest } from "../types/recording";

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

export async function reorderEntries(entryIds: string[], folderId: string | null): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("reorder_entries", { token, entryIds, folderId });
}

export async function moveEntry(entryId: string, folderId: string | null): Promise<Entry> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Entry>("move_entry", { token, entryId, folderId });
}

// Identity API
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

// Folder API
export async function listFolders(): Promise<Folder[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Folder[]>("list_folders", { token });
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

export async function reorderFolders(folderIds: string[], parentId: string | null): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("reorder_folders", { token, folderIds, parentId });
}

export async function moveFolder(folderId: string, newParentId: string | null): Promise<Folder> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Folder>("move_folder", { token, folderId, newParentId });
}

export async function getFolderCounts(): Promise<Map<string, number>> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  const counts = await invoke<Record<string, number>>("get_folder_counts", { token });
  return new Map(Object.entries(counts));
}

// Known Hosts API
export async function listKnownHosts(): Promise<KnownHost[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<KnownHost[]>("list_known_hosts", { token });
}

export async function trustHostKey(request: TrustHostKeyRequest): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("trust_host_key", { token, request });
}

export async function deleteKnownHost(knownHostId: string): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("delete_known_host", { token, knownHostId });
}

// SSH Session API
export async function connectSsh(request: ConnectRequest): Promise<ConnectSshResponse> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<ConnectSshResponse>("connect_ssh", { token, request });
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

// Hibernated Sessions API
export async function listHibernatedSessions(): Promise<HibernatedSession[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<HibernatedSession[]>("list_hibernated_sessions", { token });
}

export async function hibernateSession(request: HibernateSessionRequest): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("hibernate_session", { token, request });
}

export async function resumeSession(request: ResumeSessionRequest): Promise<ResumeSessionResponse> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<ResumeSessionResponse>("resume_session", { token, request });
}

export async function deleteHibernatedSession(hibernatedSessionId: string): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("delete_hibernated_session", { token, hibernatedSessionId });
}

// SFTP API
export async function connectSftp(request: ConnectSftpRequest): Promise<SftpSessionInfo> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<SftpSessionInfo>("connect_sftp", { token, request });
}

export async function disconnectSftp(sessionId: string): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("disconnect_sftp", { token, sessionId });
}

export async function sftpListDir(request: ListDirRequest): Promise<FileEntry[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<FileEntry[]>("sftp_list_dir", { token, request });
}

export async function sftpSearchFiles(request: SearchFilesRequest): Promise<SearchResult> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<SearchResult>("sftp_search_files", { token, request });
}

export async function sftpStat(request: FileOpRequest): Promise<FileStats> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<FileStats>("sftp_stat", { token, request });
}

export async function sftpReadFile(request: FileOpRequest): Promise<number[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<number[]>("sftp_read_file", { token, request });
}

export async function sftpWriteFile(request: UploadRequest): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("sftp_write_file", { token, request });
}

export async function sftpDeleteFile(request: FileOpRequest): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("sftp_delete_file", { token, request });
}

export async function sftpDeleteDir(request: FileOpRequest): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("sftp_delete_dir", { token, request });
}

export async function sftpCreateDir(request: FileOpRequest): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("sftp_create_dir", { token, request });
}

export async function sftpRename(request: RenameRequest): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("sftp_rename", { token, request });
}

export async function listSftpSessions(): Promise<SftpSessionInfo[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<SftpSessionInfo[]>("list_sftp_sessions", { token });
}

// Download file with progress (returns transfer_id)
export async function sftpDownloadFile(request: DownloadRequest): Promise<string> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<string>("sftp_download_file", { token, request });
}

// Upload files with progress (returns transfer_id)
export async function sftpUploadFiles(request: UploadFilesRequest): Promise<string> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<string>("sftp_upload_files", { token, request });
}

// Download directory as ZIP with progress (returns transfer_id)
export async function sftpDownloadDirectory(request: DownloadDirRequest): Promise<string> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<string>("sftp_download_directory", { token, request });
}

// Tunnel API
export async function createTunnel(request: CreateTunnelRequest): Promise<Tunnel> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Tunnel>("create_tunnel", { token, request });
}

export async function stopTunnel(tunnelId: string): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("stop_tunnel", { token, tunnelId });
}

export async function listTunnels(): Promise<Tunnel[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Tunnel[]>("list_tunnels", { token });
}

export async function listSessionTunnels(sessionId: string): Promise<Tunnel[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Tunnel[]>("list_session_tunnels", { token, sessionId });
}

// Snippet API
export async function listSnippets(): Promise<Snippet[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Snippet[]>("list_snippets", { token });
}

export async function getSnippet(snippetId: string): Promise<Snippet> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Snippet>("get_snippet", { token, snippetId });
}

export async function createSnippet(request: CreateSnippetRequest): Promise<Snippet> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Snippet>("create_snippet", { token, request });
}

export async function updateSnippet(snippetId: string, request: UpdateSnippetRequest): Promise<Snippet> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Snippet>("update_snippet", { token, snippetId, request });
}

export async function deleteSnippet(snippetId: string): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("delete_snippet", { token, snippetId });
}

export async function listSnippetsByCategory(category?: string): Promise<Snippet[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Snippet[]>("list_snippets_by_category", { token, category });
}

export async function listSnippetCategories(): Promise<string[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<string[]>("list_snippet_categories", { token });
}

export async function searchSnippets(query: string): Promise<Snippet[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Snippet[]>("search_snippets", { token, query });
}

// Recording API
export async function startRecording(request: StartRecordingRequest): Promise<StartRecordingResponse> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<StartRecordingResponse>("start_recording", { token, request });
}

export async function stopRecording(request: StopRecordingRequest): Promise<StopRecordingResponse> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<StopRecordingResponse>("stop_recording", { token, request });
}

export async function listRecordings(): Promise<Recording[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Recording[]>("list_recordings", { token });
}

export async function listEntryRecordings(entryId: string): Promise<Recording[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Recording[]>("list_entry_recordings", { token, entryId });
}

export async function getRecording(recordingId: string): Promise<Recording> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Recording>("get_recording", { token, recordingId });
}

export async function getRecordingContent(recordingId: string): Promise<string> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<string>("get_recording_content", { token, recordingId });
}

export async function updateRecording(recordingId: string, request: UpdateRecordingRequest): Promise<Recording> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Recording>("update_recording", { token, recordingId, request });
}

export async function deleteRecording(recordingId: string): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("delete_recording", { token, recordingId });
}

export async function isSessionRecording(sessionId: string): Promise<string | null> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<string | null>("is_session_recording", { token, sessionId });
}

// Audit Log API
import type { AuditLog, AuditLogFilter } from "../types/audit";

export async function listAuditLogs(filter?: AuditLogFilter): Promise<AuditLog[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<AuditLog[]>("list_audit_logs", { token, filter });
}

export async function getAuditLogCount(filter?: AuditLogFilter): Promise<number> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<number>("get_audit_log_count", { token, filter });
}

export async function getAuditActionTypes(): Promise<string[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<string[]>("get_audit_action_types", { token });
}

export async function deleteOldAuditLogs(daysToKeep: number): Promise<number> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<number>("delete_old_audit_logs", { token, daysToKeep });
}

export async function clearAuditLogs(): Promise<number> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<number>("clear_audit_logs", { token });
}

// Tag API
import type { Tag, CreateTagRequest, UpdateTagRequest } from "../types/tag";

export async function listTags(): Promise<Tag[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Tag[]>("list_tags", { token });
}

export async function getTag(tagId: string): Promise<Tag> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Tag>("get_tag", { token, tagId });
}

export async function createTag(request: CreateTagRequest): Promise<Tag> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Tag>("create_tag", { token, request });
}

export async function updateTag(tagId: string, request: UpdateTagRequest): Promise<Tag> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Tag>("update_tag", { token, tagId, request });
}

export async function deleteTag(tagId: string): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("delete_tag", { token, tagId });
}

export async function addEntryTags(entryId: string, tagIds: string[]): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("add_entry_tags", { token, entryId, tagIds });
}

export async function removeEntryTags(entryId: string, tagIds: string[]): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("remove_entry_tags", { token, entryId, tagIds });
}

export async function setEntryTags(entryId: string, tagIds: string[]): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("set_entry_tags", { token, entryId, tagIds });
}

export async function getEntryTags(entryId: string): Promise<Tag[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<Tag[]>("get_entry_tags", { token, entryId });
}

export async function listEntriesByTag(tagId: string): Promise<string[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<string[]>("list_entries_by_tag", { token, tagId });
}

export async function getTagCounts(): Promise<Map<string, number>> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  const counts = await invoke<[string, number][]>("get_tag_counts", { token });
  return new Map(counts);
}

// ============ Monitoring API ============
import type { HealthCheckResult, MonitoringStats } from "../types/monitoring";

export async function checkEntryHealth(entryId: string, timeoutMs?: number): Promise<HealthCheckResult> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<HealthCheckResult>("check_entry_health", { 
    token, 
    entryId, 
    timeoutMs: timeoutMs ?? null 
  });
}

export async function checkEntriesHealth(entryIds?: string[], timeoutMs?: number): Promise<HealthCheckResult[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<HealthCheckResult[]>("check_entries_health", { 
    token, 
    entryIds: entryIds ?? null, 
    timeoutMs: timeoutMs ?? null 
  });
}

export async function getCachedHealth(entryIds?: string[]): Promise<HealthCheckResult[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<HealthCheckResult[]>("get_cached_health", { 
    token, 
    entryIds: entryIds ?? null 
  });
}

export async function getMonitoringStats(): Promise<MonitoringStats> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<MonitoringStats>("get_monitoring_stats", { token });
}

export async function clearHealthCache(entryIds?: string[]): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return invoke<void>("clear_health_cache", { token, entryIds: entryIds ?? null });
}
