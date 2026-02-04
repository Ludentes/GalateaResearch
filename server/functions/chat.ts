import { anthropic } from "@ai-sdk/anthropic"
import { createServerFn } from "@tanstack/react-start"
import { generateText } from "ai"
import { asc, eq } from "drizzle-orm"
import { db } from "../db"
import { messages, preprompts, sessions } from "../db/schema"

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
    const { sessionId, message } = data

    // Store user message
    await db.insert(messages).values({
      sessionId,
      role: "user",
      content: message,
    })

    // Get conversation history
    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.createdAt))

    // Get active preprompts ordered by priority (core + hard rules)
    const activePrompts = await db
      .select()
      .from(preprompts)
      .where(eq(preprompts.active, true))
      .orderBy(asc(preprompts.priority))

    // Build system prompt from active preprompts
    const systemPrompt = activePrompts.map((p) => p.content).join("\n\n")

    // Generate response (Phase 1: non-streaming)
    const result = await generateText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: systemPrompt,
      messages: history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    })

    // Store assistant response
    await db.insert(messages).values({
      sessionId,
      role: "assistant",
      content: result.text,
      model: "claude-sonnet-4-20250514",
      tokenCount: result.usage.totalTokens,
    })

    return { text: result.text }
  })

/**
 * Create a new chat session.
 */
export const createSession = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string }) => input)
  .handler(async ({ data }) => {
    const [session] = await db
      .insert(sessions)
      .values({ name: data.name })
      .returning()
    return session
  })

/**
 * Retrieve all messages for a given session, ordered by creation time.
 */
export const getSessionMessages = createServerFn({ method: "GET" })
  .inputValidator((input: { sessionId: string }) => input)
  .handler(async ({ data }) => {
    return db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, data.sessionId))
      .orderBy(asc(messages.createdAt))
  })
