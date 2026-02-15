// @vitest-environment node
/**
 * Layer 3: Agent decision-making via tick().
 *
 * Tests the 4-stage pipeline: self-model -> homeostasis -> channel scan -> action.
 * Uses real Ollama for LLM calls, real DB for context assembly.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { userModel } from "./helpers/fixtures"
import {
  closeTestDb,
  ensureOllama,
  ensureTestDb,
} from "./helpers/setup"
import { type TestWorld, scenario } from "./helpers/test-world"

describe("Layer 3: Alina asks project status, agent decides to respond", () => {
  let world: TestWorld

  beforeEach(async () => {
    await ensureTestDb()
    await ensureOllama()

    // Fresh world per test — tick() mutates state (removes pending messages)
    world = await scenario("alina-asks-status")
      .withSession("umka")
      .withKnowledge(userModel("alina", {
        role: "PM / stakeholder",
        language: "prefers Russian for status updates",
        communication: "uses Discord for quick questions",
      }))
      .withAgentState({
        activeTask: {
          project: "umka",
          topic: "MQTT persistence",
          channel: "web",
        },
      })
      .withPendingMessage({
        from: "alina",
        channel: "discord",
        content: "Как дела? Что с проектом?",
        receivedAt: new Date(Date.now() - 5 * 60 * 60_000).toISOString(), // 5 hours ago → triggers LOW
      })
      .seed()
  }, 30_000)

  afterEach(async () => {
    if (world) await world.teardown()
  })

  afterAll(async () => {
    await closeTestDb()
  })

  it("tick detects pending message and assesses communication_health as LOW", async () => {
    const result = await world.tick("manual")
    expect(result.homeostasis.communication_health).toBe("LOW")
  }, 60_000)

  it("tick retrieves Alina's user model from knowledge store", async () => {
    const result = await world.tick("manual")
    const alinaFacts = result.retrievedFacts.filter(
      (f) => f.about?.entity === "alina",
    )
    expect(alinaFacts.length).toBeGreaterThan(0)
  }, 60_000)

  it("tick decides to respond, not ignore", async () => {
    const result = await world.tick("manual")
    expect(result.action).toBe("respond")
    expect(result.action_target).toMatchObject({
      channel: "discord",
      to: "alina",
    })
  }, 60_000)

  it("LLM produces response using assembled context", async () => {
    const result = await world.tick("manual")
    expect(result.response?.text).toBeTruthy()
  }, 60_000)

  it("includes self-model with available providers", async () => {
    const result = await world.tick("manual")
    expect(result.selfModel).toBeDefined()
    expect(result.selfModel.availableProviders).toContain("ollama")
  }, 60_000)
})

describe("Layer 3: No pending messages, agent stays idle", () => {
  let world: TestWorld

  beforeAll(async () => {
    await ensureTestDb()

    world = await scenario("working-no-messages")
      .withSession("umka")
      .withAgentState({
        activeTask: { project: "umka", topic: "MQTT" },
      })
      .withNoPendingMessages()
      .seed()
  }, 30_000)

  afterAll(async () => {
    if (world) await world.teardown()
    await closeTestDb()
  })

  it("tick with no pending messages stays idle", async () => {
    const result = await world.tick("manual")
    expect(result.action).toBe("idle")
    expect(result.pendingMessages).toHaveLength(0)
  })

  it("productive_engagement is HEALTHY when task is active", async () => {
    const result = await world.tick("manual")
    expect(result.homeostasis.productive_engagement).toBe("HEALTHY")
  })

  // --- RED (todo): self-model and powered-down ---

  it.todo("self-model reports available providers before LLM call")
  // Given: Ollama running, OpenRouter configured
  // When: tick runs stage 1 (self-model)
  // Then: selfModel.availableProviders includes both

  it.todo("powered-down mode produces template response when no LLM available")
  // Given: Ollama stopped, OpenRouter rate-limited
  // When: tick runs, reaches stage 4
  // Then: response is template-based, not LLM-generated
})
