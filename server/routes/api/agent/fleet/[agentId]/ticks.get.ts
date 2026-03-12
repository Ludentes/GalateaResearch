import { defineEventHandler, getQuery, getRouterParam, HTTPError } from "h3"
import { loadAgentSpec } from "../../../../../agent/agent-spec"
import {
  getTickRecordPath,
  readTickRecords,
} from "../../../../../observation/tick-record"

export default defineEventHandler(async (event) => {
  const agentId = getRouterParam(event, "agentId")
  if (!agentId) {
    throw new HTTPError("Missing agentId", { status: 400 })
  }

  try {
    await loadAgentSpec(agentId)
  } catch {
    throw new HTTPError("Agent not found", { status: 404 })
  }

  const query = getQuery(event)
  const limit = Number(query.limit) || 50
  const offset = Number(query.offset) || 0

  const ticks = await readTickRecords(getTickRecordPath(agentId), {
    limit,
    offset,
  })

  return { agentId, ticks, limit, offset }
})
