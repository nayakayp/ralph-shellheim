// Snippet (reusable command) types

export interface Snippet {
  id: string;
  account_id: string;
  name: string;
  content: string;
  description?: string;
  category?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSnippetRequest {
  name: string;
  content: string;
  description?: string;
  category?: string;
}

export interface UpdateSnippetRequest {
  name?: string;
  content?: string;
  description?: string;
  category?: string;
}
