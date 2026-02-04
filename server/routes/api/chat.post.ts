import { defineEventHandler, HTTPError, readBody } from "h3"
import { streamMessageLogic } from "../../functions/chat.logic"
import { getModel } from "../../providers"

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const {
    sessionId,
    message,
    provider,
    model: modelId,
  } = body as {
    sessionId: string
    message: string
    provider?: string
    model?: string
  }

  if (!sessionId || !message) {
    throw new HTTPError("sessionId and message required", { status: 400 })
  }

  const { model, modelName } = getModel(provider, modelId)
  const result = await streamMessageLogic(sessionId, message, model, modelName)

  return result.toTextStreamResponse()
})
