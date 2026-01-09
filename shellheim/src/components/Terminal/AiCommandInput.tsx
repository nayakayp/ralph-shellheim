import { useState, useRef, useEffect, useCallback } from "react";
import { generateCommand } from "../../lib/api";
import "./AiCommandInput.css";

interface AiCommandInputProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertCommand: (command: string) => void;
  serverContext?: {
    os?: string;
    shell?: string;
    hostname?: string;
  };
}

interface GeneratedResult {
  command: string;
  explanation: string;
}

export default function AiCommandInput({
  isOpen,
  onClose,
  onInsertCommand,
  serverContext,
}: AiCommandInputProps) {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Reset state when closed
  useEffect(() => {
    if (!isOpen) {
      setPrompt("");
      setResult(null);
      setError(null);
      setIsLoading(false);
      setCopied(false);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await generateCommand({
        prompt: prompt.trim(),
        server_context: serverContext,
      });

      setResult({
        command: response.command,
        explanation: response.explanation,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to generate command";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [prompt, isLoading, serverContext]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInsert = () => {
    if (result?.command) {
      onInsertCommand(result.command);
      onClose();
    }
  };

  const handleCopy = async () => {
    if (result?.command) {
      try {
        await navigator.clipboard.writeText(result.command);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="ai-command-overlay" onClick={handleOverlayClick}>
      <div className="ai-command-panel">
        {/* Header */}
        <div className="ai-command-header">
          <div className="ai-command-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            AI Command Generator
          </div>
          <button
            className="ai-command-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="ai-command-body">
          {/* Input */}
          <div className="ai-command-input-wrapper">
            <input
              ref={inputRef}
              type="text"
              className="ai-command-input"
              placeholder="Describe what you want to do..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
            <button
              className="ai-command-submit"
              onClick={handleSubmit}
              disabled={!prompt.trim() || isLoading}
            >
              {isLoading ? (
                <>
                  <span className="ai-command-spinner" style={{ width: 14, height: 14 }} />
                </>
              ) : (
                <>Generate</>
              )}
            </button>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="ai-command-loading">
              <div className="ai-command-spinner" />
              <span>Generating command...</span>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="ai-command-error">
              <span className="ai-command-error-icon">⚠</span>
              <span className="ai-command-error-text">{error}</span>
            </div>
          )}

          {/* Result */}
          {result && !isLoading && (
            <div className="ai-command-result">
              <div className="ai-command-code-label">
                <span>⚡</span>
                Generated Command
              </div>
              <div className="ai-command-code">{result.command}</div>

              {result.explanation && (
                <div className="ai-command-explanation">
                  <span className="ai-command-explanation-label">Explanation</span>
                  {result.explanation}
                </div>
              )}

              <div className="ai-command-actions">
                <button
                  className="ai-command-btn ai-command-btn--insert"
                  onClick={handleInsert}
                >
                  ⏎ Insert
                </button>
                <button
                  className="ai-command-btn ai-command-btn--copy"
                  onClick={handleCopy}
                >
                  {copied ? "✓ Copied!" : "📋 Copy"}
                </button>
                <button
                  className="ai-command-btn ai-command-btn--cancel"
                  onClick={onClose}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Keyboard hint */}
          {!result && !isLoading && (
            <div className="ai-command-hint">
              <span>Press</span>
              <kbd className="ai-command-kbd">Enter</kbd>
              <span>to generate •</span>
              <kbd className="ai-command-kbd">Esc</kbd>
              <span>to close</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
