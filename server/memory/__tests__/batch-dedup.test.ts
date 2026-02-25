// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  applyMerges,
  batchDedup,
  formatDedupPrompt,
  parseDedupResponse,
} from "../batch-dedup"
import type { KnowledgeEntry } from "../types"

function makeEntry(
  content: string,
  type: string,
  overrides?: Partial<KnowledgeEntry>,
): KnowledgeEntry {
  return {
    id: crypto.randomUUID(),
    type: type as KnowledgeEntry["type"],
    content,
    confidence: 0.9,
    entities: [],
    source: "session:test",
    extractedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe("batch dedup", () => {
  describe("formatDedupPrompt", () => {
    it("groups entries by type for dedup", () => {
      const entries = [
        makeEntry("Use PostgreSQL", "decision"),
        makeEntry("Use Postgres port 15432", "decision"),
        makeEntry("I prefer pnpm", "preference"),
      ]
      const prompt = formatDedupPrompt(entries)
      expect(prompt).toContain("decision")
      expect(prompt).toContain("PostgreSQL")
      expect(prompt).toContain("15432")
    })

    it("skips types with only one entry", () => {
      const entries = [
        makeEntry("Use PostgreSQL", "decision"),
        makeEntry("I prefer pnpm", "preference"),
      ]
      const prompt = formatDedupPrompt(entries)
      // Neither type has 2+ entries, so neither should appear as a group
      expect(prompt).not.toContain("## decision entries")
      expect(prompt).not.toContain("## preference entries")
    })

    it("includes index numbers for each entry", () => {
      const entries = [
        makeEntry("Use PostgreSQL", "decision"),
        makeEntry("Use Postgres port 15432", "decision"),
      ]
      const prompt = formatDedupPrompt(entries)
      expect(prompt).toContain("[0]")
      expect(prompt).toContain("[1]")
    })
  })

  describe("parseDedupResponse", () => {
    it("parses merge instructions from JSON response", () => {
      const response = JSON.stringify({
        merges: [
          {
            keep: 0,
            drop: [1],
            merged_content: "Use PostgreSQL on port 15432",
          },
        ],
      })
      const result = parseDedupResponse(response)
      expect(result.merges).toHaveLength(1)
      expect(result.merges[0].merged_content).toContain("PostgreSQL")
      expect(result.merges[0].merged_content).toContain("15432")
    })

    it("handles markdown code fences around JSON", () => {
      const response =
        '```json\n{"merges": [{"keep": 0, "drop": [1], "merged_content": "combined"}]}\n```'
      const result = parseDedupResponse(response)
      expect(result.merges).toHaveLength(1)
      expect(result.merges[0].merged_content).toBe("combined")
    })

    it("handles empty merges array", () => {
      const response = '{"merges": []}'
      const result = parseDedupResponse(response)
      expect(result.merges).toHaveLength(0)
    })
  })

  describe("applyMerges", () => {
    it("merges entries and drops duplicates", () => {
      const entries = [
        makeEntry("Use PostgreSQL", "decision"),
        makeEntry("Use Postgres port 15432", "decision"),
        makeEntry("I prefer pnpm", "preference"),
      ]
      const result = applyMerges(entries, {
        merges: [
          {
            keep: 0,
            drop: [1],
            merged_content: "Use PostgreSQL on port 15432",
          },
        ],
      })
      expect(result).toHaveLength(2)
      expect(result[0].content).toBe("Use PostgreSQL on port 15432")
      expect(result[1].content).toBe("I prefer pnpm")
    })

    it("handles out-of-bounds indices gracefully", () => {
      const entries = [makeEntry("Use PostgreSQL", "decision")]
      const result = applyMerges(entries, {
        merges: [{ keep: 5, drop: [10], merged_content: "bad" }],
      })
      expect(result).toHaveLength(1)
      expect(result[0].content).toBe("Use PostgreSQL")
    })

    it("handles empty merges", () => {
      const entries = [makeEntry("Use PostgreSQL", "decision")]
      const result = applyMerges(entries, { merges: [] })
      expect(result).toEqual(entries)
    })
  })

  describe("batchDedup", () => {
    it("returns original entries when disabled", async () => {
      const entries = [makeEntry("Use PostgreSQL", "decision")]
      const result = await batchDedup(entries, { enabled: false })
      expect(result).toEqual(entries)
    })

    it("returns original entries when under threshold", async () => {
      const entries = [makeEntry("Use PostgreSQL", "decision")]
      const result = await batchDedup(entries, {
        enabled: true,
        minEntries: 10,
      })
      expect(result).toEqual(entries)
    })

    it("returns original entries when no type has duplicates", async () => {
      const entries = [
        makeEntry("Use PostgreSQL", "decision"),
        makeEntry("I prefer pnpm", "preference"),
        makeEntry("Never push to main", "rule"),
        makeEntry("No, use v2 API", "correction"),
        makeEntry("Port is 15432", "fact"),
      ]
      const result = await batchDedup(entries, {
        enabled: true,
        minEntries: 3,
      })
      expect(result).toEqual(entries)
    })
  })
})
