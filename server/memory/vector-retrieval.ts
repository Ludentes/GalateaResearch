/**
 * Vector-based retrieval with composite re-ranking.
 *
 * Retrieval pipeline:
 * 1. Embed query via Ollama
 * 2. Search Qdrant for vector-similar entries
 * 3. Apply composite re-ranking: similarity×0.4 + recency×0.2 + confidence×0.3 + source×0.1
 * 4. Ensure hard rules (type="rule", confidence=1.0) are always included
 * 5. Return ranked entries up to maxEntries
 *
 * Falls back to keyword retrieval if Qdrant is unavailable.
 */

import { addDecision, createPipelineRunId } from "./decision-trace"
import { batchEmbed } from "./knowledge-store"
import type { QdrantClient, QdrantSearchResult } from "./qdrant-client"
import {
  createQdrantClient,
  isQdrantAvailable,
  searchPoints,
} from "./qdrant-client"
import type { KnowledgeEntry } from "./types"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VectorRetrievalResult {
  entries: KnowledgeEntry[]
  method: "vector" | "keyword_fallback"
  vectorResults?: number
}

export interface CompositeWeights {
  similarity: number
  recency: number
  confidence: number
  source: number
}

const DEFAULT_WEIGHTS: CompositeWeights = {
  similarity: 0.4,
  recency: 0.2,
  confidence: 0.3,
  source: 0.1,
}

export interface VectorRetrievalOptions {
  maxEntries?: number
  weights?: Partial<CompositeWeights>
  entityFilter?: string
  ollamaBaseUrl?: string
  qdrantClient?: QdrantClient
}

// ---------------------------------------------------------------------------
// Source quality scoring
// ---------------------------------------------------------------------------

function sourceScore(source: string): number {
  if (source === "manual") return 1.0
  if (source.startsWith("session:")) return 0.7
  return 0.3
}

// ---------------------------------------------------------------------------
// Recency scoring — normalized to [0, 1]
// ---------------------------------------------------------------------------

function recencyScore(extractedAt: string): number {
  const ageMs = Date.now() - new Date(extractedAt).getTime()
  const ageDays = ageMs / (1000 * 60 * 60 * 24)

  // Exponential decay: score 1.0 at 0 days, ~0.5 at 7 days, ~0.1 at 30 days
  return Math.exp(-ageDays / 10)
}

// ---------------------------------------------------------------------------
// Composite scoring
// ---------------------------------------------------------------------------

export function compositeScore(
  similarity: number,
  entry: KnowledgeEntry,
  weights: CompositeWeights = DEFAULT_WEIGHTS,
): number {
  return (
    weights.similarity * similarity +
    weights.recency * recencyScore(entry.extractedAt) +
    weights.confidence * entry.confidence +
    weights.source * sourceScore(entry.source)
  )
}

// ---------------------------------------------------------------------------
// Main retrieval function
// ---------------------------------------------------------------------------

export async function retrieveVectorFacts(
  query: string,
  allEntries: KnowledgeEntry[],
  opts?: VectorRetrievalOptions,
): Promise<VectorRetrievalResult> {
  const maxEntries = opts?.maxEntries ?? 20
  const weights = { ...DEFAULT_WEIGHTS, ...opts?.weights }
  const ollamaUrl = opts?.ollamaBaseUrl ?? "http://localhost:11434"
  const client = opts?.qdrantClient ?? createQdrantClient()
  const runId = createPipelineRunId("retrieval")

  // Step 0: Collect hard rules (always included, never dropped)
  const hardRules = allEntries.filter(
    (e) => e.type === "rule" && e.confidence >= 1.0 && !e.supersededBy,
  )

  // Step 1: Check Qdrant availability
  const qdrantUp = await isQdrantAvailable(client)
  if (!qdrantUp) {
    console.warn("[retrieval] Qdrant unavailable — falling back to keyword retrieval")
    return {
      entries: hardRules.slice(0, maxEntries).map((e) =>
        addDecision(e, {
          stage: "retrieval",
          action: "pass",
          reason: "keyword fallback: Qdrant unavailable",
          inputs: { method: "keyword_fallback" },
          pipelineRunId: runId,
        }),
      ),
      method: "keyword_fallback",
    }
  }

  // Step 2: Embed query
  const embeddings = await batchEmbed([query], ollamaUrl)
  if (!embeddings || embeddings.length === 0) {
    console.warn("[retrieval] Embedding failed — falling back to keyword retrieval")
    return {
      entries: hardRules.slice(0, maxEntries).map((e) =>
        addDecision(e, {
          stage: "retrieval",
          action: "pass",
          reason: "keyword fallback: embedding failed",
          inputs: { method: "keyword_fallback" },
          pipelineRunId: runId,
        }),
      ),
      method: "keyword_fallback",
    }
  }

  const queryVector = embeddings[0]

  // Step 3: Search Qdrant
  const filter = opts?.entityFilter
    ? { should: [
        { key: "about_entity", match: { value: opts.entityFilter } },
        { key: "entities", match: { value: opts.entityFilter } },
      ] }
    : undefined

  let searchResults: QdrantSearchResult[]
  try {
    searchResults = await searchPoints(client, {
      vector: queryVector,
      limit: maxEntries * 2, // fetch extra for re-ranking
      filter,
      scoreThreshold: 0.3,
    })
  } catch (err) {
    console.warn("[retrieval] Qdrant search failed:", err)
    return {
      entries: hardRules.slice(0, maxEntries).map((e) =>
        addDecision(e, {
          stage: "retrieval",
          action: "pass",
          reason: "keyword fallback: Qdrant search failed",
          inputs: { method: "keyword_fallback" },
          pipelineRunId: runId,
        }),
      ),
      method: "keyword_fallback",
    }
  }

  // Step 4: Map search results back to KnowledgeEntry objects
  const entryMap = new Map(allEntries.map((e) => [e.id, e]))
  const scoredEntries: Array<{ entry: KnowledgeEntry; score: number }> = []

  for (const result of searchResults) {
    const entry = entryMap.get(result.id)
    if (!entry || entry.supersededBy) continue
    // Skip hard rules — they're included separately
    if (entry.type === "rule" && entry.confidence >= 1.0) continue

    scoredEntries.push({
      entry,
      score: compositeScore(result.score, entry, weights),
    })
  }

  // Step 5: Sort by composite score descending
  scoredEntries.sort((a, b) => b.score - a.score)

  // Step 6: Combine hard rules + scored entries, respecting budget
  const budgetForScored = maxEntries - hardRules.length
  const topEntries = scoredEntries
    .slice(0, Math.max(0, budgetForScored))
    .map((s) =>
      addDecision(s.entry, {
        stage: "retrieval",
        action: "pass",
        reason: "vector search: composite score above threshold",
        inputs: { compositeScore: s.score, method: "vector" },
        pipelineRunId: runId,
      }),
    )
  const combined = [...hardRules, ...topEntries]

  return {
    entries: combined,
    method: "vector",
    vectorResults: searchResults.length,
  }
}
