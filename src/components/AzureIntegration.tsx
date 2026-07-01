"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import "./AzureIntegration.css";

interface AzureProps {
  settings: any;
  stories: any[];
  setStories: (stories: any[]) => void;
  onSelectStory: (story: any, destination: "plan" | "agent") => void;
  setSettings: (settings: any) => void;
}

export default function AzureIntegration({ settings, stories, setStories, onSelectStory, setSettings }: AzureProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedModalStory, setSelectedModalStory] = useState<any | null>(null);
  const [itemId, setItemId] = useState("");

  const handleOpenModal = (story: any) => setSelectedModalStory(story);
  const handleCloseModal = () => setSelectedModalStory(null);

  const handleSettingsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings({ ...settings, [e.target.name]: e.target.value });
  };

  const fetchStories = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/azure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          azureOrg: settings.azureOrg || "",
          azureProject: settings.azureProject || "",
          azureToken: settings.azureToken || "",
          itemId: itemId.trim()
        })
      });

      const rawBody = await res.text();
      let data: any = {};
      try {
        data = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        if (!res.ok) {
          throw new Error(`Azure API failed (${res.status}) and returned non-JSON content.`);
        }
        throw new Error("Azure API returned an unexpected non-JSON response.");
      }
      
      if (!res.ok) throw new Error(data.error || "Failed to fetch stories");
      
      setStories(data.stories);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="jira-container panel">


      <div className="jira-header">
        <div>
          <h2>Azure DevOps User Stories</h2>
          <p>Fetch requirements directly from your Azure DevOps board.</p>
        </div>
        <div className="jira-actions">
          <button className="btn btn-secondary" onClick={() => { setItemId(""); fetchStories(); }} disabled={loading}>
            {loading && !itemId ? <span className="loader"></span> : "Fetch All"}
          </button>
        </div>
      </div>

      <div className="connection-grid">
        <div className="form-group">
          <label>Azure Organization</label>
          <input type="text" name="azureOrg" value={settings.azureOrg || ""} onChange={handleSettingsChange} placeholder="e.g. myorgname" />
        </div>
        <div className="form-group">
          <label>Azure Project</label>
          <input type="text" name="azureProject" value={settings.azureProject || ""} onChange={handleSettingsChange} placeholder="e.g. MyProject" />
        </div>
        <div className="form-group connection-grid-full">
          <label>Azure PAT Token</label>
          <input type="password" name="azureToken" value={settings.azureToken || ""} onChange={handleSettingsChange} placeholder="Personal Access Token" />
        </div>
      </div>

      <div className="issue-search-block">
        <h3 className="issue-search-title">
          AZURE DEVOPS STORY ID
        </h3>
        <div className="issue-search-row">
          <input 
            type="text" 
            placeholder="e.g. 4521" 
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            className="issue-search-input"
          />
          <button 
            className="btn btn-primary" 
            onClick={fetchStories} 
            disabled={loading}
            style={{ cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading && itemId ? <span className="loader"></span> : "⚡ Fetch"}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="stories-grid">
        {stories.map(story => (
          <div key={story.id} className="story-card" onClick={() => handleOpenModal(story)}>
            <div className="story-meta">
              <span className="story-key">{story.key}</span>
              <span className={`story-status ${story.status.replace(/\s+/g, '-').toLowerCase()}`}>
                {story.status}
              </span>
            </div>
            <h3 className="story-title">{story.summary}</h3>
            <div className="story-desc">
              <ReactMarkdown>{story.description}</ReactMarkdown>
            </div>
            <div className="story-footer">
              <button 
                className="btn btn-secondary btn-sm" 
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectStory(story, "plan");
                }}
              >
                Generate Test Plan Without Knowledge Base
              </button>
              <button 
                className="btn btn-primary btn-sm" 
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectStory(story, "agent");
                }}
              >
                Generate Test Plan With Knowledge Base
              </button>
            </div>
          </div>
        ))}
        {stories.length === 0 && !loading && (
          <div className="empty-state">
            <span className="empty-icon">📭</span>
            <h3>No stories fetched yet</h3>
            <p>Click &quot;Fetch Stories&quot; to load requirements from DevOps.</p>
          </div>
        )}
      </div>

      {/* Story Detail Modal */}
      {selectedModalStory && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <header className="modal-header">
              <div className="modal-title-group">
                <span className="story-key">{selectedModalStory.key}</span>
                <h2>{selectedModalStory.summary}</h2>
              </div>
              <button className="modal-close" onClick={handleCloseModal}>&times;</button>
            </header>
            <div className="modal-body">
              <ReactMarkdown>{selectedModalStory.description}</ReactMarkdown>
            </div>
            <footer className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseModal}>Close</button>
              <button className="btn btn-primary" onClick={() => {
                onSelectStory(selectedModalStory, "plan");
                handleCloseModal();
              }}>
                Generate Test Plan Without Knowledge Base
              </button>
              <button className="btn btn-primary" onClick={() => {
                onSelectStory(selectedModalStory, "agent");
                handleCloseModal();
              }}>
                Generate Test Plan With Knowledge Base
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
