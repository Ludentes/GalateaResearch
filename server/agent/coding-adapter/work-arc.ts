import type { TrustLevel } from "../../engine/types"
import type { AssembledContext, TranscriptTurn } from "../../memory/types"
import { createPreToolUseHook } from "./hooks"
import { recordOutcome } from "../../memory/feedback-loop"
import { transcriptToTurns } from "./transcript-to-extraction"
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
  storePath?: string
  sessionId?: string
}

export interface WorkArcResult {
  status: "completed" | "failed" | "timeout" | "blocked" | "budget_exceeded"
  text: string
  transcript: CodingTranscriptEntry[]
  durationMs: number
  costUsd?: number
  numTurns?: number
  extractedTurns?: TranscriptTurn[]
  sessionId?: string
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
    sessionId,
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

  const arcStart = Date.now()
  const messages: CodingSessionMessage[] = []
  for await (const msg of adapter.query({
    prompt: task.description,
    systemPrompt: context.systemPrompt,
    workingDirectory,
    hooks: { preToolUse },
    timeout,
    maxBudgetUsd,
    model,
    resume: sessionId,
  })) {
    messages.push(msg)
    const elapsed = Date.now() - arcStart
    if (elapsed > 250_000) {
      console.warn(
        `[work-arc] Long-running adapter: ${Math.round(elapsed / 1000)}s / ${Math.round(timeout / 1000)}s budget`,
      )
    }
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

  const result: WorkArcResult = {
    status: statusMap[resultMsg.subtype] ?? "failed",
    text: resultMsg.text,
    transcript: resultMsg.transcript ?? [],
    durationMs: resultMsg.durationMs,
    costUsd: resultMsg.costUsd,
    numTurns: resultMsg.numTurns,
    sessionId: resultMsg.sessionId,
  }

  // Feed transcript to extraction pipeline (G.5) — best-effort, non-blocking
  if (result.transcript.length > 0 && result.status === "completed") {
    try {
      const turns = transcriptToTurns(result.transcript)
      if (turns.length > 0) {
        result.extractedTurns = turns
      }
    } catch {
      // Extraction is best-effort — don't fail the work arc
    }
  }

  // Record outcome for feedback loop (best-effort, non-blocking)
  if (input.storePath && context.exposedEntryIds?.length) {
    recordOutcome(
      {
        status: result.status,
        text: result.text,
        transcript: result.transcript,
        durationMs: result.durationMs,
      },
      context.exposedEntryIds,
      input.storePath,
    ).catch((err) => console.warn("[work-arc] Failed to record outcome:", err))
  }

  return result
}
