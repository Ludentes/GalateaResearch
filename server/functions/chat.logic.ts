import type { LanguageModel } from "ai"
import { generateText, streamText } from "ai"
import { asc, eq } from "drizzle-orm"
import { db } from "../db"
import { messages, sessions } from "../db/schema"
import { assembleContext } from "../memory/context-assembler"
import { retrieveRelevantFacts } from "../memory/fact-retrieval"
import { classifyTurn } from "../memory/signal-classifier"
import { emitEvent } from "../observation/emit"
import { ollamaQueue } from "../providers/ollama-queue"

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
  opts?: { observationStorePath?: string },
) {
  // Store user message
  await db.insert(messages).values({
    sessionId,
    role: "user",
    content: message,
  })

  // Classify user message signal in real-time
  const signalClassification = classifyTurn({ role: "user", content: message })

  // Get conversation history
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt))

  // Assemble system prompt from preprompts + learned knowledge
  const context = await assembleContext({
    agentContext: {
      sessionId,
      currentMessage: message,
      messageHistory: history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      retrievedFacts: (await retrieveRelevantFacts(message)).entries,
    },
  })

  // Generate response
  const result = await ollamaQueue.enqueue(
    () =>
      generateText({
        system: context.systemPrompt || undefined,
        model,
        messages: history.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        experimental_telemetry: { isEnabled: true },
        abortSignal: AbortSignal.timeout(60_000),
      }),
    "interactive",
  )

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

  emitEvent(
    {
      type: "log",
      source: "galatea-api",
      body: "chat.response_delivered",
      attributes: {
        "event.name": "chat.response_delivered",
        "session.id": sessionId,
        model: modelName,
        "tokens.total": result.usage.totalTokens || 0,
      },
    },
    opts?.observationStorePath,
  ).catch(() => {}) // emitEvent logs to console internally; swallow file-write failures

  return { text: result.text, signalClassification }
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
  opts?: { observationStorePath?: string },
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
  const context = await assembleContext({
    agentContext: {
      sessionId,
      currentMessage: message,
      messageHistory: history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      retrievedFacts: (await retrieveRelevantFacts(message)).entries,
    },
  })

  // Stream response — acquire slot manually since streamText returns synchronously
  const slot = await ollamaQueue.acquireSlot("interactive")
  try {
    const result = streamText({
      system: context.systemPrompt || undefined,
      model,
      messages: history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      experimental_telemetry: { isEnabled: true },
      onFinish: async ({ text, usage }) => {
        slot.release()
        await db.insert(messages).values({
          sessionId,
          role: "assistant",
          content: text,
          model: modelName,
          tokenCount: usage.totalTokens || 0,
          inputTokens: usage.inputTokens || 0,
          outputTokens: usage.outputTokens || 0,
        })

        emitEvent(
          {
            type: "log",
            source: "galatea-api",
            body: "chat.response_delivered",
            attributes: {
              "event.name": "chat.response_delivered",
              "session.id": sessionId,
              model: modelName,
              "tokens.total": usage.totalTokens || 0,
            },
          },
          opts?.observationStorePath,
        ).catch(() => {}) // emitEvent logs to console internally
      },
    })

    return result
  } catch (err) {
    slot.release(false)
    throw err
  }
}
