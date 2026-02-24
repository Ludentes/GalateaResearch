import { getArtifactConfig } from "../engine/config"
import type { KnowledgeEntry } from "./types"

export interface RouterResult {
  claudeMd: { entries: KnowledgeEntry[]; lines: number }
  skills: { entries: KnowledgeEntry[]; count: number }
  hooks: { entries: KnowledgeEntry[]; count: number }
  skipped: { entries: KnowledgeEntry[]; reasons: string[] }
}

const TOOL_CONSTRAINT_PATTERN =
  /\b(never|don't|do not|always|must not)\b.*\b(push|delete|rm|drop|overwrite|modify|force|reset)\b/i

export function routeEntries(allEntries: KnowledgeEntry[]): RouterResult {
  const cfg = getArtifactConfig()

  const claudeMd: KnowledgeEntry[] = []
  const skills: KnowledgeEntry[] = []
  const hooks: KnowledgeEntry[] = []
  const skipped: KnowledgeEntry[] = []
  const skipReasons: string[] = []

  // 1. Filter active only
  const active = allEntries.filter((e) => {
    if (e.supersededBy || e.archivedAt) {
      skipped.push(e)
      skipReasons.push("superseded or archived")
      return false
    }
    return true
  })

  for (const entry of active) {
    // 2. Route tool-constraint rules to hooks
    if (
      (entry.type === "rule" || entry.type === "correction") &&
      TOOL_CONSTRAINT_PATTERN.test(entry.content)
    ) {
      hooks.push({ ...entry, targetChannel: "hook" })
      continue
    }

    // 3. Route procedures to skills
    if (entry.type === "procedure") {
      if (
        entry.curationStatus === "approved" &&
        entry.confidence >= cfg.skills.min_confidence &&
        entry.novelty !== "general-knowledge"
      ) {
        skills.push({ ...entry, targetChannel: "skill" })
      } else {
        skipped.push(entry)
        skipReasons.push("procedure below threshold or uncurated")
      }
      continue
    }

    // 4. Route to CLAUDE.md
    if (
      entry.curationStatus === "approved" &&
      entry.confidence >= cfg.claude_md.min_confidence &&
      entry.novelty !== "general-knowledge" &&
      !entry.enforcedBy
    ) {
      claudeMd.push({ ...entry, targetChannel: "claude-md" })
      continue
    }

    // 5. Skip everything else
    skipped.push(entry)
    skipReasons.push("below threshold, uncurated, or enforced by hook")
  }

  // Rank and cap skills at max_count
  const rankedSkills = skills
    .map((e) => ({ entry: e, score: skillScore(e, cfg.prior_overlap.common_patterns) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, cfg.skills.max_count)
    .map((s) => s.entry)

  // Skills that didn't make the cut go to skipped
  const skillIds = new Set(rankedSkills.map((e) => e.id))
  for (const s of skills) {
    if (!skillIds.has(s.id)) {
      skipped.push(s)
      skipReasons.push("exceeded skill budget")
    }
  }

  // Rank CLAUDE.md entries and enforce line budget
  const rankedClaudeMd = claudeMd.sort((a, b) => {
    const scoreA = claudeMdScore(a)
    const scoreB = claudeMdScore(b)
    return scoreB - scoreA
  })

  let lineCount = 0
  const budgetedClaudeMd: KnowledgeEntry[] = []
  for (const entry of rankedClaudeMd) {
    const entryLines = entry.content.split("\n").length + 1 // +1 for "- " prefix
    if (lineCount + entryLines <= cfg.claude_md.max_lines) {
      budgetedClaudeMd.push(entry)
      lineCount += entryLines
    } else {
      skipped.push(entry)
      skipReasons.push("exceeded CLAUDE.md line budget")
    }
  }

  return {
    claudeMd: { entries: budgetedClaudeMd, lines: lineCount },
    skills: { entries: rankedSkills, count: rankedSkills.length },
    hooks: { entries: hooks, count: hooks.length },
    skipped: { entries: skipped, reasons: skipReasons },
  }
}

function skillScore(entry: KnowledgeEntry, commonPatterns: string[]): number {
  const priorOverlap = estimatePriorOverlap(entry.content, commonPatterns)
  const failureWeight = entry.origin === "observed-failure" ? 2.0 : 1.0
  const impact = Math.max(0.1, entry.impactScore ?? 0.5)
  return entry.confidence * (1 - priorOverlap) * failureWeight * impact
}

function claudeMdScore(entry: KnowledgeEntry): number {
  const failureBoost = entry.origin === "observed-failure" ? 2.0 : 1.0
  const impact = entry.impactScore ?? 0.5
  return impact * entry.confidence * failureBoost
}

export function estimatePriorOverlap(content: string, patterns: string[]): number {
  const regexes = patterns.map((p) => new RegExp(p, "i"))
  const matches = regexes.filter((r) => r.test(content)).length
  return Math.min(1.0, matches / 3)
}
