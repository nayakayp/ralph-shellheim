// Recording types for terminal session recordings

export interface Recording {
  id: string;
  entry_id: string;
  session_id: string | null;
  name: string;
  description: string | null;
  duration_secs: number | null;
  file_size: number | null;
  terminal_cols: number | null;
  terminal_rows: number | null;
  started_at: string;
  ended_at: string | null;
}

export interface StartRecordingRequest {
  session_id: string;
  name?: string;
  description?: string;
}

export interface StartRecordingResponse {
  recording_id: string;
  session_id: string;
  started_at: string;
}

export interface StopRecordingRequest {
  recording_id: string;
}

export interface StopRecordingResponse {
  recording_id: string;
  duration_secs: number;
  file_size: number;
}

export interface UpdateRecordingRequest {
  name?: string;
  description?: string;
}

// Helper to format duration
export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Helper to format file size
export function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
