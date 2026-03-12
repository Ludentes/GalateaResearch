import { defineEventHandler } from "h3"
import { listAgentIds, loadAgentSpec } from "../../../agent/agent-spec"
import {
  getTickRecordPath,
  readTickRecords,
} from "../../../observation/tick-record"

export default defineEventHandler(async () => {
  const agentIds = await listAgentIds()
  const agents = await Promise.all(
    agentIds.map(async (id) => {
      const spec = await loadAgentSpec(id)
      const ticks = await readTickRecords(getTickRecordPath(id))
      const lastTick = ticks.length > 0 ? ticks[ticks.length - 1] : null
      return {
        id: spec.agent.id,
        name: spec.agent.name,
        role: spec.agent.role,
        domain: spec.agent.domain,
        health: lastTick ? deriveHealth(lastTick.homeostasis) : "unknown",
        lastTick: lastTick?.timestamp ?? null,
      }
    }),
  )
  return { agents }
})

function deriveHealth(homeostasis: Record<string, { state: string }>): string {
  const states = Object.values(homeostasis).map((d) => d.state)
  if (states.some((s) => s === "LOW")) return "degraded"
  if (states.some((s) => s === "ELEVATED")) return "elevated"
  return "healthy"
}
