import { useState, useEffect } from "react";
import { Plus, X } from "@phosphor-icons/react";
import type { Tag } from "../types/tag";
import { TAG_COLORS, getContrastColor, getDefaultTagColor } from "../types/tag";
import { listTags, createTag } from "../lib/api";
import "./TagSelector.css";

interface TagSelectorProps {
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
}

export function TagSelector({ selectedTagIds, onChange }: TagSelectorProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    try {
      const data = await listTags();
      setTags(data);
      setNewTagColor(getDefaultTagColor(data));
    } catch (err) {
      console.error("Failed to load tags:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onChange([...selectedTagIds, tagId]);
    }
  };

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;

    setIsCreating(true);
    try {
      const newTag = await createTag({
        name: newTagName.trim(),
        color: newTagColor,
      });
      setTags([...tags, newTag]);
      onChange([...selectedTagIds, newTag.id]); // Auto-select new tag
      setNewTagName("");
      setShowCreateForm(false);
      setNewTagColor(getDefaultTagColor([...tags, newTag]));
    } catch (err) {
      console.error("Failed to create tag:", err);
    } finally {
      setIsCreating(false);
    }
  };

  if (isLoading) {
    return <div className="tag-selector-loading">Loading tags...</div>;
  }

  return (
    <div className="tag-selector">
      {/* Selected tags */}
      <div className="tag-selector-selected">
        {selectedTagIds.length === 0 ? (
          <span className="tag-selector-empty">No tags selected</span>
        ) : (
          selectedTagIds.map((tagId) => {
            const tag = tags.find((t) => t.id === tagId);
            if (!tag) return null;
            return (
              <span
                key={tag.id}
                className="tag-selector-chip"
                style={{
                  backgroundColor: tag.color || TAG_COLORS[0],
                  color: getContrastColor(tag.color || TAG_COLORS[0]),
                }}
              >
                {tag.name}
                <button
                  type="button"
                  className="tag-selector-chip-remove"
                  onClick={() => toggleTag(tag.id)}
                  style={{ color: getContrastColor(tag.color || TAG_COLORS[0]) }}
                >
                  <X size={12} weight="bold" />
                </button>
              </span>
            );
          })
        )}
      </div>

      {/* Available tags */}
      <div className="tag-selector-available">
        {tags
          .filter((tag) => !selectedTagIds.includes(tag.id))
          .map((tag) => (
            <button
              key={tag.id}
              type="button"
              className="tag-selector-option"
              onClick={() => toggleTag(tag.id)}
            >
              <span
                className="tag-selector-color"
                style={{ backgroundColor: tag.color || TAG_COLORS[0] }}
              />
              {tag.name}
            </button>
          ))}
        
        {/* Create new tag button */}
        {!showCreateForm && (
          <button
            type="button"
            className="tag-selector-add"
            onClick={() => setShowCreateForm(true)}
          >
            <Plus size={14} />
            New tag
          </button>
        )}
      </div>

      {/* Create tag form */}
      {showCreateForm && (
        <form className="tag-selector-create" onSubmit={handleCreateTag}>
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="Tag name"
            autoFocus
          />
          <div className="tag-selector-colors">
            {TAG_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`tag-selector-color-btn ${
                  newTagColor === color ? "selected" : ""
                }`}
                style={{ backgroundColor: color }}
                onClick={() => setNewTagColor(color)}
              />
            ))}
          </div>
          <div className="tag-selector-create-actions">
            <button
              type="button"
              className="tag-selector-cancel"
              onClick={() => {
                setShowCreateForm(false);
                setNewTagName("");
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="tag-selector-submit"
              disabled={!newTagName.trim() || isCreating}
            >
              {isCreating ? "Creating..." : "Add"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
