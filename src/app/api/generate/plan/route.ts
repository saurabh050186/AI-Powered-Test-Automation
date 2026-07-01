import { NextResponse } from "next/server";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { getAzureOpenAIRequest, getOpenRouterHeaders, resolveProviderSettings, shouldUseAzureOpenAI } from "../../providerSettings";

export async function POST(request: Request) {
  try {
    const { story, provider, customPrompt, ollamaUrl, ollamaModel, documents, providerSettings } = await request.json();
    const runtimeSettings = resolveProviderSettings(provider, providerSettings);

    const ollamaHost = (ollamaUrl || "http://127.0.0.1:11434").replace(/\/$/, "");
    const ollamaModelName = ollamaModel || process.env.OLLAMA_MODEL || "llama3.2:latest";

    let documentContext = "";
    if (documents && documents.length > 0) {
      documentContext = "\n\n### 📚 ADDITIONAL CONTEXT FROM DOCUMENTS:\n";
      documents.forEach((doc: any) => {
        documentContext += `\n--- Document: ${doc.name} ---\n${doc.text}\n`;
      });
    }

    let prompt = `You are a QA automation expert. Create a comprehensive, well-structured Software Test Plan in Markdown format for the following User Story:

RULES:
1. Cover ALL functionalities described in the User Story — no limit on the number of Test Scenarios.
2. For each functionality, explicitly list scenarios for: normal flow, negative/invalid inputs, boundary values, permission/role variations, and error/failure conditions.
3. Decompose complex features into granular sub-scenarios — do NOT group multiple distinct behaviors into one scenario.
4. No limit on steps.
    
Story Key: ${story.key}
Summary: ${story.summary}
Description: ${story.description}
${documentContext}

Please include Objective, Scope, detailed Test Scenarios (broken down to granular level), and prerequisites. Use the additional context from documents to refine the scenarios.`;

    if (customPrompt) {
      prompt += `\n\nAdditional instructions from user:\n${customPrompt}`;
    }

    let content = "";

    try {
      if (provider === "ollama") {
        // ✅ EXPLICIT HTTP REQUEST TO BYPASS 5 MINUTE HEADERS TIMEOUT
        const isHttps = ollamaHost.startsWith("https");
        const reqModule = isHttps ? require("https") : require("http");
        const urlObj = new URL(`${ollamaHost}/api/chat`);
        
        const ollamaData: any = await new Promise((resolve, reject) => {
          const req = reqModule.request(urlObj, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            timeout: 30 * 60 * 1000 // 30 minutes
          }, (res: any) => {
            let data = "";
            res.on("data", (chunk: any) => { data += chunk; });
            res.on("end", () => {
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                try {
                  resolve(JSON.parse(data));
                } catch {
                  reject(new Error("Failed to parse JSON response from Ollama"));
                }
              } else {
                reject(new Error(`Ollama error (${res.statusCode}). Is "${ollamaModelName}" installed? Run: ollama pull ${ollamaModelName}`));
              }
            });
          });

          req.on("error", (err: any) => reject(err));
          req.on("timeout", () => {
            req.destroy();
            reject(new Error("Ollama request timed out after 30 minutes"));
          });

          req.write(JSON.stringify({
            model: ollamaModelName,
            messages: [{ role: "user", content: prompt }],
            stream: false
          }));
          req.end();
        });

        content = ollamaData.message?.content || "";
      } else if (provider === "openai") {
        if (!runtimeSettings.apiKey) throw new Error("OpenAI API Key is missing. Enter it in the UI or .env.local");
        const modelName = runtimeSettings.model;

        if (shouldUseAzureOpenAI(runtimeSettings)) {
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
              temperature: 0.7,
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
            temperature: 0.7,
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
          temperature: 0.7,
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
          temperature: 0.7,
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
          temperature: 0.7,
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
          temperature: 0.7,
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
      return NextResponse.json({ error: "No content generated from AI" }, { status: 500 });
    }

    return NextResponse.json({ plan: content });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
