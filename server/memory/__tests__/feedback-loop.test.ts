// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { appendEntries, readEntries } from "../knowledge-store"
import { recordOutcome } from "../feedback-loop"
import type { KnowledgeEntry } from "../types"

vi.mock("../../engine/config", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/config")>()
  return {
    ...orig,
    getFeedbackConfig: () => ({
      min_sessions_for_impact: 3,
      auto_demote_threshold: -0.3,
      confidence_boost_threshold: 0.7,
      confidence_boost_amount: 0.05,
      regen_debounce_minutes: 60,
    }),
  }
})

const TEST_DIR = "data/test-feedback"
const STORE_PATH = `${TEST_DIR}/entries.jsonl`

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: crypto.randomUUID(),
    type: "fact",
    content: "test",
    confidence: 0.9,
    entities: [],
    source: "test",
    extractedAt: new Date().toISOString(),
    novelty: "project-specific",
    origin: "observed-pattern",
    curationStatus: "approved",
    sessionsExposed: 0,
    sessionsHelpful: 0,
    sessionsHarmful: 0,
    ...overrides,
  }
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true })
  writeFileSync(STORE_PATH, "")
})

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
})

describe("recordOutcome", () => {
  it("increments sessionsExposed and sessionsHelpful on success", async () => {
    const entry = makeEntry({ sessionsExposed: 2, sessionsHelpful: 1 })
    await appendEntries([entry], STORE_PATH)

    await recordOutcome(
      { status: "completed", text: "", transcript: [], durationMs: 1000 },
      [entry.id],
      STORE_PATH,
    )

    const after = await readEntries(STORE_PATH)
    expect(after[0].sessionsExposed).toBe(3)
    expect(after[0].sessionsHelpful).toBe(2)
  })

  it("computes impactScore when sessionsExposed reaches threshold", async () => {
    const entry = makeEntry({ sessionsExposed: 2, sessionsHelpful: 2 })
    await appendEntries([entry], STORE_PATH)

    await recordOutcome(
      { status: "completed", text: "", transcript: [], durationMs: 1000 },
      [entry.id],
      STORE_PATH,
    )

    const after = await readEntries(STORE_PATH)
    expect(after[0].impactScore).toBeDefined()
    expect(after[0].impactScore).toBe(1.0) // 3 helpful / 3 exposed
  })

  it("does not update entries not in exposedEntryIds", async () => {
    const exposed = makeEntry()
    const notExposed = makeEntry()
    await appendEntries([exposed, notExposed], STORE_PATH)

    await recordOutcome(
      { status: "completed", text: "", transcript: [], durationMs: 1000 },
      [exposed.id],
      STORE_PATH,
    )

    const after = await readEntries(STORE_PATH)
    const ne = after.find((e) => e.id === notExposed.id)!
    expect(ne.sessionsExposed).toBe(0)
  })

  it("treats timeout and budget_exceeded as neutral", async () => {
    const entry = makeEntry()
    await appendEntries([entry], STORE_PATH)

    await recordOutcome(
      { status: "timeout", text: "", transcript: [], durationMs: 1000 },
      [entry.id],
      STORE_PATH,
    )

    const after = await readEntries(STORE_PATH)
    expect(after[0].sessionsExposed).toBe(1)
    expect(after[0].sessionsHelpful).toBe(0)
    expect(after[0].sessionsHarmful).toBe(0)
  })

  it("increments sessionsHarmful on failure", async () => {
    const entry = makeEntry()
    await appendEntries([entry], STORE_PATH)

    await recordOutcome(
      { status: "failed", text: "error", transcript: [], durationMs: 1000 },
      [entry.id],
      STORE_PATH,
    )

    const after = await readEntries(STORE_PATH)
    expect(after[0].sessionsHarmful).toBe(1)
  })
})
