// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { TickDecisionRecord } from "../../server/observation/tick-record"
import { assertStep } from "../scenario-assert"

const baseTick: TickDecisionRecord = {
  tickId: "test-123",
  agentId: "besa",
  timestamp: "2026-03-12T10:00:00Z",
  trigger: { type: "message", source: "discord:sasha" },
  homeostasis: {},
  guidance: ["knowledge_sufficiency"],
  routing: { level: "task", taskType: "research", reasoning: "task signal" },
  execution: {
    adapter: "direct-response",
    sessionResumed: false,
    toolCalls: 0,
    durationMs: 1500,
  },
  resources: {},
  outcome: {
    action: "respond",
    response: "Here is my research",
    artifactsCreated: ["docs/research/auth.md"],
    knowledgeEntriesCreated: 1,
  },
}

describe("assertStep", () => {
  it("passes exact match", () => {
    const v = assertStep(baseTick, { agentId: "besa" }, 0, "test")
    expect(v.pass).toBe(true)
    expect(v.checks[0].pass).toBe(true)
  })

  it("fails exact mismatch", () => {
    const v = assertStep(baseTick, { agentId: "other" }, 0, "test")
    expect(v.pass).toBe(false)
    expect(v.checks[0].pass).toBe(false)
  })

  it("handles nested dotted path", () => {
    const v = assertStep(baseTick, { "routing.level": "task" }, 0, "test")
    expect(v.pass).toBe(true)
  })

  it("handles 'exists' matcher", () => {
    const v = assertStep(baseTick, { "routing.taskType": "exists" }, 0, "test")
    expect(v.pass).toBe(true)
  })

  it("fails 'exists' when field is undefined", () => {
    const v = assertStep(
      baseTick,
      { "routing.nonexistent": "exists" },
      0,
      "test",
    )
    expect(v.pass).toBe(false)
  })

  it("handles 'not:' matcher", () => {
    const v = assertStep(
      baseTick,
      { "execution.adapter": "not: none" },
      0,
      "test",
    )
    expect(v.pass).toBe(true)
  })

  it("fails 'not:' when value matches", () => {
    const v = assertStep(
      baseTick,
      { "execution.adapter": "not: direct-response" },
      0,
      "test",
    )
    expect(v.pass).toBe(false)
  })

  it("handles numeric '< N' matcher", () => {
    const v = assertStep(
      baseTick,
      { "execution.durationMs": "< 2000" },
      0,
      "test",
    )
    expect(v.pass).toBe(true)
  })

  it("fails numeric '< N' when above", () => {
    const v = assertStep(
      baseTick,
      { "execution.durationMs": "< 1000" },
      0,
      "test",
    )
    expect(v.pass).toBe(false)
  })

  it("handles numeric '>= N' matcher", () => {
    const v = assertStep(
      baseTick,
      { "execution.durationMs": ">= 1500" },
      0,
      "test",
    )
    expect(v.pass).toBe(true)
  })

  it("handles glob array matcher", () => {
    const v = assertStep(
      baseTick,
      { "outcome.artifactsCreated": ["*.md"] },
      0,
      "test",
    )
    expect(v.pass).toBe(true)
  })

  it("fails glob array when no match", () => {
    const v = assertStep(
      baseTick,
      { "outcome.artifactsCreated": ["*.txt"] },
      0,
      "test",
    )
    expect(v.pass).toBe(false)
  })

  it("handles 'contains:' substring matcher", () => {
    const v = assertStep(
      baseTick,
      { "outcome.response": "contains: research" },
      0,
      "test",
    )
    expect(v.pass).toBe(true)
  })

  it("'contains:' is case-insensitive", () => {
    const v = assertStep(
      baseTick,
      { "outcome.response": "contains: RESEARCH" },
      0,
      "test",
    )
    expect(v.pass).toBe(true)
  })

  it("fails 'contains:' when substring not found", () => {
    const v = assertStep(
      baseTick,
      { "outcome.response": "contains: nonexistent" },
      0,
      "test",
    )
    expect(v.pass).toBe(false)
  })

  it("handles 'matches:' regex matcher", () => {
    const v = assertStep(
      baseTick,
      { "outcome.response": "matches: ^Here.*research$" },
      0,
      "test",
    )
    expect(v.pass).toBe(true)
    expect(v.checks[0].pass).toBe(true)
  })

  it("fails 'matches:' when regex does not match", () => {
    const v = assertStep(
      baseTick,
      { "outcome.response": "matches: ^Goodbye" },
      0,
      "test",
    )
    expect(v.pass).toBe(false)
    expect(v.checks[0].pass).toBe(false)
  })

  it("fails 'matches:' gracefully on invalid regex", () => {
    const v = assertStep(
      baseTick,
      { "outcome.response": "matches: [invalid(" },
      0,
      "test",
    )
    expect(v.pass).toBe(false)
    expect(v.checks[0].pass).toBe(false)
  })

  it("handles contains matcher", () => {
    const v = assertStep(
      baseTick,
      { guidance: { contains: "knowledge_sufficiency" } },
      0,
      "test",
    )
    expect(v.pass).toBe(true)
  })

  it("multiple checks — all must pass", () => {
    const v = assertStep(
      baseTick,
      {
        "routing.level": "task",
        "execution.adapter": "not: none",
        "outcome.action": "respond",
      },
      0,
      "test",
    )
    expect(v.pass).toBe(true)
    expect(v.checks).toHaveLength(3)
    expect(v.checks.every((c) => c.pass)).toBe(true)
  })

  it("multiple checks — one failure fails step", () => {
    const v = assertStep(
      baseTick,
      {
        "routing.level": "task",
        "execution.adapter": "none",
        "outcome.action": "respond",
      },
      0,
      "test",
    )
    expect(v.pass).toBe(false)
    expect(v.checks[1].pass).toBe(false)
  })

  it("handles numeric '> -N' matcher with negative threshold", () => {
    const negTick = {
      ...baseTick,
      execution: { ...baseTick.execution, durationMs: -3 },
    }
    const v = assertStep(negTick, { "execution.durationMs": "> -5" }, 0, "test")
    expect(v.pass).toBe(true)
    expect(v.checks[0].pass).toBe(true)
  })

  it("handles numeric '< -N' matcher with negative threshold", () => {
    const negTick = {
      ...baseTick,
      execution: { ...baseTick.execution, durationMs: -10 },
    }
    const v = assertStep(negTick, { "execution.durationMs": "< -5" }, 0, "test")
    expect(v.pass).toBe(true)
  })

  it("handles numeric '>= -N' matcher with negative threshold", () => {
    const negTick = {
      ...baseTick,
      execution: { ...baseTick.execution, durationMs: -5 },
    }
    const v = assertStep(
      negTick,
      { "execution.durationMs": ">= -5" },
      0,
      "test",
    )
    expect(v.pass).toBe(true)
  })

  it("handles numeric '<= -N' matcher with negative threshold", () => {
    const negTick = {
      ...baseTick,
      execution: { ...baseTick.execution, durationMs: -8 },
    }
    const v = assertStep(
      negTick,
      { "execution.durationMs": "<= -5" },
      0,
      "test",
    )
    expect(v.pass).toBe(true)
  })

  it("compares positive actual against negative threshold", () => {
    const v = assertStep(
      baseTick,
      { "execution.durationMs": "> -5" },
      0,
      "test",
    )
    expect(v.pass).toBe(true) // 1500 > -5
  })

  it("fails numeric '> -N' when actual is less than negative threshold", () => {
    const negTick = {
      ...baseTick,
      execution: { ...baseTick.execution, durationMs: -10 },
    }
    const v = assertStep(negTick, { "execution.durationMs": "> -5" }, 0, "test")
    expect(v.pass).toBe(false) // -10 > -5 is false
  })

  it("handles decimal negative thresholds", () => {
    const negTick = {
      ...baseTick,
      execution: { ...baseTick.execution, durationMs: -3 },
    }
    const v = assertStep(
      negTick,
      { "execution.durationMs": "> -5.5" },
      0,
      "test",
    )
    expect(v.pass).toBe(true) // -3 > -5.5
  })
})
