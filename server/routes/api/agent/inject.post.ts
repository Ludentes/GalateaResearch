import { HTTPError, defineEventHandler, readBody } from "h3"
import { addMessage } from "../../../agent/agent-state"
import { tick } from "../../../agent/tick"
import type { ChannelMessage } from "../../../agent/types"
import {
  getTickRecordPath,
  readLastTickRecord,
} from "../../../observation/tick-record"

interface InjectBody {
  agentId?: string
  content?: string
  from?: string
  channel?: string
  messageType?: string
  /** Override LLM provider for this message (e.g. "none" to simulate outage) */
  provider?: string
  /** Override LLM model for this message (e.g. "sonnet" for dogfooding) */
  model?: string
}

export function validateInjectBody(body: InjectBody): string | null {
  if (!body.agentId) return "Missing required field: agentId"
  if (!body.content) return "Missing required field: content"
  if (!body.from) return "Missing required field: from"
  if (!body.channel) return "Missing required field: channel"
  const validChannels = ["discord", "dashboard", "gitlab", "internal"]
  if (!validChannels.includes(body.channel)) {
    return `Invalid channel: ${body.channel}. Must be one of: ${validChannels.join(", ")}`
  }
  if (body.messageType !== undefined) {
    const validMessageTypes = [
      "chat",
      "task_assignment",
      "status_update",
      "greeting",
    ]
    if (!validMessageTypes.includes(body.messageType)) {
      return `Invalid messageType: ${body.messageType}. Must be one of: ${validMessageTypes.join(", ")}`
    }
  }
  return null
}

export function buildChannelMessage(body: InjectBody): ChannelMessage {
  return {
    id: `inject-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    channel: body.channel as ChannelMessage["channel"],
    direction: "inbound",
    routing: {},
    from: body.from!,
    content: body.content!,
    messageType: (body.messageType ?? "chat") as ChannelMessage["messageType"],
    receivedAt: new Date().toISOString(),
    metadata: {
      ...(body.provider ? { providerOverride: body.provider } : {}),
      ...(body.model ? { modelOverride: body.model } : {}),
    },
  }
}

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as InjectBody

  const error = validateInjectBody(body)
  if (error) {
    throw new HTTPError(error, { status: 400 })
  }

  const msg = buildChannelMessage(body)
  const tickPath = getTickRecordPath(body.agentId!)
  const beforeTick = await readLastTickRecord(tickPath)

  await addMessage(msg)
  await tick("webhook", { agentId: body.agentId })

  // appendTickRecord in tick() is fire-and-forget — poll until new record appears
  let record = await readLastTickRecord(tickPath)
  for (let i = 0; i < 30 && record?.tickId === beforeTick?.tickId; i++) {
    await new Promise((r) => setTimeout(r, 100))
    record = await readLastTickRecord(tickPath)
  }

  return { tick: record }
})
