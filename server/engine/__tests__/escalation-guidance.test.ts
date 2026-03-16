// @vitest-environment node
import { describe, expect, it } from "vitest"
import { assessDimensions, getGuidance } from "../homeostasis-engine"
import type { AgentContext } from "../types"

describe("escalation-aware guidance", () => {
  it("gives wait guidance when progress LOW and escalation pending", () => {
    const ctx: AgentContext = {
      sessionId: "test-esc",
      currentMessage: "check status",
      messageHistory: [
        { role: "user", content: "check status" },
        { role: "user", content: "check status" },
        { role: "user", content: "check status" },
      ],
      retrievedFacts: [],
      hasAssignedTask: true,
      pendingEscalation: {
        category: "knowledge_gap",
        escalatedAt: new Date().toISOString(),
      },
    }

    const state = assessDimensions(ctx)
    expect(state.progress_momentum).toBe("LOW")

    const guidance = getGuidance(state, ctx)
    expect(guidance.toLowerCase()).toContain("escalation pending")
  })

  it("gives normal guidance when progress LOW without escalation", () => {
    const ctx: AgentContext = {
      sessionId: "test-no-esc",
      currentMessage: "check status",
      messageHistory: [
        { role: "user", content: "check status" },
        { role: "user", content: "check status" },
        { role: "user", content: "check status" },
      ],
      retrievedFacts: [],
      hasAssignedTask: true,
    }

    const state = assessDimensions(ctx)
    const guidance = getGuidance(state, ctx)
    expect(guidance.toLowerCase()).not.toContain("escalation pending")
  })
})
