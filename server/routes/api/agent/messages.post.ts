import { createError, defineEventHandler, readBody } from "h3"
import { addPendingMessage } from "../../../agent/agent-state"
import type { PendingMessage } from "../../../agent/types"

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as {
    from?: string
    channel?: string
    content?: string
    metadata?: Record<string, string>
  }

  if (!body.from || !body.channel || !body.content) {
    throw createError({
      statusCode: 400,
      message: "Required fields: from, channel, content",
    })
  }

  const msg: PendingMessage = {
    from: body.from,
    channel: body.channel,
    content: body.content,
    receivedAt: new Date().toISOString(),
    metadata: body.metadata,
  }

  await addPendingMessage(msg)

  return { queued: true, message: msg }
})
