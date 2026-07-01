"use client";

import React, { useEffect, useMemo, useState } from "react";
import "./AgentConsole.css";
import KnowledgeBase from "./KnowledgeBase";

interface AgentSettings {
  aiProvider: string;
  customPromptMode: boolean;
  ollamaUrl?: string;
  ollamaModel?: string;
  providerSettings?: Record<string, { apiKey?: string; model?: string; baseUrl?: string; apiVersion?: string; deployment?: string; apiKeyHeader?: string }>;
}

interface StoryContext {
  key: string;
  summary: string;
  description: string;
}

interface UploadedDocument {
  id: string;
  name: string;
  text: string;
}

interface GeneratedCase {
  id?: string;
  title?: string;
  steps?: Array<{
    testStep?: number | string;
    stepAction?: string;
    stepExpected?: string;
  }>;
  [key: string]: unknown;
}

interface PlanResponse {
  plan?: string;
  error?: string;
}

interface CasesResponse {
  cases?: GeneratedCase[];
  error?: string;
}

interface AgentConsoleProps {
  settings: AgentSettings;
  story: StoryContext | null;
  documents: UploadedDocument[];
  onAddDocument: (doc: UploadedDocument) => void;
  onRemoveDocument: (id: string) => void;
  customCasesPrompt: string;
  setCustomCasesPrompt: (prompt: string) => void;
  onPlanGenerated: (plan: string) => void;
  onCasesGenerated: (cases: GeneratedCase[]) => void;
  onOpenTab: (tab: string) => void;
}

type AgentStep = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
};

type AgentDefinition = {
  id: string;
  name: string;
  badge: string;
  summary: string;
  planGuidance: string;
  caseGuidance: string;
  source?: "organization" | "application";
  team?: string;
  owner?: string;
};

type OrgAgentSearchResponse = {
  agents?: AgentDefinition[];
  catalogSource?: "external" | "demo";
  catalogError?: string;
};

type AgentSearchRequestBody = {
  q: string;
  catalogUrl?: string;
  catalogToken?: string;
};

