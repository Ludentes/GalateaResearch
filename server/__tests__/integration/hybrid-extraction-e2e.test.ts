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
import type { LanguageModel } from "ai"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock LLM extractor — we test pure heuristic path
vi.mock("../../memory/knowledge-extractor", () => ({
  extractWithRetry: vi.fn().mockResolvedValue([]),
}))

// Mock observation emit
vi.mock("../../observation/emit", () => ({
  emitEvent: vi.fn().mockResolvedValue(undefined),
}))

// Mock ollama-queue (used by dedup batchEmbed)
vi.mock("../../providers/ollama-queue", () => ({
  ollamaQueue: {
    enqueue: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  },
}))

// Mock config — use real signal/extraction/dedup config, override hybrid + artifact
vi.mock("../../engine/config", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/config")>()
  return {
    ...orig,
    getSignalConfig: orig.getSignalConfig,
    getExtractionConfig: orig.getExtractionConfig,
    getDedupConfig: orig.getDedupConfig,
    getStopWords: orig.getStopWords,
    getConsolidationConfig: orig.getConsolidationConfig,
    getHybridExtractionConfig: () => ({
      enabled: true,
      llm_fallback_enabled: false,
    }),
    getArtifactConfig: vi.fn(() => ({
      claude_md: {
        max_lines: 200,
        min_confidence: 0.9,
        require_curation: true,
        architecture_preamble: "# Project Memory",
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
        learned_patterns_file: "learned-patterns.json",
      },
      prior_overlap: {
        common_patterns: [
          "write.*tests?",
          "handle.*errors?|error.handling",
          "meaningful.*(names?|variables?)",
          "code review",
          "version control|use git",
        ],
      },
    })),
  }
})

// Mock fetch globally (dedup batchEmbed calls Ollama embed endpoint)
const originalFetch = globalThis.fetch
beforeEach(() => {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error("no ollama in test"))
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

import { runExtraction } from "../../memory/extraction-pipeline"
import { generateAllArtifacts } from "../../memory/artifact-generator"
import { readEntries } from "../../memory/knowledge-store"

const MOCK_MODEL = {} as unknown as LanguageModel

let tmpDir: string

function createTempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "e2e-hybrid-"))
}

function writeTranscript(
  dir: string,
  name: string,
  turns: Array<{ role: string; content: string }>,
): string {
  const filePath = path.join(dir, `${name}.jsonl`)
  const lines = turns.map((t, i) => {
    if (t.role === "user") {
      return JSON.stringify({
        type: "user",
        message: { id: `msg${i}`, role: "user", content: t.content },
      })
    }
    return JSON.stringify({
      type: "assistant",
      message: {
        id: `msg${i}`,
        role: "assistant",
        content: [{ type: "text", text: t.content }],
      },
    })
  })
  writeFileSync(filePath, `${lines.join("\n")}\n`)
  return filePath
}

beforeEach(() => {
  tmpDir = createTempDir()
})

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
})

// ============ S1: Explicit preference → CLAUDE.md ============

describe("S1: Explicit preference → CLAUDE.md", () => {
  it("extracts preference and writes to CLAUDE.md Preferences section", async () => {
    const transcript = writeTranscript(tmpDir, "s1-preference", [
      { role: "user", content: "I prefer using pnpm for all projects" },
      { role: "assistant", content: "Got it, I will use pnpm." },
    ])

    const storePath = path.join(tmpDir, "store", "entries.jsonl")
    const outputDir = path.join(tmpDir, "output")

    // Step 1: Extract
    const result = await runExtraction({
      transcriptPath: transcript,
      model: MOCK_MODEL,
      storePath,
    })

    // Heuristic should produce at least 1 entry
    expect(result.stats.heuristicEntries).toBeGreaterThanOrEqual(1)
    expect(result.stats.llmSkipped).toBe(true)

    // Check the extracted entry
    const entries = await readEntries(storePath)
    const prefs = entries.filter((e) => e.type === "preference")
    expect(prefs.length).toBeGreaterThanOrEqual(1)

    const pref = prefs[0]
    expect(pref.confidence).toBeGreaterThanOrEqual(0.9)
    expect(pref.curationStatus).toBe("approved")
    expect(pref.curatedBy).toBe("auto-approved")
    expect(pref.content).toMatch(/pnpm/i)

    // Step 2: Generate artifacts
    const gen = await generateAllArtifacts(storePath, outputDir)

    expect(gen.claudeMd.written).toBe(true)
    expect(gen.claudeMd.entryCount).toBeGreaterThanOrEqual(1)
    expect(gen.skills.count).toBe(0)
    expect(gen.hooks.written).toBe(false)

    // Step 3: Verify CLAUDE.md file content
    const claudeMd = readFileSync(path.join(outputDir, "CLAUDE.md"), "utf-8")
    expect(claudeMd).toContain("# Project Memory")
    expect(claudeMd).toContain("## Preferences")
    expect(claudeMd).toMatch(/pnpm/i)

    // No skills directory
    expect(existsSync(path.join(outputDir, "skills"))).toBe(false)
  })
})

