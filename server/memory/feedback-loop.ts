import { getFeedbackConfig } from "../engine/config"
import { addDecision, createPipelineRunId } from "./decision-trace"
import { readEntries, writeEntries } from "./knowledge-store"
import type { KnowledgeEntry } from "./types"

interface WorkArcOutcome {
  status: "completed" | "failed" | "timeout" | "blocked" | "budget_exceeded"
  text: string
  transcript: unknown[]
  durationMs: number
}

export async function recordOutcome(
  result: WorkArcOutcome,
  exposedEntryIds: string[],
  storePath: string,
): Promise<void> {
  const cfg = getFeedbackConfig()
  const exposedSet = new Set(exposedEntryIds)
  const entries = await readEntries(storePath)
  const runId = createPipelineRunId("feedback")

  const updated = entries.map((entry) => {
    if (!exposedSet.has(entry.id)) return entry

    let e: KnowledgeEntry = { ...entry }
    e.sessionsExposed = (e.sessionsExposed ?? 0) + 1

    if (result.status === "completed") {
      e.sessionsHelpful = (e.sessionsHelpful ?? 0) + 1
    } else if (result.status === "failed") {
      e.sessionsHarmful = (e.sessionsHarmful ?? 0) + 1
    }
    // timeout, budget_exceeded, blocked: neutral

    // Recompute impact score
    if (e.sessionsExposed >= cfg.min_sessions_for_impact) {
      e.impactScore =
        ((e.sessionsHelpful ?? 0) - (e.sessionsHarmful ?? 0)) /
        e.sessionsExposed
    }

    // Record decision
    e = addDecision(e, {
      stage: "feedback",
      action: "record",
      reason: "outcome recorded",
      inputs: {
        status: result.status,
        sessionsExposed: e.sessionsExposed,
        sessionsHelpful: e.sessionsHelpful ?? 0,
        sessionsHarmful: e.sessionsHarmful ?? 0,
        ...(e.impactScore !== undefined ? { impactScore: e.impactScore } : {}),
      },
      pipelineRunId: runId,
    })

    return e
  })

  await writeEntries(updated, storePath)
}
