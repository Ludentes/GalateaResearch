import type { TrustLevel } from "../../engine/types"
import { recordOutcome } from "../../memory/feedback-loop"
import type { AssembledContext, TranscriptTurn } from "../../memory/types"
import { emitEvent } from "../../observation/emit"
import type { ImageBlock } from "../types"
import { createPreToolUseHook } from "./hooks"
import { transcriptToTurns } from "./transcript-to-extraction"
import type {
  CodingSessionMessage,
  CodingToolAdapter,
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
  /** Optional images to include in the prompt (multimodal support) */
  images?: ImageBlock[]
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
  /** True if the adapter detected a stream stall (no activity for too long) */
  stallDetected?: boolean
  /** True if work-arc retried after a stall */
  retryAttempted?: boolean
}

/**
 * Execute a goal-level work arc: delegate a task to the coding adapter,
 * monitor the session, and return the result.
 *
 * This is the core of G.3 — Galatea decides WHAT, adapter decides HOW.
 */
export async function executeWorkArc(
  input: WorkArcInput,
): Promise<WorkArcResult> {
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
    images,
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
    images,
  })) {
    messages.push(msg)
  }

  // Find the result message
  let resultMsg = messages.find((m) => m.type === "result")

  // Retry once on stall — fresh session, no resume (stalled session is likely corrupted)
  let stallDetected = false
  let retryAttempted = false
  if (resultMsg?.type === "result" && resultMsg.subtype === "stall") {
    stallDetected = true
    const stallDurationMs = Date.now() - arcStart

    emitEvent({
      type: "log",
      source: "work-arc",
      body: "adapter.stall_detected",
      attributes: {
        "event.name": "adapter.stall_detected",
        severity: "warning",
        taskId: task.id,
        adapterName: adapter.name,
        stallDurationMs,
        sessionId: sessionId ?? "none",
        willRetry: true,
      },
    }).catch(() => {})

    retryAttempted = true
    const retryMessages: CodingSessionMessage[] = []
    for await (const msg of adapter.query({
      prompt: task.description,
      systemPrompt: context.systemPrompt,
      workingDirectory,
      hooks: { preToolUse },
      timeout,
      maxBudgetUsd,
      model,
      // No resume — fresh session
      images,
    })) {
      retryMessages.push(msg)
    }
    const retryResult = retryMessages.find((m) => m.type === "result")
    if (retryResult) {
      resultMsg = retryResult
      messages.length = 0
      messages.push(...retryMessages)
      emitEvent({
        type: "log",
        source: "work-arc",
        body: "adapter.stall_retry_succeeded",
        attributes: {
          "event.name": "adapter.stall_retry_succeeded",
          taskId: task.id,
          retryDurationMs: Date.now() - arcStart - stallDurationMs,
        },
      }).catch(() => {})
    } else {
      emitEvent({
        type: "log",
        source: "work-arc",
        body: "adapter.stall_retry_failed",
        attributes: {
          "event.name": "adapter.stall_retry_failed",
          severity: "error",
          taskId: task.id,
          retryDurationMs: Date.now() - arcStart - stallDurationMs,
        },
      }).catch(() => {})
    }
  }
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
    stall: "timeout",
  }

  const result: WorkArcResult = {
    status: statusMap[resultMsg.subtype] ?? "failed",
    text: resultMsg.text,
    transcript: resultMsg.transcript ?? [],
    durationMs: resultMsg.durationMs,
    costUsd: resultMsg.costUsd,
    numTurns: resultMsg.numTurns,
    sessionId: resultMsg.sessionId,
    stallDetected,
    retryAttempted,
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
