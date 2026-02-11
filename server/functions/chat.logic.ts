import type { LanguageModel } from "ai"
import { generateText, streamText } from "ai"
import { asc, eq } from "drizzle-orm"
import { db } from "../db"
import { messages, sessions } from "../db/schema"
import { assembleContext } from "../memory/context-assembler"

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
 * Send a message in a chat session (non-streaming).
 *
 * Stores user message, calls LLM, stores assistant response.
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

  // Assemble system prompt from preprompts + learned knowledge
  const context = await assembleContext()

  // Generate response
  const result = await generateText({
    system: context.systemPrompt || undefined,
    model,
    messages: history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    experimental_telemetry: { isEnabled: true },
  })

  // Store assistant response
  await db
    .insert(messages)
    .values({
      sessionId,
      role: "assistant",
      content: result.text,
      model: modelName,
      tokenCount: result.usage.totalTokens || 0,
      inputTokens: result.usage.inputTokens || 0,
      outputTokens: result.usage.outputTokens || 0,
    })
    .returning()

  return { text: result.text }
}

/**
 * Stream a message response in a chat session.
 *
 * Stores user message, calls streamText(). The onFinish callback
 * saves the assistant response + token usage to DB.
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

  // Assemble system prompt from preprompts + learned knowledge
  const context = await assembleContext()

  // Stream response
  const result = streamText({
    system: context.systemPrompt || undefined,
    model,
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
        tokenCount: usage.totalTokens || 0,
        inputTokens: usage.inputTokens || 0,
        outputTokens: usage.outputTokens || 0,
      })
    },
  })

  return result
}