function classifyIntent(intent: string) {
  const normalized = intent.toLowerCase();
  const planOnly = /plan only|only .*plan|just .*plan/.test(normalized);
  const casesRequested = /(test case|test cases|regression|scenario|coverage)/.test(normalized);

  return {
    generatePlan: true,
    generateCases: !planOnly && (casesRequested || normalized.trim().length > 0),
  };
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeAgentSearch(input: string) {
  return input.trim().toLowerCase().replace(/^@+/, "").replace(/\s+/g, " ");
}

function validateRuntimeCredentials(url: string, token: string) {
  const trimmedUrl = url.trim();
  void token;

  if (!trimmedUrl) {
    return { valid: false, message: "Catalog URL is required before searching organizational agents." };
  }

  try {
    new URL(trimmedUrl);
  } catch {
    return { valid: false, message: "Catalog URL must be a valid absolute URL." };
  }

  return { valid: true as const };
}

function buildPromptFromAgents(
  selectedAgents: AgentDefinition[],
  guidanceType: "planGuidance" | "caseGuidance",
  intent: string,
  extraInstructions?: string
) {
  const agentInstructions = selectedAgents
    .map((agent) => `- ${agent.name}: ${agent[guidanceType]}`)
    .join("\n");

  return [
    `Organizational Copilot agents selected: ${selectedAgents.map((agent) => agent.name).join(", ")}`,
    "Apply the following agent guidance while generating the result:",
    agentInstructions,
    "",
    `Agent intent:\n${intent}`,
    extraInstructions ? `\nAdditional instructions:\n${extraInstructions}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export default function AgentConsole({
  settings,
  story,
  documents,
  onAddDocument,
  onRemoveDocument,
  customCasesPrompt,
  setCustomCasesPrompt,
  onPlanGenerated,
  onCasesGenerated,
  onOpenTab,
}: AgentConsoleProps) {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRunSummary, setLastRunSummary] = useState<string | null>(null);
  const [agentSearch, setAgentSearch] = useState("");
  const [organizationAgents, setOrganizationAgents] = useState<AgentDefinition[]>([]);
  const [orgSearchLoading, setOrgSearchLoading] = useState(false);
  const [runtimeCatalogUrl, setRuntimeCatalogUrl] = useState("");
  const [runtimeCatalogToken, setRuntimeCatalogToken] = useState("");
  const [showRuntimeToken, setShowRuntimeToken] = useState(false);
  const [credentialsUnlocked, setCredentialsUnlocked] = useState(false);
  const [connectionTesting, setConnectionTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "success" | "error">("idle");
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  useEffect(() => {
    const clearSensitiveToken = () => {
      setRuntimeCatalogToken("");
    };

    window.addEventListener("beforeunload", clearSensitiveToken);
    window.addEventListener("pagehide", clearSensitiveToken);

    return () => {
      window.removeEventListener("beforeunload", clearSensitiveToken);
      window.removeEventListener("pagehide", clearSensitiveToken);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setOrgSearchLoading(true);
      try {
        let response: Response;
        const query = encodeURIComponent(agentSearch.trim());

        if (!credentialsUnlocked) {
          response = await fetch(`/api/agents/search?q=${query}`, {
            method: "GET",
            signal: controller.signal,
          });
        } else {
          const validation = validateRuntimeCredentials(runtimeCatalogUrl, runtimeCatalogToken);
          if (!validation.valid) {
            setConnectionStatus("error");
            setConnectionMessage(validation.message);
            response = await fetch(`/api/agents/search?q=${query}`, {
              method: "GET",
              signal: controller.signal,
            });
          } else {
            const body: AgentSearchRequestBody = {
              q: agentSearch.trim(),
              catalogUrl: runtimeCatalogUrl.trim(),
              catalogToken: runtimeCatalogToken.trim() || undefined,
            };

            response = await fetch("/api/agents/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
              signal: controller.signal,
            });
          }
        }

        const data: OrgAgentSearchResponse = await response.json();
        if (!response.ok) {
          throw new Error("Agent search failed.");
        }

        const incoming = Array.isArray(data.agents) ? data.agents : [];
        const normalized = incoming.map((agent) => ({
          ...agent,
          source: "organization" as const,
        }));
        setOrganizationAgents(normalized);
      } catch {
        setOrganizationAgents([]);
      } finally {
        setOrgSearchLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [agentSearch, runtimeCatalogUrl, runtimeCatalogToken, credentialsUnlocked]);

  const selectedStorySummary = useMemo(() => {
    if (!story) return "No Azure DevOps story selected yet.";
    return `${story.key} - ${story.summary}`;
  }, [story]);

  const allAgents = useMemo(() => {
    const merged = [...organizationAgents];
    const deduped = new Map<string, AgentDefinition>();
    for (const agent of merged) {
      deduped.set(agent.id, agent);
    }
    return Array.from(deduped.values());
  }, [organizationAgents]);

  const selectedAgents = useMemo(
    () => allAgents.filter((agent) => selectedAgentIds.includes(agent.id)),
    [allAgents, selectedAgentIds]
  );

  const filteredAgents = useMemo(() => {
    const query = normalizeAgentSearch(agentSearch);
    if (!query) {
      return allAgents;
    }

    return allAgents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(query) ||
        agent.summary.toLowerCase().includes(query) ||
        agent.badge.toLowerCase().includes(query)
    );
  }, [agentSearch, allAgents]);

  const filteredOrganizationAgents = useMemo(
    () => filteredAgents.filter((agent) => agent.source !== "application"),
    [filteredAgents]
  );

  const updateStep = (stepId: string, status: AgentStep["status"], detail?: string) => {
    setSteps((current) =>
      current.map((step) => (step.id === stepId ? { ...step, status, detail } : step))
    );
  };

  const toggleAgent = (agentId: string) => {
    setSelectedAgentIds((current) =>
      current.includes(agentId)
        ? current.filter((id) => id !== agentId)
        : [...current, agentId]
    );
  };

  const testCatalogConnection = async () => {
    const validation = validateRuntimeCredentials(runtimeCatalogUrl, runtimeCatalogToken);
    if (!validation.valid) {
      setConnectionStatus("error");
      setConnectionMessage(validation.message);
      return;
    }

    setConnectionTesting(true);
    setConnectionStatus("idle");
    setConnectionMessage(null);

    try {
      const response = await fetch("/api/agents/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: "",
          catalogUrl: runtimeCatalogUrl.trim(),
          catalogToken: runtimeCatalogToken.trim() || undefined,
        } as AgentSearchRequestBody),
      });

      const data: OrgAgentSearchResponse = await response.json();
      if (!response.ok) {
        throw new Error("Connection test failed.");
      }

      if (data.catalogSource === "external") {
        const count = Array.isArray(data.agents) ? data.agents.length : 0;
        setConnectionStatus("success");
        setConnectionMessage(`Connection successful. Loaded ${count} organizational agent(s).`);
      } else {
        setConnectionStatus("error");
        const reason = data.catalogError ? ` Reason: ${data.catalogError}` : "";
        setConnectionMessage(`Connected in demo fallback mode. Verify runtime URL/token or endpoint permissions.${reason}`);
      }
    } catch {
      setConnectionStatus("error");
      setConnectionMessage("Unable to reach the organization catalog with current runtime credentials.");
    } finally {
      setConnectionTesting(false);
    }
  };

  const runAgent = async () => {
    if (!story) {
      setError("Select an Azure DevOps story first. The agent uses that story as its execution context.");
      return;
    }

    const trimmedIntent = `Generate a detailed test plan and structured test cases for ${story.key} - ${story.summary}.`;

    const hasAgent = selectedAgents.length > 0;
    const hasRagDocs = documents.length > 0;
    if (!hasAgent && !hasRagDocs) {
      setError("Attach at least one organizational agent or one RAG document before running the workflow.");
      return;
    }

    const workflow = classifyIntent(trimmedIntent);
    const agentSteps = selectedAgents.map((agent) => ({
      id: createId(agent.id),
      label: `Apply ${agent.name}`,
      status: "pending" as const,
    }));
    const planStepId = createId("plan");
    const casesStepId = createId("cases");
    const initialSteps: AgentStep[] = [
      ...agentSteps,
      { id: planStepId, label: "Generate test plan", status: "pending" },
    ];

    if (workflow.generateCases) {
      initialSteps.push({ id: casesStepId, label: "Generate structured test cases", status: "pending" });
    }

    setLoading(true);
    setError(null);
    setLastRunSummary(null);
    setSteps(initialSteps);

    try {
      for (const step of agentSteps) {
        updateStep(step.id, "running");
        const matchedAgent = selectedAgents.find((agent) => step.label === `Apply ${agent.name}`);
        updateStep(
          step.id,
          "done",
          matchedAgent ? `${matchedAgent.name} guidance merged into the workflow prompt.` : "Guidance applied."
        );
      }

      updateStep(planStepId, "running");

      const planPrompt = buildPromptFromAgents(selectedAgents, "planGuidance", trimmedIntent);

      const planResponse = await fetch("/api/generate/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story,
          provider: settings.aiProvider,
          customPrompt: planPrompt,
          documents,
          ollamaUrl: settings.ollamaUrl,
          ollamaModel: settings.ollamaModel,
          providerSettings: settings.providerSettings?.[settings.aiProvider],
        }),
      });

      const planData: PlanResponse = await planResponse.json();
      if (!planResponse.ok) {
        throw new Error(planData.error || "Failed to generate test plan");
      }
      if (!planData.plan) {
        throw new Error("The plan generation route returned an empty response.");
      }

      onPlanGenerated(planData.plan);
      updateStep(planStepId, "done", "Plan generated successfully.");

      let caseCount = 0;

      if (workflow.generateCases) {
        updateStep(casesStepId, "running");

        const casesPrompt = buildPromptFromAgents(
          selectedAgents,
          "caseGuidance",
          trimmedIntent,
          settings.customPromptMode ? customCasesPrompt : undefined
        );

        const casesResponse = await fetch("/api/generate/cases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            story,
            plan: planData.plan,
            provider: settings.aiProvider,
            customPrompt: casesPrompt,
            documents,
            ollamaUrl: settings.ollamaUrl,
            ollamaModel: settings.ollamaModel,
            providerSettings: settings.providerSettings?.[settings.aiProvider],
          }),
        });

        const casesData: CasesResponse = await casesResponse.json();
        if (!casesResponse.ok) {
          throw new Error(casesData.error || "Failed to generate test cases");
        }
        if (!casesData.cases) {
          throw new Error("The test case generation route returned an empty response.");
        }

        onCasesGenerated(casesData.cases);
        caseCount = Array.isArray(casesData.cases) ? casesData.cases.length : 0;
        updateStep(casesStepId, "done", `${caseCount} cases generated.`);
        onOpenTab("cases");
      } else {
        onOpenTab("plan");
      }

      const summary = workflow.generateCases
        ? `Execution finished with ${selectedAgents.length} selected agents. Generated a test plan and ${caseCount} structured test cases.`
        : `Execution finished with ${selectedAgents.length} selected agents. Generated a test plan for the selected story.`;

      setLastRunSummary(summary);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Agent execution failed.";
      setError(message);
      setSteps((current) =>
        current.map((step) =>
          step.status === "running" ? { ...step, status: "error", detail: message } : step
        )
      );
    } finally {
      setLoading(false);
    }
  };

  if (!story) {
    return (
      <div className="panel empty-state" style={{ height: "100%" }}>
        <span className="empty-icon">🧠</span>
        <h3>No Story Selected For The Agent</h3>
        <p>Select a work item in Azure DevOps first, then return here to run natural-language test orchestration.</p>
      </div>
    );
  }

  return (
    <div className="agent-console panel">
      <div className="agent-header">
        <div>
          <h2>Agent topology</h2>
        </div>
        <div className="agent-context-card">
          <span className="context-label">Selected Story</span>
          <strong>{selectedStorySummary}</strong>
          <span className="context-meta">{documents.length} uploaded document{documents.length === 1 ? "" : "s"}</span>
        </div>
      </div>

      <div className="agent-layout">
        <section className="agent-chat-surface">
          <div className="runtime-credentials-card">
            <div className="runtime-credentials-header">
              <h3>Organization Agent Access</h3>
              <div className="runtime-controls">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={testCatalogConnection}
                  disabled={loading || connectionTesting}
                >
                  {connectionTesting ? "Testing..." : "Test Connection"}
                </button>
              </div>
            </div>
            <div className="runtime-credentials-grid">
              <label>
                Catalog URL
                <input
                  type="text"
                  value={runtimeCatalogUrl}
                  onChange={(e) => setRuntimeCatalogUrl(e.target.value)}
                  placeholder="https://your-org-catalog/api/agents/search"
                  autoComplete="off"
                  disabled={loading || !credentialsUnlocked}
                />
              </label>
              <label>
                Access token (optional)
                <div className="token-input-wrap">
                  <input
                    type={showRuntimeToken ? "text" : "password"}
                    value={runtimeCatalogToken}
                    onChange={(e) => setRuntimeCatalogToken(e.target.value)}
                    placeholder="Bearer token"
                    autoComplete="new-password"
                    disabled={loading || !credentialsUnlocked}
                  />
                  <button
                    type="button"
                    className="token-visibility-btn"
                    onClick={() => setShowRuntimeToken((current) => !current)}
                    disabled={loading || !credentialsUnlocked}
                    title={showRuntimeToken ? "Hide token" : "Show token"}
                    aria-label={showRuntimeToken ? "Hide token" : "Show token"}
                  >
                    {showRuntimeToken ? "🙈" : "👁️"}
                  </button>
                </div>
              </label>
            </div>
            {connectionMessage && (
              <div className={`connection-status ${connectionStatus}`}>
                {connectionMessage}
              </div>
            )}
          </div>

          <div className="agent-store-shell">
            <div className="agent-store-search">
              <span className="agent-store-search-icon">⌕</span>
              <input
                type="text"
                value={agentSearch}
                onChange={(e) => setAgentSearch(e.target.value)}
                onFocus={() => {
                  if (!credentialsUnlocked) {
                    setCredentialsUnlocked(true);
                    setConnectionStatus("error");
                    setConnectionMessage("Catalog URL is required before searching organizational agents.");
                  }
                }}
                placeholder="Search organizational agents from other teams"
                disabled={loading}
              />
            </div>

            <div className="agent-catalog">
              {orgSearchLoading && (
                <div className="org-search-loading">Searching organizational agent catalog...</div>
              )}

              <div className="agent-section-block">
                <div className="agent-section-header">
                    <h4>Agent Catalog</h4>
                  <span>{filteredOrganizationAgents.length}</span>
                </div>
                <div className="agent-grid">
                  {filteredOrganizationAgents.map((agent) => {
                    const isSelected = selectedAgentIds.includes(agent.id);
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        className={`agent-card ${isSelected ? "selected" : ""}`}
                        onClick={() => toggleAgent(agent.id)}
                        disabled={loading}
                      >
                        <div className="agent-card-topline">
                          <span className="agent-card-title">{agent.name}</span>
                          <span className="agent-card-badge">{agent.badge}</span>
                        </div>
                        <p>{agent.summary}</p>
                        <div className="agent-card-meta">
                          <span>Org</span>
                          {agent.team && <span>Team: {agent.team}</span>}
                          {agent.owner && <span>Owner: {agent.owner}</span>}
                        </div>
                        <span className="agent-card-state">{isSelected ? "Included in workflow" : "Click to include"}</span>
                      </button>
                    );
                  })}
                  {filteredOrganizationAgents.length === 0 && (
                    <div className="agent-empty-search">
                      No organization agents match that search.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="attached-agents-panel">
            <div className="attached-agents-header">
              <span>Attached agents</span>
              <span className="attached-agents-count">{selectedAgents.length}</span>
            </div>
            {selectedAgents.length > 0 ? (
              <div className="attached-agents-list">
                {selectedAgents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    className="attached-agent-pill"
                    onClick={() => toggleAgent(agent.id)}
                    disabled={loading}
                    title={`Remove ${agent.name} from this prompt`}
                  >
                    <span className="attached-agent-icon">@</span>
                    <span>{agent.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="attached-agents-empty">
                No agents attached yet. Pick one or more agents from Organization agents above.
              </div>
            )}
          </div>

          {settings.customPromptMode && (
            <div className="agent-custom-instructions">
              <label>Additional Test Case Instructions</label>
              <textarea
                value={customCasesPrompt}
                onChange={(e) => setCustomCasesPrompt(e.target.value)}
                placeholder="Optional extra constraints for the test-case generation step"
                disabled={loading}
              />
            </div>
          )}

          {error && <div className="error-banner">{error}</div>}

          <div className="agent-actions">
            <button className="btn btn-primary" onClick={runAgent} disabled={loading}>
              {loading ? <span className="loader"></span> : "Run Agent Workflow"}
            </button>
            <button className="btn btn-secondary" onClick={() => onOpenTab("azure")} disabled={loading}>
              Open Story Selector
            </button>
          </div>
        </section>

        <aside className="agent-runbook">
          <KnowledgeBase
            documents={documents}
            onAddDocument={onAddDocument}
            onRemoveDocument={onRemoveDocument}
          />

          <div className="runbook-card">
            <h3>Execution Plan</h3>
            <div className="step-list">
              {steps.length === 0 && <p className="step-placeholder">No workflow has been run yet.</p>}
              {steps.map((step) => (
                <div key={step.id} className={`step-item ${step.status}`}>
                  <div className="step-header-row">
                    <span className="step-title">{step.label}</span>
                    <span className="step-status">{step.status}</span>
                  </div>
                  {step.detail && <p className="step-detail">{step.detail}</p>}
                </div>
              ))}
            </div>
          </div>

          {lastRunSummary && (
            <div className="runbook-card compact">
              <h3>Run Summary</h3>
              <div className="agent-summary">{lastRunSummary}</div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}