import type { TickDecisionRecord } from "../server/observation/tick-record"
import type { CheckResult, StepVerdict } from "./scenario-types"

function getByDottedPath(obj: unknown, path: string): unknown {
  const parts = path.split(".")
  let current: unknown = obj
  for (const part of parts) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    ) {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function matchGlob(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&")
  const regex = new RegExp(`^${escaped.replace(/\*/g, ".*")}$`)
  return regex.test(value)
}

function checkValue(
  field: string,
  expected: unknown,
  actual: unknown,
): CheckResult {
  // "exists" matcher
  if (expected === "exists") {
    return {
      field,
      expected: "exists",
      actual: String(actual),
      pass: actual !== undefined && actual !== null,
    }
  }

  // "not: value" matcher
  if (typeof expected === "string" && expected.startsWith("not: ")) {
    const negated = expected.slice(5)
    return {
      field,
      expected,
      actual: String(actual),
      pass: String(actual) !== negated,
    }
  }

  // "contains: substring" matcher — case-insensitive substring check
  if (typeof expected === "string" && expected.startsWith("contains: ")) {
    const needle = expected.slice(10).toLowerCase()
    const actualStr = String(actual).toLowerCase()
    return {
      field,
      expected,
      actual: String(actual),
      pass: actualStr.includes(needle),
    }
  }

  // "matches: <regex>" matcher — test actual value against a regex pattern
  if (typeof expected === "string" && expected.startsWith("matches: ")) {
    const pattern = expected.slice(9)
    let pass = false
    try {
      const regex = new RegExp(pattern, "i")
      pass = regex.test(String(actual))
    } catch {
      pass = false
    }
    return {
      field,
      expected,
      actual: String(actual),
      pass,
    }
  }

  // Numeric comparison matchers
  if (typeof expected === "string") {
    const numMatch = expected.match(/^([<>]=?)\s*(-?\d+(?:\.\d+)?)$/)
    if (numMatch) {
      const op = numMatch[1]
      const threshold = Number(numMatch[2])
      const actualNum = Number(actual)
      if (Number.isNaN(actualNum)) {
        return { field, expected, actual: String(actual), pass: false }
      }
      let pass = false
      switch (op) {
        case "<":
          pass = actualNum < threshold
          break
        case ">":
          pass = actualNum > threshold
          break
        case ">=":
          pass = actualNum >= threshold
          break
        case "<=":
          pass = actualNum <= threshold
          break
      }
      return { field, expected, actual: String(actual), pass }
    }
  }

  // Array with glob patterns matcher
  if (Array.isArray(expected) && expected.every((e) => typeof e === "string")) {
    const actualArr = Array.isArray(actual) ? actual : []
    const allMatch = expected.every((pattern) =>
      actualArr.some(
        (item) =>
          typeof item === "string" && matchGlob(pattern as string, item),
      ),
    )
    return {
      field,
      expected: JSON.stringify(expected),
      actual: JSON.stringify(actualArr),
      pass: allMatch,
    }
  }

  // { contains: X } matcher
  if (
    typeof expected === "object" &&
    expected !== null &&
    !Array.isArray(expected) &&
    "contains" in expected
  ) {
    const needle = (expected as { contains: unknown }).contains
    const actualArr = Array.isArray(actual) ? actual : []
    return {
      field,
      expected: `contains: ${String(needle)}`,
      actual: JSON.stringify(actualArr),
      pass: actualArr.includes(needle),
    }
  }

  // Exact match
  return {
    field,
    expected: String(expected),
    actual: String(actual),
    pass: actual === expected,
  }
}

export function assertStep(
  tick: TickDecisionRecord,
  expect: Record<string, unknown>,
  stepIndex: number,
  send: string,
): StepVerdict {
  const checks: CheckResult[] = []

  for (const [field, expected] of Object.entries(expect)) {
    const actual = getByDottedPath(tick, field)
    checks.push(checkValue(field, expected, actual))
  }

  return {
    step: stepIndex,
    send,
    pass: checks.every((c) => c.pass),
    checks,
    tickId: tick.tickId,
    durationMs: 0,
    costUsd: 0,
  }
}
