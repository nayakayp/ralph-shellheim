import { useState, useEffect, useCallback } from "react";
import { Code, X, Plus, MagnifyingGlass, Play, Lightning } from "@phosphor-icons/react";
import type { Script, CreateScriptRequest, UpdateScriptRequest } from "../types/script";
import type { Entry } from "../types/entry";
import type { Identity } from "../types/identity";
import { 
  listScripts, 
  createScript, 
  updateScript, 
  deleteScript, 
  listScriptCategories, 
  searchScripts,
  executeScript,
  listEntries,
  listIdentities
} from "../lib/api";
import "./ScriptsPanel.css";

interface ScriptsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// Interpreters dropdown options
const INTERPRETERS = ["bash", "sh", "zsh", "fish", "python3", "python", "perl", "ruby", "powershell"];

// Target OS dropdown options
const TARGET_OS_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "linux", label: "Linux" },
  { value: "ubuntu", label: "Ubuntu" },
  { value: "debian", label: "Debian" },
  { value: "centos", label: "CentOS" },
  { value: "fedora", label: "Fedora" },
  { value: "alpine", label: "Alpine" },
  { value: "macos", label: "macOS" },
  { value: "windows", label: "Windows" },
  { value: "proxmox", label: "Proxmox VE" },
];

export function ScriptsPanel({ isOpen, onClose }: ScriptsPanelProps) {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const [editingScript, setEditingScript] = useState<Script | undefined>();
  const [executingScript, setExecutingScript] = useState<Script | undefined>();
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Execution state
  const [entries, setEntries] = useState<Entry[]>([]);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [selectedIdentityId, setSelectedIdentityId] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<string | null>(null);

  const loadScripts = useCallback(async () => {
    try {
      setError("");
      setIsLoading(true);
      const [scriptsData, categoriesData] = await Promise.all([
        listScripts(),
        listScriptCategories(),
      ]);
      setScripts(scriptsData);
      setCategories(categoriesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scripts");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      loadScripts();
      return;
    }
    try {
      setIsLoading(true);
      const results = await searchScripts(query);
      setScripts(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsLoading(false);
    }
  }, [loadScripts]);

  useEffect(() => {
    if (isOpen) {
      loadScripts();
    }
  }, [isOpen, loadScripts]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      handleSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, handleSearch]);

  const handleAdd = () => {
    setEditingScript(undefined);
    setShowModal(true);
  };

  const handleEdit = (script: Script) => {
    setEditingScript(script);
    setShowModal(true);
  };

  const handleDelete = async (script: Script) => {
    if (!confirm(`Delete "${script.name}"? This cannot be undone.`)) return;

    try {
      await deleteScript(script.id);
      setScripts((prev) => prev.filter((s) => s.id !== script.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete script");
    }
  };

  const handleSubmit = async (request: CreateScriptRequest | UpdateScriptRequest) => {
    if (editingScript) {
      const updated = await updateScript(editingScript.id, request as UpdateScriptRequest);
      setScripts((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } else {
      const created = await createScript(request as CreateScriptRequest);
      setScripts((prev) => [...prev, created]);
    }
    setShowModal(false);
    // Refresh categories in case new one was added
    const cats = await listScriptCategories();
    setCategories(cats);
  };

  const handleExecuteClick = async (script: Script) => {
    setExecutingScript(script);
    setExecutionResult(null);
    setShowExecuteModal(true);
    
    // Load entries and identities
    try {
      const [entriesData, identitiesData] = await Promise.all([
        listEntries(),
        listIdentities(),
      ]);
      // Only show SSH-compatible entries
      const sshEntries = entriesData.filter(e => e.protocol === "ssh" || !e.protocol);
      setEntries(sshEntries);
      setIdentities(identitiesData);
      
      if (sshEntries.length > 0) {
        setSelectedEntryId(sshEntries[0].id);
      }
      if (identitiesData.length > 0) {
        setSelectedIdentityId(identitiesData[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load servers");
    }
  };

  const handleExecute = async () => {
    if (!executingScript || !selectedEntryId || !selectedIdentityId) return;
    
    setIsExecuting(true);
    setExecutionResult(null);
    
    try {
      const result = await executeScript({
        script_id: executingScript.id,
        entry_id: selectedEntryId,
        identity_id: selectedIdentityId,
      });
      
      const statusIcon = result.success ? "✓" : "✗";
      const resultText = `${statusIcon} Exit code: ${result.exit_code} (${result.duration_ms}ms)\n\n${result.output}`;
      setExecutionResult(resultText);
    } catch (err) {
      setExecutionResult(`Error: ${err instanceof Error ? err.message : "Execution failed"}`);
    } finally {
      setIsExecuting(false);
    }
  };

  // Filter by category
  const filteredScripts = selectedCategory
    ? scripts.filter((s) => s.category === selectedCategory)
    : scripts;

  if (!isOpen) return null;

  return (
    <div className="scripts-panel-overlay" onClick={onClose}>
      <div className="scripts-panel" onClick={(e) => e.stopPropagation()}>
        <div className="scripts-header">
          <div className="scripts-title">
            <Code size={20} weight="bold" />
            <span>Scripts</span>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="scripts-toolbar">
          <div className="search-box">
            <MagnifyingGlass size={16} />
            <input
              type="text"
              placeholder="Search scripts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="add-btn" onClick={handleAdd}>
            <Plus size={16} />
            <span>New Script</span>
          </button>
        </div>

        {categories.length > 0 && (
          <div className="category-tabs">
            <button
              className={`category-tab ${selectedCategory === null ? "active" : ""}`}
              onClick={() => setSelectedCategory(null)}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                className={`category-tab ${selectedCategory === cat ? "active" : ""}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        <div className="scripts-list">
          {isLoading ? (
            <div className="loading">Loading scripts...</div>
          ) : filteredScripts.length === 0 ? (
            <div className="empty-state">
              <Code size={48} />
              <p>No scripts yet</p>
              <span>Create a script to automate commands on your servers</span>
            </div>
          ) : (
            filteredScripts.map((script) => (
              <div key={script.id} className="script-card">
                <div className="script-info">
                  <div className="script-name">{script.name}</div>
                  {script.description && (
                    <div className="script-description">{script.description}</div>
                  )}
                  <div className="script-meta">
                    <span className="interpreter">{script.interpreter}</span>
                    <span className="os">{script.target_os}</span>
                    {script.run_as_sudo && <span className="sudo">sudo</span>}
                    {script.category && <span className="category">{script.category}</span>}
                  </div>
                </div>
                <div className="script-actions">
                  <button
                    className="execute-btn"
                    onClick={() => handleExecuteClick(script)}
                    title="Execute on server"
                  >
                    <Play size={16} weight="fill" />
                  </button>
                  <button className="edit-btn" onClick={() => handleEdit(script)}>
                    Edit
                  </button>
                  <button className="delete-btn" onClick={() => handleDelete(script)}>
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Script Editor Modal */}
      {showModal && (
        <ScriptModal
          script={editingScript}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
        />
      )}

      {/* Execute Modal */}
      {showExecuteModal && executingScript && (
        <div className="modal-backdrop" onClick={() => setShowExecuteModal(false)}>
          <div className="execute-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <Lightning size={20} weight="bold" />
              <span>Execute: {executingScript.name}</span>
              <button className="close-btn" onClick={() => setShowExecuteModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="execute-form">
              <div className="form-group">
                <label>Target Server</label>
                <select
                  value={selectedEntryId}
                  onChange={(e) => setSelectedEntryId(e.target.value)}
                >
                  {entries.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name} ({entry.host}:{entry.port || 22})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Identity (Credentials)</label>
                <select
                  value={selectedIdentityId}
                  onChange={(e) => setSelectedIdentityId(e.target.value)}
                >
                  {identities.map((identity) => (
                    <option key={identity.id} value={identity.id}>
                      {identity.name} ({identity.username})
                    </option>
                  ))}
                </select>
              </div>

              <div className="script-preview">
                <label>Script Content</label>
                <pre>{executingScript.content}</pre>
              </div>

              <button
                className="run-btn"
                onClick={handleExecute}
                disabled={isExecuting || !selectedEntryId || !selectedIdentityId}
              >
                {isExecuting ? (
                  <>Running...</>
                ) : (
                  <>
                    <Play size={16} weight="fill" />
                    Run Script
                  </>
                )}
              </button>

              {executionResult && (
                <div className="execution-result">
                  <label>Output</label>
                  <pre>{executionResult}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Script Editor Modal Component
interface ScriptModalProps {
  script?: Script;
  onClose: () => void;
  onSubmit: (request: CreateScriptRequest | UpdateScriptRequest) => Promise<void>;
}

function ScriptModal({ script, onClose, onSubmit }: ScriptModalProps) {
  const [name, setName] = useState(script?.name || "");
  const [content, setContent] = useState(script?.content || "");
  const [description, setDescription] = useState(script?.description || "");
  const [category, setCategory] = useState(script?.category || "");
  const [targetOs, setTargetOs] = useState(script?.target_os || "any");
  const [interpreter, setInterpreter] = useState(script?.interpreter || "bash");
  const [runAsSudo, setRunAsSudo] = useState(script?.run_as_sudo || false);
  const [timeoutSeconds, setTimeoutSeconds] = useState(script?.timeout_seconds || 60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!content.trim()) {
      setError("Script content is required");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        content: content.trim(),
        description: description.trim() || undefined,
        category: category.trim() || undefined,
        target_os: targetOs,
        interpreter,
        run_as_sudo: runAsSudo,
        timeout_seconds: timeoutSeconds,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save script");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="script-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <Code size={20} weight="bold" />
          <span>{script ? "Edit Script" : "New Script"}</span>
          <button className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-message">{error}</div>}

          <div className="form-row">
            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Script"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Category</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="System, Network, etc."
              />
            </div>
          </div>

          <div className="form-group">
            <label>Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this script do?"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Interpreter</label>
              <select value={interpreter} onChange={(e) => setInterpreter(e.target.value)}>
                {INTERPRETERS.map((int) => (
                  <option key={int} value={int}>
                    {int}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Target OS</label>
              <select value={targetOs} onChange={(e) => setTargetOs(e.target.value)}>
                {TARGET_OS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Timeout (sec)</label>
              <input
                type="number"
                value={timeoutSeconds}
                onChange={(e) => setTimeoutSeconds(parseInt(e.target.value) || 60)}
                min={1}
                max={3600}
              />
            </div>
          </div>

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={runAsSudo}
                onChange={(e) => setRunAsSudo(e.target.checked)}
              />
              Run as sudo
            </label>
          </div>

          <div className="form-group">
            <label>Script Content *</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="#!/bin/bash&#10;echo 'Hello World'"
              rows={12}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="save-btn" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : script ? "Update Script" : "Create Script"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
