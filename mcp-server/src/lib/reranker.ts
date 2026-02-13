/**
 * Cohere Rerank integration for semantic tool routing.
 *
 * Uses rerank-v4.0-fast to score MCP tool descriptions against
 * a natural-language agent intent. Falls back gracefully when
 * COHERE_API_KEY is missing or the API is unreachable.
 */

import type { SessionState } from "./types.js";

/* ── types ───────────────────────────────────────────────── */

export interface ToolDocument {
  name: string;
  title: string;
  description: string;
  category: string;
  readOnly: boolean;
  destructive: boolean;
  /** Per-session-state relevance weights (0-1). */
  sessionRelevance?: Partial<Record<SessionState, number>>;
}

export interface RankedTool {
  name: string;
  title: string;
  description: string;
  category: string;
  relevance_score: number;
  /** Original index in the tool registry. */
  index: number;
}

export interface RerankResult {
  ranked_tools: RankedTool[];
  model: string;
  /** Whether Cohere was actually used or we fell back. */
  reranked: boolean;
}

/* ── constants ───────────────────────────────────────────── */

const COHERE_RERANK_URL = "https://api.cohere.com/v2/rerank";
const MODEL = "rerank-v4.0-fast";
const TIMEOUT_MS = 5_000;

/** Score blending: 70% semantic relevance + 30% session-state weight. */
const SEMANTIC_WEIGHT = 0.7;
const SESSION_WEIGHT = 0.3;

/* ── helpers ─────────────────────────────────────────────── */

/**
 * Serialize a ToolDocument into a single string for the reranker.
 * Concatenates name, title, description, category, and annotation hints.
 */
function serializeToolDocument(doc: ToolDocument): string {
  const parts = [
    `Tool: ${doc.name}`,
    `Title: ${doc.title}`,
    `Description: ${doc.description}`,
    `Category: ${doc.category}`,
  ];
  if (doc.readOnly) parts.push("This tool is read-only and safe to call.");
  if (doc.destructive) parts.push("Warning: this tool can be destructive.");
  return parts.join("\n");
}

/**
 * Apply session-state relevance multiplier to rerank scores.
 * Boosts tools that are more relevant in the current session state.
 */
function applySessionWeights(
  tools: RankedTool[],
  documents: ToolDocument[],
  sessionState?: SessionState
): RankedTool[] {
  if (!sessionState) return tools;

  return tools.map((tool) => {
    const doc = documents[tool.index];
    const weight = doc.sessionRelevance?.[sessionState] ?? 0.5;
    const blended = tool.relevance_score * SEMANTIC_WEIGHT + weight * SESSION_WEIGHT;
    return { ...tool, relevance_score: Math.round(blended * 1000) / 1000 };
  }).sort((a, b) => b.relevance_score - a.relevance_score);
}

/* ── main entry ──────────────────────────────────────────── */

/**
 * Rerank tool documents against a natural-language intent using
 * Cohere Rerank. Falls back to registry order when unavailable.
 */
export async function rerankTools(
  intent: string,
  documents: ToolDocument[],
  options: {
    topN?: number;
    sessionState?: SessionState;
  } = {}
): Promise<RerankResult> {
  const topN = Math.min(options.topN ?? 5, documents.length);
  const apiKey = process.env.COHERE_API_KEY;

  // ── fallback: no API key ──
  if (!apiKey) {
    return fallbackRank(documents, topN, options.sessionState);
  }

  // ── call Cohere Rerank ──
  try {
    const response = await fetch(COHERE_RERANK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        query: intent,
        documents: documents.map(serializeToolDocument),
        top_n: topN,
        return_documents: false,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown");
      console.error(
        `[reranker] Cohere API error ${response.status}: ${errorText}`
      );
      return fallbackRank(documents, topN, options.sessionState);
    }

    const data = (await response.json()) as {
      results: Array<{ index: number; relevance_score: number }>;
    };

    const ranked: RankedTool[] = data.results.map((r) => ({
      name: documents[r.index].name,
      title: documents[r.index].title,
      description: documents[r.index].description,
      category: documents[r.index].category,
      relevance_score: Math.round(r.relevance_score * 1000) / 1000,
      index: r.index,
    }));

    const weighted = applySessionWeights(ranked, documents, options.sessionState);

    return {
      ranked_tools: weighted.slice(0, topN),
      model: MODEL,
      reranked: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[reranker] Cohere call failed: ${msg}`);
    return fallbackRank(documents, topN, options.sessionState);
  }
}

/* ── fallback ────────────────────────────────────────────── */

function fallbackRank(
  documents: ToolDocument[],
  topN: number,
  sessionState?: SessionState
): RerankResult {
  // Without reranking, return all tools with equal scores and let
  // session weights break ties if a session state is provided.
  const all: RankedTool[] = documents.map((doc, i) => ({
    name: doc.name,
    title: doc.title,
    description: doc.description,
    category: doc.category,
    relevance_score: 0.5,
    index: i,
  }));

  const weighted = applySessionWeights(all, documents, sessionState);

  return {
    ranked_tools: weighted.slice(0, topN),
    model: "fallback",
    reranked: false,
  };
}
