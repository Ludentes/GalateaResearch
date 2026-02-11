// @vitest-environment node
import { existsSync, rmSync } from "node:fs"
import path from "node:path"
import type { LanguageModel } from "ai"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../knowledge-extractor", () => ({
  extractKnowledge: vi.fn().mockResolvedValue([
    {
      id: "extracted-1",
      type: "preference",
      content: "User prefers pnpm",
      confidence: 0.95,
      entities: ["pnpm"],
      evidence: "User said: I prefer pnpm",
      source: "session:sample-session",
      extractedAt: "2026-02-11T10:00:00Z",
    },
  ]),
}))

import { runExtraction } from "../extraction-pipeline"
import { readEntries } from "../knowledge-store"

const TEST_DIR = path.join(__dirname, "fixtures", "test-pipeline")
const FIXTURE = path.join(__dirname, "fixtures", "sample-session.jsonl")
const MOCK_MODEL = {} as unknown as LanguageModel

describe("Extraction Pipeline", () => {
  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  it("runs full pipeline and returns stats", async () => {
    const storePath = path.join(TEST_DIR, "entries.jsonl")
    const result = await runExtraction({
      transcriptPath: FIXTURE,
      model: MOCK_MODEL,
      storePath,
    })

    expect(result.stats.turnsProcessed).toBeGreaterThan(0)
    expect(result.stats.signalTurns).toBeGreaterThan(0)
    expect(result.stats.noiseTurns).toBeGreaterThan(0)
    expect(result.stats.entriesExtracted).toBeGreaterThan(0)
  })

  it("writes entries to JSONL store", async () => {
    const storePath = path.join(TEST_DIR, "entries.jsonl")
    await runExtraction({
      transcriptPath: FIXTURE,
      model: MOCK_MODEL,
      storePath,
    })

    const entries = await readEntries(storePath)
    expect(entries.length).toBeGreaterThan(0)
  })

  it("skips already-extracted session", async () => {
    const storePath = path.join(TEST_DIR, "entries.jsonl")

    await runExtraction({
      transcriptPath: FIXTURE,
      model: MOCK_MODEL,
      storePath,
    })
    const result2 = await runExtraction({
      transcriptPath: FIXTURE,
      model: MOCK_MODEL,
      storePath,
    })

    expect(result2.stats.skippedAlreadyExtracted).toBe(true)
    expect(result2.entries).toHaveLength(0)
  })

  it("re-extracts with force flag", async () => {
    const storePath = path.join(TEST_DIR, "entries.jsonl")

    await runExtraction({
      transcriptPath: FIXTURE,
      model: MOCK_MODEL,
      storePath,
    })
    const result2 = await runExtraction({
      transcriptPath: FIXTURE,
      model: MOCK_MODEL,
      storePath,
      force: true,
    })

    expect(result2.stats.skippedAlreadyExtracted).toBeUndefined()
    expect(result2.stats.duplicatesSkipped).toBeGreaterThan(0)
    expect(result2.entries).toHaveLength(0) // all dupes
  })

  it("renders knowledge.md alongside entries.jsonl", async () => {
    const storePath = path.join(TEST_DIR, "entries.jsonl")
    const mdPath = path.join(TEST_DIR, "knowledge.md")

    await runExtraction({
      transcriptPath: FIXTURE,
      model: MOCK_MODEL,
      storePath,
      mdPath,
    })

    expect(existsSync(mdPath)).toBe(true)
  })
})
