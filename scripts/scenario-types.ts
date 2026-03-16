export interface ScenarioStep {
  /** Message to send (required unless trigger is set) */
  send?: string
  from?: { platform: string; user: string }
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
  /** Trigger a heartbeat tick instead of sending a message */
  trigger?: "heartbeat"
}

export interface ScenarioSetup {
  clear_ticks?: boolean
  clear_state?: boolean
  clear_knowledge?: boolean
}

export interface Scenario {
  scenario: string
  source_gherkin?: string
  agent: string
  /** Override LLM model for all steps (e.g. "sonnet" for dogfooding) */
  model?: string
  /** Scenario type: "regression" (default) or "dogfood" (modifies repo) */
  type?: "regression" | "dogfood"
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
