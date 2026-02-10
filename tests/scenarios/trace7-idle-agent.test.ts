// @vitest-environment node

/**
 * Trace 7: Idle Agent (Productive Engagement LOW) Scenario Test
 *
 * Stage G reference scenario — engine-level test with crafted AgentContext inputs.
 *
 * What we're testing:
 * The homeostasis engine detects idle state and guidance system returns appropriate
 * advice. Also tests dimension tension between productive_engagement: LOW and
 * communication_health: HIGH (can't spam the user to ask for work).
 *
 * Why engine-level (not pipeline):
 * buildAgentContext() always sets hasAssignedTask = true when messages exist.
 * The pipeline can't trigger idle state during a conversation — it requires an
 * out-of-band check (e.g., cron/polling). This is a known gap documented here.
 *
 * Key questions:
 * - Does productive_engagement = LOW when hasAssignedTask = false?
 * - What's the tension between productive_engagement LOW + communication_health HIGH?
 * - Which dimension does guidance prioritize when multiple are imbalanced?
 * - How does the tension resolve when enough time passes?
 * - What activity level does an idle agent's message get?
 *
 * Approach: Observational/documentary. Hard expects for deterministic behavior,
 * structured console logs to document the full system state.
 */

import { describe, expect, it } from "vitest"
import { createHomeostasisEngine } from "../../server/engine/homeostasis-engine"
import { createActivityRouter } from "../../server/engine/activity-router"
import { enrichTaskWithFlags } from "../../server/engine/classification-helpers"
import type {
  AgentContext,
  Dimension,
  DimensionState,
  HomeostasisState,
  Task,
} from "../../server/engine/types"

// ============================================================================
// Helper: Create idle agent context
// ============================================================================

/**
 * Create an AgentContext representing an idle agent that just finished a task
 * and is waiting for the next assignment.
 *
 * Key properties:
 * - hasAssignedTask = false (the core trigger for productive_engagement LOW)
 * - lastMessageTime = 1 min ago (recent enough to trigger communication_health HIGH)
 * - retrievedFacts = [] (no knowledge, triggers knowledge_sufficiency LOW)
 * - retrievedProcedures = [] (no procedures)
 * - currentTaskStartTime = 1 hour ago (combined with low actions, triggers progress_momentum LOW)
 * - recentActionCount = 2 (below threshold of 3)
 */
function createIdleAgentContext(
  overrides?: Partial<AgentContext>,
): AgentContext {
  return {
    sessionId: "trace7-test",
    currentMessage:
      "I've finished the profile screen. What should I work on next?",
    messageHistory: [
      { role: "user" as const, content: "Implement user profile screen" },
      {
        role: "assistant" as const,
        content: "Done. Profile screen implemented with NativeWind.",
      },
    ],
    hasAssignedTask: false, // KEY: no new task assigned
    lastMessageTime: new Date(Date.now() - 1 * 60 * 1000), // 1 min ago
    recentActionCount: 2,
    currentTaskStartTime: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    retrievedFacts: [],
    retrievedProcedures: [],
    ...overrides,
  }
}

// ============================================================================
// Logging helpers
// ============================================================================

/**
 * Log a structured trace of the homeostasis state for documentation purposes.
 */
function logHomeostasisState(
  label: string,
  state: HomeostasisState,
  guidance: ReturnType<ReturnType<typeof createHomeostasisEngine>["getGuidance"]>,
) {
  const dimensions: Record<string, DimensionState> = {
    knowledge_sufficiency: state.knowledge_sufficiency,
    certainty_alignment: state.certainty_alignment,
    progress_momentum: state.progress_momentum,
    communication_health: state.communication_health,
    productive_engagement: state.productive_engagement,
    knowledge_application: state.knowledge_application,
  }

  console.log(`\n[trace7] === ${label} ===`)
  console.log("[trace7] Dimensions:", JSON.stringify(dimensions, null, 2))
  console.log(
    "[trace7] Assessment methods:",
    JSON.stringify(state.assessment_method, null, 2),
  )

  // Count imbalances
  const imbalanced = Object.entries(dimensions).filter(
    ([, v]) => v !== "HEALTHY",
  )
  const lowDims = imbalanced.filter(([, v]) => v === "LOW")
  const highDims = imbalanced.filter(([, v]) => v === "HIGH")

  console.log(
    `[trace7] Summary: ${imbalanced.length} imbalanced (${lowDims.length} LOW, ${highDims.length} HIGH), ${6 - imbalanced.length} HEALTHY`,
  )

  if (lowDims.length > 0) {
    console.log(
      `[trace7] LOW dimensions: ${lowDims.map(([k]) => k).join(", ")}`,
    )
  }
  if (highDims.length > 0) {
    console.log(
      `[trace7] HIGH dimensions: ${highDims.map(([k]) => k).join(", ")}`,
    )
  }

  if (guidance) {
    console.log("[trace7] Guidance primary:", guidance.primary.trim())
    if (guidance.secondary) {
      console.log("[trace7] Guidance secondary:", guidance.secondary.trim())
    }
    console.log(
      "[trace7] Guidance targets dimensions:",
      guidance.dimensions.join(", "),
    )
  } else {
    console.log("[trace7] Guidance: null (all dimensions HEALTHY)")
  }

  console.log(`[trace7] === END ${label} ===\n`)
}

