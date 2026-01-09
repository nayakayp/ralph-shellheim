import { Plus } from "@phosphor-icons/react";
import type { SshSessionInfo, HibernatedSession } from "../../types/ssh";
import type { SftpSessionInfo } from "../../types/sftp";
import "./TerminalTabs.css";

export type TabSession = 
  | { type: "ssh"; session: SshSessionInfo }
  | { type: "sftp"; session: SftpSessionInfo };

interface TerminalTabsProps {
  sessions: SshSessionInfo[];
  sftpSessions?: SftpSessionInfo[];
  activeSessionId: string | null;
  activeTabType?: "ssh" | "sftp";
  hibernatedSessions?: HibernatedSession[];
  onSelectTab: (sessionId: string, tabType: "ssh" | "sftp") => void;
  onCloseTab: (sessionId: string) => void;
  onCloseSftpTab?: (sessionId: string) => void;
  onHibernateTab: (sessionId: string) => void;
  onResumeSession?: (hibernatedSession: HibernatedSession) => void;
  onDeleteHibernated?: (id: string) => void;
  onNewConnection: () => void;
}

export function TerminalTabs({
  sessions,
  sftpSessions = [],
  activeSessionId,
  activeTabType = "ssh",
  hibernatedSessions = [],
  onSelectTab,
  onCloseTab,
  onCloseSftpTab,
  onHibernateTab,
  onResumeSession,
  onDeleteHibernated,
  onNewConnection,
}: TerminalTabsProps) {
  return (
    <div className="terminal-tabs-bar">
      <div className="terminal-tabs">
        {/* Active SSH sessions */}
        {sessions.map((session) => (
          <div
            key={`ssh-${session.session_id}`}
            className={`terminal-tab ${session.session_id === activeSessionId && activeTabType === "ssh" ? "active" : ""}`}
            onClick={() => onSelectTab(session.session_id, "ssh")}
            role="tab"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onSelectTab(session.session_id, "ssh")}
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
          </div>
        ))}

        {/* SFTP sessions */}
        {sftpSessions.map((session) => (
          <div
            key={`sftp-${session.session_id}`}
            className={`terminal-tab sftp ${session.session_id === activeSessionId && activeTabType === "sftp" ? "active" : ""}`}
            onClick={() => onSelectTab(session.session_id, "sftp")}
            role="tab"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onSelectTab(session.session_id, "sftp")}
          >
            <span className="tab-indicator sftp">📁</span>
            <span className="tab-host">{session.host} (SFTP)</span>
            <div className="tab-actions">
              <button
                className="terminal-tab-action close"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseSftpTab?.(session.session_id);
                }}
                title="Close SFTP"
              >
                ×
              </button>
            </div>
          </div>
        ))}

        {/* Hibernated sessions */}
        {hibernatedSessions.map((hibernated) => (
          <div
            key={hibernated.id}
            className="terminal-tab hibernated"
            onClick={() => onResumeSession?.(hibernated)}
            title={`Resume ${hibernated.host} (hibernated ${formatHibernatedTime(hibernated.hibernatedAt)})`}
            role="tab"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onResumeSession?.(hibernated)}
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
          </div>
        ))}
      </div>
      <button className="new-tab-btn" onClick={onNewConnection} title="New connection">
        <Plus size={14} weight="bold" />
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
