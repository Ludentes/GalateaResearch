import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk"
import { emitEvent } from "../observation/emit"
import type { ContentBlock, MessageContent } from "./types"

// ---------------------------------------------------------------------------
// Session tracking — one persistent session per agent
// ---------------------------------------------------------------------------

const agentSessions = new Map<string, string>()

export function getAgentSessionId(agentId: string): string | undefined {
  return agentSessions.get(agentId)
}

export function clearAgentSession(agentId: string): void {
  agentSessions.delete(agentId)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClaudeCodeRespondResult {
  ok: boolean
  text: string
  toolCalls: number
  toolNames: string[]
  sessionId?: string
  costUsd?: number
  durationMs: number
}

// ---------------------------------------------------------------------------
// Env filtering — strip nesting detection vars so SDK subprocess works
// ---------------------------------------------------------------------------

const INHERITED_ENV_VARS = [
  "HOME",
  "LOGNAME",
  "PATH",
  "SHELL",
  "TERM",
  "USER",
  "LANG",
  "LC_ALL",
  "TMPDIR",
  "CLAUDE_CONFIG_DIR",
]

function getCleanEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of INHERITED_ENV_VARS) {
    const value = process.env[key]
    if (typeof value === "string" && !value.startsWith("()")) {
      env[key] = value
    }
  }
  return env
}

// ---------------------------------------------------------------------------
// Multimodal prompt helpers
// ---------------------------------------------------------------------------

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image"
      source: {
        type: "base64"
        media_type: string
        data: string
      }
    }

type AnthropicMessageParam = {
  role: "user"
  content: AnthropicContentBlock[]
}

function contentBlocksToAnthropicBlocks(
  blocks: ContentBlock[],
): AnthropicContentBlock[] {
  return blocks.map((b) => {
    if (b.type === "text") return { type: "text" as const, text: b.text }
    return {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: b.source.media_type,
        data: b.source.data,
      },
    }
  })
}

async function* makePromptStream(
  messageParam: AnthropicMessageParam,
): AsyncIterable<SDKUserMessage> {
  yield {
    type: "user",
    message: messageParam as SDKUserMessage["message"],
    parent_tool_use_id: null,
    session_id: "",
  }
}

// ---------------------------------------------------------------------------
// Respond via Agent SDK (direct, no AI SDK wrapper)
// ---------------------------------------------------------------------------

export async function runClaudeCodeRespond(opts: {
  agentId: string
  systemPrompt: string
  userMessage: MessageContent
  history?: Array<{ role: "user" | "assistant"; content: string }>
  workingDirectory?: string
  timeoutMs?: number
  model?: string
}): Promise<ClaudeCodeRespondResult> {
  const {
    agentId,
    systemPrompt,
    userMessage,
    history = [],
    workingDirectory = process.cwd(),
    timeoutMs = 120_000,
    model,
  } = opts

  const startTime = Date.now()
  const abortController = new AbortController()
  const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs)

  const toolNames: string[] = []
  let toolCalls = 0
  let resultText = ""
  let sessionId: string | undefined
  let costUsd: number | undefined

  try {
    const queryOptions: Record<string, unknown> = {
      cwd: workingDirectory,
      systemPrompt,
      permissionMode: "bypassPermissions" as const,
      allowDangerouslySkipPermissions: true,
      persistSession: false,
      abortController,
      maxTurns: 10,
      env: getCleanEnv(),
    }

    if (model) {
      queryOptions.model = model
    }

    // Build prompt with conversation history for context continuity
    const isMultimodal = Array.isArray(userMessage)
    const historyBlock =
      history.length > 0
        ? history
            .map(
              (h) =>
                `<${h.role === "user" ? "human" : "assistant"}>\n${h.content}\n</${h.role === "user" ? "human" : "assistant"}>`,
            )
            .join("\n\n")
        : ""
    const historyPrefix = historyBlock
      ? `<conversation_history>\n${historyBlock}\n</conversation_history>\n\n`
      : ""

    let prompt: string | AsyncIterable<SDKUserMessage>
    if (isMultimodal) {
      // Multimodal: build SDK message with content blocks
      const blocks = historyPrefix
        ? [
            { type: "text" as const, text: historyPrefix },
            ...contentBlocksToAnthropicBlocks(userMessage),
          ]
        : contentBlocksToAnthropicBlocks(userMessage)
      prompt = makePromptStream({
        role: "user",
        content: blocks,
      })
    } else {
      // String: existing path
      prompt = historyPrefix + userMessage
    }

    const stream = sdkQuery({
      prompt,
      options: queryOptions as Parameters<typeof sdkQuery>[0]["options"],
    })

    for await (const message of stream) {
      const msg = message as Record<string, unknown>
      const msgType = msg.type as string

      if (msgType === "assistant") {
        const betaMessage = msg.message as {
          content?: Array<{
            type: string
            text?: string
            name?: string
            input?: Record<string, unknown>
          }>
        }

        if (betaMessage?.content) {
          for (const block of betaMessage.content) {
            if (block.type === "tool_use" && block.name) {
              toolCalls++
              if (!toolNames.includes(block.name)) {
                toolNames.push(block.name)
              }
            }
          }
        }
      } else if (msgType === "system" && msg.subtype === "init") {
        sessionId = msg.session_id as string
        if (sessionId) {
          agentSessions.set(agentId, sessionId)
        }
      } else if (msgType === "result") {
        const subtype = msg.subtype as string
        costUsd = msg.total_cost_usd as number | undefined
        sessionId = msg.session_id as string

        if (sessionId) {
          agentSessions.set(agentId, sessionId)
        }

        if (subtype === "success") {
          resultText = (msg.result as string) ?? ""
        } else {
          // SDK returned an error result — will be marked as ok: false
          const errors = msg.errors as string[] | undefined
          resultText = errors?.join("; ") ?? `Agent SDK ${subtype || "error"}`
          // Throw so it goes through the error path with ok: false
          throw new Error(resultText)
        }
      }
    }

    emitEvent({
      type: "log",
      source: `${agentId}-api`,
      body: "claude_code_respond.completed",
      attributes: {
        "event.name": "claude_code_respond.completed",
        toolCalls: String(toolCalls),
        sessionResumed: "false",
        sessionId: sessionId ?? "unknown",
        costUsd: costUsd != null ? String(costUsd.toFixed(4)) : "N/A",
      },
    }).catch(() => {})

    return {
      ok: true,
      text: resultText,
      toolCalls,
      toolNames,
      sessionId,
      costUsd,
      durationMs: Date.now() - startTime,
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)

    // If session failed, clear it so next attempt starts fresh
    if (agentSessions.has(agentId)) {
      agentSessions.delete(agentId)
    }

    return {
      ok: false,
      text: `Error: ${errorMessage}`,
      toolCalls,
      toolNames,
      durationMs: Date.now() - startTime,
    }
  } finally {
    clearTimeout(timeoutHandle)
  }
}
