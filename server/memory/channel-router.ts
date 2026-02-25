import { getArtifactConfig } from "../engine/config"
import { addDecision, createPipelineRunId } from "./decision-trace"
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
  const runId = createPipelineRunId("router")

  const claudeMd: KnowledgeEntry[] = []
  const skills: KnowledgeEntry[] = []
  const hooks: KnowledgeEntry[] = []
  const skipped: KnowledgeEntry[] = []
  const skipReasons: string[] = []

  // 1. Filter active only
  const active = allEntries.filter((e) => {
    if (e.supersededBy || e.archivedAt) {
      skipped.push(
        addDecision(e, {
          stage: "router",
          action: "skip",
          reason: "superseded or archived",
          inputs: {
            ...(e.supersededBy
              ? { supersededBy: e.supersededBy }
              : {}),
            ...(e.archivedAt ? { archivedAt: e.archivedAt } : {}),
          },
          pipelineRunId: runId,
        }),
      )
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
      hooks.push(
        addDecision({ ...entry, targetChannel: "hook" }, {
          stage: "router",
          action: "route",
          reason: "tool-constraint pattern \u2192 hooks",
          inputs: { channel: "hook", patternMatched: true },
          pipelineRunId: runId,
        }),
      )
      continue
    }

    // 3. Route procedures to skills
    if (entry.type === "procedure") {
      if (
        entry.curationStatus === "approved" &&
        entry.confidence >= cfg.skills.min_confidence &&
        entry.novelty !== "general-knowledge"
      ) {
        skills.push(
          addDecision({ ...entry, targetChannel: "skill" }, {
            stage: "router",
            action: "route",
            reason: "approved procedure \u2192 skills",
            inputs: { channel: "skill" },
            pipelineRunId: runId,
          }),
        )
      } else {
        skipped.push(
          addDecision(entry, {
            stage: "router",
            action: "skip",
            reason: "procedure below threshold or uncurated",
            inputs: {
              confidence: entry.confidence,
              curationStatus: entry.curationStatus ?? "pending",
            },
            pipelineRunId: runId,
          }),
        )
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
      claudeMd.push(
        addDecision({ ...entry, targetChannel: "claude-md" }, {
          stage: "router",
          action: "route",
          reason: "approved entry \u2192 CLAUDE.md",
          inputs: { channel: "claude-md" },
          pipelineRunId: runId,
        }),
      )
      continue
    }

    // 5. Skip everything else
    skipped.push(
      addDecision(entry, {
        stage: "router",
        action: "skip",
        reason: "below threshold, uncurated, or enforced by hook",
        inputs: {
          confidence: entry.confidence,
          curationStatus: entry.curationStatus ?? "pending",
          enforcedBy: entry.enforcedBy ?? "",
        },
        pipelineRunId: runId,
      }),
    )
    skipReasons.push("below threshold, uncurated, or enforced by hook")
  }

  // Rank and cap skills at max_count
  const rankedSkills = skills
    .map((e) => ({
      entry: e,
      score: skillScore(e, cfg.prior_overlap.common_patterns),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, cfg.skills.max_count)
    .map((s) => s.entry)

  // Skills that didn't make the cut go to skipped
  const skillIds = new Set(rankedSkills.map((e) => e.id))
  const maxCount = cfg.skills.max_count
  for (const s of skills) {
    if (!skillIds.has(s.id)) {
      const rank = skills.indexOf(s)
      skipped.push(
        addDecision(s, {
          stage: "router",
          action: "skip",
          reason: "exceeded skill budget",
          inputs: { rank, maxCount },
          pipelineRunId: runId,
        }),
      )
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
  const budget = cfg.claude_md.max_lines
  const budgetedClaudeMd: KnowledgeEntry[] = []
  for (const entry of rankedClaudeMd) {
    const entryLines = entry.content.split("\n").length + 1
    if (lineCount + entryLines <= budget) {
      budgetedClaudeMd.push(
        addDecision(entry, {
          stage: "router",
          action: "route",
          reason: "within CLAUDE.md line budget",
          inputs: {
            channel: "claude-md",
            lineCount: lineCount + entryLines,
          },
          pipelineRunId: runId,
        }),
      )
      lineCount += entryLines
    } else {
      skipped.push(
        addDecision(entry, {
          stage: "router",
          action: "skip",
          reason: "exceeded CLAUDE.md line budget",
          inputs: { lineCount, budget, entryLines },
          pipelineRunId: runId,
        }),
      )
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
