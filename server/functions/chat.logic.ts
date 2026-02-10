import type { LanguageModel } from "ai"
import { generateText, streamText } from "ai"
import { asc, eq } from "drizzle-orm"
import { db } from "../db"
import { storeHomeostasisState } from "../db/queries/homeostasis"
import { messages, sessions } from "../db/schema"
import { ActivityRouter } from "../engine/activity-router"
import { HomeostasisEngine } from "../engine/homeostasis-engine"
import { createReflexionLoop } from "../engine/reflexion-loop"
import type { AgentContext, Task } from "../engine/types"
import { assembleContext } from "../memory/context-assembler"
import { evaluateGatekeeper } from "../memory/gatekeeper"
import { ingestMessages } from "../memory/graphiti-client"
import type { GraphitiMessage, ScoredFact } from "../memory/types"

/**
 * Build AgentContext from message history and retrieval results.
 * Populates lastMessageTime, hasAssignedTask, recentActionCount,
 * and retrievedFacts so homeostasis dimensions actually vary.
 */
function buildAgentContext(
  sessionId: string,
  message: string,
  history: Array<{ role: string; content: string; createdAt: Date }>,
  retrievalData?: { scoredFacts: ScoredFact[] },
): AgentContext {
  // Find the last assistant message timestamp (before current exchange)
  const assistantMessages = history.filter((m) => m.role === "assistant")
  const lastAssistantMsg = assistantMessages[assistantMessages.length - 1]
  const lastMessageTime = lastAssistantMsg?.createdAt

  // Count messages in the last 30 minutes for recentActionCount
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000)
  const recentActionCount = history.filter(
    (m) => m.createdAt > thirtyMinAgo,
  ).length

  // Use first message time as task start (session = task)
  const firstMessage = history[0]
  const currentTaskStartTime = firstMessage?.createdAt

  // Map scored facts to the format AgentContext expects
  const retrievedFacts = (retrievalData?.scoredFacts ?? []).map((f) => ({
    content: f.fact,
    confidence: f.finalScore,
  }))

  return {
    sessionId,
    currentMessage: message,
    messageHistory: history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    lastMessageTime,
    hasAssignedTask: history.length > 0,
    recentActionCount,
    currentTaskStartTime,
    retrievedFacts,
  }
}

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
 *
 * Phase 3 Integration:
 * - Activity Router classifies task complexity (Level 0-3)
 * - Level 3 tasks use Reflexion Loop for deep reasoning
 * - Homeostasis Engine assesses psychological balance
 *
 * Error Handling: All Phase 3 components use graceful degradation.
 * If any component fails, the chat flow continues with fallbacks.
 */
