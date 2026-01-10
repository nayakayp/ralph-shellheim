import { useState, useEffect } from "react";
import { Keyboard, X } from "@phosphor-icons/react";
import {
  Keymap,
  formatKeyBinding,
  ACTION_LABELS,
  MODIFIER_OPTIONS,
  KEY_OPTIONS,
  KeymapAction,
} from "../types/keymap";
import {
  listKeymaps,
  updateKeymap,
  resetKeymapsToDefaults,
  checkKeymapConflict,
} from "../lib/api";
import "./KeybindsPanel.css";

interface KeybindsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function KeybindsPanel({ isOpen, onClose }: KeybindsPanelProps) {
  const [keymaps, setKeymaps] = useState<Keymap[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editKey, setEditKey] = useState("");
  const [editModifiers, setEditModifiers] = useState("");
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load keymaps on open
  useEffect(() => {
    if (isOpen) {
      loadKeymaps();
    }
  }, [isOpen]);

  const loadKeymaps = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listKeymaps();
      setKeymaps(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load keybinds");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (keymap: Keymap) => {
    setEditingId(keymap.id);
    setEditKey(keymap.key);
    setEditModifiers(keymap.modifiers);
    setConflictWarning(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditKey("");
    setEditModifiers("");
    setConflictWarning(null);
  };

  const handleCheckConflict = async () => {
    if (!editingId) return;

    try {
      const conflict = await checkKeymapConflict(editKey, editModifiers, editingId);
      if (conflict) {
        setConflictWarning(
          `Conflicts with "${ACTION_LABELS[conflict.action as KeymapAction] || conflict.action}"`
        );
      } else {
        setConflictWarning(null);
      }
    } catch {
      // Ignore conflict check errors
    }
  };

  // Check for conflicts when edit values change
  useEffect(() => {
    if (editingId && editKey) {
      handleCheckConflict();
    }
  }, [editKey, editModifiers]);

  const handleSave = async () => {
    if (!editingId) return;

    setSaving(true);
    setError("");
    try {
      const updated = await updateKeymap(editingId, {
        key: editKey,
        modifiers: editModifiers,
      });
      setKeymaps((prev) =>
        prev.map((k) => (k.id === updated.id ? updated : k))
      );
      handleCancelEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save keybind");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (keymap: Keymap) => {
    try {
      const updated = await updateKeymap(keymap.id, {
        enabled: !keymap.enabled,
      });
      setKeymaps((prev) =>
        prev.map((k) => (k.id === updated.id ? updated : k))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to toggle keybind");
    }
  };

  const handleResetDefaults = async () => {
    if (!confirm("Reset all keybinds to defaults? This cannot be undone.")) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await resetKeymapsToDefaults();
      setKeymaps(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset keybinds");
    } finally {
      setLoading(false);
    }
  };

  // Capture key press for recording new shortcut
  const handleKeyCapture = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();

    // Ignore modifier-only presses
    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
      return;
    }

    // Build modifiers string
    const mods: string[] = [];
    if (e.ctrlKey) mods.push("ctrl");
    if (e.shiftKey) mods.push("shift");
    if (e.altKey) mods.push("alt");
    if (e.metaKey) mods.push("meta");

    setEditModifiers(mods.join("+"));
    setEditKey(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  };

  if (!isOpen) return null;

  return (
    <div className="keybinds-panel-overlay" onClick={onClose}>
      <div className="keybinds-panel" onClick={(e) => e.stopPropagation()}>
        <div className="keybinds-header">
          <h2><Keyboard size={20} />Keyboard Shortcuts</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {error && <div className="keybinds-error">{error}</div>}

        <div className="keybinds-content">
          {loading ? (
            <div className="keybinds-loading">Loading shortcuts...</div>
          ) : (
            <>
              <div className="keybinds-list">
                {keymaps.map((keymap) => (
                  <div
                    key={keymap.id}
                    className={`keybind-item ${!keymap.enabled ? "disabled" : ""} ${
                      editingId === keymap.id ? "editing" : ""
                    }`}
                  >
                    <div className="keybind-info">
                      <span className="keybind-action">
                        {ACTION_LABELS[keymap.action as KeymapAction] || keymap.action}
                      </span>
                      <span className="keybind-description">
                        {keymap.description}
                      </span>
                    </div>

                    {editingId === keymap.id ? (
                      <div className="keybind-edit">
                        <div className="keybind-capture-row">
                          <input
                            type="text"
                            className="keybind-capture"
                            placeholder="Press keys..."
                            value={formatKeyBinding({ ...keymap, key: editKey, modifiers: editModifiers })}
                            onKeyDown={handleKeyCapture}
                            readOnly
                            autoFocus
                          />
                          <span className="keybind-or">or</span>
                          <select
                            className="keybind-modifier-select"
                            value={editModifiers}
                            onChange={(e) => setEditModifiers(e.target.value)}
                          >
                            {MODIFIER_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <select
                            className="keybind-key-select"
                            value={editKey}
                            onChange={(e) => setEditKey(e.target.value)}
                          >
                            <option value="">Key</option>
                            {KEY_OPTIONS.map((k) => (
                              <option key={k} value={k}>
                                {k.toUpperCase()}
                              </option>
                            ))}
                          </select>
                        </div>
                        {conflictWarning && (
                          <div className="keybind-conflict">{conflictWarning}</div>
                        )}
                        <div className="keybind-edit-actions">
                          <button
                            className="keybind-save-btn"
                            onClick={handleSave}
                            disabled={saving || !editKey}
                          >
                            {saving ? "Saving..." : "Save"}
                          </button>
                          <button
                            className="keybind-cancel-btn"
                            onClick={handleCancelEdit}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="keybind-controls">
                        <kbd className="keybind-keys">
                          {formatKeyBinding(keymap)}
                        </kbd>
                        <button
                          className="keybind-edit-btn"
                          onClick={() => handleEdit(keymap)}
                          title="Edit shortcut"
                        >
                          ✏️
                        </button>
                        <button
                          className={`keybind-toggle-btn ${keymap.enabled ? "enabled" : ""}`}
                          onClick={() => handleToggleEnabled(keymap)}
                          title={keymap.enabled ? "Disable" : "Enable"}
                        >
                          {keymap.enabled ? "✓" : "○"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="keybinds-footer">
                <button
                  className="keybinds-reset-btn"
                  onClick={handleResetDefaults}
                >
                  Reset to Defaults
                </button>
                <div className="keybinds-hint">
                  <span>💡</span>
                  <span>Click edit and press keys to capture, or use dropdowns</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
