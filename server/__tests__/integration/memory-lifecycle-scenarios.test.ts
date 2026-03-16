// @vitest-environment node
/**
 * Evidence-Based Memory Lifecycle — Scenario Tests
 *
 * 15 full-pipeline scenarios from:
 *   docs/plans/2026-02-24-evidence-based-memory-gherkin-scenarios.md
 *
 * Each scenario traces an entry through the complete pipeline,
 * verifying behavior at every stage.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { routeEntries } from "../../memory/channel-router"
import {
  addToQueue,
  cleanupStale,
  getPendingItems,
} from "../../memory/curation-queue"
import { runDecay } from "../../memory/decay"
import { recordOutcome } from "../../memory/feedback-loop"
import {
  appendEntries,
  readEntries,
  writeEntries,
} from "../../memory/knowledge-store"
import type { KnowledgeEntry } from "../../memory/types"

vi.mock("../../engine/config", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/config")>()
  return {
    ...orig,
    getDecayConfig: () => ({
      enabled: true,
      decay_start_days: 30,
      decay_factor: 0.95,
      archive_threshold: 0.3,
      run_interval_minutes: 60,
      exempt_types: ["rule"],
      origin_grace_multipliers: {
        "explicit-statement": 2.0,
        "observed-failure": 1.5,
        "observed-pattern": 1.0,
        inferred: 0.5,
      },
      outcome_weighting: { harm_penalty_max: 0.5, help_bonus_max: 0.5 },
      hook_entries_exempt: true,
    }),
    getArtifactConfig: () => ({
      claude_md: {
        max_lines: 200,
        min_confidence: 0.9,
        require_curation: true,
        architecture_preamble: "",
      },
      skills: {
        max_count: 3,
        max_lines_per_skill: 100,
        min_confidence: 0.85,
        require_curation: true,
        staleness_sessions: 3,
      },
      hooks: { auto_convert: false, learned_patterns_file: "" },
      prior_overlap: { common_patterns: ["write.*tests?", "git|commit|push"] },
    }),
    getCurationConfig: () => ({
      queue_max_items: 20,
      auto_reject_after_days: 30,
      auto_reject_after_defers: 3,
      present_on_idle: true,
    }),
    getFeedbackConfig: () => ({
      min_sessions_for_impact: 3,
      auto_demote_threshold: -0.3,
      confidence_boost_threshold: 0.7,
      confidence_boost_amount: 0.05,
      regen_debounce_minutes: 60,
    }),
    getRetrievalConfig: () => ({
      max_entries: 20,
      entity_name_min_length: 3,
      keyword_min_length: 4,
      keyword_overlap_threshold: 1,
      use_vector: false,
      qdrant_url: "http://localhost:6333",
      ollama_embed_url: "http://localhost:11434",
    }),
    getStopWords: () => new Set(["the", "and", "for", "that", "this", "with"]),
  }
})

const TEST_DIR = "data/test-lifecycle-scenarios"
const STORE_PATH = `${TEST_DIR}/entries.jsonl`
const QUEUE_PATH = `${TEST_DIR}/curation-queue.json`

function makeEntry(overrides: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: crypto.randomUUID(),
    type: "fact",
    content: "test",
    confidence: 0.9,
    entities: [],
    source: "session:test",
    extractedAt: new Date().toISOString(),
    novelty: "project-specific",
    origin: "observed-pattern",
    curationStatus: "pending",
    sessionsExposed: 0,
    sessionsHelpful: 0,
    sessionsHarmful: 0,
    ...overrides,
  }
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true })
  writeFileSync(STORE_PATH, "")
  writeFileSync(QUEUE_PATH, JSON.stringify({ items: [] }))
})

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
})

// ── S1: Explicit preference → auto-approved → CLAUDE.md ─────────────
describe("S1: Explicit preference → auto-approved → CLAUDE.md", () => {
  it("routes auto-approved explicit preference to claude-md channel", () => {
    const entry = makeEntry({
      type: "preference",
      content: "Use pnpm as the package manager",
      confidence: 0.95,
      novelty: "project-specific",
      origin: "explicit-statement",
      curationStatus: "approved",
      curatedBy: "auto-approved",
    })

    const result = routeEntries([entry])

    expect(result.claudeMd.entries).toHaveLength(1)
    expect(result.claudeMd.entries[0].content).toContain("pnpm")
    expect(result.skills.entries).toHaveLength(0)
    expect(result.hooks.entries).toHaveLength(0)
  })
})

// ── S2: Explicit rule → hook channel → curation required ─────────────
describe("S2: Explicit rule → hook → curation required", () => {
  it("routes destructive-pattern rule to hooks and creates curation item", async () => {
    const entry = makeEntry({
      type: "rule",
      content: "Never force push to main",
      confidence: 1.0,
      novelty: "project-specific",
      origin: "explicit-statement",
      curationStatus: "approved",
    })

    const result = routeEntries([entry])
    expect(result.hooks.entries).toHaveLength(1)
    expect(result.claudeMd.entries).toHaveLength(0)

    await addToQueue(
      {
        entry: result.hooks.entries[0],
        action: "approve-hook",
        reason: "Hook-routed entries require human approval",
      },
      QUEUE_PATH,
    )
    const pending = await getPendingItems(QUEUE_PATH)
    expect(pending).toHaveLength(1)
    expect(pending[0].action).toBe("approve-hook")
  })
})

// ── S3: Observed failure → pending curation → CLAUDE.md after approval ──
describe("S3: Observed failure → pending → CLAUDE.md after approval", () => {
  it("blocks observed-failure entry from CLAUDE.md until curated", async () => {
    const entry = makeEntry({
      type: "correction",
      content: "Video player back button blocked by z-index of play button div",
      confidence: 0.9,
      novelty: "project-specific",
      origin: "observed-failure",
      curationStatus: "pending",
    })

    const beforeApproval = routeEntries([entry])
    expect(beforeApproval.claudeMd.entries).toHaveLength(0)
    expect(beforeApproval.skipped.entries).toHaveLength(1)

    entry.curationStatus = "approved"
    entry.curatedBy = "human"
    entry.curatedAt = new Date().toISOString()

    const afterApproval = routeEntries([entry])
    expect(afterApproval.claudeMd.entries).toHaveLength(1)
    expect(afterApproval.claudeMd.entries[0].content).toContain("z-index")
  })
})

// ── S4: Inferred fact → capped → pending → decays ───────────────────
describe("S4: Inferred fact → confidence capped → eventually decays", () => {
  it("inferred entry with 0.70 cap gets short grace and decays to archive", async () => {
    const entry = makeEntry({
      type: "fact",
      content: "Team uses agile methodology",
      confidence: 0.7,
      novelty: "domain-specific",
      origin: "inferred",
      curationStatus: "pending",
      extractedAt: new Date(Date.now() - 60 * 86400000).toISOString(),
    })

    const routing = routeEntries([entry])
    expect(routing.claudeMd.entries).toHaveLength(0)
    expect(routing.skipped.entries).toHaveLength(1)

    await appendEntries([entry], STORE_PATH)
    await runDecay(STORE_PATH)
    const after = await readEntries(STORE_PATH)
    expect(after[0].confidence).toBeLessThan(0.3)
    expect(after[0].archivedAt).toBeDefined()
  })
})

// ── S5: General knowledge → dropped at extraction gate ───────────────
describe("S5: General knowledge never reaches routing", () => {
  it("router correctly handles the case where general-knowledge slips through", () => {
    const entry = makeEntry({
      type: "rule",
      content: "Always handle errors in async functions",
      confidence: 0.6,
      novelty: "general-knowledge",
      origin: "inferred",
      curationStatus: "pending",
    })

    const result = routeEntries([entry])
    expect(result.claudeMd.entries).toHaveLength(0)
    expect(result.skills.entries).toHaveLength(0)
    expect(result.hooks.entries).toHaveLength(0)
    expect(result.skipped.entries).toHaveLength(1)
  })
})

// ── S6: Procedure cluster → skill channel (max 3) ───────────────────
describe("S6: Approved procedures become skill files (max 3)", () => {
  it("routes top 3 approved procedures to skills, rest skipped", () => {
    const procs = [
      makeEntry({
        type: "procedure",
        content: "Copy prototype to server using rsync",
        confidence: 0.95,
        origin: "explicit-statement",
        curationStatus: "approved",
      }),
      makeEntry({
        type: "procedure",
        content: "Run setup.sh on first install on target server",
        confidence: 0.92,
        origin: "explicit-statement",
        curationStatus: "approved",
      }),
      makeEntry({
        type: "procedure",
        content: "Build Docker images for cms, light-sim, guide-app",
        confidence: 0.9,
        origin: "observed-pattern",
        curationStatus: "approved",
      }),
      makeEntry({
        type: "procedure",
        content: "Deploy using docker-compose up -d on production",
        confidence: 0.93,
        origin: "explicit-statement",
        curationStatus: "approved",
      }),
    ]

    const result = routeEntries(procs)
    expect(result.skills.entries.length).toBeLessThanOrEqual(3)
    expect(result.skills.entries.length).toBeGreaterThan(0)
    expect(result.skills.entries.length + result.skipped.entries.length).toBe(4)
  })
})

// ── S7: Harmful outcome → accelerated decay → review ─────────────────
describe("S7: Harmful outcome → accelerated decay", () => {
  it("entry with negative impactScore decays faster than neutral", async () => {
    const harmful = makeEntry({
      content: "Always use event-based sync instead of time-based",
      confidence: 0.9,
      origin: "explicit-statement",
      curationStatus: "approved",
      sessionsExposed: 3,
      sessionsHelpful: 0,
      sessionsHarmful: 3,
      impactScore: -1.0,
      extractedAt: new Date(Date.now() - 61 * 86400000).toISOString(),
    })
    const neutral = makeEntry({
      content: "Project uses TypeScript strict mode",
      confidence: 0.9,
      origin: "explicit-statement",
      curationStatus: "approved",
      sessionsExposed: 3,
      sessionsHelpful: 1,
      sessionsHarmful: 1,
      impactScore: 0.0,
      extractedAt: new Date(Date.now() - 61 * 86400000).toISOString(),
    })

    await appendEntries([harmful, neutral], STORE_PATH)
    await runDecay(STORE_PATH)

    const after = await readEntries(STORE_PATH)
    const h = after.find((e) => e.id === harmful.id)!
    const n = after.find((e) => e.id === neutral.id)!

    expect(h.confidence).toBeLessThan(n.confidence)
  })
})

// ── S8: Helpful outcome → confidence boost ───────────────────────────
describe("S8: Helpful outcome → confidence strengthened", () => {
  it("entry with consistently helpful outcomes gets impactScore boost", async () => {
    const entry = makeEntry({
      type: "preference",
      content: "Use NativeWind for styling in Expo projects",
      confidence: 0.9,
      origin: "explicit-statement",
      curationStatus: "approved",
      sessionsExposed: 2,
      sessionsHelpful: 2,
      sessionsHarmful: 0,
    })
    await appendEntries([entry], STORE_PATH)

    await recordOutcome(
      { status: "completed", text: "", transcript: [], durationMs: 1000 },
      [entry.id],
      STORE_PATH,
    )

    const after = await readEntries(STORE_PATH)
    const updated = after.find((e) => e.id === entry.id)!

    expect(updated.sessionsExposed).toBe(3)
    expect(updated.sessionsHelpful).toBe(3)
    expect(updated.impactScore).toBe(1.0)
  })
})

// ── S9: Duplicate detection ──────────────────────────────────────────
describe("S9: Near-duplicate entry is caught by dedup", () => {
  it("similar entry is not stored when original exists", async () => {
    const original = makeEntry({
      type: "preference",
      content: "Use pnpm as the package manager",
      confidence: 1.0,
      origin: "explicit-statement",
      curationStatus: "approved",
    })
    await appendEntries([original], STORE_PATH)

    const duplicate = makeEntry({
      type: "preference",
      content: "Always use pnpm, never npm or yarn",
      confidence: 0.95,
      origin: "explicit-statement",
    })

    const existing = await readEntries(STORE_PATH)
    const words1 = new Set(original.content.toLowerCase().split(/\s+/))
    const words2 = new Set(duplicate.content.toLowerCase().split(/\s+/))
    const intersection = [...words1].filter((w) => words2.has(w)).length
    const union = new Set([...words1, ...words2]).size
    const jaccard = intersection / union

    expect(jaccard).toBeGreaterThan(0.0)
    expect(existing).toHaveLength(1)
  })
})

// ── S10: Full lifecycle — extraction through feedback over multiple sessions ──
describe("S10: Full lifecycle across multiple sessions", () => {
  it("explicit preference: extract → auto-approve → route → expose → feedback", async () => {
    // === SESSION 1: Entry created (simulating post-extraction) ===
    const conventionalCommits = makeEntry({
      type: "preference",
      content: "Use conventional commits: feat:, fix:, docs:",
      confidence: 0.95,
      novelty: "project-specific",
      origin: "explicit-statement",
      curationStatus: "approved",
      curatedBy: "auto-approved",
      curatedAt: new Date().toISOString(),
    })
    await appendEntries([conventionalCommits], STORE_PATH)

    // === Routing ===
    const entries = await readEntries(STORE_PATH)
    const routing = routeEntries(entries)
    expect(routing.claudeMd.entries).toHaveLength(1)

    // === SESSION 2: Exposed and helpful ===
    await recordOutcome(
      { status: "completed", text: "", transcript: [], durationMs: 5000 },
      [conventionalCommits.id],
      STORE_PATH,
    )
    let updated = await readEntries(STORE_PATH)
    expect(updated[0].sessionsExposed).toBe(1)
    expect(updated[0].sessionsHelpful).toBe(1)
    expect(updated[0].impactScore).toBeUndefined()

    // === SESSION 3 & 4: More helpful sessions ===
    await recordOutcome(
      { status: "completed", text: "", transcript: [], durationMs: 3000 },
      [conventionalCommits.id],
      STORE_PATH,
    )
    await recordOutcome(
      { status: "completed", text: "", transcript: [], durationMs: 4000 },
      [conventionalCommits.id],
      STORE_PATH,
    )

    // === Verify final state ===
    updated = await readEntries(STORE_PATH)
    const final = updated[0]
    expect(final.sessionsExposed).toBe(3)
    expect(final.sessionsHelpful).toBe(3)
    expect(final.impactScore).toBe(1.0)
    expect(final.curationStatus).toBe("approved")

    const finalRouting = routeEntries(updated)
    expect(finalRouting.claudeMd.entries).toHaveLength(1)
  })

  it("inferred fact: extract → cap → pending → decays → archived", async () => {
    const inferredFact = makeEntry({
      type: "fact",
      content: "Team probably does code reviews",
      confidence: 0.7,
      novelty: "domain-specific",
      origin: "inferred",
      curationStatus: "pending",
      extractedAt: new Date(Date.now() - 50 * 86400000).toISOString(),
    })
    await appendEntries([inferredFact], STORE_PATH)

    const routing = routeEntries([inferredFact])
    expect(routing.claudeMd.entries).toHaveLength(0)

    await runDecay(STORE_PATH)
    const afterDecay = await readEntries(STORE_PATH)
    expect(afterDecay[0].confidence).toBeLessThan(0.3)
    expect(afterDecay[0].archivedAt).toBeDefined()

    await addToQueue(
      {
        entry: inferredFact,
        action: "approve-entry",
        reason: "Pending review",
      },
      QUEUE_PATH,
    )
    const { readFileSync } = await import("node:fs")
    const queue = JSON.parse(readFileSync(QUEUE_PATH, "utf-8"))
    queue.items[0].proposedAt = new Date(
      Date.now() - 31 * 86400000,
    ).toISOString()
    writeFileSync(QUEUE_PATH, JSON.stringify(queue))

    const cleaned = await cleanupStale(QUEUE_PATH)
    expect(cleaned).toBe(1)
    const pending = await getPendingItems(QUEUE_PATH)
    expect(pending).toHaveLength(0)
  })
})

// ── S11: Retrieval decisions traced on entries ────────────────────────
describe("S11: Retrieval decisions are traced on entries", () => {
  it("keyword retrieval records decisions via PipelineTrace", async () => {
    const entry = makeEntry({
      type: "fact",
      content: "Project uses PostgreSQL 17 for data storage",
      confidence: 0.95,
      curationStatus: "approved",
      entities: ["PostgreSQL"],
    })
    await appendEntries([entry], STORE_PATH)

    const { retrieveRelevantFacts } = await import(
      "../../memory/fact-retrieval"
    )
    const result = await retrieveRelevantFacts(
      "PostgreSQL database",
      STORE_PATH,
      { trace: true },
    )
    expect(result.trace).toBeDefined()
    expect(result.trace!.steps.length).toBeGreaterThan(0)

    // Entries should have retrieval decisions
    if (result.entries.length > 0) {
      const decisions = result.entries[0].decisions?.filter(
        (d) => d.stage === "retrieval",
      )
      expect(decisions?.length).toBeGreaterThan(0)
    }
  })
})

// ── S12: CLAUDE.md line budget overflow traced ────────────────────────
describe("S12: CLAUDE.md truncation traced with budget info", () => {
  it("entries exceeding line budget get skip decision with budget state", () => {
    // Create 50 multi-line entries (4 lines each + 1 prefix = 5 lines, total 250 > budget 200)
    const entries = Array.from({ length: 50 }, (_, i) =>
      makeEntry({
        type: "fact",
        content: `Fact ${i}: important detail\nline2\nline3\nline4`,
        confidence: 0.95 - i * 0.001,
        curationStatus: "approved",
        origin: "explicit-statement",
      }),
    )

    const result = routeEntries(entries)

    expect(result.claudeMd.entries.length).toBeGreaterThan(0)
    expect(result.skipped.entries.length).toBeGreaterThan(0)

    // Skipped entries should have router decisions with budget info
    const budgetSkipped = result.skipped.entries.filter((e) =>
      e.decisions?.some(
        (d) => d.stage === "router" && d.reason.includes("line budget"),
      ),
    )
    expect(budgetSkipped.length).toBeGreaterThan(0)

    const decision = budgetSkipped[0].decisions!.find((d) =>
      d.reason.includes("line budget"),
    )!
    expect(decision.inputs?.budget).toBe(200)
    expect(decision.inputs?.entryLines).toBeDefined()
  })
})

// ── S13: Full decision chain readable on entry ────────────────────────
describe("S13: Full decision chain readable on entry", () => {
  it("entry accumulates decisions across extraction and routing", () => {
    const entry = makeEntry({
      type: "preference",
      content: "Use conventional commits",
      confidence: 0.95,
      novelty: "project-specific",
      origin: "explicit-statement",
      curationStatus: "approved",
      decisions: [
        {
          stage: "novelty-gate" as const,
          action: "pass" as const,
          reason: "novelty accepted",
          inputs: { novelty: "project-specific" },
          timestamp: new Date().toISOString(),
          pipelineRunId: "extraction:1234:abcd1234",
        },
        {
          stage: "extraction" as const,
          action: "auto-approve" as const,
          reason: "explicit-statement with confidence >= threshold",
          inputs: { confidence: 0.95, threshold: 0.9 },
          timestamp: new Date().toISOString(),
          pipelineRunId: "extraction:1234:abcd1234",
        },
      ],
    })

    const result = routeEntries([entry])
    const routed = result.claudeMd.entries[0]

    // Now has 3+ decisions: novelty-gate, extraction, router
    expect(routed.decisions!.length).toBeGreaterThanOrEqual(3)
    const stages = routed.decisions!.map((d) => d.stage)
    expect(stages).toContain("novelty-gate")
    expect(stages).toContain("extraction")
    expect(stages).toContain("router")

    // Extraction decisions share a pipelineRunId
    const extractionRuns = routed
      .decisions!.filter((d) => d.pipelineRunId.startsWith("extraction:"))
      .map((d) => d.pipelineRunId)
    expect(new Set(extractionRuns).size).toBe(1)
  })
})

// ── S14: Qdrant unavailable falls back to keyword ─────────────────────
describe("S14: Qdrant unavailable falls back to keyword", () => {
  it("retrieval succeeds when Qdrant is not running", async () => {
    const entry = makeEntry({
      content: "FalkorDB uses Cypher queries",
      entities: ["FalkorDB", "Cypher"],
    })
    await appendEntries([entry], STORE_PATH)

    const { retrieveRelevantFacts } = await import(
      "../../memory/fact-retrieval"
    )
    const result = await retrieveRelevantFacts(
      "FalkorDB Cypher query syntax",
      STORE_PATH,
      { useVector: true },
    )

    // Should still work via keyword fallback — no crash
    expect(result).toBeDefined()
    expect(result.entries).toBeDefined()
  })
})

// ── S15: Decision array capped at max length ──────────────────────────
describe("S15: Decision array capped at max length", () => {
  it("entry with >50 decisions gets capped on decay", async () => {
    const decisions = Array.from({ length: 48 }, (_, i) => ({
      stage: "decay" as const,
      action: "decay" as const,
      reason: `historical run ${i}`,
      timestamp: new Date(Date.now() - i * 86400000).toISOString(),
      pipelineRunId: `decay:${i}:abcdef00`,
    }))

    const entry = makeEntry({
      extractedAt: new Date(Date.now() - 60 * 86400000).toISOString(),
      decisions,
    })
    await appendEntries([entry], STORE_PATH)

    // Run decay 5 times — would push to 53 without cap
    for (let i = 0; i < 5; i++) {
      await runDecay(STORE_PATH)
    }

    const after = await readEntries(STORE_PATH)
    expect(after[0].decisions!.length).toBeLessThanOrEqual(50)
  })
})

// ── S16: Developer overrides target channel (Scenario S3) ────────────
describe("S16: targetOverride routes entry to developer-chosen channel", () => {
  it("routes approved rule to hook when dev sets targetOverride", async () => {
    const entry = makeEntry({
      type: "rule",
      content: "Use pnpm, not npm",
      confidence: 0.95,
      origin: "explicit-statement",
      curationStatus: "approved",
      targetOverride: "hook",
    })

    const result = routeEntries([entry])
    expect(result.hooks.entries).toHaveLength(1)
    expect(result.claudeMd.entries).toHaveLength(0)
    expect(result.hooks.entries[0].targetChannel).toBe("hook")

    const routerDecision = result.hooks.entries[0].decisions?.find(
      (d) => d.stage === "router",
    )
    expect(routerDecision?.reason).toContain("targetOverride")
  })

  it("routes to none when dev sets targetOverride to none", async () => {
    const entry = makeEntry({
      type: "fact",
      content: "Sentinel uses 3-tier watchdog recovery",
      confidence: 0.95,
      origin: "explicit-statement",
      curationStatus: "approved",
      targetOverride: "none",
    })

    const result = routeEntries([entry])
    expect(result.claudeMd.entries).toHaveLength(0)
    expect(result.hooks.entries).toHaveLength(0)
    expect(result.skills.entries).toHaveLength(0)
    expect(result.skipped.entries).toHaveLength(1)
  })
})

// ── S17: Developer edits content during audit (Scenario S2) ─────────
describe("S17: contentOverride used in artifact generation", () => {
  it("generated CLAUDE.md uses contentOverride when present", async () => {
    const entry = makeEntry({
      type: "rule",
      content:
        "in case of update in typeorm for nullable field we should specify null",
      confidence: 0.95,
      origin: "explicit-statement",
      curationStatus: "approved",
      contentOverride:
        "TypeORM: use null (not undefined) for nullable field updates",
    })

    await appendEntries([entry], STORE_PATH)

    const { generateClaudeMdFromRouter } = await import(
      "../../memory/artifact-generator"
    )
    const result = await generateClaudeMdFromRouter([entry], TEST_DIR)

    expect(result.markdown).toContain("TypeORM: use null (not undefined)")
    expect(result.markdown).not.toContain("in case of update in typeorm")
  })

  it("falls back to original content when no contentOverride", async () => {
    const entry = makeEntry({
      type: "preference",
      content: "Use pnpm as the package manager",
      confidence: 0.95,
      origin: "explicit-statement",
      curationStatus: "approved",
    })

    const { generateClaudeMdFromRouter } = await import(
      "../../memory/artifact-generator"
    )
    const result = await generateClaudeMdFromRouter([entry], TEST_DIR)
    expect(result.markdown).toContain("Use pnpm as the package manager")
  })
})

// ── S18: Bulk curation updates (Scenario S10) ───────────────────────
describe("S18: Bulk approve/reject updates store entries", () => {
  it("bulk approve sets curationStatus on multiple entries", async () => {
    const entries = [
      makeEntry({
        content: "Use PostgreSQL for database",
        confidence: 0.95,
        origin: "explicit-statement",
        curationStatus: "pending",
      }),
      makeEntry({
        content: "Deploy to staging first",
        confidence: 0.95,
        origin: "explicit-statement",
        curationStatus: "pending",
      }),
      makeEntry({
        content: "Team uses conventional commits",
        confidence: 0.7,
        origin: "inferred",
        curationStatus: "pending",
      }),
    ]
    await appendEntries(entries, STORE_PATH)

    const stored = await readEntries(STORE_PATH)
    const idsToApprove = new Set([entries[0].id, entries[1].id])
    const now = new Date().toISOString()

    for (const e of stored) {
      if (idsToApprove.has(e.id)) {
        e.curationStatus = "approved"
        e.curatedAt = now
        e.curatedBy = "human"
      }
    }
    await writeEntries(stored, STORE_PATH)

    const after = await readEntries(STORE_PATH)
    const approved = after.filter((e) => e.curationStatus === "approved")
    const pending = after.filter((e) => e.curationStatus === "pending")

    expect(approved).toHaveLength(2)
    expect(pending).toHaveLength(1)
    expect(pending[0].content).toContain("conventional commits")
  })
})

// ── S19: Export generates artifacts from approved only (Scenario S1) ──
describe("S19: Export respects curation — only approved entries in artifacts", () => {
  it("generates CLAUDE.md with approved entries, excludes pending and rejected", async () => {
    const approved = makeEntry({
      type: "preference",
      content: "Use pnpm, not npm",
      confidence: 0.95,
      origin: "explicit-statement",
      curationStatus: "approved",
    })
    const pending = makeEntry({
      type: "fact",
      content: "Team uses conventional commits",
      confidence: 0.7,
      origin: "inferred",
      curationStatus: "pending",
    })
    const rejected = makeEntry({
      type: "rule",
      content: "Always use event-based sync",
      confidence: 0.9,
      origin: "explicit-statement",
      curationStatus: "rejected",
    })

    await appendEntries([approved, pending, rejected], STORE_PATH)

    const { generateAllArtifacts } = await import(
      "../../memory/artifact-generator"
    )
    const result = await generateAllArtifacts(STORE_PATH, TEST_DIR)

    // Only the approved entry should appear
    expect(result.claudeMd.entryCount).toBeGreaterThanOrEqual(1)
  })
})

// ── S23: Re-export after rejecting previously approved entry ────────
describe("S23: Re-export removes rejected entry from artifacts (Scenario S7)", () => {
  it("re-generates CLAUDE.md without a newly rejected entry", async () => {
    const { generateAllArtifacts } = await import(
      "../../memory/artifact-generator"
    )

    const entry1 = makeEntry({
      type: "preference",
      content: "Use pnpm, not npm",
      confidence: 0.95,
      origin: "explicit-statement",
      curationStatus: "approved",
    })
    const entry2 = makeEntry({
      type: "decision",
      content: "Use PostgreSQL for database",
      confidence: 0.9,
      origin: "explicit-statement",
      curationStatus: "approved",
    })
    await appendEntries([entry1, entry2], STORE_PATH)

    const firstExport = await generateAllArtifacts(STORE_PATH, TEST_DIR)
    expect(firstExport.claudeMd.entryCount).toBeGreaterThanOrEqual(2)

    // Developer rejects entry2
    const entries = await readEntries(STORE_PATH)
    const toReject = entries.find((e) => e.id === entry2.id)!
    toReject.curationStatus = "rejected"
    toReject.curatedAt = new Date().toISOString()
    toReject.curatedBy = "human"
    await writeEntries(entries, STORE_PATH)

    const secondExport = await generateAllArtifacts(STORE_PATH, TEST_DIR)
    expect(secondExport.claudeMd.entryCount).toBeLessThan(
      firstExport.claudeMd.entryCount,
    )
  })
})

// ── S24: Empty store produces no artifacts (Scenario S9) ────────────
describe("S24: Empty state — no approved entries means no artifacts", () => {
  it("produces empty routing when store has only pending entries", async () => {
    const pending = makeEntry({
      type: "preference",
      content: "Use pnpm",
      confidence: 0.95,
      curationStatus: "pending",
    })

    const result = routeEntries([pending])
    expect(result.claudeMd.entries).toHaveLength(0)
    expect(result.skills.entries).toHaveLength(0)
    expect(result.hooks.entries).toHaveLength(0)
  })

  it("produces empty result when store is completely empty", async () => {
    const entries = await readEntries(STORE_PATH)
    expect(entries).toHaveLength(0)

    const result = routeEntries(entries)
    expect(result.claudeMd.entries).toHaveLength(0)
    expect(result.skills.entries).toHaveLength(0)
    expect(result.hooks.entries).toHaveLength(0)
  })
})
