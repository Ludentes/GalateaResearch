import type { TrustLevel } from "../../engine/types"
import type { AssembledContext } from "../../memory/types"
import { createPreToolUseHook } from "./hooks"
import type {
  CodingToolAdapter,
  CodingSessionMessage,
  CodingTranscriptEntry,
} from "./types"

export interface WorkArcInput {
  adapter: CodingToolAdapter
  task: { id: string; description: string }
  context: AssembledContext
  workingDirectory: string
  trustLevel: TrustLevel
  timeout?: number
  maxBudgetUsd?: number
  model?: string
}

export interface WorkArcResult {
  status: "completed" | "failed" | "timeout" | "blocked" | "budget_exceeded"
  text: string
  transcript: CodingTranscriptEntry[]
  durationMs: number
  costUsd?: number
  numTurns?: number
}

/**
 * Execute a goal-level work arc: delegate a task to the coding adapter,
 * monitor the session, and return the result.
 *
 * This is the core of G.3 — Galatea decides WHAT, adapter decides HOW.
 */
export async function executeWorkArc(input: WorkArcInput): Promise<WorkArcResult> {
  const {
    adapter,
    task,
    context,
    workingDirectory,
    trustLevel,
    timeout = 300_000,
    maxBudgetUsd,
    model,
  } = input

  // Check adapter availability
  const available = await adapter.isAvailable()
  if (!available) {
    return {
      status: "blocked",
      text: `Coding tool adapter "${adapter.name}" is unavailable`,
      transcript: [],
      durationMs: 0,
    }
  }

  const preToolUse = createPreToolUseHook({ workingDirectory, trustLevel })

  const messages: CodingSessionMessage[] = []
  for await (const msg of adapter.query({
    prompt: task.description,
    systemPrompt: context.systemPrompt,
    workingDirectory,
    hooks: { preToolUse },
    timeout,
    maxBudgetUsd,
    model,
  })) {
    messages.push(msg)
  }

  // Find the result message
  const resultMsg = messages.find((m) => m.type === "result")
  if (!resultMsg || resultMsg.type !== "result") {
    return {
      status: "failed",
      text: "No result message from adapter",
      transcript: [],
      durationMs: 0,
    }
  }

  const statusMap: Record<string, WorkArcResult["status"]> = {
    success: "completed",
    error: "failed",
    timeout: "timeout",
    budget_exceeded: "budget_exceeded",
  }

  return {
    status: statusMap[resultMsg.subtype] ?? "failed",
    text: resultMsg.text,
    transcript: resultMsg.transcript ?? [],
    durationMs: resultMsg.durationMs,
    costUsd: resultMsg.costUsd,
    numTurns: resultMsg.numTurns,
  }
}
