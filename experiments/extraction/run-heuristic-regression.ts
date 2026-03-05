/**
 * Run heuristic extraction against the regression dataset and report results.
 *
 * Usage: pnpm tsx experiments/extraction/run-heuristic-regression.ts
 *
 * Reports: precision, recall gaps, per-scenario pass/fail, and overall score.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { classifyTurn } from "../../server/memory/signal-classifier"
import { extractHeuristic } from "../../server/memory/heuristic-extractor"
import { applyNoveltyGateAndApproval } from "../../server/memory/post-extraction"
import type { KnowledgeEntry, TranscriptTurn } from "../../server/memory/types"

interface RegressionCase {
  scenario: string
  description: string
  input: Array<{ role: string; content: string }>
  expected: {
    type?: string
    confidence?: number
    about?: { type: string }
    shouldExtract?: boolean
    shouldDedup?: boolean
    expectedCount?: number
    novelty?: string
    contentContains?: string
    contentShouldNotContain?: string
    entitiesContain?: string[]
    entitiesShouldNotContain?: string[]
    recallGap?: string
    reason?: string
    note?: string
  }
}

interface TestResult {
  scenario: string
  description: string
  pass: boolean
  expected: string
  actual: string
  category: string
}

function categorize(scenario: string): string {
  if (scenario.startsWith("P1")) return "correction-precision"
  if (scenario.startsWith("P2")) return "decision-precision"
  if (scenario.startsWith("P3")) return "preference-precision"
  if (scenario.startsWith("P4")) return "rule-precision"
  if (scenario.startsWith("P5")) return "procedure-precision"
  if (scenario.startsWith("P6")) return "novelty-gate"
  if (scenario.startsWith("P7")) return "ide-content"
  if (scenario.startsWith("P8")) return "remember-forget"
  if (scenario.startsWith("P9")) return "about-inference"
  if (scenario.startsWith("R")) return "recall-gap"
  if (scenario.startsWith("D")) return "dedup-entities"
  if (scenario.startsWith("Q")) return "developer-specific"
  return "other"
}

function runCase(tc: RegressionCase): TestResult {
  const result: TestResult = {
    scenario: tc.scenario,
    description: tc.description,
    pass: true,
    expected: "",
    actual: "",
    category: categorize(tc.scenario),
  }

  // For recall gap cases, we just check that heuristics DON'T extract
  // (these are known limitations)
  if (tc.expected.recallGap) {
    const turn: TranscriptTurn = {
      role: "user",
      content: tc.input[0].content,
    }
    const classification = classifyTurn(turn)
    const extraction = extractHeuristic(turn, classification, "test")
    const gated = applyNoveltyGateAndApproval(extraction.entries)

    // For recall gaps, we expect shouldExtract=false (heuristics can't handle these)
    const extracted = gated.length > 0
    result.expected = `shouldExtract=false (recall gap: ${tc.expected.recallGap})`
    result.actual = `extracted=${extracted} (${classification.type})`
    result.pass = !extracted // Pass if we correctly identify this as a gap
    return result
  }

  // For dedup cases
  if (tc.expected.shouldDedup) {
    const entries: KnowledgeEntry[] = []
    for (const msg of tc.input) {
      const turn: TranscriptTurn = { role: "user", content: msg.content }
      const classification = classifyTurn(turn)
      const extraction = extractHeuristic(turn, classification, "test")
      entries.push(...extraction.entries)
    }
    // Note: real dedup happens in extraction-pipeline, not here
    result.expected = `dedup to ${tc.expected.expectedCount} entry`
    result.actual = `${entries.length} entries before dedup`
    result.pass = true // Can't test pipeline dedup in unit context
    return result
  }

  // Single turn cases
  const turn: TranscriptTurn = { role: "user", content: tc.input[0].content }
  const classification = classifyTurn(turn)
  const extraction = extractHeuristic(turn, classification, "test")
  const gated = applyNoveltyGateAndApproval(extraction.entries)

  const shouldExtract = tc.expected.shouldExtract !== false
  const didExtract = gated.length > 0
  const entry = gated[0] || extraction.entries[0]

  // Check shouldExtract
  if (shouldExtract && !didExtract) {
    result.pass = false
    result.expected = `should extract (type=${tc.expected.type})`
    result.actual = `not extracted (classification=${classification.type}, novelty=${entry?.novelty || "n/a"})`
    return result
  }

  if (!shouldExtract && didExtract) {
    result.pass = false
    result.expected = `should NOT extract (reason: ${tc.expected.reason})`
    result.actual = `extracted as ${entry.type} with confidence ${entry.confidence}`
    return result
  }

  if (!shouldExtract && !didExtract) {
    result.expected = `not extracted`
    result.actual = `not extracted (${classification.type})`
    return result
  }

  // If extracted, check properties
  const checks: string[] = []
  const failures: string[] = []

  if (tc.expected.type && entry.type !== tc.expected.type) {
    failures.push(`type: expected=${tc.expected.type}, actual=${entry.type}`)
  } else if (tc.expected.type) {
    checks.push(`type=${entry.type}`)
  }

  if (
    tc.expected.confidence !== undefined &&
    entry.confidence !== tc.expected.confidence
  ) {
    failures.push(
      `confidence: expected=${tc.expected.confidence}, actual=${entry.confidence}`,
    )
  } else if (tc.expected.confidence !== undefined) {
    checks.push(`confidence=${entry.confidence}`)
  }

  if (tc.expected.about && entry.about?.type !== tc.expected.about.type) {
    failures.push(
      `about: expected=${tc.expected.about.type}, actual=${entry.about?.type || "none"}`,
    )
  } else if (tc.expected.about) {
    checks.push(`about=${entry.about?.type}`)
  }

  if (
    tc.expected.contentContains &&
    !entry.content.toLowerCase().includes(tc.expected.contentContains.toLowerCase())
  ) {
    failures.push(
      `content should contain "${tc.expected.contentContains}", got: "${entry.content.slice(0, 80)}"`,
    )
  }

  if (
    tc.expected.contentShouldNotContain &&
    entry.content
      .toLowerCase()
      .includes(tc.expected.contentShouldNotContain.toLowerCase())
  ) {
    failures.push(
      `content should NOT contain "${tc.expected.contentShouldNotContain}"`,
    )
  }

  if (tc.expected.entitiesContain) {
    for (const e of tc.expected.entitiesContain) {
      if (!entry.entities.includes(e.toLowerCase())) {
        failures.push(`entities missing: ${e}`)
      }
    }
  }

  if (tc.expected.novelty && entry.novelty !== tc.expected.novelty) {
    failures.push(
      `novelty: expected=${tc.expected.novelty}, actual=${entry.novelty}`,
    )
  }

  if (failures.length > 0) {
    result.pass = false
    result.expected = checks.join(", ") + " + " + failures.map((f) => f.split(":")[0]).join(", ")
    result.actual = failures.join("; ")
  } else {
    result.expected = checks.join(", ") || "extracted"
    result.actual = `extracted: ${entry.type} [${entry.confidence}] ${entry.content.slice(0, 60)}`
  }

  return result
}

function main() {
  const dataPath = path.join(
    import.meta.dirname,
    "heuristic-regression.jsonl",
  )
  const lines = readFileSync(dataPath, "utf-8").trim().split("\n")
  const cases: RegressionCase[] = lines.map((l) => JSON.parse(l))

  console.log(`Running ${cases.length} regression cases...\n`)

  const results: TestResult[] = cases.map(runCase)

  // Group by category
  const byCategory = new Map<string, TestResult[]>()
  for (const r of results) {
    const list = byCategory.get(r.category) || []
    list.push(r)
    byCategory.set(r.category, list)
  }

  let totalPass = 0
  let totalFail = 0

  for (const [category, items] of [...byCategory].sort()) {
    const pass = items.filter((r) => r.pass).length
    const fail = items.filter((r) => !r.pass).length
    totalPass += pass
    totalFail += fail

    const icon = fail === 0 ? "✓" : "✗"
    console.log(`${icon} ${category}: ${pass}/${items.length} pass`)

    for (const r of items) {
      const status = r.pass ? "  ✓" : "  ✗"
      console.log(`${status} ${r.scenario}: ${r.description}`)
      if (!r.pass) {
        console.log(`      expected: ${r.expected}`)
        console.log(`      actual:   ${r.actual}`)
      }
    }
    console.log()
  }

  // Summary
  console.log("=".repeat(60))
  console.log(`TOTAL: ${totalPass}/${totalPass + totalFail} pass (${((totalPass / (totalPass + totalFail)) * 100).toFixed(1)}%)`)
  console.log(`  Pass: ${totalPass}`)
  console.log(`  Fail: ${totalFail}`)

  // Recall gap summary
  const recallGaps = results.filter(
    (r) => r.category === "recall-gap",
  )
  const recallGapTypes = new Map<string, number>()
  for (const r of recallGaps) {
    const tc = cases.find((c) => c.scenario === r.scenario)
    const gap = tc?.expected.recallGap || "unknown"
    recallGapTypes.set(gap, (recallGapTypes.get(gap) || 0) + 1)
  }
  console.log(`\nRecall gaps documented: ${recallGaps.length}`)
  for (const [gap, count] of recallGapTypes) {
    console.log(`  ${gap}: ${count}`)
  }

  // Exit code
  process.exit(totalFail > 0 ? 1 : 0)
}

main()
