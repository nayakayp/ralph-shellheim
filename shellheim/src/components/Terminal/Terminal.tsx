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
  onClose: () => void;
}

export default function Terminal({ sessionId, host, onClose }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnectSsh(sessionId);
    } catch (e) {
      console.error("Disconnect error:", e);
    }
    onClose();
  }, [sessionId, onClose]);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm
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

    xterm.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Handle terminal input
    xterm.onData((data) => {
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

    // Also trigger resize after a short delay (for layout settling)
    const resizeTimeout = setTimeout(handleResize, 100);

    // Listen for SSH data events
    let dataUnlisten: UnlistenFn;
    let closeUnlisten: UnlistenFn;

    const setupListeners = async () => {
      dataUnlisten = await listen<SshDataEvent>(`ssh-data-${sessionId}`, (event) => {
        if (xtermRef.current) {
          xtermRef.current.write(event.payload.data);
        }
      });

      closeUnlisten = await listen<SshCloseEvent>(`ssh-close-${sessionId}`, (event) => {
        if (xtermRef.current) {
          xtermRef.current.write(`\r\n\x1b[31m[Connection closed: ${event.payload.reason}]\x1b[0m\r\n`);
        }
        setTimeout(onClose, 2000);
      });
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
      window.removeEventListener("resize", handleResize);
      clearTimeout(resizeTimeout);
      if (dataUnlisten) dataUnlisten();
      if (closeUnlisten) closeUnlisten();
      xterm.dispose();
    };
  }, [sessionId, onClose]);

  return (
    <div className="terminal-container">
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
