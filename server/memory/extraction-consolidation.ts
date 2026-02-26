import type { LanguageModel } from "ai"
import type { ExtractionConsolidationConfig } from "../engine/config"
import type { KnowledgeEntry } from "./types"

/**
 * Jaccard similarity between two strings, tokenized on whitespace.
 * Words shorter than 3 chars are excluded.
 */
function jaccardSimilarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 3),
    )
  const aTokens = tokenize(a)
  const bTokens = tokenize(b)
  const intersection = [...aTokens].filter((t) => bTokens.has(t)).length
  const union = new Set([...aTokens, ...bTokens]).size
  return union > 0 ? intersection / union : 0
}

const JACCARD_THRESHOLD = 0.5

function isNearDuplicate(
  candidate: string,
  existingContent: string[],
): boolean {
  return existingContent.some(
    (ex) => jaccardSimilarity(candidate, ex) > JACCARD_THRESHOLD,
  )
}

/**
 * Consolidate extraction candidates against existing knowledge store.
 *
 * Two modes:
 * 1. Heuristic (no model): Jaccard similarity filter + max cap
 * 2. LLM (model provided): Chain of Density prompt-based consolidation (future)
 *
 * @param candidates - Raw entries from this extraction run
 * @param existingEntries - Entries already in the knowledge store
 * @param config - Consolidation config from extraction_strategy
 * @param model - Optional LLM for deeper consolidation
 */
export async function consolidateExtraction(
  candidates: KnowledgeEntry[],
  existingEntries: KnowledgeEntry[],
  config: ExtractionConsolidationConfig,
  _model?: LanguageModel,
): Promise<KnowledgeEntry[]> {
  if (candidates.length === 0) return []
  if (!config.enabled) return candidates

  const existingContent = existingEntries.map((e) => e.content)

  // Heuristic pass: remove near-duplicates of existing knowledge
  const novel = candidates.filter(
    (c) => !isNearDuplicate(c.content, existingContent),
  )

  // Cap at max_new_entries
  return novel.slice(0, config.max_new_entries)
}
