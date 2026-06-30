"use client";

import React, { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import "./TestPlanDashboard.css";

interface PlanProps {
  settings: any;
  story: any | null;
  plan: string | null;
  setPlan: (plan: string) => void;
  customCasesPrompt: string;
  setCustomCasesPrompt: (prompt: string) => void;
  onTransitionToCases: () => void;
}

export default function TestPlanDashboard({ 
  settings, 
  story, 
  plan, 
  setPlan, 
  customCasesPrompt, 
  setCustomCasesPrompt, 
  onTransitionToCases 
}: PlanProps) {
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planCopied, setPlanCopied] = useState(false);
  const [customPlanPrompt, setCustomPlanPrompt] = useState("");

  if (!story) {
    return (
      <div className="panel empty-state" style={{ height: "100%" }}>
        <span className="empty-icon">☝️</span>
        <h3>No User Story Selected</h3>
        <p>Please select a user story from the Jira Integration tab first.</p>
      </div>
    );
  }

  const generatePlan = useCallback(async () => {
    if (!story) return;
    setLoadingPlan(true);
    setError(null);
    try {
      const res = await fetch("/api/generate/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story,
          provider: settings.aiProvider,
          customPrompt: settings.customPromptMode ? customPlanPrompt : "",
          ollamaUrl: settings.ollamaUrl,
          ollamaModel: settings.ollamaModel,
          providerSettings: settings.providerSettings?.[settings.aiProvider],
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate plan");
      setPlan(data.plan);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingPlan(false);
    }
  }, [story, settings, setPlan, customPlanPrompt]);

  // Auto-generation is disabled to allow users to upload documents first.
  // The user must click the "Generate" button manually.

  const handleCopyPlan = () => {
    if (plan) {
      navigator.clipboard.writeText(plan);
      setPlanCopied(true);
      setTimeout(() => setPlanCopied(false), 2000);
    }
  };

  return (
    <div className="plan-container panel">
      <div className="plan-header">
        <div>
          <h2>Test Plan Generation</h2>
          <p>For: <span className="highlight-tag">{story.key}</span> {story.summary}</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {plan && (
            <button className="btn btn-secondary btn-sm" onClick={handleCopyPlan}>
              {planCopied ? "✅ Copied!" : "📋 Copy Plan"}
            </button>
          )}
          {!plan && (
            <button className="btn btn-primary" onClick={generatePlan} disabled={loadingPlan}>
              {loadingPlan ? <span className="loader"></span> : "✨ Generate AI Test Plan"}
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Custom Prompt for Plan */}
      {settings.customPromptMode && !plan && (
        <div className="custom-prompt-area">
          <label>📝 Custom Instructions for Test Plan</label>
          <textarea
            value={customPlanPrompt}
            onChange={(e) => setCustomPlanPrompt(e.target.value)}
            placeholder="e.g., Focus on security testing and edge cases. Include performance test scenarios..."
          />
        </div>
      )}

      <div className="plan-content">
        {!plan && !loadingPlan && (
          <div className="empty-plan-prompt">
            <span className="ai-icon">🧠</span>
            <p>Ready to generate a comprehensive test plan using AI.</p>
          </div>
        )}

        {loadingPlan && (
          <div className="skeleton-container">
            <div className="skeleton skeleton-title"></div>
            <div className="skeleton skeleton-line"></div>
            <div className="skeleton skeleton-line short"></div>
            <div className="skeleton skeleton-title" style={{ marginTop: "1.5rem" }}></div>
            <div className="skeleton skeleton-line"></div>
            <div className="skeleton skeleton-line"></div>
            <div className="skeleton skeleton-line short"></div>
            <div className="skeleton skeleton-title" style={{ marginTop: "1.5rem" }}></div>
            <div className="skeleton skeleton-line"></div>
            <div className="skeleton skeleton-line short"></div>
          </div>
        )}

        {plan && (
          <div className="markdown-viewer">
            <ReactMarkdown>{plan}</ReactMarkdown>
          </div>
        )}
      </div>

      {plan && (
        <div className="plan-footer">
          {/* Custom Prompt for Cases */}
          {settings.customPromptMode && (
            <div className="custom-prompt-area" style={{ flex: 1, marginBottom: 0, marginRight: "1rem" }}>
              <label>📝 Custom Instructions for Test Cases</label>
              <textarea
                value={customCasesPrompt}
                onChange={(e) => setCustomCasesPrompt(e.target.value)}
                placeholder="e.g., Include negative test cases and boundary value testing..."
              />
            </div>
          )}
          <button className="btn btn-primary lg" onClick={onTransitionToCases}>
            ⚡ Create Test Cases from Plan
          </button>
        </div>
      )}
    </div>
  );
}
