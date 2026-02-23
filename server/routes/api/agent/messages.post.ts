import { createError, defineEventHandler, readBody } from "h3"
import { addMessage } from "../../../agent/agent-state"
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

  const cm = normalizeDashboardMessage({
    from: body.from,
    content: body.content,
    metadata: body.metadata,
  })

  await addMessage(cm)

  return { queued: true, message: cm }
})
