import { defineEventHandler, HTTPError, readBody } from "h3"
import { tick } from "../../../agent/tick"
import {
  getTickRecordPath,
  readLastTickRecord,
} from "../../../observation/tick-record"

interface HeartbeatBody {
  agentId?: string
}

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as HeartbeatBody

  if (!body.agentId) {
    throw new HTTPError("Missing required field: agentId", { status: 400 })
  }

  const tickPath = getTickRecordPath(body.agentId)
  const beforeTick = await readLastTickRecord(tickPath)

  await tick("heartbeat", { agentId: body.agentId })

  // Poll for new tick record (fire-and-forget write may be delayed)
  let record = await readLastTickRecord(tickPath)
  for (let i = 0; i < 30 && record?.tickId === beforeTick?.tickId; i++) {
    await new Promise((r) => setTimeout(r, 100))
    record = await readLastTickRecord(tickPath)
  }

  return { tick: record }
})
