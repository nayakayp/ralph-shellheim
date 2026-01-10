import { useState, useEffect, useCallback } from "react";
import { Terminal, X, Plus, MagnifyingGlass, FolderSimple, Copy } from "@phosphor-icons/react";
import type { Snippet, CreateSnippetRequest, UpdateSnippetRequest } from "../types/snippet";
import { listSnippets, createSnippet, updateSnippet, deleteSnippet, listSnippetCategories, searchSnippets } from "../lib/api";
import { SnippetModal } from "./SnippetModal";
import "./SnippetsPanel.css";

interface SnippetsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onExecute?: (snippet: Snippet) => void;
}

export function SnippetsPanel({ isOpen, onClose, onExecute }: SnippetsPanelProps) {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<Snippet | undefined>();
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const loadSnippets = useCallback(async () => {
    try {
      setError("");
      setIsLoading(true);
      const [snippetsData, categoriesData] = await Promise.all([
        listSnippets(),
        listSnippetCategories(),
      ]);
      setSnippets(snippetsData);
      setCategories(categoriesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load snippets");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      loadSnippets();
      return;
    }
    try {
      setIsLoading(true);
      const results = await searchSnippets(query);
      setSnippets(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsLoading(false);
    }
  }, [loadSnippets]);

  useEffect(() => {
    if (isOpen) {
      loadSnippets();
    }
  }, [isOpen, loadSnippets]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      handleSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, handleSearch]);

  const handleAdd = () => {
    setEditingSnippet(undefined);
    setShowModal(true);
  };

  const handleEdit = (snippet: Snippet) => {
    setEditingSnippet(snippet);
    setShowModal(true);
  };

  const handleDelete = async (snippet: Snippet) => {
    if (!confirm(`Delete "${snippet.name}"? This cannot be undone.`)) return;

    try {
      await deleteSnippet(snippet.id);
      setSnippets((prev) => prev.filter((s) => s.id !== snippet.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete snippet");
    }
  };

  const handleSubmit = async (request: CreateSnippetRequest | UpdateSnippetRequest) => {
    if (editingSnippet) {
      const updated = await updateSnippet(editingSnippet.id, request as UpdateSnippetRequest);
      setSnippets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } else {
      const created = await createSnippet(request as CreateSnippetRequest);
      setSnippets((prev) => [...prev, created]);
    }
    setShowModal(false);
    // Refresh categories in case new one was added
    const categoriesData = await listSnippetCategories();
    setCategories(categoriesData);
  };

  const handleCopyToClipboard = async (snippet: Snippet) => {
    try {
      await navigator.clipboard.writeText(snippet.content);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleExecute = (snippet: Snippet) => {
    onExecute?.(snippet);
    onClose();
  };

  const filteredSnippets = selectedCategory
    ? snippets.filter((s) => s.category === selectedCategory)
    : snippets;

  if (!isOpen) return null;

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="snippets-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <div className="panel-title">
            <Terminal size={22} />
            <h2>Snippets</h2>
            <span className="count-badge">{snippets.length}</span>
          </div>
          <button className="panel-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="panel-toolbar">
          <p className="panel-description">
            Save and reuse SSH commands across your terminal sessions
          </p>
          <div className="snippets-search">
            <MagnifyingGlass size={16} />
            <input
              type="text"
              placeholder="Search snippets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="snippets-actions">
            {categories.length > 0 && (
              <select
                className="category-filter"
                value={selectedCategory || ""}
                onChange={(e) => setSelectedCategory(e.target.value || null)}
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            )}
            <button className="add-snippet-btn" onClick={handleAdd}>
              <Plus size={16} />
              Add Snippet
            </button>
          </div>
        </div>

        <div className="panel-content">
          {error && <div className="panel-error">{error}</div>}

          {isLoading ? (
            <div className="panel-loading">
              <div className="spinner" />
              <p>Loading snippets...</p>
            </div>
          ) : filteredSnippets.length === 0 ? (
            <div className="panel-empty">
              <Terminal size={48} weight="light" />
              <h3>{searchQuery ? "No matches found" : "No snippets yet"}</h3>
              <p>
                {searchQuery
                  ? "Try a different search term"
                  : "Save your commonly used commands for quick access"}
              </p>
              {!searchQuery && (
                <button className="btn btn--primary" onClick={handleAdd}>
                  Add Your First Snippet
                </button>
              )}
            </div>
          ) : (
            <div className="snippets-list">
              {filteredSnippets.map((snippet) => (
                <div key={snippet.id} className="snippet-card">
                  <div className="snippet-header">
                    <div className="snippet-info">
                      <h4 className="snippet-name">{snippet.name}</h4>
                      {snippet.category && (
                        <span className="snippet-category">
                          <FolderSimple size={12} />
                          {snippet.category}
                        </span>
                      )}
                    </div>
                    <div className="snippet-actions">
                      <button
                        className="snippet-action-btn copy"
                        onClick={() => handleCopyToClipboard(snippet)}
                        title="Copy to clipboard"
                      >
                        <Copy size={14} />
                      </button>
                      {onExecute && (
                        <button
                          className="snippet-action-btn execute"
                          onClick={() => handleExecute(snippet)}
                          title="Execute in terminal"
                        >
                          <Terminal size={14} />
                        </button>
                      )}
                      <button
                        className="snippet-action-btn edit"
                        onClick={() => handleEdit(snippet)}
                      >
                        Edit
                      </button>
                      <button
                        className="snippet-action-btn delete"
                        onClick={() => handleDelete(snippet)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {snippet.description && (
                    <p className="snippet-description">{snippet.description}</p>
                  )}
                  <pre className="snippet-content">{snippet.content}</pre>
                </div>
              ))}
            </div>
          )}
        </div>

        {showModal && (
          <SnippetModal
            snippet={editingSnippet}
            categories={categories}
            onClose={() => setShowModal(false)}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  );
}
