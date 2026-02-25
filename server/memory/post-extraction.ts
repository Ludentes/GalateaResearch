import { addDecision, createPipelineRunId } from "./decision-trace"
import type { KnowledgeEntry } from "./types"

export function applyNoveltyGateAndApproval(
  entries: KnowledgeEntry[],
): KnowledgeEntry[] {
  const runId = createPipelineRunId("extraction")

  // 1. Novelty gate: drop general-knowledge entries
  let filtered = entries
    .filter((e) => e.novelty !== "general-knowledge")
    .map((e) =>
      addDecision(e, {
        stage: "novelty-gate",
        action: "pass",
        reason: `Passed novelty gate: ${e.novelty}`,
        inputs: { novelty: e.novelty },
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
      inputs: { origin: e.origin, confidence: e.confidence },
      pipelineRunId: runId,
    })
  })

  return filtered
}
