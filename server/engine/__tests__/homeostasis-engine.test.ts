// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import type { AgentContext, HomeostasisState } from "../types"
import { assessDimensions, clearCache, getGuidance, loadGuidanceText } from "../homeostasis-engine"

const baseContext: AgentContext = {
  sessionId: "test-session",
  currentMessage: "How should I set up authentication?",
  messageHistory: [
    { role: "user", content: "How should I set up authentication?" },
  ],
}

describe("Homeostasis Engine", () => {
  beforeEach(() => clearCache())

  describe("assessDimensions", () => {
    it("returns all 6 dimensions", () => {
      const state = assessDimensions(baseContext)
      expect(Object.keys(state)).toContain("knowledge_sufficiency")
      expect(Object.keys(state)).toContain("certainty_alignment")
      expect(Object.keys(state)).toContain("progress_momentum")
      expect(Object.keys(state)).toContain("communication_health")
      expect(Object.keys(state)).toContain("productive_engagement")
      expect(Object.keys(state)).toContain("knowledge_application")
    })

    it("defaults unmeasurable dimensions to HEALTHY", () => {
      const state = assessDimensions(baseContext)
      expect(state.certainty_alignment).toBe("HEALTHY")
      expect(state.knowledge_application).toBe("HEALTHY")
    })

    it("detects LOW knowledge_sufficiency when no relevant facts", () => {
      const ctx: AgentContext = {
        ...baseContext,
        retrievedFacts: [],
      }
      const state = assessDimensions(ctx)
      expect(state.knowledge_sufficiency).toBe("LOW")
    })

    it("detects HEALTHY knowledge_sufficiency with relevant facts", () => {
      const ctx: AgentContext = {
        ...baseContext,
        currentMessage: "How should I set up authentication for mobile?",
        retrievedFacts: [
          { content: "Use Clerk for mobile authentication setup", confidence: 0.95 },
          { content: "Authentication with JWT has refresh issues on mobile", confidence: 0.85 },
        ],
      }
      const state = assessDimensions(ctx)
      expect(state.knowledge_sufficiency).toBe("HEALTHY")
    })

    it("detects LOW productive_engagement when no task", () => {
      const ctx: AgentContext = {
        ...baseContext,
        hasAssignedTask: false,
        messageHistory: [],
        currentMessage: "",
      }
      const state = assessDimensions(ctx)
      expect(state.productive_engagement).toBe("LOW")
    })

    it("detects HEALTHY communication_health for active session", () => {
      const ctx: AgentContext = {
        ...baseContext,
        lastMessageTime: new Date(),
      }
      const state = assessDimensions(ctx)
      expect(state.communication_health).toBe("HEALTHY")
    })

    it("detects LOW progress_momentum when stuck (repeated messages)", () => {
      const ctx: AgentContext = {
        ...baseContext,
        messageHistory: [
          { role: "user", content: "How do I fix this?" },
          { role: "assistant", content: "Try X" },
          { role: "user", content: "Still broken, how do I fix this?" },
          { role: "assistant", content: "Try Y" },
          { role: "user", content: "That didn't work either, how do I fix this?" },
        ],
      }
      const state = assessDimensions(ctx)
      expect(state.progress_momentum).toBe("LOW")
    })
  })

  describe("loadGuidanceText", () => {
    it("loads guidance YAML", () => {
      const guidance = loadGuidanceText()
      expect(guidance.knowledge_sufficiency).toBeDefined()
      expect(guidance.knowledge_sufficiency.LOW.primary).toContain("Knowledge gap")
    })
  })

  describe("getGuidance", () => {
    it("returns empty string when all HEALTHY", () => {
      const state: HomeostasisState = {
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
      }
      const guidance = getGuidance(state)
      expect(guidance).toBe("")
    })

    it("returns guidance for imbalanced dimensions", () => {
      const state: HomeostasisState = {
        knowledge_sufficiency: "LOW",
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
      }
      const guidance = getGuidance(state)
      expect(guidance).toContain("Knowledge gap")
    })

    it("prioritizes higher-priority guidance first", () => {
      const state: HomeostasisState = {
        knowledge_sufficiency: "LOW",  // priority 1
        certainty_alignment: "HEALTHY",
        progress_momentum: "LOW",      // priority 2
        communication_health: "LOW",   // priority 3
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
      }
      const guidance = getGuidance(state)
      const knowledgeIdx = guidance.indexOf("Knowledge gap")
      const stuckIdx = guidance.indexOf("Stuck detected")
      expect(knowledgeIdx).toBeLessThan(stuckIdx)
    })
  })
})
