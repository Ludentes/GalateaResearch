// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("../../engine/config", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/config")>()
  return {
    ...orig,
    getArtifactConfig: vi.fn(() => ({
      claude_md: {
        max_lines: 200,
        min_confidence: 0.9,
        require_curation: true,
        architecture_preamble: "# Test",
      },
      skills: {
        max_count: 3,
        max_lines_per_skill: 5,
        min_confidence: 0.85,
        require_curation: true,
        staleness_sessions: 3,
      },
      hooks: { auto_convert: false, learned_patterns_file: "learned-hooks.json" },
      prior_overlap: {
        common_patterns: ["write.*tests?", "git|commit|push"],
      },
    })),
  }
})

import { applyNoveltyGateAndApproval } from "../post-extraction"
import type { KnowledgeEntry } from "../types"

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: crypto.randomUUID(),
    type: "rule",
    content: "Use null for nullable fields in TypeORM",
    confidence: 0.95,
    entities: ["typeorm"],
    evidence: "in case of update in typeorm for nullable field we should specify null",
    source: "session:test",
    extractedAt: new Date().toISOString(),
    novelty: "project-specific",
    origin: "explicit-statement",
    about: { entity: "project", type: "project" },
    ...overrides,
  }
}

describe("applyNoveltyGateAndApproval", () => {
  it("passes good entries through", () => {
    const entries = [makeEntry()]
    const result = applyNoveltyGateAndApproval(entries)
    expect(result).toHaveLength(1)
  })

  it("filters general-knowledge entries", () => {
    const entries = [makeEntry({ novelty: "general-knowledge" })]
    const result = applyNoveltyGateAndApproval(entries)
    expect(result).toHaveLength(0)
  })

  it("filters entries with file paths dominating content", () => {
    const entries = [
      makeEntry({
        content:
          "## CRITICAL: Do Not Trust the Report\n\nRead the actual files at:\n- /home/qp/temp/s3-example/python/backend/app/db.py",
      }),
    ]
    const result = applyNoveltyGateAndApproval(entries)
    expect(result).toHaveLength(0)
  })

  it("filters entries that are just file listings in backticks", () => {
    const entries = [
      makeEntry({
        content:
          "ts` - full content\n\nProvide the COMPLETE file contents for all files.",
      }),
    ]
    const result = applyNoveltyGateAndApproval(entries)
    expect(result).toHaveLength(0)
  })

  it("filters entries too short to be meaningful (<20 chars)", () => {
    const entries = [
      makeEntry({
        content: "Use port 8941.",
      }),
    ]
    const result = applyNoveltyGateAndApproval(entries)
    expect(result).toHaveLength(0)
  })

  it("keeps entries with file paths if they contain substantial knowledge", () => {
    const entries = [
      makeEntry({
        content:
          "in case of update in typeorm for nullable field we should specify null explicitly, not undefined. Check entities in libs/shared/src/entities/",
      }),
    ]
    const result = applyNoveltyGateAndApproval(entries)
    expect(result).toHaveLength(1)
  })

  it("filters entries referencing specific session actions", () => {
    const entries = [
      makeEntry({
        content:
          "docs/` folder already exists with the design doc, don't touch it.",
      }),
    ]
    const result = applyNoveltyGateAndApproval(entries)
    expect(result).toHaveLength(0)
  })
})
