import { describe, expect, it } from "vitest"
import type { TickDecisionRecord } from "../server/observation/tick-record"

import { assertStep } from "./scenario-assert"

describe("assertStep numeric comparisons with negative numbers", () => {
  const mockTick = (
    overrides: Record<string, unknown> = {},
  ): TickDecisionRecord => ({
    tickId: "test-tick-1",
    timestamp: new Date().toISOString(),
    workPhase: "idle",
    agentId: "test-agent",
    messageCount: 0,
    homeostasisState: {} as Record<string, unknown>,
    tasksSnapshot: [],
    ...overrides,
  })

  describe("negative integers", () => {
    it("> -5 should match when actual value is -3", () => {
      const result = assertStep(
        mockTick({ testValue: -3 }),
        { testValue: "> -5" },
        0,
        "test",
      )
      expect(result.pass).toBe(true)
    })

    it("<= -10 should match when actual value is -15", () => {
      const result = assertStep(
        mockTick({ testValue: -15 }),
        { testValue: "<= -10" },
        0,
        "test",
      )
      expect(result.pass).toBe(true)
    })
  })

  describe("negative decimals with leading digit", () => {
    it("< -0.5 should match when actual value is -0.7", () => {
      const result = assertStep(
        mockTick({ testValue: -0.7 }),
        { testValue: "< -0.5" },
        0,
        "test",
      )
      expect(result.pass).toBe(true)
    })

    it(">= -5.5 should match when actual value is -5.0", () => {
      const result = assertStep(
        mockTick({ testValue: -5.0 }),
        { testValue: ">= -5.5" },
        0,
        "test",
      )
      expect(result.pass).toBe(true)
    })
  })

  describe("negative shorthand decimals (no leading digit)", () => {
    it(">= -.5 should match when actual value is -0.3", () => {
      const result = assertStep(
        mockTick({ testValue: -0.3 }),
        { testValue: ">= -.5" },
        0,
        "test",
      )
      expect(result.pass).toBe(true)
    })

    it("< -.25 should match when actual value is -0.5", () => {
      const result = assertStep(
        mockTick({ testValue: -0.5 }),
        { testValue: "< -.25" },
        0,
        "test",
      )
      expect(result.pass).toBe(true)
    })
  })

  describe("positive shorthand decimals for completeness", () => {
    it("> .5 should match when actual value is 0.7", () => {
      const result = assertStep(
        mockTick({ testValue: 0.7 }),
        { testValue: "> .5" },
        0,
        "test",
      )
      expect(result.pass).toBe(true)
    })
  })

  describe("edge cases and failures", () => {
    it("> -5 should NOT match when actual value is -10", () => {
      const result = assertStep(
        mockTick({ testValue: -10 }),
        { testValue: "> -5" },
        0,
        "test",
      )
      expect(result.pass).toBe(false)
    })

    it("should handle zero", () => {
      const result = assertStep(
        mockTick({ testValue: 0 }),
        { testValue: ">= 0" },
        0,
        "test",
      )
      expect(result.pass).toBe(true)
    })

    it("should reject non-numeric actual values", () => {
      const result = assertStep(
        mockTick({ testValue: "not a number" }),
        { testValue: "> -5" },
        0,
        "test",
      )
      expect(result.pass).toBe(false)
    })
  })
})
