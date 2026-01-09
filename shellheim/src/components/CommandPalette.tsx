import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { MagnifyingGlass, Desktop, Folder, Terminal, Gear, Key, VideoCamera, Tag, ArrowRight } from "@phosphor-icons/react";
import type { Entry } from "../types/entry";
import type { Folder as FolderType } from "../types/folder";
import type { Snippet } from "../types/snippet";
import { listEntries, listFolders, listSnippets } from "../lib/api";
import "./CommandPalette.css";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectServer: (entry: Entry) => void;
  onConnectSftp?: (entry: Entry) => void;
  onSelectFolder: (folderId: string | null) => void;
  onOpenPanel: (panel: "identities" | "snippets" | "recordings" | "tunnels" | "hosts" | "tags" | "audit" | "monitoring" | "backup") => void;
  onExecuteSnippet?: (snippet: Snippet, sessionId: string) => void;
  activeSessionId?: string | null;
}

interface SearchResult {
  id: string;
  type: "server" | "snippet" | "folder" | "action";
  title: string;
  subtitle?: string;
  icon: "server" | "snippet" | "folder" | "settings" | "key" | "video" | "tag";
  data?: Entry | Snippet | FolderType;
  action?: string;
}

// Simple fuzzy matching function
function fuzzyMatch(text: string, query: string): boolean {
  const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lowerText = text.toLowerCase();
  return searchTerms.every((term) => lowerText.includes(term));
}

function fuzzyScore(text: string, query: string): number {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  
  // Exact match gets highest score
  if (lowerText === lowerQuery) return 100;
  
  // Starts with query gets high score
  if (lowerText.startsWith(lowerQuery)) return 90;
  
  // Contains query as whole word
  if (lowerText.includes(lowerQuery)) return 80;
  
  // All terms present
  const terms = lowerQuery.split(/\s+/).filter(Boolean);
  const allMatch = terms.every((term) => lowerText.includes(term));
  if (allMatch) return 70;
  
  return 0;
}

