import { useState, useEffect, useCallback, useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import {
  X,
  FloppyDisk,
  ArrowsOutSimple,
  ArrowsInSimple,
  Circle,
} from '@phosphor-icons/react';
import { sftpReadFile, sftpWriteFile } from '../lib/api';
import './FileEditor.css';

interface FileEditorProps {
  sessionId: string;
  filePath: string;
  onClose: () => void;
  zIndex?: number;
}

// Map file extensions to Monaco language identifiers
function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    // JavaScript/TypeScript
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    mjs: 'javascript',
    cjs: 'javascript',
    // Web
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    // Data
    json: 'json',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'ini',
    // Shell
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    fish: 'shell',
    // Programming languages
    py: 'python',
    rb: 'ruby',
    php: 'php',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    go: 'go',
    rs: 'rust',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    // Config
    conf: 'ini',
    cfg: 'ini',
    ini: 'ini',
    env: 'shell',
    // Documentation
    md: 'markdown',
    markdown: 'markdown',
    rst: 'restructuredtext',
    // Database
    sql: 'sql',
    // Other
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    lua: 'lua',
    r: 'r',
    pl: 'perl',
    ex: 'elixir',
    exs: 'elixir',
    erl: 'erlang',
    hs: 'haskell',
    clj: 'clojure',
    scala: 'scala',
    vim: 'vim',
  };

  // Handle special filenames
  const filename = path.split('/').pop()?.toLowerCase() || '';
  if (filename === 'dockerfile') return 'dockerfile';
  if (filename === 'makefile') return 'makefile';
  if (filename.startsWith('.')) {
    // Hidden files like .bashrc, .zshrc, .gitignore
    if (filename.includes('rc') || filename.includes('profile')) return 'shell';
    if (filename === '.gitignore') return 'gitignore';
    if (filename === '.env') return 'shell';
  }

  return languageMap[ext] || 'plaintext';
}

export function FileEditor({ sessionId, filePath, onClose, zIndex = 10000 }: FileEditorProps) {
  const [content, setContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const editorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const hasChanges = content !== originalContent;
  const fileName = filePath.split('/').pop() || 'file';
  const language = getLanguageFromPath(filePath);

  // Load file content
  useEffect(() => {
    async function loadFile() {
      setLoading(true);
      setError(null);
      try {
        const data = await sftpReadFile({
          session_id: sessionId,
          path: filePath,
        });
        // Convert byte array to string
        const bytes = new Uint8Array(data);
        const text = new TextDecoder('utf-8').decode(bytes);
        setContent(text);
        setOriginalContent(text);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load file');
      } finally {
        setLoading(false);
      }
    }
    loadFile();
  }, [sessionId, filePath]);

  // Save file
  const handleSave = useCallback(async () => {
    if (!hasChanges || saving) return;
    
    setSaving(true);
    setError(null);
    try {
      const bytes = new TextEncoder().encode(content);
      await sftpWriteFile({
        session_id: sessionId,
        path: filePath,
        data: Array.from(bytes),
      });
      setOriginalContent(content);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save file');
    } finally {
      setSaving(false);
    }
  }, [content, hasChanges, saving, sessionId, filePath]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      if (e.key === 'Escape' && !hasChanges) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, hasChanges, onClose]);

  // Dragging
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMaximized) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  // Resizing
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMaximized) return;
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        });
      } else if (isResizing && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setSize({
          width: Math.max(400, e.clientX - rect.left),
          height: Math.max(300, e.clientY - rect.top),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, dragOffset]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.focus();
  };

  const toggleMaximize = () => {
    setIsMaximized(!isMaximized);
  };

  const handleClose = () => {
    if (hasChanges) {
      if (!confirm('You have unsaved changes. Close anyway?')) {
        return;
      }
    }
    onClose();
  };

  return (
    <div
      ref={containerRef}
      className={`file-editor ${isMaximized ? 'maximized' : ''}`}
      style={
        isMaximized
          ? { zIndex }
          : {
              zIndex,
              left: position.x,
              top: position.y,
              width: size.width,
              height: size.height,
            }
      }
    >
      {/* Header */}
      <div
        className="fe-header"
        onMouseDown={handleMouseDown}
        style={{ cursor: isMaximized ? 'default' : 'move' }}
      >
        <div className="fe-title">
          {hasChanges && <Circle className="fe-unsaved-indicator" weight="fill" />}
          <span className="fe-filename">{fileName}</span>
          <span className="fe-filepath">{filePath}</span>
        </div>
        <div className="fe-actions">
          <button
            className="fe-action-btn save-btn"
            onClick={handleSave}
            disabled={!hasChanges || saving}
            title="Save (Cmd+S)"
          >
            <FloppyDisk weight={hasChanges ? 'fill' : 'regular'} />
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            className="fe-action-btn"
            onClick={toggleMaximize}
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <ArrowsInSimple /> : <ArrowsOutSimple />}
          </button>
          <button
            className="fe-action-btn close-btn"
            onClick={handleClose}
            title="Close"
          >
            <X />
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="fe-body">
        {loading ? (
          <div className="fe-loading">
            <div className="fe-spinner" />
            <span>Loading file...</span>
          </div>
        ) : error ? (
          <div className="fe-error">
            <span>{error}</span>
            <button onClick={() => setError(null)}>Dismiss</button>
          </div>
        ) : (
          <Editor
            height="100%"
            language={language}
            value={content}
            onChange={(value) => setContent(value || '')}
            onMount={handleEditorMount}
            theme="vs-dark"
            options={{
              minimap: { enabled: true },
              fontSize: 13,
              fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace",
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              wordWrap: 'off',
              tabSize: 2,
              insertSpaces: true,
              renderWhitespace: 'selection',
              cursorBlinking: 'smooth',
              smoothScrolling: true,
              padding: { top: 8, bottom: 8 },
            }}
          />
        )}
      </div>

      {/* Status Bar */}
      <div className="fe-status-bar">
        <div className="fe-status-left">
          <span className="fe-language">{language}</span>
          {hasChanges && <span className="fe-modified">Modified</span>}
        </div>
        <div className="fe-status-right">
          <span>UTF-8</span>
        </div>
      </div>

      {/* Resize Handle */}
      {!isMaximized && (
        <div className="fe-resize-handle" onMouseDown={handleResizeMouseDown} />
      )}
    </div>
  );
}
