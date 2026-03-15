import { assertStep } from "./scripts/scenario-assert"
import type { TickDecisionRecord } from "./server/observation/tick-record"

// Mock tick record
const mockTick: Partial<TickDecisionRecord> = {
  tickId: "test-1",
  agentId: "test-agent",
  timestamp: Date.now(),
  outcome: {},
  metrics: { temperature: -5, threshold: -10, score: -3.5 },
} as unknown as TickDecisionRecord

// Test cases with negative numbers
const tests = [
  {
    expect: { "metrics.temperature": "> -10" },
    desc: "-5 > -10",
    shouldPass: true,
  },
  {
    expect: { "metrics.temperature": "< 0" },
    desc: "-5 < 0",
    shouldPass: true,
  },
  {
    expect: { "metrics.threshold": "<= -10" },
    desc: "-10 <= -10",
    shouldPass: true,
  },
  {
    expect: { "metrics.score": ">= -5" },
    desc: "-3.5 >= -5",
    shouldPass: true,
  },
  {
    expect: { "metrics.temperature": "< -10" },
    desc: "-5 < -10",
    shouldPass: false,
  },
]

tests.forEach(({ expect, desc, shouldPass }) => {
  const result = assertStep(mockTick as TickDecisionRecord, expect, 0, "test")
  const check = result.checks[0]
  const passed = check.pass === shouldPass
  console.log(
    `${passed ? "✓" : "✗"} ${desc}: ${check.pass ? "PASS" : "FAIL"} (expected: ${check.expected}, actual: ${check.actual})`,
  )
})
