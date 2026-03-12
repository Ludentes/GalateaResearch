import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
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
  if (scenario.setup?.clear_ticks) {
    const tickPath = `data/observations/ticks/${scenario.agent}.jsonl`
    await rm(tickPath, { force: true })
  }
  if (scenario.setup?.clear_state) {
    await mkdir("data/agent", { recursive: true })
    await writeFile(
      "data/agent/state.json",
      JSON.stringify({
        lastActivity: new Date().toISOString(),
        pendingMessages: [],
      }),
    )
  }
}

async function executeStep(
  scenario: Scenario,
  step: Scenario["steps"][number],
  stepIndex: number,
): Promise<StepVerdict> {
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
    }
  }

  return assertStep(body.tick, step.expect, stepIndex, step.send)
}

async function runScenario(filePath: string): Promise<ScenarioVerdict> {
  const scenario = await loadScenario(filePath)
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
  }
}

function printReport(verdicts: ScenarioVerdict[]): void {
  const total = verdicts.length
  const passed = verdicts.filter((v) => v.pass).length
  const failed = total - passed

  const now = new Date()
  const ts = now.toISOString().replace("T", " ").slice(0, 16)

  console.log(`\n${BOLD}=== Scenario Run: ${ts} ===${RESET}`)
  console.log(
    `Scenarios: ${total} run, ${GREEN}${passed} passed${RESET}, ${failed > 0 ? RED : ""}${failed} failed${RESET}\n`,
  )

  for (const v of verdicts) {
    const tag = v.pass ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`
    console.log(`${tag}: ${v.scenario} (${v.agent})`)

    for (const s of v.steps) {
      const stepTag = s.pass ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`
      console.log(`  Step ${s.step}: ${stepTag}`)

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
