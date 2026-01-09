import { useState, useEffect, useCallback } from "react";
import { Brain, FloppyDisk, Lightning, Gear, Check, X, Warning, CircleNotch } from "@phosphor-icons/react";
import "./AiPanel.css";

interface AiPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AiSettings {
  api_endpoint: string;
  api_key_set: boolean;
  model: string;
  temperature: number;
  system_prompt: string;
  enabled: boolean;
}

const DEFAULT_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4-turbo",
  "gpt-3.5-turbo",
  "custom",
];

export function AiPanel({ isOpen, onClose }: AiPanelProps) {
  const [settings, setSettings] = useState<AiSettings>({
    api_endpoint: "https://api.openai.com/v1",
    api_key_set: false,
    model: "gpt-4o-mini",
    temperature: 0.7,
    system_prompt: "",
    enabled: false,
  });
  const [apiKey, setApiKey] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadSettings = useCallback(async () => {
    try {
      setError("");
      setIsLoading(true);
      const response = await fetch("/api/ai/settings");
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        if (data.model && !DEFAULT_MODELS.includes(data.model)) {
          setCustomModel(data.model);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AI settings");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      setApiKey("");
      setTestStatus("idle");
      setTestMessage("");
      setSuccessMessage("");
    }
  }, [isOpen, loadSettings]);

  const handleSave = async () => {
    try {
      setError("");
      setSuccessMessage("");
      setIsSaving(true);

      const payload: Record<string, unknown> = {
        api_endpoint: settings.api_endpoint,
        model: settings.model === "custom" ? customModel : settings.model,
        temperature: settings.temperature,
        system_prompt: settings.system_prompt,
        enabled: settings.enabled,
      };

      if (apiKey) {
        payload.api_key = apiKey;
      }

      const response = await fetch("/api/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save settings");
      }

      const data = await response.json();
      setSettings(data);
      setApiKey("");
      setSuccessMessage("Settings saved successfully!");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTestStatus("idle");
      setTestMessage("");
      setIsTesting(true);

      const response = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_endpoint: settings.api_endpoint,
          api_key: apiKey || undefined,
          model: settings.model === "custom" ? customModel : settings.model,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setTestStatus("success");
        setTestMessage(data.message || "Connection successful!");
      } else {
        setTestStatus("error");
        setTestMessage(data.error || "Connection failed");
      }
    } catch (err) {
      setTestStatus("error");
      setTestMessage(err instanceof Error ? err.message : "Connection test failed");
    } finally {
      setIsTesting(false);
    }
  };

  const getStatusIcon = () => {
    if (!settings.enabled) {
      return <Warning size={18} className="status-warning" />;
    }
    if (settings.api_key_set) {
      return <Check size={18} className="status-success" />;
    }
    return <Warning size={18} className="status-warning" />;
  };

  const getStatusText = () => {
    if (!settings.enabled) return "AI Disabled";
    if (settings.api_key_set) return "Configured";
    return "API Key Required";
  };

  if (!isOpen) return null;

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="ai-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <div className="panel-title">
            <Brain size={22} />
            <h2>AI Settings</h2>
            <span className="status-badge">
              {getStatusIcon()}
              {getStatusText()}
            </span>
          </div>
          <button className="panel-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="panel-toolbar">
          <p className="panel-description">
            Configure AI assistant for intelligent command suggestions and terminal assistance
          </p>
        </div>

        <div className="panel-content">
          {error && <div className="panel-error">{error}</div>}
          {successMessage && <div className="panel-success">{successMessage}</div>}

          {isLoading ? (
            <div className="panel-loading">
              <div className="spinner" />
              <p>Loading settings...</p>
            </div>
          ) : (
            <form className="ai-settings-form" onSubmit={(e) => e.preventDefault()}>
              {/* Enabled Toggle */}
              <div className="form-group toggle-group">
                <label className="toggle-label">
                  <span className="label-text">
                    <Gear size={18} />
                    Enable AI Assistant
                  </span>
                  <div className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.enabled}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, enabled: e.target.checked }))
                      }
                    />
                    <span className="toggle-slider" />
                  </div>
                </label>
              </div>

              {/* API Endpoint */}
              <div className="form-group">
                <label htmlFor="api-endpoint">API Endpoint</label>
                <input
                  id="api-endpoint"
                  type="url"
                  value={settings.api_endpoint}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, api_endpoint: e.target.value }))
                  }
                  placeholder="https://api.openai.com/v1"
                />
                <span className="form-hint">OpenAI-compatible API endpoint</span>
              </div>

              {/* API Key */}
              <div className="form-group">
                <label htmlFor="api-key">
                  API Key
                  {settings.api_key_set && (
                    <span className="key-status">
                      <Check size={14} /> Configured
                    </span>
                  )}
                </label>
                <input
                  id="api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={settings.api_key_set ? "••••••••••••••••" : "sk-..."}
                />
                {settings.api_key_set && (
                  <span className="form-hint">Leave blank to keep existing key</span>
                )}
              </div>

              {/* Model Selection */}
              <div className="form-group">
                <label htmlFor="model">Model</label>
                <select
                  id="model"
                  value={DEFAULT_MODELS.includes(settings.model) ? settings.model : "custom"}
                  onChange={(e) => {
                    setSettings((s) => ({ ...s, model: e.target.value }));
                    if (e.target.value !== "custom") {
                      setCustomModel("");
                    }
                  }}
                >
                  {DEFAULT_MODELS.map((model) => (
                    <option key={model} value={model}>
                      {model === "custom" ? "Custom Model..." : model}
                    </option>
                  ))}
                </select>
              </div>

              {/* Custom Model Input */}
              {(settings.model === "custom" || !DEFAULT_MODELS.includes(settings.model)) && (
                <div className="form-group">
                  <label htmlFor="custom-model">Custom Model Name</label>
                  <input
                    id="custom-model"
                    type="text"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    placeholder="e.g., gpt-4-1106-preview"
                  />
                </div>
              )}

              {/* Temperature Slider */}
              <div className="form-group">
                <label htmlFor="temperature">
                  Temperature
                  <span className="temperature-value">{settings.temperature.toFixed(2)}</span>
                </label>
                <div className="slider-container">
                  <span className="slider-label">Precise</span>
                  <input
                    id="temperature"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.temperature}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, temperature: parseFloat(e.target.value) }))
                    }
                  />
                  <span className="slider-label">Creative</span>
                </div>
              </div>

              {/* System Prompt */}
              <div className="form-group">
                <label htmlFor="system-prompt">System Prompt</label>
                <textarea
                  id="system-prompt"
                  value={settings.system_prompt}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, system_prompt: e.target.value }))
                  }
                  placeholder="Optional custom context for the AI assistant..."
                  rows={4}
                />
                <span className="form-hint">
                  Customize AI behavior with additional context or instructions
                </span>
              </div>

              {/* Test Connection */}
              <div className="form-group test-section">
                <button
                  type="button"
                  className="test-btn"
                  onClick={handleTestConnection}
                  disabled={isTesting || !settings.api_endpoint}
                >
                  {isTesting ? (
                    <>
                      <CircleNotch size={16} className="spinning" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Lightning size={16} />
                      Test Connection
                    </>
                  )}
                </button>
                {testStatus !== "idle" && (
                  <div className={`test-result ${testStatus}`}>
                    {testStatus === "success" ? <Check size={16} /> : <X size={16} />}
                    {testMessage}
                  </div>
                )}
              </div>

              {/* Save Button */}
              <div className="form-actions">
                <button
                  type="button"
                  className="save-btn"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <CircleNotch size={16} className="spinning" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <FloppyDisk size={16} />
                      Save Settings
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
