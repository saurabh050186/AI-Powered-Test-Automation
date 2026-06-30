"use client";

import React, { Dispatch, SetStateAction, useState } from "react";
import ReactMarkdown from "react-markdown";
import "./AzureIntegration.css";

export interface JiraStory {
  id: string;
  key: string;
  summary: string;
  description: string;
  status: string;
}

export interface JiraSettings {
  aiProvider: string;
  customPromptMode: boolean;
  ollamaUrl: string;
  ollamaModel: string;
  providerSettings: Record<string, { apiKey?: string; model?: string; baseUrl?: string }>;
  azureOrg: string;
  azureProject: string;
  azureToken: string;
  jiraUrl: string;
  jiraEmail: string;
  jiraToken: string;
  jiraProjectKey: string;
}

type StoryDestination = "plan" | "agent";

interface JiraProps {
  settings: JiraSettings;
  stories: JiraStory[];
  setStories: (stories: JiraStory[]) => void;
  onSelectStory: (story: JiraStory, destination: StoryDestination) => void;
  setSettings: Dispatch<SetStateAction<JiraSettings>>;
}

export default function JiraIntegration({ settings, stories, setStories, onSelectStory, setSettings }: JiraProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issueKey, setIssueKey] = useState("");

  const handleSettingsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings({ ...settings, [e.target.name]: e.target.value });
  };

  const fetchIssues = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/jira", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jiraUrl: settings.jiraUrl || "",
          jiraEmail: settings.jiraEmail || "",
          jiraToken: settings.jiraToken || "",
          jiraProjectKey: settings.jiraProjectKey || "",
          issueKey: issueKey.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch Jira issues");

      setStories(data.stories);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch Jira issues");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="jira-container panel">
      <div className="jira-header">
        <div>
          <h2>Jira User Stories</h2>
          <p>Fetch requirements directly from your board.</p>
        </div>
        <div className="jira-actions">
          <button className="btn btn-secondary" onClick={() => { setIssueKey(""); fetchIssues(); }} disabled={loading}>
            {loading && !issueKey ? <span className="loader"></span> : "Fetch Project"}
          </button>
        </div>
      </div>

      <div className="connection-grid">
        <div className="form-group">
          <label>Jira Site URL</label>
          <input type="text" name="jiraUrl" value={settings.jiraUrl || ""} onChange={handleSettingsChange} placeholder="https://company.atlassian.net" />
        </div>
        <div className="form-group">
          <label>Jira Email</label>
          <input type="email" name="jiraEmail" value={settings.jiraEmail || ""} onChange={handleSettingsChange} placeholder="name@company.com" />
        </div>
        <div className="form-group">
          <label>Jira API Token</label>
          <input type="password" name="jiraToken" value={settings.jiraToken || ""} onChange={handleSettingsChange} placeholder="Atlassian API token" />
        </div>
        <div className="form-group">
          <label>Project Key</label>
          <input type="text" name="jiraProjectKey" value={settings.jiraProjectKey || ""} onChange={handleSettingsChange} placeholder="e.g. TEST" />
        </div>
      </div>

      <div className="issue-search-block">
        <h3 className="issue-search-title">
          JIRA ISSUE KEY
        </h3>
        <div className="issue-search-row">
          <input
            type="text"
            placeholder="e.g. TEST-123"
            value={issueKey}
            onChange={(e) => setIssueKey(e.target.value)}
            className="issue-search-input"
          />
          <button
            className="btn btn-primary"
            onClick={fetchIssues}
            disabled={loading}
            style={{ cursor: loading ? "not-allowed" : "pointer" }}
          >
            {loading && issueKey ? <span className="loader"></span> : "⚡ Fetch"}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="stories-grid">
        {stories.map(story => (
          <div key={story.id} className="story-card">
            <div className="story-meta">
              <span className="story-key">{story.key}</span>
              <span className={`story-status ${story.status.replace(/\s+/g, "-").toLowerCase()}`}>
                {story.status}
              </span>
            </div>
            <h3 className="story-title">{story.summary}</h3>
            <div className="story-desc">
              <ReactMarkdown>{story.description}</ReactMarkdown>
            </div>
            <div className="story-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => onSelectStory(story, "plan")}>Generate Test Plan Without Knowledge Base</button>
              <button className="btn btn-primary btn-sm" onClick={() => onSelectStory(story, "agent")}>Generate Test Plan With Knowledge Base</button>
            </div>
          </div>
        ))}
        {stories.length === 0 && !loading && (
          <div className="empty-state">
            <span className="empty-icon">🔗</span>
            <h3>No Jira issues fetched yet</h3>
            <p>Enter your Jira connection details, then fetch a project or issue.</p>
          </div>
        )}
      </div>
    </div>
  );
}