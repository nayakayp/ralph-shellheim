import { useState } from "react";
import type { LoginRequest, CreateAccountRequest } from "../types/auth";
import "./AuthPage.css";

interface AuthPageProps {
  hasExistingAccounts: boolean;
  onLogin: (request: LoginRequest) => Promise<void>;
  onRegister: (request: CreateAccountRequest) => Promise<unknown>;
}

export function AuthPage({ hasExistingAccounts, onLogin, onRegister }: AuthPageProps) {
  const [mode, setMode] = useState<"login" | "register">(hasExistingAccounts ? "login" : "register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "login") {
        await onLogin({ username, password, totp_code: totpCode || undefined });
      } else {
        await onRegister({ username, password, display_name: displayName || undefined });
      }
    } catch (err: any) {
      setError(err?.toString() || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              <polyline points="7 9 12 4 17 9" />
              <line x1="12" y1="4" x2="12" y2="16" />
            </svg>
          </div>
          <h1>Shellheim</h1>
          <p className="auth-subtitle">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}
          
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
              minLength={3}
              autoComplete="username"
            />
          </div>

          {mode === "register" && (
            <div className="form-group">
              <label htmlFor="displayName">Display Name</label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter display name (optional)"
                autoComplete="name"
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          {mode === "login" && (
            <div className="form-group">
              <label htmlFor="totp">2FA Code (if enabled)</label>
              <input
                id="totp"
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="Enter 2FA code"
                maxLength={6}
                autoComplete="one-time-code"
              />
            </div>
          )}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? (
              <span className="spinner" />
            ) : mode === "login" ? (
              "Sign In"
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        <div className="auth-footer">
          {mode === "login" ? (
            <p>
              Don't have an account?{" "}
              <button type="button" className="auth-link" onClick={() => setMode("register")}>
                Create one
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{" "}
              <button type="button" className="auth-link" onClick={() => setMode("login")}>
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
