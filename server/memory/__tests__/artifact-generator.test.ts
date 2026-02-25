// @vitest-environment node

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { KnowledgeEntry } from "../types"

vi.mock("../../engine/config", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/config")>()
  return {
    ...orig,
    getArtifactConfig: vi.fn(() => ({
      claude_md: {
        max_lines: 200,
        min_confidence: 0.9,
        require_curation: true,
        architecture_preamble:
          "# Project Knowledge\n\n> Auto-generated. Do not edit.",
      },
      skills: {
        max_count: 3,
        max_lines_per_skill: 5,
        min_confidence: 0.85,
        require_curation: true,
        staleness_sessions: 3,
      },
      hooks: {
        auto_convert: false,
        learned_patterns_file: "learned-hooks.json",
      },
      prior_overlap: { common_patterns: ["write.*tests?", "git|commit|push"] },
    })),
  }
})

import { getArtifactConfig } from "../../engine/config"
import {
  generateAllArtifacts,
  generateClaudeMdFromRouter,
  generateHookPatterns,
  generateSkillFilesFromRouter,
} from "../artifact-generator"

let tmpDir: string

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: crypto.randomUUID(),
    type: "fact",
    content: "test content",
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

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "artifact-gen-"))
})

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
  vi.mocked(getArtifactConfig).mockClear()
})

// ========== generateClaudeMdFromRouter ==========

describe("generateClaudeMdFromRouter", () => {
  it("writes preamble from config", async () => {
    const { markdown } = await generateClaudeMdFromRouter([], tmpDir)
    expect(markdown).toContain("# Project Knowledge")
    expect(markdown).toContain("Auto-generated. Do not edit.")
  })

  it("groups entries by type into sections", async () => {
    const entries = [
      makeEntry({ type: "rule", content: "Always lint before commit" }),
      makeEntry({ type: "preference", content: "Use pnpm not npm" }),
      makeEntry({ type: "correction", content: "Fix: use h3 v2 errors" }),
      makeEntry({ type: "decision", content: "Chose Drizzle over Prisma" }),
      makeEntry({ type: "fact", content: "Server runs on port 13000" }),
    ]
    const { markdown } = await generateClaudeMdFromRouter(entries, tmpDir)
    expect(markdown).toContain("## Rules")
    expect(markdown).toContain("Always lint before commit")
    expect(markdown).toContain("## Preferences")
    expect(markdown).toContain("Use pnpm not npm")
    expect(markdown).toContain("## Corrections")
    expect(markdown).toContain("Fix: use h3 v2 errors")
    expect(markdown).toContain("## Decisions")
    expect(markdown).toContain("Chose Drizzle over Prisma")
    expect(markdown).toContain("## Facts")
    expect(markdown).toContain("Server runs on port 13000")
  })

  it("writes CLAUDE.md file to outputDir", async () => {
    const entries = [
      makeEntry({ type: "rule", content: "Always use TypeScript" }),
    ]
    await generateClaudeMdFromRouter(entries, tmpDir)
    const filePath = path.join(tmpDir, "CLAUDE.md")
    expect(existsSync(filePath)).toBe(true)
    const content = readFileSync(filePath, "utf-8")
    expect(content).toContain("Always use TypeScript")
  })

  it("handles empty entries (writes preamble only)", async () => {
    const { markdown } = await generateClaudeMdFromRouter([], tmpDir)
    expect(markdown).toContain("# Project Knowledge")
    expect(markdown).not.toContain("## Rules")
    expect(markdown).not.toContain("## Preferences")
    expect(markdown).not.toContain("## Facts")
  })

  it("skips procedures (those go to skills)", async () => {
    const entries = [
      makeEntry({
        type: "procedure",
        content: "Deploy by running pnpm deploy",
      }),
      makeEntry({ type: "fact", content: "Port is 3000" }),
    ]
    const { markdown } = await generateClaudeMdFromRouter(entries, tmpDir)
    expect(markdown).not.toContain("Deploy by running")
    expect(markdown).toContain("Port is 3000")
  })

  it("returns traced entries with claude-md-gen decisions", async () => {
    const entries = [
      makeEntry({ type: "rule", content: "Always lint" }),
      makeEntry({ type: "preference", content: "Use pnpm" }),
    ]
    const { tracedEntries } = await generateClaudeMdFromRouter(entries, tmpDir)
    expect(tracedEntries).toHaveLength(2)
    for (const e of tracedEntries) {
      expect(e.decisions).toBeDefined()
      const genDecisions = e.decisions!.filter(
        (d) => d.stage === "claude-md-gen",
      )
      expect(genDecisions).toHaveLength(1)
      expect(genDecisions[0].action).toBe("record")
      expect(genDecisions[0].reason).toBe("written to CLAUDE.md")
    }
  })
})

// ========== generateSkillFilesFromRouter ==========

describe("generateSkillFilesFromRouter", () => {
  it("writes one file per entry to skills/ subdir", async () => {
    const entries = [
      makeEntry({
        type: "procedure",
        content: "Run pnpm test before merging",
        confidence: 0.92,
      }),
      makeEntry({
        type: "procedure",
        content: "Deploy via docker compose up",
        confidence: 0.9,
      }),
    ]
    const results = await generateSkillFilesFromRouter(entries, tmpDir)
    expect(results).toHaveLength(2)
    for (const r of results) {
      const filePath = path.join(tmpDir, "skills", r.filename)
      expect(existsSync(filePath)).toBe(true)
      const content = readFileSync(filePath, "utf-8")
      expect(content).toContain("Auto-generated skill")
    }
  })

  it("truncates content to max_lines_per_skill", async () => {
    const longContent = Array.from(
      { length: 20 },
      (_, i) => `Step ${i + 1}: do something`,
    ).join("\n")
    const entries = [
      makeEntry({
        type: "procedure",
        content: longContent,
        confidence: 0.92,
      }),
    ]
    const results = await generateSkillFilesFromRouter(entries, tmpDir)
    expect(results).toHaveLength(1)
    const filePath = path.join(tmpDir, "skills", results[0].filename)
    const content = readFileSync(filePath, "utf-8")
    // Content should be truncated to max_lines_per_skill (5) lines
    expect(content).toContain("Step 1")
    expect(content).toContain("Step 5")
    expect(content).not.toContain("Step 6")
    expect(content).not.toContain("Step 20")
  })

  it("returns empty array for empty input", async () => {
    const results = await generateSkillFilesFromRouter([], tmpDir)
    expect(results).toEqual([])
  })
})

