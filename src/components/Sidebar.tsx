"use client";

import React, { useState, useEffect, useCallback } from "react";
import "./Sidebar.css";
import type { JiraSettings } from "./JiraIntegration";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  settings: JiraSettings;
  setSettings: React.Dispatch<React.SetStateAction<JiraSettings>>;
}

const providerLabels: Record<string, { name: string; badge: string; baseUrlLabel: string; apiKeyLabel: string; defaultModel: string; defaultBaseUrl: string }> = {
  openrouter: {
    name: "OpenRouter",
    badge: "CLOUD",
    baseUrlLabel: "Base URL",
    apiKeyLabel: "API Key",
    defaultModel: "openai/gpt-oss-120b:free",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
  },
  openai: {
    name: "OpenAI",
    badge: "CLOUD",
    baseUrlLabel: "Base URL / Azure Endpoint",
    apiKeyLabel: "API Key",
    defaultModel: "gpt-4o-mini",
    defaultBaseUrl: "https://api.openai.com/v1 or Azure endpoint",
  },
  anthropic: {
    name: "Anthropic",
    badge: "CLOUD",
    baseUrlLabel: "Base URL",
    apiKeyLabel: "API Key",
    defaultModel: "claude-3-haiku-20240307",
    defaultBaseUrl: "https://api.anthropic.com",
  },
  nvidia: {
    name: "Nvidia",
    badge: "CLOUD",
    baseUrlLabel: "Base URL",
    apiKeyLabel: "API Key",
    defaultModel: "meta/llama-3.1-70b-instruct",
    defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
  },
  deepseek: {
    name: "DeepSeek",
    badge: "CLOUD",
    baseUrlLabel: "Base URL",
    apiKeyLabel: "API Key",
    defaultModel: "deepseek-chat",
    defaultBaseUrl: "https://api.deepseek.com",
  },
};

