import { createError, defineEventHandler, readBody } from "h3"
import { addPendingMessage } from "../../../agent/agent-state"
import type { PendingMessage } from "../../../agent/types"
import { normalizeDashboardMessage } from "../../../dashboard/adapter"

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

  // Normalize via channel adapter, then shim to PendingMessage for state
  const cm = normalizeDashboardMessage({
    from: body.from,
    content: body.content,
    metadata: body.metadata,
  })

  // Shim: convert ChannelMessage → PendingMessage for current state format
  const pending: PendingMessage = {
    from: cm.from,
    channel: body.channel, // Preserve original channel from request
    content: cm.content,
    receivedAt: cm.receivedAt,
    metadata: body.metadata,
  }

  await addPendingMessage(pending)

  return { queued: true, message: pending }
})
