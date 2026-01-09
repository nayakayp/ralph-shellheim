// Folder types for organizing servers

export interface Folder {
  id: string;
  account_id: string;
  parent_id: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateFolderRequest {
  parent_id?: string | null;
  name: string;
  icon?: string | null;
  color?: string | null;
}

export interface UpdateFolderRequest {
  parent_id?: string | null;
  name?: string;
  icon?: string | null;
  color?: string | null;
  sort_order?: number;
}

// Folder with computed properties for UI
export interface FolderNode extends Folder {
  children: FolderNode[];
  entryCount: number;
  isExpanded: boolean;
}

// Build tree structure from flat folder list
export function buildFolderTree(
  folders: Folder[],
  counts: Map<string, number>
): FolderNode[] {
  const nodeMap = new Map<string, FolderNode>();
  const roots: FolderNode[] = [];
  
  // Create nodes
  for (const folder of folders) {
    nodeMap.set(folder.id, {
      ...folder,
      children: [],
      entryCount: counts.get(folder.id) || 0,
      isExpanded: true,
    });
  }
  
  // Build tree
  for (const folder of folders) {
    const node = nodeMap.get(folder.id)!;
    if (folder.parent_id && nodeMap.has(folder.parent_id)) {
      nodeMap.get(folder.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  
  // Sort children by sort_order
  const sortNodes = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    for (const node of nodes) {
      sortNodes(node.children);
    }
  };
  sortNodes(roots);
  
  return roots;
}
