import { createServerFn } from "@tanstack/react-start"
import { getModel } from "../providers"
import {
  createSessionLogic,
  getSessionMessagesLogic,
  sendMessageLogic,
} from "./chat.logic"

/**
 * Send a message in a chat session (non-streaming fallback).
 *
 * Streaming is handled by the POST /api/chat Nitro route.
 */
export const sendMessage = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      sessionId: string
      message: string
      provider?: string
      model?: string
    }) => input,
  )
  .handler(async ({ data }) => {
    const { model, modelName } = getModel(data.provider, data.model)
    return sendMessageLogic(data.sessionId, data.message, model, modelName)
  })

/**
 * Create a new chat session.
 */
export const createSession = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string }) => input)
  .handler(async ({ data }) => {
    return createSessionLogic(data.name)
  })

/**
 * Retrieve all messages for a given session, ordered by creation time.
 */
export const getSessionMessages = createServerFn({ method: "GET" })
  .inputValidator((input: { sessionId: string }) => input)
  .handler(async ({ data }) => {
    return getSessionMessagesLogic(data.sessionId)
  })
