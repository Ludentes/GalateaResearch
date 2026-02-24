// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import type { KnowledgeEntry } from "../types"

vi.mock("../../engine/config", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/config")>()
  return {
    ...orig,
    getArtifactConfig: () => ({
      claude_md: { max_lines: 200, min_confidence: 0.90, require_curation: true, architecture_preamble: "" },
      skills: { max_count: 3, max_lines_per_skill: 100, min_confidence: 0.85, require_curation: true, staleness_sessions: 3 },
      hooks: { auto_convert: false, learned_patterns_file: "" },
      prior_overlap: { common_patterns: ["write.*tests?", "git|commit|push"] },
    }),
  }
})

import { routeEntries } from "../channel-router"

function makeEntry(overrides: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: crypto.randomUUID(),
    type: "fact",
    content: "test",
    confidence: 0.95,
    entities: [],
    source: "test",
    extractedAt: new Date().toISOString(),
    novelty: "project-specific",
    origin: "explicit-statement",
    curationStatus: "approved",
    sessionsExposed: 0,
    sessionsHelpful: 0,
    sessionsHarmful: 0,
    ...overrides,
  }
}

describe("routeEntries", () => {
  it("routes tool-constraint rules to hooks channel", () => {
    const entry = makeEntry({
      type: "rule",
      content: "Never push to the main branch",
      curationStatus: "approved",
    })
    const result = routeEntries([entry])
    expect(result.hooks.entries).toHaveLength(1)
    expect(result.claudeMd.entries).toHaveLength(0)
  })

  it("routes approved high-confidence procedures to skills (max 3)", () => {
    const procs = Array.from({ length: 5 }, (_, i) =>
      makeEntry({
        type: "procedure",
        content: `Specific deploy step ${i} for this project`,
        confidence: 0.90 - i * 0.01,
        curationStatus: "approved",
        novelty: "project-specific",
      }),
    )
    const result = routeEntries(procs)
    expect(result.skills.entries.length).toBeLessThanOrEqual(3)
  })

  it("routes approved non-procedure entries to CLAUDE.md", () => {
    const entry = makeEntry({
      type: "preference",
      content: "Uses pnpm not npm",
      confidence: 0.95,
      curationStatus: "approved",
    })
    const result = routeEntries([entry])
    expect(result.claudeMd.entries).toHaveLength(1)
  })

  it("skips entries below confidence threshold for CLAUDE.md", () => {
    const entry = makeEntry({
      type: "preference",
      content: "Might use tabs",
      confidence: 0.80,
      curationStatus: "approved",
    })
    const result = routeEntries([entry])
    expect(result.claudeMd.entries).toHaveLength(0)
    expect(result.skipped.entries).toHaveLength(1)
  })

  it("skips uncurated entries from all artifact channels", () => {
    const entry = makeEntry({
      type: "preference",
      content: "Uses pnpm",
      confidence: 0.95,
      curationStatus: "pending",
    })
    const result = routeEntries([entry])
    expect(result.claudeMd.entries).toHaveLength(0)
    expect(result.skills.entries).toHaveLength(0)
    expect(result.skipped.entries).toHaveLength(1)
  })

  it("skips superseded and archived entries", () => {
    const superseded = makeEntry({ supersededBy: "other-id", curationStatus: "approved" })
    const archived = makeEntry({ archivedAt: new Date().toISOString(), curationStatus: "approved" })
    const result = routeEntries([superseded, archived])
    expect(result.claudeMd.entries).toHaveLength(0)
    expect(result.skipped.entries).toHaveLength(2)
  })

  it("excludes hook-enforced entries from CLAUDE.md", () => {
    const entry = makeEntry({
      type: "rule",
      content: "Never delete production DB",
      confidence: 1.0,
      curationStatus: "approved",
      enforcedBy: "hook",
    })
    const result = routeEntries([entry])
    expect(result.claudeMd.entries).toHaveLength(0)
  })
})
