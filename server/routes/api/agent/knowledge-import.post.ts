import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { defineEventHandler, HTTPError, readBody } from "h3"
import { loadAgentSpec } from "../../../agent/agent-spec"
import {
  appendEntries,
  deduplicateEntries,
  readEntries,
} from "../../../memory/knowledge-store"
import type { KnowledgeEntry, KnowledgeType } from "../../../memory/types"

interface ImportBody {
  agentId?: string
  /** If true, replace the entire store instead of merging */
  replace?: boolean
}

/**
 * Import shadow-learning-format markdown files back into the knowledge store.
 *
 * POST /api/agent/knowledge-import { agentId: "beki" }
 *
 * Reads from data/agents/{agentId}/memory/ and merges entries into the
 * agent's JSONL knowledge store, deduplicating against existing entries.
 */

function parseFrontmatter(content: string): {
  meta: Record<string, string>
  body: string
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { meta: {}, body: content }

  const meta: Record<string, string> = {}
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":")
    if (idx > 0) {
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    }
  }
  return { meta, body: match[2].trim() }
}

const VALID_TYPES: KnowledgeType[] = [
  "preference",
  "fact",
  "rule",
  "procedure",
  "correction",
  "decision",
]

async function parsePatternFile(filePath: string): Promise<KnowledgeEntry[]> {
  const content = await readFile(filePath, "utf-8")
  const { meta, body } = parseFrontmatter(content)

  // If file has an `id` in frontmatter, it was exported from our store
  if (meta.id) {
    const type = VALID_TYPES.includes(meta.type as KnowledgeType)
      ? (meta.type as KnowledgeType)
      : "fact"

    // Extract evidence from blockquote if present
    const evidenceMatch = body.match(/^> Evidence: (.+)$/m)
    const mainContent = body.replace(/^> Evidence: .+$/m, "").trim()

    return [
      {
        id: meta.id,
        type,
        content: mainContent,
        confidence: Number.parseFloat(meta.confidence) || 0.8,
        entities: [],
        source: meta.source || `import:${path.basename(filePath)}`,
        extractedAt: meta.extractedAt || new Date().toISOString(),
        ...(evidenceMatch ? { evidence: evidenceMatch[1] } : {}),
      },
    ]
  }

  // New manually-created pattern file — parse bullet points as entries
  const entries: KnowledgeEntry[] = []
  const bulletLines = body.split("\n").filter((l) => l.startsWith("- "))

  // Derive about metadata from entity files (frontmatter has name field)
  const about =
    meta.type === "entity" && meta.name
      ? { entity: meta.name, type: "user" as const }
      : undefined

  for (const line of bulletLines) {
    // Extract type annotation from **[type]** prefix if present
    const typeMatch = line.match(/^- \*\*\[(\w+)\]\*\* (.+)$/)
    const entryType = typeMatch?.[1] as KnowledgeType | undefined
    const text = typeMatch
      ? typeMatch[2].trim()
      : line.replace(/^- /, "").trim()
    // Strip trailing confidence annotation
    const cleaned = text.replace(/\s*\(confidence: [\d.]+\)$/, "")
    if (!cleaned) continue

    entries.push({
      id: `import-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type:
        entryType && VALID_TYPES.includes(entryType)
          ? entryType
          : (meta.type as KnowledgeType) || "fact",
      content: cleaned,
      confidence: 0.8,
      entities: [],
      source: `import:${path.basename(filePath)}`,
      extractedAt: new Date().toISOString(),
      ...(about ? { about } : {}),
    })
  }

  return entries
}

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as ImportBody

  if (!body.agentId) {
    throw new HTTPError("Missing required field: agentId", { status: 400 })
  }

  const agentId = body.agentId
  const importDir = `data/agents/${agentId}/memory`

  if (!existsSync(importDir)) {
    throw new HTTPError(
      `No memory export found at ${importDir}. Run knowledge-export first.`,
      { status: 404 },
    )
  }

  let storePath = "data/memory/entries.jsonl"
  try {
    const spec = await loadAgentSpec(agentId)
    if (spec.knowledge_store) storePath = spec.knowledge_store
  } catch {
    // Use default
  }

  // Collect entries from all markdown files
  const allImported: KnowledgeEntry[] = []
  const dirs = ["patterns", "entities", "facts"]

  for (const dir of dirs) {
    const dirPath = path.join(importDir, dir)
    if (!existsSync(dirPath)) continue

    const files = await readdir(dirPath)
    for (const file of files) {
      if (!file.endsWith(".md")) continue
      const entries = await parsePatternFile(path.join(dirPath, file))
      allImported.push(...entries)
    }
  }

  if (allImported.length === 0) {
    return {
      ok: true,
      agentId,
      imported: 0,
      duplicatesSkipped: 0,
      message: "No entries found in export directory",
    }
  }

  if (body.replace) {
    // Full replace — write all imported entries directly
    const { writeEntries } = await import("../../../memory/knowledge-store")
    await writeEntries(allImported, storePath)
    return {
      ok: true,
      agentId,
      imported: allImported.length,
      duplicatesSkipped: 0,
      mode: "replace",
    }
  }

  // Merge mode — deduplicate against existing
  const existing = await readEntries(storePath)
  const { unique, duplicatesSkipped } = await deduplicateEntries(
    allImported,
    existing,
  )

  if (unique.length > 0) {
    await appendEntries(unique, storePath)
  }

  return {
    ok: true,
    agentId,
    imported: unique.length,
    duplicatesSkipped,
    mode: "merge",
    totalInStore: existing.length + unique.length,
  }
})
