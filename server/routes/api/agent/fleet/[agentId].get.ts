import { defineEventHandler, getRouterParam, HTTPError } from "h3"
import { loadAgentDefaultSpec } from "../../../../agent/agent-spec"
import { loadOperationalContext } from "../../../../agent/operational-memory"
import {
  getTickRecordPath,
  readTickRecords,
} from "../../../../observation/tick-record"

export default defineEventHandler(async (event) => {
  const agentId = getRouterParam(event, "agentId")
  if (!agentId) {
    throw new HTTPError("Missing agentId", { status: 400 })
  }

  let spec
  try {
    spec = await loadAgentDefaultSpec(agentId)
  } catch {
    throw new HTTPError("Agent not found", { status: 404 })
  }

  const operationalContext = await loadOperationalContext(
    spec.operational_memory,
  )
  const recentTicks = await readTickRecords(getTickRecordPath(agentId), {
    limit: 50,
  })

  return {
    spec,
    operationalContext,
    recentTicks,
  }
})
