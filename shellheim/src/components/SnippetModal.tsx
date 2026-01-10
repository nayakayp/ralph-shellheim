import { useState } from "react";
import { X, Terminal, Plus } from "@phosphor-icons/react";
import type { Snippet, CreateSnippetRequest, UpdateSnippetRequest } from "../types/snippet";
import "./SnippetModal.css";

interface SnippetModalProps {
  snippet?: Snippet; // If provided, we're editing
  categories: string[];
  onClose: () => void;
  onSubmit: (request: CreateSnippetRequest | UpdateSnippetRequest) => Promise<void>;
}

export function SnippetModal({ snippet, categories, onClose, onSubmit }: SnippetModalProps) {
  const [name, setName] = useState(snippet?.name || "");
  const [content, setContent] = useState(snippet?.content || "");
  const [description, setDescription] = useState(snippet?.description || "");
  const [category, setCategory] = useState(snippet?.category || "");
  const [newCategory, setNewCategory] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const isEditing = !!snippet;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    if (!content.trim()) {
      setError("Command is required");
      return;
    }

    setIsLoading(true);
    try {
      const finalCategory = showNewCategory ? newCategory.trim() : category;
      
      const request: CreateSnippetRequest | UpdateSnippetRequest = {
        name: name.trim(),
        content: content.trim(),
        description: description.trim() || undefined,
        category: finalCategory || undefined,
      };

      await onSubmit(request);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save snippet");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content snippet-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Terminal size={20} />
            <h2>{isEditing ? "Edit Snippet" : "Add Snippet"}</h2>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="modal-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="snippet-name">Name</label>
            <input
              id="snippet-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Check Disk Usage"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="snippet-content">Command</label>
            <textarea
              id="snippet-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="e.g., df -h | grep -E '^/dev'"
              rows={4}
              className="code-textarea"
            />
            <span className="form-hint">
              Tip: You can use multi-line commands separated by newlines
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="snippet-description">Description (optional)</label>
            <textarea
              id="snippet-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this command do?"
              rows={2}
            />
          </div>

          <div className="form-group">
            <label>Category (optional)</label>
            {showNewCategory ? (
              <div className="new-category-input">
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Enter new category name"
                  autoFocus
                />
                <button
                  type="button"
                  className="cancel-new-category"
                  onClick={() => {
                    setShowNewCategory(false);
                    setNewCategory("");
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="category-select-row">
                <select
                  id="snippet-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">No Category</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="add-category-btn"
                  onClick={() => setShowNewCategory(true)}
                >
                  <Plus size={14} />
                  New
                </button>
              </div>
            )}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={isLoading}>
              {isLoading ? "Saving..." : isEditing ? "Save Changes" : "Add Snippet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
