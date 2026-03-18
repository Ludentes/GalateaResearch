import { defineEventHandler } from "h3"
import {
  listAgentIds,
  loadAgentDefaultSpec,
} from "../../../agent/agent-spec"
import type { HomeostasisState } from "../../../engine/types"
import {
  getTickRecordPath,
  readLastTickRecord,
} from "../../../observation/tick-record"

export default defineEventHandler(async () => {
  const agentIds = await listAgentIds()
  const agents = await Promise.all(
    agentIds.map(async (id) => {
      const spec = await loadAgentDefaultSpec(id)
      const lastTick = await readLastTickRecord(getTickRecordPath(id))
      return {
        id: spec.agent.id,
        name: spec.agent.name,
        role: spec.agent.role,
        domain: spec.agent.domain,
        health: lastTick ? deriveHealth(lastTick.homeostasis) : "unknown",
        lastTick: lastTick?.timestamp ?? null,
        homeostasis: lastTick?.homeostasis as HomeostasisState | null,
      }
    }),
  )
  return { agents }
})

const DIMENSION_KEYS = new Set([
  "knowledge_sufficiency",
  "certainty_alignment",
  "progress_momentum",
  "communication_health",
  "productive_engagement",
  "knowledge_application",
  "self_preservation",
])

function deriveHealth(homeostasis: Record<string, unknown>): string {
  const states = Object.entries(homeostasis)
    .filter(([k]) => DIMENSION_KEYS.has(k))
    .map(([, v]) => (typeof v === "string" ? v : (v as any)?.state))
  if (states.some((s) => s === "LOW")) return "degraded"
  if (states.some((s) => s === "ELEVATED")) return "elevated"
  return "healthy"
}
