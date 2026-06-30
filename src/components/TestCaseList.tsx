"use client";

import React, { useState, useEffect, useCallback } from "react";
import "./TestCaseList.css";

const CASES_PER_PAGE = 5;

interface TestCaseListProps {
  settings: any;
  story: any | null;
  plan: string | null;
  cases: any[];
  setCases: (cases: any[]) => void;
  documents: any[];
  customCasesPrompt: string;
  codeMap: Record<string, string>;
  onSelectCase: (tc: any) => void;
}

export default function TestCaseList({ 
  settings, 
  story, 
  plan, 
  cases, 
  setCases, 
  documents,
  customCasesPrompt,
  codeMap, 
  onSelectCase 
}: TestCaseListProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const generateCases = useCallback(async () => {
    if (!story || !plan) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story,
          plan,
          provider: settings.aiProvider,
          customPrompt: settings.customPromptMode ? customCasesPrompt : "",
          documents: documents, // Pass documents for context
          ollamaUrl: settings.ollamaUrl,
          ollamaModel: settings.ollamaModel,
          providerSettings: settings.providerSettings?.[settings.aiProvider],
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate test cases");
      setCases(data.cases);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [story, plan, settings, customCasesPrompt, setCases]);

  useEffect(() => {
    if (story && plan && cases.length === 0 && !loading && !error) {
      generateCases();
    }
  }, [story, plan, cases.length, loading, error, generateCases]);

  const totalPages = Math.ceil(cases.length / CASES_PER_PAGE);
  const paginatedCases = cases.slice((currentPage - 1) * CASES_PER_PAGE, currentPage * CASES_PER_PAGE);

  const handleCopyAll = () => {
    const textData = cases.map(tc => {
      let text = `ID: ${tc.id}\nWork Item Type: ${tc.workItemType || "Test Case"}\nTitle: ${tc.title}\nArea Path: ${tc.areaPath || ""}\nAssigned To: ${tc.assignedTo || ""}\nState: ${tc.state || "Design"}\nSteps:\n`;
      if (tc.steps) {
        text += tc.steps.map((s: any, idx: number) => `  ${s.testStep || idx + 1}. Action: ${s.stepAction}\n     Expected: ${s.stepExpected}`).join("\n");
      }
      return text;
    }).join("\n----------------------------------------\n\n");
    navigator.clipboard.writeText(textData);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCase = (tc: any) => {
    let text = `ID: ${tc.id}\nWork Item Type: ${tc.workItemType || "Test Case"}\nTitle: ${tc.title}\nArea Path: ${tc.areaPath || ""}\nAssigned To: ${tc.assignedTo || ""}\nState: ${tc.state || "Design"}\nSteps:\n`;
    if (tc.steps) {
      text += tc.steps.map((s: any, idx: number) => `  ${s.testStep || idx + 1}. Action: ${s.stepAction}\n     Expected: ${s.stepExpected}`).join("\n");
    }
    navigator.clipboard.writeText(text);
    setCopiedId(tc.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadCSV = () => {
    // Columns matching Excel format: ID, Work Item Type, Title, Test Step, Step Action, Step Expected, Area Path, Assigned To, State
    const headers = ["ID", "Work Item Type", "Title", "Test Step", "Step Action", "Step Expected", "Area Path", "Assigned To", "State"];
    const rows: string[] = [];
    cases.forEach(tc => {
      if (tc.steps && tc.steps.length > 0) {
        tc.steps.forEach((step: any, idx: number) => {
          const row = [
            idx === 0 ? tc.id : "",
            idx === 0 ? (tc.workItemType || "Test Case") : "",
            idx === 0 ? tc.title : "",
            step.testStep || (idx + 1),
            step.stepAction || "",
            step.stepExpected || "",
            idx === 0 ? (tc.areaPath || "") : "",
            idx === 0 ? (tc.assignedTo || "") : "",
            idx === 0 ? (tc.state || "Design") : ""
          ].map(v => `"${String(v).replace(/"/g, '""')}"`);
          rows.push(row.join(","));
        });
      } else {
        const row = [
          tc.id,
          tc.workItemType || "Test Case",
          tc.title,
          "",
          "",
          "",
          tc.areaPath || "",
          tc.assignedTo || "",
          tc.state || "Design"
        ].map(v => `"${String(v).replace(/"/g, '""')}"`);
        rows.push(row.join(","));
      }
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `test-cases-${story?.key || "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!story || (!plan && !loading)) {
    return (
      <div className="panel empty-state" style={{ height: "100%" }}>
        <span className="empty-icon">📝</span>
        <h3>No Test Plan Available</h3>
        <p>Please generate a Test Plan first to create test cases.</p>
      </div>
    );
  }

  return (
    <div className="cases-container panel">
      {error && <div className="error-banner">{error}</div>}
      
      <div className="cases-header">
        <div>
          <h2>Generated Test Cases</h2>
          <p>Mapped to: <span className="highlight-tag">{story.key}</span></p>
        </div>
        {cases.length > 0 && (
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn btn-secondary btn-sm action-btn" onClick={handleCopyAll}>
              {copied ? "✅ Copied!" : "📋 Copy All"}
            </button>
            <button className="btn btn-secondary btn-sm action-btn" onClick={handleDownloadCSV}>
              ⬇️ Download CSV
            </button>
            <div className="badge">{cases.length} Cases</div>
          </div>
        )}
      </div>

      <div className="cases-list">
        {loading && (
          <div className="skeleton-list">
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton-card">
                <div className="skeleton-shimmer title"></div>
                <div className="skeleton-shimmer text"></div>
                <div className="skeleton-shimmer text"></div>
                <div className="skeleton-shimmer text short"></div>
              </div>
            ))}
          </div>
        )}

        {!loading && paginatedCases.map((tc, index) => {
          const hasCode = !!codeMap[tc.id];
          return (
            <div key={tc.id || index} className="case-item">
              <div className="case-header">
                <span className="case-id">#{tc.id}</span>
                {hasCode && <span className="code-generated-badge">✅ Code Generated</span>}
                <h3 className="case-title">{tc.title}</h3>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    className="btn btn-secondary btn-sm action-btn"
                    onClick={() => handleCopyCase(tc)}
                  >
                    {copiedId === tc.id ? "✅" : "📋"}
                  </button>
                  <button
                    className="btn btn-primary btn-sm action-btn"
                    onClick={() => onSelectCase(tc)}
                  >
                    {hasCode ? "View Code 👁️" : "Generate Code ⚡"}
                  </button>
                </div>
              </div>

              {/* Metadata row: Area Path, Assigned To, State */}
              <div style={{ display: 'flex', gap: '1.5rem', padding: '0.4rem 0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <span>🗂️ <strong>Area:</strong> {tc.areaPath || '—'}</span>
                <span>👤 <strong>Assigned To:</strong> {tc.assignedTo || 'Unassigned'}</span>
                <span>📌 <strong>State:</strong> {tc.state || 'Design'}</span>
                <span>🏷️ <strong>Type:</strong> {tc.workItemType || 'Test Case'}</span>
              </div>

              <div className="case-details" style={{ display: 'block' }}>
                <div className="case-steps">
                  <h4>Test Steps</h4>
                  <table className="steps-table" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--surface)', borderBottom: `1px solid var(--border)`}}>
                        <th style={{ padding: '0.5rem', textAlign: 'left', width: '3rem' }}>Step #</th>
                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>Step Action</th>
                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>Step Expected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tc.steps?.map((step: any, i: number) => (
                        <tr key={i} style={{ borderBottom: `1px solid var(--border)`}}>
                          <td style={{ padding: '0.5rem', verticalAlign: 'top', textAlign: 'center', fontWeight: 600 }}>{step.testStep || i + 1}</td>
                          <td style={{ padding: '0.5rem', verticalAlign: 'top', whiteSpace: 'pre-wrap' }}>{step.stepAction}</td>
                          <td style={{ padding: '0.5rem', verticalAlign: 'top', whiteSpace: 'pre-wrap' }}>{step.stepExpected}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!loading && totalPages > 1 && (
        <div className="pagination">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            ← Prev
          </button>
          <span className="page-info">Page {currentPage} of {totalPages}</span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
