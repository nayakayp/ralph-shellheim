/**
 * TagsPanel - Manage and filter by tags
 */

import { useState, useEffect, useRef } from 'react';
import {
  Tag as TagIcon,
  X,
  Plus,
  PencilSimple,
  Trash,
  Check,
  CircleNotch,
  TagSimple,
} from '@phosphor-icons/react';
import type { Tag } from '../types/tag';
import { TAG_COLORS, getDefaultTagColor, getContrastColor } from '../types/tag';
import {
  listTags,
  createTag,
  updateTag,
  deleteTag,
  getTagCounts,
} from '../lib/api';
import './TagsPanel.css';

interface TagsPanelProps {
  onClose: () => void;
  onFilterChange?: (tagIds: string[]) => void;
  selectedTagIds?: string[];
  mode?: 'manage' | 'filter';
}

export function TagsPanel({
  onClose,
  onFilterChange,
  selectedTagIds = [],
  mode = 'manage',
}: TagsPanelProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagCounts, setTagCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add tag form
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Edit mode
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const colorPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadTags();
  }, []);

  // Close color picker when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        colorPickerRef.current &&
        !colorPickerRef.current.contains(event.target as Node)
      ) {
        setShowColorPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function loadTags() {
    try {
      setLoading(true);
      const [tagsData, countsData] = await Promise.all([
        listTags(),
        getTagCounts(),
      ]);
      setTags(tagsData);
      setTagCounts(countsData);
      // Set default color for new tags
      setNewTagColor(getDefaultTagColor(tagsData));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tags');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddTag(e: React.FormEvent) {
    e.preventDefault();
    if (!newTagName.trim() || isAdding) return;

    try {
      setIsAdding(true);
      const tag = await createTag({
        name: newTagName.trim(),
        color: newTagColor,
      });
      setTags((prev) => [...prev, tag]);
      setNewTagName('');
      setNewTagColor(getDefaultTagColor([...tags, tag]));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tag');
    } finally {
      setIsAdding(false);
    }
  }

  async function handleDeleteTag(tagId: string) {
    if (!confirm('Delete this tag? It will be removed from all servers.')) return;

    try {
      await deleteTag(tagId);
      setTags((prev) => prev.filter((t) => t.id !== tagId));
      // Also remove from filter if active
      if (selectedTagIds.includes(tagId)) {
        onFilterChange?.(selectedTagIds.filter((id) => id !== tagId));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tag');
    }
  }

  function startEditing(tag: Tag) {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color || TAG_COLORS[0]);
  }

  async function handleSaveEdit() {
    if (!editingId || !editName.trim()) return;

    try {
      const updated = await updateTag(editingId, {
        name: editName.trim(),
        color: editColor,
      });
      setTags((prev) =>
        prev.map((t) => (t.id === editingId ? updated : t))
      );
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tag');
    }
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditName('');
    setEditColor('');
  }

  function toggleTagFilter(tagId: string) {
    const newSelection = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    onFilterChange?.(newSelection);
  }

  function clearFilter() {
    onFilterChange?.([]);
  }

  return (
    <div className="tags-panel">
      <div className="tags-panel-header">
        <h2>
          <TagIcon size={20} weight="duotone" />
          {mode === 'manage' ? 'Manage Tags' : 'Filter by Tags'}
        </h2>
        <button className="close-btn" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <div className="tags-panel-content">
        {mode === 'manage' && (
          <form className="add-tag-form" onSubmit={handleAddTag}>
            <input
              type="text"
              placeholder="New tag name..."
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              maxLength={32}
            />
            <div ref={colorPickerRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className="color-picker-btn"
                style={{ backgroundColor: newTagColor }}
                onClick={() => setShowColorPicker(!showColorPicker)}
              />
              {showColorPicker && (
                <div className="color-picker-dropdown">
                  {TAG_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`color-option ${color === newTagColor ? 'selected' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => {
                        setNewTagColor(color);
                        setShowColorPicker(false);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
            <button
              type="submit"
              className="add-tag-btn"
              disabled={!newTagName.trim() || isAdding}
            >
              {isAdding ? (
                <CircleNotch size={18} className="spin" />
              ) : (
                <Plus size={18} />
              )}
            </button>
          </form>
        )}

        {error && (
          <div className="error-message" style={{ marginBottom: 'var(--space-3)' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="tags-loading">
            <CircleNotch size={20} />
            <span>Loading tags...</span>
          </div>
        ) : tags.length === 0 ? (
          <div className="tags-empty">
            <TagSimple size={48} weight="thin" />
            <p>No tags yet. Create one to organize your servers.</p>
          </div>
        ) : mode === 'filter' ? (
          <div className="tags-filter-mode">
            <span className="filter-label">Select tags to filter</span>
            <div className="filter-tags">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  className={`filter-tag ${selectedTagIds.includes(tag.id) ? 'active' : ''}`}
                  style={{
                    backgroundColor: tag.color || TAG_COLORS[0],
                    color: getContrastColor(tag.color || TAG_COLORS[0]),
                  }}
                  onClick={() => toggleTagFilter(tag.id)}
                >
                  {tag.name}
                  <span style={{ opacity: 0.7 }}>
                    ({tagCounts.get(tag.id) || 0})
                  </span>
                </button>
              ))}
              {selectedTagIds.length > 0 && (
                <button className="clear-filter-btn" onClick={clearFilter}>
                  Clear
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="tags-list">
            {tags.map((tag) =>
              editingId === tag.id ? (
                <div key={tag.id} className="tag-item">
                  <div className="tag-edit-form">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="color-picker-btn"
                      style={{
                        backgroundColor: editColor,
                        width: 24,
                        height: 24,
                      }}
                      onClick={() => {
                        const idx = TAG_COLORS.indexOf(editColor);
                        setEditColor(TAG_COLORS[(idx + 1) % TAG_COLORS.length]);
                      }}
                    />
                  </div>
                  <div className="tag-edit-actions">
                    <button className="save" onClick={handleSaveEdit}>
                      <Check size={16} />
                    </button>
                    <button className="cancel" onClick={handleCancelEdit}>
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <div key={tag.id} className="tag-item">
                  <div
                    className="tag-color"
                    style={{ backgroundColor: tag.color || TAG_COLORS[0] }}
                  />
                  <span className="tag-name">{tag.name}</span>
                  <span className="tag-count">{tagCounts.get(tag.id) || 0}</span>
                  <div className="tag-actions">
                    <button
                      className="tag-action-btn"
                      onClick={() => startEditing(tag)}
                    >
                      <PencilSimple size={14} />
                    </button>
                    <button
                      className="tag-action-btn delete"
                      onClick={() => handleDeleteTag(tag.id)}
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TagsPanel;
