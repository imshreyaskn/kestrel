import express, { Request, Response } from "express";
import { z } from "zod";
import dotenv from "dotenv";
import { timingSafeEqual } from "node:crypto";
import {
  createModels,
  createProvider,
  type Context,
  type Message,
  type Model,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8010;
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434";

app.use(express.json({ limit: "2mb" }));

// Structured request logging (spec §11.1): correlation IDs and counts only,
// never prompt content or transcript text.
app.use((req: Request, res: Response, next: () => void) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "info",
        service: "agent-gateway",
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: Date.now() - start,
        request_id: (req.headers["x-request-id"] as string) || null,
      })
    );
  });
  next();
});

// ---------------------------------------------------------------------------
// Pi AI Models Collection Initialization
// ---------------------------------------------------------------------------
const models = createModels();

// 1. Register Ollama Provider (OpenAI Completions API)
const ollamaBaseApiUrl = OLLAMA_BASE_URL.endsWith("/v1")
  ? OLLAMA_BASE_URL
  : `${OLLAMA_BASE_URL}/v1`;

const defaultOllamaModel: Model<"openai-completions"> = {
  id: process.env.OLLAMA_CHAT_MODEL || "qwen2.5:1.5b",
  name: "Qwen 2.5 1.5B (Ollama)",
  api: "openai-completions",
  provider: "ollama",
  baseUrl: ollamaBaseApiUrl,
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 32768,
  maxTokens: 4096,
};

const ollamaProvider = createProvider({
  id: "ollama",
  name: "Ollama Local Inference",
  baseUrl: ollamaBaseApiUrl,
  auth: { apiKey: { name: "Ollama", resolve: async () => ({ auth: { apiKey: "ollama" } }) } },
  models: [defaultOllamaModel],
  api: openAICompletionsApi(),
});
models.setProvider(ollamaProvider);

// 2. Register Built-in Cloud Providers (Google Gemini, Anthropic, OpenAI)
models.setProvider(googleProvider());
models.setProvider(anthropicProvider());
models.setProvider(openaiProvider());

// Map a cloud provider enum to its Pi AI provider id and api type. Used when
// reconstructing prior assistant turns in the conversation context.
const CLOUD_PROVIDER_META: Record<string, { providerId: string; api: string }> = {
  gemini: { providerId: "google", api: "google-generative-ai" },
  anthropic: { providerId: "anthropic", api: "anthropic-messages" },
  openai: { providerId: "openai", api: "openai-responses" },
};

// ---------------------------------------------------------------------------
// Request Validation Schema (IMPLEMENTATION_SPEC.md §6.6)
// ---------------------------------------------------------------------------
const GenerateRequestSchema = z.object({
  request_id: z.string().min(1),
  session_id: z.string().min(1),
  mode: z.enum(["research", "growth_brief", "essay", "artifact_markdown", "artifact_html"]),
  provider: z.enum(["local", "cloud"]),
  cloud_provider: z.enum(["gemini", "anthropic", "openai"]).optional(),
  model_id: z.string().min(1),
  conversation_context: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ).default([]),
  current_user_message: z.string().min(1),
  evidence: z.array(
    z.object({
      evidence_id: z.string(),
      chunk_id: z.string().optional(),
      source_id: z.string().optional(),
      guest: z.string().nullable().optional(),
      episode_title: z.string().nullable().optional(),
      excerpt: z.string(),
      supports: z.string().nullable().optional(),
    })
  ).default([]),
  system_prompt: z.string().optional(),
  product_context: z.string().nullable().optional(),
  output_contract_version: z.string().default("1.0"),
});

export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

// Health endpoint
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "kestrel-agent-gateway",
    runtime: "node",
    node_version: process.version,
    agent_framework: "@earendil-works/pi-ai",
    providers: models.getProviders().map((p) => p.id),
    uptime_seconds: process.uptime(),
  });
});

// Middleware for internal service authentication (spec §6.6).
// Fails CLOSED: an unconfigured token must never silently disable auth.
function authenticateInternal(req: Request, res: Response, next: () => void) {
  if (!INTERNAL_SERVICE_TOKEN) {
    return res.status(503).json({
      error: "internal_token_not_configured",
      message:
        "INTERNAL_SERVICE_TOKEN is not configured on the gateway; refusing unauthenticated requests.",
    });
  }
  const token = req.headers["x-internal-service-token"];
  if (typeof token !== "string" || !tokensMatch(token, INTERNAL_SERVICE_TOKEN)) {
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid internal service token",
    });
  }
  next();
}

function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

