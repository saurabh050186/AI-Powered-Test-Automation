import { NextRequest, NextResponse } from "next/server";

type JiraIssue = {
  id: string;
  key: string;
  fields?: {
    summary?: string;
    description?: unknown;
    status?: { name?: string };
  };
};

type JiraRequestBody = {
  jiraUrl?: string;
  jiraEmail?: string;
  jiraToken?: string;
  jiraProjectKey?: string;
  issueKey?: string;
};

type JiraErrorResponse = {
  errorMessages?: string[];
  message?: string;
};

function normalizeJiraUrl(url: string) {
  return url.trim().replace(/\/$/, "");
}

function jiraDescriptionToText(description: unknown): string {
  if (!description || typeof description !== "object") return "";

  const parts: string[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const current = node as { text?: unknown; content?: unknown };
    if (typeof current.text === "string") parts.push(current.text);
    if (Array.isArray(current.content)) current.content.forEach(visit);
  };

  visit(description);
  return parts.join(" ").trim();
}

function mapIssue(issue: JiraIssue) {
  return {
    id: issue.id,
    key: issue.key,
    summary: issue.fields?.summary || issue.key,
    description: jiraDescriptionToText(issue.fields?.description) || "No description provided.",
    status: issue.fields?.status?.name || "Unknown",
  };
}

export async function POST(req: NextRequest) {
  try {
    const { jiraUrl, jiraEmail, jiraToken, jiraProjectKey, issueKey } = await req.json() as JiraRequestBody;

    if (!jiraUrl || !jiraEmail || !jiraToken) {
      return NextResponse.json({ error: "Jira URL, email, and API token are required." }, { status: 400 });
    }

    if (!issueKey && !jiraProjectKey) {
      return NextResponse.json({ error: "Enter a Jira issue key or project key." }, { status: 400 });
    }

    const baseUrl = normalizeJiraUrl(jiraUrl);
    const auth = Buffer.from(`${jiraEmail}:${jiraToken}`).toString("base64");
    const headers = {
      "Accept": "application/json",
      "Authorization": `Basic ${auth}`,
    };

    if (issueKey) {
      const response = await fetch(`${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}`, { headers });
      const data = await response.json() as JiraIssue & JiraErrorResponse;
      if (!response.ok) {
        return NextResponse.json({ error: data.errorMessages?.[0] || data.message || "Failed to fetch Jira issue." }, { status: response.status });
      }
      return NextResponse.json({ stories: [mapIssue(data)] });
    }

    const jql = `project = ${jiraProjectKey} ORDER BY updated DESC`;
    const response = await fetch(`${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=25`, { headers });
    const data = await response.json() as { issues?: JiraIssue[] } & JiraErrorResponse;
    if (!response.ok) {
      return NextResponse.json({ error: data.errorMessages?.[0] || data.message || "Failed to fetch Jira issues." }, { status: response.status });
    }

    return NextResponse.json({ stories: (data.issues || []).map(mapIssue) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Jira request failed." }, { status: 500 });
  }
}