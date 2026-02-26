// @vitest-environment node
/**
 * Signal Classifier Improvement Scenarios
 *
 * Tests for fixes from docs/research/2026-02-26-signal-classifier-dedup-analysis.md
 * Covers Bug 1 (sentence-scoped isLikelyQuestion), Bug 2 (numbered list splitting),
 * and Gap 3 (constraint answer pattern).
 */
import { describe, expect, it, vi } from "vitest"

vi.mock("../../engine/config", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/config")>()
  return {
    ...orig,
    getSignalConfig: orig.getSignalConfig,
    getArtifactConfig: () => ({
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
    }),
  }
})

import { classifyTurn } from "../../memory/signal-classifier"
import { extractHeuristic } from "../../memory/heuristic-extractor"
import type { TranscriptTurn } from "../../memory/types"

// ── S20: Declarative statement in message ending with question ──────
describe("S20: Sentence-scoped isLikelyQuestion (Bug 1 fix)", () => {
  it("recovers policy from mixed declarative+question message", () => {
    const turn: TranscriptTurn = {
      role: "user",
      content:
        "For forseeable future the kiosks are WIndows based, but we should support Linux as well. Do we need explicit modelling like availableCommands or do we just hard code this in our software?",
    }
    const classification = classifyTurn(turn)
    expect(classification.type).toBe("policy")

    const result = extractHeuristic(turn, classification, "session:umka")
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].type).toBe("rule")
    expect(result.entries[0].content).toContain("should support Linux")
  })

  it("still rejects when the matched sentence itself is a question", () => {
    const turn: TranscriptTurn = {
      role: "user",
      content: "Should we always deploy to staging first?",
    }
    const classification = classifyTurn(turn)
    expect(classification.type).not.toBe("policy")
  })

  it("recovers imperative rule followed by question", () => {
    const turn: TranscriptTurn = {
      role: "user",
      content:
        "Never push directly to main. What about branch protection rules?",
    }
    const classification = classifyTurn(turn)
    expect(classification.type).toBe("imperative_rule")

    const result = extractHeuristic(turn, classification, "session:test")
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].type).toBe("rule")
  })
})

// ── S21: Numbered list splitting for per-item classification ────────
describe("S21: Numbered list per-item re-classification (Bug 2 fix)", () => {
  it("splits numbered response into individual rules when items match signal patterns", () => {
    const turn: TranscriptTurn = {
      role: "user",
      content:
        "1) set up the CI pipeline first\n2) always run tests before merging\n3) never deploy on Fridays",
    }
    const classification = classifyTurn(turn)
    expect(classification.type).toBe("procedure")

    const result = extractHeuristic(turn, classification, "session:test")
    expect(result.entries.length).toBeGreaterThanOrEqual(2)
    const types = new Set(result.entries.map((e) => e.type))
    expect(types.has("rule")).toBe(true)
  })

  it("keeps genuine multi-step procedures as single entry", () => {
    const turn: TranscriptTurn = {
      role: "user",
      content:
        "1) Run the linter to check formatting\n2) Fix any issues found\n3) Run the test suite\n4) Push to feature branch",
    }
    const classification = classifyTurn(turn)
    const result = extractHeuristic(turn, classification, "session:test")
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].type).toBe("procedure")
  })
})

// ── S22: Constraint answer pattern (Gap 3 fix) ─────────────────────
describe("S22: Constraint answer and option selection patterns (Gap 3)", () => {
  it("detects lettered option answer as decision", () => {
    const turn: TranscriptTurn = {
      role: "user",
      content:
        "A) 50 characters max\nlimit in DB layer, no need extra check in code",
    }
    const classification = classifyTurn(turn)
    expect(classification.type).toBe("decision")

    const result = extractHeuristic(turn, classification, "session:test")
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].type).toBe("decision")
    expect(result.entries[0].content).toContain("50 characters")
  })
})
