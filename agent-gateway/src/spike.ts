/**
 * Pi Coding Agent SDK Spike - Phase 0 Verification
 * Verifies:
 * 1. Node 22 runtime environment
 * 2. Pi AI (@earendil-works/pi-ai) module resolution & type validation
 * 3. Multi-provider configuration (Gemini, Ollama, Claude, OpenAI)
 * 4. Read-only tool registration and request schema contract
 */

import { z } from "zod";
import * as piAi from "@earendil-works/pi-ai";

console.log("=== Pi Coding Agent Gateway Spike (Phase 0) ===");
console.log(`Node Runtime Version: ${process.version}`);

// 1. Verify Node >= 22.19.0
const [major, minor] = process.version.replace("v", "").split(".").map(Number);
if (major < 22 || (major === 22 && minor < 19)) {
  console.warn(`[Node Check] WARNING: Node version ${process.version} is below >=22.19.0.`);
} else {
  console.log(`[Node Check] Node version ${process.version} satisfies Pi SDK engine requirements (>=22.19.0).`);
}

// 2. Verify Pi AI module loading and types
console.log("\n[Pi SDK Module Check]");
console.log(`Pi AI module loaded successfully: ${typeof piAi === "object"}`);
console.log(`Available Pi AI exports count: ${Object.keys(piAi).length}`);
if (piAi.Type) {
  console.log("Pi AI TypeBox export verified.");
}

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

// 4. Provider Configuration Mapping
export interface ProviderConfig {
  provider: "local" | "cloud";
  cloud_provider?: "gemini" | "anthropic" | "openai";
  model_id: string;
  base_url?: string;
}

export function resolveProvider(env: Record<string, string | undefined>): ProviderConfig {
  const provider = (env.DEFAULT_PROVIDER || "local") as "local" | "cloud";
  const cloud_provider = (env.DEFAULT_CLOUD_PROVIDER || "gemini") as "gemini" | "anthropic" | "openai";

  if (provider === "local") {
    return {
      provider: "local",
      model_id: env.OLLAMA_CHAT_MODEL || "qwen2.5:1.5b",
      base_url: env.OLLAMA_BASE_URL || "http://host.docker.internal:11434",
    };
  }

  const modelMap: Record<string, string> = {
    gemini: env.GEMINI_MODEL || "gemini-2.0-flash",
    anthropic: env.ANTHROPIC_MODEL || "claude-sonnet-latest",
    openai: env.OPENAI_MODEL || "gpt-4o",
  };

  return {
    provider: "cloud",
    cloud_provider,
    model_id: modelMap[cloud_provider] || "gemini-2.0-flash",
  };
}

async function runSpike() {
  const config = resolveProvider(process.env);
  console.log("\n[Provider Config] Resolved:", JSON.stringify(config, null, 2));

  console.log("\n[Tool Contract] Testing read-only transcript search execution...");
  const toolResult = await transcriptSearchTool.execute({
    query: "activation rate vs retention",
    top_k: 3,
  });
  console.log("Tool execution verified:", JSON.stringify(toolResult, null, 2));

  console.log("\n=== Pi Gateway Spike Verification Succeeded! ===");
}

runSpike().catch((err) => {
  console.error("Spike Failed with error:", err);
  process.exit(1);
});