export async function sendMessageLogic(
  sessionId: string,
  message: string,
  model: LanguageModel,
  modelName: string,
) {
  try {
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
    let retrievalData: { scoredFacts: ScoredFact[] } | undefined
    try {
      const ctx = await assembleContext(sessionId, message)
      systemPrompt = ctx.systemPrompt
      retrievalData = { scoredFacts: ctx.scoredFacts }
    } catch {
      console.warn("[memory] assembleContext failed, using empty system prompt")
    }

    // Build agent context for Activity Router and Homeostasis Engine
    // (after assembleContext so we can include retrieved facts)
    const agentContext = buildAgentContext(
      sessionId,
      message,
      history,
      retrievalData,
    )

    // Activity Router: classify task complexity
    const router = new ActivityRouter()
    const task: Task = { message, sessionId }
    let classification: Awaited<ReturnType<typeof router.classify>>
    try {
      classification = await router.classify(task, null, null)
    } catch (error) {
      console.warn(
        "[activity-router] Classification failed, defaulting to Level 2",
      )
      classification = {
        level: 2,
        reason: "Fallback to Level 2 due to classification error",
        model: "sonnet",
        skipMemory: false,
        skipHomeostasis: false,
      }
    }

    // Generate response based on activity level
    let responseText = ""
    let totalTokens = 0
    let inputTokens = 0
    let outputTokens = 0

    if (classification.level === 3) {
      // Level 3: Use Reflexion Loop for deep reasoning
      console.log("[activity-router] Level 3 task, using Reflexion Loop")
      const reflexionLoop = createReflexionLoop(model)
      try {
        const reflexionResult = await reflexionLoop.execute(
          task,
          agentContext,
          3,
        )
        responseText = reflexionResult.final_draft
        // Use actual token usage from reflexion loop
        totalTokens = reflexionResult.total_tokens || 0
        // Approximate input/output split (60/40 ratio typical for generation)
        inputTokens = Math.floor(totalTokens * 0.6)
        outputTokens = Math.floor(totalTokens * 0.4)
      } catch (error) {
        console.warn(
          "[reflexion-loop] Reflexion loop failed, falling back to direct LLM",
        )
        // Fallback to direct LLM
        const result = await generateText({
          model,
          system: systemPrompt,
          messages: history.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          experimental_telemetry: { isEnabled: true },
        })
        responseText = result.text
        totalTokens = result.usage.totalTokens || 0
        inputTokens = result.usage.inputTokens || 0
        outputTokens = result.usage.outputTokens || 0
      }
    } else {
      // Level 0-2: Use direct LLM (existing path)
      const result = await generateText({
        model,
        system: systemPrompt,
        messages: history.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        experimental_telemetry: { isEnabled: true },
      })
      responseText = result.text
      totalTokens = result.usage.totalTokens || 0
      inputTokens = result.usage.inputTokens || 0
      outputTokens = result.usage.outputTokens || 0
    }

    // Store assistant response
    const [assistantMessage] = await db
      .insert(messages)
      .values({
        sessionId,
        role: "assistant",
        content: responseText,
        model: modelName,
        tokenCount: totalTokens,
        inputTokens,
        outputTokens,
        activityLevel: classification.level,
      })
      .returning()

    // Homeostasis Engine: assess psychological balance (fire-and-forget)
    if (!classification.skipHomeostasis) {
      const engine = new HomeostasisEngine()
      engine
        .assessAll(agentContext)
        .then((state) => {
          console.log("[homeostasis]", state)
          // Store in database
          return storeHomeostasisState(sessionId, assistantMessage.id, state)
        })
        .then((stored) => {
          console.log("[homeostasis] Stored state:", stored.id)
        })
        .catch((error) => {
          console.warn("[homeostasis] Assessment or storage failed:", error)
        })
    }

    // Gatekeeper: decide whether to ingest into knowledge graph (graceful degradation)
    try {
      const decision = evaluateGatekeeper(message, responseText)
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
            content: responseText,
            role_type: "assistant",
            role: "assistant",
            name: `msg-${Date.now()}-assistant`,
            source_description: `session:${sessionId}`,
          },
        ]
        ingestMessages(sessionId, graphitiMessages).catch((error) => {
          console.warn(
            "[graphiti] Ingestion failed, gracefully continuing:",
            error,
          )
        })
      }
    } catch (error) {
      console.warn("[gatekeeper] Evaluation failed, skipping ingestion:", error)
    }

    return { text: responseText }
  } catch (error) {
    // Top-level error handler: log and return error message
    console.error("[chat] Catastrophic error in sendMessageLogic:", error)
    const errorMessage =
      "I encountered an error processing your message. Please try again."

    // Store error response if possible
    try {
      await db.insert(messages).values({
        sessionId,
        role: "assistant",
        content: errorMessage,
        model: modelName,
      })
    } catch (dbError) {
      console.error("[chat] Failed to store error response:", dbError)
    }

    return { text: errorMessage }
  }
}

/**
 * Stream a message response in a chat session.
 *
 * Stores user message, builds context (with Graphiti knowledge), calls
 * streamText(). The onFinish callback saves the assistant response + token
 * usage to DB and ingests the exchange into the knowledge graph.
 * Returns the StreamTextResult for the API route to consume.
 *
 * Phase 3 Integration:
 * - Activity Router classifies task complexity (Level 0-3)
 * - Level 3 tasks use Reflexion Loop (non-streaming fallback)
 * - Homeostasis Engine assesses psychological balance
 *
 * Error Handling: All Phase 3 components use graceful degradation.
 * If any component fails, the chat flow continues with fallbacks.
 */
