import type { DecayConfig } from "../engine/config"
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

    // Skip hook-enforced entries
    if (cfg.hook_entries_exempt && entry.enforcedBy) {
      unchanged++
      return entry
    }

    const lastRetrieved = entry.lastRetrievedAt
      ? new Date(entry.lastRetrievedAt).getTime()
      : new Date(entry.extractedAt).getTime()

    const daysSince = (now - lastRetrieved) / (1000 * 60 * 60 * 24)
    const graceDays = gracePeriodDays(entry, cfg.decay_start_days, cfg)

    if (daysSince < graceDays) {
      unchanged++
      return entry
    }

    const decayDays = daysSince - graceDays
    const factor = effectiveDecayFactor(entry, cfg.decay_factor, cfg)
    const newConfidence = entry.confidence * factor ** decayDays

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

function gracePeriodDays(
  entry: KnowledgeEntry,
  baseDays: number,
  cfg: DecayConfig,
): number {
  const multipliers = cfg.origin_grace_multipliers
  if (!multipliers || !entry.origin) return baseDays
  return baseDays * (multipliers[entry.origin] ?? 1.0)
}

function effectiveDecayFactor(
  entry: KnowledgeEntry,
  baseFactor: number,
  cfg: DecayConfig,
): number {
  const impactScore = entry.impactScore
  if (impactScore === undefined || impactScore === null) return baseFactor

  const weighting = cfg.outcome_weighting
  if (!weighting) return baseFactor

  if (impactScore < 0) {
    const harmPenalty = Math.min(1.0, Math.abs(impactScore)) * weighting.harm_penalty_max
    return baseFactor * (1 - harmPenalty)
  }

  if (impactScore > 0.5) {
    const helpBonus = Math.min(weighting.help_bonus_max, impactScore - 0.5)
    return baseFactor + (1 - baseFactor) * helpBonus
  }

  return baseFactor
}
