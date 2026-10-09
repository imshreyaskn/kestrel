import express, { Request, Response } from "express";
import { z } from "zod";
import dotenv from "dotenv";
import {
  createModels,
  createProvider,
  type Context,
  type Message,
  type Model,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8010;
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434";

app.use(express.json({ limit: "2mb" }));

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

// 2. Register Built-in Google Gemini Provider
models.setProvider(googleProvider());

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
      guest: z.string().optional(),
      episode_title: z.string().optional(),
      excerpt: z.string(),
      supports: z.string().optional(),
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

// Middleware for internal service authentication
function authenticateInternal(req: Request, res: Response, next: () => void) {
  if (!INTERNAL_SERVICE_TOKEN) {
    return next();
  }
  const token = req.headers["x-internal-service-token"];
  if (token !== INTERNAL_SERVICE_TOKEN) {
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid internal service token",
    });
  }
  next();
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
          api: "openai-completions",
          provider: payload.provider === "local" ? "ollama" : "google",
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
      // Resolve or dynamically declare Ollama model on the Ollama provider
      let ollamaModel = models.getModel("ollama", payload.model_id);
      if (!ollamaModel) {
        const dynamicModel: Model<"openai-completions"> = {
          id: payload.model_id,
          name: `${payload.model_id} (Ollama Dynamic)`,
          api: "openai-completions",
          provider: "ollama",
          baseUrl: ollamaBaseApiUrl,
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 32768,
          maxTokens: 4096,
        };
        const updatedProvider = createProvider({
          id: "ollama",
          name: "Ollama Local Inference",
          baseUrl: ollamaBaseApiUrl,
          auth: { apiKey: { name: "Ollama", resolve: async () => ({ auth: { apiKey: "ollama" } }) } },
          models: [...models.getModels("ollama"), dynamicModel],
          api: openAICompletionsApi(),
        });
        models.setProvider(updatedProvider);
        ollamaModel = models.getModel("ollama", payload.model_id);
      }
      targetModel = ollamaModel;
    } else {
      // Cloud provider routing via Pi AI
      const cloudProviderName = payload.cloud_provider || "gemini";
      if (cloudProviderName === "gemini") {
        if (!process.env.GEMINI_API_KEY) {
          return res.status(400).json({
            error: "missing_api_key",
            message: "GEMINI_API_KEY environment variable is not configured on the server",
            latency_ms: Date.now() - startTime,
          });
        }
        // Match model in Google catalog
        const googleModels = models.getModels("google");
        targetModel = googleModels.find((m) => m.id === payload.model_id) || googleModels[0];
      } else {
        return res.status(501).json({
          error: "not_implemented",
          message: `Cloud provider '${cloudProviderName}' is scheduled for Phase 3`,
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
