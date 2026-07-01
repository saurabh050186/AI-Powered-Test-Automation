"use client";

import React, { useState } from "react";
import "./Dashboard.css";
import Sidebar from "./Sidebar";
import JiraIntegration from "./JiraIntegration";
import type { JiraSettings, JiraStory } from "./JiraIntegration";
import AzureIntegration from "./AzureIntegration";
import AgentConsole from "./AgentConsole";
import TestPlanDashboard from "./TestPlanDashboard";
import TestCaseList from "./TestCaseList";
import CodeViewer from "./CodeViewer";

type StoryDestination = "plan" | "agent";
type SelectedStory = JiraStory | Record<string, unknown>;

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("jira");

  const [azureStories, setAzureStories] = useState<any[]>([]);
  const [jiraStories, setJiraStories] = useState<JiraStory[]>([]);
  const [selectedStory, setSelectedStory] = useState<any | null>(null);
  const [testPlan, setTestPlan] = useState<string | null>(null);
  const [testCases, setTestCases] = useState<any[]>([]);
  const [selectedTestCase, setSelectedTestCase] = useState<any | null>(null);

  // Code history map: testCaseId -> generated code
  const [codeMap, setCodeMap] = useState<Record<string, string>>({});
  const [customCasesPrompt, setCustomCasesPrompt] = useState("");
  const [documents, setDocuments] = useState<any[]>([]);

  const handleAddDocument = (doc: any) => setDocuments(prev => [...prev, doc]);
  const handleRemoveDocument = (id: string) => setDocuments(prev => prev.filter(d => d.id !== id));

  // Settings state
  const [settings, setSettings] = useState<JiraSettings>({

    aiProvider: "ollama",
    customPromptMode: false,
    ollamaUrl: "http://127.0.0.1:11434",
    ollamaModel: "qwen2.5-coder:7b",
    providerSettings: {
      openrouter: {
        apiKey: "",
        model: "",
        baseUrl: "",
      },
      openai: {
        apiKey: "",
        model: "",
        baseUrl: "",
        apiVersion: "",
        deployment: "",
        apiKeyHeader: "",
      },
      anthropic: {
        apiKey: "",
        model: "",
        baseUrl: "",
      },
      nvidia: {
        apiKey: "",
        model: "",
        baseUrl: "",
      },
      deepseek: {
        apiKey: "",
        model: "",
        baseUrl: "",
      },
    },
    azureOrg: "",
    azureProject: "",
    azureToken: "",
    jiraUrl: "",
    jiraEmail: "",
    jiraToken: "",
    jiraProjectKey: "",
  });

  const handleTabChange = (tab: string) => setActiveTab(tab);

  const handleSelectStory = (story: SelectedStory, destination: StoryDestination) => {
    setSelectedStory(story);
    setTestPlan(null);
    setTestCases([]);
    setSelectedTestCase(null);
    setCodeMap({});
    setActiveTab(destination);
  };

  const handleSetCode = (testCaseId: string, code: string) => {
    setCodeMap(prev => ({ ...prev, [testCaseId]: code }));
  };

  return (
    <div className="app-wrapper">
      <header className="global-header">
        <div className="logo-section" aria-label="AI-Powered Test Orchestrator">
          <div className="logo-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48" role="img">
              <path className="logo-link logo-link-a" d="M18 17 L32 25" />
              <path className="logo-link logo-link-b" d="M17 31 L32 25" />
              <path className="logo-link logo-link-c" d="M34 27 L34 36" />
              <circle className="logo-node logo-node-primary" cx="16" cy="16" r="5" />
              <circle className="logo-node logo-node-secondary" cx="16" cy="32" r="5" />
              <circle className="logo-node logo-node-accent" cx="34" cy="25" r="5" />
              <circle className="logo-node logo-node-soft" cx="34" cy="38" r="5" />
            </svg>
          </div>
          <div className="logo-wordmark">
            <span className="logo-kicker">AI-Powered</span>
            <span className="logo-title">Test Orchestrator</span>
          </div>
        </div>
        <div className="header-title-band">
          Intelligent Test Planning, Test Cases, and Code Generation
        </div>
      </header>

      <div className="dashboard-layout">
        <Sidebar activeTab={activeTab} onTabChange={handleTabChange} settings={settings} setSettings={setSettings} />

        <main className="main-content">
          <div className="content-body">


            {activeTab === "jira" && (
              <JiraIntegration
                settings={settings}
                stories={jiraStories}
                setStories={setJiraStories}
                setSettings={setSettings}
                onSelectStory={handleSelectStory}
              />
            )}

            {activeTab === "azure" && (
              <AzureIntegration
                settings={settings}
                stories={azureStories}
                setStories={setAzureStories}
                setSettings={setSettings}
                onSelectStory={handleSelectStory}
              />
            )}

            {activeTab === "agent" && (
              <AgentConsole
                settings={settings}
                story={selectedStory}
                documents={documents}
                onAddDocument={handleAddDocument}
                onRemoveDocument={handleRemoveDocument}
                customCasesPrompt={customCasesPrompt}
                setCustomCasesPrompt={setCustomCasesPrompt}
                onPlanGenerated={setTestPlan}
                onCasesGenerated={setTestCases}
                onOpenTab={setActiveTab}
              />
            )}

            {activeTab === "plan" && (
              <TestPlanDashboard
                settings={settings}
                story={selectedStory}
                plan={testPlan}
                setPlan={setTestPlan}
                customCasesPrompt={customCasesPrompt}
                setCustomCasesPrompt={setCustomCasesPrompt}
                onTransitionToCases={() => {
                  setActiveTab("cases");
                }}
              />
            )}

            {activeTab === "cases" && (
              <TestCaseList
                settings={settings}
                story={selectedStory}
                plan={testPlan}
                documents={documents}
                cases={testCases}
                setCases={setTestCases}
                customCasesPrompt={customCasesPrompt}
                codeMap={codeMap}
                onSelectCase={(tc: any) => {
                  setSelectedTestCase(tc);
                  setActiveTab("code");
                }}
              />
            )}

            {activeTab === "code" && (
              <CodeViewer
                settings={settings}
                testCase={selectedTestCase}
                testCases={testCases}
                codeMap={codeMap}
                setCode={handleSetCode}
                onSwitchCase={(tc: any) => setSelectedTestCase(tc)}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
