import { anthropic } from "@ai-sdk/anthropic"
import { createServerFn } from "@tanstack/react-start"
import {
  createSessionLogic,
  getSessionMessagesLogic,
  sendMessageLogic,
} from "./chat.logic"

const MODEL_NAME = "claude-sonnet-4-20250514"

/**
 * Send a message in a chat session.
 *
 * Stores the user message, retrieves conversation history and active
 * preprompts, calls the Anthropic model, stores the assistant response,
 * and returns the generated text.
 *
 * Phase 1: non-streaming (uses generateText). Streaming will be added later.
 */
export const sendMessage = createServerFn({ method: "POST" })
  .inputValidator((input: { sessionId: string; message: string }) => input)
  .handler(async ({ data }) => {
    return sendMessageLogic(
      data.sessionId,
      data.message,
      anthropic(MODEL_NAME),
      MODEL_NAME,
    )
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
