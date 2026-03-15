// @vitest-environment node
import { describe, expect, it } from "vitest"
import { consolidateExtraction } from "../extraction-consolidation"
import type { KnowledgeEntry } from "../types"

const makeEntry = (
  content: string,
  type = "fact" as const,
): KnowledgeEntry => ({
  id: crypto.randomUUID(),
  type,
  content,
  confidence: 0.9,
  entities: [],
  source: "test",
  extractedAt: new Date().toISOString(),
})

describe("consolidateExtraction", () => {
  it("returns empty when no new entries", async () => {
    const result = await consolidateExtraction([], [], {
      enabled: false,
      max_new_entries: 20,
      provider: null,
      model: null,
    })
    expect(result).toEqual([])
  })

  it("passes through all entries when consolidation disabled", async () => {
    const entries = [makeEntry("Use PostgreSQL"), makeEntry("Use MQTT")]
    const result = await consolidateExtraction(entries, [], {
      enabled: false,
      max_new_entries: 20,
      provider: null,
      model: null,
    })
    expect(result).toHaveLength(2)
  })

  it("filters entries already in existing knowledge via Jaccard overlap", async () => {
    const existing = [makeEntry("Use PostgreSQL for the database")]
    const candidates = [
      makeEntry("Use PostgreSQL for database storage"),
      makeEntry("Use MQTT for messaging"),
    ]
    const result = await consolidateExtraction(candidates, existing, {
      enabled: true,
      max_new_entries: 20,
      provider: null,
      model: null,
    })
    // "Use PostgreSQL for database storage" overlaps heavily with existing → filtered
    // "Use MQTT for messaging" is genuinely new → kept
    expect(result.some((e) => e.content.includes("MQTT"))).toBe(true)
    expect(result.every((e) => !e.content.includes("PostgreSQL"))).toBe(true)
  })

  it("caps output at max_new_entries", async () => {
    const candidates = Array.from({ length: 30 }, (_, i) =>
      makeEntry(`Unique fact ${i}`),
    )
    const result = await consolidateExtraction(candidates, [], {
      enabled: true,
      max_new_entries: 10,
      provider: null,
      model: null,
    })
    expect(result).toHaveLength(10)
  })

  it("does not filter entries with low overlap", async () => {
    const existing = [makeEntry("PostgreSQL is our primary database")]
    const candidates = [makeEntry("MQTT broker runs on port 1883")]
    const result = await consolidateExtraction(candidates, existing, {
      enabled: true,
      max_new_entries: 20,
      provider: null,
      model: null,
    })
    expect(result).toHaveLength(1)
    expect(result[0].content).toContain("MQTT")
  })
})