export async function streamMessageLogic(
  sessionId: string,
  message: string,
  model: LanguageModel,
  modelName: string,
) {
  try {
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
    let streamRetrievalData: { scoredFacts: ScoredFact[] } | undefined
    try {
      const ctx = await assembleContext(sessionId, message)
      systemPrompt = ctx.systemPrompt
      streamRetrievalData = { scoredFacts: ctx.scoredFacts }
    } catch {
      console.warn("[memory] assembleContext failed, using empty system prompt")
    }

    // Build agent context for Activity Router and Homeostasis Engine
    // (after assembleContext so we can include retrieved facts)
    const agentContext = buildAgentContext(
      sessionId,
      message,
      history,
      streamRetrievalData,
    )

    // Activity Router: classify task complexity
    const router = new ActivityRouter()
    const task: Task = { message, sessionId }
    let classification: Awaited<ReturnType<typeof router.classify>>
    try {
      classification = await router.classify(task, null, null)
    } catch (error) {
      console.warn(
        "[activity-router] Classification failed, defaulting to Level 2",
      )
      classification = {
        level: 2,
        reason: "Fallback to Level 2 due to classification error",
        model: "sonnet",
        skipMemory: false,
        skipHomeostasis: false,
      }
    }

    // For Level 3, we cannot stream reflexion output, so fall back to non-streaming
    if (classification.level === 3) {
      console.log(
        "[activity-router] Level 3 task detected - reflexion cannot stream, using non-streaming path",
      )
      // Delegate to sendMessageLogic for Level 3
      return sendMessageLogic(sessionId, message, model, modelName).then(
        (result) => {
          // Return a mock StreamTextResult that contains the text
          // This is a limitation: reflexion cannot stream
          return streamText({
            model,
            prompt: result.text,
            experimental_telemetry: { isEnabled: true },
          })
        },
      )
    }

    // Level 0-2: Use streaming (normal path)
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
        const [assistantMessage] = await db
          .insert(messages)
          .values({
            sessionId,
            role: "assistant",
            content: text,
            model: modelName,
            tokenCount: usage.totalTokens || 0,
            inputTokens: usage.inputTokens || 0,
            outputTokens: usage.outputTokens || 0,
            activityLevel: classification.level,
          })
          .returning()

        // Homeostasis Engine: assess psychological balance (fire-and-forget)
        if (!classification.skipHomeostasis) {
          const engine = new HomeostasisEngine()
          engine
            .assessAll(agentContext)
            .then((state) => {
              console.log("[homeostasis]", state)
              // Store in database
              return storeHomeostasisState(
                sessionId,
                assistantMessage.id,
                state,
              )
            })
            .then((stored) => {
              console.log("[homeostasis] Stored state:", stored.id)
            })
            .catch((error) => {
              console.warn("[homeostasis] Assessment or storage failed:", error)
            })
        }

        // Gatekeeper: decide whether to ingest into knowledge graph (graceful degradation)
        try {
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
            ingestMessages(sessionId, graphitiMessages).catch((error) => {
              console.warn(
                "[graphiti] Ingestion failed, gracefully continuing:",
                error,
              )
            })
          }
        } catch (error) {
          console.warn(
            "[gatekeeper] Evaluation failed, skipping ingestion:",
            error,
          )
        }
      },
    })

    return result
  } catch (error) {
    // Top-level error handler: log and return error stream
    console.error("[chat] Catastrophic error in streamMessageLogic:", error)
    const errorMessage =
      "I encountered an error processing your message. Please try again."

    // Store error response if possible
    try {
      await db.insert(messages).values({
        sessionId,
        role: "assistant",
        content: errorMessage,
        model: modelName,
      })
    } catch (dbError) {
      console.error("[chat] Failed to store error response:", dbError)
    }

    // Return error as stream
    return streamText({
      model,
      prompt: errorMessage,
      experimental_telemetry: { isEnabled: true },
    })
  }
}
