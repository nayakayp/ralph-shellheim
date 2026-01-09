// Audit log types

export interface AuditLog {
  id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  resource_name: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogFilter {
  action?: string;
  resource_type?: string;
  resource_id?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

// Action type labels for display
export const AuditActionLabels: Record<string, string> = {
  LOGIN: "Login",
  LOGOUT: "Logout",
  LOGIN_FAILED: "Failed Login",
  ENTRY_CREATE: "Server Created",
  ENTRY_UPDATE: "Server Updated",
  ENTRY_DELETE: "Server Deleted",
  IDENTITY_CREATE: "Identity Created",
  IDENTITY_UPDATE: "Identity Updated",
  IDENTITY_DELETE: "Identity Deleted",
  FOLDER_CREATE: "Folder Created",
  FOLDER_UPDATE: "Folder Updated",
  FOLDER_DELETE: "Folder Deleted",
  SSH_CONNECT: "SSH Connect",
  SSH_DISCONNECT: "SSH Disconnect",
  SFTP_CONNECT: "SFTP Connect",
  SFTP_DISCONNECT: "SFTP Disconnect",
  FILE_UPLOAD: "File Upload",
  FILE_DOWNLOAD: "File Download",
  FILE_DELETE: "File Delete",
  FILE_CREATE: "File Create",
  FILE_RENAME: "File Rename",
  FILE_EDIT: "File Edit",
  TUNNEL_CREATE: "Tunnel Created",
  TUNNEL_CLOSE: "Tunnel Closed",
  RECORDING_START: "Recording Started",
  RECORDING_STOP: "Recording Stopped",
  RECORDING_DELETE: "Recording Deleted",
  SNIPPET_CREATE: "Snippet Created",
  SNIPPET_UPDATE: "Snippet Updated",
  SNIPPET_DELETE: "Snippet Deleted",
  SNIPPET_EXECUTE: "Snippet Executed",
  SETTINGS_UPDATE: "Settings Updated",
  PASSWORD_CHANGE: "Password Changed",
};

// Resource type icons
export const ResourceTypeIcons: Record<string, string> = {
  entry: "🖥️",
  identity: "🔑",
  folder: "📁",
  session: "💻",
  recording: "⏺️",
  snippet: "📝",
  tunnel: "🔗",
  file: "📄",
  account: "👤",
};

// Get action category for grouping/coloring
export function getActionCategory(action: string): "auth" | "server" | "file" | "connection" | "other" {
  if (["LOGIN", "LOGOUT", "LOGIN_FAILED", "PASSWORD_CHANGE"].includes(action)) {
    return "auth";
  }
  if (["ENTRY_CREATE", "ENTRY_UPDATE", "ENTRY_DELETE", "FOLDER_CREATE", "FOLDER_UPDATE", "FOLDER_DELETE", "IDENTITY_CREATE", "IDENTITY_UPDATE", "IDENTITY_DELETE"].includes(action)) {
    return "server";
  }
  if (["FILE_UPLOAD", "FILE_DOWNLOAD", "FILE_DELETE", "FILE_CREATE", "FILE_RENAME", "FILE_EDIT"].includes(action)) {
    return "file";
  }
  if (["SSH_CONNECT", "SSH_DISCONNECT", "SFTP_CONNECT", "SFTP_DISCONNECT", "TUNNEL_CREATE", "TUNNEL_CLOSE"].includes(action)) {
    return "connection";
  }
  return "other";
}

// Format relative time
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}
