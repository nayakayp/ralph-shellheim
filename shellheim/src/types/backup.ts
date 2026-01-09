// Backup/Export types

export interface ExportFolder {
  id: string;
  parent_id: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
}

export interface ExportEntry {
  id: string;
  folder_id: string | null;
  entry_type: string;
  name: string;
  host: string | null;
  port: number | null;
  protocol: string | null;
  description: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
}

export interface ExportIdentity {
  id: string;
  name: string;
  username: string | null;
  has_password: boolean;
  has_ssh_key: boolean;
}

export interface ExportTag {
  id: string;
  name: string;
  color: string | null;
}

export interface EntryTagRelation {
  entry_id: string;
  tag_id: string;
}

export interface EntryIdentityRelation {
  entry_id: string;
  identity_id: string;
  priority: number;
}

export interface ExportSnippet {
  id: string;
  name: string;
  content: string;
  description: string | null;
  category: string | null;
}

export interface UserData {
  folders: ExportFolder[];
  entries: ExportEntry[];
  identities: ExportIdentity[];
  tags: ExportTag[];
  entry_tags: EntryTagRelation[];
  entry_identities: EntryIdentityRelation[];
  snippets: ExportSnippet[];
}

export interface ExportData {
  version: string;
  exported_at: string;
  app: string;
  data: UserData;
}

export interface ImportOptions {
  merge: boolean;
  import_folders: boolean;
  import_entries: boolean;
  import_identities: boolean;
  import_tags: boolean;
  import_snippets: boolean;
}

export interface ImportResult {
  success: boolean;
  folders_imported: number;
  entries_imported: number;
  identities_imported: number;
  tags_imported: number;
  snippets_imported: number;
  errors: string[];
}

export interface ExportStats {
  folders: number;
  entries: number;
  identities: number;
  tags: number;
  snippets: number;
}

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  merge: true,
  import_folders: true,
  import_entries: true,
  import_identities: true,
  import_tags: true,
  import_snippets: true,
};
