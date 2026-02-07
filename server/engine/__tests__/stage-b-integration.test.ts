/**
 * Phase 3: Stage B Integration Tests
 *
 * Verifies ActivityRouter integrates correctly with HomeostasisEngine.
 */

import { describe, expect, it } from "vitest"
import { createActivityRouter } from "../activity-router"
import { createHomeostasisEngine } from "../homeostasis-engine"
import type { AgentContext, Procedure, Task } from "../types"

// ============================================================================
// Test Helpers
// ============================================================================

function createMockTask(message: string, overrides?: Partial<Task>): Task {
  return {
    message,
    sessionId: "test-session",
    ...overrides,
  }
}

function createMockProcedure(
  name: string,
  successRate: number,
  timesUsed: number,
): Procedure {
  return {
    id: 1,
    name,
    trigger_pattern: "test",
    trigger_context: [],
    steps: [],
    success_rate: successRate,
    times_used: timesUsed,
  }
}

function createMockContext(overrides?: Partial<AgentContext>): AgentContext {
  return {
    sessionId: "test-session",
    currentMessage: "test message",
    messageHistory: [],
    recentActionCount: 0,
    currentTaskStartTime: new Date(),
    ...overrides,
  }
}

// ============================================================================
// Integration Tests
// ============================================================================