// ============ S2: Imperative rule after connector → CLAUDE.md ============

describe("S2: Imperative rule after connector → CLAUDE.md", () => {
  it("extracts imperative rule and writes to CLAUDE.md Rules section", async () => {
    const transcript = writeTranscript(tmpDir, "s2-rule", [
      { role: "user", content: "Also, never deploy on Fridays" },
      { role: "assistant", content: "Understood, no Friday deploys." },
    ])

    const storePath = path.join(tmpDir, "store", "entries.jsonl")
    const outputDir = path.join(tmpDir, "output")

    const result = await runExtraction({
      transcriptPath: transcript,
      model: MOCK_MODEL,
      storePath,
    })

    expect(result.stats.heuristicEntries).toBeGreaterThanOrEqual(1)

    const entries = await readEntries(storePath)
    const rules = entries.filter((e) => e.type === "rule")
    expect(rules.length).toBeGreaterThanOrEqual(1)

    const rule = rules[0]
    expect(rule.confidence).toBe(0.95)
    expect(rule.curationStatus).toBe("approved")
    expect(rule.content).toMatch(/deploy.*friday/i)

    // Generate artifacts
    const gen = await generateAllArtifacts(storePath, outputDir)

    expect(gen.claudeMd.entryCount).toBeGreaterThanOrEqual(1)
    expect(gen.skills.count).toBe(0)

    const claudeMd = readFileSync(path.join(outputDir, "CLAUDE.md"), "utf-8")
    expect(claudeMd).toContain("## Rules")
    expect(claudeMd).toMatch(/deploy.*friday/i)
  })
})

// ============ S5: General knowledge → dropped ============

describe("S5: General knowledge → dropped by novelty gate", () => {
  it("drops general-knowledge entry, CLAUDE.md has only preamble", async () => {
    const transcript = writeTranscript(tmpDir, "s5-general", [
      {
        role: "user",
        content: "Always handle errors in async functions",
      },
      { role: "assistant", content: "Good practice." },
    ])

    const storePath = path.join(tmpDir, "store", "entries.jsonl")
    const outputDir = path.join(tmpDir, "output")

    await runExtraction({
      transcriptPath: transcript,
      model: MOCK_MODEL,
      storePath,
    })

    // The heuristic will classify this as imperative_rule, but the novelty gate
    // should drop it as general-knowledge (matches "handle.*errors?" pattern)
    // After novelty gate, 0 entries should survive
    const entries = await readEntries(storePath)
    expect(entries.length).toBe(0)

    // Generate artifacts
    const gen = await generateAllArtifacts(storePath, outputDir)

    expect(gen.claudeMd.entryCount).toBe(0)

    const claudeMd = readFileSync(path.join(outputDir, "CLAUDE.md"), "utf-8")
    expect(claudeMd).toContain("# Project Memory")
    expect(claudeMd).not.toContain("## Rules")
    expect(claudeMd).not.toContain("handle errors")
  })
})

// ============ S6: Procedures → pending (not auto-approved at 0.85) ============

describe("S6: Procedures stay pending, blocked from skills", () => {
  it("extracts procedures at 0.85 confidence, pending status blocks skill generation", async () => {
    const transcript = writeTranscript(tmpDir, "s6-procedures", [
      {
        role: "user",
        content:
          "To deploy the app:\n1) Build the docker image\n2) Push to registry",
      },
      { role: "assistant", content: "Got it." },
      {
        role: "user",
        content:
          "To run tests:\n1) Start the dev server\n2) Run vitest",
      },
      { role: "assistant", content: "Noted." },
      {
        role: "user",
        content:
          "Database migration steps:\n1) Generate migration\n2) Apply with drizzle-kit push",
      },
      { role: "assistant", content: "Will do." },
    ])

    const storePath = path.join(tmpDir, "store", "entries.jsonl")
    const outputDir = path.join(tmpDir, "output")

    await runExtraction({
      transcriptPath: transcript,
      model: MOCK_MODEL,
      storePath,
    })

    const entries = await readEntries(storePath)
    const procedures = entries.filter((e) => e.type === "procedure")
    expect(procedures.length).toBeGreaterThanOrEqual(1)

    // Procedures get confidence 0.85 from heuristic mapping
    // Auto-approval requires confidence >= 0.90, so they stay pending
    for (const proc of procedures) {
      expect(proc.confidence).toBe(0.85)
      expect(proc.curationStatus).toBe("pending")
    }

    // Generate artifacts — pending procedures should NOT become skills
    const gen = await generateAllArtifacts(storePath, outputDir)

    expect(gen.skills.count).toBe(0)
    expect(gen.skipped.count).toBeGreaterThanOrEqual(procedures.length)

    // No skills directory should be created
    expect(existsSync(path.join(outputDir, "skills"))).toBe(false)
  })
})