describe("Trace 7: Idle Agent (Productive Engagement LOW)", () => {
  const engine = createHomeostasisEngine()

  // ---------------------------------------------------------------------------
  // Test 1: Detects idle state
  // ---------------------------------------------------------------------------
  it("detects idle state: productive_engagement LOW", async () => {
    const context = createIdleAgentContext()
    const state = await engine.assessAll(context)
    const guidance = engine.getGuidance(state)

    logHomeostasisState("IDLE STATE DETECTION", state, guidance)

    // ---- HARD ASSERTIONS (deterministic from engine code) ----

    // productive_engagement: LOW because hasAssignedTask = false
    // Source: _assessProductiveEngagementComputed checks hasTask, returns LOW if !hasTask
    expect(state.productive_engagement).toBe("LOW")

    // communication_health: HIGH because lastMessage was 1 min ago (< 2 min threshold)
    // Source: _assessCommunicationHealthComputed, timeSinceLastMin < 2 => HIGH
    expect(state.communication_health).toBe("HIGH")

    // knowledge_sufficiency: LOW because 0 facts and 0 procedures
    // Source: assessKnowledgeSufficiency, facts.length === 0 && procedures.length === 0 => LOW
    expect(state.knowledge_sufficiency).toBe("LOW")

    // Document guidance — which dimension does it prioritize?
    // From guidance.yaml priorities:
    //   knowledge_sufficiency LOW: priority 1 (highest)
    //   productive_engagement LOW: priority 2
    //   progress_momentum LOW: priority 2
    //   communication_health HIGH: priority 6 (lowest)
    //
    // The guidance system returns the lowest-numbered priority first.
    // With knowledge_sufficiency at priority 1, it should be the primary guidance.
    expect(guidance).not.toBeNull()
    console.log(
      `[trace7] Guidance prioritized dimension: ${guidance!.dimensions[0]}`,
    )
    console.log(
      `[trace7] Total imbalanced dimensions in guidance: ${guidance!.dimensions.length}`,
    )

    // The guidance system reports ALL imbalanced dimensions, sorted by priority.
    // With knowledge_sufficiency LOW (pri 1), productive_engagement LOW (pri 2),
    // progress_momentum LOW (pri 2), and communication_health HIGH (pri 6),
    // the first dimension should be knowledge_sufficiency.
    expect(guidance!.dimensions[0]).toBe("knowledge_sufficiency")

    // All assessment methods should be "computed" (no LLM assessments implemented)
    for (const [dim, method] of Object.entries(state.assessment_method)) {
      console.log(`[trace7] ${dim}: method=${method}`)
      expect(method).toBe("computed")
    }
  })

  // ---------------------------------------------------------------------------
  // Test 2: Dimension tension — can't spam but needs work
  // ---------------------------------------------------------------------------
  it("dimension tension: can't spam but needs work", async () => {
    // Same context as test 1: lastMessage 1 min ago, no assigned task
    const context = createIdleAgentContext()
    const state = await engine.assessAll(context)
    const guidance = engine.getGuidance(state)

    console.log("\n[trace7] === DIMENSION TENSION: productive_engagement LOW vs communication_health HIGH ===")

    // ---- HARD ASSERTIONS: Both dimensions confirmed imbalanced ----

    // productive_engagement LOW: agent has no task, should ask for one
    expect(state.productive_engagement).toBe("LOW")

    // communication_health HIGH: agent just messaged 1 min ago, shouldn't spam
    expect(state.communication_health).toBe("HIGH")

    // Document the tension:
    // The idle agent NEEDS to ask for a new task (productive_engagement LOW),
    // but has ALREADY communicated very recently (communication_health HIGH).
    // This creates a "can't spam but needs work" tension.
    //
    // The guidance system resolves this by priority:
    // - knowledge_sufficiency LOW (priority 1) — addressed first
    // - productive_engagement LOW (priority 2) — second
    // - communication_health HIGH (priority 6) — barely relevant
    //
    // The guidance's primary text comes from the highest-priority imbalance.
    // So knowledge_sufficiency LOW wins over productive_engagement LOW.
    // The communication_health HIGH guidance ("batching updates") never surfaces
    // as primary because priority 6 is the lowest.

    console.log("[trace7] Tension analysis:")
    console.log("[trace7]   productive_engagement LOW -> should ask for new task")
    console.log("[trace7]   communication_health HIGH -> just messaged, don't spam")
    console.log("[trace7]   These dimensions pull in opposite directions.")

    expect(guidance).not.toBeNull()

    // Log which dimension guidance prioritizes
    console.log(`[trace7] Guidance resolves tension by prioritizing: ${guidance!.dimensions[0]}`)
    console.log(`[trace7] All dimensions in guidance (priority order): ${guidance!.dimensions.join(" > ")}`)

    // Document: guidance reports knowledge_sufficiency first (priority 1),
    // then productive_engagement (priority 2), then progress_momentum (priority 2),
    // then communication_health HIGH (priority 6).
    // The productive_engagement LOW is NOT the primary because knowledge_sufficiency
    // has a higher priority (lower number).
    //
    // NOTE: If the agent had some facts (knowledge_sufficiency = HEALTHY), then
    // productive_engagement LOW (priority 2) WOULD be the primary guidance.
    // This is a design insight: the idle state alone is not the top concern
    // when there's also a knowledge gap.

    console.log("[trace7] KEY INSIGHT: knowledge_sufficiency LOW (pri 1) outranks productive_engagement LOW (pri 2)")
    console.log("[trace7] The idle state is secondary to the knowledge gap in guidance priority.")
    console.log("[trace7] communication_health HIGH (pri 6) is present but lowest priority.")

    // Verify guidance lists include both tension dimensions
    expect(guidance!.dimensions).toContain("productive_engagement")
    expect(guidance!.dimensions).toContain("communication_health")

    console.log("[trace7] === END DIMENSION TENSION ===\n")
  })

  // ---------------------------------------------------------------------------
  // Test 3: Tension resolves when enough time passes
  // ---------------------------------------------------------------------------
  it("tension resolves: enough time passes to communicate again", async () => {
    // Override lastMessageTime to 5 min ago -> communication_health becomes HEALTHY
    const context = createIdleAgentContext({
      lastMessageTime: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago
    })

    const state = await engine.assessAll(context)
    const guidance = engine.getGuidance(state)

    logHomeostasisState("TENSION RESOLVED: 5 minutes later", state, guidance)

    // ---- HARD ASSERTIONS ----

    // productive_engagement still LOW (no task assigned)
    expect(state.productive_engagement).toBe("LOW")

    // communication_health NOW HEALTHY (5 min > 2 min threshold, < 10 min)
    // This resolves the tension: the agent can now communicate without spamming.
    expect(state.communication_health).toBe("HEALTHY")

    // knowledge_sufficiency still LOW (no facts)
    expect(state.knowledge_sufficiency).toBe("LOW")

    // Document how guidance changes:
    // Before (Test 2): 4 imbalanced dimensions (knowledge_sufficiency LOW,
    //   productive_engagement LOW, progress_momentum LOW, communication_health HIGH)
    // After (this test): 3 imbalanced (communication_health resolved to HEALTHY)
    //
    // The guidance system should still prioritize knowledge_sufficiency LOW (priority 1).
    // But the dimension list should now EXCLUDE communication_health.

    expect(guidance).not.toBeNull()

    console.log("[trace7] Tension resolution analysis:")
    console.log("[trace7]   communication_health changed: HIGH -> HEALTHY")
    console.log("[trace7]   The agent can now reach out without over-communicating.")
    console.log(`[trace7]   Remaining imbalanced dimensions: ${guidance!.dimensions.join(", ")}`)
    console.log(`[trace7]   Primary guidance target: ${guidance!.dimensions[0]}`)

    // communication_health should NOT appear in guidance anymore (it's HEALTHY now)
    expect(guidance!.dimensions).not.toContain("communication_health")

    // productive_engagement should still be in the guidance
    expect(guidance!.dimensions).toContain("productive_engagement")

    // knowledge_sufficiency still leads (priority 1)
    expect(guidance!.dimensions[0]).toBe("knowledge_sufficiency")
  })

  // ---------------------------------------------------------------------------
  // Test 4: Idle agent message classifies as Level 2
  // ---------------------------------------------------------------------------
  it("idle agent message classifies as Level 2", async () => {
    const router = createActivityRouter()
    const idleMessage =
      "I've finished the profile screen. What should I work on next?"

    const task: Task = {
      message: idleMessage,
      sessionId: "trace7-classification",
    }

    // Enrich to document all flags
    const enriched = enrichTaskWithFlags(task)
    const classification = await router.classify(task, null, null)

    console.log("\n[trace7] === IDLE MESSAGE CLASSIFICATION ===")
    console.log(`[trace7] Message: "${idleMessage}"`)
    console.log(
      "[trace7] Flags:",
      JSON.stringify(
        {
          hasKnowledgeGap: enriched.hasKnowledgeGap,
          isHighStakes: enriched.isHighStakes,
          isIrreversible: enriched.isIrreversible,
          isToolCall: enriched.isToolCall,
          isTemplate: enriched.isTemplate,
        },
        null,
        2,
      ),
    )
    console.log(
      `[trace7] Classification: Level ${classification.level} -- ${classification.reason}`,
    )
    console.log(
      `[trace7]   model: ${classification.model}, skipMemory: ${classification.skipMemory}, skipHomeostasis: ${classification.skipHomeostasis}`,
    )

    // ---- HARD ASSERTIONS ----

    // Level 2 (default reasoning): no knowledge gap markers, no high-stakes keywords,
    // no tool call, no template match, no procedure match.
    //
    // "I've finished the profile screen. What should I work on next?" does NOT contain:
    // - Knowledge gap: "how do i", "how to", "not sure", "don't know", "unclear",
    //   "help me", "what is", "explain", "never done", "first time"
    //   NOTE: "What should" does not match "what is".
    // - High-stakes: "production", "deploy", "release", "publish", "security", etc.
    // - Irreversible: "force push", "drop table", "rm -rf", etc.
    // - Tool call: not flagged
    // - Template: not a simple "done"/"ok"/"yes" etc.
    expect(classification.level).toBe(2)
    expect(classification.reason).toBe("Standard reasoning task")
    expect(classification.model).toBe("sonnet")

    // Flags should all be false
    expect(enriched.hasKnowledgeGap).toBe(false)
    expect(enriched.isHighStakes).toBe(false)
    expect(enriched.isIrreversible).toBe(false)
    expect(enriched.isToolCall).toBe(false)
    expect(enriched.isTemplate).toBe(false)

    // Document: an idle agent's "what should I work on?" message is treated as a
    // standard Level 2 reasoning task. The activity router doesn't know about the
    // agent's homeostasis state — it only looks at the message content and task flags.
    // The idle state (productive_engagement LOW) is visible to the homeostasis engine
    // but NOT to the activity router's classification logic.
    console.log("[trace7] INSIGHT: Activity router classifies based on message content only.")
    console.log("[trace7] It does NOT consider homeostasis state (productive_engagement LOW).")
    console.log("[trace7] The idle context is invisible to classification — it's a homeostasis concern.")
    console.log("[trace7] === END IDLE MESSAGE CLASSIFICATION ===\n")
  })

  // ---------------------------------------------------------------------------
  // Test 5: Documents all dimension states for idle agent context
  // ---------------------------------------------------------------------------
  it("documents all dimension states for idle agent context", async () => {
    const context = createIdleAgentContext()

    // Assess each dimension individually to capture reason fields
    const allDimensions: Dimension[] = [
      "knowledge_sufficiency",
      "certainty_alignment",
      "progress_momentum",
      "communication_health",
      "productive_engagement",
      "knowledge_application",
    ]

    console.log("\n[trace7] === FULL DIMENSION ASSESSMENT (individual) ===")

    for (const dim of allDimensions) {
      const assessment = await engine.assessDimension(dim, context)
      console.log(
        `[trace7] ${dim}: state=${assessment.state}, method=${assessment.method}, confidence=${assessment.confidence}`,
      )
      console.log(`[trace7]   reason: "${assessment.reason}"`)
    }

    // Now run the full assessment and compare
    const fullState = await engine.assessAll(context)
    const guidance = engine.getGuidance(fullState)

    logHomeostasisState("FULL IDLE AGENT ASSESSMENT", fullState, guidance)

    // ---- Document the complete picture ----

    console.log("[trace7] === IDLE AGENT: COMPLETE DIMENSION ANALYSIS ===")

    // Dimension 1: knowledge_sufficiency
    // Expected: LOW (0 facts, 0 procedures)
    console.log("[trace7] 1. knowledge_sufficiency: LOW")
    console.log("[trace7]    Why: No relevant knowledge retrieved from memory (0 facts, 0 procedures)")
    console.log("[trace7]    Impact: Guidance priority 1 (critical) — knowledge gaps lead to errors")
    expect(fullState.knowledge_sufficiency).toBe("LOW")

    // Dimension 2: certainty_alignment
    // Expected: HEALTHY (no uncertainty markers + no high-stakes keywords in idle message)
    console.log("[trace7] 2. certainty_alignment: HEALTHY")
    console.log("[trace7]    Why: Message has no uncertainty+high-stakes combination")
    console.log("[trace7]    Impact: No guidance triggered for this dimension")
    expect(fullState.certainty_alignment).toBe("HEALTHY")

    // Dimension 3: progress_momentum
    // Expected: LOW (>30 min on task, <3 actions)
    // currentTaskStartTime = 1 hour ago, recentActionCount = 2
    console.log("[trace7] 3. progress_momentum: LOW")
    console.log("[trace7]    Why: 60min on task with only 2 actions (threshold: >30min, <3 actions)")
    console.log("[trace7]    Impact: Guidance priority 2 — being stuck wastes time")
    expect(fullState.progress_momentum).toBe("LOW")

    // Dimension 4: communication_health
    // Expected: HIGH (lastMessage 1 min ago < 2 min threshold)
    console.log("[trace7] 4. communication_health: HIGH")
    console.log("[trace7]    Why: Last message 1 min ago (< 2 min threshold for HIGH)")
    console.log("[trace7]    Impact: Guidance priority 6 (lowest) — over-communication rarely harmful")
    expect(fullState.communication_health).toBe("HIGH")

    // Dimension 5: productive_engagement
    // Expected: LOW (hasAssignedTask = false)
    console.log("[trace7] 5. productive_engagement: LOW")
    console.log("[trace7]    Why: hasAssignedTask = false — no assigned task, agent is idle")
    console.log("[trace7]    Impact: Guidance priority 2 — idle time should be addressed")
    expect(fullState.productive_engagement).toBe("LOW")

    // Dimension 6: knowledge_application
    // Expected: HEALTHY (no time tracking data, totalTime === 0)
    console.log("[trace7] 6. knowledge_application: HEALTHY")
    console.log("[trace7]    Why: No time tracking data available (defaults to HEALTHY)")
    console.log("[trace7]    Impact: No guidance triggered for this dimension")
    expect(fullState.knowledge_application).toBe("HEALTHY")

    console.log("[trace7]")
    console.log("[trace7] SUMMARY:")
    console.log("[trace7]   Imbalanced: knowledge_sufficiency LOW, progress_momentum LOW,")
    console.log("[trace7]               communication_health HIGH, productive_engagement LOW")
    console.log("[trace7]   Healthy:    certainty_alignment, knowledge_application")
    console.log("[trace7]   Guidance priority chain: knowledge_sufficiency (1) > productive_engagement (2)")
    console.log("[trace7]                           = progress_momentum (2) > communication_health (6)")
    console.log("[trace7]")
    console.log("[trace7] KNOWN GAP:")
    console.log("[trace7]   buildAgentContext() always sets hasAssignedTask = true when messages exist.")
    console.log("[trace7]   The pipeline cannot trigger productive_engagement LOW during a conversation.")
    console.log("[trace7]   This requires an out-of-band mechanism (cron, polling, or explicit check).")
    console.log("[trace7]   The homeostasis engine CAN detect it — but the pipeline never asks.")
    console.log("[trace7] === END FULL DIMENSION ANALYSIS ===\n")
  })
})
