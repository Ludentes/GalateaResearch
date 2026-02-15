import { existsSync } from "node:fs"
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { getDedupConfig, getStopWords } from "../engine/config"
import { ollamaQueue } from "../providers/ollama-queue"
import type {
  KnowledgeEntry,
  KnowledgeSubjectType,
  KnowledgeType,
} from "./types"

export async function readEntries(
  storePath: string,
): Promise<KnowledgeEntry[]> {
  if (!existsSync(storePath)) return []
  const content = await readFile(storePath, "utf-8")
  return content
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

export async function appendEntry(
  entry: KnowledgeEntry,
  storePath: string,
): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true })
  await appendFile(storePath, `${JSON.stringify(entry)}\n`)
}

export async function appendEntries(
  entries: KnowledgeEntry[],
  storePath: string,
): Promise<void> {
  if (entries.length === 0) return
  await mkdir(path.dirname(storePath), { recursive: true })
  const lines = entries.map((e) => JSON.stringify(e)).join("\n")
  await appendFile(storePath, `${lines}\n`)
}

// --- Stop words + tokenization ---

function tokenize(text: string): Set<string> {
  const cfg = getDedupConfig()
  const stopWords = getStopWords("dedup")
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter(
        (w) => w.length >= cfg.tokenize_min_word_length && !stopWords.has(w),
      ),
  )
}

export function normalizedJaccard(a: string, b: string): number {
  const wordsA = tokenize(a)
  const wordsB = tokenize(b)
  const intersection = [...wordsA].filter((w) => wordsB.has(w))
  const union = new Set([...wordsA, ...wordsB])
  if (union.size === 0) return 0
  return intersection.length / union.size
}

// --- Embedding helpers ---
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

