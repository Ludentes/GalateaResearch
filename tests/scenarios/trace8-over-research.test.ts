// @vitest-environment node

/**
 * Trace 8: Over-Research Guardrail (Knowledge Application HIGH) Scenario Test
 *
 * Stage G reference scenario -- engine-level test with crafted AgentContext inputs.
 *
 * What we're testing:
 * The homeostasis engine detects analysis paralysis (excessive time researching
 * vs building) and the guidance system triggers the "stop researching, start building"
 * guardrail. Also tests contrasts: balanced research produces HEALTHY, and
 * insufficient research produces LOW.
 *
 * Why engine-level (not pipeline):
 * The pipeline doesn't yet track timeSpentResearching / timeSpentBuilding.
 * These values would come from the observation pipeline (Phase 4). For now
 * we test the engine directly with crafted AgentContext inputs containing
 * explicit time data. This is a known gap documented here.
 *
 * Key questions:
 * - Does knowledge_application = HIGH when research ratio > 80%?
 * - Does knowledge_application = HEALTHY when research ratio is 20-80%?
 * - Does knowledge_application = LOW when research ratio < 20%?
 * - What are the exact threshold boundaries (19%, 20%, 80%, 81%)?
 * - How do multiple imbalanced dimensions interact in guidance?
 * - What happens when over-research combines with being stuck and knowledge gaps?
 *
 * Approach: Observational/documentary. Hard expects for deterministic behavior,
 * structured console logs to document the full system state.
 */

import { describe, expect, it } from "vitest"
import { createHomeostasisEngine } from "../../server/engine/homeostasis-engine"
import type {
  AgentContext,
  Dimension,
  DimensionState,
  HomeostasisState,
} from "../../server/engine/types"

// ============================================================================
// Helper: Create research-focused agent context
// ============================================================================

/**
 * Create an AgentContext with specified research/building time allocation.
 *
 * @param researchMinutes - Minutes spent researching
 * @param buildingMinutes - Minutes spent building
 * @param actionCount - Number of recent actions taken
 * @param taskMinutes - Minutes since current task started
 */
function createResearchContext(
  researchMinutes: number,
  buildingMinutes: number,
  actionCount: number,
  taskMinutes: number,
): AgentContext {
  return {
    sessionId: "trace8-test",
    currentMessage: "Let me look into the PKCE flow for OAuth2...",
    messageHistory: Array.from({ length: actionCount }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `Research message ${i}`,
    })),
    hasAssignedTask: true,
    lastMessageTime: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago
    currentTaskStartTime: new Date(Date.now() - taskMinutes * 60 * 1000),
    recentActionCount: actionCount,
    retrievedFacts: [],
    retrievedProcedures: [],
    timeSpentResearching: researchMinutes * 60 * 1000, // Convert to ms
    timeSpentBuilding: buildingMinutes * 60 * 1000,
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
  guidance: ReturnType<
    ReturnType<typeof createHomeostasisEngine>["getGuidance"]
  >,
) {
  const dimensions: Record<string, DimensionState> = {
    knowledge_sufficiency: state.knowledge_sufficiency,
    certainty_alignment: state.certainty_alignment,
    progress_momentum: state.progress_momentum,
    communication_health: state.communication_health,
    productive_engagement: state.productive_engagement,
    knowledge_application: state.knowledge_application,
  }

  console.log(`\n[trace8] === ${label} ===`)
  console.log("[trace8] Dimensions:", JSON.stringify(dimensions, null, 2))
  console.log(
    "[trace8] Assessment methods:",
    JSON.stringify(state.assessment_method, null, 2),
  )

  // Count imbalances
  const imbalanced = Object.entries(dimensions).filter(
    ([, v]) => v !== "HEALTHY",
  )
  const lowDims = imbalanced.filter(([, v]) => v === "LOW")
  const highDims = imbalanced.filter(([, v]) => v === "HIGH")

  console.log(
    `[trace8] Summary: ${imbalanced.length} imbalanced (${lowDims.length} LOW, ${highDims.length} HIGH), ${6 - imbalanced.length} HEALTHY`,
  )

  if (lowDims.length > 0) {
    console.log(
      `[trace8] LOW dimensions: ${lowDims.map(([k]) => k).join(", ")}`,
    )
  }
  if (highDims.length > 0) {
    console.log(
      `[trace8] HIGH dimensions: ${highDims.map(([k]) => k).join(", ")}`,
    )
  }

  if (guidance) {
    console.log("[trace8] Guidance primary:", guidance.primary.trim())
    if (guidance.secondary) {
      console.log("[trace8] Guidance secondary:", guidance.secondary.trim())
    }
    console.log(
      "[trace8] Guidance targets dimensions:",
      guidance.dimensions.join(", "),
    )
  } else {
    console.log("[trace8] Guidance: null (all dimensions HEALTHY)")
  }

  console.log(`[trace8] === END ${label} ===\n`)
}

