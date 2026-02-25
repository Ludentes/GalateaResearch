import type { DecayConfig } from "../engine/config"
import { getDecayConfig } from "../engine/config"
import {
  addDecision,
  capDecisions,
  createPipelineRunId,
} from "./decision-trace"
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
  const pipelineRunId = createPipelineRunId("decay")

  let decayed = 0
  let archived = 0
  let unchanged = 0

  const updated: KnowledgeEntry[] = entries.map((entry) => {
    // Skip exempt types, superseded, already archived
    if (
      exempt.has(entry.type) ||
      entry.supersededBy ||
      entry.archivedAt
    ) {
      unchanged++
      const reason = exempt.has(entry.type)
        ? "exempt type"
        : "superseded or archived"
      return addDecision(entry, {
        stage: "decay",
        action: "pass",
        reason,
        inputs: { type: entry.type },
        pipelineRunId,
      })
    }

    // Skip hook-enforced entries
    if (cfg.hook_entries_exempt && entry.enforcedBy) {
      unchanged++
      return addDecision(entry, {
        stage: "decay",
        action: "pass",
        reason: "hook-enforced: exempt",
        inputs: { enforcedBy: "hook" },
        pipelineRunId,
      })
    }

    const lastRetrieved = entry.lastRetrievedAt
      ? new Date(entry.lastRetrievedAt).getTime()
      : new Date(entry.extractedAt).getTime()

    const daysSince =
      (now - lastRetrieved) / (1000 * 60 * 60 * 24)
    const multipliers = cfg.origin_grace_multipliers
    const multiplier =
      multipliers && entry.origin
        ? (multipliers[entry.origin] ?? 1.0)
        : 1.0
    const graceDays = gracePeriodDays(
      entry,
      cfg.decay_start_days,
      cfg,
    )

    if (daysSince < graceDays) {
      unchanged++
      return addDecision(entry, {
        stage: "decay",
        action: "pass",
        reason: "within grace period",
        inputs: {
          daysSince,
          graceDays,
          origin: entry.origin ?? "unknown",
          multiplier,
        },
        pipelineRunId,
      })
    }

    const decayDays = daysSince - graceDays
    const factor = effectiveDecayFactor(
      entry,
      cfg.decay_factor,
      cfg,
    )
    const newConfidence = entry.confidence * factor ** decayDays

    if (newConfidence < cfg.archive_threshold) {
      archived++
      const result = addDecision(
        {
          ...entry,
          confidence: newConfidence,
          archivedAt: new Date().toISOString(),
        },
        {
          stage: "decay",
          action: "archive",
          reason: "below archive threshold",
          inputs: {
            confidence: newConfidence,
            threshold: cfg.archive_threshold,
          },
          pipelineRunId,
        },
      )
      return result
    }

    decayed++
    return addDecision(
      { ...entry, confidence: newConfidence },
      {
        stage: "decay",
        action: "decay",
        reason: "confidence reduced",
        inputs: {
          from: entry.confidence,
          to: newConfidence,
          factor,
          effectiveFactor: factor,
          decayDays,
        },
        pipelineRunId,
      },
    )
  })

  const capped = updated.map(capDecisions)
  await writeEntries(capped, storePath)
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
