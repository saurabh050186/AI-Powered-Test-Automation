import { NextResponse } from "next/server";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { getAzureOpenAIRequest, getOpenRouterHeaders, resolveProviderSettings, shouldUseAzureOpenAI } from "../../providerSettings";

export async function POST(request: Request) {
  try {
    const { testCase, framework, provider, customPrompt, ollamaUrl, ollamaModel, providerSettings } = await request.json();
    const runtimeSettings = resolveProviderSettings(provider, providerSettings);

    const ollamaHost = (ollamaUrl || "http://127.0.0.1:11434").replace(/\/$/, "");
    const ollamaModelName = ollamaModel || process.env.OLLAMA_MODEL || "qwen2.5-coder:7b";

    let prompt = `You are a QA automation expert. Generate ONLY ${framework} automation code (no markdown blocks, no explanation, just the raw code text) for the following test case:

ID: ${testCase.id}
Title: ${testCase.title}
Steps: ${testCase.steps.join(", ")}
Expected: ${testCase.expected}

Make sure the code is well-structured and uses best practices.`;

    if (customPrompt) {
      prompt += `\n\nAdditional instructions from user:\n${customPrompt}`;
    }

    let content = "";

    try {
      if (provider === "ollama") {
        const ollamaRes = await fetch(`${ollamaHost}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: ollamaModelName,
            messages: [{ role: "user", content: prompt }],
            stream: false
          })
        });
        if (ollamaRes.ok) {
          const ollamaData = await ollamaRes.json();
          content = ollamaData.message.content;
        } else {
          throw new Error(`Ollama error (${ollamaRes.status}). Is "${ollamaModelName}" installed? Run: ollama pull ${ollamaModelName}`);
        }
      } else if (provider === "openai") {
        if (!runtimeSettings.apiKey) throw new Error("OpenAI API Key is missing. Enter it in the UI or .env.local");
        const modelName = runtimeSettings.model;

        if (shouldUseAzureOpenAI(runtimeSettings)) {
          // In Azure mode, use a dedicated endpoint var to avoid SDK baseURL/endpoint conflicts.
          const endpoint = runtimeSettings.baseUrl;
          if (!endpoint) {
            throw new Error("AZURE_OPENAI_ENDPOINT is required for Azure-style OpenAI configuration");
          }
          const azureRequest = getAzureOpenAIRequest(runtimeSettings);
          const azureRes = await fetch(azureRequest.url, {
            method: "POST",
            headers: azureRequest.headers,
            body: JSON.stringify({
              messages: [{ role: "user", content: prompt }],
              temperature: 0.1,
            }),
          });

          if (!azureRes.ok) {
            const text = await azureRes.text();
            const shortBody = text ? ` ${text.slice(0, 300)}` : "";
            throw new Error(`Azure OpenAI error (${azureRes.status}).${shortBody}`.trim());
          }

          const completion = await azureRes.json();
          content = completion?.choices?.[0]?.message?.content || "";
        } else {
          const openAIConfig: ConstructorParameters<typeof OpenAI>[0] = {
            apiKey: runtimeSettings.apiKey,
          };
          if (runtimeSettings.baseUrl) {
            openAIConfig.baseURL = runtimeSettings.baseUrl;
          }

          const openai = new OpenAI(openAIConfig);
          const completion = await openai.chat.completions.create({
            model: modelName,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1,
          });
          content = completion.choices[0].message.content || "";
        }
      } else if (provider === "anthropic") {
        if (!runtimeSettings.apiKey) throw new Error("Anthropic API Key is missing. Enter it in the UI or .env.local");
        const anthropicConfig: ConstructorParameters<typeof Anthropic>[0] = { apiKey: runtimeSettings.apiKey };
        if (runtimeSettings.baseUrl) anthropicConfig.baseURL = runtimeSettings.baseUrl;
        const anthropic = new Anthropic(anthropicConfig);
        const msg = await anthropic.messages.create({
          model: runtimeSettings.model,
          max_tokens: 2000,
          temperature: 0.1,
          messages: [{ role: "user", content: prompt }]
        });
        content = (msg.content[0] as any).text || "";
      } else if (provider === "gemini") {
        if (!process.env.GEMINI_API_KEY) throw new Error("Gemini API Key is missing in .env.local");
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(prompt);
        content = result.response.text();
      } else if (provider === "nvidia") {
        if (!runtimeSettings.apiKey) throw new Error("Nvidia API Key is missing. Enter it in the UI or .env.local");
        const openai = new OpenAI({
          apiKey: runtimeSettings.apiKey,
          baseURL: runtimeSettings.baseUrl
        });
        const completion = await openai.chat.completions.create({
          model: runtimeSettings.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
        });
        content = completion.choices[0].message.content || "";
      } else if (provider === "deepseek") {
        if (!runtimeSettings.apiKey) throw new Error("DeepSeek API Key is missing. Enter it in the UI or .env.local");

        const useOpenRouterForDeepSeek = runtimeSettings.baseUrl.includes("openrouter.ai");
        const openAIConfig: ConstructorParameters<typeof OpenAI>[0] = {
          apiKey: runtimeSettings.apiKey,
          baseURL: runtimeSettings.baseUrl
        };

        if (useOpenRouterForDeepSeek) {
          openAIConfig.defaultHeaders = getOpenRouterHeaders();
        }

        const openai = new OpenAI(openAIConfig);
        const completion = await openai.chat.completions.create({
          model: runtimeSettings.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
        });
        content = completion.choices[0].message.content || "";
      } else if (provider === "openrouter") {
        if (!runtimeSettings.apiKey) throw new Error("OpenRouter API Key is missing. Enter it in the UI or .env.local");
        const openai = new OpenAI({
          apiKey: runtimeSettings.apiKey,
          baseURL: runtimeSettings.baseUrl,
          defaultHeaders: getOpenRouterHeaders(),
        });
        const completion = await openai.chat.completions.create({
          model: runtimeSettings.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
        });
        content = completion.choices[0].message.content || "";
      }
    } catch (err: any) {
      console.log(`AI Provider ${provider} failed: ${err.message}`);
      return NextResponse.json({
        error: `AI Generation Failed (${provider}): ${err.message}`
      }, { status: 500 });
    }

    if (!content) {
      return NextResponse.json({ error: "No code generated from AI" }, { status: 500 });
    }

    if (content.startsWith("```")) {
      content = content.replace(/^```[a-z]*\n/, "").replace(/\n```$/, "");
    }

    return NextResponse.json({ code: content });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
