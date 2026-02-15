import { type RetrievalConfig, getRetrievalConfig, getStopWords } from "../engine/config"
import { readEntries } from "./knowledge-store"
import type { KnowledgeEntry } from "./types"

// ---- Trace Types ----

export interface TraceDetail {
  id: string
  content: string // first 80 chars
  action: "pass" | "filter"
  reason: string
  values?: Record<string, unknown>
}

export interface TraceStep {
  stage: string
  input: number
  output: number
  filtered: number
  details: TraceDetail[]
}

export interface PipelineTrace {
  query: string
  storePath: string
  steps: TraceStep[]
  config: RetrievalConfig
  entities: {
    fromMessage: string[]
    additional: string[]
    knownInStore: string[]
  }
  keywords: string[]
  timestamp: string
}

export interface RetrievalResult {
  entries: KnowledgeEntry[]
  matchedEntities: string[]
  trace?: PipelineTrace
}

// ---- Options ----

interface RetrievalOptions {
  maxEntries?: number
  additionalEntities?: string[]
  trace?: boolean
}

// ---- Main Function ----

/**
 * Retrieve knowledge entries relevant to a message.
 *
 * Strategy:
 * 1. Extract entity mentions from message (match against known entities in store)
 * 2. Retrieve entries where about.entity, entities[], or content matches
 * 3. Retrieve entries matching significant keywords by content overlap
 * 4. Sort by confidence descending
 * 5. Limit to maxEntries
 *
 * Pass { trace: true } to get per-entry decision log for debugging.
 */
export async function retrieveRelevantFacts(
  message: string,
  storePath = "data/memory/entries.jsonl",
  opts?: RetrievalOptions,
): Promise<RetrievalResult> {
  const config = getRetrievalConfig()
  const entries = await readEntries(storePath)
  const tracing = opts?.trace ?? false
  const steps: TraceStep[] = []

  // Stage 0: Filter superseded
  const active = entries.filter((e) => !e.supersededBy)
  if (tracing) {
    const superseded = entries.filter((e) => e.supersededBy)
    steps.push({
      stage: "filter_superseded",
      input: entries.length,
      output: active.length,
      filtered: superseded.length,
      details: superseded.map((e) => ({
        id: e.id,
        content: e.content.slice(0, 80),
        action: "filter" as const,
        reason: `superseded by ${e.supersededBy}`,
      })),
    })
  }

  if (active.length === 0) {
    return { entries: [], matchedEntities: [], ...(tracing && { trace: buildTrace(message, storePath, steps, [], [], [], [], config) }) }
  }

  // Stage 1: Entity extraction
  const mentionedEntities = extractEntityMentions(message, active, config.entity_name_min_length)
  const additionalEntities = (opts?.additionalEntities ?? []).map((e) => e.toLowerCase())
  for (const e of additionalEntities) {
    if (!mentionedEntities.includes(e)) {
      mentionedEntities.push(e)
    }
  }

  const knownInStore = collectKnownEntities(active, config.entity_name_min_length)

  // Stage 2: Entity match (Pass 1)
  const relevant: KnowledgeEntry[] = []
  const seen = new Set<string>()
  const entityMatchDetails: TraceDetail[] = []

  for (const entry of active) {
    let matched = false
    let matchEntity = ""
    for (const entity of mentionedEntities) {
      if (matchesEntity(entry, entity)) {
        matched = true
        matchEntity = entity
        break
      }
    }
    if (matched && !seen.has(entry.id)) {
      relevant.push(entry)
      seen.add(entry.id)
      if (tracing) {
        entityMatchDetails.push({
          id: entry.id,
          content: entry.content.slice(0, 80),
          action: "pass",
          reason: `entity match: "${matchEntity}"`,
          values: { entity: matchEntity, about: entry.about?.entity, entities: entry.entities },
        })
      }
    } else if (tracing && mentionedEntities.length > 0) {
      entityMatchDetails.push({
        id: entry.id,
        content: entry.content.slice(0, 80),
        action: seen.has(entry.id) ? "pass" : "filter",
        reason: seen.has(entry.id) ? "already matched" : `no entity match (checked: ${mentionedEntities.join(", ")})`,
        values: { about: entry.about?.entity, entities: entry.entities },
      })
    }
  }

  if (tracing) {
    const passed = entityMatchDetails.filter((d) => d.action === "pass").length
    steps.push({
      stage: "entity_match",
      input: active.length,
      output: passed,
      filtered: active.length - passed,
      details: entityMatchDetails,
    })
  }

  // Stage 3: Keyword match (Pass 2)
  const stopWords = getStopWords("retrieval")
  const keywords = extractSignificantKeywords(message, config.keyword_min_length, stopWords)
  const keywordDetails: TraceDetail[] = []

  for (const entry of active) {
    if (seen.has(entry.id)) {
      if (tracing) {
        keywordDetails.push({
          id: entry.id,
          content: entry.content.slice(0, 80),
          action: "pass",
          reason: "already matched in entity pass",
        })
      }
      continue
    }

    const overlap = keywordOverlap(keywords, entry, config.keyword_min_length)
    if (keywords.size > 0 && overlap >= config.keyword_overlap_threshold) {
      relevant.push(entry)
      seen.add(entry.id)
      if (tracing) {
        keywordDetails.push({
          id: entry.id,
          content: entry.content.slice(0, 80),
          action: "pass",
          reason: `keyword overlap ${overlap} >= threshold ${config.keyword_overlap_threshold}`,
          values: { overlap, keywords: [...keywords], threshold: config.keyword_overlap_threshold },
        })
      }
    } else if (tracing) {
      keywordDetails.push({
        id: entry.id,
        content: entry.content.slice(0, 80),
        action: "filter",
        reason: keywords.size === 0
          ? "no significant keywords in query"
          : `keyword overlap ${overlap} < threshold ${config.keyword_overlap_threshold}`,
        values: { overlap, keywords: [...keywords], threshold: config.keyword_overlap_threshold },
      })
    }
  }

  if (tracing) {
    const newPassed = keywordDetails.filter((d) => d.action === "pass" && d.reason !== "already matched in entity pass").length
    steps.push({
      stage: "keyword_match",
      input: active.length - relevant.length + newPassed,
      output: newPassed,
      filtered: active.length - relevant.length,
      details: keywordDetails,
    })
  }

  // Stage 4: Sort + limit
  relevant.sort((a, b) => b.confidence - a.confidence)
  const max = opts?.maxEntries ?? config.max_entries
  const limited = relevant.slice(0, max)

  if (tracing && relevant.length > max) {
    steps.push({
      stage: "limit",
      input: relevant.length,
      output: max,
      filtered: relevant.length - max,
      details: relevant.slice(max).map((e) => ({
        id: e.id,
        content: e.content.slice(0, 80),
        action: "filter" as const,
        reason: `exceeded max_entries limit (${max})`,
        values: { confidence: e.confidence, position: relevant.indexOf(e) },
      })),
    })
  }

  const result: RetrievalResult = {
    entries: limited,
    matchedEntities: mentionedEntities,
  }

  if (tracing) {
    result.trace = buildTrace(
      message, storePath, steps,
      mentionedEntities, additionalEntities.map((e) => e.toLowerCase()),
      [...knownInStore], [...keywords], config,
    )
  }

  return result
}