export function CommandPalette({
  isOpen,
  onClose,
  onConnectServer,
  onConnectSftp: _onConnectSftp,
  onSelectFolder,
  onOpenPanel,
  onExecuteSnippet,
  activeSessionId,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Static actions
  const staticActions: SearchResult[] = useMemo(() => [
    { id: "action-identities", type: "action", title: "Identities", subtitle: "Manage SSH keys and credentials", icon: "key", action: "identities" },
    { id: "action-snippets", type: "action", title: "Snippets", subtitle: "View and manage command snippets", icon: "snippet", action: "snippets" },
    { id: "action-recordings", type: "action", title: "Recordings", subtitle: "View session recordings", icon: "video", action: "recordings" },
    { id: "action-tunnels", type: "action", title: "Tunnels", subtitle: "Manage SSH tunnels", icon: "settings", action: "tunnels" },
    { id: "action-hosts", type: "action", title: "Known Hosts", subtitle: "Manage known SSH hosts", icon: "settings", action: "hosts" },
    { id: "action-tags", type: "action", title: "Tags", subtitle: "Manage server tags", icon: "tag", action: "tags" },
    { id: "action-audit", type: "action", title: "Audit Log", subtitle: "View activity history", icon: "settings", action: "audit" },
    { id: "action-monitoring", type: "action", title: "Monitoring", subtitle: "Server health monitoring", icon: "settings", action: "monitoring" },
    { id: "action-backup", type: "action", title: "Backup", subtitle: "Export and import settings", icon: "settings", action: "backup" },
  ], []);

  // Load data when palette opens
  useEffect(() => {
    if (!isOpen) return;
    
    setLoading(true);
    Promise.all([
      listEntries(),
      listFolders(),
      listSnippets(),
    ]).then(([entriesData, foldersData, snippetsData]) => {
      setEntries(entriesData);
      setFolders(foldersData);
      setSnippets(snippetsData);
    }).catch((err) => {
      console.error("Failed to load command palette data:", err);
    }).finally(() => {
      setLoading(false);
    });
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Build search results
  const results = useMemo<SearchResult[]>(() => {
    const items: SearchResult[] = [];
    const q = query.trim();

    // If no query, show recent/suggested items
    if (!q) {
      // Show first 5 servers
      entries.slice(0, 5).forEach((entry) => {
        items.push({
          id: `server-${entry.id}`,
          type: "server",
          title: entry.name,
          subtitle: `${entry.host}:${entry.port}`,
          icon: "server",
          data: entry,
        });
      });
      
      // Show first 3 actions
      staticActions.slice(0, 4).forEach((action) => items.push(action));
      
      return items;
    }

    // Search servers
    entries.forEach((entry) => {
      const searchText = `${entry.name} ${entry.host} ${entry.description || ""}`;
      if (fuzzyMatch(searchText, q)) {
        items.push({
          id: `server-${entry.id}`,
          type: "server",
          title: entry.name,
          subtitle: `${entry.host}:${entry.port}`,
          icon: "server",
          data: entry,
        });
      }
    });

    // Search folders
    folders.forEach((folder) => {
      if (fuzzyMatch(folder.name, q)) {
        items.push({
          id: `folder-${folder.id}`,
          type: "folder",
          title: folder.name,
          subtitle: "Go to folder",
          icon: "folder",
          data: folder,
        });
      }
    });

    // Search snippets
    snippets.forEach((snippet) => {
      const searchText = `${snippet.name} ${snippet.content} ${snippet.description || ""}`;
      if (fuzzyMatch(searchText, q)) {
        items.push({
          id: `snippet-${snippet.id}`,
          type: "snippet",
          title: snippet.name,
          subtitle: snippet.content.substring(0, 50) + (snippet.content.length > 50 ? "..." : ""),
          icon: "snippet",
          data: snippet,
        });
      }
    });

    // Search static actions
    staticActions.forEach((action) => {
      if (fuzzyMatch(action.title + " " + (action.subtitle || ""), q)) {
        items.push(action);
      }
    });

    // Sort by score
    items.sort((a, b) => {
      const scoreA = fuzzyScore(a.title, q);
      const scoreB = fuzzyScore(b.title, q);
      return scoreB - scoreA;
    });

    return items.slice(0, 15); // Limit results
  }, [query, entries, folders, snippets, staticActions]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && results.length > 0) {
      const selectedEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex, results]);

  const handleSelect = useCallback((result: SearchResult) => {
    onClose();
    
    switch (result.type) {
      case "server":
        if (result.data) {
          onConnectServer(result.data as Entry);
        }
        break;
      case "folder":
        if (result.data) {
          onSelectFolder((result.data as FolderType).id);
        }
        break;
      case "snippet":
        if (result.data && onExecuteSnippet && activeSessionId) {
          onExecuteSnippet(result.data as Snippet, activeSessionId);
        }
        break;
      case "action":
        if (result.action) {
          onOpenPanel(result.action as "identities" | "snippets" | "recordings" | "tunnels" | "hosts" | "tags" | "audit" | "monitoring" | "backup");
        }
        break;
    }
  }, [onClose, onConnectServer, onSelectFolder, onExecuteSnippet, onOpenPanel, activeSessionId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (results[selectedIndex]) {
          handleSelect(results[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  }, [results, selectedIndex, handleSelect, onClose]);

  // Global keyboard listener
  useEffect(() => {
    if (!isOpen) return;
    
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getIcon = (icon: string) => {
    switch (icon) {
      case "server": return <Desktop size={18} weight="regular" />;
      case "folder": return <Folder size={18} weight="regular" />;
      case "snippet": return <Terminal size={18} weight="regular" />;
      case "settings": return <Gear size={18} weight="regular" />;
      case "key": return <Key size={18} weight="regular" />;
      case "video": return <VideoCamera size={18} weight="regular" />;
      case "tag": return <Tag size={18} weight="regular" />;
      default: return <Gear size={18} weight="regular" />;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "server": return <span className="result-badge server">Server</span>;
      case "folder": return <span className="result-badge folder">Folder</span>;
      case "snippet": return <span className="result-badge snippet">Snippet</span>;
      case "action": return <span className="result-badge action">Go to</span>;
      default: return null;
    }
  };

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <div className="command-palette-input-wrapper">
          <MagnifyingGlass size={20} className="search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Search servers, snippets, settings..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="command-palette-shortcut">
            <kbd>esc</kbd> to close
          </div>
        </div>

        <div className="command-palette-results" ref={listRef}>
          {loading ? (
            <div className="command-palette-loading">Loading...</div>
          ) : results.length === 0 ? (
            <div className="command-palette-empty">
              No results found for "{query}"
            </div>
          ) : (
            results.map((result, index) => (
              <div
                key={result.id}
                className={`command-palette-result ${index === selectedIndex ? "selected" : ""}`}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="result-icon">{getIcon(result.icon)}</div>
                <div className="result-content">
                  <div className="result-title">{result.title}</div>
                  {result.subtitle && (
                    <div className="result-subtitle">{result.subtitle}</div>
                  )}
                </div>
                {getTypeBadge(result.type)}
                <ArrowRight size={14} className="result-arrow" />
              </div>
            ))
          )}
        </div>

        <div className="command-palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
