// @vitest-environment node
import { existsSync, rmSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  appendEntries,
  appendEntry,
  cosineSimilarity,
  deduplicateEntries,
  isDuplicate,
  normalizedJaccard,
  readEntries,
  renderMarkdown,
} from "../knowledge-store"
import type { KnowledgeEntry } from "../types"

const TEST_DIR = path.join(__dirname, "fixtures", "test-store")
const TEST_STORE = path.join(TEST_DIR, "entries.jsonl")
const TEST_MD = path.join(TEST_DIR, "knowledge.md")

const sampleEntry: KnowledgeEntry = {
  id: "test-1",
  type: "preference",
  content: "User prefers pnpm over npm",
  confidence: 0.95,
  entities: ["pnpm", "npm"],
  evidence: "User said: always use pnpm",
  source: "session:abc123",
  extractedAt: "2026-02-11T10:00:00Z",
}

describe("Knowledge Store", () => {
  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  it("readEntries returns empty array for non-existent file", async () => {
    const entries = await readEntries(TEST_STORE)
    expect(entries).toEqual([])
  })

  it("appendEntry creates file and writes entry", async () => {
    await appendEntry(sampleEntry, TEST_STORE)
    const entries = await readEntries(TEST_STORE)
    expect(entries).toHaveLength(1)
    expect(entries[0].content).toBe("User prefers pnpm over npm")
  })

  it("appendEntries writes multiple entries", async () => {
    const entry2: KnowledgeEntry = {
      ...sampleEntry,
      id: "test-2",
      type: "fact",
      content: "Project uses PostgreSQL",
      entities: ["PostgreSQL"],
    }
    await appendEntries([sampleEntry, entry2], TEST_STORE)
    const entries = await readEntries(TEST_STORE)
    expect(entries).toHaveLength(2)
  })

  it("isDuplicate detects similar content", () => {
    const candidate: KnowledgeEntry = {
      ...sampleEntry,
      id: "test-new",
      content: "User prefers pnpm instead of npm",
    }
    expect(isDuplicate(candidate, [sampleEntry])).toBe(true)
  })

  it("isDuplicate allows different topics", () => {
    const candidate: KnowledgeEntry = {
      ...sampleEntry,
      id: "test-new",
      content: "PostgreSQL runs on port 5432",
      entities: ["PostgreSQL"],
    }
    expect(isDuplicate(candidate, [sampleEntry])).toBe(false)
  })

  it("isDuplicate catches LLM-rephrased content via evidence overlap", () => {
    const run1: KnowledgeEntry = {
      id: "run1-tech",
      type: "fact",
      content: "The tech stack is Payload CMS 3.0, Electron, with i18n support",
      confidence: 0.9,
      entities: ["Payload CMS", "Electron"],
      evidence: "User said: we use Payload CMS 3.0 with Electron and i18n",
      source: "session:abc",
      extractedAt: "2026-02-11T10:00:00Z",
    }
    const run2: KnowledgeEntry = {
      id: "run2-tech",
      type: "preference", // LLM classified differently
      content:
        "The technology stack includes Payload CMS 3.0, Electron, i18n support and more features",
      confidence: 0.85,
      entities: [], // LLM missed entities on re-run
      evidence: "User said: we use Payload CMS 3.0 with Electron and i18n",
      source: "session:abc",
      extractedAt: "2026-02-11T11:00:00Z",
    }
    // Path 1: evidence overlap high + content overlap moderate
    expect(isDuplicate(run2, [run1])).toBe(true)
  })

  it("isDuplicate does not merge different facts from same user message", () => {
    const fact1: KnowledgeEntry = {
      id: "fact-1",
      type: "fact",
      content: "PostgreSQL is the primary database for the project",
      confidence: 0.9,
      entities: ["PostgreSQL"],
      evidence: "User said: we use PostgreSQL and Redis for different things",
      source: "session:abc",
      extractedAt: "2026-02-11T10:00:00Z",
    }
    const fact2: KnowledgeEntry = {
      id: "fact-2",
      type: "fact",
      content: "Redis is used for caching and session storage",
      confidence: 0.9,
      entities: ["Redis"],
      evidence: "User said: we use PostgreSQL and Redis for different things",
      source: "session:abc",
      extractedAt: "2026-02-11T10:00:00Z",
    }
    // Same evidence but different content — should NOT be a duplicate
    expect(isDuplicate(fact2, [fact1])).toBe(false)
  })

  it("renderMarkdown produces structured sections", async () => {
    const entries: KnowledgeEntry[] = [
      sampleEntry,
      {
        ...sampleEntry,
        id: "t2",
        type: "rule",
        content: "Never commit .env files",
        entities: [".env"],
        confidence: 1.0,
      },
      {
        ...sampleEntry,
        id: "t3",
        type: "fact",
        content: "Uses TanStack Start",
        entities: ["TanStack"],
        confidence: 0.9,
      },
    ]
    const md = await renderMarkdown(entries, TEST_MD)
    expect(md).toContain("## Preferences")
    expect(md).toContain("User prefers pnpm over npm")
    expect(md).toContain("## Rules")
    expect(md).toContain("Never commit .env files")
    expect(md).toContain("## Facts")
  })

  it("renderMarkdown excludes superseded entries", async () => {
    const entries: KnowledgeEntry[] = [
      { ...sampleEntry, supersededBy: "test-2" },
      {
        ...sampleEntry,
        id: "test-2",
        content: "User strongly prefers pnpm",
        confidence: 1.0,
      },
    ]
    const md = await renderMarkdown(entries, TEST_MD)
    expect(md).not.toContain("User prefers pnpm over npm")
    expect(md).toContain("User strongly prefers pnpm")
  })
})

describe("normalizedJaccard", () => {
  it("ignores stop words", () => {
    const a = "the user has been using pnpm"
    const b = "a user is also using pnpm"
    const sim = normalizedJaccard(a, b)
    // Without stop words: {user, pnpm} vs {user, pnpm} = 1.0
    expect(sim).toBe(1.0)
  })

  it("returns 0 for completely different texts", () => {
    expect(
      normalizedJaccard("apples oranges bananas", "cars trucks trains"),
    ).toBe(0)
  })

  it("returns 0 for empty strings", () => {
    expect(normalizedJaccard("", "")).toBe(0)
  })
})

describe("cosineSimilarity", () => {
  it("computes correctly for known vectors", () => {
    // Identical vectors → 1.0
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0)
    // Orthogonal vectors → 0.0
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0)
    // Opposite vectors → -1.0
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0)
    // 45 degrees → ~0.707
    expect(cosineSimilarity([1, 0], [1, 1])).toBeCloseTo(Math.SQRT1_2)
  })

  it("returns 0 for zero vectors", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0)
  })
})

describe("deduplicateEntries", () => {
  it("falls back to Jaccard when Ollama is unavailable", async () => {
    const existing: KnowledgeEntry[] = [sampleEntry]
    const candidates: KnowledgeEntry[] = [
      {
        ...sampleEntry,
        id: "dup",
        content: "User prefers pnpm instead of npm",
      },
      {
        ...sampleEntry,
        id: "new-fact",
        content: "PostgreSQL runs on port 5432",
        entities: ["PostgreSQL"],
      },
    ]

    const result = await deduplicateEntries(
      candidates,
      existing,
      "http://localhost:99999", // unreachable
    )

    expect(result.duplicatesSkipped).toBe(1)
    expect(result.unique).toHaveLength(1)
    expect(result.unique[0].id).toBe("new-fact")
  })
})
