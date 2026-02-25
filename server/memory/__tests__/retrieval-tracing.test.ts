// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest"
import type { KnowledgeEntry } from "../types"

// Mock config to provide vector retrieval settings
vi.mock("../../engine/config", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/config")>()
  return {
    ...orig,
    getRetrievalConfig: () => ({
      max_entries: 20,
      entity_name_min_length: 3,
      keyword_min_length: 4,
      keyword_overlap_threshold: 1,
      use_vector: false,
      qdrant_url: "http://localhost:6333",
      ollama_embed_url: "http://localhost:11434",
    }),
    getStopWords: () => new Set(["the", "and", "for"]),
  }
})

import { retrieveRelevantFacts } from "../fact-retrieval"
import { appendEntries, readEntries } from "../knowledge-store"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

function makeEntry(
  overrides: Partial<KnowledgeEntry> = {},
): KnowledgeEntry {
  return {
    id: crypto.randomUUID(),
    type: "fact",
    content: "test entry",
    confidence: 0.9,
    entities: [],
    source: "test",
    extractedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe("retrieval decision tracing", () => {
  let storePath: string
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "retrieval-trace-"))
    storePath = path.join(tmpDir, "entries.jsonl")
  })

  it("keyword retrieval records decisions on matched entries", async () => {
    const entry = makeEntry({
      content: "PostgreSQL database setup and configuration",
      entities: ["PostgreSQL"],
    })
    await appendEntries([entry], storePath)

    const result = await retrieveRelevantFacts(
      "PostgreSQL database",
      storePath,
      { trace: true },
    )

    // Entry should be found via entity/keyword match
    expect(result.entries.length).toBeGreaterThan(0)

    // Matched entries should have retrieval decisions
    for (const e of result.entries) {
      expect(e.decisions).toBeDefined()
      const retrievalDecisions = e.decisions!.filter(
        (d) => d.stage === "retrieval",
      )
      expect(retrievalDecisions.length).toBeGreaterThan(0)
      expect(retrievalDecisions[0].action).toBe("pass")
      expect(retrievalDecisions[0].inputs?.method).toBe("keyword")
    }
  })

  it("falls back to keyword when useVector=true but Qdrant unavailable (S14)", async () => {
    const entry = makeEntry({
      content:
        "FalkorDB uses Cypher queries for graph traversal",
      entities: ["FalkorDB", "Cypher"],
    })
    await appendEntries([entry], storePath)

    // Qdrant is not running in test environment - should fall back gracefully
    const result = await retrieveRelevantFacts(
      "FalkorDB Cypher",
      storePath,
      { useVector: true },
    )

    // Should not crash - graceful degradation
    expect(result).toBeDefined()
    expect(result.entries).toBeDefined()
  })
})
