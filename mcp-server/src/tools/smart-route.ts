import { z } from "zod";
import { rerankTools, type ToolDocument } from "../lib/reranker.js";
import { inferSessionState } from "../lib/session-store.js";
import type { SessionState } from "../lib/types.js";

/* ── schema ──────────────────────────────────────────────── */

export const smartRouteSchema = z.object({
  intent: z
    .string()
    .describe(
      "Natural-language description of what the agent wants to do, e.g. 'am I safe to trade right now?' or 'record a winning trade'"
    ),
  top_n: z
    .number()
    .int()
    .min(1)
    .max(18)
    .optional()
    .describe("Number of tools to return (default 5, max 16)"),
  wallet_address: z
    .string()
    .optional()
    .describe(
      "Optional wallet address. When provided, the current session state (tilt, post_lockout, etc.) is used to boost contextually relevant tools."
    ),
});

/* ── types ───────────────────────────────────────────────── */

type SmartRouteInput = z.infer<typeof smartRouteSchema>;

/* ── handler factory ─────────────────────────────────────── */

/**
 * Creates the beneat_smart_route handler. Accepts pre-built tool
 * documents so we avoid circular imports with tool-registry.
 */
export function createSmartRouteHandler(documents: ToolDocument[]) {
  return async (input: SmartRouteInput) => {
    const topN = input.top_n ?? 5;

    // Derive session state if wallet is provided
    let sessionState: SessionState | undefined;
    if (input.wallet_address) {
      sessionState = inferSessionState(input.wallet_address);
    }

    const result = await rerankTools(input.intent, documents, {
      topN,
      sessionState,
    });

    return {
      intent: input.intent,
      session_state: sessionState ?? "unknown",
      reranked: result.reranked,
      model: result.model,
      tools: result.ranked_tools.map((t) => ({
        name: t.name,
        title: t.title,
        description: t.description,
        category: t.category,
        relevance_score: t.relevance_score,
      })),
      tip: result.reranked
        ? "Tools ranked by semantic relevance to your intent using Cohere Rerank."
        : "COHERE_API_KEY not configured — tools returned in default order. Set the env var for semantic routing.",
    };
  };
}
