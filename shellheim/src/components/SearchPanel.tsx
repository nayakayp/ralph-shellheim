import { useState, useEffect, useCallback } from 'react';
import {
  MagnifyingGlass,
  X,
  FolderOpen,
  File,
  ArrowRight,
} from '@phosphor-icons/react';
import type { FileEntry, SearchResult } from '../types/sftp';
import { formatFileSize, getFileIcon } from '../types/sftp';
import { sftpSearchFiles } from '../lib/api';
import './SearchPanel.css';

interface SearchPanelProps {
  sessionId: string;
  currentPath: string;
  onNavigate: (path: string) => void;
  onClose: () => void;
}

export function SearchPanel({ sessionId, currentPath, onNavigate, onClose }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [searchPath, setSearchPath] = useState(currentPath);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Debounced search
  const search = useCallback(async (pattern: string, basePath: string) => {
    if (!pattern.trim()) {
      setResults(null);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const result = await sftpSearchFiles({
        session_id: sessionId,
        base_path: basePath,
        pattern: pattern.trim(),
        max_results: 100,
      });
      setResults(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Debounce search input
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query.trim()) {
        search(query, searchPath);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, searchPath, search]);

  // Handle result click
  const handleResultClick = (entry: FileEntry) => {
    if (entry.is_dir) {
      onNavigate(entry.path);
    } else {
      // Navigate to parent directory and possibly select file
      const parentPath = entry.path.split('/').slice(0, -1).join('/') || '/';
      onNavigate(parentPath);
    }
    onClose();
  };

  // Format path for display (relative to search base)
  const formatPath = (fullPath: string) => {
    if (fullPath.startsWith(searchPath)) {
      const relative = fullPath.slice(searchPath.length);
      return relative.startsWith('/') ? relative : '/' + relative;
    }
    return fullPath;
  };

  return (
    <div className="search-panel">
      <div className="search-panel-header">
        <div className="search-panel-title">
          <MagnifyingGlass size={20} weight="bold" />
          <h3>Search Files</h3>
        </div>
        <button className="search-panel-close" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="search-panel-form">
        <div className="search-input-wrapper">
          <MagnifyingGlass size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search files and folders..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {query && (
            <button 
              className="search-clear"
              onClick={() => {
                setQuery('');
                setResults(null);
                setHasSearched(false);
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="search-path-wrapper">
          <FolderOpen size={16} />
          <input
            type="text"
            placeholder="Search in path..."
            value={searchPath}
            onChange={(e) => setSearchPath(e.target.value)}
          />
          <button 
            className="use-current-path"
            onClick={() => setSearchPath(currentPath)}
            title="Use current directory"
          >
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <div className="search-panel-content">
        {loading && (
          <div className="search-loading">
            <div className="spinner" />
            <p>Searching...</p>
          </div>
        )}

        {error && (
          <div className="search-error">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && results && results.entries.length > 0 && (
          <>
            <div className="search-results-header">
              <span>{results.total_found} result{results.total_found !== 1 ? 's' : ''}</span>
              <span className="search-pattern">for "{results.pattern}"</span>
            </div>
            <div className="search-results">
              {results.entries.map((entry) => (
                <div
                  key={entry.path}
                  className="search-result-item"
                  onClick={() => handleResultClick(entry)}
                >
                  <span className="result-icon">
                    {getFileIcon(entry.name, entry.is_dir)}
                  </span>
                  <div className="result-info">
                    <span className="result-name">{entry.name}</span>
                    <span className="result-path">{formatPath(entry.path)}</span>
                  </div>
                  <span className="result-size">
                    {entry.is_dir ? (
                      <FolderOpen size={14} />
                    ) : (
                      formatFileSize(entry.size)
                    )}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {!loading && !error && hasSearched && results && results.entries.length === 0 && (
          <div className="search-empty">
            <File size={48} weight="thin" />
            <p>No files found matching "{query}"</p>
          </div>
        )}

        {!loading && !error && !hasSearched && (
          <div className="search-hint">
            <MagnifyingGlass size={48} weight="thin" />
            <p>Enter a search term to find files</p>
            <span>Searches file and folder names recursively</span>
          </div>
        )}
      </div>
    </div>
  );
}