// ---- Helpers ----

function buildTrace(
  query: string,
  storePath: string,
  steps: TraceStep[],
  fromMessage: string[],
  additional: string[],
  knownInStore: string[],
  keywords: string[],
  config: RetrievalConfig,
): PipelineTrace {
  return {
    query,
    storePath,
    steps,
    config,
    entities: { fromMessage, additional, knownInStore },
    keywords,
    timestamp: new Date().toISOString(),
  }
}

function matchesEntity(entry: KnowledgeEntry, entity: string): boolean {
  const lower = entity.toLowerCase()
  if (entry.about?.entity?.toLowerCase() === lower) return true
  if (entry.entities?.some((e) => e.toLowerCase() === lower)) return true
  if (entry.content.toLowerCase().includes(lower)) return true
  return false
}

function collectKnownEntities(entries: KnowledgeEntry[], minLength: number): Set<string> {
  const known = new Set<string>()
  for (const e of entries) {
    if (e.about?.entity) known.add(e.about.entity.toLowerCase())
    for (const ent of e.entities ?? []) {
      if (ent.length >= minLength) known.add(ent.toLowerCase())
    }
  }
  return known
}

function extractEntityMentions(
  message: string,
  entries: KnowledgeEntry[],
  minLength: number,
): string[] {
  const knownEntities = collectKnownEntities(entries, minLength)
  const msgLower = message.toLowerCase()
  return [...knownEntities].filter((entity) => msgLower.includes(entity))
}

function extractSignificantKeywords(
  message: string,
  minLength: number,
  stopWords: Set<string>,
): Set<string> {
  return new Set(
    message
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= minLength && !stopWords.has(w)),
  )
}

function keywordOverlap(
  keywords: Set<string>,
  entry: KnowledgeEntry,
  minLength: number,
): number {
  const entryWords = new Set(
    entry.content
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= minLength),
  )
  let overlap = 0
  for (const kw of keywords) {
    if (entryWords.has(kw)) overlap++
  }
  return overlap
}
