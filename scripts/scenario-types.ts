export interface ScenarioStep {
  send: string
  from: { platform: string; user: string }
  messageType?: string
  /** Override LLM provider for this step (e.g. "none" to simulate outage) */
  provider?: string
  expect: Record<string, unknown>
  /** Pre-condition the operational context before this step */
  setup?: {
    lastOutboundMinutesAgo?: number
    createTask?: {
      description: string
      phase?: string
      phaseMinutesAgo?: number
      status?: string
    }
    addHistory?: Array<{ role: string; content: string }>
  }
}

export interface ScenarioSetup {
  clear_ticks?: boolean
  clear_state?: boolean
}

export interface Scenario {
  scenario: string
  source_gherkin?: string
  agent: string
  setup?: ScenarioSetup
  steps: ScenarioStep[]
}

export interface CheckResult {
  field: string
  expected: string
  actual: string
  pass: boolean
}

export interface StepVerdict {
  step: number
  send: string
  pass: boolean
  checks: CheckResult[]
  tickId: string
  durationMs: number
  costUsd: number
}

export interface ScenarioVerdict {
  scenario: string
  agent: string
  pass: boolean
  steps: StepVerdict[]
  durationMs: number
  totalCostUsd: number
}
