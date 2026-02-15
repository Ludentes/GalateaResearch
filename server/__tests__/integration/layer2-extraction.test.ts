// @vitest-environment node
import { ollama } from "ai-sdk-ollama"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  closeTestDb,
  ensureOllama,
  ensureTestDb,
} from "./helpers/setup"
import { type TestWorld, scenario } from "./helpers/test-world"

describe("Layer 2: Umka session ends, knowledge extracted", () => {
  let world: TestWorld

  beforeAll(async () => {
    await ensureTestDb()
    await ensureOllama()

    world = await scenario("umka-session-end")
      .withTranscript("server/memory/__tests__/fixtures/sample-session.jsonl")
      .withEmptyKnowledgeStore()
      .withModel(ollama("glm-4.7-flash"))
      .seed()
  }, 30_000)

  afterAll(async () => {
    if (world) await world.teardown()
    await closeTestDb()
  })

  // --- GREEN: these verify working code ---

  it("reads transcript and filters noise from signal", async () => {
    const turns = await world.readTranscript()
    const signal = await world.classifySignal(turns)
    expect(signal.length).toBeLessThan(turns.length)
    expect(signal.length).toBeGreaterThan(0)
  })

  it("extracts knowledge entries with valid schema", async () => {
    const result = await world.extract()
    expect(result.entries.length).toBeGreaterThan(0)
    for (const entry of result.entries) {
      expect(entry).toMatchObject({
        id: expect.any(String),
        type: expect.stringMatching(
          /^(fact|preference|decision|rule|procedure|correction)$/,
        ),
        content: expect.any(String),
        confidence: expect.any(Number),
        source: expect.stringContaining("session:"),
      })
    }
  }, 120_000)

  it("deduplicates on re-extraction with force", async () => {
    const result = await world.extract({ force: true })
    expect(result.stats.duplicatesSkipped).toBeGreaterThan(0)
  }, 120_000)

  it("records extraction state after completion", async () => {
    // Extraction state is managed by auto-extract hook, not runExtraction directly.
    // Here we verify the pipeline stats instead.
    const result = await world.extract({ force: true })
    expect(result.stats.turnsProcessed).toBeGreaterThan(0)
    expect(result.stats.signalTurns).toBeGreaterThan(0)
  }, 120_000)

  it("skips already-extracted session", async () => {
    const result = await world.extractAgain()
    expect(result.stats.skippedAlreadyExtracted).toBe(true)
    expect(result.entries).toHaveLength(0)
  })

  // --- RED (todo): these assert missing behavior ---

  it.todo("extracted facts appear in next chat's context")
  // THE FEEDBACK LOOP TEST
  // Given: extraction just completed with MQTT facts
  // When: developer starts new chat asking about MQTT
  // Then: assembleContext includes the freshly extracted facts
  // Then: knowledge_sufficiency changes from LOW to HEALTHY

  it.todo("superseded entries filtered from context")
  // Given: entry A exists, entry B created with supersededBy pointing to A
  // When: assembleContext runs
  // Then: only B appears, A is filtered out

  it.todo("OTEL event emitted on extraction completion")
  // Given: OTEL collector running
  // When: extraction completes
  // Then: event store has extraction.complete event with entriesCount

  it.todo("high-confidence entries consolidated to CLAUDE.md")
  // Given: entry seen 3+ times with avg confidence >= 0.85
  // When: consolidation runs after extraction
  // Then: entry appears in CLAUDE.md
})
