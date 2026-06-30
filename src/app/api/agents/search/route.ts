import { NextResponse } from "next/server";

type OrgAgentRecord = {
  id: string;
  name: string;
  badge: string;
  summary: string;
  planGuidance: string;
  caseGuidance: string;
  team: string;
  owner: string;
};

type AgentSearchApiResponse = {
  agents: OrgAgentRecord[];
  catalogSource: "external" | "demo";
  catalogError?: string;
};

type AgentSearchRequestBody = {
  q?: string;
  catalogUrl?: string;
  catalogToken?: string;
};

const COPILOT_STUDIO_PATH = "/copilotstudio/dataverse-backed/authenticated/bots/";

const ORG_AGENT_CATALOG: OrgAgentRecord[] = [
  {
    id: "org-upstream-process-design-ai",
    name: "Upstream Process Design AI",
    badge: "Process",
    summary: "Design assistant for upstream process engineering workflows, scope breakdown, and integration design guidance.",
    planGuidance:
      "Upstream process guidance: include process design boundaries, upstream dependencies, and integration assumptions in the test plan.",
    caseGuidance:
      "Upstream process guidance: create cases for process flow variations, interface handoffs, and failure transitions across upstream modules.",
    team: "Process Design",
    owner: "Upstream Engineering Team",
  },
  {
    id: "org-safety-compliance-agent",
    name: "Safety Compliance Agent",
    badge: "Safety",
    summary: "Ensures test artifacts align with safety and traceability obligations for industrial systems.",
    planGuidance:
      "Safety guidance: include compliance checkpoints, safety assumptions, and traceability links between requirements and scenarios.",
    caseGuidance:
      "Safety guidance: generate deterministic, auditable cases with explicit expected outcomes and safety relevance.",
    team: "Functional Safety",
    owner: "Safety Office",
  },
];

function normalizeQuery(raw: string) {
  return raw.trim().toLowerCase().replace(/^@+/, "").replace(/\s+/g, " ");
}

function sanitizeAgentRecord(input: unknown): OrgAgentRecord | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  const id = String(candidate.id || "").trim();
  const name = String(candidate.name || "").trim();

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    badge: String(candidate.badge || "Org").trim() || "Org",
    summary: String(candidate.summary || "Organization agent").trim() || "Organization agent",
    planGuidance: String(candidate.planGuidance || "Use this agent guidance while creating the test plan.").trim(),
    caseGuidance: String(candidate.caseGuidance || "Use this agent guidance while creating the test cases.").trim(),
    team: String(candidate.team || "Unknown Team").trim() || "Unknown Team",
    owner: String(candidate.owner || "Organization").trim() || "Organization",
  };
}

function looksLikeCopilotStudioUrl(url: string): boolean {
  return url.toLowerCase().includes(COPILOT_STUDIO_PATH);
}

function extractBotId(url: URL): string | null {
  const match = url.pathname.match(/\/bots\/([^/]+)\/conversations/i);
  if (!match) {
    return null;
  }
  return decodeURIComponent(match[1]);
}

function getCopilotAgentName(botId: string): string {
  const configuredName = (process.env.COPILOT_STUDIO_AGENT_NAME || "").trim();
  return configuredName || botId;
}

