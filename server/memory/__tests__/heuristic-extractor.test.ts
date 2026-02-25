// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import type { TranscriptTurn } from "../types"

vi.mock("../../engine/config", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/config")>()
  return {
    ...orig,
    getSignalConfig: orig.getSignalConfig,
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
      prior_overlap: { common_patterns: ["write.*tests?", "git|commit|push"] },
    })),
  }
})

import { classifyTurn } from "../signal-classifier"
import { extractHeuristic } from "../heuristic-extractor"

const user = (content: string): TranscriptTurn => ({ role: "user", content })

describe("extractHeuristic", () => {
  it("extracts preference from 'I prefer pnpm'", () => {
    const turn = user("I prefer using pnpm for all projects")
    const classification = classifyTurn(turn)
    const result = extractHeuristic(turn, classification, "session:test")
    expect(result.handled).toBe(true)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].type).toBe("preference")
    expect(result.entries[0].confidence).toBe(0.95)
    expect(result.entries[0].origin).toBe("explicit-statement")
    expect(result.entries[0].content).toContain("pnpm")
    expect(result.entries[0].evidence).toBe(
      "I prefer using pnpm for all projects",
    )
  })

  it("extracts rule from policy pattern", () => {
    const turn = user("We always run tests before pushing")
    const classification = classifyTurn(turn)
    const result = extractHeuristic(turn, classification, "session:test")
    expect(result.entries[0].type).toBe("rule")
    expect(result.entries[0].confidence).toBe(0.95)
  })

  it("extracts rule from imperative pattern", () => {
    const turn = user("Never push directly to main")
    const classification = classifyTurn(turn)
    const result = extractHeuristic(turn, classification, "session:test")
    expect(result.entries[0].type).toBe("rule")
    expect(result.entries[0].confidence).toBe(0.95)
  })

  it("extracts correction", () => {
    const turn = user("No, that's wrong. Use the v2 API instead")
    const classification = classifyTurn(turn)
    const result = extractHeuristic(turn, classification, "session:test")
    expect(result.entries[0].type).toBe("correction")
    expect(result.entries[0].confidence).toBe(0.9)
  })

  it("extracts decision", () => {
    const turn = user("Let's go with Clerk for authentication")
    const classification = classifyTurn(turn)
    const result = extractHeuristic(turn, classification, "session:test")
    expect(result.entries[0].type).toBe("decision")
    expect(result.entries[0].confidence).toBe(0.9)
  })

  it("extracts @remember as fact with confidence 1.0", () => {
    const turn = user("@remember we use port 15432 for postgres")
    const classification = classifyTurn(turn)
    const result = extractHeuristic(turn, classification, "session:test")
    expect(result.handled).toBe(true)
    expect(result.entries[0].confidence).toBe(1.0)
    expect(result.entries[0].content).toContain("port 15432")
    expect(result.entries[0].content).not.toContain("@remember")
  })

  it("returns handled=false for factual classification", () => {
    const turn = user(
      "The project uses TanStack Start with PostgreSQL on port 15432 and FalkorDB for graph storage",
    )
    const classification = classifyTurn(turn)
    expect(classification.type).toBe("factual")
    const result = extractHeuristic(turn, classification, "session:test")
    expect(result.handled).toBe(false)
    expect(result.entries).toHaveLength(0)
  })

  it("extracts entities from capitalized terms", () => {
    const turn = user("I prefer using TypeScript with Drizzle ORM")
    const classification = classifyTurn(turn)
    const result = extractHeuristic(turn, classification, "session:test")
    expect(result.entries[0].entities).toContain("typescript")
    expect(result.entries[0].entities).toContain("drizzle")
  })

  it("adds extraction decision with heuristic method", () => {
    const turn = user("I always use conventional commits")
    const classification = classifyTurn(turn)
    const result = extractHeuristic(turn, classification, "session:test")
    const entry = result.entries[0]
    expect(entry.decisions).toBeDefined()
    const extractionDecision = entry.decisions!.find(
      (d) => d.stage === "extraction",
    )
    expect(extractionDecision).toBeDefined()
    expect(extractionDecision!.inputs?.method).toBe("heuristic")
  })

  it("marks general knowledge based on prior_overlap patterns", () => {
    const turn = user("I always write tests before committing")
    const classification = classifyTurn(turn)
    const result = extractHeuristic(turn, classification, "session:test")
    expect(result.entries[0].novelty).toBe("general-knowledge")
  })
})