export default function Sidebar({ activeTab, onTabChange, settings, setSettings }: SidebarProps) {
  const [aiStatus, setAiStatus] = useState<{ status: string; message: string }>({ status: "idle", message: "Click refresh to check" });
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const checkStatus = useCallback(async (provider: string) => {
    setAiStatus({ status: "checking", message: "Checking..." });
    try {
      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          ollamaUrl: settings.ollamaUrl,
          ollamaModel: settings.ollamaModel,
          providerSettings: settings.providerSettings?.[provider],
        }),
      });
      const data = await res.json();
      setAiStatus(data);
    } catch {
      setAiStatus({ status: "offline", message: "Status check failed" });
    }
  }, [settings.ollamaUrl, settings.ollamaModel, settings.providerSettings]);

  const fetchOllamaModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const host = (settings.ollamaUrl || "http://127.0.0.1:11434").replace(/\/$/, "");
      const res = await fetch(`/api/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "ollama_models", ollamaUrl: host }),
      });
      const data = await res.json();
      if (data.models) setAvailableModels(data.models);
    } catch {
      setAvailableModels([]);
    } finally {
      setLoadingModels(false);
    }
  }, [settings.ollamaUrl]);

  useEffect(() => {
    setAiStatus({ status: "idle", message: "Click refresh to check" });
  }, [settings.aiProvider]);

  const tabs = [
    { id: "jira", label: "Jira Connection", icon: "🔗" },
    { id: "azure", label: "Azure DevOps", icon: "☁️" },
    { id: "agent", label: "Knowledge Base", icon: "🧠" },
    { id: "plan", label: "Test Plan", icon: "📄" },
    { id: "cases", label: "Test Cases", icon: "✅" },
    { id: "code", label: "Code Generator", icon: "💻" },
  ];

  const handleSettingsChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setSettings({ ...settings, [e.target.name]: e.target.value });
  };

  const handleProviderSettingsChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const provider = settings.aiProvider;
    setSettings({
      ...settings,
      providerSettings: {
        ...(settings.providerSettings || {}),
        [provider]: {
          ...(settings.providerSettings?.[provider] || {}),
          [e.target.name]: e.target.value,
        },
      },
    });
  };

  const statusIcon = aiStatus.status === "online" ? "🟢" : aiStatus.status === "checking" ? "🔵" : aiStatus.status === "idle" || aiStatus.status === "no_key" || aiStatus.status === "no_model" ? "🟡" : "🔴";
  const statusClass = aiStatus.status === "online" ? "status-online" : aiStatus.status === "checking" ? "status-checking" : aiStatus.status === "idle" || aiStatus.status === "no_key" || aiStatus.status === "no_model" ? "status-warning" : "status-offline";

  const isOllama = settings.aiProvider === "ollama";
  const isOpenAI = settings.aiProvider === "openai";
  const cloudProvider = providerLabels[settings.aiProvider];
  const cloudProviderSettings = settings.providerSettings?.[settings.aiProvider] || {};

  return (
    <aside className="sidebar">
      <nav className="nav-menu">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`nav-item ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span className="nav-icon">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="settings-section">
        <div className="settings-form dropdown-anim">

          {/* ── AI PROVIDER ───────────────────────────────── */}
          <div className="config-section-label">🤖 AI Provider</div>

          {/* AI Provider Status Indicator */}
          <div className={`ai-status-indicator ${statusClass}`}>
            <span className="status-dot">{statusIcon}</span>
            <span className="status-text">{aiStatus.message}</span>
            <button className="status-refresh" onClick={() => checkStatus(settings.aiProvider)} title="Refresh status" disabled={aiStatus.status === "checking"}>
              🔄
            </button>
          </div>

          <div className="form-group">
            <label>Provider</label>
            <select
              name="aiProvider"
              value={settings.aiProvider}
              onChange={handleSettingsChange}
              className="settings-select"
            >
              <option value="ollama">Ollama</option>
              <option value="openrouter">OpenRouter</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="nvidia">Nvidia</option>
              <option value="deepseek">DeepSeek</option>
            </select>
          </div>

          {/* ── OLLAMA SETTINGS (only when ollama selected) ── */}
          {isOllama && (
            <div className="ollama-config-box">
              <div className="ollama-config-header">
                <span>🖥️ Ollama Settings</span>
                <span className="ollama-badge">LOCAL</span>
              </div>

              <div className="form-group">
                <label>Ollama Host URL</label>
                <input
                  type="text"
                  name="ollamaUrl"
                  value={settings.ollamaUrl || ""}
                  onChange={handleSettingsChange}
                  placeholder="http://127.0.0.1:11434"
                />
              </div>

              <div className="form-group">
                <label>Model Name</label>
                <div className="model-input-row">
                  <input
                    type="text"
                    name="ollamaModel"
                    value={settings.ollamaModel || ""}
                    onChange={handleSettingsChange}
                    placeholder="e.g., qwen2.5-coder:7b"
                    list="ollama-models-list"
                  />
                  <button
                    className="btn-icon"
                    onClick={fetchOllamaModels}
                    title="Detect available models"
                    disabled={loadingModels}
                  >
                    {loadingModels ? "⏳" : "🔍"}
                  </button>
                </div>
                {availableModels.length > 0 && (
                  <datalist id="ollama-models-list">
                    {availableModels.map(m => <option key={m} value={m} />)}
                  </datalist>
                )}
                {availableModels.length > 0 && (
                  <div className="model-chips">
                    {availableModels.map(m => (
                      <button
                        key={m}
                        className={`model-chip ${settings.ollamaModel === m ? "active" : ""}`}
                        onClick={() => setSettings({ ...settings, ollamaModel: m })}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="ollama-tip">
                💡 Run <code>ollama serve</code> then select a model above. Click 🔍 to auto-detect installed models.
              </div>
            </div>
          )}

          {!isOllama && cloudProvider && (
            <div className="provider-config-box">
              <div className="provider-config-header">
                <span>{cloudProvider.name} Settings</span>
                <span className="provider-badge">{cloudProvider.badge}</span>
              </div>

              <div className="form-group">
                <label>{cloudProvider.apiKeyLabel}</label>
                <input
                  type="password"
                  name="apiKey"
                  value={cloudProviderSettings.apiKey || ""}
                  onChange={handleProviderSettingsChange}
                  placeholder="Paste API key or leave blank for .env.local"
                  autoComplete="off"
                />
              </div>

              <div className="form-group">
                <label>Model Name</label>
                <input
                  type="text"
                  name="model"
                  value={cloudProviderSettings.model || ""}
                  onChange={handleProviderSettingsChange}
                  placeholder={cloudProvider.defaultModel}
                />
              </div>

              <div className="form-group">
                <label>{cloudProvider.baseUrlLabel}</label>
                <input
                  type="text"
                  name="baseUrl"
                  value={cloudProviderSettings.baseUrl || ""}
                  onChange={handleProviderSettingsChange}
                  placeholder={cloudProvider.defaultBaseUrl}
                />
              </div>

              {isOpenAI && (
                <>
                  <div className="form-group">
                    <label>API Version</label>
                    <input
                      type="text"
                      name="apiVersion"
                      value={cloudProviderSettings.apiVersion || ""}
                      onChange={handleProviderSettingsChange}
                      placeholder="2024-12-01-preview for Azure/APIM"
                    />
                  </div>

                  <div className="form-group">
                    <label>Deployment Name</label>
                    <input
                      type="text"
                      name="deployment"
                      value={cloudProviderSettings.deployment || ""}
                      onChange={handleProviderSettingsChange}
                      placeholder="Leave blank to use model name"
                    />
                  </div>

                  <div className="form-group">
                    <label>Auth Header</label>
                    <select
                      name="apiKeyHeader"
                      value={cloudProviderSettings.apiKeyHeader || ""}
                      onChange={handleProviderSettingsChange}
                      className="settings-select"
                    >
                      <option value="">Default</option>
                      <option value="Authorization">Authorization: Bearer</option>
                      <option value="api-key">api-key</option>
                    </select>
                  </div>
                </>
              )}

              <div className="provider-tip">
                Leave any field blank to use the matching value from <code>.env.local</code> or the app default.
              </div>
            </div>
          )}

          {/* Prompt Mode Toggle (always shown) */}
          <div className="form-group">
            <label>Prompt Mode</label>
            <div
              className={`prompt-toggle ${settings.customPromptMode ? "active" : ""}`}
              onClick={() => setSettings({ ...settings, customPromptMode: !settings.customPromptMode })}
            >
              <div className="toggle-track">
                <div className="toggle-thumb"></div>
              </div>
              <span className="toggle-label">
                {settings.customPromptMode ? "📝 Custom" : "🤖 Default"}
              </span>
            </div>
          </div>


        </div>
      </div>
    </aside>
  );
}
