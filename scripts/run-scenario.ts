import { readFile } from "node:fs/promises"
import path from "node:path"
import YAML from "yaml"
import { assertStep } from "./scenario-assert"
import type { Scenario, ScenarioVerdict, StepVerdict } from "./scenario-types"

const BASE_URL = process.env.SCENARIO_BASE_URL ?? "http://localhost:13000"

// ANSI colors
const GREEN = "\x1b[32m"
const RED = "\x1b[31m"
const DIM = "\x1b[2m"
const BOLD = "\x1b[1m"
const RESET = "\x1b[0m"

async function loadScenario(filePath: string): Promise<Scenario> {
  const raw = await readFile(filePath, "utf-8")
  return YAML.parse(raw) as Scenario
}

async function handleSetup(scenario: Scenario): Promise<void> {
  if (scenario.setup?.clear_state || scenario.setup?.clear_ticks) {
    const res = await fetch(`${BASE_URL}/api/agent/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: scenario.agent,
        clearTicks: scenario.setup?.clear_ticks ?? false,
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error(`Reset failed for ${scenario.agent}: ${err}`)
    }
  }
}

async function executeStep(
  scenario: Scenario,
  step: Scenario["steps"][number],
  stepIndex: number,
): Promise<StepVerdict> {
  const stepStart = Date.now()
  let res: Response
  try {
    res = await fetch(`${BASE_URL}/api/agent/inject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: scenario.agent,
        content: step.send,
        from: step.from.user,
        channel: step.from.platform,
        messageType: step.messageType,
        ...(step.provider ? { provider: step.provider } : {}),
      }),
    })
  } catch (err) {
    return {
      step: stepIndex,
      send: step.send,
      pass: false,
      checks: [
        {
          field: "http",
          expected: "200",
          actual: `connection error: ${(err as Error).message}`,
          pass: false,
        },
      ],
      tickId: "",
      durationMs: Date.now() - stepStart,
      costUsd: 0,
    }
  }

  if (!res.ok) {
    const errText = await res.text()
    return {
      step: stepIndex,
      send: step.send,
      pass: false,
      checks: [
        {
          field: "http",
          expected: "200",
          actual: `${res.status}: ${errText}`,
          pass: false,
        },
      ],
      tickId: "",
      durationMs: Date.now() - stepStart,
      costUsd: 0,
    }
  }

  const body = await res.json()

  if (!body.tick) {
    return {
      step: stepIndex,
      send: step.send,
      pass: false,
      checks: [
        {
          field: "tick",
          expected: "non-null",
          actual: "null",
          pass: false,
        },
      ],
      tickId: "",
      durationMs: Date.now() - stepStart,
      costUsd: 0,
    }
  }

  const verdict = assertStep(body.tick, step.expect, stepIndex, step.send)
  verdict.durationMs = Date.now() - stepStart
  verdict.costUsd = body.tick.execution?.costUsd ?? 0
  return verdict
}

async function runScenario(filePath: string): Promise<ScenarioVerdict> {
  const scenario = await loadScenario(filePath)
  const scenarioStart = Date.now()
  await handleSetup(scenario)

  const steps: StepVerdict[] = []
  for (let i = 0; i < scenario.steps.length; i++) {
    const verdict = await executeStep(scenario, scenario.steps[i], i + 1)
    steps.push(verdict)
  }

  return {
    scenario: scenario.scenario,
    agent: scenario.agent,
    pass: steps.every((s) => s.pass),
    steps,
    durationMs: Date.now() - scenarioStart,
    totalCostUsd: steps.reduce((sum, s) => sum + s.costUsd, 0),
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatCost(usd: number): string {
  if (usd === 0) return ""
  return ` $${usd.toFixed(4)}`
}

function printReport(verdicts: ScenarioVerdict[]): void {
  const total = verdicts.length
  const passed = verdicts.filter((v) => v.pass).length
  const failed = total - passed
  const totalDuration = verdicts.reduce((sum, v) => sum + v.durationMs, 0)
  const totalCost = verdicts.reduce((sum, v) => sum + v.totalCostUsd, 0)

  const now = new Date()
  const ts = now.toISOString().replace("T", " ").slice(0, 16)

  console.log(`\n${BOLD}=== Scenario Run: ${ts} ===${RESET}`)
  console.log(
    `Scenarios: ${total} run, ${GREEN}${passed} passed${RESET}, ${failed > 0 ? RED : ""}${failed} failed${RESET}`,
  )
  console.log(
    `Duration: ${formatDuration(totalDuration)}${totalCost > 0 ? ` | Cost: $${totalCost.toFixed(4)}` : ""}\n`,
  )

  for (const v of verdicts) {
    const tag = v.pass ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`
    const timing = `${DIM}${formatDuration(v.durationMs)}${formatCost(v.totalCostUsd)}${RESET}`
    console.log(`${tag}: ${v.scenario} (${v.agent}) ${timing}`)

    for (const s of v.steps) {
      const stepTag = s.pass ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`
      const stepTiming = `${DIM}${formatDuration(s.durationMs)}${formatCost(s.costUsd)}${RESET}`
      console.log(`  Step ${s.step}: ${stepTag} ${stepTiming}`)

      if (!s.pass) {
        for (const c of s.checks) {
          if (!c.pass) {
            console.log(
              `    ${DIM}${c.field}: expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(c.actual)}${RESET}`,
            )
          }
        }
      }
    }
    console.log()
  }
}

async function main(): Promise<void> {
  const files = process.argv
    .slice(2)
    .filter(
      (a) => !a.startsWith("--") && (a.endsWith(".yaml") || a.endsWith(".yml")),
    )

  if (files.length === 0) {
    console.error("Usage: pnpm tsx scripts/run-scenario.ts <scenario.yaml> ...")
    process.exit(1)
  }

  const verdicts: ScenarioVerdict[] = []
  for (const file of files) {
    const resolved = path.resolve(file)
    try {
      const verdict = await runScenario(resolved)
      verdicts.push(verdict)
    } catch (err) {
      console.error(`Error loading ${file}: ${(err as Error).message}`)
      verdicts.push({
        scenario: file,
        agent: "unknown",
        pass: false,
        steps: [],
        durationMs: 0,
        totalCostUsd: 0,
      })
    }
  }

  printReport(verdicts)

  const allPass = verdicts.every((v) => v.pass)
  process.exit(allPass ? 0 : 1)
}

main().catch((err) => {
  console.error("Runner failed:", err)
  process.exit(2)
})
