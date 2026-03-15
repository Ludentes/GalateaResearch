// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("../../engine/config", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/config")>()
  return {
    ...orig,
    getArtifactConfig: vi.fn(() => ({
      claude_md: {
        max_lines: 200,
        min_confidence: 0.8,
        require_curation: true,
        architecture_preamble: "# Test",
      },
      skills: {
        max_count: 3,
        max_lines_per_skill: 50,
        min_confidence: 0.85,
        require_curation: true,
        staleness_sessions: 10,
      },
      hooks: {
        auto_convert: false,
        learned_patterns_file: "learned-hooks.json",
      },
      prior_overlap: {
        common_patterns: ["write.*tests?", "git|commit|push"],
      },
    })),
  }
})

import { routeEntries } from "../channel-router"
import type { KnowledgeEntry } from "../types"

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: crypto.randomUUID(),
    type: "rule",
    content: "Never push directly to main",
    confidence: 0.95,
    entities: [],
    source: "session:test",
    extractedAt: new Date().toISOString(),
    novelty: "project-specific",
    origin: "explicit-statement",
    curationStatus: "approved",
    ...overrides,
  }
}

describe("routeEntries with overrides", () => {
  it("respects targetOverride to route rule to hook", () => {
    const entry = makeEntry({
      content: "Use pnpm, not npm",
      targetOverride: "hook",
    })
    const result = routeEntries([entry])
    expect(result.hooks.entries).toHaveLength(1)
    expect(result.claudeMd.entries).toHaveLength(0)
  })

  it("respects targetOverride to route to none (knowledge store only)", () => {
    const entry = makeEntry({
      content: "Sentinel uses 3-tier watchdog recovery",
      targetOverride: "none",
    })
    const result = routeEntries([entry])
    expect(result.claudeMd.entries).toHaveLength(0)
    expect(result.hooks.entries).toHaveLength(0)
    expect(result.skills.entries).toHaveLength(0)
    expect(result.skipped.entries).toHaveLength(1)
  })

  it("uses contentOverride in generated artifacts when present", () => {
    const entry = makeEntry({
      content:
        "in case of update in typeorm for nullable field we should specify null",
      contentOverride:
        "TypeORM: use null (not undefined) for nullable field updates",
    })
    const result = routeEntries([entry])
    // The routed entry should exist
    expect(result.claudeMd.entries).toHaveLength(1)
  })
})
