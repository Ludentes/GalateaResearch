import type { LanguageModel, ModelMessage } from "ai"
import { generateText, zodSchema } from "ai"
import type { z } from "zod"
import { emitEvent } from "../observation/emit"
import { ollamaQueue } from "../providers/ollama-queue"

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

  // Build initial messages as proper ModelMessage types
  const seedMessages: ModelMessage[] = [
    ...(opts.history ?? []).map(
      (m) => ({ role: m.role, content: m.content }) as ModelMessage,
    ),
    ...opts.messages.map(
      (m) => ({ role: m.role, content: m.content }) as ModelMessage,
    ),
  ]

  // Accumulated messages — grows with tool call/result pairs
  let conversationMessages: ModelMessage[] = [...seedMessages]

  // Build tools in AI SDK format with execute functions
  const hasTools = Object.keys(agentTools).length > 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdkTools: Record<string, any> = {}
  if (hasTools) {
    for (const [name, agentTool] of Object.entries(agentTools)) {
      sdkTools[name] = {
        description: agentTool.description,
        parameters: zodSchema(agentTool.parameters),
        execute: async (args: Record<string, unknown>) => {
          return agentTool.execute(args)
        },
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
      messages: conversationMessages,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolResults: any[] = (result as any).toolResults ?? []

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

    // Record tool calls as steps
    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i]
      const tr = toolResults[i]
      const tool = agentTools[tc.toolName]

      if (!tool) {
        const fallbackText = result.text || `Unknown tool: ${tc.toolName}`
        steps.push({
          type: "tool_call",
          toolName: tc.toolName,
          toolArgs: tc.args,
          durationMs: Date.now() - stepStart,
        })
        return {
          text: fallbackText,
          steps,
          finishReason: "no_tool_handler",
          totalSteps: step + 1,
        }
      }

      // Tool was already executed by the SDK via the execute function
      const toolResultStr =
        typeof tr?.result === "string" ? tr.result : JSON.stringify(tr?.result)

      steps.push({
        type: "tool_call",
        toolName: tc.toolName,
        toolArgs: tc.args,
        toolResult: toolResultStr,
        durationMs: Date.now() - stepStart,
      })

      emitEvent({
        type: "log",
        source: "galatea-api",
        body: "agent_loop.tool_call",
        attributes: {
          "event.name": "agent_loop.tool_call",
          tool: tc.toolName,
          step: step + 1,
        },
      }).catch(() => {})
    }

    // Use the SDK's response.messages for proper message typing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responseMessages: ModelMessage[] =
      (result as any).response?.messages ?? []
    conversationMessages = [...conversationMessages, ...responseMessages]
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
