import { existsSync } from "node:fs"
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { KnowledgeEntry, KnowledgeType } from "./types"

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
const STOP_WORDS = new Set([
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "a",
  "an",
  "and",
  "or",
  "but",
  "not",
  "no",
  "for",
  "to",
  "in",
  "of",
  "on",
  "at",
  "by",
  "with",
  "from",
  "that",
  "this",
  "it",
  "its",
  "has",
  "have",
  "had",
  "will",
  "can",
  "could",
  "would",
  "should",
  "do",
  "does",
  "did",
  "use",
  "uses",
  "used",
  "using",
  "also",
  "very",
  "just",
  "only",
  "must",
  "may",
  "might",
])

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
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
    const resp = await fetch(`${ollamaBaseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "nomic-embed-text:latest", input: texts }),
    })
    if (!resp.ok) return null
    const data = await resp.json()
    return data.embeddings
  } catch {
    return null // Ollama unavailable — degrade gracefully
  }
}

// --- Sync dedup (Paths 1+2 only) ---
export function isDuplicate(
  candidate: KnowledgeEntry,
  existing: KnowledgeEntry[],
): boolean {
  return existing.some((e) => {
    const contentSim = normalizedJaccard(candidate.content, e.content)
    const evidenceSim =
      candidate.evidence && e.evidence
        ? normalizedJaccard(candidate.evidence, e.evidence)
        : 0
    if (evidenceSim >= 0.5 && contentSim >= 0.2) return true
    if (contentSim >= 0.5) return true
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
            ? cosineSimilarity(candidateEmb, poolEmb) > 0.85
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
