// @vitest-environment node

/**
 * Trace 6: Unknown Situation (Escalation to Level 3) Scenario Test
 *
 * Stage G reference scenario — full pipeline integration test with Ollama.
 *
 * What we're testing:
 * Does the activity router escalate to Level 3 when a message contains knowledge
 * gap markers? Does homeostasis detect the gap? What does the full pipeline look
 * like when the system encounters something truly unfamiliar?
 *
 * Key questions:
 * - Does "How do I" + "never done" + "not sure" reliably trigger Level 3?
 * - Does the reflexion loop actually run (2+ LLM calls, critique step)?
 * - Is the Level 3 response longer/more detailed than a Level 2 response?
 * - Does Graphiti inflate knowledge_sufficiency with tangential facts?
 *
 * Approach: Observational/documentary. Hard expects for deterministic behavior,
 * soft expects for LLM-dependent behavior, and structured console logs to
 * document the full system state for each scenario.
 */

import { ollama } from "ai-sdk-ollama"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"
import { homeostasisStates, messages, sessions } from "../../server/db/schema"
import {
  HomeostasisEngine,
  createHomeostasisEngine,
} from "../../server/engine/homeostasis-engine"
import {
  ActivityRouter,
  createActivityRouter,
} from "../../server/engine/activity-router"
import { enrichTaskWithFlags } from "../../server/engine/classification-helpers"
import type { AgentContext, HomeostasisState, Task } from "../../server/engine/types"
import {
  createSessionLogic,
  getSessionMessagesLogic,
  sendMessageLogic,
} from "../../server/functions/chat.logic"
import { getHomeostasisStateLogic } from "../../server/functions/homeostasis.logic"
import { searchFacts } from "../../server/memory/graphiti-client"

const TEST_DB_URL =
  process.env.DATABASE_URL ||
  "postgres://galatea:galatea@localhost:15432/galatea"

const MODEL_ID = "glm-4.7-flash"

/**
 * Log a structured trace of the full scenario state.
 */
function logTraceState(
  label: string,
  data: {
    homeostasis?: Awaited<ReturnType<typeof getHomeostasisStateLogic>> | null
    facts?: Array<{ uuid: string; fact: string }>
    activityLevel?: number | null
    guidance?: ReturnType<HomeostasisEngine["getGuidance"]>
    classification?: Awaited<ReturnType<ActivityRouter["classify"]>>
    responseSnippet?: string
    responseLength?: number
    previousState?: Awaited<ReturnType<typeof getHomeostasisStateLogic>> | null
  },
) {
  console.log(`\n[trace6] === ${label} ===`)

  if (data.homeostasis) {
    console.log("[trace6] Homeostasis dimensions:", JSON.stringify(data.homeostasis.dimensions, null, 2))
    console.log("[trace6] Assessment methods:", JSON.stringify(data.homeostasis.assessmentMethod, null, 2))
    console.log("[trace6] Assessed at:", data.homeostasis.assessedAt)
  } else {
    console.log("[trace6] Homeostasis: null (not yet stored or not assessed)")
  }

  if (data.facts !== undefined) {
    console.log(`[trace6] Memory retrieval: ${data.facts.length} facts found`)
    if (data.facts.length > 0) {
      for (const f of data.facts.slice(0, 10)) {
        console.log(`[trace6]   - [${f.uuid.slice(0, 8)}] ${f.fact}`)
      }
      if (data.facts.length > 10) {
        console.log(`[trace6]   ... and ${data.facts.length - 10} more`)
      }
    }
  }

  if (data.activityLevel !== undefined) {
    console.log(`[trace6] Activity level: ${data.activityLevel}`)
  }

  if (data.classification) {
    console.log(`[trace6] Classification: Level ${data.classification.level} -- ${data.classification.reason}`)
    console.log(`[trace6]   model: ${data.classification.model}, skipMemory: ${data.classification.skipMemory}, skipHomeostasis: ${data.classification.skipHomeostasis}`)
  }

  if (data.guidance !== undefined) {
    if (data.guidance) {
      console.log(`[trace6] Guidance: ${JSON.stringify(data.guidance, null, 2)}`)
    } else {
      console.log("[trace6] Guidance: null (all dimensions HEALTHY)")
    }
  }

  if (data.responseLength !== undefined) {
    console.log(`[trace6] Response length: ${data.responseLength} chars`)
  }

  if (data.previousState) {
    console.log("[trace6] Previous state dimensions:", JSON.stringify(data.previousState.dimensions, null, 2))
    if (data.homeostasis) {
      // Log dimension-by-dimension comparison
      const dims = Object.keys(data.homeostasis.dimensions) as Array<keyof typeof data.homeostasis.dimensions>
      const changes: string[] = []
      for (const dim of dims) {
        const prev = data.previousState.dimensions[dim]
        const curr = data.homeostasis.dimensions[dim]
        if (prev !== curr) {
          changes.push(`${dim}: ${prev} -> ${curr}`)
        }
      }
      if (changes.length > 0) {
        console.log("[trace6] State changes:", changes.join(", "))
      } else {
        console.log("[trace6] State changes: none (all dimensions unchanged)")
      }
    }
  }

  if (data.responseSnippet !== undefined) {
    const snippet = data.responseSnippet.slice(0, 300)
    console.log(`[trace6] Response snippet: "${snippet}${data.responseSnippet.length > 300 ? "..." : ""}"`)
  }

  console.log(`[trace6] === END ${label} ===\n`)
}

