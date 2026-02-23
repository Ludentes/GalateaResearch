import { generateText, zodSchema } from "ai"
import type { LanguageModel } from "ai"
import { z } from "zod"
import { ollamaQueue } from "../providers/ollama-queue"
import { emitEvent } from "../observation/emit"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentTool {
  description: string
  parameters: z.ZodTypeAny
  execute: (args: Record<string, unknown>) => Promise<string>
}

export interface LoopConfig {
  maxSteps: number
  timeoutMs: number
}

export interface LoopResult {
  text: string
  steps: LoopStep[]
  finishReason: "text" | "budget_exhausted" | "timeout" | "no_tool_handler"
  totalSteps: number
}

export interface LoopStep {
  type: "tool_call" | "text"
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolResult?: string
  text?: string
  durationMs: number
}

/** Simple message type for loop input */
export interface LoopMessage {
  role: "user" | "assistant" | "system"
  content: string
}

const DEFAULT_CONFIG: LoopConfig = {
  maxSteps: 5,
  timeoutMs: 60_000,
}

// ---------------------------------------------------------------------------
// Agent loop — ReAct pattern with budget controls
// ---------------------------------------------------------------------------

export async function runAgentLoop(opts: {
  model: LanguageModel
  system: string
  messages: LoopMessage[]
  tools?: Record<string, AgentTool>
  config?: Partial<LoopConfig>
  history?: LoopMessage[]
}): Promise<LoopResult> {
  const config = { ...DEFAULT_CONFIG, ...opts.config }
  const agentTools = opts.tools ?? {}
  const steps: LoopStep[] = []
  const startTime = Date.now()

  // Build message array — mutable, appended with tool results during loop
  const sdkMessages: Array<Record<string, unknown>> = [
    ...(opts.history ?? []).map((m) => ({ role: m.role, content: m.content })),
    ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
  ]

  // Build tools in AI SDK format
  const hasTools = Object.keys(agentTools).length > 0
  const sdkTools: Record<string, unknown> = {}
  if (hasTools) {
    for (const [name, agentTool] of Object.entries(agentTools)) {
      sdkTools[name] = {
        description: agentTool.description,
        parameters: zodSchema(agentTool.parameters),
      }
    }
  }

  for (let step = 0; step < config.maxSteps; step++) {
    // Budget check: timeout
    const elapsed = Date.now() - startTime
    if (elapsed >= config.timeoutMs) {
      const timeoutText =
        "I ran out of time processing this request. I'll continue where I left off next tick."
      steps.push({ type: "text", text: timeoutText, durationMs: 0 })
      return {
        text: timeoutText,
        steps,
        finishReason: "timeout",
        totalSteps: step,
      }
    }

    const stepStart = Date.now()
    const remainingMs = config.timeoutMs - elapsed

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const generateOpts: any = {
      model: opts.model,
      system: opts.system,
      messages: sdkMessages,
      abortSignal: AbortSignal.timeout(remainingMs),
    }
    if (hasTools) {
      generateOpts.tools = sdkTools
    }

    const result = await ollamaQueue.enqueue(
      () => generateText(generateOpts),
      "batch",
    )

    // Check if LLM returned tool calls
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolCalls: any[] = (result as any).toolCalls ?? []

    if (toolCalls.length === 0 || !hasTools) {
      // Final text response — done
      steps.push({
        type: "text",
        text: result.text,
        durationMs: Date.now() - stepStart,
      })
      return {
        text: result.text,
        steps,
        finishReason: "text",
        totalSteps: step + 1,
      }
    }

    // Process tool calls
    for (const tc of toolCalls) {
      const toolName: string = tc.toolName
      const toolCallId: string = tc.toolCallId
      const toolArgs: Record<string, unknown> = tc.args ?? {}

      const tool = agentTools[toolName]
      if (!tool) {
        const fallbackText = result.text || `Unknown tool: ${toolName}`
        steps.push({
          type: "tool_call",
          toolName,
          toolArgs,
          durationMs: Date.now() - stepStart,
        })
        return {
          text: fallbackText,
          steps,
          finishReason: "no_tool_handler",
          totalSteps: step + 1,
        }
      }

      // Execute tool
      let toolResult: string
      try {
        toolResult = await tool.execute(toolArgs)
      } catch (err) {
        toolResult = `Tool error: ${String(err)}`
        emitEvent({
          type: "log",
          source: "galatea-api",
          body: "agent_loop.tool_error",
          attributes: {
            "event.name": "agent_loop.tool_error",
            severity: "warning",
            tool: toolName,
            error: String(err),
          },
        }).catch(() => {})
      }

      steps.push({
        type: "tool_call",
        toolName,
        toolArgs,
        toolResult,
        durationMs: Date.now() - stepStart,
      })

      // Feed tool result back into conversation for next iteration
      sdkMessages.push({
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId,
            toolName,
            args: toolArgs,
          },
        ],
      })
      sdkMessages.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId,
            toolName,
            result: toolResult,
          },
        ],
      })
    }
  }

  // Budget exhausted — force a text response
  const budgetText =
    "I've reached my processing budget for this tick. I'll continue in the next tick."
  steps.push({ type: "text", text: budgetText, durationMs: 0 })
  return {
    text: budgetText,
    steps,
    finishReason: "budget_exhausted",
    totalSteps: config.maxSteps,
  }
}
