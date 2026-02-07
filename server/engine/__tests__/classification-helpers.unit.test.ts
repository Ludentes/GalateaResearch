/**
 * Phase 3: Classification Helpers Unit Tests
 */

import { describe, expect, it } from "vitest"
import {
  enrichTaskWithFlags,
  hasKnowledgeGap,
  hasProcedureMatch,
  isDirectToolCall,
  isHighStakesAction,
  isIrreversibleAction,
  isTemplateMessage,
} from "../classification-helpers"
import type { Procedure, Task } from "../types"

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
  successRate: number,
  timesUsed: number,
): Procedure {
  return {
    id: 1,
    name: "Test Procedure",
    trigger_pattern: "test",
    trigger_context: [],
    steps: [],
    success_rate: successRate,
    times_used: timesUsed,
  }
}

// ============================================================================
// isDirectToolCall Tests
// ============================================================================

describe("isDirectToolCall", () => {
  it("returns true when task has isToolCall flag", () => {
    const task = createMockTask("any message", { isToolCall: true })
    expect(isDirectToolCall(task)).toBe(true)
  })

  it("returns false when task does not have isToolCall flag", () => {
    const task = createMockTask("any message")
    expect(isDirectToolCall(task)).toBe(false)
  })

  it("returns false when isToolCall is explicitly false", () => {
    const task = createMockTask("any message", { isToolCall: false })
    expect(isDirectToolCall(task)).toBe(false)
  })
})

// ============================================================================
// isTemplateMessage Tests
// ============================================================================

describe("isTemplateMessage", () => {
  it("returns true for 'done'", () => {
    const task = createMockTask("done")
    expect(isTemplateMessage(task)).toBe(true)
  })

  it("returns true for 'ok'", () => {
    const task = createMockTask("OK")
    expect(isTemplateMessage(task)).toBe(true)
  })

  it("returns true for 'task completed'", () => {
    const task = createMockTask("Task Completed")
    expect(isTemplateMessage(task)).toBe(true)
  })

  it("returns true for 'tests passing'", () => {
    const task = createMockTask("tests passing")
    expect(isTemplateMessage(task)).toBe(true)
  })

  it("returns false for complex message", () => {
    const task = createMockTask(
      "I need to implement a new feature for authentication",
    )
    expect(isTemplateMessage(task)).toBe(false)
  })

  it("returns true when task has isTemplate flag", () => {
    const task = createMockTask("complex message", { isTemplate: true })
    expect(isTemplateMessage(task)).toBe(true)
  })
})

// ============================================================================
// isIrreversibleAction Tests
// ============================================================================

describe("isIrreversibleAction", () => {
  it("detects force push", () => {
    const task = createMockTask("git push --force to main")
    expect(isIrreversibleAction(task)).toBe(true)
  })

  it("detects drop table", () => {
    const task = createMockTask("DROP TABLE users")
    expect(isIrreversibleAction(task)).toBe(true)
  })

  it("detects rm -rf", () => {
    const task = createMockTask("rm -rf /important/directory")
    expect(isIrreversibleAction(task)).toBe(true)
  })

  it("detects hard reset", () => {
    const task = createMockTask("git reset --hard origin/main")
    expect(isIrreversibleAction(task)).toBe(true)
  })

  it("detects delete production", () => {
    const task = createMockTask("delete production database")
    expect(isIrreversibleAction(task)).toBe(true)
  })

  it("returns false for safe operations", () => {
    const task = createMockTask("git status")
    expect(isIrreversibleAction(task)).toBe(false)
  })

  it("returns true when task has isIrreversible flag", () => {
    const task = createMockTask("safe message", { isIrreversible: true })
    expect(isIrreversibleAction(task)).toBe(true)
  })
})

// ============================================================================
// isHighStakesAction Tests
// ============================================================================

