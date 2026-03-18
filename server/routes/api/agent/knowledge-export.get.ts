import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { defineEventHandler, getQuery, HTTPError } from "h3"
import { loadAgentDefaultSpec } from "../../../agent/agent-spec"
import { readEntries } from "../../../memory/knowledge-store"
import type { KnowledgeEntry, KnowledgeType } from "../../../memory/types"

/**
 * Export an agent's knowledge store to shadow-learning-compatible markdown files.
 *
 * GET /api/agent/knowledge-export?agentId=beki
 *
 * Produces files under data/agents/{agentId}/memory/:
 *   MEMORY.md        — index file
 *   patterns/*.md    — rules, corrections, procedures
 *   entities/*.md    — per-entity knowledge
 *   facts/*.md       — grouped factual knowledge
 */

const PATTERN_TYPES: KnowledgeType[] = ["rule", "correction", "procedure"]
const FACT_TYPES: KnowledgeType[] = ["fact", "decision"]
const PREF_TYPES: KnowledgeType[] = ["preference"]

function slugify(text: string, id?: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)
  // Append short ID suffix to prevent collisions
  const suffix = id ? `-${id.slice(-6)}` : ""
  return `${base}${suffix}`
}

function entryToMarkdown(entry: KnowledgeEntry): string {
  const lines = [
    "---",
    `name: ${slugify(entry.content.slice(0, 60), entry.id)}`,
    `description: ${entry.content.slice(0, 120)}`,
    `type: ${entry.type}`,
    `confidence: ${entry.confidence}`,
    `source: ${entry.source}`,
    `extractedAt: ${entry.extractedAt}`,
    `id: ${entry.id}`,
  ]
  if (entry.about) {
    lines.push(`about: ${entry.about.entity} (${entry.about.type})`)
  }
  lines.push("---", "", entry.content)
  if (entry.evidence) {
    lines.push("", `> Evidence: ${entry.evidence}`)
  }
  return lines.join("\n") + "\n"
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const agentId = query.agentId as string

  if (!agentId) {
    throw new HTTPError("Missing required query param: agentId", {
      status: 400,
    })
  }

  let storePath = "data/memory/entries.jsonl"
  try {
    const spec = await loadAgentDefaultSpec(agentId)
    if (spec.knowledge_store) storePath = spec.knowledge_store
  } catch {
    // Use default
  }

  const entries = await readEntries(storePath)
  const active = entries.filter((e) => !e.supersededBy)

  const exportDir = `data/agents/${agentId}/memory`
  await mkdir(`${exportDir}/patterns`, { recursive: true })
  await mkdir(`${exportDir}/entities`, { recursive: true })
  await mkdir(`${exportDir}/facts`, { recursive: true })

  const indexLines: string[] = [
    `# ${agentId} Knowledge Export`,
    "",
    `Exported at ${new Date().toISOString()} — ${active.length} entries`,
    "",
  ]

  const files: string[] = []

  // Patterns (rules, corrections, procedures)
  const patterns = active.filter((e) => PATTERN_TYPES.includes(e.type))
  if (patterns.length > 0) {
    indexLines.push("## Patterns", "")
    for (const entry of patterns) {
      const slug = slugify(entry.content.slice(0, 60), entry.id)
      const filePath = `patterns/${slug}.md`
      await writeFile(path.join(exportDir, filePath), entryToMarkdown(entry))
      indexLines.push(
        `- [${entry.type}: ${entry.content.slice(0, 80)}](${filePath})`,
      )
      files.push(filePath)
    }
    indexLines.push("")
  }

  // Entity-grouped knowledge
  const entityMap = new Map<string, KnowledgeEntry[]>()
  for (const entry of active) {
    if (entry.about?.entity) {
      const existing = entityMap.get(entry.about.entity) ?? []
      existing.push(entry)
      entityMap.set(entry.about.entity, existing)
    }
  }

  if (entityMap.size > 0) {
    indexLines.push("## Entities", "")
    for (const [entity, entityEntries] of entityMap) {
      const slug = slugify(entity)
      const filePath = `entities/${slug}.md`
      const content = [
        "---",
        `name: ${entity}`,
        `description: Knowledge about ${entity}`,
        `type: entity`,
        `entryCount: ${entityEntries.length}`,
        "---",
        "",
        `# ${entity}`,
        "",
        ...entityEntries.map(
          (e) => `- **[${e.type}]** ${e.content} (confidence: ${e.confidence})`,
        ),
        "",
      ].join("\n")
      await writeFile(path.join(exportDir, filePath), content)
      indexLines.push(
        `- [${entity}](${filePath}) — ${entityEntries.length} entries`,
      )
      files.push(filePath)
    }
    indexLines.push("")
  }

  // Facts and decisions
  const facts = active.filter((e) => FACT_TYPES.includes(e.type))
  if (facts.length > 0) {
    indexLines.push("## Facts", "")
    // Group by source for readability
    const sourceGroups = new Map<string, KnowledgeEntry[]>()
    for (const entry of facts) {
      const src = entry.source.split(":")[0] ?? "unknown"
      const existing = sourceGroups.get(src) ?? []
      existing.push(entry)
      sourceGroups.set(src, existing)
    }
    for (const [src, srcEntries] of sourceGroups) {
      const slug = slugify(`${src}-facts`)
      const filePath = `facts/${slug}.md`
      const content = [
        "---",
        `name: ${src}-facts`,
        `description: Facts from ${src} source`,
        `type: facts`,
        `entryCount: ${srcEntries.length}`,
        "---",
        "",
        `# Facts from ${src}`,
        "",
        ...srcEntries.map(
          (e) => `- ${e.content} (confidence: ${e.confidence})`,
        ),
        "",
      ].join("\n")
      await writeFile(path.join(exportDir, filePath), content)
      indexLines.push(
        `- [${src} facts](${filePath}) — ${srcEntries.length} entries`,
      )
      files.push(filePath)
    }
    indexLines.push("")
  }

  // Preferences — export as individual files like patterns
  const prefs = active.filter((e) => PREF_TYPES.includes(e.type))
  if (prefs.length > 0) {
    indexLines.push("## Preferences", "")
    for (const entry of prefs) {
      const slug = slugify(entry.content.slice(0, 60), entry.id)
      const filePath = `patterns/${slug}.md`
      await writeFile(path.join(exportDir, filePath), entryToMarkdown(entry))
      indexLines.push(
        `- [preference: ${entry.content.slice(0, 80)}](${filePath})`,
      )
      files.push(filePath)
    }
    indexLines.push("")
  }

  // Write index
  await writeFile(path.join(exportDir, "MEMORY.md"), indexLines.join("\n"))
  files.unshift("MEMORY.md")

  return {
    ok: true,
    agentId,
    exportDir,
    totalEntries: active.length,
    files,
  }
})
