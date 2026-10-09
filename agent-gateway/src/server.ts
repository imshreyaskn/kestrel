import express, { Request, Response } from "express";
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8010;
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";

app.use(express.json({ limit: "2mb" }));

// Request validation schema matching IMPLEMENTATION_SPEC.md §6.6
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

// Generate endpoint
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
    if (payload.provider === "local") {
      // Connect to Host Ollama
      const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434";

      // Build structured system prompt
      const evidenceText = payload.evidence.length > 0
        ? payload.evidence
            .map((e) => `[${e.evidence_id}] "${e.excerpt}" (Episode: ${e.episode_title || "Unknown"}, Guest: ${e.guest || "Unknown"})`)
            .join("\n\n")
        : "No transcript evidence provided.";

      const systemPrompt = `You are the Lenny Growth Assistant (Kestrel), an evidence-grounded AI assistant.
Your answers must rely strictly on the provided transcript evidence.
Cite evidence using exact tags such as [E1], [E2].
Never fabricate facts or cite evidence not present in the provided list.
Always respond with a valid JSON object matching the requested schema:
{
  "answer_markdown": "Your detailed answer citing [E1]...",
  "citations": [{"evidence_id": "E1", "supports": "Key point supported"}],
  "insufficient_evidence": false
}

TRANSCRIPT EVIDENCE:
${evidenceText}`;

      const messages = [
        { role: "system", content: systemPrompt },
        ...payload.conversation_context.map((c) => ({ role: c.role, content: c.content })),
        { role: "user", content: payload.current_user_message },
      ];

      const ollamaRes = await fetch(`${ollamaBaseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: payload.model_id,
          messages,
          stream: false,
          format: "json",
          options: { temperature: 0.2 },
        }),
      });

      if (!ollamaRes.ok) {
        const errText = await ollamaRes.text();
        return res.status(502).json({
          error: "provider_error",
          message: `Ollama error (${ollamaRes.status}): ${errText}`,
          latency_ms: Date.now() - startTime,
        });
      }

      const ollamaData = (await ollamaRes.json()) as { message?: { content?: string } };
      const rawContent = ollamaData.message?.content || "";

      return res.json({
        request_id: payload.request_id,
        session_id: payload.session_id,
        provider: "local",
        model_id: payload.model_id,
        raw_response: rawContent,
        latency_ms: Date.now() - startTime,
      });
    }

    // Cloud provider routing
    return res.status(501).json({
      error: "not_implemented",
      message: `Cloud provider '${payload.cloud_provider || "gemini"}' handling in gateway is scheduled for Phase 3`,
      latency_ms: Date.now() - startTime,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: "internal_error",
      message: err.message || "Unknown error during generation",
      latency_ms: Date.now() - startTime,
    });
  }
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`[kestrel-agent-gateway] Listening on port ${PORT} (Node ${process.version})`);
  });
}

export default app;