async function acquireServerToken(targetUrl: URL): Promise<string | null> {
  const staticToken =
    (process.env.COPILOT_STUDIO_BEARER_TOKEN || "").trim() ||
    (process.env.ORG_AGENT_CATALOG_TOKEN || "").trim();

  if (staticToken) {
    return staticToken;
  }

  const tenantId = (process.env.COPILOT_STUDIO_TENANT_ID || "").trim();
  const clientId = (process.env.COPILOT_STUDIO_CLIENT_ID || "").trim();
  const clientSecret = (process.env.COPILOT_STUDIO_CLIENT_SECRET || "").trim();
  const scopeFromEnv = (process.env.COPILOT_STUDIO_SCOPE || "").trim();

  if (!tenantId || !clientId || !clientSecret) {
    return null;
  }

  const scope = scopeFromEnv || `${targetUrl.origin}/.default`;
  const tokenEndpoint = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope,
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Entra token acquisition failed (${response.status})`);
  }

  const payload = (await response.json()) as { access_token?: string };
  const token = (payload.access_token || "").trim();
  if (!token) {
    throw new Error("Entra token acquisition did not return an access token");
  }

  return token;
}

async function searchCopilotStudioCatalog(
  query: string,
  targetUrl: URL,
  runtimeCatalogToken?: string
): Promise<OrgAgentRecord[]> {
  const botId = extractBotId(targetUrl);
  if (!botId) {
    throw new Error("Copilot Studio URL must contain /bots/{botId}/conversations");
  }

  const token = (runtimeCatalogToken || "").trim() || (await acquireServerToken(targetUrl));
  if (!token) {
    throw new Error("No token available for Copilot Studio endpoint");
  }

  const probeResponse = await fetch(targetUrl.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (probeResponse.status === 401 || probeResponse.status === 403) {
    throw new Error("Copilot Studio endpoint rejected the token");
  }

  if (probeResponse.status === 404) {
    throw new Error("Copilot Studio endpoint not found");
  }

  const agentName = getCopilotAgentName(botId);
  const candidate: OrgAgentRecord = {
    id: botId,
    name: agentName,
    badge: "Copilot",
    summary: "Protected Copilot Studio agent connected via server-side auth.",
    planGuidance: `Use organizational guidance from ${agentName} while generating a test plan.`,
    caseGuidance: `Use organizational guidance from ${agentName} while generating structured test cases.`,
    team: "Copilot Studio",
    owner: "Organization",
  };

  if (!query) {
    return [candidate];
  }

  const haystack = [candidate.id, candidate.name, candidate.badge, candidate.summary, candidate.team, candidate.owner]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query) ? [candidate] : [];
}

async function searchExternalCatalog(
  query: string,
  runtimeCatalogUrl?: string,
  runtimeCatalogToken?: string
): Promise<OrgAgentRecord[] | null> {
  const catalogUrl = runtimeCatalogUrl || process.env.ORG_AGENT_CATALOG_URL;
  if (!catalogUrl) {
    return null;
  }

  let target: URL;
  try {
    target = new URL(catalogUrl);
  } catch {
    throw new Error("Invalid organization catalog URL");
  }

  if (looksLikeCopilotStudioUrl(target.toString())) {
    return searchCopilotStudioCatalog(query, target, runtimeCatalogToken);
  }

  target.searchParams.set("q", query);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const token = runtimeCatalogToken || process.env.ORG_AGENT_CATALOG_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(target.toString(), {
    method: "GET",
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`External catalog call failed (${response.status})`);
  }

  const payload: unknown = await response.json();
  const rawAgents = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).agents)
      ? ((payload as Record<string, unknown>).agents as unknown[])
      : [];

  return rawAgents
    .map((agent) => sanitizeAgentRecord(agent))
    .filter((agent): agent is OrgAgentRecord => agent !== null);
}

function buildDemoResponse(query: string, catalogError?: string): AgentSearchApiResponse {
  const demoResults = query
    ? ORG_AGENT_CATALOG.filter((agent) =>
        [agent.name, agent.badge, agent.summary, agent.team, agent.owner].some((field) =>
          field.toLowerCase().includes(query)
        )
      )
    : ORG_AGENT_CATALOG;

  return {
    agents: demoResults,
    catalogSource: "demo",
    catalogError,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = normalizeQuery(url.searchParams.get("q") || "");
  let catalogError: string | undefined;

  try {
    const externalAgents = await searchExternalCatalog(query);
    if (externalAgents) {
      const response: AgentSearchApiResponse = {
        agents: externalAgents,
        catalogSource: "external",
      };
      return NextResponse.json(response);
    }
  } catch (error: unknown) {
    catalogError = error instanceof Error ? error.message : "External catalog is unavailable";
  }

  return NextResponse.json(buildDemoResponse(query, catalogError));
}

export async function POST(request: Request) {
  let body: AgentSearchRequestBody = {};
  try {
    body = (await request.json()) as AgentSearchRequestBody;
  } catch {
    body = {};
  }

  const query = normalizeQuery(body.q || "");
  const runtimeCatalogUrl = (body.catalogUrl || "").trim();
  const runtimeCatalogToken = (body.catalogToken || "").trim();
  let catalogError: string | undefined;

  if (runtimeCatalogUrl) {
    try {
      new URL(runtimeCatalogUrl);
    } catch {
      return NextResponse.json(
        { error: "catalogUrl is not a valid absolute URL." },
        { status: 400 }
      );
    }
  }

  try {
    const externalAgents = await searchExternalCatalog(
      query,
      runtimeCatalogUrl || undefined,
      runtimeCatalogToken || undefined
    );
    if (externalAgents) {
      const response: AgentSearchApiResponse = {
        agents: externalAgents,
        catalogSource: "external",
      };
      return NextResponse.json(response);
    }
  } catch (error: unknown) {
    catalogError = error instanceof Error ? error.message : "External catalog is unavailable";
  }

  return NextResponse.json(buildDemoResponse(query, catalogError));
}
