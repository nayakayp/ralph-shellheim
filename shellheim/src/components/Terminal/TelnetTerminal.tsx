import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { sendTelnetData, resizeTelnetTerminal, disconnectTelnet } from "../../lib/api";
import type { TelnetDataEvent, TelnetCloseEvent } from "../../types/telnet";
import "@xterm/xterm/css/xterm.css";
import "./Terminal.css";

interface TelnetTerminalProps {
  sessionId: string;
  host: string;
  isActive: boolean;
  onClose: () => void;
}

export default function TelnetTerminal({ sessionId, host: _host, isActive, onClose }: TelnetTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isInitializedRef = useRef(false);
  const dataUnlistenRef = useRef<UnlistenFn | null>(null);
  const closeUnlistenRef = useRef<UnlistenFn | null>(null);

  void disconnectTelnet; // Suppress unused import warning

  // Initialize terminal only once
  useEffect(() => {
    console.log(`[TelnetTerminal] useEffect running for ${sessionId}, ref:`, !!terminalRef.current, "initialized:", isInitializedRef.current);
    if (!terminalRef.current || isInitializedRef.current) {
      console.log(`[TelnetTerminal] Skipping init - ref:`, !!terminalRef.current, "already initialized:", isInitializedRef.current);
      return;
    }
    isInitializedRef.current = true;
    
    let isCleanedUp = false;
    
    console.log(`[TelnetTerminal] Initializing xterm for ${sessionId}`);

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

    console.log(`[TelnetTerminal] About to open xterm, terminalRef.current:`, terminalRef.current);
    xterm.open(terminalRef.current);
    console.log(`[TelnetTerminal] xterm opened`);

    try {
      fitAddon.fit();
    } catch {
      console.warn("[TelnetTerminal] Initial fit failed (container may not be visible)");
    }

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Send initial terminal size
    const { cols, rows } = xterm;
    resizeTelnetTerminal({ session_id: sessionId, cols, rows }).catch((err) => {
      console.error("[TelnetTerminal] Initial resize error:", err);
    });

    // Handle user input - send to backend
    const inputDisposable = xterm.onData((data) => {
      console.log(`[TelnetTerminal] User typed, sending ${data.length} chars for ${sessionId}`);
      sendTelnetData({ session_id: sessionId, data }).catch((err) => {
        console.error("[TelnetTerminal] Send data error:", err);
      });
    });

    // Listen for data from Telnet connection
    const setupDataListener = async () => {
      console.log(`[TelnetTerminal] Setting up data listener for telnet-data-${sessionId}`);
      try {
        const unlisten = await listen<TelnetDataEvent>(`telnet-data-${sessionId}`, (event) => {
          if (isCleanedUp) {
            console.log(`[TelnetTerminal] Ignoring data event - already cleaned up`);
            return;
          }
          console.log(`[TelnetTerminal] Received data for ${sessionId}, length: ${event.payload.data.length}`);
          if (xtermRef.current) {
            xtermRef.current.write(event.payload.data);
          }
        });
        if (!isCleanedUp) {
          dataUnlistenRef.current = unlisten;
          console.log(`[TelnetTerminal] Data listener registered for ${sessionId}`);
        } else {
          unlisten();
        }
      } catch (err) {
        console.error(`[TelnetTerminal] Failed to setup data listener:`, err);
      }
    };

    // Listen for connection close
    const setupCloseListener = async () => {
      console.log(`[TelnetTerminal] Setting up close listener for telnet-close-${sessionId}`);
      try {
        const unlisten = await listen<TelnetCloseEvent>(`telnet-close-${sessionId}`, (event) => {
          if (isCleanedUp) return;
          console.log(`[TelnetTerminal] Connection closed for ${sessionId}: ${event.payload.reason}`);
          if (xtermRef.current) {
            xtermRef.current.write(`\r\n\x1b[31m[Telnet disconnected: ${event.payload.reason}]\x1b[0m\r\n`);
          }
          onClose();
        });
        if (!isCleanedUp) {
          closeUnlistenRef.current = unlisten;
        } else {
          unlisten();
        }
      } catch (err) {
        console.error(`[TelnetTerminal] Failed to setup close listener:`, err);
      }
    };

    setupDataListener();
    setupCloseListener();

    // Cleanup
    return () => {
      isCleanedUp = true;
      inputDisposable.dispose();
      
      if (dataUnlistenRef.current) {
        dataUnlistenRef.current();
        dataUnlistenRef.current = null;
      }
      if (closeUnlistenRef.current) {
        closeUnlistenRef.current();
        closeUnlistenRef.current = null;
      }

      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId, onClose]);

  // Re-fit and focus when becoming active
  useEffect(() => {
    if (isActive && xtermRef.current && fitAddonRef.current) {
      const timer = setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
          xtermRef.current?.focus();

          const cols = xtermRef.current?.cols || 80;
          const rows = xtermRef.current?.rows || 24;
          resizeTelnetTerminal({ session_id: sessionId, cols, rows }).catch((err) => {
            console.error("[TelnetTerminal] Resize error on focus:", err);
          });
        } catch (e) {
          console.warn("[TelnetTerminal] fit failed:", e);
        }
      }, 50);

      return () => clearTimeout(timer);
    }
  }, [isActive, sessionId]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (isActive && fitAddonRef.current && xtermRef.current) {
        try {
          fitAddonRef.current.fit();
          const { cols, rows } = xtermRef.current;
          resizeTelnetTerminal({ session_id: sessionId, cols, rows }).catch((err) => {
            console.error("[TelnetTerminal] Resize error:", err);
          });
        } catch (e) {
          console.warn("[TelnetTerminal] Resize fit failed:", e);
        }
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [sessionId, isActive]);

  return (
    <div
      className="terminal-wrapper"
      style={{
        visibility: isActive ? "visible" : "hidden",
        position: isActive ? "relative" : "absolute",
        pointerEvents: isActive ? "auto" : "none",
      }}
    >
      <div ref={terminalRef} className="terminal-container" />
    </div>
  );
}
