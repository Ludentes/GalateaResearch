// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import type { KnowledgeEntry } from "../types"
import { compositeScore, retrieveVectorFacts } from "../vector-retrieval"

// Mock qdrant-client
vi.mock("../qdrant-client", () => ({
  createQdrantClient: vi.fn(() => ({ baseUrl: "http://localhost:6333", collectionName: "test" })),
  isQdrantAvailable: vi.fn(),
  searchPoints: vi.fn(),
}))

// Mock knowledge-store batchEmbed
vi.mock("../knowledge-store", () => ({
  batchEmbed: vi.fn(),
}))

import { isQdrantAvailable, searchPoints } from "../qdrant-client"
import { batchEmbed } from "../knowledge-store"

const mockedIsQdrantAvailable = vi.mocked(isQdrantAvailable)
const mockedSearchPoints = vi.mocked(searchPoints)
const mockedBatchEmbed = vi.mocked(batchEmbed)

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2, 6)}`,
    type: "fact",
    content: "MQTT uses QoS 1",
    confidence: 0.9,
    entities: ["mqtt"],
    source: "session:test",
    extractedAt: new Date().toISOString(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// BDD Scenario: Vector similarity retrieval
// ---------------------------------------------------------------------------
describe("vector retrieval", () => {
  it("returns entries ranked by composite score", async () => {
    const entry1 = makeEntry({ id: "e1", confidence: 0.9, content: "MQTT QoS 1" })
    const entry2 = makeEntry({ id: "e2", confidence: 0.5, content: "HTTP polling" })
    const allEntries = [entry1, entry2]

    mockedIsQdrantAvailable.mockResolvedValue(true)
    mockedBatchEmbed.mockResolvedValue([[0.1, 0.2, 0.3]])
    mockedSearchPoints.mockResolvedValue([
      { id: "e1", score: 0.95, payload: {} },
      { id: "e2", score: 0.7, payload: {} },
    ])

    const result = await retrieveVectorFacts("mqtt reliability", allEntries)

    expect(result.method).toBe("vector")
    expect(result.entries.length).toBe(2)
    // Higher similarity + higher confidence → e1 first
    expect(result.entries[0].id).toBe("e1")
  })
})

// ---------------------------------------------------------------------------
// BDD Scenario: Hard rules always included
// ---------------------------------------------------------------------------
describe("hard rules always included", () => {
  it("includes type=rule confidence=1.0 entries even without vector match", async () => {
    const rule = makeEntry({
      id: "rule-1",
      type: "rule",
      confidence: 1.0,
      content: "Always respond in the user's language",
    })
    const fact = makeEntry({ id: "fact-1", confidence: 0.8 })
    const allEntries = [rule, fact]

    mockedIsQdrantAvailable.mockResolvedValue(true)
    mockedBatchEmbed.mockResolvedValue([[0.1, 0.2]])
    // Qdrant only returns the fact, not the rule
    mockedSearchPoints.mockResolvedValue([
      { id: "fact-1", score: 0.8, payload: {} },
    ])

    const result = await retrieveVectorFacts("something", allEntries)

    expect(result.method).toBe("vector")
    const ruleEntry = result.entries.find((e) => e.id === "rule-1")
    expect(ruleEntry).toBeDefined()
    expect(ruleEntry?.type).toBe("rule")
  })

  it("hard rules don't exceed budget", async () => {
    const rules = Array.from({ length: 3 }, (_, i) =>
      makeEntry({ id: `rule-${i}`, type: "rule", confidence: 1.0 }),
    )
    const facts = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ id: `fact-${i}`, confidence: 0.8 }),
    )

    mockedIsQdrantAvailable.mockResolvedValue(true)
    mockedBatchEmbed.mockResolvedValue([[0.1]])
    mockedSearchPoints.mockResolvedValue(
      facts.map((f) => ({ id: f.id, score: 0.7, payload: {} })),
    )

    const result = await retrieveVectorFacts("test", [...rules, ...facts], {
      maxEntries: 5,
    })

    expect(result.entries.length).toBeLessThanOrEqual(5)
    // All 3 rules should be included
    const ruleCount = result.entries.filter((e) => e.type === "rule").length
    expect(ruleCount).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// BDD Scenario: Fallback to keyword retrieval
// ---------------------------------------------------------------------------
describe("fallback to keyword retrieval", () => {
  it("returns keyword_fallback when Qdrant is unavailable", async () => {
    mockedIsQdrantAvailable.mockResolvedValue(false)
    const entries = [makeEntry()]

    const result = await retrieveVectorFacts("test", entries)

    expect(result.method).toBe("keyword_fallback")
  })

  it("returns keyword_fallback when embedding fails", async () => {
    mockedIsQdrantAvailable.mockResolvedValue(true)
    mockedBatchEmbed.mockResolvedValue(null)
    const entries = [makeEntry()]

    const result = await retrieveVectorFacts("test", entries)

    expect(result.method).toBe("keyword_fallback")
  })

  it("still includes hard rules in fallback mode", async () => {
    mockedIsQdrantAvailable.mockResolvedValue(false)
    const rule = makeEntry({
      id: "rule-1",
      type: "rule",
      confidence: 1.0,
    })

    const result = await retrieveVectorFacts("test", [rule])

    expect(result.method).toBe("keyword_fallback")
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].id).toBe("rule-1")
  })
})

// ---------------------------------------------------------------------------
// Composite scoring
// ---------------------------------------------------------------------------
describe("composite scoring formula", () => {
  it("applies weights: similarity×0.4 + recency×0.2 + confidence×0.3 + source×0.1", () => {
    const entry = makeEntry({
      confidence: 1.0,
      source: "manual",
      extractedAt: new Date().toISOString(), // very recent
    })

    const score = compositeScore(1.0, entry)
    // similarity: 1.0×0.4 = 0.4
    // recency: ~1.0×0.2 ≈ 0.2 (very recent)
    // confidence: 1.0×0.3 = 0.3
    // source: 1.0×0.1 = 0.1 (manual = 1.0)
    // Total ≈ 1.0
    expect(score).toBeGreaterThan(0.95)
    expect(score).toBeLessThanOrEqual(1.01) // floating point tolerance
  })

  it("scores lower for old, low-confidence entries", () => {
    const entry = makeEntry({
      confidence: 0.3,
      source: "session:test",
      extractedAt: new Date(Date.now() - 60 * 24 * 60 * 60_000).toISOString(), // 60 days ago
    })

    const score = compositeScore(0.5, entry)
    // Much lower score
    expect(score).toBeLessThan(0.5)
  })

  it("supports custom weights", () => {
    const entry = makeEntry({ confidence: 1.0, source: "manual" })

    const scoreDefault = compositeScore(0.8, entry)
    const scoreConfidenceHeavy = compositeScore(0.8, entry, {
      similarity: 0.1,
      recency: 0.1,
      confidence: 0.7,
      source: 0.1,
    })

    // With high confidence weight, entry with confidence=1.0 should score higher
    expect(scoreConfidenceHeavy).toBeGreaterThan(scoreDefault * 0.8)
  })
})

// ---------------------------------------------------------------------------
// BDD Scenario: Entity-based filtering (F.5.2)
// ---------------------------------------------------------------------------
describe("entity-based filtering", () => {
  it("passes entity filter to Qdrant search", async () => {
    const entry = makeEntry({ id: "e1", entities: ["alina"], about: { entity: "alina", type: "user" } })
    mockedIsQdrantAvailable.mockResolvedValue(true)
    mockedBatchEmbed.mockResolvedValue([[0.1, 0.2]])
    mockedSearchPoints.mockResolvedValue([
      { id: "e1", score: 0.9, payload: {} },
    ])

    await retrieveVectorFacts("What does Alina prefer?", [entry], {
      entityFilter: "alina",
    })

    expect(mockedSearchPoints).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filter: {
          should: [
            { key: "about_entity", match: { value: "alina" } },
            { key: "entities", match: { value: "alina" } },
          ],
        },
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// Fallback when Qdrant search throws
// ---------------------------------------------------------------------------
describe("Qdrant search error", () => {
  it("returns keyword_fallback when Qdrant search throws", async () => {
    mockedIsQdrantAvailable.mockResolvedValue(true)
    mockedBatchEmbed.mockResolvedValue([[0.1, 0.2]])
    mockedSearchPoints.mockRejectedValue(new Error("connection reset"))

    const result = await retrieveVectorFacts("test", [makeEntry()])
    expect(result.method).toBe("keyword_fallback")
  })
})

// ---------------------------------------------------------------------------
// Superseded entries excluded
// ---------------------------------------------------------------------------
describe("superseded entries", () => {
  it("excludes superseded entries from results", async () => {
    const active = makeEntry({ id: "active-1" })
    const superseded = makeEntry({ id: "old-1", supersededBy: "active-1" })

    mockedIsQdrantAvailable.mockResolvedValue(true)
    mockedBatchEmbed.mockResolvedValue([[0.1]])
    mockedSearchPoints.mockResolvedValue([
      { id: "active-1", score: 0.8, payload: {} },
      { id: "old-1", score: 0.9, payload: {} },
    ])

    const result = await retrieveVectorFacts("test", [active, superseded])

    expect(result.entries.find((e) => e.id === "old-1")).toBeUndefined()
    expect(result.entries.find((e) => e.id === "active-1")).toBeDefined()
  })
})