export async function batchEmbed(
  texts: string[],
  ollamaBaseUrl: string,
): Promise<number[][] | null> {
  try {
    console.log(
      `[embed] batchEmbed start: ${texts.length} texts, total ${texts.reduce((s, t) => s + t.length, 0)} chars`,
    )
    const t0 = Date.now()
    const resp = await ollamaQueue.enqueue(
      () =>
        fetch(`${ollamaBaseUrl}/api/embed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "nomic-embed-text:latest",
            input: texts,
          }),
          signal: AbortSignal.timeout(30_000),
        }),
      "batch",
    )
    if (!resp.ok) {
      console.log(
        `[embed] batchEmbed failed: HTTP ${resp.status} in ${Date.now() - t0}ms`,
      )
      return null
    }
    const data = await resp.json()
    console.log(
      `[embed] batchEmbed done: ${data.embeddings?.length ?? 0} embeddings in ${Date.now() - t0}ms`,
    )
    return data.embeddings
  } catch (err) {
    console.log(
      `[embed] batchEmbed error: ${err instanceof Error ? err.message : err}`,
    )
    return null // Ollama unavailable — degrade gracefully
  }
}

// --- Sync dedup (Paths 1+2 only) ---
export function isDuplicate(
  candidate: KnowledgeEntry,
  existing: KnowledgeEntry[],
): boolean {
  const cfg = getDedupConfig()
  return existing.some((e) => {
    const contentSim = normalizedJaccard(candidate.content, e.content)
    const evidenceSim =
      candidate.evidence && e.evidence
        ? normalizedJaccard(candidate.evidence, e.evidence)
        : 0
    if (
      evidenceSim >= cfg.evidence_jaccard_threshold &&
      contentSim >= cfg.content_with_evidence_threshold
    )
      return true
    if (contentSim >= cfg.content_jaccard_threshold) return true
    return false
  })
}

// --- Full dedup with embeddings (Paths 1+2+3) ---
export async function deduplicateEntries(
  candidates: KnowledgeEntry[],
  existing: KnowledgeEntry[],
  ollamaBaseUrl = "http://localhost:11434",
): Promise<{ unique: KnowledgeEntry[]; duplicatesSkipped: number }> {
  const unique: KnowledgeEntry[] = []
  let duplicatesSkipped = 0

  // Pre-compute embeddings for all entries (null if Ollama unavailable)
  const allTexts = [...existing, ...candidates].map((e) => e.content)
  const embeddings =
    allTexts.length > 0 ? await batchEmbed(allTexts, ollamaBaseUrl) : null

  // Build embedding map by entry ID for easy lookup
  const embMap = new Map<string, number[]>()
  if (embeddings && embeddings.length === allTexts.length) {
    const allEntries = [...existing, ...candidates]
    for (let i = 0; i < allEntries.length; i++) {
      embMap.set(allEntries[i].id, embeddings[i])
    }
  }

  for (const entry of candidates) {
    const pool = [...existing, ...unique]

    // Paths 1+2: Jaccard-based
    if (isDuplicate(entry, pool)) {
      duplicatesSkipped++
      continue
    }

    // Path 3: Embedding cosine similarity
    if (embMap.size > 0) {
      const candidateEmb = embMap.get(entry.id)
      if (candidateEmb) {
        const isDup = pool.some((e) => {
          const poolEmb = embMap.get(e.id)
          return poolEmb
            ? cosineSimilarity(candidateEmb, poolEmb) >
                getDedupConfig().embedding_cosine_threshold
            : false
        })
        if (isDup) {
          duplicatesSkipped++
          continue
        }
      }
    }

    unique.push(entry)
  }

  return { unique, duplicatesSkipped }
}

const SECTION_MAP: Record<KnowledgeType, string> = {
  preference: "Preferences",
  fact: "Facts",
  rule: "Rules",
  procedure: "Procedures",
  correction: "Corrections",
  decision: "Decisions",
}

export async function renderMarkdown(
  entries: KnowledgeEntry[],
  mdPath: string,
): Promise<string> {
  const active = entries.filter((e) => !e.supersededBy)
  const sections: Record<string, KnowledgeEntry[]> = {}

  for (const entry of active) {
    const section = SECTION_MAP[entry.type] || "Other"
    if (!sections[section]) sections[section] = []
    sections[section].push(entry)
  }

  let md = "# Galatea Agent Memory\n\n"
  for (const [section, items] of Object.entries(sections)) {
    md += `## ${section}\n\n`
    for (const item of items.sort((a, b) => b.confidence - a.confidence)) {
      md += `- ${item.content}\n`
    }
    md += "\n"
  }

  await mkdir(path.dirname(mdPath), { recursive: true })
  await writeFile(mdPath, md)
  return md
}

// ============ Cognitive Model Queries ============
// These are views over the knowledge store, not separate data structures.
// See: server/memory/types.ts for design rationale.

/**
 * Filter entries by subject type (e.g., "user" → all user-related knowledge).
 * Entries without `about` are treated as project-scoped.
 */
export function entriesBySubjectType(
  entries: KnowledgeEntry[],
  type: KnowledgeSubjectType,
): KnowledgeEntry[] {
  if (type === "project") {
    return entries.filter((e) => !e.about || e.about.type === "project")
  }
  return entries.filter((e) => e.about?.type === type)
}

/**
 * Filter entries about a specific entity (e.g., "mary" → all knowledge about Mary).
 */
export function entriesByEntity(
  entries: KnowledgeEntry[],
  entity: string,
): KnowledgeEntry[] {
  const lower = entity.toLowerCase()
  return entries.filter((e) => {
    if (e.about?.entity?.toLowerCase() === lower) return true
    if (e.entities?.some((ent) => ent.toLowerCase() === lower)) return true
    // Also check content for entity name mention (handles entries with no about/entities)
    if (e.content.toLowerCase().includes(lower)) return true
    return false
  })
}

/**
 * Get all distinct entities of a given type.
 * Useful for: "list all known users" or "list all known domains".
 */
export function distinctEntities(
  entries: KnowledgeEntry[],
  type?: KnowledgeSubjectType,
): string[] {
  const entities = new Set<string>()
  for (const e of entries) {
    if (!e.about) continue
    if (type && e.about.type !== type) continue
    entities.add(e.about.entity)
  }
  return [...entities].sort()
}

/**
 * Mark an entry as superseded by a newer entry.
 * Rewrites the entire store (entries are small enough for full rewrite).
 */
export async function supersedeEntry(
  oldEntryId: string,
  newEntryId: string,
  storePath = "data/memory/entries.jsonl",
): Promise<void> {
  const entries = await readEntries(storePath)
  const updated = entries.map((e) =>
    e.id === oldEntryId ? { ...e, supersededBy: newEntryId } : e,
  )
  await writeEntries(updated, storePath)
}

/**
 * Overwrite the entire store with the given entries.
 */
export async function writeEntries(
  entries: KnowledgeEntry[],
  storePath: string,
): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true })
  const lines = entries.map((e) => JSON.stringify(e)).join("\n")
  await writeFile(storePath, lines ? `${lines}\n` : "")
}
