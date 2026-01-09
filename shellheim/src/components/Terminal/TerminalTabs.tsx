import type { SshSessionInfo, HibernatedSession } from "../../types/ssh";
import "./TerminalTabs.css";

interface TerminalTabsProps {
  sessions: SshSessionInfo[];
  activeSessionId: string | null;
  hibernatedSessions?: HibernatedSession[];
  onSelectTab: (sessionId: string) => void;
  onCloseTab: (sessionId: string) => void;
  onHibernateTab: (sessionId: string) => void;
  onResumeSession?: (hibernatedSession: HibernatedSession) => void;
  onDeleteHibernated?: (id: string) => void;
  onNewConnection: () => void;
}

export function TerminalTabs({
  sessions,
  activeSessionId,
  hibernatedSessions = [],
  onSelectTab,
  onCloseTab,
  onHibernateTab,
  onResumeSession,
  onDeleteHibernated,
  onNewConnection,
}: TerminalTabsProps) {
  return (
    <div className="terminal-tabs-bar">
      <div className="terminal-tabs">
        {/* Active sessions */}
        {sessions.map((session) => (
          <button
            key={session.session_id}
            className={`terminal-tab ${session.session_id === activeSessionId ? "active" : ""}`}
            onClick={() => onSelectTab(session.session_id)}
          >
            <span className="tab-indicator connected">⬤</span>
            <span className="tab-host">{session.host}</span>
            <div className="tab-actions">
              <button
                className="terminal-tab-action hibernate"
                onClick={(e) => {
                  e.stopPropagation();
                  onHibernateTab(session.session_id);
                }}
                title="Hibernate session"
              >
                ⏸
              </button>
              <button
                className="terminal-tab-action close"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(session.session_id);
                }}
                title="Close connection"
              >
                ×
              </button>
            </div>
          </button>
        ))}

        {/* Hibernated sessions */}
        {hibernatedSessions.map((hibernated) => (
          <button
            key={hibernated.id}
            className="terminal-tab hibernated"
            onClick={() => onResumeSession?.(hibernated)}
            title={`Resume ${hibernated.host} (hibernated ${formatHibernatedTime(hibernated.hibernatedAt)})`}
          >
            <span className="tab-indicator hibernated">⏸</span>
            <span className="tab-host">{hibernated.host}</span>
            <div className="tab-actions">
              <button
                className="terminal-tab-action resume"
                onClick={(e) => {
                  e.stopPropagation();
                  onResumeSession?.(hibernated);
                }}
                title="Resume session"
              >
                ▶
              </button>
              <button
                className="terminal-tab-action close"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteHibernated?.(hibernated.id);
                }}
                title="Delete hibernated session"
              >
                ×
              </button>
            </div>
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

function formatHibernatedTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
