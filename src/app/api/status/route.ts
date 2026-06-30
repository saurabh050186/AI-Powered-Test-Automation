import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getOpenRouterHeaders, resolveProviderSettings } from "../providerSettings";

const STATUS_CHECK_TIMEOUT_MS = 10000;

type OllamaModel = { name: string };
type OllamaTagsResponse = { models?: OllamaModel[] };
type StatusCheckError = {
  status?: number;
  code?: string;
  message?: string;
  cause?: { message?: string };
};

function asStatusCheckError(error: unknown): StatusCheckError {
  if (error && typeof error === "object") {
    return error as StatusCheckError;
  }
  return { message: typeof error === "string" ? error : undefined };
}

export async function POST(req: Request) {
  const { provider, ollamaUrl, ollamaModel, providerSettings } = await req.json();
  const runtimeSettings = resolveProviderSettings(provider, providerSettings);

  const ollamaHost = (ollamaUrl || "http://127.0.0.1:11434").replace(/\/$/, "");
  const ollamaModelName = ollamaModel || process.env.OLLAMA_MODEL || "qwen2.5-coder:7b";

  try {
    // Special: just return list of installed models (for UI picker)
    if (provider === "ollama_models") {
      try {
        const res = await fetch(`${ollamaHost}/api/tags`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return NextResponse.json({ models: [] });
        const data = await res.json() as OllamaTagsResponse;
        const models = (data.models || []).map((model) => model.name);
        return NextResponse.json({ models });
      } catch {
        return NextResponse.json({ models: [] });
      }
    }

    if (provider === "ollama") {
      try {
        const res = await fetch(`${ollamaHost}/api/tags`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return NextResponse.json({ status: "offline", message: "Ollama server not reachable" });
        const data = await res.json() as OllamaTagsResponse;
        const modelExists = data.models?.some(
          (model) => model.name === ollamaModelName || model.name.startsWith(ollamaModelName.split(":")[0])
        );
        if (modelExists) {
          return NextResponse.json({ status: "online", message: `🖥️ Ollama — ${ollamaModelName}` });
        } else {
          return NextResponse.json({ status: "no_model", message: `Ollama running — model "${ollamaModelName}" not found` });
        }
      } catch {
        return NextResponse.json({ status: "offline", message: "Ollama offline — start with: ollama serve" });
      }
    }

    // Cloud providers — check env key exists & make a lightweight validation call
    const keyMap: Record<string, string> = {
      openai: "OPENAI_API_KEY",
      anthropic: "ANTHROPIC_API_KEY",
      gemini: "GEMINI_API_KEY",
      nvidia: "NVIDIA_API_KEY",
      deepseek: "DEEPSEEK_API_KEY",
      openrouter: "OPENROUTER_API_KEY",
    };

    const envKey = keyMap[provider];
    const apiKey = runtimeSettings.apiKey || (envKey ? process.env[envKey] : null);

    if (!apiKey) {
      return NextResponse.json({ status: "no_key", message: `No API key configured for ${provider}` });
    }

    if (provider === "openai") {
      const prefersAzureFlow =
        !runtimeSettings.hasUserBaseUrl && !!process.env.AZURE_OPENAI_ENDPOINT ||
        (process.env.OPENAI_API_KEY_HEADER || "").toLowerCase() === "api-key" ||
        !!process.env.OPENAI_API_VERSION;
      const modelName = runtimeSettings.model;

      try {
        if (prefersAzureFlow) {
          // In Azure mode, use a dedicated endpoint var to avoid SDK baseURL/endpoint conflicts.
          const endpoint = runtimeSettings.baseUrl;
          if (!endpoint) {
            return NextResponse.json({
              status: "offline",
              message: "OpenAI — AZURE_OPENAI_ENDPOINT is missing"
            });
          }
          const deployment = process.env.OPENAI_AZURE_DEPLOYMENT || modelName;
          const apiVersion = process.env.OPENAI_API_VERSION || "2024-12-01-preview";
          const azureUrl = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
          const azureRes = await fetch(azureUrl, {
            method: "POST",
            headers: {
              "api-key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messages: [{ role: "user", content: "ping" }],
              max_tokens: 1,
              temperature: 0,
            }),
            signal: AbortSignal.timeout(STATUS_CHECK_TIMEOUT_MS),
          });

          if (!azureRes.ok) {
            const text = await azureRes.text();
            const shortBody = text ? ` ${text.slice(0, 200)}` : "";
            throw new Error(`Azure OpenAI error (${azureRes.status}).${shortBody}`.trim());
          }
        } else {
          const openAIConfig: ConstructorParameters<typeof OpenAI>[0] = {
            apiKey,
            timeout: STATUS_CHECK_TIMEOUT_MS,
            maxRetries: 0,
          };
          if (runtimeSettings.baseUrl) {
            openAIConfig.baseURL = runtimeSettings.baseUrl;
          }

          const openai = new OpenAI(openAIConfig);
          await openai.chat.completions.create({
            model: modelName,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
            temperature: 0,
          });
        }

        const usesCustomEndpoint = !!runtimeSettings.baseUrl;
        return NextResponse.json({
          status: "online",
          message: usesCustomEndpoint ? "OpenAI-compatible endpoint — Connected" : "OpenAI — Connected"
        });
      } catch (error: unknown) {
        const err = asStatusCheckError(error);
        if (err?.status === 401 || err?.status === 403) {
          return NextResponse.json({ status: "offline", message: "OpenAI — Invalid API key" });
        }
        if (err?.status === 404) {
          return NextResponse.json({ status: "offline", message: "OpenAI — 404 (check AZURE_OPENAI_ENDPOINT/OPENAI_BASE_URL and deployment/model)" });
        }
        const details = [err?.status ? `status=${err.status}` : "", err?.code ? `code=${err.code}` : "", err?.cause?.message || ""]
          .filter(Boolean)
          .join("; ");
        return NextResponse.json({
          status: "offline",
          message: `OpenAI — ${err?.message || "Unreachable"}${details ? ` (${details})` : ""}`
        });
      }
    }

    if (provider === "anthropic") {
      const anthropicBaseUrl = runtimeSettings.baseUrl || "https://api.anthropic.com";
      const res = await fetch(`${anthropicBaseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: runtimeSettings.model,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok || res.status === 200) return NextResponse.json({ status: "online", message: "Anthropic Claude — Connected" });
      if (res.status === 401) return NextResponse.json({ status: "offline", message: "Anthropic — Invalid API key" });
      return NextResponse.json({ status: "online", message: "Anthropic — Key configured" });
    }

    if (provider === "gemini") {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return NextResponse.json({ status: "online", message: "Google Gemini — Connected" });
      return NextResponse.json({ status: "offline", message: "Gemini — Invalid key or unreachable" });
    }

    if (provider === "nvidia") {
      const res = await fetch(`${runtimeSettings.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return NextResponse.json({ status: "online", message: "Nvidia NIM — Connected" });
      if (res.status === 401 || res.status === 403) return NextResponse.json({ status: "offline", message: "Nvidia — Invalid API key" });
      return NextResponse.json({ status: "online", message: "Nvidia NIM — Key configured" });
    }

    if (provider === "deepseek") {
      const useOpenRouterForDeepSeek = runtimeSettings.baseUrl.includes("openrouter.ai");
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
      };
      if (useOpenRouterForDeepSeek) {
        Object.assign(headers, getOpenRouterHeaders());
      }

      const res = await fetch(`${runtimeSettings.baseUrl}/models`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        return NextResponse.json({
          status: "online",
          message: useOpenRouterForDeepSeek ? "DeepSeek (via OpenRouter) — Connected" : "DeepSeek — Connected"
        });
      }
      if (res.status === 401 || res.status === 403) return NextResponse.json({ status: "offline", message: "DeepSeek — Invalid API key" });
      return NextResponse.json({ status: "online", message: "DeepSeek — Key configured" });
    }

    if (provider === "openrouter") {
      const res = await fetch(`${runtimeSettings.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}`, ...getOpenRouterHeaders() },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return NextResponse.json({ status: "online", message: "OpenRouter — Connected" });
      if (res.status === 401 || res.status === 403) return NextResponse.json({ status: "offline", message: "OpenRouter — Invalid API key" });
      return NextResponse.json({ status: "online", message: "OpenRouter — Key configured" });
    }

    return NextResponse.json({ status: "no_key", message: "Unknown provider" });
  } catch (error: unknown) {
    const err = asStatusCheckError(error);
    return NextResponse.json({ status: "offline", message: err.message || "Connection failed" });
  }
}
