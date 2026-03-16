import type { SafetyCheckResult, TrustLevel } from "../../engine/types"
import type { ImageBlock } from "../types"

export type CodingSessionMessage =
  | { type: "tool_call"; toolName: string; toolInput: Record<string, unknown> }
  | { type: "tool_result"; toolName: string; result: string }
  | { type: "text"; text: string }
  | { type: "error"; error: string }
  | {
      type: "result"
      subtype: "success" | "error" | "timeout" | "budget_exceeded"
      text: string
      durationMs: number
      costUsd?: number
      numTurns?: number
      transcript?: CodingTranscriptEntry[]
      sessionId?: string
    }

export interface CodingTranscriptEntry {
  role: "assistant" | "tool_call" | "tool_result" | "user" | "system"
  content: string
  toolName?: string
  toolInput?: Record<string, unknown>
  timestamp: string
}

export interface AdapterHooks {
  preToolUse?: (
    toolName: string,
    toolInput: Record<string, unknown>,
  ) => Promise<SafetyCheckResult>
  postToolUse?: (
    toolName: string,
    toolInput: Record<string, unknown>,
    toolResult: string,
  ) => Promise<void>
  onStop?: (reason: string) => Promise<{ continueSession: boolean }>
}

export interface CodingQueryOptions {
  prompt: string
  systemPrompt: string
  workingDirectory: string
  hooks?: AdapterHooks
  trustLevel?: TrustLevel
  timeout?: number
  maxBudgetUsd?: number
  model?: string
  resume?: string
  /** Optional images to prepend to the prompt (multimodal support) */
  images?: ImageBlock[]
}

export interface CodingToolAdapter {
  query(options: CodingQueryOptions): AsyncIterable<CodingSessionMessage>
  isAvailable(): Promise<boolean>
  readonly name: string
}
