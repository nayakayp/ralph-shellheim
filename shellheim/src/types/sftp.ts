// SFTP types for file management

export interface SftpSessionInfo {
  session_id: string;
  entry_id: string;
  host: string;
  port: number;
  current_path: string;
  connected_at: string;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: number | null;
  permissions: number | null;
  owner: number | null;
  group: number | null;
}

export interface FileStats {
  size: number;
  is_dir: boolean;
  is_file: boolean;
  is_symlink: boolean;
  modified: number | null;
  accessed: number | null;
  permissions: number | null;
  owner: number | null;
  group: number | null;
}

export interface ConnectSftpRequest {
  entry_id: string;
  identity_id?: string;
}

export interface ListDirRequest {
  session_id: string;
  path: string;
}

export interface FileOpRequest {
  session_id: string;
  path: string;
}

export interface RenameRequest {
  session_id: string;
  old_path: string;
  new_path: string;
}

export interface UploadRequest {
  session_id: string;
  path: string;
  data: number[]; // byte array
}

// Request to download file with progress
export interface DownloadRequest {
  session_id: string;
  remote_path: string;
  local_path: string;
}

// Request to upload files with progress
export interface UploadFilesRequest {
  session_id: string;
  local_paths: string[];
  remote_dir: string;
}

// Transfer progress event payload
export interface TransferProgress {
  transfer_id: string;
  file_name: string;
  bytes_transferred: number;
  total_bytes: number;
  percent: number;
  status: 'transferring' | 'completed' | 'error';
  error: string | null;
}

// Active transfer state for UI
export interface ActiveTransfer {
  id: string;
  fileName: string;
  direction: 'upload' | 'download';
  bytesTransferred: number;
  totalBytes: number;
  percent: number;
  status: 'transferring' | 'completed' | 'error';
  error: string | null;
  startedAt: Date;
}

// Helper to format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Helper to format permissions as rwx string
export function formatPermissions(mode: number | null): string {
  if (mode === null) return '---------';
  
  const perms = mode & 0o777;
  let str = '';
  
  // Owner
  str += (perms & 0o400) ? 'r' : '-';
  str += (perms & 0o200) ? 'w' : '-';
  str += (perms & 0o100) ? 'x' : '-';
  
  // Group
  str += (perms & 0o040) ? 'r' : '-';
  str += (perms & 0o020) ? 'w' : '-';
  str += (perms & 0o010) ? 'x' : '-';
  
  // Other
  str += (perms & 0o004) ? 'r' : '-';
  str += (perms & 0o002) ? 'w' : '-';
  str += (perms & 0o001) ? 'x' : '-';
  
  return str;
}

// Helper to get file icon based on extension
export function getFileIcon(name: string, isDir: boolean): string {
  if (isDir) return '📁';
  
  const ext = name.split('.').pop()?.toLowerCase() || '';
  
  const icons: Record<string, string> = {
    // Documents
    'pdf': '📄',
    'doc': '📝',
    'docx': '📝',
    'txt': '📄',
    'md': '📝',
    'rtf': '📝',
    
    // Code
    'js': '📜',
    'ts': '📜',
    'jsx': '📜',
    'tsx': '📜',
    'py': '🐍',
    'rs': '🦀',
    'go': '🔵',
    'java': '☕',
    'c': '📜',
    'cpp': '📜',
    'h': '📜',
    'css': '🎨',
    'scss': '🎨',
    'html': '🌐',
    'json': '📋',
    'xml': '📋',
    'yaml': '📋',
    'yml': '📋',
    'toml': '📋',
    'sh': '🖥️',
    'bash': '🖥️',
    'zsh': '🖥️',
    
    // Images
    'jpg': '🖼️',
    'jpeg': '🖼️',
    'png': '🖼️',
    'gif': '🖼️',
    'svg': '🖼️',
    'webp': '🖼️',
    'ico': '🖼️',
    'bmp': '🖼️',
    
    // Media
    'mp3': '🎵',
    'wav': '🎵',
    'ogg': '🎵',
    'flac': '🎵',
    'mp4': '🎬',
    'mkv': '🎬',
    'avi': '🎬',
    'mov': '🎬',
    'webm': '🎬',
    
    // Archives
    'zip': '📦',
    'tar': '📦',
    'gz': '📦',
    'rar': '📦',
    '7z': '📦',
    'bz2': '📦',
    'xz': '📦',
    
    // Config
    'conf': '⚙️',
    'cfg': '⚙️',
    'ini': '⚙️',
    'env': '⚙️',
    
    // Other
    'log': '📋',
    'sql': '🗃️',
    'db': '🗃️',
    'sqlite': '🗃️',
    'key': '🔑',
    'pem': '🔑',
    'pub': '🔑',
  };
  
  return icons[ext] || '📄';
}
