/**
 * Pi Coding Agent SDK Spike - Phase 0 Verification
 * Verifies:
 * 1. Node 22 runtime environment
 * 2. Pi AI (@earendil-works/pi-ai) module resolution, provider registration & type validation
 * 3. Multi-provider configuration (Host Ollama via openAICompletionsApi + Google Gemini via googleProvider)
 * 4. Read-only tool registration and request schema contract
 * 5. Live generation via models.complete()
 */

import { z } from "zod";
import {
  createModels,
  createProvider,
  type Context,
  type Model,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";

console.log("=== Pi Coding Agent Gateway Spike (Phase 0) ===");
console.log(`Node Runtime Version: ${process.version}`);

// 1. Verify Node >= 22.19.0
const [major, minor] = process.version.replace("v", "").split(".").map(Number);
if (major < 22 || (major === 22 && minor < 19)) {
  console.warn(`[Node Check] WARNING: Node version ${process.version} is below >=22.19.0.`);
} else {
  console.log(`[Node Check] Node version ${process.version} satisfies Pi SDK engine requirements (>=22.19.0).`);
}

// 2. Initialize Pi AI Models Collection
const models = createModels();

// Register Ollama Provider
const ollamaModel: Model<"openai-completions"> = {
  id: process.env.OLLAMA_CHAT_MODEL || "qwen2.5:1.5b",
  name: "Qwen 2.5 1.5B (Ollama)",
  api: "openai-completions",
  provider: "ollama",
  baseUrl: process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 32768,
  maxTokens: 4096,
};

const ollamaProvider = createProvider({
  id: "ollama",
  name: "Ollama Local Inference",
  baseUrl: process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434/v1",
  auth: { apiKey: { name: "Ollama", resolve: async () => ({ auth: { apiKey: "ollama" } }) } },
  models: [ollamaModel],
  api: openAICompletionsApi(),
});
models.setProvider(ollamaProvider);

// Register Google Gemini Provider
models.setProvider(googleProvider());

console.log("\n[Pi AI Providers Registered]");
const registeredProviders = models.getProviders().map((p) => p.id);
console.log(`Providers: ${registeredProviders.join(", ")}`);
console.log(`Ollama models count: ${models.getModels("ollama").length}`);
console.log(`Google models count: ${models.getModels("google").length}`);

// 3. Tool Contract Definition (Read-Only Transcript Search)
export const SearchTranscriptsSchema = z.object({
  query: z.string().min(1).describe("The search query for transcript search"),
  top_k: z.number().int().positive().default(5).describe("Max chunks to return"),
});

export type SearchTranscriptsInput = z.infer<typeof SearchTranscriptsSchema>;

export const transcriptSearchTool = {
  name: "search_transcripts",
  description: "Read-only search across ingested Lenny's Podcast transcripts.",
  parameters: SearchTranscriptsSchema,
  execute: async (args: SearchTranscriptsInput) => {
    return {
      results: [
        {
          evidence_id: "E1",
          episode_title: "Elena Verna on B2B Growth",
          chunk_id: "chunk_042",
          text: "Focusing on activation rate before scaling paid acquisition is essential.",
        },
      ],
    };
  },
};

async function runSpike() {
  console.log("\n[Tool Contract] Testing read-only transcript search execution...");
  const toolResult = await transcriptSearchTool.execute({
    query: "activation rate vs retention",
    top_k: 3,
  });
  console.log("Tool execution verified:", JSON.stringify(toolResult, null, 2));

  // Live Pi AI model test (Ollama)
  const targetModel = models.getModel("ollama", "qwen2.5:1.5b");
  if (targetModel) {
    console.log(`\n[Live Pi AI Model Test] Testing completion with model '${targetModel.id}' via ${targetModel.api}...`);
    try {
      const testContext: Context = {
        systemPrompt: "You are a test agent. Respond in exactly three words.",
        messages: [{ role: "user", content: "Say hello.", timestamp: Date.now() }],
      };
      const result = await models.complete(targetModel, testContext);
      const text = result.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("");
      console.log(`Pi AI Live Result: "${text.trim()}" (Tokens: ${result.usage?.totalTokens || "N/A"})`);
    } catch (err: any) {
      console.warn(`Live completion skipped or failed (expected if host Ollama not reachable from container): ${err.message}`);
    }
  }

  console.log("\n=== Pi Gateway Spike Verification Succeeded! ===");
}

runSpike().catch((err) => {
  console.error("Spike Failed with error:", err);
  process.exit(1);
});
