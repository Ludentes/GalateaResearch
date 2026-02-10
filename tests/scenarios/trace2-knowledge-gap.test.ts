// @vitest-environment node

/**
 * Trace 2: Knowledge Gap Scenario Test
 *
 * Stage G reference scenario — full pipeline integration test with Ollama.
 *
 * What we're testing:
 * When a user asks about something the system has no knowledge about (JWT auth
 * in Expo), does knowledge_sufficiency go LOW? Does guidance recommend asking
 * clarifying questions? What activity level gets assigned? How does the full
 * memory and homeostasis state look?
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
  },
) {
  console.log(`\n[trace2] === ${label} ===`)

  if (data.homeostasis) {
    console.log("[trace2] Homeostasis dimensions:", JSON.stringify(data.homeostasis.dimensions, null, 2))
    console.log("[trace2] Assessment methods:", JSON.stringify(data.homeostasis.assessmentMethod, null, 2))
    console.log("[trace2] Assessed at:", data.homeostasis.assessedAt)
  } else {
    console.log("[trace2] Homeostasis: null (not yet stored or not assessed)")
  }

  if (data.facts !== undefined) {
    console.log(`[trace2] Memory retrieval: ${data.facts.length} facts found`)
    if (data.facts.length > 0) {
      for (const f of data.facts.slice(0, 10)) {
        console.log(`[trace2]   - [${f.uuid.slice(0, 8)}] ${f.fact}`)
      }
      if (data.facts.length > 10) {
        console.log(`[trace2]   ... and ${data.facts.length - 10} more`)
      }
    }
  }

  if (data.activityLevel !== undefined) {
    console.log(`[trace2] Activity level: ${data.activityLevel}`)
  }

  if (data.classification) {
    console.log(`[trace2] Classification: Level ${data.classification.level} — ${data.classification.reason}`)
    console.log(`[trace2]   model: ${data.classification.model}, skipMemory: ${data.classification.skipMemory}, skipHomeostasis: ${data.classification.skipHomeostasis}`)
  }

  if (data.guidance !== undefined) {
    if (data.guidance) {
      console.log(`[trace2] Guidance: ${JSON.stringify(data.guidance, null, 2)}`)
    } else {
      console.log("[trace2] Guidance: null (all dimensions HEALTHY)")
    }
  }

  if (data.responseSnippet !== undefined) {
    const snippet = data.responseSnippet.slice(0, 200)
    console.log(`[trace2] Response snippet: "${snippet}${data.responseSnippet.length > 200 ? "..." : ""}"`)
  }

  console.log(`[trace2] === END ${label} ===\n`)
}

describe("Trace 2: Knowledge Gap Scenario", () => {
  const client = postgres(TEST_DB_URL)
  const testDb = drizzle(client)
  const sessionIds: string[] = []

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
  // Test 1: Full pipeline — unfamiliar topic (no Graphiti knowledge)
  // ---------------------------------------------------------------------------
  it("documents full system state when user asks about unfamiliar topic", async () => {
    // Create a fresh session
    const session = await createSessionLogic("Trace2: Knowledge Gap Test")
    sessionIds.push(session.id)

    // --- Step 1: Search Graphiti directly for the topic to document baseline ---
    const factsAboutJwtExpo = await searchFacts(
      "JWT authentication in Expo React Native",
      [],
      20,
    )
    console.log(
      `[trace2] Pre-check: Graphiti has ${factsAboutJwtExpo.length} facts about JWT/Expo`,
    )

    // --- Step 2: Send message through full pipeline ---
    const result = await sendMessageLogic(
      session.id,
      "How do I implement JWT authentication with refresh tokens in an Expo React Native app? I've never done mobile auth before.",
      ollama(MODEL_ID),
      MODEL_ID,
    )

    expect(result.text).toBeDefined()
    expect(result.text.length).toBeGreaterThan(0)

    // --- Step 3: Wait for fire-and-forget homeostasis storage ---
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // --- Step 4: Query the stored homeostasis state ---
    const homeostasisState = await getHomeostasisStateLogic(session.id)

    // --- Step 5: Query messages to get activity level ---
    const msgs = await getSessionMessagesLogic(session.id)
    const assistantMsg = msgs.find((m) => m.role === "assistant")
    const activityLevel = assistantMsg?.activityLevel ?? null

    // --- Step 6: Run engine directly to get guidance ---
    // Reproduce the agent context with empty facts (what the pipeline would have seen)
    const engine = createHomeostasisEngine()
    const agentContextForGuidance: AgentContext = {
      sessionId: session.id,
      currentMessage:
        "How do I implement JWT authentication with refresh tokens in an Expo React Native app? I've never done mobile auth before.",
      messageHistory: msgs.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      retrievedFacts: factsAboutJwtExpo.map((f) => ({
        content: f.fact,
        confidence: 0.8,
      })),
      hasAssignedTask: true,
      lastMessageTime: msgs[0]?.createdAt,
    }
    const directState = await engine.assessAll(agentContextForGuidance)
    const guidance = engine.getGuidance(directState)

    // --- Step 7: Log full state ---
    logTraceState("UNFAMILIAR TOPIC (JWT in Expo)", {
      homeostasis: homeostasisState,
      facts: factsAboutJwtExpo,
      activityLevel,
      guidance,
      responseSnippet: result.text,
    })

    // ---- HARD ASSERTIONS (deterministic from engine code) ----

    // knowledge_sufficiency: If Graphiti returned 0 facts about JWT/Expo,
    // the pipeline would have 0 scored facts -> knowledge_sufficiency = LOW.
    // If Graphiti happens to have some loosely related facts, it may be LOW
    // due to insufficient count/confidence. Either way, with no domain-specific
    // facts stored, this should be LOW.
    expect(homeostasisState).not.toBeNull()
    if (homeostasisState) {
      // knowledge_sufficiency is computed from retrievedFacts in agentContext.
      // The pipeline searches Graphiti with the user message. If 0 relevant facts
      // come back, it's deterministically LOW.
      // However, Graphiti may have some tangentially related facts from other sessions.
      // We log the actual value and assert based on what Graphiti returned.
      if (factsAboutJwtExpo.length === 0) {
        expect(homeostasisState.dimensions.knowledge_sufficiency).toBe("LOW")
      } else {
        // If Graphiti returned some facts, knowledge_sufficiency depends on count + confidence.
        // We just document — the test is observational for this branch.
        console.log(
          `[trace2] NOTE: Graphiti returned ${factsAboutJwtExpo.length} facts, so knowledge_sufficiency may not be LOW.`,
        )
        console.log(
          `[trace2] Actual knowledge_sufficiency: ${homeostasisState.dimensions.knowledge_sufficiency}`,
        )
      }

      // productive_engagement: HEALTHY because hasAssignedTask = history.length > 0
      // (user message was stored before LLM call, so history has >= 1 message)
      expect(homeostasisState.dimensions.productive_engagement).toBe("HEALTHY")

      // certainty_alignment: HEALTHY for this message (no high-stakes keywords like
      // "deploy", "production", "delete" — and no uncertainty about high-stakes)
      expect(homeostasisState.dimensions.certainty_alignment).toBe("HEALTHY")

      // All assessments should be "computed" (no LLM assessments implemented yet)
      for (const [, method] of Object.entries(homeostasisState.assessmentMethod)) {
        expect(method).toBe("computed")
      }
    }

    // ---- SOFT ASSERTIONS (depend on LLM classification and timing) ----

    // The message contains "How do I" and "never done" — both knowledge gap markers.
    // The ActivityRouter should classify this as Level 3 (hasKnowledgeGap -> reflexion).
    // But the pipeline stores activityLevel from classification, which runs before reflexion.
    expect.soft(activityLevel).toBeGreaterThanOrEqual(2)
    expect.soft(activityLevel).toBeLessThanOrEqual(3)

    // The guidance should mention knowledge gap since knowledge_sufficiency is LOW
    if (factsAboutJwtExpo.length === 0) {
      expect.soft(guidance).not.toBeNull()
      expect.soft(guidance?.dimensions).toContain("knowledge_sufficiency")
    }
  }, 120_000)

  // ---------------------------------------------------------------------------
  // Test 2: Contrast — topic where Graphiti may have facts
  // ---------------------------------------------------------------------------
  it("contrast: documents state when asking about topic with known facts", async () => {
    const session = await createSessionLogic("Trace2: Known Topic Contrast")
    sessionIds.push(session.id)

    // --- Step 1: Check what Graphiti knows about NestJS/architecture ---
    const factsAboutArch = await searchFacts(
      "NestJS architecture patterns modules",
      [],
      20,
    )
    console.log(
      `[trace2] Pre-check: Graphiti has ${factsAboutArch.length} facts about NestJS/architecture`,
    )

    // --- Step 2: Send message through full pipeline ---
    const result = await sendMessageLogic(
      session.id,
      "Can you review the current architecture and suggest improvements for the module structure?",
      ollama(MODEL_ID),
      MODEL_ID,
    )

    expect(result.text).toBeDefined()
    expect(result.text.length).toBeGreaterThan(0)

    // --- Step 3: Wait for fire-and-forget homeostasis storage ---
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // --- Step 4: Query the stored homeostasis state ---
    const homeostasisState = await getHomeostasisStateLogic(session.id)

    // --- Step 5: Query messages to get activity level ---
    const msgs = await getSessionMessagesLogic(session.id)
    const assistantMsg = msgs.find((m) => m.role === "assistant")
    const activityLevel = assistantMsg?.activityLevel ?? null

    // --- Step 6: Get guidance for the stored state ---
    const engine = createHomeostasisEngine()
    let guidance: ReturnType<HomeostasisEngine["getGuidance"]> = null
    if (homeostasisState) {
      // Reconstruct HomeostasisState from stored dimensions for getGuidance()
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

    // --- Step 7: Log full state ---
    logTraceState("KNOWN TOPIC CONTRAST (Architecture/NestJS)", {
      homeostasis: homeostasisState,
      facts: factsAboutArch,
      activityLevel,
      guidance,
      responseSnippet: result.text,
    })

    // ---- SOFT ASSERTIONS (everything depends on Graphiti having data) ----

    expect(homeostasisState).not.toBeNull()
    if (homeostasisState) {
      // Document the actual state — this is an observational test
      console.log(
        `[trace2] CONTRAST knowledge_sufficiency: ${homeostasisState.dimensions.knowledge_sufficiency}`,
      )
      console.log(
        `[trace2] CONTRAST productive_engagement: ${homeostasisState.dimensions.productive_engagement}`,
      )

      // If Graphiti has facts about the topic, knowledge_sufficiency may differ
      // from Test 1. We document the difference.
      if (factsAboutArch.length >= 5) {
        expect.soft(homeostasisState.dimensions.knowledge_sufficiency).not.toBe("LOW")
      }

      // productive_engagement should still be HEALTHY (has assigned task)
      // This IS deterministic — hard assert
      expect(homeostasisState.dimensions.productive_engagement).toBe("HEALTHY")
    }

    // Activity level: "review" + "suggest" are standard reasoning tasks, no knowledge gap keywords.
    // Should be Level 2 (standard reasoning).
    expect.soft(activityLevel).toBe(2)
  }, 120_000)

  // ---------------------------------------------------------------------------
  // Test 3: Direct ActivityRouter and Engine classification
  // ---------------------------------------------------------------------------
  it("documents activity classification for knowledge gap message", async () => {
    const router = createActivityRouter()
    const engine = createHomeostasisEngine()

    // ---- Test 3a: Knowledge gap message ----
    const gapTask: Task = {
      message:
        "How do I implement JWT authentication with refresh tokens in an Expo React Native app?",
      sessionId: "test-trace2-classification",
    }

    const gapEnriched = enrichTaskWithFlags(gapTask)
    const gapClassification = await router.classify(gapTask, null, null)

    // ---- Test 3b: Non-gap message for contrast ----
    const noGapTask: Task = {
      message: "Refactor the user service to use dependency injection pattern.",
      sessionId: "test-trace2-classification",
    }

    const noGapEnriched = enrichTaskWithFlags(noGapTask)
    const noGapClassification = await router.classify(noGapTask, null, null)

    // ---- Test 3c: Engine assessment with empty vs populated facts ----
    const contextNoFacts: AgentContext = {
      sessionId: "test-trace2-engine",
      currentMessage: gapTask.message,
      messageHistory: [{ role: "user", content: gapTask.message }],
      retrievedFacts: [],
      retrievedProcedures: [],
      hasAssignedTask: true,
    }

    const stateNoFacts = await engine.assessAll(contextNoFacts)
    const guidanceNoFacts = engine.getGuidance(stateNoFacts)

    const contextWithFacts: AgentContext = {
      sessionId: "test-trace2-engine",
      currentMessage: noGapTask.message,
      messageHistory: [{ role: "user", content: noGapTask.message }],
      retrievedFacts: [
        { content: "Uses NestJS with modular architecture", confidence: 0.9 },
        { content: "Dependency injection via constructor", confidence: 0.85 },
        { content: "Services should be singleton by default", confidence: 0.88 },
        { content: "Use interfaces for all service contracts", confidence: 0.82 },
        { content: "Repository pattern for data access layer", confidence: 0.91 },
      ],
      retrievedProcedures: [],
      hasAssignedTask: true,
    }

    const stateWithFacts = await engine.assessAll(contextWithFacts)
    const guidanceWithFacts = engine.getGuidance(stateWithFacts)

    // ---- Log full classification state ----
    logTraceState("CLASSIFICATION: Knowledge Gap Message", {
      classification: gapClassification,
    })
    console.log("[trace2] Gap task flags:", JSON.stringify({
      hasKnowledgeGap: gapEnriched.hasKnowledgeGap,
      isHighStakes: gapEnriched.isHighStakes,
      isIrreversible: gapEnriched.isIrreversible,
      isToolCall: gapEnriched.isToolCall,
      isTemplate: gapEnriched.isTemplate,
    }, null, 2))

    logTraceState("CLASSIFICATION: Non-Gap Message", {
      classification: noGapClassification,
    })
    console.log("[trace2] Non-gap task flags:", JSON.stringify({
      hasKnowledgeGap: noGapEnriched.hasKnowledgeGap,
      isHighStakes: noGapEnriched.isHighStakes,
      isIrreversible: noGapEnriched.isIrreversible,
      isToolCall: noGapEnriched.isToolCall,
      isTemplate: noGapEnriched.isTemplate,
    }, null, 2))

    logTraceState("ENGINE: No Facts (knowledge gap)", {
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

    logTraceState("ENGINE: With Facts (sufficient knowledge)", {
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

    // ---- HARD ASSERTIONS (deterministic from classification-helpers code) ----

    // "How do I" triggers hasKnowledgeGap in enrichTaskWithFlags
    expect(gapEnriched.hasKnowledgeGap).toBe(true)

    // "Refactor the user service..." has NO knowledge gap markers
    expect(noGapEnriched.hasKnowledgeGap).toBe(false)

    // hasKnowledgeGap -> Level 3 (reflexion needed)
    expect(gapClassification.level).toBe(3)
    expect(gapClassification.reason).toContain("Knowledge gap")

    // No knowledge gap, no procedure match, not a tool call -> Level 2 (standard reasoning)
    expect(noGapClassification.level).toBe(2)

    // ---- HARD ASSERTIONS on engine (deterministic from assessKnowledgeSufficiency) ----

    // 0 facts + 0 procedures -> knowledge_sufficiency = LOW
    expect(stateNoFacts.knowledge_sufficiency).toBe("LOW")

    // 5 facts with avg confidence > 0.7 -> knowledge_sufficiency = HEALTHY
    expect(stateWithFacts.knowledge_sufficiency).toBe("HEALTHY")

    // productive_engagement: HEALTHY when hasAssignedTask = true
    expect(stateNoFacts.productive_engagement).toBe("HEALTHY")
    expect(stateWithFacts.productive_engagement).toBe("HEALTHY")

    // Guidance: should have guidance for LOW knowledge_sufficiency state
    expect(guidanceNoFacts).not.toBeNull()
    expect(guidanceNoFacts?.dimensions).toContain("knowledge_sufficiency")
    expect(guidanceNoFacts?.primary).toContain("Knowledge gap")

    // Guidance with sufficient facts: depends on other dimensions
    // knowledge_application is HEALTHY (no time data), progress_momentum is HEALTHY (no task start),
    // communication_health depends on timing. Document what we get.
    console.log(
      "[trace2] Guidance with sufficient facts:",
      guidanceWithFacts ? JSON.stringify(guidanceWithFacts) : "null (all HEALTHY)",
    )
  })
})
