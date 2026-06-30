"use client";

import React, { useState } from "react";
import "./CodeViewer.css";

interface CodeViewerProps {
  settings: any;
  testCase: any | null;
  testCases: any[];
  codeMap: Record<string, string>;
  setCode: (testCaseId: string, code: string) => void;
  onSwitchCase: (tc: any) => void;
}

export default function CodeViewer({ settings, testCase, testCases, codeMap, setCode, onSwitchCase }: CodeViewerProps) {
  const [loading, setLoading] = useState(false);
  const [framework, setFramework] = useState("Playwright");
  const [error, setError] = useState<string | null>(null);
  const [customCodePrompt, setCustomCodePrompt] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);

  if (!testCase) {
    return (
      <div className="panel empty-state" style={{ height: "100%" }}>
        <span className="empty-icon">💻</span>
        <h3>No Test Case Selected</h3>
        <p>Select a test case from the Test Cases tab to generate automation code.</p>
      </div>
    );
  }

  const currentCode = codeMap[testCase.id] || null;
  const generatedCaseIds = Object.keys(codeMap);

  const generateCode = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testCase,
          framework,
          provider: settings.aiProvider,
          customPrompt: settings.customPromptMode ? customCodePrompt : "",
          ollamaUrl: settings.ollamaUrl,
          ollamaModel: settings.ollamaModel,
          providerSettings: settings.providerSettings?.[settings.aiProvider],
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate code");

      let code = data.code;
      if (code.startsWith("```")) {
        code = code.replace(/^```[a-z]*\n/, "").replace(/\n```$/, "");
      }
      setCode(testCase.id, code);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (currentCode) {
      navigator.clipboard.writeText(currentCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  return (
    <div className="code-container panel">
      <div className="code-header">
        <div>
          <h2>Automation Script</h2>
          <p>For Test Case: <span className="highlight-tag">{testCase.id}</span> {testCase.title}</p>
        </div>
        
        <div className="controls">
          <select 
            className="framework-select" 
            value={framework} 
            onChange={(e) => setFramework(e.target.value)}
          >
            <option value="Playwright">Playwright</option>
            <option value="Selenium (Java)">Selenium (Java)</option>
            <option value="Selenium (Python)">Selenium (Python)</option>
            <option value="Cypress">Cypress</option>
          </select>
          <button className="btn btn-primary" onClick={generateCode} disabled={loading}>
            {loading ? <span className="loader"></span> : currentCode ? "🔄 Regenerate" : "Generate Code"}
          </button>
        </div>
      </div>

      {/* Sub-tabs for generated test case codes */}
      {generatedCaseIds.length > 0 && (
        <div className="code-tabs">
          {testCases.map(tc => {
            const hasCode = !!codeMap[tc.id];
            const isActive = tc.id === testCase.id;
            return (
              <button
                key={tc.id}
                className={`code-tab ${isActive ? "active" : ""} ${hasCode ? "has-code" : ""}`}
                onClick={() => onSwitchCase(tc)}
                title={tc.title}
              >
                {hasCode && <span className="tab-dot">●</span>}
                {tc.id}
              </button>
            );
          })}
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {/* Custom Prompt for Code Generation */}
      {settings.customPromptMode && !currentCode && (
        <div className="custom-prompt-area">
          <label>📝 Custom Instructions for Code Generation</label>
          <textarea
            value={customCodePrompt}
            onChange={(e) => setCustomCodePrompt(e.target.value)}
            placeholder="e.g., Use Page Object Model pattern, add explicit waits, include data-driven approach..."
          />
        </div>
      )}

      <div className="code-editor-wrapper">
        {!currentCode && !loading && (
          <div className="empty-code-prompt">
            <span className="code-icon">⚙️</span>
            <p>Select your framework and click Generate to create the automation script.</p>
          </div>
        )}

        {loading && (
          <div className="skeleton-code-container">
            <div className="skeleton skeleton-code-line" style={{ width: "60%" }}></div>
            <div className="skeleton skeleton-code-line" style={{ width: "80%" }}></div>
            <div className="skeleton skeleton-code-line" style={{ width: "50%" }}></div>
            <div className="skeleton skeleton-code-line" style={{ width: "90%" }}></div>
            <div className="skeleton skeleton-code-line" style={{ width: "70%" }}></div>
            <div className="skeleton skeleton-code-line" style={{ width: "85%" }}></div>
          </div>
        )}

        {currentCode && (
          <div className="code-block">
            <div className="code-toolbar">
              <span className="lang-tag">{framework}</span>
              <button className="btn btn-secondary btn-sm" onClick={copyToClipboard}>
                {codeCopied ? "✅ Copied!" : "📋 Copy Code"}
              </button>
            </div>
            <pre>
              <code>{currentCode}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
