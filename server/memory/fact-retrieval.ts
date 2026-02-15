import { readEntries } from "./knowledge-store"
import type { KnowledgeEntry } from "./types"

export interface RetrievalResult {
  entries: KnowledgeEntry[]
  matchedEntities: string[]
}

/**
 * Retrieve knowledge entries relevant to a message.
 *
 * Strategy:
 * 1. Extract entity mentions from message (match against known entities in store)
 * 2. Retrieve entries where about.entity or entities[] matches
 * 3. Retrieve domain-tagged entries matching message keywords
 * 4. Sort by confidence descending
 * 5. Limit to maxEntries
 */
export async function retrieveRelevantFacts(
  message: string,
  storePath = "data/memory/entries.jsonl",
  opts?: { maxEntries?: number; additionalEntities?: string[] },
): Promise<RetrievalResult> {
  const entries = await readEntries(storePath)
  const active = entries.filter((e) => !e.supersededBy)

  if (active.length === 0) {
    return { entries: [], matchedEntities: [] }
  }

  const mentionedEntities = extractEntityMentions(message, active)
  // Add explicitly requested entities (e.g. message sender)
  if (opts?.additionalEntities) {
    for (const e of opts.additionalEntities) {
      if (!mentionedEntities.includes(e.toLowerCase())) {
        mentionedEntities.push(e.toLowerCase())
      }
    }
  }
  const relevant: KnowledgeEntry[] = []
  const seen = new Set<string>()

  // Pass 1: entries matching mentioned entities (via about.entity or entities[])
  for (const entity of mentionedEntities) {
    for (const entry of active) {
      if (seen.has(entry.id)) continue
      if (matchesEntity(entry, entity)) {
        relevant.push(entry)
        seen.add(entry.id)
      }
    }
  }

  // Pass 2: entries matching message keywords by content overlap
  const keywords = extractSignificantKeywords(message)
  for (const entry of active) {
    if (seen.has(entry.id)) continue
    if (keywords.size > 0 && keywordOverlap(keywords, entry) >= 1) {
      relevant.push(entry)
      seen.add(entry.id)
    }
  }

  // Sort by confidence descending
  relevant.sort((a, b) => b.confidence - a.confidence)

  const max = opts?.maxEntries ?? 20
  return {
    entries: relevant.slice(0, max),
    matchedEntities: mentionedEntities,
  }
}

function matchesEntity(entry: KnowledgeEntry, entity: string): boolean {
  const lower = entity.toLowerCase()
  if (entry.about?.entity?.toLowerCase() === lower) return true
  if (entry.entities?.some((e) => e.toLowerCase() === lower)) return true
  if (entry.content.toLowerCase().includes(lower)) return true
  return false
}

function extractEntityMentions(
  message: string,
  entries: KnowledgeEntry[],
): string[] {
  // Collect all known entities from the store
  const knownEntities = new Set<string>()
  for (const e of entries) {
    if (e.about?.entity) knownEntities.add(e.about.entity.toLowerCase())
    for (const ent of e.entities ?? []) {
      if (ent.length > 2) knownEntities.add(ent.toLowerCase())
    }
  }

  // Match against message (case-insensitive)
  const msgLower = message.toLowerCase()
  return [...knownEntities].filter((entity) => msgLower.includes(entity))
}

const STOP_WORDS = new Set([
  "about", "after", "also", "been", "before", "being", "between", "both",
  "came", "come", "could", "does", "done", "each", "even", "from", "have",
  "here", "into", "just", "know", "like", "long", "look", "make", "many",
  "more", "most", "much", "must", "need", "only", "other", "over", "said",
  "same", "should", "show", "some", "such", "take", "tell", "than", "that",
  "their", "them", "then", "there", "these", "they", "this", "those", "time",
  "very", "want", "well", "were", "what", "when", "which", "will", "with",
  "work", "would", "your",
])

function extractSignificantKeywords(message: string): Set<string> {
  return new Set(
    message
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w)),
  )
}

function keywordOverlap(keywords: Set<string>, entry: KnowledgeEntry): number {
  const entryWords = new Set(
    entry.content
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3),
  )
  let overlap = 0
  for (const kw of keywords) {
    if (entryWords.has(kw)) overlap++
  }
  return overlap
}
