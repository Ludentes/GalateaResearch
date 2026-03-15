// @vitest-environment node
import { describe, expect, it } from "vitest"
import { validateExtraction } from "../confabulation-guard"
import type { KnowledgeEntry } from "../types"

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

const SOURCE_TEXT = `
[USER]: We're working on the IoT controller project with Alice.
She's using PostgreSQL for data storage and MQTT for device communication.
[ASSISTANT]: Got it. I'll set up MQTT with QoS 1 and configure the PostgreSQL schema.
`

// ---------------------------------------------------------------------------
// BDD Scenario: Hallucinated entity rejected
// ---------------------------------------------------------------------------
describe("hallucinated entity detection", () => {
  it("removes entities not in source text", () => {
    const entry = makeEntry({
      entities: ["mqtt", "bob_the_builder"],
      content: "MQTT uses QoS 1",
    })

    const result = validateExtraction([entry], SOURCE_TEXT)

    expect(result.entries[0].entities).toEqual(["mqtt"])
    expect(result.modified).toBe(1)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it("drops entry when ALL entities are hallucinated and no about field", () => {
    const entry = makeEntry({
      entities: ["redis", "mongodb"],
      about: undefined,
      content: "Redis is preferred for caching",
    })

    const result = validateExtraction([entry], SOURCE_TEXT)

    expect(result.entries).toHaveLength(0)
    expect(result.dropped).toBe(1)
  })

  it("keeps entry with hallucinated entities if it has about field", () => {
    const entry = makeEntry({
      entities: ["redis"],
      about: { entity: "alice", type: "user" },
      content: "Alice prefers Redis",
    })

    const result = validateExtraction([entry], SOURCE_TEXT)

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].entities).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// BDD Scenario: Invented about.entity rejected
// ---------------------------------------------------------------------------
describe("invented about.entity detection", () => {
  it("clears about field when entity not in source text or known people", () => {
    const entry = makeEntry({
      about: { entity: "jennifer", type: "user" },
      content: "Jennifer prefers dark mode",
    })

    const result = validateExtraction([entry], SOURCE_TEXT, [
      "alina",
      "paul",
      "mary",
    ])

    expect(result.entries[0].about).toBeUndefined()
    expect(result.modified).toBe(1)
    expect(result.warnings.some((w) => w.includes("jennifer"))).toBe(true)
  })

  it("keeps about field when entity is in source text", () => {
    const entry = makeEntry({
      about: { entity: "alice", type: "user" },
      content: "Alice uses PostgreSQL",
    })

    const result = validateExtraction([entry], SOURCE_TEXT)

    expect(result.entries[0].about?.entity).toBe("alice")
    expect(result.modified).toBe(0)
  })

  it("keeps about field when entity is in known people list", () => {
    const entry = makeEntry({
      about: { entity: "paul", type: "user" },
      content: "Paul reviews all PRs",
    })

    // "paul" is not in SOURCE_TEXT but is in known people
    const result = validateExtraction([entry], SOURCE_TEXT, ["paul"])

    expect(result.entries[0].about?.entity).toBe("paul")
  })
})

// ---------------------------------------------------------------------------
// BDD Scenario: Uniform confidence detected
// ---------------------------------------------------------------------------
describe("uniform confidence detection", () => {
  it("adjusts confidence when all entries have 1.0", () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry({
        id: `e${i}`,
        confidence: 1.0,
        type: "fact",
        entities: ["mqtt"],
      }),
    )

    const result = validateExtraction(entries, SOURCE_TEXT)

    expect(result.warnings.some((w) => w.includes("Uniform confidence"))).toBe(
      true,
    )
    // Non-rule entries should be adjusted
    for (const entry of result.entries) {
      expect(entry.confidence).toBe(0.7)
    }
  })

  it("keeps rules at confidence 1.0 during adjustment", () => {
    const entries = [
      makeEntry({
        id: "r1",
        type: "rule",
        confidence: 1.0,
        entities: ["mqtt"],
      }),
      makeEntry({
        id: "f1",
        type: "fact",
        confidence: 1.0,
        entities: ["mqtt"],
      }),
      makeEntry({
        id: "f2",
        type: "fact",
        confidence: 1.0,
        entities: ["mqtt"],
      }),
      makeEntry({
        id: "f3",
        type: "fact",
        confidence: 1.0,
        entities: ["mqtt"],
      }),
    ]

    const result = validateExtraction(entries, SOURCE_TEXT)

    const rule = result.entries.find((e) => e.id === "r1")
    expect(rule?.confidence).toBe(1.0)
    const fact = result.entries.find((e) => e.id === "f1")
    expect(fact?.confidence).toBe(0.7)
  })

  it("does not warn when confidence varies", () => {
    const entries = [
      makeEntry({ id: "e1", confidence: 0.9, entities: ["mqtt"] }),
      makeEntry({ id: "e2", confidence: 0.7, entities: ["postgresql"] }),
      makeEntry({ id: "e3", confidence: 0.5, entities: ["mqtt"] }),
    ]

    const result = validateExtraction(entries, SOURCE_TEXT)

    expect(
      result.warnings.filter((w) => w.includes("Uniform confidence")),
    ).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// BDD Scenario: Type distribution check
// ---------------------------------------------------------------------------
describe("type distribution check", () => {
  it("warns when all entries are the same type", () => {
    const entries = Array.from({ length: 6 }, (_, i) =>
      makeEntry({
        id: `e${i}`,
        type: "fact",
        entities: ["mqtt"],
      }),
    )

    const result = validateExtraction(entries, SOURCE_TEXT)

    expect(result.warnings.some((w) => w.includes('type="fact"'))).toBe(true)
  })

  it("does not warn when types are mixed", () => {
    const entries = [
      makeEntry({ id: "e1", type: "fact", entities: ["mqtt"] }),
      makeEntry({ id: "e2", type: "preference", entities: ["postgresql"] }),
      makeEntry({ id: "e3", type: "rule", entities: ["mqtt"] }),
      makeEntry({ id: "e4", type: "fact", entities: ["mqtt"] }),
      makeEntry({ id: "e5", type: "decision", entities: ["mqtt"] }),
    ]

    const result = validateExtraction(entries, SOURCE_TEXT)

    expect(
      result.warnings.filter((w) => w.includes("misclassified")),
    ).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// BDD Scenario: Valid extraction passes unchanged
// ---------------------------------------------------------------------------
describe("valid extraction passes", () => {
  it("returns entries unchanged when all checks pass", () => {
    const entries = [
      makeEntry({
        id: "e1",
        entities: ["mqtt"],
        about: { entity: "alice", type: "user" },
        confidence: 0.9,
        type: "fact",
      }),
      makeEntry({
        id: "e2",
        entities: ["postgresql"],
        about: { entity: "alice", type: "user" },
        confidence: 0.8,
        type: "preference",
      }),
    ]

    const result = validateExtraction(entries, SOURCE_TEXT, ["alice"])

    expect(result.entries).toHaveLength(2)
    expect(result.dropped).toBe(0)
    expect(result.modified).toBe(0)
    expect(result.warnings).toHaveLength(0)
  })
})
