import { useState } from "react";
import { Warning, Key } from "@phosphor-icons/react";
import type { HostKeyStatus, TrustHostKeyRequest } from "../types/known_host";
import { trustHostKey } from "../lib/api";
import "./HostKeyDialog.css";

interface HostKeyDialogProps {
  host: string;
  port: number;
  status: HostKeyStatus;
  onAccept: () => void;
  onReject: () => void;
}

export function HostKeyDialog({ host, port, status, onAccept, onReject }: HostKeyDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const isChanged = status.status === "Changed";
  const isUnknown = status.status === "Unknown";

  const fingerprint = isChanged ? status.new_fingerprint : isUnknown ? status.fingerprint : "";
  const keyType = isChanged ? status.key_type : isUnknown ? status.key_type : "";

  const handleAccept = async () => {
    setIsLoading(true);
    setError("");

    try {
      const request: TrustHostKeyRequest = {
        host,
        port,
        key_type: keyType,
        fingerprint,
        public_key_base64: fingerprint, // We use fingerprint as placeholder - backend has full key
        replace: isChanged,
      };

      await trustHostKey(request);
      onAccept();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trust host key");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="hostkey-overlay">
      <div className={`hostkey-dialog ${isChanged ? "hostkey-warning" : ""}`}>
        {isChanged ? (
          <>
            <div className="hostkey-icon warning">
              <Warning size={48} />
            </div>
            <h2>WARNING: Host Key Changed!</h2>
            <p className="hostkey-alert">
              The host key for <strong>{host}:{port}</strong> has changed!
              This could indicate a man-in-the-middle attack or the server was reinstalled.
            </p>
            <div className="hostkey-details">
              <div className="hostkey-row">
                <span className="label">Key Type:</span>
                <span className="value">{keyType}</span>
              </div>
              <div className="hostkey-row">
                <span className="label">Old Fingerprint:</span>
                <code className="fingerprint old">{status.old_fingerprint}</code>
              </div>
              <div className="hostkey-row">
                <span className="label">New Fingerprint:</span>
                <code className="fingerprint new">{status.new_fingerprint}</code>
              </div>
            </div>
            <p className="hostkey-warning-text">
              Only proceed if you're certain the server key change is legitimate.
            </p>
          </>
        ) : (
          <>
            <div className="hostkey-icon">
              <Key size={48} />
            </div>
            <h2>Verify Host Key</h2>
            <p>
              You're connecting to <strong>{host}:{port}</strong> for the first time.
              Please verify the server's fingerprint.
            </p>
            <div className="hostkey-details">
              <div className="hostkey-row">
                <span className="label">Key Type:</span>
                <span className="value">{keyType}</span>
              </div>
              <div className="hostkey-row">
                <span className="label">Fingerprint:</span>
                <code className="fingerprint">{fingerprint}</code>
              </div>
            </div>
            <p className="hostkey-hint">
              If this fingerprint matches what you expect, click "Trust & Connect" to save it.
            </p>
          </>
        )}

        {error && <div className="hostkey-error">{error}</div>}

        <div className="hostkey-actions">
          <button
            className="hostkey-btn cancel"
            onClick={onReject}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            className={`hostkey-btn ${isChanged ? "accept-warning" : "accept"}`}
            onClick={handleAccept}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="spinner-small" />
                Saving...
              </>
            ) : isChanged ? (
              "Accept New Key"
            ) : (
              "Trust & Connect"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
