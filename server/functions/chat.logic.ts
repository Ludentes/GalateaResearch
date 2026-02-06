import type { LanguageModel } from "ai"
import { generateText, streamText } from "ai"
import { asc, eq } from "drizzle-orm"
import { db } from "../db"
import { messages, sessions } from "../db/schema"
import { assembleContext } from "../memory/context-assembler"
import { evaluateGatekeeper } from "../memory/gatekeeper"
import { ingestMessages } from "../memory/graphiti-client"
import type { GraphitiMessage } from "../memory/types"

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

  // Assemble context: preprompts + Graphiti knowledge (graceful degradation)
  let systemPrompt = ""
  try {
    const ctx = await assembleContext(sessionId, message)
    systemPrompt = ctx.systemPrompt
  } catch {
    console.warn("[memory] assembleContext failed, using empty system prompt")
  }

  // Generate response (non-streaming fallback)
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
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  })

  // Gatekeeper: decide whether to ingest into knowledge graph
  const decision = evaluateGatekeeper(message, result.text)
  if (decision.shouldIngest) {
    const graphitiMessages: GraphitiMessage[] = [
      {
        content: message,
        role_type: "user",
        role: "user",
        name: `msg-${Date.now()}-user`,
        source_description: `session:${sessionId}`,
      },
      {
        content: result.text,
        role_type: "assistant",
        role: "assistant",
        name: `msg-${Date.now()}-assistant`,
        source_description: `session:${sessionId}`,
      },
    ]
    ingestMessages(sessionId, graphitiMessages).catch(() => {
      // Silently swallow — graceful degradation
    })
  }

  return { text: result.text }
}

/**
 * Stream a message response in a chat session.
 *
 * Stores user message, builds context (with Graphiti knowledge), calls
 * streamText(). The onFinish callback saves the assistant response + token
 * usage to DB and ingests the exchange into the knowledge graph.
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

  // Assemble context: preprompts + Graphiti knowledge (graceful degradation)
  let systemPrompt = ""
  try {
    const ctx = await assembleContext(sessionId, message)
    systemPrompt = ctx.systemPrompt
  } catch {
    console.warn("[memory] assembleContext failed, using empty system prompt")
  }

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
      // Save assistant response to DB
      await db.insert(messages).values({
        sessionId,
        role: "assistant",
        content: text,
        model: modelName,
        tokenCount: usage.totalTokens,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      })

      // Gatekeeper: decide whether to ingest into knowledge graph
      const decision = evaluateGatekeeper(message, text)
      if (decision.shouldIngest) {
        const graphitiMessages: GraphitiMessage[] = [
          {
            content: message,
            role_type: "user",
            role: "user",
            name: `msg-${Date.now()}-user`,
            source_description: `session:${sessionId}`,
          },
          {
            content: text,
            role_type: "assistant",
            role: "assistant",
            name: `msg-${Date.now()}-assistant`,
            source_description: `session:${sessionId}`,
          },
        ]
        ingestMessages(sessionId, graphitiMessages).catch(() => {
          // Silently swallow — graceful degradation
        })
      }
    },
  })

  return result
}
