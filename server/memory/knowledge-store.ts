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

export function isDuplicate(
  candidate: KnowledgeEntry,
  existing: KnowledgeEntry[],
): boolean {
  return existing.some(
    (e) =>
      e.type === candidate.type &&
      e.entities.some((entity) => candidate.entities.includes(entity)) &&
      jaccardSimilarity(e.content, candidate.content) > 0.6,
  )
}

function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(
    a
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2),
  )
  const wordsB = new Set(
    b
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2),
  )
  const intersection = [...wordsA].filter((w) => wordsB.has(w))
  const union = new Set([...wordsA, ...wordsB])
  if (union.size === 0) return 0
  return intersection.length / union.size
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
