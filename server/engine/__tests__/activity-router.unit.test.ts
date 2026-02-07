/**
 * Phase 3: Activity Router Unit Tests
 */

import { describe, expect, it } from "vitest"
import { ActivityRouter, createActivityRouter } from "../activity-router"
import type { HomeostasisState, Procedure, Task } from "../types"

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

function createMockHomeostasis(
  overrides?: Partial<HomeostasisState>,
): HomeostasisState {
  return {
    knowledge_sufficiency: "HEALTHY",
    certainty_alignment: "HEALTHY",
    progress_momentum: "HEALTHY",
    communication_health: "HEALTHY",
    productive_engagement: "HEALTHY",
    knowledge_application: "HEALTHY",
    assessed_at: new Date(),
    assessment_method: {
      knowledge_sufficiency: "computed",
      certainty_alignment: "computed",
      progress_momentum: "computed",
      communication_health: "computed",
      productive_engagement: "computed",
      knowledge_application: "computed",
    },
    ...overrides,
  }
}

// ============================================================================
// Constructor & Factory
// ============================================================================

describe("ActivityRouter", () => {
  describe("constructor and factory", () => {
    it("creates instance via constructor", () => {
      const router = new ActivityRouter()
      expect(router).toBeInstanceOf(ActivityRouter)
    })

    it("creates instance via factory function", () => {
      const router = createActivityRouter()
      expect(router).toBeInstanceOf(ActivityRouter)
    })
  })

  // ============================================================================
  // Level 0: Direct Execution
  // ============================================================================

  describe("classify - Level 0 (Direct)", () => {
    it("classifies tool call as Level 0", async () => {
      const router = createActivityRouter()
      const task = createMockTask("git status", { isToolCall: true })

      const result = await router.classify(task, null, null)

      expect(result.level).toBe(0)
      expect(result.model).toBe("none")
      expect(result.skipMemory).toBe(true)
      expect(result.skipHomeostasis).toBe(true)
      expect(result.reason).toContain("tool call")
    })

    it("classifies template as Level 0", async () => {
      const router = createActivityRouter()
      const task = createMockTask("done")

      const result = await router.classify(task, null, null)

      expect(result.level).toBe(0)
      expect(result.model).toBe("none")
      expect(result.skipMemory).toBe(true)
      expect(result.reason).toContain("Template")
    })

    it("classifies 'ok' as Level 0 template", async () => {
      const router = createActivityRouter()
      const task = createMockTask("OK")

      const result = await router.classify(task, null, null)

      expect(result.level).toBe(0)
      expect(result.model).toBe("none")
    })
  })

  // ============================================================================
  // Level 1: Pattern-Based
  // ============================================================================

  describe("classify - Level 1 (Pattern)", () => {
    it("classifies strong procedure match as Level 1", async () => {
      const router = createActivityRouter()
      const task = createMockTask("Create new Expo project")
      const procedure = createMockProcedure("expo-setup", 0.9, 10)

      const result = await router.classify(task, procedure, null)

      expect(result.level).toBe(1)
      expect(result.model).toBe("haiku")
      expect(result.skipMemory).toBe(false)
      expect(result.skipHomeostasis).toBe(true)
      expect(result.reason).toContain("Strong procedure match")
      expect(result.reason).toContain("90% success")
    })

    it("does not classify weak procedure as Level 1", async () => {
      const router = createActivityRouter()
      const task = createMockTask("Create new Expo project")
      const procedure = createMockProcedure("expo-setup", 0.7, 10) // Only 70%

      const result = await router.classify(task, procedure, null)

      expect(result.level).not.toBe(1)
    })

    it("does not classify untested procedure as Level 1", async () => {
      const router = createActivityRouter()
      const task = createMockTask("Create new Expo project")
      const procedure = createMockProcedure("expo-setup", 0.9, 3) // Only 3 uses

      const result = await router.classify(task, procedure, null)

      expect(result.level).not.toBe(1)
    })
  })

  // ============================================================================
  // Level 2: Default Reasoning
  // ============================================================================

  describe("classify - Level 2 (Reason)", () => {
    it("classifies standard task as Level 2", async () => {
      const router = createActivityRouter()
      const task = createMockTask("Add a button to the UI")

      const result = await router.classify(task, null, null)

      expect(result.level).toBe(2)
      expect(result.model).toBe("sonnet")
      expect(result.skipMemory).toBe(false)
      expect(result.skipHomeostasis).toBe(false)
      expect(result.reason).toContain("Standard reasoning")
    })

    it("defaults to Level 2 with weak procedure", async () => {
      const router = createActivityRouter()
      const task = createMockTask("Implement authentication")
      const weakProcedure = createMockProcedure("auth", 0.6, 10)

      const result = await router.classify(task, weakProcedure, null)

      expect(result.level).toBe(2)
      expect(result.model).toBe("sonnet")
    })
  })

  // ============================================================================
  // Level 3: Reflexion
  // ============================================================================

  describe("classify - Level 3 (Reflect)", () => {
    it("classifies knowledge gap as Level 3", async () => {
      const router = createActivityRouter()
      const task = createMockTask("how do i implement OAuth?", {
        hasKnowledgeGap: true,
      })

      const result = await router.classify(task, null, null)

      expect(result.level).toBe(3)
      expect(result.model).toBe("sonnet")
      expect(result.skipMemory).toBe(false)
      expect(result.skipHomeostasis).toBe(false)
      expect(result.reason).toContain("Knowledge gap")
    })

    it("classifies high-stakes + irreversible as Level 3", async () => {
      const router = createActivityRouter()
      const task = createMockTask("force push to production")

      const result = await router.classify(task, null, null)

      expect(result.level).toBe(3)
      expect(result.reason).toContain("High-stakes irreversible")
    })

    it("classifies LOW knowledge + high stakes as Level 3", async () => {
      const router = createActivityRouter()
      // Use a high-stakes task that is NOT irreversible
      const task = createMockTask("update authentication logic", {
        isHighStakes: true,
        isIrreversible: false,
      })
      const homeostasis = createMockHomeostasis({
        knowledge_sufficiency: "LOW",
      })

      const result = await router.classify(task, null, homeostasis)

      expect(result.level).toBe(3)
      expect(result.reason).toContain("Knowledge gap + high stakes")
    })

    it("classifies LOW certainty + irreversible as Level 3", async () => {
      const router = createActivityRouter()
      // Use an irreversible task that is NOT high-stakes
      const task = createMockTask("git reset --hard", {
        isIrreversible: true,
        isHighStakes: false,
      })
      const homeostasis = createMockHomeostasis({
        certainty_alignment: "LOW",
      })

      const result = await router.classify(task, null, homeostasis)

      expect(result.level).toBe(3)
      expect(result.reason).toContain("Uncertainty about irreversible")
    })

    it("does not escalate to Level 3 for safe confident tasks", async () => {
      const router = createActivityRouter()
      const task = createMockTask("add a button")
      const homeostasis = createMockHomeostasis({
        knowledge_sufficiency: "HEALTHY",
        certainty_alignment: "HEALTHY",
      })

      const result = await router.classify(task, null, homeostasis)

      expect(result.level).not.toBe(3)
    })
  })

  // ============================================================================
  // Model Selection
  // ============================================================================

  describe("selectModel", () => {
    it("selects none for Level 0", () => {
      const router = createActivityRouter()

      const model = router.selectModel(0)

      expect(model.id).toBe("none")
      expect(model.model_id).toBe("none")
      expect(model.cost_per_1k_tokens).toBe(0)
    })

    it("selects haiku for Level 1", () => {
      const router = createActivityRouter()

      const model = router.selectModel(1)

      expect(model.id).toBe("haiku")
      expect(model.characteristics).toContain("fast")
      expect(model.cost_per_1k_tokens).toBeLessThan(0.01)
    })

    it("selects sonnet for Level 2", () => {
      const router = createActivityRouter()

      const model = router.selectModel(2)

      expect(model.id).toBe("sonnet")
      expect(model.characteristics).toContain("reasoning")
    })

    it("selects sonnet for Level 3", () => {
      const router = createActivityRouter()

      const model = router.selectModel(3)

      expect(model.id).toBe("sonnet")
      expect(model.characteristics).toContain("reasoning")
    })
  })

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe("classify - integration", () => {
    it("handles all inputs (task + procedure + homeostasis)", async () => {
      const router = createActivityRouter()
      const task = createMockTask("Implement feature X")
      const procedure = createMockProcedure("feature-impl", 0.85, 10)
      const homeostasis = createMockHomeostasis()

      const result = await router.classify(task, procedure, homeostasis)

      // Should match strong procedure (Level 1)
      expect(result.level).toBe(1)
      expect(result.model).toBe("haiku")
    })

    it("prioritizes Level 0 over Level 3", async () => {
      const router = createActivityRouter()
      // Tool call that happens to have scary keywords
      const task = createMockTask("git status --force", { isToolCall: true })

      const result = await router.classify(task, null, null)

      // Should still be Level 0 (tool calls always direct)
      expect(result.level).toBe(0)
    })

    it("prioritizes Level 3 over Level 1", async () => {
      const router = createActivityRouter()
      const task = createMockTask("force push", { isIrreversible: true, isHighStakes: true })
      const strongProcedure = createMockProcedure("git-ops", 0.9, 10)

      const result = await router.classify(task, strongProcedure, null)

      // Should escalate to Level 3 despite strong procedure
      expect(result.level).toBe(3)
    })
  })
})
