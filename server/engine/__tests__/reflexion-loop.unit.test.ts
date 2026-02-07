/**
 * Phase 3: Reflexion Loop Unit Tests (Stage C)
 */

import { describe, expect, it } from "vitest"
import { ReflexionLoop, createReflexionLoop } from "../reflexion-loop"
import type { AgentContext, Task } from "../types"

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

function createMockContext(overrides?: Partial<AgentContext>): AgentContext {
  return {
    sessionId: "test-session",
    currentMessage: "test message",
    messageHistory: [],
    ...overrides,
  }
}

// ============================================================================
// Constructor & Factory
// ============================================================================

describe("ReflexionLoop", () => {
  describe("constructor and factory", () => {
    it("creates instance via constructor", () => {
      const loop = new ReflexionLoop()
      expect(loop).toBeInstanceOf(ReflexionLoop)
    })

    it("creates instance via factory function", () => {
      const loop = createReflexionLoop()
      expect(loop).toBeInstanceOf(ReflexionLoop)
    })
  })

  // ============================================================================
  // Execute - Happy Path
  // ============================================================================

  describe("execute - happy path", () => {
    it("executes single iteration when critique passes immediately", async () => {
      const loop = createReflexionLoop()
      const task = createMockTask("Implement authentication")
      const context = createMockContext()

      const result = await loop.execute(task, context, 3)

      expect(result.success).toBe(true)
      expect(result.iterations.length).toBe(1)
      expect(result.iterations[0].iteration_number).toBe(1)
      expect(result.iterations[0].revised).toBe(false)
      expect(result.final_draft).toContain("[DRAFT]")
      expect(result.total_llm_calls).toBe(2) // 1 draft + 1 critique
    })

    it("includes evidence in iteration", async () => {
      const loop = createReflexionLoop()
      const task = createMockTask("Add button to UI")
      const context = createMockContext()

      const result = await loop.execute(task, context, 3)

      expect(result.iterations[0].evidence).toBeDefined()
      expect(result.iterations[0].evidence.length).toBeGreaterThan(0)
      expect(result.iterations[0].evidence[0].source).toBe("memory")
      expect(result.iterations[0].evidence[0].relevance).toBeGreaterThan(0)
    })

    it("includes critique in iteration", async () => {
      const loop = createReflexionLoop()
      const task = createMockTask("Deploy to production")
      const context = createMockContext()

      const result = await loop.execute(task, context, 3)

      const critique = result.iterations[0].critique
      expect(critique).toBeDefined()
      expect(critique.passes).toBe(true)
      expect(critique.confidence).toBeGreaterThan(0)
      expect(critique.issues).toBeDefined()
      expect(Array.isArray(critique.issues)).toBe(true)
    })
  })

  // ============================================================================
  // Execute - Max Iterations
  // ============================================================================

  describe("execute - max iterations", () => {
    it("respects maxIterations parameter", async () => {
      const loop = createReflexionLoop()
      const task = createMockTask("Complex task")
      const context = createMockContext()

      // Execute with max 1 iteration
      const result = await loop.execute(task, context, 1)

      expect(result.iterations.length).toBeLessThanOrEqual(1)
    })

    it("uses default max iterations of 3", async () => {
      const loop = createReflexionLoop()
      const task = createMockTask("Another task")
      const context = createMockContext()

      // Don't specify maxIterations
      const result = await loop.execute(task, context)

      // With current placeholder (passes immediately), should be 1 iteration
      expect(result.iterations.length).toBeLessThanOrEqual(3)
    })
  })

  // ============================================================================
  // Iteration Tracking
  // ============================================================================

  describe("iteration tracking", () => {
    it("assigns correct iteration numbers", async () => {
      const loop = createReflexionLoop()
      const task = createMockTask("Test iteration numbers")
      const context = createMockContext()

      const result = await loop.execute(task, context, 3)

      result.iterations.forEach((iteration, index) => {
        expect(iteration.iteration_number).toBe(index + 1)
      })
    })

    it("marks first iteration as not revised", async () => {
      const loop = createReflexionLoop()
      const task = createMockTask("First iteration test")
      const context = createMockContext()

      const result = await loop.execute(task, context, 3)

      expect(result.iterations[0].revised).toBe(false)
    })

    it("stores draft in each iteration", async () => {
      const loop = createReflexionLoop()
      const task = createMockTask("Draft storage test")
      const context = createMockContext()

      const result = await loop.execute(task, context, 3)

      result.iterations.forEach((iteration) => {
        expect(iteration.draft).toBeDefined()
        expect(typeof iteration.draft).toBe("string")
        expect(iteration.draft.length).toBeGreaterThan(0)
      })
    })
  })

  // ============================================================================
  // LLM Call Tracking
  // ============================================================================

  describe("LLM call tracking", () => {
    it("counts LLM calls correctly", async () => {
      const loop = createReflexionLoop()
      const task = createMockTask("LLM call tracking test")
      const context = createMockContext()

      const result = await loop.execute(task, context, 3)

      // With placeholder that passes immediately:
      // 1 draft + 1 critique = 2 calls
      expect(result.total_llm_calls).toBe(2)
    })

    it("tracks total LLM calls across iterations", async () => {
      const loop = createReflexionLoop()
      const task = createMockTask("Multi-iteration LLM tracking")
      const context = createMockContext()

      const result = await loop.execute(task, context, 3)

      // total_llm_calls should be sum of all draft + critique calls
      expect(result.total_llm_calls).toBeGreaterThanOrEqual(2)
    })
  })

  // ============================================================================
  // Result Structure
  // ============================================================================

  describe("result structure", () => {
    it("returns ReflexionResult with required fields", async () => {
      const loop = createReflexionLoop()
      const task = createMockTask("Result structure test")
      const context = createMockContext()

      const result = await loop.execute(task, context, 3)

      expect(result).toHaveProperty("final_draft")
      expect(result).toHaveProperty("iterations")
      expect(result).toHaveProperty("total_llm_calls")
      expect(result).toHaveProperty("success")
    })

    it("final_draft matches last iteration's draft", async () => {
      const loop = createReflexionLoop()
      const task = createMockTask("Final draft match test")
      const context = createMockContext()

      const result = await loop.execute(task, context, 3)

      const lastIteration = result.iterations[result.iterations.length - 1]
      expect(result.final_draft).toBe(lastIteration.draft)
    })

    it("iterations array is not empty", async () => {
      const loop = createReflexionLoop()
      const task = createMockTask("Iterations array test")
      const context = createMockContext()

      const result = await loop.execute(task, context, 3)

      expect(result.iterations.length).toBeGreaterThan(0)
    })
  })

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe("edge cases", () => {
    it("handles empty task message", async () => {
      const loop = createReflexionLoop()
      const task = createMockTask("")
      const context = createMockContext()

      const result = await loop.execute(task, context, 3)

      expect(result).toBeDefined()
      expect(result.success).toBeDefined()
      expect(result.iterations.length).toBeGreaterThan(0)
    })

    it("handles maxIterations = 1", async () => {
      const loop = createReflexionLoop()
      const task = createMockTask("Single iteration test")
      const context = createMockContext()

      const result = await loop.execute(task, context, 1)

      expect(result.iterations.length).toBeLessThanOrEqual(1)
    })

    it("handles context with minimal data", async () => {
      const loop = createReflexionLoop()
      const task = createMockTask("Minimal context test")
      const context = createMockContext({
        messageHistory: [],
        retrievedFacts: [],
      })

      const result = await loop.execute(task, context, 3)

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
    })
  })

  // ============================================================================
  // Placeholder Behavior (Stage C)
  // ============================================================================

  describe("placeholder behavior (Stage C)", () => {
    it("generates draft with placeholder text", async () => {
      const loop = createReflexionLoop()
      const task = createMockTask("Test placeholder draft")
      const context = createMockContext()

      const result = await loop.execute(task, context, 3)

      expect(result.final_draft).toContain("[DRAFT]")
      expect(result.final_draft).toContain("placeholder")
    })

    it("critique always passes (placeholder)", async () => {
      const loop = createReflexionLoop()
      const task = createMockTask("Test placeholder critique")
      const context = createMockContext()

      const result = await loop.execute(task, context, 3)

      // With placeholder implementation, critique should pass immediately
      expect(result.success).toBe(true)
      expect(result.iterations[0].critique.passes).toBe(true)
    })

    it("evidence comes from memory placeholder", async () => {
      const loop = createReflexionLoop()
      const task = createMockTask("Test placeholder evidence")
      const context = createMockContext()

      const result = await loop.execute(task, context, 3)

      const evidence = result.iterations[0].evidence
      expect(evidence.length).toBeGreaterThan(0)
      expect(evidence[0].source).toBe("memory")
      expect(evidence[0].content).toContain("Placeholder")
    })
  })

  // ============================================================================
  // Integration (Future)
  // ============================================================================

  describe("integration readiness", () => {
    it("accepts Task from types.ts", async () => {
      const loop = createReflexionLoop()
      const task: Task = {
        message: "Type compatibility test",
        sessionId: "test-session",
        isHighStakes: true,
        isIrreversible: false,
      }
      const context = createMockContext()

      const result = await loop.execute(task, context, 3)

      expect(result).toBeDefined()
    })

    it("accepts AgentContext from types.ts", async () => {
      const loop = createReflexionLoop()
      const task = createMockTask("Context type test")
      const context: AgentContext = {
        sessionId: "test-session",
        currentMessage: "test",
        messageHistory: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there" },
        ],
        retrievedFacts: [
          { content: "Test fact", confidence: 0.8 },
        ],
      }

      const result = await loop.execute(task, context, 3)

      expect(result).toBeDefined()
    })

    it("returns properly typed ReflexionResult", async () => {
      const loop = createReflexionLoop()
      const task = createMockTask("Result type test")
      const context = createMockContext()

      const result = await loop.execute(task, context, 3)

      // TypeScript should validate these at compile time
      const finalDraft: string = result.final_draft
      const success: boolean = result.success
      const totalCalls: number = result.total_llm_calls

      expect(typeof finalDraft).toBe("string")
      expect(typeof success).toBe("boolean")
      expect(typeof totalCalls).toBe("number")
    })
  })
})