describe("Stage B Integration", () => {
  describe("ActivityRouter + HomeostasisEngine", () => {
    it("uses LOW knowledge_sufficiency to escalate to Level 3", async () => {
      const engine = createHomeostasisEngine()
      const router = createActivityRouter()

      // Context with low knowledge (0 facts)
      const context = createMockContext({
        retrievedFacts: [], // No facts retrieved
      })

      // High-stakes task (but not irreversible)
      const task = createMockTask("deploy to production", {
        isHighStakes: true,
        isIrreversible: false,
      })

      // Assess homeostasis
      const homeostasis = await engine.assessAll(context)

      // Should detect LOW knowledge_sufficiency
      expect(homeostasis.knowledge_sufficiency).toBe("LOW")

      // Router should escalate to Level 3
      const classification = await router.classify(task, null, homeostasis)

      expect(classification.level).toBe(3)
      expect(classification.reason).toContain("Knowledge gap + high stakes")
    })

    it("uses LOW certainty_alignment to escalate to Level 3", async () => {
      const engine = createHomeostasisEngine()
      const router = createActivityRouter()

      // Context with uncertainty in message
      const context = createMockContext({
        currentMessage: "I'm not sure if we should deploy to production", // Uncertainty + high-stakes
        retrievedFacts: [
          { content: "fact1", confidence: 0.3 },
          { content: "fact2", confidence: 0.4 },
        ],
      })

      // Irreversible task (but not high-stakes or knowledge gap flags on Task itself)
      const task = createMockTask("I'm not sure if we should deploy to production", {
        isIrreversible: true,
        isHighStakes: false,
        hasKnowledgeGap: false, // Explicitly false to test certainty_alignment path
      })

      // Assess homeostasis
      const homeostasis = await engine.assessAll(context)

      // Should detect LOW certainty_alignment (uncertainty + high-stakes keywords in message)
      expect(homeostasis.certainty_alignment).toBe("LOW")

      // Router should escalate to Level 3
      const classification = await router.classify(task, null, homeostasis)

      expect(classification.level).toBe(3)
      expect(classification.reason).toContain("Uncertainty about irreversible")
    })

    it("does not escalate when homeostasis is HEALTHY", async () => {
      const engine = createHomeostasisEngine()
      const router = createActivityRouter()

      // Context with good knowledge
      const context = createMockContext({
        retrievedFacts: [
          { content: "fact1", confidence: 0.75 },
          { content: "fact2", confidence: 0.75 },
          { content: "fact3", confidence: 0.75 },
          { content: "fact4", confidence: 0.75 },
          { content: "fact5", confidence: 0.75 },
          { content: "fact6", confidence: 0.75 },
        ], // 6 facts with good confidence
        recentActionCount: 3,
        currentTaskStartTime: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago
      })

      // Standard task
      const task = createMockTask("add a button to the UI")

      // Assess homeostasis
      const homeostasis = await engine.assessAll(context)

      // Should be HEALTHY
      expect(homeostasis.knowledge_sufficiency).toBe("HEALTHY")
      expect(homeostasis.certainty_alignment).toBe("HEALTHY")
      expect(homeostasis.progress_momentum).toBe("HEALTHY")

      // Router should not escalate
      const classification = await router.classify(task, null, homeostasis)

      expect(classification.level).toBe(2) // Standard Level 2
    })

    it("prioritizes Level 1 (procedure) over homeostasis concerns", async () => {
      const engine = createHomeostasisEngine()
      const router = createActivityRouter()

      // Context with LOW knowledge
      const context = createMockContext({
        retrievedFacts: [], // No facts
      })

      // Task with strong procedure
      const task = createMockTask("create new expo project")
      const procedure = createMockProcedure("expo-setup", 0.9, 10)

      // Assess homeostasis
      const homeostasis = await engine.assessAll(context)

      expect(homeostasis.knowledge_sufficiency).toBe("LOW")

      // Router should use Level 1 (procedure has priority)
      const classification = await router.classify(task, procedure, homeostasis)

      expect(classification.level).toBe(1)
      expect(classification.model).toBe("haiku")
    })

    it("prioritizes Level 3 (reflexion) over procedure match", async () => {
      const router = createActivityRouter()

      // High-stakes + irreversible task
      const task = createMockTask("force push to production", {
        isHighStakes: true,
        isIrreversible: true,
      })

      // Even with strong procedure
      const procedure = createMockProcedure("git-ops", 0.9, 10)

      // Router should escalate to Level 3 despite procedure (no homeostasis needed)
      const classification = await router.classify(task, procedure, null)

      expect(classification.level).toBe(3)
      expect(classification.reason).toContain("High-stakes irreversible")
    })
  })

  describe("ActivityRouter model selection", () => {
    it("selects correct models for all levels", () => {
      const router = createActivityRouter()

      const level0Model = router.selectModel(0)
      const level1Model = router.selectModel(1)
      const level2Model = router.selectModel(2)
      const level3Model = router.selectModel(3)

      expect(level0Model.id).toBe("none")
      expect(level0Model.cost_per_1k_tokens).toBe(0)

      expect(level1Model.id).toBe("haiku")
      expect(level1Model.cost_per_1k_tokens).toBeLessThan(0.01)

      expect(level2Model.id).toBe("sonnet")
      expect(level2Model.characteristics).toContain("reasoning")

      expect(level3Model.id).toBe("sonnet")
      expect(level3Model.characteristics).toContain("reasoning")
    })

    it("verifies cost optimization strategy", () => {
      const router = createActivityRouter()

      const level0Model = router.selectModel(0)
      const level1Model = router.selectModel(1)
      const level2Model = router.selectModel(2)

      // Level 0 should be free
      expect(level0Model.cost_per_1k_tokens).toBe(0)

      // Level 1 should be ~93% cheaper than Level 2
      const savings =
        (level2Model.cost_per_1k_tokens - level1Model.cost_per_1k_tokens) /
        level2Model.cost_per_1k_tokens

      expect(savings).toBeGreaterThan(0.9) // >90% savings
    })
  })

  describe("Edge cases", () => {
    it("handles null procedure and null homeostasis", async () => {
      const router = createActivityRouter()
      const task = createMockTask("implement a feature")

      const classification = await router.classify(task, null, null)

      // Should default to Level 2
      expect(classification.level).toBe(2)
      expect(classification.model).toBe("sonnet")
    })

    it("handles weak procedure with LOW homeostasis", async () => {
      const engine = createHomeostasisEngine()
      const router = createActivityRouter()

      // Weak procedure (70% success, 10 uses)
      const weakProcedure = createMockProcedure("weak", 0.7, 10)

      // LOW knowledge context
      const context = createMockContext({
        retrievedFacts: [{ content: "fact1", confidence: 0.3 }], // 1 fact with low confidence
      })

      const task = createMockTask("implement feature X", {
        isHighStakes: true,
      })

      const homeostasis = await engine.assessAll(context)

      // Should escalate to Level 3 (ignoring weak procedure)
      const classification = await router.classify(
        task,
        weakProcedure,
        homeostasis,
      )

      expect(classification.level).toBe(3)
    })

    it("handles boundary conditions for procedure thresholds", () => {
      const router = createActivityRouter()

      // Exactly at thresholds (80% success, 5 uses)
      const boundaryProcedure = createMockProcedure("boundary", 0.8, 5)
      const task = createMockTask("test task")

      const classification = router.classify(task, boundaryProcedure, null)

      // Should match Level 1
      return classification.then((result) => {
        expect(result.level).toBe(1)
      })
    })
  })

  describe("Full workflow scenarios", () => {
    it("simulates full Level 0 → Level 3 progression", async () => {
      const router = createActivityRouter()

      // Level 0: Tool call
      const toolTask = createMockTask("git status", { isToolCall: true })
      const toolClassification = await router.classify(toolTask, null, null)
      expect(toolClassification.level).toBe(0)
      expect(toolClassification.skipMemory).toBe(true)

      // Level 1: Strong procedure
      const procedureTask = createMockTask("create expo project")
      const strongProcedure = createMockProcedure("expo", 0.9, 10)
      const procedureClassification = await router.classify(
        procedureTask,
        strongProcedure,
        null,
      )
      expect(procedureClassification.level).toBe(1)

      // Level 2: Standard task
      const standardTask = createMockTask("add button to UI")
      const standardClassification = await router.classify(
        standardTask,
        null,
        null,
      )
      expect(standardClassification.level).toBe(2)

      // Level 3: High-stakes irreversible
      const criticalTask = createMockTask("force push to production", {
        isHighStakes: true,
        isIrreversible: true,
      })
      const criticalClassification = await router.classify(
        criticalTask,
        null,
        null,
      )
      expect(criticalClassification.level).toBe(3)
    })
  })
})
