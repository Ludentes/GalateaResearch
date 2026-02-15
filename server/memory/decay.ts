import { getDecayConfig } from "../engine/config"
import { readEntries, writeEntries } from "./knowledge-store"
import type { KnowledgeEntry } from "./types"

export interface DecayResult {
  decayed: number
  archived: number
  unchanged: number
}

export async function runDecay(storePath: string): Promise<DecayResult> {
  const cfg = getDecayConfig()
  if (!cfg.enabled) return { decayed: 0, archived: 0, unchanged: 0 }

  const entries = await readEntries(storePath)
  const now = Date.now()
  const exempt = new Set(cfg.exempt_types)

  let decayed = 0
  let archived = 0
  let unchanged = 0

  const updated: KnowledgeEntry[] = entries.map((entry) => {
    // Skip exempt types, superseded, already archived
    if (exempt.has(entry.type) || entry.supersededBy || entry.archivedAt) {
      unchanged++
      return entry
    }

    const lastRetrieved = entry.lastRetrievedAt
      ? new Date(entry.lastRetrievedAt).getTime()
      : new Date(entry.extractedAt).getTime()

    const daysSince = (now - lastRetrieved) / (1000 * 60 * 60 * 24)

    if (daysSince < cfg.decay_start_days) {
      unchanged++
      return entry
    }

    const decayDays = daysSince - cfg.decay_start_days
    const newConfidence =
      entry.confidence * Math.pow(cfg.decay_factor, decayDays)

    if (newConfidence < cfg.archive_threshold) {
      archived++
      return {
        ...entry,
        confidence: newConfidence,
        archivedAt: new Date().toISOString(),
      }
    }

    decayed++
    return { ...entry, confidence: newConfidence }
  })

  await writeEntries(updated, storePath)
  return { decayed, archived, unchanged }
}
