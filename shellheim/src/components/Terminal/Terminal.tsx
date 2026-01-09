import { useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { sendSshData, resizeSshTerminal, disconnectSsh } from "../../lib/api";
import type { SshDataEvent, SshCloseEvent } from "../../types/ssh";
import "@xterm/xterm/css/xterm.css";
import "./Terminal.css";

interface TerminalProps {
  sessionId: string;
  host: string;
  isActive: boolean;
  initialBuffer?: string; // Buffer to restore (from hibernation)
  onClose: () => void;
}

export default function Terminal({ sessionId, host, isActive, initialBuffer, onClose }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isInitializedRef = useRef(false);
  const dataUnlistenRef = useRef<UnlistenFn | null>(null);
  const closeUnlistenRef = useRef<UnlistenFn | null>(null);

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnectSsh(sessionId);
    } catch (e) {
      console.error("Disconnect error:", e);
    }
    onClose();
  }, [sessionId, onClose]);

  // Initialize terminal only once
  useEffect(() => {
    console.log(`[Terminal] useEffect running for ${sessionId}, ref:`, !!terminalRef.current, "initialized:", isInitializedRef.current);
    if (!terminalRef.current || isInitializedRef.current) {
      console.log(`[Terminal] Skipping init - ref:`, !!terminalRef.current, "already initialized:", isInitializedRef.current);
      return;
    }
    isInitializedRef.current = true;
    
    // Track if this effect instance has been cleaned up
    let isCleanedUp = false;
    
    console.log(`[Terminal] Initializing xterm for ${sessionId}`);

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: "#1a1b26",
        foreground: "#a9b1d6",
        cursor: "#c0caf5",
        cursorAccent: "#1a1b26",
        selectionBackground: "#33467c",
        selectionForeground: "#c0caf5",
        black: "#15161e",
        red: "#f7768e",
        green: "#9ece6a",
        yellow: "#e0af68",
        blue: "#7aa2f7",
        magenta: "#bb9af7",
        cyan: "#7dcfff",
        white: "#a9b1d6",
        brightBlack: "#414868",
        brightRed: "#f7768e",
        brightGreen: "#9ece6a",
        brightYellow: "#e0af68",
        brightBlue: "#7aa2f7",
        brightMagenta: "#bb9af7",
        brightCyan: "#7dcfff",
        brightWhite: "#c0caf5",
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);

    console.log(`[Terminal] About to open xterm, terminalRef.current:`, terminalRef.current);
    console.log(`[Terminal] terminalRef.current children before open:`, terminalRef.current?.children.length);
    
    xterm.open(terminalRef.current);
    
    console.log(`[Terminal] terminalRef.current children after open:`, terminalRef.current?.children.length);
    console.log(`[Terminal] xterm.element:`, xterm.element);
    
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    console.log(`[Terminal] Xterm initialized for ${sessionId}, cols=${xterm.cols}, rows=${xterm.rows}`);

    // Restore terminal buffer from hibernation (if available)
    if (initialBuffer) {
      xterm.write(initialBuffer);
      xterm.write("\r\n\x1b[90m[Session restored from hibernation]\x1b[0m\r\n");
    }

    // Handle terminal input
    xterm.onData((data) => {
      console.log(`[Terminal] Sending data for session ${sessionId}:`, data.length, "chars");
      sendSshData({ session_id: sessionId, data }).catch((e) => {
        console.error("Failed to send data:", e);
      });
    });

    // Handle resize
    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit();
        const { cols, rows } = xtermRef.current;
        resizeSshTerminal({ session_id: sessionId, cols, rows }).catch((e) => {
          console.error("Failed to resize:", e);
        });
      }
    };

    window.addEventListener("resize", handleResize);

    // Listen for SSH data events
    // Clean up any existing listeners first (in case of re-mount)
    if (dataUnlistenRef.current) {
      dataUnlistenRef.current();
      dataUnlistenRef.current = null;
    }
    if (closeUnlistenRef.current) {
      closeUnlistenRef.current();
      closeUnlistenRef.current = null;
    }

    const setupListeners = async () => {
      console.log(`[Terminal] Setting up listeners for session: ${sessionId}`);
      
      const dataUnlisten = await listen<SshDataEvent>(`ssh-data-${sessionId}`, (event) => {
        console.log(`[Terminal] Received data for session ${sessionId}:`, event.payload.data.length, "chars");
        if (xtermRef.current && !isCleanedUp) {
          xtermRef.current.write(event.payload.data);
        }
      });
      
      // If cleanup happened while we were awaiting, immediately unlisten
      if (isCleanedUp) {
        dataUnlisten();
        return;
      }
      dataUnlistenRef.current = dataUnlisten;

      const closeUnlisten = await listen<SshCloseEvent>(`ssh-close-${sessionId}`, (event) => {
        console.log(`[Terminal] Session closed: ${sessionId}`, event.payload.reason);
        if (xtermRef.current && !isCleanedUp) {
          xtermRef.current.write(`\r\n\x1b[31m[Connection closed: ${event.payload.reason}]\x1b[0m\r\n`);
        }
        setTimeout(onClose, 2000);
      });
      
      // If cleanup happened while we were awaiting, immediately unlisten
      if (isCleanedUp) {
        closeUnlisten();
        return;
      }
      closeUnlistenRef.current = closeUnlisten;
      
      console.log(`[Terminal] Listeners set up for session: ${sessionId}`);
    };

    setupListeners();

    // Initial resize notification to backend
    setTimeout(() => {
      if (xtermRef.current) {
        const { cols, rows } = xtermRef.current;
        resizeSshTerminal({ session_id: sessionId, cols, rows }).catch(console.error);
      }
    }, 200);

    // Focus the terminal
    xterm.focus();

    return () => {
      console.log(`[Terminal] Cleaning up xterm for ${sessionId}`);
      isCleanedUp = true;
      window.removeEventListener("resize", handleResize);
      if (dataUnlistenRef.current) {
        dataUnlistenRef.current();
        dataUnlistenRef.current = null;
      }
      if (closeUnlistenRef.current) {
        closeUnlistenRef.current();
        closeUnlistenRef.current = null;
      }
      xterm.dispose();
      // Reset refs so StrictMode second pass can re-initialize
      xtermRef.current = null;
      fitAddonRef.current = null;
      isInitializedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]); // Only re-run if sessionId changes, not onClose (which is a new function on every render)

  // Handle visibility changes - fit and focus when becoming active
  useEffect(() => {
    if (isActive && xtermRef.current && fitAddonRef.current) {
      // Small delay to allow CSS transition to complete
      const timeout = setTimeout(() => {
        fitAddonRef.current?.fit();
        xtermRef.current?.focus();
        // Notify backend of new size
        if (xtermRef.current) {
          const { cols, rows } = xtermRef.current;
          resizeSshTerminal({ session_id: sessionId, cols, rows }).catch(console.error);
        }
      }, 50);
      return () => clearTimeout(timeout);
    }
  }, [isActive, sessionId]);

  return (
    <div className={`terminal-container ${isActive ? "active" : "hidden"}`}>
      <div className="terminal-header">
        <div className="terminal-title">
          <span className="terminal-icon">⬤</span>
          <span>{host}</span>
        </div>
        <button className="terminal-close-btn" onClick={handleDisconnect} title="Disconnect">
          ✕
        </button>
      </div>
      <div className="terminal-body" ref={terminalRef} />
    </div>
  );
}