// ========== generateHookPatterns ==========

describe("generateHookPatterns", () => {
  it("no-op when entries empty", async () => {
    const result = await generateHookPatterns([], tmpDir)
    expect(result.written).toBe(false)
    expect(result.count).toBe(0)
  })

  it("no-op when auto_convert=false and not human-approved", async () => {
    const entries = [
      makeEntry({
        type: "rule",
        content: "Never force push",
        curatedBy: "auto-approved",
      }),
    ]
    const result = await generateHookPatterns(entries, tmpDir)
    expect(result.written).toBe(false)
    expect(result.count).toBe(0)
  })

  it("writes JSON when curatedBy='human'", async () => {
    const entries = [
      makeEntry({
        type: "rule",
        content: "Never delete production DB",
        curatedBy: "human",
        confidence: 0.99,
      }),
    ]
    const result = await generateHookPatterns(entries, tmpDir)
    expect(result.written).toBe(true)
    expect(result.count).toBe(1)
    expect(result.patterns).toHaveLength(1)

    const filePath = path.join(tmpDir, "learned-hooks.json")
    expect(existsSync(filePath)).toBe(true)
    const json = JSON.parse(readFileSync(filePath, "utf-8"))
    expect(json).toHaveLength(1)
    expect(json[0].content).toBe("Never delete production DB")
  })

  it("writes JSON when auto_convert=true", async () => {
    vi.mocked(getArtifactConfig).mockReturnValueOnce({
      claude_md: {
        max_lines: 200,
        min_confidence: 0.9,
        require_curation: true,
        architecture_preamble: "# Project Knowledge",
      },
      skills: {
        max_count: 3,
        max_lines_per_skill: 5,
        min_confidence: 0.85,
        require_curation: true,
        staleness_sessions: 3,
      },
      hooks: {
        auto_convert: true,
        learned_patterns_file: "learned-hooks.json",
      },
      prior_overlap: { common_patterns: [] },
    })

    const entries = [
      makeEntry({
        type: "rule",
        content: "Never push to main",
        curatedBy: "auto-approved",
        confidence: 0.95,
      }),
    ]
    const result = await generateHookPatterns(entries, tmpDir)
    expect(result.written).toBe(true)
    expect(result.count).toBe(1)
  })
})

// ========== Integration: generateAllArtifacts ==========

describe("generateAllArtifacts", () => {
  let storePath: string

  beforeEach(() => {
    storePath = path.join(tmpDir, "entries.jsonl")
    writeFileSync(storePath, "")
  })

  function writeEntries(entries: KnowledgeEntry[]) {
    const lines = entries.map((e) => JSON.stringify(e)).join("\n")
    writeFileSync(storePath, `${lines}\n`)
  }

  it("S1: 1 approved preference → CLAUDE.md has Preferences section", async () => {
    writeEntries([
      makeEntry({
        type: "preference",
        content: "Use pnpm not npm",
        confidence: 0.95,
        curationStatus: "approved",
        origin: "explicit-statement",
        novelty: "project-specific",
      }),
    ])

    const result = await generateAllArtifacts(storePath, tmpDir)
    expect(result.claudeMd.written).toBe(true)
    expect(result.claudeMd.entryCount).toBe(1)

    const md = readFileSync(path.join(tmpDir, "CLAUDE.md"), "utf-8")
    expect(md).toContain("## Preferences")
    expect(md).toContain("Use pnpm not npm")
  })

  it("S3: 1 pending entry → CLAUDE.md has no entry content (just preamble)", async () => {
    writeEntries([
      makeEntry({
        type: "preference",
        content: "Maybe use tabs",
        confidence: 0.95,
        curationStatus: "pending",
        novelty: "project-specific",
      }),
    ])

    const result = await generateAllArtifacts(storePath, tmpDir)
    expect(result.claudeMd.entryCount).toBe(0)

    const md = readFileSync(path.join(tmpDir, "CLAUDE.md"), "utf-8")
    expect(md).toContain("# Project Knowledge")
    expect(md).not.toContain("Maybe use tabs")
  })

  it("S6: 4 approved procedures → skills.count === 3, 3 files exist", async () => {
    writeEntries(
      Array.from({ length: 4 }, (_, i) =>
        makeEntry({
          type: "procedure",
          content: `Unique deploy procedure step ${i + 1} for this project`,
          confidence: 0.92 - i * 0.01,
          curationStatus: "approved",
          novelty: "project-specific",
          impactScore: 0.8,
        }),
      ),
    )

    const result = await generateAllArtifacts(storePath, tmpDir)
    expect(result.skills.count).toBe(3)

    const skillsDir = path.join(tmpDir, "skills")
    expect(existsSync(skillsDir)).toBe(true)
    const files = result.skills.files
    expect(files).toHaveLength(3)
    for (const f of files) {
      expect(existsSync(path.join(skillsDir, f.filename))).toBe(true)
    }
  })
})
