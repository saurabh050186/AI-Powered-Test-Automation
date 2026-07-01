export type ProviderId = "ollama" | "openrouter" | "openai" | "anthropic" | "nvidia" | "deepseek";

export interface ProviderRuntimeSettings {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  apiVersion?: string;
  deployment?: string;
  apiKeyHeader?: string;
}

export interface ResolvedProviderSettings extends ProviderRuntimeSettings {
  apiKey: string;
  model: string;
  baseUrl: string;
  apiVersion: string;
  deployment: string;
  apiKeyHeader: string;
  hasUserBaseUrl: boolean;
}

const providerDefaults: Record<ProviderId, { apiKey: string; model: string; baseUrl: string }> = {
  ollama: {
    apiKey: "",
    model: "qwen2.5-coder:7b",
    baseUrl: "http://127.0.0.1:11434",
  },
  openrouter: {
    apiKey: "",
    model: "openai/gpt-oss-120b:free",
    baseUrl: "https://openrouter.ai/api/v1",
  },
  openai: {
    apiKey: "",
    model: "gpt-4o-mini",
    baseUrl: "",
  },
  anthropic: {
    apiKey: "",
    model: "claude-3-haiku-20240307",
    baseUrl: "https://api.anthropic.com",
  },
  nvidia: {
    apiKey: "",
    model: "meta/llama-3.1-70b-instruct",
    baseUrl: "https://integrate.api.nvidia.com/v1",
  },
  deepseek: {
    apiKey: "",
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com",
  },
};

function clean(value?: string) {
  return typeof value === "string" ? value.trim() : "";
}

function getEnvApiKey(provider: string) {
  switch (provider) {
    case "openai":
      return process.env.OPENAI_API_KEY || "";
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY || "";
    case "nvidia":
      return process.env.NVIDIA_API_KEY || "";
    case "deepseek":
      return process.env.DEEPSEEK_API_KEY || process.env.OPENROUTER_API_KEY || "";
    case "openrouter":
      return process.env.OPENROUTER_API_KEY || "";
    default:
      return "";
  }
}

function getEnvModel(provider: string) {
  switch (provider) {
    case "ollama":
      return process.env.OLLAMA_MODEL || "";
    case "openai":
      return process.env.OPENAI_MODEL || "";
    case "anthropic":
      return process.env.ANTHROPIC_MODEL || "";
    case "nvidia":
      return process.env.NVIDIA_MODEL || "";
    case "deepseek":
      return process.env.DEEPSEEK_MODEL || "";
    case "openrouter":
      return process.env.OPENROUTER_MODEL || "";
    default:
      return "";
  }
}

function getEnvBaseUrl(provider: string) {
  switch (provider) {
    case "ollama":
      return process.env.OLLAMA_HOST || "";
    case "openai":
      return process.env.AZURE_OPENAI_ENDPOINT || process.env.OPENAI_BASE_URL || "";
    case "anthropic":
      return process.env.ANTHROPIC_BASE_URL || "";
    case "nvidia":
      return process.env.NVIDIA_BASE_URL || "";
    case "deepseek":
      return process.env.DEEPSEEK_BASE_URL || "";
    case "openrouter":
      return process.env.OPENROUTER_BASE_URL || "";
    default:
      return "";
  }
}

function getEnvApiVersion(provider: string) {
  return provider === "openai" ? process.env.OPENAI_API_VERSION || "" : "";
}

function getEnvDeployment(provider: string) {
  return provider === "openai" ? process.env.OPENAI_AZURE_DEPLOYMENT || "" : "";
}

function getEnvApiKeyHeader(provider: string) {
  return provider === "openai" ? process.env.OPENAI_API_KEY_HEADER || "" : "";
}

export function resolveProviderSettings(provider: string, input?: ProviderRuntimeSettings): ResolvedProviderSettings {
  const defaults = providerDefaults[provider as ProviderId] || providerDefaults.openrouter;
  const inputApiKey = clean(input?.apiKey);
  const inputModel = clean(input?.model);
  const inputBaseUrl = clean(input?.baseUrl);
  const inputApiVersion = clean(input?.apiVersion);
  const inputDeployment = clean(input?.deployment);
  const inputApiKeyHeader = clean(input?.apiKeyHeader);
  const apiKey = inputApiKey || getEnvApiKey(provider);
  const model = inputModel || getEnvModel(provider) || defaults.model;
  const apiVersion = inputApiVersion || getEnvApiVersion(provider);
  const deployment = inputDeployment || getEnvDeployment(provider);
  const apiKeyHeader = inputApiKeyHeader || getEnvApiKeyHeader(provider);
  let baseUrl = (inputBaseUrl || getEnvBaseUrl(provider) || defaults.baseUrl).replace(/\/$/, "");

  if (provider === "deepseek" && !inputBaseUrl && !getEnvBaseUrl(provider) && apiKey.startsWith("sk-or-")) {
    baseUrl = providerDefaults.openrouter.baseUrl;
  }

  return {
    apiKey,
    model,
    baseUrl,
    apiVersion,
    deployment,
    apiKeyHeader,
    hasUserBaseUrl: Boolean(inputBaseUrl),
  };
}

export function shouldUseAzureOpenAI(settings: ResolvedProviderSettings) {
  return Boolean(
    settings.baseUrl &&
    (
      settings.apiVersion ||
      settings.deployment ||
      settings.apiKeyHeader.toLowerCase() === "api-key" ||
      (!settings.hasUserBaseUrl && !!process.env.AZURE_OPENAI_ENDPOINT)
    )
  );
}

export function getAzureOpenAIRequest(settings: ResolvedProviderSettings) {
  const endpoint = settings.baseUrl.replace(/\/$/, "");
  const deployment = settings.deployment || settings.model;
  const apiVersion = settings.apiVersion || "2024-12-01-preview";
  const authHeader = (settings.apiKeyHeader || "api-key").toLowerCase();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (authHeader === "authorization" || authHeader === "bearer") {
    headers.Authorization = `Bearer ${settings.apiKey}`;
  } else {
    headers[settings.apiKeyHeader || "api-key"] = settings.apiKey;
  }

  return {
    deployment,
    headers,
    url: `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`,
  };
}

export function getOpenRouterHeaders() {
  return {
    "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
    "X-Title": process.env.OPENROUTER_APP_NAME || "Test Orchestrator",
  };
}