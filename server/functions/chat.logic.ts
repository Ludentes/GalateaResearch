import type { LanguageModel } from "ai"
import { generateText, streamText } from "ai"
import { asc, eq } from "drizzle-orm"
import { db } from "../db"
import { messages, preprompts, sessions } from "../db/schema"

/**
 * Create a new chat session.
 */
export async function createSessionLogic(name: string) {
  const [session] = await db.insert(sessions).values({ name }).returning()
  return session
}

/**
 * Retrieve all messages for a given session, ordered by creation time.
 */
export async function getSessionMessagesLogic(sessionId: string) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt))
}

/**
 * Send a message in a chat session.
 *
 * Stores the user message, retrieves conversation history and active
 * preprompts, calls the given language model, stores the assistant response,
 * and returns the generated text.
 */
export async function sendMessageLogic(
  sessionId: string,
  message: string,
  model: LanguageModel,
  modelName: string,
) {
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
    model,
    system: systemPrompt,
    messages: history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    experimental_telemetry: { isEnabled: true },
  })

  // Store assistant response
  await db.insert(messages).values({
    sessionId,
    role: "assistant",
    content: result.text,
    model: modelName,
    tokenCount: result.usage.totalTokens,
  })

  return { text: result.text }
}

/**
 * Stream a message response in a chat session.
 *
 * Stores user message, builds context, calls streamText().
 * The onFinish callback saves the assistant response + token usage to DB.
 * Returns the StreamTextResult for the API route to consume.
 */
export async function streamMessageLogic(
  sessionId: string,
  message: string,
  model: LanguageModel,
  modelName: string,
) {
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

  // Get active preprompts
  const activePrompts = await db
    .select()
    .from(preprompts)
    .where(eq(preprompts.active, true))
    .orderBy(asc(preprompts.priority))

  const systemPrompt = activePrompts.map((p) => p.content).join("\n\n")

  // Stream response
  const result = streamText({
    model,
    system: systemPrompt,
    messages: history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    experimental_telemetry: { isEnabled: true },
    onFinish: async ({ text, usage }) => {
      await db.insert(messages).values({
        sessionId,
        role: "assistant",
        content: text,
        model: modelName,
        tokenCount: usage.totalTokens,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      })
    },
  })

  return result
}