describe("Trace 8: Over-Research Guardrail (Knowledge Application)", () => {
  const engine = createHomeostasisEngine()

  // ---------------------------------------------------------------------------
  // Test 1: Detects analysis paralysis
  // ---------------------------------------------------------------------------
  it("detects analysis paralysis: 2 hours research, no building", async () => {
    // 120 min researching, 0 min building => researchRatio = 1.0 (100%)
    // 4 actions in 120 min task time
    const context = createResearchContext(120, 0, 4, 120)
    const state = await engine.assessAll(context)
    const guidance = engine.getGuidance(state)

    logHomeostasisState("ANALYSIS PARALYSIS: 120min research, 0 building", state, guidance)

    // ---- HARD ASSERTIONS (deterministic from engine code) ----

    // knowledge_application: HIGH because researchRatio = 1.0 > 0.8
    // Source: assessKnowledgeApplication, researchRatio > 0.8 => HIGH
    // Reason will be: "Analysis paralysis: 100% time spent researching"
    expect(state.knowledge_application).toBe("HIGH")

    // progress_momentum: with 120 min on task and 4 actions
    // The threshold is >30 min AND <3 actions => LOW
    // With 4 actions (>= 3), the condition fails => HEALTHY
    // Source: _assessProgressMomentumComputed, timeOnTaskMin > 30 && actionCount < 3
    expect(state.progress_momentum).toBe("HEALTHY")

    // Document the full picture
    console.log("[trace8] Analysis:")
    console.log("[trace8]   researchRatio = 120 / (120 + 0) = 1.0 (100%)")
    console.log("[trace8]   Threshold: > 0.8 => HIGH (analysis paralysis)")
    console.log("[trace8]   progress_momentum: 120min on task, 4 actions")
    console.log("[trace8]     Threshold for LOW: >30min AND <3 actions")
    console.log("[trace8]     4 actions >= 3, so NOT stuck => HEALTHY")
    console.log("[trace8]   NOTE: An agent can be over-researching without being 'stuck'")
    console.log("[trace8]   because they ARE taking actions (reading docs, querying APIs)")
    console.log("[trace8]   but those actions are all research, not building.")

    // Guidance should mention knowledge_application
    expect(guidance).not.toBeNull()
    expect(guidance!.dimensions).toContain("knowledge_application")
    console.log(`[trace8] Guidance dimensions: ${guidance!.dimensions.join(", ")}`)
    console.log(`[trace8] Primary guidance: ${guidance!.primary.trim().substring(0, 80)}...`)
  })

  // ---------------------------------------------------------------------------
  // Test 2: Contrast -- balanced research/building is HEALTHY
  // ---------------------------------------------------------------------------
  it("contrast: balanced research/building is HEALTHY", async () => {
    // 40 min researching, 60 min building => researchRatio = 0.4 (40%)
    // 15 actions in 100 min task time
    const context = createResearchContext(40, 60, 15, 100)
    const state = await engine.assessAll(context)
    const guidance = engine.getGuidance(state)

    logHomeostasisState("BALANCED: 40min research, 60min building", state, guidance)

    // ---- HARD ASSERTIONS ----

    // knowledge_application: HEALTHY because researchRatio = 0.4, which is between 0.2 and 0.8
    // Source: assessKnowledgeApplication, 0.2 <= researchRatio <= 0.8 => HEALTHY
    // Reason: "Balanced: 40% research, 60% building"
    expect(state.knowledge_application).toBe("HEALTHY")

    // Document the contrast
    console.log("[trace8] Contrast analysis:")
    console.log("[trace8]   researchRatio = 40 / (40 + 60) = 0.4 (40%)")
    console.log("[trace8]   Threshold: 0.2 <= ratio <= 0.8 => HEALTHY")
    console.log("[trace8]   This is the 'golden zone' for knowledge application")

    // progress_momentum with 100 min on task, 15 actions
    // >30min but 15 actions >= 3, so not stuck. <10min is false. => HEALTHY
    expect(state.progress_momentum).toBe("HEALTHY")

    // Guidance should NOT mention knowledge_application (it's HEALTHY)
    if (guidance) {
      console.log(`[trace8] Guidance dimensions: ${guidance.dimensions.join(", ")}`)
      // knowledge_application should not be in the guidance dimensions
      // because it is HEALTHY and the guidance system only reports imbalanced dimensions
      expect(guidance.dimensions).not.toContain("knowledge_application")
    } else {
      console.log("[trace8] No guidance triggered (may have other imbalances though)")
    }
  })

  // ---------------------------------------------------------------------------
  // Test 3: Contrast -- too little research triggers LOW
  // ---------------------------------------------------------------------------
  it("contrast: too little research triggers LOW", async () => {
    // 5 min researching, 95 min building => researchRatio = 0.05 (5%)
    // 20 actions in 100 min task time
    const context = createResearchContext(5, 95, 20, 100)
    const state = await engine.assessAll(context)
    const guidance = engine.getGuidance(state)

    logHomeostasisState("INSUFFICIENT RESEARCH: 5min research, 95min building", state, guidance)

    // ---- HARD ASSERTIONS ----

    // knowledge_application: LOW because researchRatio = 0.05 < 0.2
    // Source: assessKnowledgeApplication, researchRatio < 0.2 => LOW
    // Reason: "Insufficient research: only 5% time spent learning"
    expect(state.knowledge_application).toBe("LOW")

    // Document the contrast
    console.log("[trace8] Contrast analysis:")
    console.log("[trace8]   researchRatio = 5 / (5 + 95) = 0.05 (5%)")
    console.log("[trace8]   Threshold: < 0.2 => LOW (insufficient research)")
    console.log("[trace8]   The agent is building without enough research upfront")
    console.log("[trace8]   This risks reinventing the wheel or heading down the wrong path")

    // Guidance should mention knowledge_application
    expect(guidance).not.toBeNull()
    expect(guidance!.dimensions).toContain("knowledge_application")

    // From guidance.yaml: knowledge_application LOW has priority 5
    // knowledge_sufficiency LOW has priority 1
    // So knowledge_sufficiency LOW should still be the primary guidance
    console.log(`[trace8] Guidance dimensions: ${guidance!.dimensions.join(", ")}`)
    console.log(`[trace8] Primary guidance dimension: ${guidance!.dimensions[0]}`)
    console.log("[trace8] NOTE: knowledge_application LOW (pri 5) is lower priority than")
    console.log("[trace8]   knowledge_sufficiency LOW (pri 1), so it won't be primary guidance")
  })

  // ---------------------------------------------------------------------------
  // Test 4: Combined guardrail -- over-research + stuck + knowledge gap
  // ---------------------------------------------------------------------------
  it("combined guardrail: over-research + stuck + knowledge gap", async () => {
    // 180 min researching, 0 building => researchRatio = 1.0 (100%)
    // 2 actions in 180 min task time
    // 0 facts, 0 procedures (from createResearchContext defaults)
    const context = createResearchContext(180, 0, 2, 180)
    const state = await engine.assessAll(context)
    const guidance = engine.getGuidance(state)

    logHomeostasisState(
      "COMBINED: 180min research, 0 building, 2 actions, 0 facts",
      state,
      guidance,
    )

    // ---- HARD ASSERTIONS ----

    // knowledge_application: HIGH (100% research > 80%)
    // Source: assessKnowledgeApplication, researchRatio = 1.0 > 0.8 => HIGH
    expect(state.knowledge_application).toBe("HIGH")

    // knowledge_sufficiency: LOW (0 facts, 0 procedures)
    // Source: assessKnowledgeSufficiency, facts.length === 0 && procedures.length === 0 => LOW
    expect(state.knowledge_sufficiency).toBe("LOW")

    // progress_momentum: LOW (180 min on task, 2 actions < 3)
    // Source: _assessProgressMomentumComputed, timeOnTaskMin > 30 && actionCount < 3 => LOW
    expect(state.progress_momentum).toBe("LOW")

    // Document the combined crisis
    console.log("[trace8] Combined crisis analysis:")
    console.log("[trace8]   knowledge_application: HIGH (100% research, 0% building)")
    console.log("[trace8]   knowledge_sufficiency: LOW (0 facts, 0 procedures)")
    console.log("[trace8]   progress_momentum: LOW (180min, only 2 actions)")
    console.log("[trace8]")
    console.log("[trace8]   This is the worst case: the agent has been researching for 3 hours")
    console.log("[trace8]   but has NO actionable knowledge (0 facts), has barely done anything")
    console.log("[trace8]   (2 actions), and hasn't built anything. A total stall.")
    console.log("[trace8]")
    console.log("[trace8]   The guidance system must surface multiple concerns:")

    // Guidance should report multiple imbalanced dimensions
    expect(guidance).not.toBeNull()
    expect(guidance!.dimensions.length).toBeGreaterThanOrEqual(2)

    console.log(`[trace8]   Guidance dimension count: ${guidance!.dimensions.length}`)
    console.log(`[trace8]   Guidance dimensions (priority order): ${guidance!.dimensions.join(" > ")}`)

    // From guidance.yaml priorities:
    //   knowledge_sufficiency LOW: priority 1 (highest)
    //   progress_momentum LOW: priority 2
    //   knowledge_application HIGH: priority 2
    //   communication_health: depends on time since last message (10 min => LOW pri 3)
    //
    // The primary guidance should come from the highest-priority imbalance.
    // knowledge_sufficiency LOW (priority 1) should be first.
    console.log(`[trace8]   Primary guidance target: ${guidance!.dimensions[0]}`)
    console.log("[trace8]   Expected: knowledge_sufficiency (priority 1, critical)")

    // Verify the three key dimensions are all in the guidance
    expect(guidance!.dimensions).toContain("knowledge_application")
    expect(guidance!.dimensions).toContain("knowledge_sufficiency")
    expect(guidance!.dimensions).toContain("progress_momentum")

    // Document: the guidance primary text comes from knowledge_sufficiency LOW
    // because it has priority 1 (critical). The other dimensions are listed
    // but the primary text addresses the knowledge gap, not the over-research.
    // This is a design insight: the system prioritizes "you don't know enough"
    // over "you're researching too much" because the knowledge gap is more dangerous.
    console.log("[trace8]")
    console.log("[trace8] DESIGN INSIGHT:")
    console.log("[trace8]   Even though knowledge_application HIGH triggers the 'stop researching'")
    console.log("[trace8]   guardrail (priority 2), knowledge_sufficiency LOW (priority 1)")
    console.log("[trace8]   takes precedence in guidance. This means the agent is told to")
    console.log("[trace8]   'fill knowledge gaps' BEFORE 'stop researching' -- which creates")
    console.log("[trace8]   a tension: how can you fill gaps without more research?")
    console.log("[trace8]   Resolution: the knowledge_application HIGH secondary text says")
    console.log("[trace8]   'start building and learn by doing'. The system suggests a shift")
    console.log("[trace8]   from passive research to active experimentation.")
  })

  // ---------------------------------------------------------------------------
  // Test 5: Documents knowledge_application threshold boundaries
  // ---------------------------------------------------------------------------
  it("documents knowledge_application thresholds", async () => {
    console.log("\n[trace8] === KNOWLEDGE_APPLICATION THRESHOLD DOCUMENTATION ===")
    console.log("[trace8] Engine rules:")
    console.log("[trace8]   researchRatio > 0.8  => HIGH (analysis paralysis)")
    console.log("[trace8]   researchRatio < 0.2  => LOW  (insufficient research)")
    console.log("[trace8]   0.2 <= ratio <= 0.8  => HEALTHY (balanced)")
    console.log("[trace8]   totalTime === 0       => HEALTHY (no data, confidence 0.4)")
    console.log("[trace8]")
    console.log("[trace8] Testing exact boundary values:")

    // Test 19% research (just below 20% threshold => LOW)
    {
      // 19 min research, 81 min building => ratio = 19/100 = 0.19
      const context = createResearchContext(19, 81, 10, 100)
      const state = await engine.assessAll(context)

      const ratio = (19 / 100) * 100
      console.log(`[trace8]   19% research (19min/100min): ${state.knowledge_application}`)
      console.log(`[trace8]     ratio = ${ratio.toFixed(1)}%, threshold < 20% => expect LOW`)

      // 0.19 < 0.2 => LOW
      expect(state.knowledge_application).toBe("LOW")
    }

    // Test 20% research (exactly at lower boundary => HEALTHY)
    {
      // 20 min research, 80 min building => ratio = 20/100 = 0.2
      const context = createResearchContext(20, 80, 10, 100)
      const state = await engine.assessAll(context)

      const ratio = (20 / 100) * 100
      console.log(`[trace8]   20% research (20min/100min): ${state.knowledge_application}`)
      console.log(`[trace8]     ratio = ${ratio.toFixed(1)}%, threshold >= 20% => expect HEALTHY`)

      // 0.2 is NOT < 0.2 (fails the < check), and NOT > 0.8 => HEALTHY
      expect(state.knowledge_application).toBe("HEALTHY")
    }

    // Test 80% research (exactly at upper boundary => HEALTHY)
    {
      // 80 min research, 20 min building => ratio = 80/100 = 0.8
      const context = createResearchContext(80, 20, 10, 100)
      const state = await engine.assessAll(context)

      const ratio = (80 / 100) * 100
      console.log(`[trace8]   80% research (80min/100min): ${state.knowledge_application}`)
      console.log(`[trace8]     ratio = ${ratio.toFixed(1)}%, threshold <= 80% => expect HEALTHY`)

      // 0.8 is NOT > 0.8 (fails the > check), and NOT < 0.2 => HEALTHY
      expect(state.knowledge_application).toBe("HEALTHY")
    }

    // Test 81% research (just above 80% threshold => HIGH)
    {
      // 81 min research, 19 min building => ratio = 81/100 = 0.81
      const context = createResearchContext(81, 19, 10, 100)
      const state = await engine.assessAll(context)

      const ratio = (81 / 100) * 100
      console.log(`[trace8]   81% research (81min/100min): ${state.knowledge_application}`)
      console.log(`[trace8]     ratio = ${ratio.toFixed(1)}%, threshold > 80% => expect HIGH`)

      // 0.81 > 0.8 => HIGH
      expect(state.knowledge_application).toBe("HIGH")
    }

    // Test 0% research / 0% building (no time data => HEALTHY with low confidence)
    {
      const context = createResearchContext(0, 0, 10, 100)
      const state = await engine.assessAll(context)

      console.log(`[trace8]   0% research, 0% building (no data): ${state.knowledge_application}`)
      console.log("[trace8]     totalTime = 0, no assessment possible => expect HEALTHY (confidence 0.4)")

      // totalTime === 0 => HEALTHY
      expect(state.knowledge_application).toBe("HEALTHY")
    }

    // Also verify via individual dimension assessment to capture confidence and reason
    console.log("[trace8]")
    console.log("[trace8] Detailed boundary assessments via assessDimension:")

    const boundaries = [
      { research: 19, building: 81, label: "19% (below lower threshold)" },
      { research: 20, building: 80, label: "20% (at lower threshold)" },
      { research: 50, building: 50, label: "50% (balanced midpoint)" },
      { research: 80, building: 20, label: "80% (at upper threshold)" },
      { research: 81, building: 19, label: "81% (above upper threshold)" },
      { research: 0, building: 0, label: "0/0 (no time data)" },
    ]

    for (const b of boundaries) {
      const ctx = createResearchContext(b.research, b.building, 10, 100)
      const assessment = await engine.assessDimension(
        "knowledge_application",
        ctx,
      )
      console.log(
        `[trace8]   ${b.label}: state=${assessment.state}, confidence=${assessment.confidence}, reason="${assessment.reason}"`,
      )
    }

    console.log("[trace8]")
    console.log("[trace8] THRESHOLD SUMMARY:")
    console.log("[trace8]   [0%, 20%)  => LOW  (insufficient research)")
    console.log("[trace8]   [20%, 80%] => HEALTHY (balanced)")
    console.log("[trace8]   (80%, 100%] => HIGH (analysis paralysis)")
    console.log("[trace8]   No data (0/0) => HEALTHY (default, low confidence)")
    console.log("[trace8]   Boundaries are: < 0.2 for LOW, > 0.8 for HIGH")
    console.log("[trace8]   Exactly 0.2 and 0.8 are HEALTHY (inclusive)")
    console.log("[trace8] === END THRESHOLD DOCUMENTATION ===\n")
  })

  // ---------------------------------------------------------------------------
  // Test 6: Documents full dimension interactions for over-research scenario
  // ---------------------------------------------------------------------------
  it("documents full dimension interactions for over-research", async () => {
    // Classic analysis paralysis: 120min research, 0 building, 4 actions
    const context = createResearchContext(120, 0, 4, 120)

    // Assess each dimension individually to capture reason + confidence
    const allDimensions: Dimension[] = [
      "knowledge_sufficiency",
      "certainty_alignment",
      "progress_momentum",
      "communication_health",
      "productive_engagement",
      "knowledge_application",
    ]

    console.log("\n[trace8] === FULL DIMENSION ASSESSMENT (individual) ===")
    console.log("[trace8] Context: 120min research, 0 building, 4 actions, 120min on task")
    console.log("[trace8]   retrievedFacts: 0, retrievedProcedures: 0")
    console.log("[trace8]   hasAssignedTask: true, lastMessageTime: 10min ago")
    console.log("")

    for (const dim of allDimensions) {
      const assessment = await engine.assessDimension(dim, context)
      console.log(
        `[trace8] ${dim}: state=${assessment.state}, method=${assessment.method}, confidence=${assessment.confidence}`,
      )
      console.log(`[trace8]   reason: "${assessment.reason}"`)
    }

    // Now run the full assessment and compare
    const fullState = await engine.assessAll(context)
    const guidance = engine.getGuidance(fullState)

    logHomeostasisState("OVER-RESEARCH: FULL ASSESSMENT", fullState, guidance)

    // ---- Document the complete picture ----

    console.log("[trace8] === OVER-RESEARCH: COMPLETE DIMENSION ANALYSIS ===")

    // Dimension 1: knowledge_sufficiency
    // Expected: LOW (0 facts, 0 procedures)
    console.log("[trace8] 1. knowledge_sufficiency: LOW")
    console.log("[trace8]    Why: No relevant knowledge retrieved (0 facts, 0 procedures)")
    console.log("[trace8]    Irony: The agent spent 2 hours researching but has no stored facts")
    console.log("[trace8]    Impact: Guidance priority 1 (critical)")
    expect(fullState.knowledge_sufficiency).toBe("LOW")

    // Dimension 2: certainty_alignment
    // Expected: HEALTHY (no uncertainty+high-stakes combo in "Let me look into PKCE flow")
    console.log("[trace8] 2. certainty_alignment: HEALTHY")
    console.log("[trace8]    Why: Message has no uncertainty+high-stakes combination")
    expect(fullState.certainty_alignment).toBe("HEALTHY")

    // Dimension 3: progress_momentum
    // Expected: HEALTHY (120min on task, 4 actions >= 3)
    console.log("[trace8] 3. progress_momentum: HEALTHY")
    console.log("[trace8]    Why: 120min on task, 4 actions (>= 3 threshold)")
    console.log("[trace8]    NOTE: Would be LOW if actionCount were 2 instead of 4")
    expect(fullState.progress_momentum).toBe("HEALTHY")

    // Dimension 4: communication_health
    // Expected: depends on lastMessageTime = 10 min ago
    // 10 min is at the boundary: > 10 min => LOW, but we set it to exactly 10 min ago
    // The check is: timeSinceLastMin > 10 (strict greater than)
    // 10 min is NOT > 10, so it falls through to the 2-10 min check
    // Actually, Date.now() - (Date.now() - 10*60*1000) = 10*60*1000 ms = 10 min
    // Due to time passing between context creation and assessment, it may be slightly > 10
    // Let's document whatever we get
    const commAssessment = await engine.assessDimension("communication_health", context)
    console.log(`[trace8] 4. communication_health: ${fullState.communication_health}`)
    console.log(`[trace8]    Why: lastMessage ~10min ago, reason="${commAssessment.reason}"`)
    console.log("[trace8]    NOTE: At the 10min boundary, slight timing differences may cause")
    console.log("[trace8]    this to be HEALTHY or LOW depending on execution speed")

    // Dimension 5: productive_engagement
    // Expected: HEALTHY (hasAssignedTask = true)
    console.log("[trace8] 5. productive_engagement: HEALTHY")
    console.log("[trace8]    Why: hasAssignedTask = true")
    expect(fullState.productive_engagement).toBe("HEALTHY")

    // Dimension 6: knowledge_application
    // Expected: HIGH (100% research)
    console.log("[trace8] 6. knowledge_application: HIGH")
    console.log("[trace8]    Why: researchRatio = 1.0 (100% research, > 80% threshold)")
    console.log("[trace8]    This is the core finding of this trace")
    expect(fullState.knowledge_application).toBe("HIGH")

    console.log("[trace8]")
    console.log("[trace8] KNOWN GAP:")
    console.log("[trace8]   The pipeline doesn't yet track timeSpentResearching/timeSpentBuilding.")
    console.log("[trace8]   These values would come from the observation pipeline (Phase 4).")
    console.log("[trace8]   Until then, knowledge_application will always get HEALTHY with")
    console.log("[trace8]   confidence 0.4 in production because totalTime will be 0.")
    console.log("[trace8]   The engine CAN detect over-research -- but no one feeds it the data.")
    console.log("[trace8]")
    console.log("[trace8] DESIGN INSIGHT:")
    console.log("[trace8]   The over-research guardrail requires two things to work:")
    console.log("[trace8]   1. The engine logic (tested here) -- correctly maps ratios to states")
    console.log("[trace8]   2. The observation pipeline (Phase 4) -- feeds time data to context")
    console.log("[trace8]   Without #2, the guardrail is dormant. This test proves #1 works.")
    console.log("[trace8] === END FULL DIMENSION ANALYSIS ===\n")
  })
})
