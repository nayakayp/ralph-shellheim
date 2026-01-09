import { useState, useEffect, useCallback } from "react";
import { 
  ClipboardText, 
  X, 
  Funnel, 
  Trash, 
  CaretLeft,
  CaretRight,
  MagnifyingGlass,
  Calendar
} from "@phosphor-icons/react";
import type { AuditLog, AuditLogFilter } from "../types/audit";
import { 
  AuditActionLabels, 
  ResourceTypeIcons, 
  getActionCategory, 
  formatRelativeTime 
} from "../types/audit";
import { 
  listAuditLogs, 
  getAuditLogCount, 
  getAuditActionTypes, 
  clearAuditLogs,
  deleteOldAuditLogs 
} from "../lib/api";
import "./AuditPanel.css";

interface AuditPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const PAGE_SIZE = 50;

export function AuditPanel({ isOpen, onClose }: AuditPanelProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  
  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [actionTypes, setActionTypes] = useState<string[]>([]);
  const [filter, setFilter] = useState<AuditLogFilter>({
    limit: PAGE_SIZE,
    offset: 0,
  });
  const [selectedAction, setSelectedAction] = useState<string>("");
  const [selectedResource, setSelectedResource] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const loadLogs = useCallback(async () => {
    try {
      setError("");
      setIsLoading(true);
      
      const appliedFilter: AuditLogFilter = {
        ...filter,
        offset: page * PAGE_SIZE,
        action: selectedAction || undefined,
        resource_type: selectedResource || undefined,
        from_date: fromDate ? `${fromDate}T00:00:00` : undefined,
        to_date: toDate ? `${toDate}T23:59:59` : undefined,
      };
      
      const [data, count] = await Promise.all([
        listAuditLogs(appliedFilter),
        getAuditLogCount(appliedFilter),
      ]);
      
      setLogs(data);
      setTotalCount(count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit logs");
    } finally {
      setIsLoading(false);
    }
  }, [filter, page, selectedAction, selectedResource, fromDate, toDate]);

  const loadActionTypes = useCallback(async () => {
    try {
      const types = await getAuditActionTypes();
      setActionTypes(types);
    } catch (err) {
      console.error("Failed to load action types:", err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadLogs();
      loadActionTypes();
    }
  }, [isOpen, loadLogs, loadActionTypes]);

  const handleClearAll = async () => {
    if (!confirm("Clear all audit logs? This cannot be undone.")) return;

    try {
      const deleted = await clearAuditLogs();
      alert(`Deleted ${deleted} audit logs`);
      loadLogs();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to clear logs");
    }
  };

  const handleDeleteOld = async () => {
    const days = prompt("Delete logs older than how many days?", "90");
    if (!days) return;
    
    const daysNum = parseInt(days, 10);
    if (isNaN(daysNum) || daysNum < 1) {
      alert("Please enter a valid number of days");
      return;
    }

    try {
      const deleted = await deleteOldAuditLogs(daysNum);
      alert(`Deleted ${deleted} audit logs older than ${daysNum} days`);
      loadLogs();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete old logs");
    }
  };

  const handleApplyFilters = () => {
    setPage(0);
    loadLogs();
  };

  const handleClearFilters = () => {
    setSelectedAction("");
    setSelectedResource("");
    setFromDate("");
    setToDate("");
    setPage(0);
    setFilter({ limit: PAGE_SIZE, offset: 0 });
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (!isOpen) return null;

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="audit-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <div className="panel-title">
            <ClipboardText size={22} />
            <h2>Audit Log</h2>
            <span className="count-badge">{totalCount}</span>
          </div>
          <button className="panel-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="panel-toolbar">
          <div className="toolbar-left">
            <button 
              className={`toolbar-btn ${showFilters ? 'active' : ''}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Funnel size={16} />
              Filters
            </button>
          </div>
          <div className="toolbar-right">
            <button 
              className="toolbar-btn danger"
              onClick={handleDeleteOld}
              title="Delete old logs"
            >
              <Calendar size={16} />
              Cleanup
            </button>
            <button 
              className="toolbar-btn danger"
              onClick={handleClearAll}
              title="Clear all logs"
            >
              <Trash size={16} />
              Clear All
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="filter-bar">
            <div className="filter-group">
              <label>Action</label>
              <select 
                value={selectedAction} 
                onChange={(e) => setSelectedAction(e.target.value)}
              >
                <option value="">All Actions</option>
                {actionTypes.map((type) => (
                  <option key={type} value={type}>
                    {AuditActionLabels[type] || type}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="filter-group">
              <label>Resource</label>
              <select 
                value={selectedResource} 
                onChange={(e) => setSelectedResource(e.target.value)}
              >
                <option value="">All Resources</option>
                <option value="entry">Servers</option>
                <option value="identity">Identities</option>
                <option value="folder">Folders</option>
                <option value="session">Sessions</option>
                <option value="recording">Recordings</option>
                <option value="snippet">Snippets</option>
                <option value="tunnel">Tunnels</option>
                <option value="file">Files</option>
              </select>
            </div>
            
            <div className="filter-group">
              <label>From</label>
              <input 
                type="date" 
                value={fromDate} 
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            
            <div className="filter-group">
              <label>To</label>
              <input 
                type="date" 
                value={toDate} 
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            
            <div className="filter-actions">
              <button className="filter-btn apply" onClick={handleApplyFilters}>
                <MagnifyingGlass size={14} />
                Apply
              </button>
              <button className="filter-btn clear" onClick={handleClearFilters}>
                Clear
              </button>
            </div>
          </div>
        )}

        <div className="panel-content">
          {error && <div className="panel-error">{error}</div>}

          {isLoading ? (
            <div className="panel-loading">
              <div className="spinner" />
              <p>Loading audit logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="panel-empty">
              <ClipboardText size={48} weight="light" />
              <h3>No audit logs</h3>
              <p>
                {selectedAction || selectedResource || fromDate || toDate
                  ? "No logs match your filter criteria"
                  : "Activity will be recorded here as you use the app"}
              </p>
            </div>
          ) : (
            <div className="audit-list">
              {logs.map((log) => (
                <div 
                  key={log.id} 
                  className={`audit-item category-${getActionCategory(log.action)}`}
                >
                  <div className="audit-icon">
                    {log.resource_type 
                      ? ResourceTypeIcons[log.resource_type] || "📋"
                      : "📋"}
                  </div>
                  <div className="audit-info">
                    <div className="audit-action">
                      <span className="action-label">
                        {AuditActionLabels[log.action] || log.action}
                      </span>
                      {log.resource_name && (
                        <span className="resource-name">{log.resource_name}</span>
                      )}
                    </div>
                    <div className="audit-meta">
                      <span className="audit-time">
                        {formatRelativeTime(log.created_at)}
                      </span>
                      {log.resource_type && (
                        <span className="audit-resource-type">
                          {log.resource_type}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="panel-pagination">
            <button
              className="page-btn"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
            >
              <CaretLeft size={16} />
            </button>
            <span className="page-info">
              Page {page + 1} of {totalPages}
            </span>
            <button
              className="page-btn"
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
            >
              <CaretRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
