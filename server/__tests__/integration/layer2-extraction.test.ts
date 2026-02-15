// @vitest-environment node
import { ollama } from "ai-sdk-ollama"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  closeTestDb,
  ensureOllama,
  ensureTestDb,
} from "./helpers/setup"
import { type TestWorld, scenario } from "./helpers/test-world"
import { readEntries, supersedeEntry } from "../../memory/knowledge-store"
import { assembleContext } from "../../memory/context-assembler"

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

  it("extracted facts appear in next chat's context", async () => {
    const entries = await readEntries(world.storePath)
    expect(entries.length).toBeGreaterThan(0)

    const ctx = await assembleContext({ storePath: world.storePath })
    expect(ctx.systemPrompt).toContain("LEARNED KNOWLEDGE")
  }, 30_000)

  it("superseded entries filtered from context", async () => {
    const entries = await readEntries(world.storePath)
    expect(entries.length).toBeGreaterThanOrEqual(2)

    const target = entries[0]
    const replacement = entries[1]
    await supersedeEntry(target.id, replacement.id, world.storePath)

    const ctx = await assembleContext({ storePath: world.storePath })
    // The superseded entry's content should not appear in the system prompt
    expect(ctx.systemPrompt).not.toContain(target.content)
  }, 30_000)

  it("OTEL event emitted on extraction completion", async () => {
    // extract() already ran in earlier tests — events should exist
    const events = await world.readObservationEvents()
    const extractEvents = events.filter(
      (e) => e.attributes?.["event.name"] === "extraction.complete",
    )
    expect(extractEvents.length).toBeGreaterThan(0)
    expect(extractEvents[0].source).toBe("galatea-api")
    expect(extractEvents[0].attributes["entries.count"]).toBeDefined()
  })

  it.todo("high-confidence entries consolidated to CLAUDE.md")
  // Given: entry seen 3+ times with avg confidence >= 0.85
  // When: consolidation runs after extraction
  // Then: entry appears in CLAUDE.md
})
