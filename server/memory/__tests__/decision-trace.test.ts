// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  addDecision,
  capDecisions,
  createPipelineRunId,
  getDecisionsByStage,
} from "../decision-trace"
import type { KnowledgeEntry } from "../types"

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "test-1",
    type: "fact",
    content: "test",
    confidence: 0.9,
    entities: [],
    source: "test",
    extractedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe("decision-trace helpers", () => {
  it("createPipelineRunId returns stage-prefixed ID", () => {
    const id = createPipelineRunId("extraction")
    expect(id).toMatch(/^extraction:\d+:[a-f0-9]{8}$/)
  })

  it("addDecision appends to entry.decisions", () => {
    const entry = makeEntry()
    const runId = createPipelineRunId("router")
    const updated = addDecision(entry, {
      stage: "router",
      action: "route",
      reason: "approved entry → CLAUDE.md",
      inputs: { channel: "claude-md", score: 0.85 },
      pipelineRunId: runId,
    })
    expect(updated.decisions).toHaveLength(1)
    expect(updated.decisions![0].stage).toBe("router")
    expect(updated.decisions![0].pipelineRunId).toBe(runId)
    expect(updated.decisions![0].timestamp).toBeDefined()
  })

  it("addDecision does not mutate original entry", () => {
    const entry = makeEntry()
    const updated = addDecision(entry, {
      stage: "extraction",
      action: "pass",
      reason: "extracted",
      pipelineRunId: "test:1",
    })
    expect(entry.decisions).toBeUndefined()
    expect(updated.decisions).toHaveLength(1)
  })

  it("capDecisions keeps total at max 50 (S15)", () => {
    let entry = makeEntry({ decisions: [] })
    for (let i = 0; i < 55; i++) {
      entry = addDecision(entry, {
        stage: "decay",
        action: "decay",
        reason: `run ${i}`,
        pipelineRunId: `decay:${i}`,
      })
    }
    const capped = capDecisions(entry)
    expect(capped.decisions!.length).toBeLessThanOrEqual(50)
    // Most recent decisions preserved
    expect(capped.decisions![capped.decisions!.length - 1].reason).toBe(
      "run 54",
    )
  })

  it("getDecisionsByStage filters correctly", () => {
    let entry = makeEntry()
    entry = addDecision(entry, {
      stage: "extraction",
      action: "pass",
      reason: "a",
      pipelineRunId: "r1",
    })
    entry = addDecision(entry, {
      stage: "router",
      action: "route",
      reason: "b",
      pipelineRunId: "r2",
    })
    entry = addDecision(entry, {
      stage: "decay",
      action: "decay",
      reason: "c",
      pipelineRunId: "r3",
    })

    const routerDecisions = getDecisionsByStage(entry, "router")
    expect(routerDecisions).toHaveLength(1)
    expect(routerDecisions[0].reason).toBe("b")
  })
})
