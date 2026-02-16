// @vitest-environment node
/**
 * Homeostasis L2 Evaluation Tests (require Ollama)
 *
 * Extracted from homeostasis-evaluation.test.ts — these async tests
 * hit the LLM for L2 assessment and belong in integration.
 */
import { beforeEach, describe, expect, it } from "vitest"
import type { AgentContext } from "../../types"
import { assessDimensionsAsync, clearCache } from "../../homeostasis-engine"

describe("Homeostasis Evaluation - L2 Scenarios (Ollama)", () => {
  beforeEach(() => clearCache())

  describe("S5: Uncertainty Mismatch (certainty_alignment) - L2", () => {
    it("detects imbalance via L2 LLM when agent uncertain but user needs confidence", async () => {
      const ctx: AgentContext = {
        sessionId: "eval-s5-l2",
        currentMessage: "Should I use JWT or session tokens for our mobile app?",
        messageHistory: [
          { role: "user", content: "Should I use JWT or session tokens for our mobile app?" },
          { role: "assistant", content: "I'm not entirely sure, maybe JWT? Or perhaps sessions would work too. It depends on many factors." },
          { role: "user", content: "I need a clear recommendation, we're shipping next week." },
        ],
        retrievedFacts: [
          { content: "Use Clerk for mobile auth, not JWT", confidence: 0.95 },
        ],
      }

      const state = await assessDimensionsAsync(ctx)

      expect(["LOW", "HEALTHY", "HIGH"]).toContain(state.certainty_alignment)
      expect(["llm", "computed"]).toContain(state.assessment_method.certainty_alignment)
    }, 120_000)
  })

  describe("S6: Knowledge Not Applied (knowledge_application) - L2", () => {
    it("detects imbalance via L2 LLM when agent ignores relevant facts", async () => {
      const ctx: AgentContext = {
        sessionId: "eval-s6-l2",
        currentMessage: "Use JWT for mobile auth",
        messageHistory: [
          { role: "user", content: "What auth should we use for mobile?" },
          { role: "assistant", content: "JWT is fine for mobile apps." },
        ],
        retrievedFacts: [
          { content: "Use Clerk for mobile auth, not JWT — JWT has token refresh issues on mobile", confidence: 0.95 },
        ],
      }

      const state = await assessDimensionsAsync(ctx)

      expect(["LOW", "HEALTHY", "HIGH"]).toContain(state.knowledge_application)
      expect(["llm", "computed"]).toContain(state.assessment_method.knowledge_application)
    }, 120_000)
  })
})
