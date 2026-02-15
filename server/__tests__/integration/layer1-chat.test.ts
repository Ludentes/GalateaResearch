// @vitest-environment node
import { ollama } from "ai-sdk-ollama"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  closeTestDb,
  ensureOllama,
  ensureTestDb,
} from "./helpers/setup"
import { type TestWorld, scenario } from "./helpers/test-world"
import { retrieveRelevantFacts } from "../../memory/fact-retrieval"

describe("Layer 1: Developer works on Umka MQTT persistence", () => {
  let world: TestWorld

  beforeAll(async () => {
    await ensureTestDb()
    await ensureOllama()

    world = await scenario("umka-mqtt-dev")
      .withSession("umka")
      .withPreprompts({
        identity: "You are Galatea, a developer agent working on IoT projects.",
        constraints: [
          "Use pnpm in all projects",
          "Never push directly to main",
        ],
      })
      .withKnowledgeFrom("data/memory/entries.jsonl")
      .withModel(ollama("glm-4.7-flash"))
      .seed()
  }, 30_000)

  afterAll(async () => {
    if (world) await world.teardown()
    await closeTestDb()
  })

  // --- GREEN: these verify working code ---

  it("stores the developer's message", async () => {
    await world.sendMessage(
      "The MQTT client in Umka needs to persist across hot reloads",
    )
    const msg = await world.lastMessage("user")
    expect(msg).toMatchObject({
      role: "user",
      content: expect.stringContaining("MQTT"),
    })
  })

  it("retrieves conversation history in order", async () => {
    const history = await world.getHistory()
    expect(history.length).toBeGreaterThan(0)
    expect(history[0].role).toBe("user")
  })

  it("assembles context with identity and constraints from preprompts", async () => {
    const ctx = await world.assembleContext()
    expect(ctx.systemPrompt).toContain("CONSTRAINTS")
    expect(ctx.systemPrompt).toContain("IDENTITY")
    expect(ctx.metadata.prepromptsLoaded).toBeGreaterThan(0)
  })

  it("detects knowledge gap when no relevant facts retrieved", async () => {
    const ctx = await world.assembleContext()
    expect(ctx.metadata.homeostasisGuidanceIncluded).toBe(true)
    expect(ctx.systemPrompt).toContain("SELF-REGULATION")
  })

  it("gets a response from the LLM with token counts", async () => {
    const response = await world.roundTrip(
      "The MQTT client in Umka needs to persist across hot reloads",
    )
    expect(response.text).toBeTruthy()
    expect(response.tokenCount).toBeGreaterThan(0)
  }, 120_000)

  it("stores assistant response in DB", async () => {
    const msg = await world.lastMessage("assistant")
    expect(msg.role).toBe("assistant")
    expect(msg.content).toBeTruthy()
  })

  // --- RED (todo): these assert missing behavior ---

  it("retrieves MQTT facts from knowledge store when message mentions MQTT", async () => {
    const result = await retrieveRelevantFacts(
      "The MQTT client in Umka needs to persist across hot reloads",
      world.storePath,
      { additionalEntities: ["umka"] },
    )
    expect(result.entries.length).toBeGreaterThan(0)
    const hasMqtt = result.entries.some((e) =>
      e.content.toLowerCase().includes("mqtt"),
    )
    expect(hasMqtt).toBe(true)
  }, 30_000)

  it("does NOT retrieve Alina's user model for developer chat", async () => {
    const result = await retrieveRelevantFacts(
      "The MQTT client in Umka needs to persist across hot reloads",
      world.storePath,
    )
    const alinaEntries = result.entries.filter(
      (e) => e.about?.entity === "alina",
    )
    expect(alinaEntries).toHaveLength(0)
  }, 30_000)

  it("emits OTEL event after response delivered", async () => {
    // roundTrip() already ran in earlier test — events should exist
    const events = await world.readObservationEvents()
    const chatEvents = events.filter(
      (e) => e.attributes?.["event.name"] === "chat.response_delivered",
    )
    expect(chatEvents.length).toBeGreaterThan(0)
    expect(chatEvents[0].source).toBe("galatea-api")
  })

  it("runs signal classification on the user's message in real-time", async () => {
    const response = await world.roundTrip("I prefer using pnpm over npm for all projects")
    expect(response.signalClassification).toBeDefined()
    expect(response.signalClassification?.type).toBe("preference")
  }, 120_000)
})
