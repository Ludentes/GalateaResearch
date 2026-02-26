import { addDecision, createPipelineRunId } from "./decision-trace"
import type { KnowledgeEntry } from "./types"

/**
 * Detect entries with content too low-quality to be durable knowledge.
 * Checks for:
 * - File path dominated content (>30% of characters are paths)
 * - Too short (<30 chars) — likely context-dependent
 * - Session-specific references ("don't touch it", "this file", backtick file refs)
 */
const ABSOLUTE_PATH_RE = /(?:\/[\w.-]+){2,}/g
const BACKTICK_FILE_RE = /`[^`]*\.[a-z]{1,4}`/g
const SESSION_REF_RE =
  /\b(don't touch|this file|that function|full content|full file|COMPLETE file|exact content|see below)\b/i
const MIN_CONTENT_LENGTH = 20

/**
 * Detect content that is primarily code (numbered lines from IDE views).
 * Requires 4+ code line numbers to avoid false positives on entries that
 * mention code context briefly.
 */
const CODE_LINE_NUMBER_RE = /\n\s*\d+\s*\|/g

function isCodeDominatedContent(content: string): boolean {
  const codeLineMatches = content.match(CODE_LINE_NUMBER_RE) ?? []
  return codeLineMatches.length >= 4
}

function isLowQualityContent(content: string): boolean {
  // Too short
  if (content.trim().length < MIN_CONTENT_LENGTH) return true

  // Session-specific reference patterns
  if (SESSION_REF_RE.test(content)) return true

  // Code-dominated content (IDE line numbers, JSX tags)
  if (isCodeDominatedContent(content)) return true

  // File path dominance: count path characters vs total characters
  const pathMatches = content.match(ABSOLUTE_PATH_RE) ?? []
  const backtickMatches = content.match(BACKTICK_FILE_RE) ?? []
  const pathChars = [...pathMatches, ...backtickMatches].reduce(
    (sum, m) => sum + m.length,
    0,
  )
  if (pathChars > 0 && pathChars / content.length > 0.3) return true

  return false
}

export function applyNoveltyGateAndApproval(
  entries: KnowledgeEntry[],
): KnowledgeEntry[] {
  const runId = createPipelineRunId("extraction")

  // 0. Content quality gate: drop low-quality entries
  const qualityFiltered = entries.filter(
    (e) => !isLowQualityContent(e.content),
  )

  // 1. Novelty gate: drop general-knowledge entries
  let filtered = qualityFiltered
    .filter((e) => e.novelty !== "general-knowledge")
    .map((e) =>
      addDecision(e, {
        stage: "novelty-gate",
        action: "pass",
        reason: `Passed novelty gate: ${e.novelty}`,
        inputs: { novelty: e.novelty ?? "unknown" },
        pipelineRunId: runId,
      }),
    )

  // 2. Cap inferred entries at confidence 0.70
  filtered = filtered.map((e) => {
    if (e.origin === "inferred") {
      const originalConfidence = e.confidence
      const capped = {
        ...e,
        confidence: Math.min(e.confidence, 0.70),
      }
      return addDecision(capped, {
        stage: "novelty-gate",
        action: "cap",
        reason: "Inferred entry capped at 0.70",
        inputs: {
          originalConfidence,
          cappedTo: 0.70,
          origin: "inferred",
        },
        pipelineRunId: runId,
      })
    }
    return e
  })

  // 3. Auto-approve explicit statements with high confidence
  filtered = filtered.map((e) => {
    if (e.origin === "explicit-statement" && e.confidence >= 0.90) {
      const approved = {
        ...e,
        curationStatus: "approved" as const,
        curatedBy: "auto-approved",
        curatedAt: new Date().toISOString(),
      }
      return addDecision(approved, {
        stage: "extraction",
        action: "auto-approve",
        reason: "Explicit statement with high confidence",
        inputs: { confidence: e.confidence, threshold: 0.90 },
        pipelineRunId: runId,
      })
    }
    const pending = { ...e, curationStatus: "pending" as const }
    return addDecision(pending, {
      stage: "extraction",
      action: "pass",
      reason: "Pending manual review",
      inputs: { origin: e.origin ?? "unknown", confidence: e.confidence },
      pipelineRunId: runId,
    })
  })

  return filtered
}
