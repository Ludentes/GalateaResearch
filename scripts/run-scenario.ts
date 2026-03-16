import { readFile } from "node:fs/promises"
import path from "node:path"
import YAML from "yaml"
import { assertStep } from "./scenario-assert"
import type { Scenario, ScenarioVerdict, StepVerdict } from "./scenario-types"

const BASE_URL = process.env.SCENARIO_BASE_URL ?? "http://localhost:13000"
const FETCH_TIMEOUT_MS = 360_000 // 6 minutes — must exceed server-side adapter timeout (5 min)
const DOGFOOD_TIMEOUT_MS = 900_000 // 15 minutes — dogfood tasks involve real coding/design work

// ANSI colors
const GREEN = "\x1b[32m"
const RED = "\x1b[31m"
const YELLOW = "\x1b[33m"
const CYAN = "\x1b[36m"
const DIM = "\x1b[2m"
const BOLD = "\x1b[1m"
const RESET = "\x1b[0m"

let traceMode = false

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function printTrace(tick: any, stepIndex: number): void {
  console.log(`\n${CYAN}--- TRACE: Step ${stepIndex} ---${RESET}`)

  // Diagnostics block
  const diag = tick.diagnostics
  if (diag) {
    console.log(`${CYAN}  Diagnostics:${RESET}`)
    console.log(
      `    specLoaded:           ${diag.specLoaded ? GREEN + "true" : RED + "false"}${RESET}`,
    )
    console.log(`    operationalMemoryPath: ${diag.operationalMemoryPath}`)
    console.log(`    knowledgeStorePath:    ${diag.knowledgeStorePath}`)
    console.log(`    workspacePath:         ${diag.workspacePath ?? "(none)"}`)
    console.log(`    modelUsed:             ${diag.modelUsed ?? "(default)"}`)
    console.log(
      `    providerUsed:          ${diag.providerUsed ?? "(default)"}`,
    )
    console.log(`    factsRetrieved:        ${diag.factsRetrieved ?? 0}`)
  } else {
    console.log(
      `  ${YELLOW}WARNING: No diagnostics in tick record — old server version?${RESET}`,
    )
  }

  // Homeostasis
  console.log(`${CYAN}  Homeostasis:${RESET}`)
  const homeo = tick.homeostasis ?? {}
  for (const [dim, val] of Object.entries(homeo)) {
    const color = val === "HEALTHY" ? DIM : val === "HIGH" ? YELLOW : RED
    console.log(`    ${dim}: ${color}${val}${RESET}`)
  }

  // Routing
  console.log(`${CYAN}  Routing:${RESET}`)
  console.log(`    level:    ${tick.routing?.level}`)
  console.log(`    taskType: ${tick.routing?.taskType ?? "(none)"}`)
  console.log(`    reasoning: ${tick.routing?.reasoning ?? "(none)"}`)

  // Execution
  console.log(`${CYAN}  Execution:${RESET}`)
  console.log(`    adapter:        ${tick.execution?.adapter}`)
  console.log(`    sessionResumed: ${tick.execution?.sessionResumed}`)
  console.log(`    toolCalls:      ${tick.execution?.toolCalls}`)
  console.log(
    `    toolNames:      ${(tick.execution?.toolNames ?? []).join(", ") || "(none)"}`,
  )
  console.log(`    durationMs:     ${tick.execution?.durationMs}`)
  console.log(`    costUsd:        ${tick.execution?.costUsd ?? "null"}`)

  // Trigger
  console.log(`${CYAN}  Trigger:${RESET}`)
  console.log(`    type:       ${tick.trigger?.type}`)
  console.log(`    source:     ${tick.trigger?.source ?? "(none)"}`)
  console.log(`    trustLevel: ${tick.trigger?.trustLevel ?? "(none)"}`)

  // Guidance
  const guidance = tick.guidance ?? []
  if (guidance.length > 0) {
    console.log(`${CYAN}  Guidance (${guidance.length}):${RESET}`)
    for (const g of guidance) {
      console.log(`    ${DIM}${(g as string).slice(0, 120)}${RESET}`)
    }
  }

  // Outcome
  console.log(`${CYAN}  Outcome:${RESET}`)
  console.log(`    action:   ${tick.outcome?.action}`)
  console.log(
    `    response: ${DIM}${(tick.outcome?.response ?? "").slice(0, 200)}${RESET}`,
  )

  // Anomaly warnings
  const warnings: string[] = []
  if (diag && !diag.specLoaded) {
    warnings.push("Agent spec NOT loaded — using defaults for everything")
  }
  if (diag?.operationalMemoryPath === "data/agent/operational-context.json") {
    warnings.push(
      "Using DEFAULT operational memory path — may cause cross-agent contamination",
    )
  }
  if (!tick.trigger?.trustLevel || tick.trigger.trustLevel === "NONE") {
    warnings.push("Trust level is NONE — message may be ignored or restricted")
  }
  const allHealthy = Object.values(homeo).every((v) => v === "HEALTHY")
  if (allHealthy && Object.keys(homeo).length > 0) {
    warnings.push(
      "All dimensions HEALTHY — verify this isn't caused by missing data",
    )
  }
  if (tick.execution?.sessionResumed) {
    warnings.push("Session was RESUMED — verify correct session for this agent")
  }

  if (warnings.length > 0) {
    console.log(`${YELLOW}  Warnings:${RESET}`)
    for (const w of warnings) {
      console.log(`    ${YELLOW}⚠ ${w}${RESET}`)
    }
  }
  console.log(`${CYAN}--- END TRACE ---${RESET}\n`)
}

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
        clearKnowledge: scenario.setup?.clear_knowledge ?? false,
      }),
      signal: AbortSignal.timeout(30_000),
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
  const timeoutMs =
    scenario.type === "dogfood" ? DOGFOOD_TIMEOUT_MS : FETCH_TIMEOUT_MS
  const stepStart = Date.now()
  const sendLabel = step.send
    ? typeof step.send === "string"
      ? step.send
      : `[${step.send.length} content blocks]`
    : "(heartbeat)"

  // Handle per-step setup (pre-condition operational context)
  if (step.setup) {
    const setupRes = await fetch(`${BASE_URL}/api/agent/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: scenario.agent,
        ...step.setup,
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!setupRes.ok) {
      const err = await setupRes.text()
      console.error(`Setup failed for step ${stepIndex}: ${err}`)
    }
  }

  let res: Response

  // Handle heartbeat trigger (no message injection)
  if (step.trigger === "heartbeat") {
    try {
      res = await fetch(`${BASE_URL}/api/agent/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: scenario.agent }),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      return {
        step: stepIndex,
        send: sendLabel,
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
  } else {
    const injectBody = JSON.stringify({
      agentId: scenario.agent,
      content: step.send,
      from: step.from!.user,
      channel: step.from!.platform,
      messageType: step.messageType,
      ...(step.provider ? { provider: step.provider } : {}),
      ...(scenario.model ? { model: scenario.model } : {}),
    })

    try {
      res = await fetch(`${BASE_URL}/api/agent/inject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: injectBody,
        signal: AbortSignal.timeout(30_000),
      })
    } catch (err) {
      return {
        step: stepIndex,
        send: sendLabel,
        pass: false,
        checks: [
          {
            field: "http",
            expected: "202",
            actual: `connection error: ${(err as Error).message}`,
            pass: false,
          },
        ],
        tickId: "",
        durationMs: Date.now() - stepStart,
        costUsd: 0,
      }
    }
  }

  // Handle async job polling (202 response)
  if (res.status === 202) {
    const injectResult = await res.json()
    const jobId = injectResult.jobId

    if (jobId) {
      // Poll for job completion
      const pollStart = Date.now()
      let job: any
      while (Date.now() - pollStart < timeoutMs) {
        const pollRes = await fetch(`${BASE_URL}/api/agent/jobs/${jobId}`, {
          signal: AbortSignal.timeout(5000),
        })
        job = await pollRes.json()
        if (job.status === "completed" || job.status === "failed") break
        await new Promise((r) => setTimeout(r, 1000))
      }

      if (!job || job.status !== "completed") {
        return {
          step: stepIndex,
          send: sendLabel,
          pass: false,
          checks: [
            {
              field: "job",
              expected: "completed",
              actual: job?.status ?? "timeout",
              pass: false,
            },
          ],
          tickId: "",
          durationMs: Date.now() - stepStart,
          costUsd: 0,
        }
      }

      // Build response with tick record for assertion pipeline
      const tickRecord = job.result?.tick
      res = new Response(JSON.stringify({ tick: tickRecord }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }
  }

  if (!res.ok) {
    const errText = await res.text()
    return {
      step: stepIndex,
      send: sendLabel,
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
      send: sendLabel,
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

  if (traceMode && body.tick) {
    printTrace(body.tick, stepIndex)
  }

  const verdict = assertStep(body.tick, step.expect, stepIndex, sendLabel)
  verdict.durationMs = Date.now() - stepStart
  verdict.costUsd = body.tick.execution?.costUsd ?? 0
  return verdict
}

async function runScenario(
  filePath: string,
  opts?: { regressionOnly?: boolean },
): Promise<ScenarioVerdict | "skipped"> {
  const scenario = await loadScenario(filePath)

  // Skip dogfood scenarios in regression mode
  if (opts?.regressionOnly && scenario.type === "dogfood") {
    return "skipped"
  }

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
  const args = process.argv.slice(2)
  const regressionOnly = args.includes("--regression")
  traceMode = args.includes("--trace")
  const files = args.filter(
    (a) => !a.startsWith("--") && (a.endsWith(".yaml") || a.endsWith(".yml")),
  )

  if (files.length === 0) {
    console.error(
      "Usage: pnpm tsx scripts/run-scenario.ts [--regression] <scenario.yaml> ...",
    )
    process.exit(1)
  }

  const verdicts: ScenarioVerdict[] = []
  let passCount = 0
  let failCount = 0
  let skipCount = 0

  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx]
    const resolved = path.resolve(file)
    const label = path.basename(file, ".yaml")
    process.stderr.write(
      `${DIM}[${idx + 1}/${files.length}]${RESET} ${label} ... `,
    )
    try {
      const verdict = await runScenario(resolved, { regressionOnly })
      if (verdict === "skipped") {
        skipCount++
        process.stderr.write(`${DIM}SKIP (dogfood)${RESET}\n`)
        continue
      }
      verdicts.push(verdict)
      if (verdict.pass) {
        passCount++
        process.stderr.write(
          `${GREEN}PASS${RESET} ${DIM}${formatDuration(verdict.durationMs)}${RESET}\n`,
        )
      } else {
        failCount++
        const failedChecks = verdict.steps
          .filter((s) => !s.pass)
          .flatMap((s) =>
            s.checks
              .filter((c) => !c.pass)
              .map(
                (c) =>
                  `${c.field}: expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(c.actual)}`,
              ),
          )
        process.stderr.write(
          `${RED}FAIL${RESET} ${DIM}${formatDuration(verdict.durationMs)}${RESET}\n`,
        )
        for (const msg of failedChecks.slice(0, 3)) {
          process.stderr.write(`  ${DIM}${msg}${RESET}\n`)
        }
      }
    } catch (err) {
      failCount++
      process.stderr.write(`${RED}ERROR${RESET} ${(err as Error).message}\n`)
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

  const skipMsg = skipCount > 0 ? `, ${skipCount} skipped` : ""
  process.stderr.write(
    `\n${BOLD}Progress: ${GREEN}${passCount}${RESET}${BOLD}/${verdicts.length} passed, ${failCount > 0 ? RED : ""}${failCount} failed${RESET}${skipMsg}\n`,
  )

  printReport(verdicts)

  const allPass = verdicts.every((v) => v.pass)
  process.exit(allPass ? 0 : 1)
}

main().catch((err) => {
  console.error("Runner failed:", err)
  process.exit(2)
})
