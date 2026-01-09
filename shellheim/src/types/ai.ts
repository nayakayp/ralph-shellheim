export interface AiSettings {
  id: string;
  account_id: string;
  api_endpoint: string;
  model: string;
  temperature: number;
  system_prompt: string;
  enabled: boolean;
  has_api_key: boolean; // Backend sends this instead of actual key
  created_at: string;
  updated_at: string;
}

export interface UpdateAiSettingsRequest {
  api_key?: string | null;
  api_endpoint?: string;
  model?: string;
  temperature?: number;
  system_prompt?: string;
  enabled?: boolean;
}

export interface GenerateCommandRequest {
  prompt: string;
  server_context?: {
    os?: string;
    shell?: string;
    hostname?: string;
  };
}

export interface GenerateCommandResponse {
  command: string;
  explanation: string;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  models?: string[];
}
