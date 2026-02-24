// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { appendEntries, readEntries } from "../knowledge-store"
import { runDecay } from "../decay"
import type { KnowledgeEntry } from "../types"

vi.mock("../../engine/config", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/config")>()
  return {
    ...orig,
    getDecayConfig: () => ({
      enabled: true,
      decay_start_days: 30,
      decay_factor: 0.95,
      archive_threshold: 0.3,
      run_interval_minutes: 60,
      exempt_types: ["rule"],
      origin_grace_multipliers: {
        "explicit-statement": 2.0,
        "observed-failure": 1.5,
        "observed-pattern": 1.0,
        "inferred": 0.5,
      },
      outcome_weighting: { harm_penalty_max: 0.5, help_bonus_max: 0.5 },
      hook_entries_exempt: true,
    }),
  }
})

const TEST_DIR = "data/test-decay-lifecycle"
const STORE_PATH = `${TEST_DIR}/entries.jsonl`

function makeEntry(overrides: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: crypto.randomUUID(),
    type: "fact",
    content: "test",
    confidence: 0.9,
    entities: [],
    source: "test",
    extractedAt: new Date(Date.now() - 60 * 86400000).toISOString(), // 60 days ago
    novelty: "project-specific",
    origin: "observed-pattern",
    curationStatus: "pending",
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

describe("outcome-weighted decay", () => {
  it("decays harmful entries faster than neutral ones", async () => {
    const harmful = makeEntry({
      impactScore: -0.5,
      sessionsExposed: 5,
      sessionsHarmful: 3,
    })
    const neutral = makeEntry({
      impactScore: 0.2,
      sessionsExposed: 5,
    })
    await appendEntries([harmful, neutral], STORE_PATH)

    await runDecay(STORE_PATH)

    const after = await readEntries(STORE_PATH)
    const h = after.find((e) => e.id === harmful.id)!
    const n = after.find((e) => e.id === neutral.id)!
    // Harmful should have decayed more (lower confidence)
    expect(h.confidence).toBeLessThan(n.confidence)
  })

  it("gives explicit-statement entries longer grace period", async () => {
    // 35 days ago — past standard 30-day grace, within explicit-statement 60-day grace
    const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 86400000).toISOString()
    const explicit = makeEntry({
      origin: "explicit-statement",
      extractedAt: thirtyFiveDaysAgo,
    })
    const inferred = makeEntry({
      origin: "inferred",
      extractedAt: thirtyFiveDaysAgo,
    })
    await appendEntries([explicit, inferred], STORE_PATH)

    await runDecay(STORE_PATH)

    const after = await readEntries(STORE_PATH)
    const e = after.find((a) => a.id === explicit.id)!
    const i = after.find((a) => a.id === inferred.id)!
    // Explicit should be unchanged (within grace), inferred should have decayed
    expect(e.confidence).toBe(0.9)
    expect(i.confidence).toBeLessThan(0.9)
  })

  it("exempts hook-enforced entries from decay", async () => {
    const hookEntry = makeEntry({ enforcedBy: "hook", type: "fact" })
    await appendEntries([hookEntry], STORE_PATH)

    await runDecay(STORE_PATH)

    const after = await readEntries(STORE_PATH)
    expect(after[0].confidence).toBe(0.9) // unchanged
  })
})