// Generate endpoint powered by Pi AI SDK
app.post("/api/v1/generate", authenticateInternal, async (req: Request, res: Response) => {
  const startTime = Date.now();
  const parseResult = GenerateRequestSchema.safeParse(req.body);

  if (!parseResult.success) {
    return res.status(400).json({
      error: "invalid_request",
      message: "Request validation failed",
      details: parseResult.error.format(),
    });
  }

  const payload = parseResult.data;

  try {
    // Build evidence-grounded system prompt
    const evidenceText = payload.evidence.length > 0
      ? payload.evidence
          .map((e) => `[${e.evidence_id}] "${e.excerpt}" (Episode: ${e.episode_title || "Unknown"}, Guest: ${e.guest || "Unknown"})`)
          .join("\n\n")
      : "No transcript evidence provided.";

    const fallbackSystemPrompt = `You are the Lenny Growth Assistant (Kestrel), an evidence-grounded AI assistant.
Your answers must rely strictly on the provided transcript evidence.
Cite evidence using exact tags such as [E1], [E2].
Never fabricate facts or cite evidence not present in the provided list.

CRITICAL INSTRUCTION: Your output MUST be a valid JSON object starting with { and ending with }.
Do not include any conversational preamble or markdown text outside the JSON object.
Schema:
{
  "answer_markdown": "Your detailed answer citing [E1]...",
  "citations": [{"evidence_id": "E1", "supports": "Summary of supported point"}],
  "insufficient_evidence": false
}

TRANSCRIPT EVIDENCE:
${evidenceText}`;

    const systemPrompt = payload.system_prompt || fallbackSystemPrompt;

    // Construct Pi AI Context Messages
    const piMessages: Message[] = [];
    const effectiveCloud = payload.cloud_provider || "gemini";
    const assistantTurnMeta =
      payload.provider === "local"
        ? { providerId: "ollama", api: "openai-completions" }
        : CLOUD_PROVIDER_META[effectiveCloud] || CLOUD_PROVIDER_META.gemini;

    for (const msg of payload.conversation_context) {
      if (msg.role === "user") {
        piMessages.push({
          role: "user",
          content: msg.content,
          timestamp: Date.now(),
        });
      } else {
        piMessages.push({
          role: "assistant",
          content: [{ type: "text", text: msg.content }],
          api: assistantTurnMeta.api,
          provider: assistantTurnMeta.providerId,
          model: payload.model_id,
          timestamp: Date.now(),
          stopReason: "stop",
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        });
      }
    }

    piMessages.push({
      role: "user",
      content: `${payload.current_user_message}\n\nRemember: Cite the evidence with tags like [E1] and populate the "citations" array with [{"evidence_id": "E1", "supports": "..."}]. Output strictly valid JSON.`,
      timestamp: Date.now(),
    });

    const piContext: Context = {
      systemPrompt,
      messages: piMessages,
    };

    let targetModel: Model<any> | undefined;

    if (payload.provider === "local") {
      // Model allowlist (spec §6.6): the gateway serves exactly the model
      // configured via OLLAMA_CHAT_MODEL. No dynamic registration of
      // arbitrary client-supplied model IDs, and no silent substitution.
      if (payload.model_id !== defaultOllamaModel.id) {
        return res.status(404).json({
          error: "model_not_allowed",
          message: `Model '${payload.model_id}' is not the configured local model ('${defaultOllamaModel.id}'). Set OLLAMA_CHAT_MODEL to change it.`,
          latency_ms: Date.now() - startTime,
        });
      }
      targetModel = models.getModel("ollama", payload.model_id);
    } else {
      // Cloud provider routing via Pi AI (spec §3.2: gemini, anthropic, openai).
      // Exact model match only: never silently substitute a different model.
      const cloudProviderName = payload.cloud_provider || "gemini";
      const providerMeta = CLOUD_PROVIDER_META[cloudProviderName];
      if (!providerMeta) {
        return res.status(501).json({
          error: "provider_not_supported",
          message: `Cloud provider '${cloudProviderName}' is not supported by this gateway.`,
          latency_ms: Date.now() - startTime,
        });
      }

      const apiKeyByProvider: Record<string, string | undefined> = {
        gemini: process.env.GEMINI_API_KEY,
        anthropic: process.env.ANTHROPIC_API_KEY,
        openai: process.env.OPENAI_API_KEY,
      };
      const apiKey = apiKeyByProvider[cloudProviderName];
      if (!apiKey) {
        return res.status(400).json({
          error: "missing_api_key",
          message: `${cloudProviderName.toUpperCase()}_API_KEY environment variable is not configured on the server`,
          latency_ms: Date.now() - startTime,
        });
      }

      const catalog = models.getModels(providerMeta.providerId);
      targetModel = catalog.find((m) => m.id === payload.model_id);
      if (!targetModel) {
        return res.status(404).json({
          error: "model_not_found",
          message: `Model '${payload.model_id}' is not available in the ${cloudProviderName} catalog. Set ${cloudProviderName.toUpperCase()}_MODEL to a valid model ID.`,
          latency_ms: Date.now() - startTime,
        });
      }
    }

    if (!targetModel) {
      return res.status(404).json({
        error: "model_not_found",
        message: `Model '${payload.model_id}' could not be resolved for provider '${payload.provider}'`,
        latency_ms: Date.now() - startTime,
      });
    }

    // Execute completion via Pi AI SDK
    const assistantResult = await models.complete(targetModel, piContext);

    // Extract text content from Pi Assistant message
    const rawContent = assistantResult.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("");

    return res.json({
      request_id: payload.request_id,
      session_id: payload.session_id,
      provider: payload.provider,
      model_id: targetModel.id,
      raw_response: rawContent,
      stop_reason: assistantResult.stopReason,
      usage: assistantResult.usage,
      latency_ms: Date.now() - startTime,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: "internal_error",
      message: err.message || "Unknown error during Pi AI generation",
      latency_ms: Date.now() - startTime,
    });
  }
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`[kestrel-agent-gateway] Listening on port ${PORT} (Node ${process.version}, powered by @earendil-works/pi-ai)`);
  });
}

export default app;
