import { useState, useEffect, useRef } from "react";
import { DownloadSimple, UploadSimple, X, Check, Warning, CircleNotch, Archive, FileText } from "@phosphor-icons/react";
import { exportConfig, importConfig, getExportStats } from "../lib/api";
import type { ExportData, ExportStats, ImportOptions, ImportResult } from "../types/backup";
import { DEFAULT_IMPORT_OPTIONS } from "../types/backup";
import "./BackupPanel.css";

interface BackupPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

export function BackupPanel({ isOpen, onClose, onImportComplete }: BackupPanelProps) {
  const [stats, setStats] = useState<ExportStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Import state
  const [importData, setImportData] = useState<ExportData | null>(null);
  const [importOptions, setImportOptions] = useState<ImportOptions>(DEFAULT_IMPORT_OPTIONS);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadStats();
      // Reset state
      setImportData(null);
      setImportResult(null);
      setError(null);
      setSuccess(null);
    }
  }, [isOpen]);

  const loadStats = async () => {
    try {
      const data = await getExportStats();
      setStats(data);
    } catch (err) {
      console.error("Failed to load export stats:", err);
    }
  };

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const data = await exportConfig();
      
      // Create and download JSON file
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shellheim-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setSuccess(`Exported ${data.data.entries.length} servers, ${data.data.folders.length} folders, ${data.data.identities.length} identities, ${data.data.tags.length} tags, ${data.data.snippets.length} snippets`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setError(null);
    setSuccess(null);
    setImportResult(null);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target?.result as string;
        const data = JSON.parse(json) as ExportData;
        
        // Validate structure
        if (!data.version || !data.app || !data.data) {
          throw new Error("Invalid backup file format");
        }
        
        if (data.app !== "Shellheim") {
          throw new Error("This file is not a Shellheim backup");
        }
        
        setImportData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse backup file");
      }
    };
    reader.readAsText(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImport = async () => {
    if (!importData) return;
    
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const result = await importConfig(importData, importOptions);
      setImportResult(result);
      
      if (result.success) {
        setSuccess(`Import complete! ${result.entries_imported} servers, ${result.folders_imported} folders, ${result.identities_imported} identities, ${result.tags_imported} tags, ${result.snippets_imported} snippets imported.`);
        onImportComplete?.();
      }
      
      setImportData(null);
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const toggleOption = (key: keyof ImportOptions) => {
    if (key === "merge") {
      setImportOptions(prev => ({ ...prev, merge: !prev.merge }));
    } else {
      setImportOptions(prev => ({ ...prev, [key]: !prev[key] }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="backup-panel-overlay" onClick={onClose}>
      <div className="backup-panel" onClick={(e) => e.stopPropagation()}>
        <div className="backup-panel-header">
          <div className="backup-panel-title">
            <Archive size={20} />
            <h2>Backup & Restore</h2>
          </div>
          <button className="backup-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="backup-panel-content">
          {/* Status Messages */}
          {error && (
            <div className="backup-message error">
              <Warning size={16} />
              <span>{error}</span>
            </div>
          )}
          
          {success && (
            <div className="backup-message success">
              <Check size={16} />
              <span>{success}</span>
            </div>
          )}

          {/* Export Section */}
          <section className="backup-section">
            <h3>Export Configuration</h3>
            <p className="backup-description">
              Download all your servers, folders, identities, tags, and snippets as a JSON file.
              <br />
              <em>Note: Passwords and SSH keys are NOT included for security.</em>
            </p>
            
            {stats && (
              <div className="backup-stats">
                <div className="backup-stat">
                  <span className="stat-value">{stats.entries}</span>
                  <span className="stat-label">Servers</span>
                </div>
                <div className="backup-stat">
                  <span className="stat-value">{stats.folders}</span>
                  <span className="stat-label">Folders</span>
                </div>
                <div className="backup-stat">
                  <span className="stat-value">{stats.identities}</span>
                  <span className="stat-label">Identities</span>
                </div>
                <div className="backup-stat">
                  <span className="stat-value">{stats.tags}</span>
                  <span className="stat-label">Tags</span>
                </div>
                <div className="backup-stat">
                  <span className="stat-value">{stats.snippets}</span>
                  <span className="stat-label">Snippets</span>
                </div>
              </div>
            )}
            
            <button 
              className="backup-action-btn export-btn" 
              onClick={handleExport}
              disabled={loading}
            >
              {loading ? <CircleNotch size={18} className="spin" /> : <DownloadSimple size={18} />}
              <span>Export Backup</span>
            </button>
          </section>

          <div className="backup-divider" />

          {/* Import Section */}
          <section className="backup-section">
            <h3>Import Configuration</h3>
            <p className="backup-description">
              Restore from a Shellheim backup file. You can choose to merge with existing data or replace it.
            </p>
            
            {!importData ? (
              <>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json"
                  onChange={handleFileSelect}
                  style={{ display: "none" }}
                />
                <button 
                  className="backup-action-btn import-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                >
                  <UploadSimple size={18} />
                  <span>Select Backup File</span>
                </button>
              </>
            ) : (
              <div className="import-preview">
                <div className="import-file-info">
                  <FileText size={20} />
                  <div>
                    <span className="import-file-name">Backup from {new Date(importData.exported_at).toLocaleDateString()}</span>
                    <span className="import-file-version">Version {importData.version}</span>
                  </div>
                </div>
                
                <div className="import-preview-stats">
                  <span>{importData.data.entries.length} servers</span>
                  <span>{importData.data.folders.length} folders</span>
                  <span>{importData.data.identities.length} identities</span>
                  <span>{importData.data.tags.length} tags</span>
                  <span>{importData.data.snippets.length} snippets</span>
                </div>
                
                <div className="import-options">
                  <label className="import-option">
                    <input 
                      type="checkbox" 
                      checked={importOptions.merge} 
                      onChange={() => toggleOption("merge")}
                    />
                    <span>Merge with existing data</span>
                    <small>{importOptions.merge ? "(Add to existing)" : "(Replace all)"}</small>
                  </label>
                  
                  <div className="import-option-group">
                    <label className="import-option">
                      <input 
                        type="checkbox" 
                        checked={importOptions.import_folders} 
                        onChange={() => toggleOption("import_folders")}
                      />
                      <span>Import folders</span>
                    </label>
                    <label className="import-option">
                      <input 
                        type="checkbox" 
                        checked={importOptions.import_entries} 
                        onChange={() => toggleOption("import_entries")}
                      />
                      <span>Import servers</span>
                    </label>
                    <label className="import-option">
                      <input 
                        type="checkbox" 
                        checked={importOptions.import_identities} 
                        onChange={() => toggleOption("import_identities")}
                      />
                      <span>Import identities</span>
                    </label>
                    <label className="import-option">
                      <input 
                        type="checkbox" 
                        checked={importOptions.import_tags} 
                        onChange={() => toggleOption("import_tags")}
                      />
                      <span>Import tags</span>
                    </label>
                    <label className="import-option">
                      <input 
                        type="checkbox" 
                        checked={importOptions.import_snippets} 
                        onChange={() => toggleOption("import_snippets")}
                      />
                      <span>Import snippets</span>
                    </label>
                  </div>
                </div>
                
                <div className="import-actions">
                  <button 
                    className="backup-action-btn cancel-btn"
                    onClick={() => setImportData(null)}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button 
                    className="backup-action-btn confirm-btn"
                    onClick={handleImport}
                    disabled={loading}
                  >
                    {loading ? <CircleNotch size={18} className="spin" /> : <Check size={18} />}
                    <span>Import</span>
                  </button>
                </div>
              </div>
            )}
            
            {importResult && importResult.errors.length > 0 && (
              <div className="import-errors">
                <h4>Import Warnings</h4>
                <ul>
                  {importResult.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