// ============ S9: Duplicate detection ============

describe("S9: Duplicate detection across sessions", () => {
  it("deduplicates entries with high word overlap across extractions", async () => {
    const storePath = path.join(tmpDir, "store", "entries.jsonl")

    // Session 1
    const transcript1 = writeTranscript(tmpDir, "s9-session1", [
      {
        role: "user",
        content: "I prefer pnpm over npm for package management",
      },
      { role: "assistant", content: "Noted." },
    ])

    await runExtraction({
      transcriptPath: transcript1,
      model: MOCK_MODEL,
      storePath,
    })

    const entriesAfter1 = await readEntries(storePath)
    const count1 = entriesAfter1.length
    expect(count1).toBeGreaterThanOrEqual(1)

    // Session 2 — high word overlap for Jaccard dedup
    // Shares: "prefer", "pnpm", "npm", "package", "management" → 5 shared words
    // Unique to session 2: "always" → union = 6, jaccard = 5/6 = 0.83 > 0.5 threshold
    const transcript2 = writeTranscript(tmpDir, "s9-session2", [
      {
        role: "user",
        content:
          "I always prefer pnpm over npm for package management",
      },
      { role: "assistant", content: "Sure." },
    ])

    await runExtraction({
      transcriptPath: transcript2,
      model: MOCK_MODEL,
      storePath,
    })

    // The second extraction should detect near-duplicate via consolidation or dedup
    // (consolidation catches it first via Jaccard, so duplicatesSkipped may be 0)
    const entriesAfter2 = await readEntries(storePath)
    // Key assertion: entry count stays the same (near-duplicate was filtered)
    expect(entriesAfter2.length).toBe(count1)
  })
})

// ============ S10: Mixed session → correct routing ============

describe("S10: Mixed session → correct routing to CLAUDE.md", () => {
  it("routes preferences and rules to correct sections, drops noise", async () => {
    const transcript = writeTranscript(tmpDir, "s10-mixed", [
      {
        role: "user",
        content:
          "I always use conventional commits: feat:, fix:, docs:",
      },
      { role: "assistant", content: "Good practice." },
      {
        role: "user",
        content: "We always run linting before merging PRs",
      },
      { role: "assistant", content: "Understood." },
      { role: "user", content: "ok" },
      { role: "assistant", content: "Anything else?" },
      { role: "user", content: "thanks" },
      { role: "assistant", content: "You're welcome!" },
    ])

    const storePath = path.join(tmpDir, "store", "entries.jsonl")
    const outputDir = path.join(tmpDir, "output")

    const result = await runExtraction({
      transcriptPath: transcript,
      model: MOCK_MODEL,
      storePath,
    })

    // Should have signal turns for the preference and rule, noise for ok/thanks
    expect(result.stats.noiseTurns).toBeGreaterThanOrEqual(2)
    expect(result.stats.heuristicEntries).toBeGreaterThanOrEqual(2)

    const entries = await readEntries(storePath)

    // Check preference entry
    const prefs = entries.filter((e) => e.type === "preference")
    expect(prefs.length).toBeGreaterThanOrEqual(1)
    const prefContent = prefs.map((p) => p.content).join(" ")
    expect(prefContent).toMatch(/conventional commits/i)

    // Check rule entry
    const rules = entries.filter((e) => e.type === "rule")
    expect(rules.length).toBeGreaterThanOrEqual(1)
    const ruleContent = rules.map((r) => r.content).join(" ")
    expect(ruleContent).toMatch(/linting.*merging|merging.*PRs/i)

    // Generate artifacts
    const gen = await generateAllArtifacts(storePath, outputDir)

    expect(gen.claudeMd.entryCount).toBeGreaterThanOrEqual(2)
    expect(gen.skills.count).toBe(0)
    expect(gen.hooks.written).toBe(false)

    const claudeMd = readFileSync(path.join(outputDir, "CLAUDE.md"), "utf-8")

    // Both sections present
    expect(claudeMd).toContain("## Preferences")
    expect(claudeMd).toContain("## Rules")

    // Content routed to correct sections
    expect(claudeMd).toMatch(/conventional commits/i)
    expect(claudeMd).toMatch(/linting.*merging|merging.*PRs/i)

    // Noise not present
    expect(claudeMd).not.toContain("ok")
    expect(claudeMd).not.toContain("thanks")
  })
})
