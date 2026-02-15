// @vitest-environment node
import { existsSync, rmSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { appendEntries, readEntries } from "../knowledge-store"
import { runDecay } from "../decay"
import type { KnowledgeEntry } from "../types"

const TEST_STORE = path.join(__dirname, "fixtures", "test-decay.jsonl")

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: `test-${Math.random().toString(36).slice(2)}`,
    type: "fact",
    content: "Test entry",
    confidence: 0.8,
    entities: [],
    source: "test",
    extractedAt: new Date(Date.now() - 60 * 86400_000).toISOString(), // 60 days ago
    ...overrides,
  }
}

describe("Memory Decay", () => {
  afterEach(() => {
    if (existsSync(TEST_STORE)) rmSync(TEST_STORE)
  })

  it("decays old unretrieved entries", async () => {
    const entry = makeEntry({
      extractedAt: new Date(Date.now() - 35 * 86400_000).toISOString(), // 35 days ago (5 past grace)
    })
    await appendEntries([entry], TEST_STORE)

    const result = await runDecay(TEST_STORE)
    expect(result.decayed).toBe(1)

    const entries = await readEntries(TEST_STORE)
    expect(entries[0].confidence).toBeLessThan(0.8)
    expect(entries[0].confidence).toBeGreaterThan(0.3) // not archived
  })

  it("does not decay entries within grace period", async () => {
    const entry = makeEntry({
      extractedAt: new Date(Date.now() - 5 * 86400_000).toISOString(), // 5 days ago
    })
    await appendEntries([entry], TEST_STORE)

    const result = await runDecay(TEST_STORE)
    expect(result.decayed).toBe(0)
  })

  it("does not decay recently retrieved entries", async () => {
    const entry = makeEntry({
      lastRetrievedAt: new Date(Date.now() - 86400_000).toISOString(), // 1 day ago
    })
    await appendEntries([entry], TEST_STORE)

    const result = await runDecay(TEST_STORE)
    expect(result.decayed).toBe(0)
  })

  it("exempts rule entries from decay", async () => {
    const entry = makeEntry({ type: "rule" })
    await appendEntries([entry], TEST_STORE)

    const result = await runDecay(TEST_STORE)
    expect(result.decayed).toBe(0)
  })

  it("archives entries below threshold", async () => {
    const entry = makeEntry({ confidence: 0.31 })
    await appendEntries([entry], TEST_STORE)

    const result = await runDecay(TEST_STORE)
    const entries = await readEntries(TEST_STORE)
    expect(entries[0].archivedAt).toBeDefined()
    expect(result.archived).toBe(1)
  })

  it("skips superseded entries", async () => {
    const entry = makeEntry({ supersededBy: "other-id" })
    await appendEntries([entry], TEST_STORE)

    const result = await runDecay(TEST_STORE)
    expect(result.decayed).toBe(0)
    expect(result.archived).toBe(0)
  })
})
