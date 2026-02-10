// @vitest-environment node

/**
 * Trace 4: Execute Task (Sufficient Knowledge) Scenario Test
 *
 * Stage G reference scenario — full pipeline integration test with Ollama.
 *
 * What we're testing:
 * When the user assigns a concrete development task and the system has relevant
 * knowledge in Graphiti, does knowledge_sufficiency improve? Does the activity
 * router choose Level 2? How does the full homeostasis state reflect productive work?
 *
 * Approach: Observational/documentary. Hard expects for deterministic behavior,
 * soft expects for LLM-dependent behavior, and structured console logs to
 * document the full system state for each scenario.
 *
 * Key insight from Trace 2: Graphiti returns tangential facts for any query
 * (NestJS, architecture, etc. from previous sessions). This means
 * knowledge_sufficiency often goes HEALTHY even for "unfamiliar" topics because
 * the system can't distinguish relevant from irrelevant facts.
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
    previousState?: Awaited<ReturnType<typeof getHomeostasisStateLogic>> | null
  },
) {
  console.log(`\n[trace4] === ${label} ===`)

  if (data.homeostasis) {
    console.log("[trace4] Homeostasis dimensions:", JSON.stringify(data.homeostasis.dimensions, null, 2))
    console.log("[trace4] Assessment methods:", JSON.stringify(data.homeostasis.assessmentMethod, null, 2))
    console.log("[trace4] Assessed at:", data.homeostasis.assessedAt)
  } else {
    console.log("[trace4] Homeostasis: null (not yet stored or not assessed)")
  }

  if (data.facts !== undefined) {
    console.log(`[trace4] Memory retrieval: ${data.facts.length} facts found`)
    if (data.facts.length > 0) {
      for (const f of data.facts.slice(0, 10)) {
        console.log(`[trace4]   - [${f.uuid.slice(0, 8)}] ${f.fact}`)
      }
      if (data.facts.length > 10) {
        console.log(`[trace4]   ... and ${data.facts.length - 10} more`)
      }
    }
  }

  if (data.activityLevel !== undefined) {
    console.log(`[trace4] Activity level: ${data.activityLevel}`)
  }

  if (data.classification) {
    console.log(`[trace4] Classification: Level ${data.classification.level} — ${data.classification.reason}`)
    console.log(`[trace4]   model: ${data.classification.model}, skipMemory: ${data.classification.skipMemory}, skipHomeostasis: ${data.classification.skipHomeostasis}`)
  }

  if (data.guidance !== undefined) {
    if (data.guidance) {
      console.log(`[trace4] Guidance: ${JSON.stringify(data.guidance, null, 2)}`)
    } else {
      console.log("[trace4] Guidance: null (all dimensions HEALTHY)")
    }
  }

  if (data.previousState) {
    console.log("[trace4] Previous state dimensions:", JSON.stringify(data.previousState.dimensions, null, 2))
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
        console.log("[trace4] State changes:", changes.join(", "))
      } else {
        console.log("[trace4] State changes: none (all dimensions unchanged)")
      }
    }
  }

  if (data.responseSnippet !== undefined) {
    const snippet = data.responseSnippet.slice(0, 200)
    console.log(`[trace4] Response snippet: "${snippet}${data.responseSnippet.length > 200 ? "..." : ""}"`)
  }

  console.log(`[trace4] === END ${label} ===\n`)
}

describe("Trace 4: Execute Task (Sufficient Knowledge) Scenario", () => {
  const client = postgres(TEST_DB_URL)
  const testDb = drizzle(client)
  const sessionIds: string[] = []

  // Shared state across sequential tests (test 2 and 3 share a session)
  let sharedSessionId: string | null = null
  let firstMessageState: Awaited<ReturnType<typeof getHomeostasisStateLogic>> | null = null

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
  // Test 1: Verify available Graphiti facts for profile screen task
  // ---------------------------------------------------------------------------
  it("verifies available Graphiti facts for profile screen task", async () => {
    const factsAboutProfile = await searchFacts(
      "user profile screen expo NativeWind",
      [],
      20,
    )

    logTraceState("GRAPHITI BASELINE: Profile Screen Task", {
      facts: factsAboutProfile,
    })

    // Document what Graphiti knows. This is purely observational —
    // the key finding from Trace 2 is that Graphiti often returns tangential
    // facts (e.g., NestJS architecture) for any query.
    console.log(`[trace4] Baseline: Graphiti returned ${factsAboutProfile.length} facts for "user profile screen expo NativeWind"`)

    if (factsAboutProfile.length > 0) {
      console.log("[trace4] NOTE: These facts may be tangential (from other sessions), not directly about Expo profile screens.")
      console.log("[trace4] This is the 'knowledge_sufficiency inflation' pattern observed in Trace 2.")
    } else {
      console.log("[trace4] NOTE: No facts returned — knowledge_sufficiency will be LOW for this topic.")
    }

    // No hard assertions on fact count — this test documents the baseline.
    // The fact count directly affects knowledge_sufficiency in later tests.
    expect(factsAboutProfile).toBeDefined()
    expect(Array.isArray(factsAboutProfile)).toBe(true)
  }, 30_000)

  // ---------------------------------------------------------------------------
  // Test 2: Full state when executing concrete development task
  // ---------------------------------------------------------------------------
  it("documents full state when executing concrete development task", async () => {
    // Create a fresh session
    const session = await createSessionLogic("Trace4: Execute Task Test")
    sessionIds.push(session.id)
    sharedSessionId = session.id

    const taskMessage = "Implement a user profile screen with edit functionality using NativeWind for styling"

    // --- Step 1: Search Graphiti to document what the pipeline will see ---
    const factsAboutProfile = await searchFacts(
      taskMessage,
      [],
      20,
    )

    // --- Step 2: Send message through full pipeline ---
    const result = await sendMessageLogic(
      session.id,
      taskMessage,
      ollama(MODEL_ID),
      MODEL_ID,
    )

    expect(result.text).toBeDefined()
    expect(result.text.length).toBeGreaterThan(0)

    // --- Step 3: Wait for fire-and-forget homeostasis storage ---
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // --- Step 4: Query the stored homeostasis state ---
    const homeostasisState = await getHomeostasisStateLogic(session.id)
    firstMessageState = homeostasisState

    // --- Step 5: Query messages to get activity level ---
    const msgs = await getSessionMessagesLogic(session.id)
    const assistantMsg = msgs.find((m) => m.role === "assistant")
    const activityLevel = assistantMsg?.activityLevel ?? null

    // --- Step 6: Run engine directly to get guidance ---
    const engine = createHomeostasisEngine()
    const agentContext: AgentContext = {
      sessionId: session.id,
      currentMessage: taskMessage,
      messageHistory: msgs.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      retrievedFacts: factsAboutProfile.map((f) => ({
        content: f.fact,
        confidence: 0.8,
      })),
      hasAssignedTask: true,
      lastMessageTime: msgs[0]?.createdAt,
    }
    const directState = await engine.assessAll(agentContext)
    const guidance = engine.getGuidance(directState)

    // --- Step 7: Log full state ---
    logTraceState("EXECUTE TASK: Profile Screen Implementation", {
      homeostasis: homeostasisState,
      facts: factsAboutProfile,
      activityLevel,
      guidance,
      responseSnippet: result.text,
    })

    // ---- HARD ASSERTIONS (deterministic from engine code) ----

    expect(homeostasisState).not.toBeNull()
    if (homeostasisState) {
      // productive_engagement: HEALTHY because hasAssignedTask = history.length > 0
      // (user message was stored before LLM call, so history has >= 1 message)
      expect(homeostasisState.dimensions.productive_engagement).toBe("HEALTHY")

      // certainty_alignment: HEALTHY for this message
      // The message "Implement a user profile screen with edit functionality using NativeWind for styling"
      // contains NO high-stakes keywords (no "production", "deploy", "authentication", "security", etc.)
      // and NO uncertainty markers (no "not sure", "uncertain", "might", etc.)
      // Therefore certainty_alignment is deterministically HEALTHY.
      expect(homeostasisState.dimensions.certainty_alignment).toBe("HEALTHY")

      // Document knowledge_sufficiency — depends on Graphiti facts
      console.log(`[trace4] knowledge_sufficiency: ${homeostasisState.dimensions.knowledge_sufficiency}`)
      console.log(`[trace4] Graphiti returned ${factsAboutProfile.length} facts for this query`)
      if (factsAboutProfile.length >= 5) {
        console.log("[trace4] With >= 5 facts, knowledge_sufficiency should be HEALTHY (assuming avg confidence > 0.7)")
      } else if (factsAboutProfile.length > 0) {
        console.log("[trace4] With < 5 facts, knowledge_sufficiency should be LOW (insufficient count)")
      } else {
        console.log("[trace4] With 0 facts, knowledge_sufficiency is LOW (no knowledge retrieved)")
      }

      // All assessments should be "computed" (no LLM assessments implemented yet)
      for (const [, method] of Object.entries(homeostasisState.assessmentMethod)) {
        expect(method).toBe("computed")
      }
    }

    // ---- SOFT ASSERTION (depends on LLM classification) ----

    // The message "Implement a user profile screen..." has NO knowledge gap markers:
    // - No "how do i", "how to", "not sure", "don't know", "help me", "explain", "never done", "first time"
    // Therefore enrichTaskWithFlags.hasKnowledgeGap = false
    // Without knowledge gap, and without procedure match or tool call,
    // ActivityRouter should classify as Level 2 (standard reasoning).
    expect.soft(activityLevel).toBe(2)
  }, 300_000)

  // ---------------------------------------------------------------------------
  // Test 3: State change on follow-up message
  // ---------------------------------------------------------------------------
  it("documents state change on follow-up message", async () => {
    // This test MUST run after test 2 (uses shared session)
    expect(sharedSessionId).not.toBeNull()
    const sessionId = sharedSessionId!

    const followUpMessage = "Add null checks on the user object and wire up the save button"

    // --- Step 1: Send follow-up through full pipeline ---
    const result = await sendMessageLogic(
      sessionId,
      followUpMessage,
      ollama(MODEL_ID),
      MODEL_ID,
    )

    expect(result.text).toBeDefined()
    expect(result.text.length).toBeGreaterThan(0)

    // --- Step 2: Wait for fire-and-forget homeostasis storage ---
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // --- Step 3: Query the stored homeostasis state ---
    const homeostasisState = await getHomeostasisStateLogic(sessionId)

    // --- Step 4: Query messages to get activity level ---
    const msgs = await getSessionMessagesLogic(sessionId)
    // Get the latest assistant message (from this follow-up)
    const assistantMsgs = msgs.filter((m) => m.role === "assistant")
    const latestAssistantMsg = assistantMsgs[assistantMsgs.length - 1]
    const activityLevel = latestAssistantMsg?.activityLevel ?? null

    // --- Step 5: Get guidance for the stored state ---
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

    // --- Step 6: Log full state with comparison to first message ---
    logTraceState("FOLLOW-UP: Null Checks + Save Button", {
      homeostasis: homeostasisState,
      activityLevel,
      guidance,
      responseSnippet: result.text,
      previousState: firstMessageState,
    })

    // ---- HARD ASSERTIONS (deterministic from engine code) ----

    expect(homeostasisState).not.toBeNull()
    if (homeostasisState) {
      // productive_engagement: HEALTHY because hasAssignedTask = history.length > 0
      // (we now have at least 3 messages: user1, assistant1, user2)
      expect(homeostasisState.dimensions.productive_engagement).toBe("HEALTHY")

      // certainty_alignment: HEALTHY for this message
      // "Add null checks on the user object and wire up the save button"
      // - No high-stakes keywords (no "production", "deploy", "delete", etc.)
      // - No uncertainty markers (no "not sure", "might", etc.)
      // Therefore certainty_alignment is HEALTHY.
      expect(homeostasisState.dimensions.certainty_alignment).toBe("HEALTHY")

      // Document communication_health
      // Since test 2 and test 3 run within seconds of each other,
      // lastMessageTime is very recent (< 2 minutes), so
      // communication_health should be HIGH (rapid back-and-forth).
      console.log(`[trace4] communication_health: ${homeostasisState.dimensions.communication_health}`)
      console.log("[trace4] Expected HIGH since < 2min since last message in pipeline context")

      // Document knowledge_sufficiency change
      if (firstMessageState) {
        const prevKS = firstMessageState.dimensions.knowledge_sufficiency
        const currKS = homeostasisState.dimensions.knowledge_sufficiency
        console.log(`[trace4] knowledge_sufficiency: ${prevKS} -> ${currKS}`)
      }
    }

    // ---- SOFT ASSERTION ----

    // Follow-up message "Add null checks..." has no knowledge gap markers.
    // Should be Level 2 (standard reasoning).
    expect.soft(activityLevel).toBe(2)
  }, 300_000)

  // ---------------------------------------------------------------------------
  // Test 4: Activity classification for implementation task
  // ---------------------------------------------------------------------------
  it("documents activity classification for implementation task", async () => {
    const router = createActivityRouter()
    const engine = createHomeostasisEngine()

    // ---- Test 4a: Implementation task (no knowledge gap) ----
    const implementTask: Task = {
      message: "Implement a user profile screen with edit functionality using NativeWind for styling",
      sessionId: "test-trace4-classification",
    }

    const implementEnriched = enrichTaskWithFlags(implementTask)
    const implementClassification = await router.classify(implementTask, null, null)

    // ---- Test 4b: High-stakes contrast ("Deploy the profile service to production") ----
    const deployTask: Task = {
      message: "Deploy the profile service to production",
      sessionId: "test-trace4-classification",
    }

    const deployEnriched = enrichTaskWithFlags(deployTask)
    const deployClassification = await router.classify(deployTask, null, null)

    // ---- Test 4c: Engine with sufficient facts (simulating execute-task scenario) ----
    const contextWithFacts: AgentContext = {
      sessionId: "test-trace4-engine",
      currentMessage: implementTask.message,
      messageHistory: [{ role: "user", content: implementTask.message }],
      retrievedFacts: [
        { content: "NativeWind maps Tailwind CSS to React Native styles", confidence: 0.88 },
        { content: "User profile screens typically have avatar, name, email fields", confidence: 0.85 },
        { content: "Edit mode uses controlled form state with useState hooks", confidence: 0.82 },
        { content: "NativeWind className prop works on React Native View and Text", confidence: 0.90 },
        { content: "Form validation should happen on blur and submit", confidence: 0.80 },
      ],
      retrievedProcedures: [],
      hasAssignedTask: true,
    }

    const stateWithFacts = await engine.assessAll(contextWithFacts)
    const guidanceWithFacts = engine.getGuidance(stateWithFacts)

    // ---- Test 4d: Engine with no facts (for contrast) ----
    const contextNoFacts: AgentContext = {
      sessionId: "test-trace4-engine",
      currentMessage: implementTask.message,
      messageHistory: [{ role: "user", content: implementTask.message }],
      retrievedFacts: [],
      retrievedProcedures: [],
      hasAssignedTask: true,
    }

    const stateNoFacts = await engine.assessAll(contextNoFacts)
    const guidanceNoFacts = engine.getGuidance(stateNoFacts)

    // ---- Log all classification state ----
    logTraceState("CLASSIFICATION: Implementation Task (no gap)", {
      classification: implementClassification,
    })
    console.log("[trace4] Implementation task flags:", JSON.stringify({
      hasKnowledgeGap: implementEnriched.hasKnowledgeGap,
      isHighStakes: implementEnriched.isHighStakes,
      isIrreversible: implementEnriched.isIrreversible,
      isToolCall: implementEnriched.isToolCall,
      isTemplate: implementEnriched.isTemplate,
    }, null, 2))

    logTraceState("CLASSIFICATION: Deploy to Production (high-stakes)", {
      classification: deployClassification,
    })
    console.log("[trace4] Deploy task flags:", JSON.stringify({
      hasKnowledgeGap: deployEnriched.hasKnowledgeGap,
      isHighStakes: deployEnriched.isHighStakes,
      isIrreversible: deployEnriched.isIrreversible,
      isToolCall: deployEnriched.isToolCall,
      isTemplate: deployEnriched.isTemplate,
    }, null, 2))

    logTraceState("ENGINE: With 5 Sufficient Facts (execute task)", {
      homeostasis: {
        dimensions: {
          knowledge_sufficiency: stateWithFacts.knowledge_sufficiency,
          certainty_alignment: stateWithFacts.certainty_alignment,
          progress_momentum: stateWithFacts.progress_momentum,
          communication_health: stateWithFacts.communication_health,
          productive_engagement: stateWithFacts.productive_engagement,
          knowledge_application: stateWithFacts.knowledge_application,
        },
        assessmentMethod: stateWithFacts.assessment_method as any,
        assessedAt: stateWithFacts.assessed_at.toISOString(),
        id: "n/a",
        sessionId: "test",
        messageId: null,
      },
      guidance: guidanceWithFacts,
    })

    logTraceState("ENGINE: No Facts (insufficient knowledge contrast)", {
      homeostasis: {
        dimensions: {
          knowledge_sufficiency: stateNoFacts.knowledge_sufficiency,
          certainty_alignment: stateNoFacts.certainty_alignment,
          progress_momentum: stateNoFacts.progress_momentum,
          communication_health: stateNoFacts.communication_health,
          productive_engagement: stateNoFacts.productive_engagement,
          knowledge_application: stateNoFacts.knowledge_application,
        },
        assessmentMethod: stateNoFacts.assessment_method as any,
        assessedAt: stateNoFacts.assessed_at.toISOString(),
        id: "n/a",
        sessionId: "test",
        messageId: null,
      },
      guidance: guidanceNoFacts,
    })

    // ---- HARD ASSERTIONS (deterministic from classification-helpers code) ----

    // "Implement a user profile screen..." has NO knowledge gap markers:
    // No "how do i", "how to", "not sure", "don't know", "help me", "explain", "never done", "first time"
    expect(implementEnriched.hasKnowledgeGap).toBe(false)

    // Implementation task has no high-stakes keywords
    // ("production", "deploy", "security", "authentication", etc. are absent)
    expect(implementEnriched.isHighStakes).toBe(false)

    // No knowledge gap -> NOT Level 3, no procedure -> NOT Level 1,
    // not a tool call or template -> Level 2 (standard reasoning)
    expect(implementClassification.level).toBe(2)
    expect(implementClassification.reason).toBe("Standard reasoning task")

    // "Deploy the profile service to production" IS high-stakes
    // (contains "deploy" and "production")
    expect(deployEnriched.isHighStakes).toBe(true)

    // "Deploy to production" also contains "deploy to production" which
    // matches "deploy to production" in isIrreversibleAction's keyword list
    // So isIrreversible = true, and isHighStakes + isIrreversible -> Level 3
    console.log(`[trace4] Deploy isIrreversible: ${deployEnriched.isIrreversible}`)
    if (deployEnriched.isIrreversible) {
      // high-stakes + irreversible -> Level 3
      expect(deployClassification.level).toBe(3)
    } else {
      // high-stakes but not irreversible and no hasKnowledgeGap -> Level 2
      // (Level 3 requires knowledge gap OR irreversible+highStakes OR lowKnowledge+highStakes)
      expect(deployClassification.level).toBe(2)
    }

    // ---- HARD ASSERTIONS on engine (deterministic from assessKnowledgeSufficiency) ----

    // 5 facts with avg confidence = (0.88+0.85+0.82+0.90+0.80)/5 = 0.85 > 0.7
    // AND facts.length >= 5
    // -> knowledge_sufficiency = HEALTHY
    expect(stateWithFacts.knowledge_sufficiency).toBe("HEALTHY")

    // 0 facts + 0 procedures -> knowledge_sufficiency = LOW
    expect(stateNoFacts.knowledge_sufficiency).toBe("LOW")

    // productive_engagement: HEALTHY when hasAssignedTask = true
    expect(stateWithFacts.productive_engagement).toBe("HEALTHY")
    expect(stateNoFacts.productive_engagement).toBe("HEALTHY")

    // certainty_alignment: HEALTHY (no high-stakes keywords in implementation message)
    expect(stateWithFacts.certainty_alignment).toBe("HEALTHY")

    // Guidance: null when knowledge is sufficient and all dimensions HEALTHY
    console.log(
      "[trace4] Guidance with sufficient facts:",
      guidanceWithFacts ? JSON.stringify(guidanceWithFacts) : "null (all HEALTHY)",
    )

    // Guidance with no facts: should flag knowledge_sufficiency as LOW
    expect(guidanceNoFacts).not.toBeNull()
    expect(guidanceNoFacts?.dimensions).toContain("knowledge_sufficiency")
  })
})
