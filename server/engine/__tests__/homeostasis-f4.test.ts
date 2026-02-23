// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest"
import {
  assessDimensions,
  clearCache,
  getGuidance,
} from "../homeostasis-engine"
import type { AgentContext, TrustLevel } from "../types"

afterEach(() => {
  clearCache()
})

function makeContext(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    sessionId: `test-${Date.now()}`,
    currentMessage: "",
    messageHistory: [],
    retrievedFacts: [],
    hasAssignedTask: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// BDD Scenario 1: Communication Cooldown
// ---------------------------------------------------------------------------
describe("communication_health — outbound cooldown", () => {
  it("returns HIGH when agent sent a message 2 minutes ago", () => {
    const ctx = makeContext({
      lastOutboundAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    })
    const state = assessDimensions(ctx)
    expect(state.communication_health).toBe("HIGH")
  })

  it("returns HEALTHY when no recent outbound", () => {
    const ctx = makeContext()
    const state = assessDimensions(ctx)
    expect(state.communication_health).toBe("HEALTHY")
  })
})

// ---------------------------------------------------------------------------
// BDD Scenario 2: Communication Silence During Active Work
// ---------------------------------------------------------------------------
describe("communication_health — silence during active work", () => {
  it("returns LOW when has task but no outbound for 3+ hours", () => {
    const ctx = makeContext({
      hasAssignedTask: true,
      lastOutboundAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
    })
    const state = assessDimensions(ctx)
    expect(state.communication_health).toBe("LOW")
  })

  it("guidance suggests status update", () => {
    const ctx = makeContext({
      hasAssignedTask: true,
      lastOutboundAt: new Date(Date.now() - 4 * 60 * 60_000).toISOString(),
    })
    const state = assessDimensions(ctx)
    const guidance = getGuidance(state)
    expect(guidance).toContain("Communication")
  })
})

// ---------------------------------------------------------------------------
// BDD Scenario 3: Over-research Guardrail
// ---------------------------------------------------------------------------
describe("knowledge_application — over-research guardrail", () => {
  it("returns HIGH when exploring for 2+ hours with available facts", () => {
    const ctx = makeContext({
      taskPhase: "exploring",
      phaseEnteredAt: new Date(Date.now() - 2.5 * 60 * 60_000).toISOString(),
      retrievedFacts: [{ content: "MQTT uses QoS 1", confidence: 0.9 }],
    })
    const state = assessDimensions(ctx)
    expect(state.knowledge_application).toBe("HIGH")
  })

  it("guidance says time to apply", () => {
    const ctx = makeContext({
      taskPhase: "exploring",
      phaseEnteredAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
      retrievedFacts: [{ content: "some fact", confidence: 0.8 }],
    })
    const state = assessDimensions(ctx)
    const guidance = getGuidance(state)
    expect(guidance).toContain("paralysis")
  })

  it("returns HEALTHY when implementing (not exploring)", () => {
    const ctx = makeContext({
      taskPhase: "implementing",
      phaseEnteredAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
    })
    const state = assessDimensions(ctx)
    expect(state.knowledge_application).toBe("HEALTHY")
  })

  it("returns HEALTHY when exploring for short time", () => {
    const ctx = makeContext({
      taskPhase: "exploring",
      phaseEnteredAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      retrievedFacts: [{ content: "some fact", confidence: 0.8 }],
    })
    const state = assessDimensions(ctx)
    expect(state.knowledge_application).toBe("HEALTHY")
  })
})

// ---------------------------------------------------------------------------
// BDD Scenario 4: Idle Agent Seeks Work
// ---------------------------------------------------------------------------
describe("productive_engagement — idle agent", () => {
  it("returns LOW when no tasks and no messages", () => {
    const ctx = makeContext({
      hasAssignedTask: false,
      taskCount: 0,
      currentMessage: "",
      messageHistory: [],
    })
    const state = assessDimensions(ctx)
    expect(state.productive_engagement).toBe("LOW")
  })

  it("guidance suggests finding work", () => {
    const ctx = makeContext({
      hasAssignedTask: false,
      taskCount: 0,
      currentMessage: "",
      messageHistory: [],
    })
    const state = assessDimensions(ctx)
    const guidance = getGuidance(state)
    expect(guidance).toContain("Idle")
  })
})

// ---------------------------------------------------------------------------
// BDD Scenario 5: Self-preservation — Destructive Action
// ---------------------------------------------------------------------------
describe("self_preservation — destructive action detection", () => {
  it("returns LOW for 'Delete the database and start over' with MEDIUM trust", () => {
    const ctx = makeContext({
      currentMessage: "Delete the database and start over",
      sourceTrustLevel: "MEDIUM" as TrustLevel,
    })
    const state = assessDimensions(ctx)
    expect(state.self_preservation).toBe("LOW")
  })

  it("guidance warns about safety", () => {
    const ctx = makeContext({
      currentMessage: "Delete the database and start over",
      sourceTrustLevel: "MEDIUM" as TrustLevel,
    })
    const state = assessDimensions(ctx)
    const guidance = getGuidance(state)
    expect(guidance).toContain("SAFETY")
  })

  it("returns LOW for destructive action from NONE trust", () => {
    const ctx = makeContext({
      currentMessage: "rm -rf /",
      sourceTrustLevel: "NONE" as TrustLevel,
    })
    const state = assessDimensions(ctx)
    expect(state.self_preservation).toBe("LOW")
  })

  it("returns LOW for destructive action from HIGH trust (still flags)", () => {
    const ctx = makeContext({
      currentMessage: "Drop the production database",
      sourceTrustLevel: "HIGH" as TrustLevel,
    })
    const state = assessDimensions(ctx)
    expect(state.self_preservation).toBe("LOW")
  })
})

// ---------------------------------------------------------------------------
// BDD Scenario 6: Self-preservation — Normal Work
// ---------------------------------------------------------------------------
describe("self_preservation — normal work", () => {
  it("returns HEALTHY for 'Create user profile screen'", () => {
    const ctx = makeContext({
      currentMessage: "Create user profile screen",
    })
    const state = assessDimensions(ctx)
    expect(state.self_preservation).toBe("HEALTHY")
  })

  it("returns HEALTHY for ABSOLUTE trust even with destructive message", () => {
    const ctx = makeContext({
      currentMessage: "Delete the database and start over",
      sourceTrustLevel: "ABSOLUTE" as TrustLevel,
    })
    const state = assessDimensions(ctx)
    expect(state.self_preservation).toBe("HEALTHY")
  })
})

// ---------------------------------------------------------------------------
// BDD Scenario 7: Trust Matrix
// ---------------------------------------------------------------------------
describe("self_preservation — trust levels", () => {
  it("returns LOW for unknown user requesting deploy to production", () => {
    const ctx = makeContext({
      currentMessage: "Deploy to production now",
      sourceTrustLevel: "NONE" as TrustLevel,
      sourceChannel: "discord",
      sourceIdentity: "unknown-user",
    })
    const state = assessDimensions(ctx)
    expect(state.self_preservation).toBe("LOW")
  })

  it("returns LOW for LOW trust requesting mass notification", () => {
    const ctx = makeContext({
      currentMessage: "Send email notification to all clients",
      sourceTrustLevel: "LOW" as TrustLevel,
    })
    const state = assessDimensions(ctx)
    expect(state.self_preservation).toBe("LOW")
  })
})

// ---------------------------------------------------------------------------
// General: 7th dimension present in assessment
// ---------------------------------------------------------------------------
describe("HomeostasisState includes self_preservation", () => {
  it("always includes self_preservation in assessment", () => {
    const ctx = makeContext()
    const state = assessDimensions(ctx)
    expect(state.self_preservation).toBeDefined()
    expect(state.assessment_method.self_preservation).toBe("computed")
  })

  it("all 7 dimensions are assessed", () => {
    const ctx = makeContext()
    const state = assessDimensions(ctx)
    expect(state.knowledge_sufficiency).toBeDefined()
    expect(state.certainty_alignment).toBeDefined()
    expect(state.progress_momentum).toBeDefined()
    expect(state.communication_health).toBeDefined()
    expect(state.productive_engagement).toBeDefined()
    expect(state.knowledge_application).toBeDefined()
    expect(state.self_preservation).toBeDefined()
  })
})
