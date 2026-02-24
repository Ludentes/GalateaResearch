import { getFeedbackConfig } from "../engine/config"
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

  const updated = entries.map((entry) => {
    if (!exposedSet.has(entry.id)) return entry

    const e = { ...entry }
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
        ((e.sessionsHelpful ?? 0) - (e.sessionsHarmful ?? 0)) / e.sessionsExposed
    }

    return e
  })

  await writeEntries(updated, storePath)
}