describe("Trace 6: Unknown Situation (Escalation to Level 3)", () => {
  const client = postgres(TEST_DB_URL)
  const testDb = drizzle(client)
  const sessionIds: string[] = []

  // Shared state across sequential tests
  let sharedSessionId: string | null = null
  let firstMessageState: Awaited<ReturnType<typeof getHomeostasisStateLogic>> | null = null
  let level3ResponseLength = 0

  afterAll(async () => {
    // Wait for any remaining fire-and-forget homeostasis storage
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Clean up test data (FK order: homeostasis_states -> messages -> sessions)
    for (const sessionId of sessionIds) {
      await testDb
        .delete(homeostasisStates)
        .where(eq(homeostasisStates.sessionId, sessionId))
      await testDb.delete(messages).where(eq(messages.sessionId, sessionId))
      await testDb.delete(sessions).where(eq(sessions.id, sessionId))
    }
    await client.end()
  })

  // ---------------------------------------------------------------------------
  // Test 1: Escalation to Level 3 when knowledge gap detected
  // ---------------------------------------------------------------------------
  it("escalates to Level 3 when knowledge gap detected in message", async () => {
    // Create a fresh session
    const session = await createSessionLogic("Trace6: Unknown Situation Test")
    sessionIds.push(session.id)
    sharedSessionId = session.id

    const unknownTopicMessage =
      "How do I implement push notifications in Expo? I've never done this before and I'm not sure which service to use — expo-notifications, OneSignal, or Firebase?"

    // --- Step 1: Search Graphiti directly to document baseline ---
    const factsAboutPushNotifications = await searchFacts(
      "push notifications Expo expo-notifications OneSignal Firebase",
      [],
      20,
    )
    console.log(
      `[trace6] Pre-check: Graphiti has ${factsAboutPushNotifications.length} facts about push notifications/Expo`,
    )

    // --- Step 2: Classify with ActivityRouter directly to verify Level 3 ---
    const router = createActivityRouter()
    const task: Task = { message: unknownTopicMessage, sessionId: session.id }
    const classification = await router.classify(task, null, null)

    logTraceState("DIRECT CLASSIFICATION: Unknown Topic (push notifications)", {
      classification,
    })

    // HARD ASSERT: classification level = 3 (hasKnowledgeGap triggers reflexion)
    // The message contains: "How do I" + "never done" + "not sure" (3 gap markers)
    expect(classification.level).toBe(3)
    expect(classification.reason).toContain("Knowledge gap")

    // --- Step 3: Send message through full pipeline ---
    // Level 3 activates reflexion loop: generates draft, critiques, possibly revises
    console.log("[trace6] Sending Level 3 message through pipeline (reflexion loop)...")
    const startTime = Date.now()

    const result = await sendMessageLogic(
      session.id,
      unknownTopicMessage,
      ollama(MODEL_ID),
      MODEL_ID,
    )

    const elapsedMs = Date.now() - startTime
    console.log(`[trace6] Pipeline completed in ${elapsedMs}ms`)

    expect(result.text).toBeDefined()
    expect(result.text.length).toBeGreaterThan(0)
    level3ResponseLength = result.text.length

    // --- Step 4: Wait for fire-and-forget homeostasis storage ---
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // --- Step 5: Query the stored homeostasis state ---
    const homeostasisState = await getHomeostasisStateLogic(session.id)
    firstMessageState = homeostasisState

    // --- Step 6: Query messages to get activity level ---
    const msgs = await getSessionMessagesLogic(session.id)
    const assistantMsg = msgs.find((m) => m.role === "assistant")
    const activityLevel = assistantMsg?.activityLevel ?? null

    // --- Step 7: Run engine directly to get guidance ---
    const engine = createHomeostasisEngine()
    const agentContext: AgentContext = {
      sessionId: session.id,
      currentMessage: unknownTopicMessage,
      messageHistory: msgs.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      retrievedFacts: factsAboutPushNotifications.map((f) => ({
        content: f.fact,
        confidence: 0.8,
      })),
      hasAssignedTask: true,
      lastMessageTime: msgs[0]?.createdAt,
    }
    const directState = await engine.assessAll(agentContext)
    const guidance = engine.getGuidance(directState)

    // --- Step 8: Log full state ---
    logTraceState("SCENARIO STATE: Unknown Topic — Push Notifications in Expo", {
      homeostasis: homeostasisState,
      facts: factsAboutPushNotifications,
      activityLevel,
      guidance,
      classification,
      responseSnippet: result.text,
      responseLength: result.text.length,
    })

    // ---- HARD ASSERTIONS (deterministic from engine code) ----

    // Activity level: Should be 3 (hasKnowledgeGap -> reflexion loop)
    expect(activityLevel).toBe(3)

    expect(homeostasisState).not.toBeNull()
    if (homeostasisState) {
      // productive_engagement: HEALTHY because hasAssignedTask = history.length > 0
      // (user message was stored before LLM call, so history has >= 1 message)
      expect(homeostasisState.dimensions.productive_engagement).toBe("HEALTHY")

      // certainty_alignment: HEALTHY for this message
      // The message does NOT contain high-stakes keywords like "deploy", "production",
      // "delete", "security" — it's about push notification setup, so no high-stakes concern.
      // It DOES contain "not sure" (uncertainty marker), but only the combination of
      // uncertainty + high-stakes triggers certainty_alignment = LOW.
      // Since there's no high-stakes keyword, certainty_alignment is HEALTHY.
      expect(homeostasisState.dimensions.certainty_alignment).toBe("HEALTHY")

      // Document knowledge_sufficiency — may be inflated by tangential Graphiti facts.
      // This is the key limitation discovered in prior traces: Graphiti returns
      // NestJS/architecture facts for ANY query, which inflates knowledge_sufficiency
      // even for truly unknown topics.
      console.log(`[trace6] knowledge_sufficiency: ${homeostasisState.dimensions.knowledge_sufficiency}`)
      if (factsAboutPushNotifications.length > 0) {
        console.log(
          `[trace6] LIMITATION: Graphiti returned ${factsAboutPushNotifications.length} facts for push notifications query.`,
        )
        console.log(
          "[trace6] These are likely tangential (NestJS/architecture facts from prior sessions),",
        )
        console.log(
          "[trace6] not actual push notification knowledge. This inflates knowledge_sufficiency.",
        )
      }

      // All assessments should be "computed" (no LLM assessments implemented yet)
      for (const [, method] of Object.entries(homeostasisState.assessmentMethod)) {
        expect(method).toBe("computed")
      }
    }

    // Document reflexion timing — Level 3 should be slower than Level 2 because
    // it runs Draft + Critique (2 LLM calls minimum, possibly revise for 3+)
    console.log(`[trace6] Reflexion pipeline time: ${elapsedMs}ms`)
    console.log(`[trace6] Response length (Level 3): ${result.text.length} chars`)
  }, 120_000)

  // ---------------------------------------------------------------------------
  // Test 2: Contrast — routine task stays at Level 2
  // ---------------------------------------------------------------------------
  it("contrast: routine task stays at Level 2", async () => {
    // This test MUST run after test 1 (uses shared session)
    expect(sharedSessionId).not.toBeNull()
    const sessionId = sharedSessionId!

    const routineMessage = "Add a loading spinner to the notifications list screen"

    // --- Step 1: Classify directly to verify Level 2 ---
    const router = createActivityRouter()
    const task: Task = { message: routineMessage, sessionId }
    const classification = await router.classify(task, null, null)

    // HARD ASSERT: Level 2 (no knowledge gap markers)
    // "Add a loading spinner" has none of: "how do i", "how to", "not sure",
    // "don't know", "unclear", "help me", "what is", "explain", "never done", "first time"
    expect(classification.level).toBe(2)
    expect(classification.reason).toBe("Standard reasoning task")

    // --- Step 2: Send message through full pipeline ---
    console.log("[trace6] Sending Level 2 message through pipeline (direct LLM)...")
    const startTime = Date.now()

    const result = await sendMessageLogic(
      sessionId,
      routineMessage,
      ollama(MODEL_ID),
      MODEL_ID,
    )

    const elapsedMs = Date.now() - startTime
    console.log(`[trace6] Pipeline completed in ${elapsedMs}ms`)

    expect(result.text).toBeDefined()
    expect(result.text.length).toBeGreaterThan(0)

    // --- Step 3: Wait for fire-and-forget homeostasis storage ---
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // --- Step 4: Query the stored homeostasis state ---
    const homeostasisState = await getHomeostasisStateLogic(sessionId)

    // --- Step 5: Query messages to get activity level ---
    const msgs = await getSessionMessagesLogic(sessionId)
    const assistantMsgs = msgs.filter((m) => m.role === "assistant")
    const latestAssistantMsg = assistantMsgs[assistantMsgs.length - 1]
    const activityLevel = latestAssistantMsg?.activityLevel ?? null

    // --- Step 6: Get guidance ---
    const engine = createHomeostasisEngine()
    let guidance: ReturnType<HomeostasisEngine["getGuidance"]> = null
    if (homeostasisState) {
      const stateForGuidance: HomeostasisState = {
        knowledge_sufficiency: homeostasisState.dimensions.knowledge_sufficiency as any,
        certainty_alignment: homeostasisState.dimensions.certainty_alignment as any,
        progress_momentum: homeostasisState.dimensions.progress_momentum as any,
        communication_health: homeostasisState.dimensions.communication_health as any,
        productive_engagement: homeostasisState.dimensions.productive_engagement as any,
        knowledge_application: homeostasisState.dimensions.knowledge_application as any,
        assessed_at: new Date(homeostasisState.assessedAt),
        assessment_method: homeostasisState.assessmentMethod as any,
      }
      guidance = engine.getGuidance(stateForGuidance)
    }

    // --- Step 7: Log full state with comparison to first message ---
    logTraceState("CONTRAST: Routine Task — Loading Spinner", {
      homeostasis: homeostasisState,
      activityLevel,
      guidance,
      classification,
      responseSnippet: result.text,
      responseLength: result.text.length,
      previousState: firstMessageState,
    })

    // ---- HARD ASSERTIONS ----

    // Activity level should be 2 (no knowledge gap markers)
    expect(activityLevel).toBe(2)

    expect(homeostasisState).not.toBeNull()
    if (homeostasisState) {
      // productive_engagement: HEALTHY (has assigned task, history > 0)
      expect(homeostasisState.dimensions.productive_engagement).toBe("HEALTHY")

      // certainty_alignment: HEALTHY for this message
      // "Add a loading spinner to the notifications list screen" contains no
      // high-stakes keywords and no uncertainty markers.
      expect(homeostasisState.dimensions.certainty_alignment).toBe("HEALTHY")

      // Document communication_health: since tests run back-to-back within seconds,
      // lastMessageTime is very recent (< 2 min) so communication_health should be HIGH.
      console.log(`[trace6] communication_health: ${homeostasisState.dimensions.communication_health}`)
      console.log("[trace6] Expected HIGH since < 2min since last message in pipeline context")
    }

    // Document response length comparison (Level 3 vs Level 2)
    console.log(`[trace6] Response length comparison:`)
    console.log(`[trace6]   Level 3 (unknown topic): ${level3ResponseLength} chars`)
    console.log(`[trace6]   Level 2 (routine task):  ${result.text.length} chars`)
    if (level3ResponseLength > result.text.length) {
      console.log("[trace6]   Level 3 response is LONGER (expected: reflexion adds detail)")
    } else {
      console.log("[trace6]   Level 3 response is NOT longer (unexpected, but LLM output varies)")
    }
  }, 120_000)

  // ---------------------------------------------------------------------------
  // Test 3: Documents classification flags for escalation triggers
  // ---------------------------------------------------------------------------
  it("documents classification flags for escalation triggers", async () => {
    const router = createActivityRouter()

    // ---- Message A: Knowledge gap question ----
    const messageA = "How do I implement push notifications?"
    const taskA: Task = { message: messageA, sessionId: "test-trace6-flags" }
    const enrichedA = enrichTaskWithFlags(taskA)
    const classificationA = await router.classify(taskA, null, null)

    // ---- Message B: Routine task (no gap) ----
    const messageB = "Add a loading spinner"
    const taskB: Task = { message: messageB, sessionId: "test-trace6-flags" }
    const enrichedB = enrichTaskWithFlags(taskB)
    const classificationB = await router.classify(taskB, null, null)

    // ---- Message C: Another knowledge gap (OAuth) ----
    const messageC = "Help me understand the OAuth2 PKCE flow"
    const taskC: Task = { message: messageC, sessionId: "test-trace6-flags" }
    const enrichedC = enrichTaskWithFlags(taskC)
    const classificationC = await router.classify(taskC, null, null)

    // ---- Message D: High-stakes (deploy to production) ----
    const messageD = "Deploy notifications to production"
    const taskD: Task = { message: messageD, sessionId: "test-trace6-flags" }
    const enrichedD = enrichTaskWithFlags(taskD)
    const classificationD = await router.classify(taskD, null, null)

    // ---- Log all classifications ----
    console.log("\n[trace6] === CLASSIFICATION FLAGS MATRIX ===")

    console.log(`[trace6] Message A: "${messageA}"`)
    console.log("[trace6]   flags:", JSON.stringify({
      hasKnowledgeGap: enrichedA.hasKnowledgeGap,
      isHighStakes: enrichedA.isHighStakes,
      isIrreversible: enrichedA.isIrreversible,
      isToolCall: enrichedA.isToolCall,
      isTemplate: enrichedA.isTemplate,
    }))
    console.log(`[trace6]   classification: Level ${classificationA.level} -- ${classificationA.reason}`)

    console.log(`[trace6] Message B: "${messageB}"`)
    console.log("[trace6]   flags:", JSON.stringify({
      hasKnowledgeGap: enrichedB.hasKnowledgeGap,
      isHighStakes: enrichedB.isHighStakes,
      isIrreversible: enrichedB.isIrreversible,
      isToolCall: enrichedB.isToolCall,
      isTemplate: enrichedB.isTemplate,
    }))
    console.log(`[trace6]   classification: Level ${classificationB.level} -- ${classificationB.reason}`)

    console.log(`[trace6] Message C: "${messageC}"`)
    console.log("[trace6]   flags:", JSON.stringify({
      hasKnowledgeGap: enrichedC.hasKnowledgeGap,
      isHighStakes: enrichedC.isHighStakes,
      isIrreversible: enrichedC.isIrreversible,
      isToolCall: enrichedC.isToolCall,
      isTemplate: enrichedC.isTemplate,
    }))
    console.log(`[trace6]   classification: Level ${classificationC.level} -- ${classificationC.reason}`)

    console.log(`[trace6] Message D: "${messageD}"`)
    console.log("[trace6]   flags:", JSON.stringify({
      hasKnowledgeGap: enrichedD.hasKnowledgeGap,
      isHighStakes: enrichedD.isHighStakes,
      isIrreversible: enrichedD.isIrreversible,
      isToolCall: enrichedD.isToolCall,
      isTemplate: enrichedD.isTemplate,
    }))
    console.log(`[trace6]   classification: Level ${classificationD.level} -- ${classificationD.reason}`)

    console.log("[trace6] === END CLASSIFICATION FLAGS MATRIX ===\n")

    // ---- HARD ASSERTIONS: Message A ----
    // "How do I implement push notifications?" contains "how do i" -> hasKnowledgeGap = true
    expect(enrichedA.hasKnowledgeGap).toBe(true)
    expect(enrichedA.isHighStakes).toBe(false)
    expect(classificationA.level).toBe(3)

    // ---- HARD ASSERTIONS: Message B ----
    // "Add a loading spinner" has NO gap markers -> hasKnowledgeGap = false
    expect(enrichedB.hasKnowledgeGap).toBe(false)
    expect(enrichedB.isHighStakes).toBe(false)
    expect(classificationB.level).toBe(2)

    // ---- HARD ASSERTIONS: Message C ----
    // "Help me understand the OAuth2 PKCE flow" contains "help me" -> hasKnowledgeGap = true
    expect(enrichedC.hasKnowledgeGap).toBe(true)
    expect(enrichedC.isHighStakes).toBe(false)
    expect(classificationC.level).toBe(3)

    // ---- HARD ASSERTIONS: Message D ----
    // "Deploy notifications to production" contains "deploy" and "production" -> isHighStakes = true
    // Does NOT contain any knowledge gap markers -> hasKnowledgeGap = false
    expect(enrichedD.hasKnowledgeGap).toBe(false)
    expect(enrichedD.isHighStakes).toBe(true)

    // Level for Message D: isHighStakes = true but hasKnowledgeGap = false.
    // The ActivityRouter checks:
    // 1. hasKnowledgeGap -> Level 3 (not triggered)
    // 2. isHighStakes + isIrreversible -> Level 3
    // 3. hasProcedureMatch -> Level 1 (no procedure, not triggered)
    // 4. Default -> Level 2
    // "Deploy notifications to production" matches "deploy to production" in irreversible keywords?
    // Let's check: isIrreversibleAction checks for "deploy to production" substring.
    // The message is "Deploy notifications to production" — does it contain "deploy to production"?
    // "deploy notifications to production" does NOT contain the exact substring "deploy to production".
    // So isIrreversible = false, and without knowledge gap -> Level 2.
    console.log(`[trace6] Message D isIrreversible: ${enrichedD.isIrreversible}`)
    if (enrichedD.isIrreversible) {
      // If somehow irreversible triggers, high-stakes + irreversible -> Level 3
      expect(classificationD.level).toBe(3)
    } else {
      // high-stakes but NOT irreversible, and no knowledge gap -> Level 2
      expect(classificationD.level).toBe(2)
    }
  })
})