describe("isHighStakesAction", () => {
  it("detects production deployment", () => {
    const task = createMockTask("deploy to production")
    expect(isHighStakesAction(task)).toBe(true)
  })

  it("detects security changes", () => {
    const task = createMockTask("update authentication logic")
    expect(isHighStakesAction(task)).toBe(true)
  })

  it("detects database migration", () => {
    const task = createMockTask("run database migration on prod")
    expect(isHighStakesAction(task)).toBe(true)
  })

  it("detects public release", () => {
    const task = createMockTask("publish v2.0 to npm")
    expect(isHighStakesAction(task)).toBe(true)
  })

  it("returns false for dev operations", () => {
    const task = createMockTask("add a button to the UI")
    expect(isHighStakesAction(task)).toBe(false)
  })

  it("returns true when task has isHighStakes flag", () => {
    const task = createMockTask("safe message", { isHighStakes: true })
    expect(isHighStakesAction(task)).toBe(true)
  })
})

// ============================================================================
// hasKnowledgeGap Tests
// ============================================================================

describe("hasKnowledgeGap", () => {
  it("detects 'how do i' questions", () => {
    const task = createMockTask("how do i implement OAuth?")
    expect(hasKnowledgeGap(task)).toBe(true)
  })

  it("detects 'not sure' uncertainty", () => {
    const task = createMockTask("I'm not sure how to proceed")
    expect(hasKnowledgeGap(task)).toBe(true)
  })

  it("detects 'help me' requests", () => {
    const task = createMockTask("help me understand this error")
    expect(hasKnowledgeGap(task)).toBe(true)
  })

  it("detects 'never done' statements", () => {
    const task = createMockTask("I've never done this before")
    expect(hasKnowledgeGap(task)).toBe(true)
  })

  it("returns false for confident statements", () => {
    const task = createMockTask("I will implement the login feature")
    expect(hasKnowledgeGap(task)).toBe(false)
  })

  it("returns true when task has hasKnowledgeGap flag", () => {
    const task = createMockTask("confident message", { hasKnowledgeGap: true })
    expect(hasKnowledgeGap(task)).toBe(true)
  })
})

// ============================================================================
// hasProcedureMatch Tests
// ============================================================================

describe("hasProcedureMatch", () => {
  it("returns false when no procedure provided", () => {
    expect(hasProcedureMatch(null)).toBe(false)
  })

  it("returns false when success rate too low", () => {
    const procedure = createMockProcedure(0.7, 10) // 70% success, 10 uses
    expect(hasProcedureMatch(procedure)).toBe(false)
  })

  it("returns false when not used enough times", () => {
    const procedure = createMockProcedure(0.9, 3) // 90% success, only 3 uses
    expect(hasProcedureMatch(procedure)).toBe(false)
  })

  it("returns true when both thresholds met", () => {
    const procedure = createMockProcedure(0.85, 10) // 85% success, 10 uses
    expect(hasProcedureMatch(procedure)).toBe(true)
  })

  it("returns true at exact thresholds", () => {
    const procedure = createMockProcedure(0.8, 5) // Exactly 80% and 5 uses
    expect(hasProcedureMatch(procedure)).toBe(true)
  })

  it("returns true for very successful procedure", () => {
    const procedure = createMockProcedure(1.0, 20) // 100% success, 20 uses
    expect(hasProcedureMatch(procedure)).toBe(true)
  })
})

// ============================================================================
// enrichTaskWithFlags Tests
// ============================================================================

describe("enrichTaskWithFlags", () => {
  it("adds all computed flags to task", () => {
    const task = createMockTask("force push to production")

    const enriched = enrichTaskWithFlags(task)

    expect(enriched.isIrreversible).toBe(true)
    expect(enriched.isHighStakes).toBe(true)
    expect(enriched.hasKnowledgeGap).toBe(false)
    expect(enriched.isTemplate).toBe(false)
    expect(enriched.isToolCall).toBe(false)
  })

  it("preserves existing flags", () => {
    const task = createMockTask("any message", { isToolCall: true })

    const enriched = enrichTaskWithFlags(task)

    expect(enriched.isToolCall).toBe(true)
  })

  it("computes all flags for template message", () => {
    const task = createMockTask("done")

    const enriched = enrichTaskWithFlags(task)

    expect(enriched.isTemplate).toBe(true)
    expect(enriched.isHighStakes).toBe(false)
    expect(enriched.isIrreversible).toBe(false)
  })

  it("detects knowledge gap", () => {
    const task = createMockTask("how do i set up OAuth?")

    const enriched = enrichTaskWithFlags(task)

    expect(enriched.hasKnowledgeGap).toBe(true)
    expect(enriched.isHighStakes).toBe(false)
  })
})
