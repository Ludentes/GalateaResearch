import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { defineEventHandler } from "h3"
import { getArtifactConfig } from "../../../../engine/config"
import { routeEntries } from "../../../../memory/channel-router"
import { readEntries } from "../../../../memory/knowledge-store"

export default defineEventHandler(async () => {
  const storePath = "data/memory/entries.jsonl"
  const outputDir = ".claude"
  const cfg = getArtifactConfig()

  const entries = await readEntries(storePath)
  const routed = routeEntries(entries)

  // Build CLAUDE.md preview
  const claudeMdSections: string[] = []
  claudeMdSections.push(cfg.claude_md.architecture_preamble, "")

  const sectionOrder = ["rule", "preference", "correction", "decision", "fact"]
  const headings: Record<string, string> = {
    rule: "## Rules",
    preference: "## Preferences",
    correction: "## Corrections",
    decision: "## Decisions",
    fact: "## Facts",
  }

  for (const type of sectionOrder) {
    const group = routed.claudeMd.entries.filter(
      (e) => e.type === type && e.type !== "procedure",
    )
    if (group.length === 0) continue
    claudeMdSections.push(headings[type], "")
    for (const entry of group) {
      claudeMdSections.push(`- ${entry.contentOverride ?? entry.content}`)
    }
    claudeMdSections.push("")
  }

  const newClaudeMd = claudeMdSections.join("\n")

  // Read existing CLAUDE.md for diff
  const claudeMdPath = path.join(outputDir, "CLAUDE.md")
  const existingClaudeMd = existsSync(claudeMdPath)
    ? await readFile(claudeMdPath, "utf-8")
    : null

  return {
    claudeMd: {
      preview: newClaudeMd,
      existing: existingClaudeMd,
      lines: newClaudeMd.split("\n").length,
      entryCount: routed.claudeMd.entries.length,
      isNew: !existingClaudeMd,
    },
    skills: {
      entries: routed.skills.entries.map((e) => ({
        id: e.id,
        content: e.contentOverride ?? e.content,
        confidence: e.confidence,
      })),
      count: routed.skills.count,
    },
    hooks: {
      count: routed.hooks.count,
    },
    skipped: {
      count: routed.skipped.entries.length,
      entries: routed.skipped.entries.map((e) => ({
        id: e.id,
        content: (e.contentOverride ?? e.content).slice(0, 80),
        type: e.type,
        reason: e.decisions?.[e.decisions.length - 1]?.reason ?? "unknown",
      })),
    },
    budget: {
      claudeMdLines: routed.claudeMd.lines,
      claudeMdMax: cfg.claude_md.max_lines,
      skillCount: routed.skills.count,
      skillMax: cfg.skills.max_count,
    },
  }
})
