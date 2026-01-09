import type { SshSessionInfo } from "../../types/ssh";
import "./TerminalTabs.css";

interface TerminalTabsProps {
  sessions: SshSessionInfo[];
  activeSessionId: string | null;
  onSelectTab: (sessionId: string) => void;
  onCloseTab: (sessionId: string) => void;
  onNewConnection: () => void;
}

export function TerminalTabs({
  sessions,
  activeSessionId,
  onSelectTab,
  onCloseTab,
  onNewConnection,
}: TerminalTabsProps) {
  return (
    <div className="terminal-tabs-bar">
      <div className="terminal-tabs">
        {sessions.map((session) => (
          <button
            key={session.session_id}
            className={`terminal-tab ${session.session_id === activeSessionId ? "active" : ""}`}
            onClick={() => onSelectTab(session.session_id)}
          >
            <span className="tab-indicator">⬤</span>
            <span className="tab-host">{session.host}</span>
            <button
              className="terminal-tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(session.session_id);
              }}
              title="Close connection"
            >
              ×
            </button>
          </button>
        ))}
      </div>
      <button className="new-tab-btn" onClick={onNewConnection} title="New connection">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}
