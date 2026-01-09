// Script types for automated command execution

/** Target OS for script execution */
export type ScriptOs = 
  | "any"
  | "linux"
  | "ubuntu"
  | "debian"
  | "centos"
  | "fedora"
  | "alpine"
  | "macos"
  | "windows"
  | "proxmox";

/** Script entity */
export interface Script {
  id: string;
  account_id: string;
  name: string;
  content: string;
  description?: string;
  category?: string;
  target_os: string;
  interpreter: string;
  run_as_sudo: boolean;
  timeout_seconds: number;
  created_at: string;
  updated_at: string;
}

/** Request to create a new script */
export interface CreateScriptRequest {
  name: string;
  content: string;
  description?: string;
  category?: string;
  target_os?: string;
  interpreter?: string;
  run_as_sudo?: boolean;
  timeout_seconds?: number;
}

/** Request to update an existing script */
export interface UpdateScriptRequest {
  name?: string;
  content?: string;
  description?: string;
  category?: string;
  target_os?: string;
  interpreter?: string;
  run_as_sudo?: boolean;
  timeout_seconds?: number;
}

/** Request to execute a script */
export interface ExecuteScriptRequest {
  script_id: string;
  entry_id: string;
  identity_id: string;
  env_vars?: Record<string, string>;
}

/** Result of script execution */
export interface ScriptExecutionResult {
  script_id: string;
  entry_id: string;
  success: boolean;
  exit_code: number;
  output: string;
  executed_at: string;
  duration_ms: number;
}
