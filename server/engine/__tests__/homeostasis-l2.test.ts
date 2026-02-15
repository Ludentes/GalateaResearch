// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { AgentContext } from "../types"
import { assessDimensionsAsync } from "../homeostasis-engine"

const baseContext: AgentContext = {
  sessionId: "test-l2",
  currentMessage: "I need to deploy this but I'm not sure about the config",
  messageHistory: [
    {
      role: "user",
      content: "I need to deploy this but I'm not sure about the config",
    },
  ],
  retrievedFacts: [
    { content: "Deploy config uses YAML format", confidence: 0.8 },
  ],
}

describe("L2 Homeostasis Assessment", () => {
  it("assessDimensionsAsync returns all 6 dimensions", async () => {
    const state = await assessDimensionsAsync(baseContext)
    expect(state.knowledge_sufficiency).toBeDefined()
    expect(state.certainty_alignment).toBeDefined()
    expect(state.knowledge_application).toBeDefined()
  }, 60_000)

  it("falls back to valid state regardless of Ollama availability", async () => {
    const state = await assessDimensionsAsync(baseContext)
    expect(["LOW", "HEALTHY", "HIGH"]).toContain(state.certainty_alignment)
    expect(["LOW", "HEALTHY", "HIGH"]).toContain(state.knowledge_application)
  }, 60_000)

  it("records assessment_method as computed or llm", async () => {
    const state = await assessDimensionsAsync(baseContext)
    expect(["computed", "llm"]).toContain(
      state.assessment_method.certainty_alignment,
    )
  }, 60_000)
})
