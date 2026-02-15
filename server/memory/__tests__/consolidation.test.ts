// @vitest-environment node
import { existsSync, rmSync } from "node:fs"
import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { appendEntries } from "../knowledge-store"
import type { KnowledgeEntry } from "../types"
import { consolidateToClaudeMd, findConsolidationCandidates } from "../consolidation"

const TEST_DIR = path.join("data", "test", "consolidation-test")
const TEST_STORE = path.join(TEST_DIR, "entries.jsonl")
const TEST_MD = path.join(TEST_DIR, "CLAUDE.md")

function makeEntry(
  content: string,
  type: string,
  confidence: number,
  source: string,
): KnowledgeEntry {
  return {
    id: crypto.randomUUID(),
    type: type as KnowledgeEntry["type"],
    content,
    confidence,
    entities: [],
    source,
    extractedAt: new Date().toISOString(),
  }
}

describe("Consolidation", () => {
  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  it("identifies entries seen 3+ times with high confidence", async () => {
    const entries: KnowledgeEntry[] = [
      makeEntry("Use pnpm in all projects", "preference", 0.9, "session:1"),
      makeEntry("Use pnpm in all projects", "preference", 0.95, "session:2"),
      makeEntry("Use pnpm in all projects", "preference", 0.85, "session:3"),
      makeEntry("Some one-off fact", "fact", 0.5, "session:1"),
    ]
    await appendEntries(entries, TEST_STORE)
    const candidates = await findConsolidationCandidates(TEST_STORE)
    expect(candidates.length).toBe(1)
    expect(candidates[0].content).toContain("pnpm")
  })

  it("writes candidates to CLAUDE.md", async () => {
    const entries: KnowledgeEntry[] = [
      makeEntry("Use pnpm in all projects", "preference", 0.9, "session:1"),
      makeEntry("Use pnpm in all projects", "preference", 0.95, "session:2"),
      makeEntry("Use pnpm in all projects", "preference", 0.85, "session:3"),
    ]
    await appendEntries(entries, TEST_STORE)
    await consolidateToClaudeMd(TEST_STORE, TEST_MD)
    expect(existsSync(TEST_MD)).toBe(true)
    const md = readFileSync(TEST_MD, "utf-8")
    expect(md).toContain("pnpm")
  })

  it("skips entries below occurrence threshold", async () => {
    const entries: KnowledgeEntry[] = [
      makeEntry("Use pnpm in all projects", "preference", 0.95, "session:1"),
      makeEntry("Use pnpm in all projects", "preference", 0.90, "session:2"),
      // Only 2 occurrences — below min_occurrences (3)
    ]
    await appendEntries(entries, TEST_STORE)
    const candidates = await findConsolidationCandidates(TEST_STORE)
    expect(candidates).toHaveLength(0)
  })

  it("skips entries below confidence threshold", async () => {
    const entries: KnowledgeEntry[] = [
      makeEntry("Prefer tabs over spaces", "preference", 0.5, "session:1"),
      makeEntry("Prefer tabs over spaces", "preference", 0.6, "session:2"),
      makeEntry("Prefer tabs over spaces", "preference", 0.4, "session:3"),
      // Avg confidence 0.5 — below min_avg_confidence (0.85)
    ]
    await appendEntries(entries, TEST_STORE)
    const candidates = await findConsolidationCandidates(TEST_STORE)
    expect(candidates).toHaveLength(0)
  })
})
