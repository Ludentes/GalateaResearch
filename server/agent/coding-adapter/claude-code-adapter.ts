import { readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk"
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import type { ImageBlock } from "../types"
import type {
  CodingQueryOptions,
  CodingSessionMessage,
  CodingToolAdapter,
  CodingTranscriptEntry,
} from "./types"

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
  // Agent identity — set by tick pipeline per-agent
  "GITLAB_TOKEN",
  "GIT_CONFIG_NOSYSTEM",
]

/**
 * Read fresh OAuth token from ~/.claude/.credentials.json.
 * Returns undefined if not available (falls back to SDK's own auth).
 */
function readFreshOAuthToken(): string | undefined {
  try {
    const credPath = join(homedir(), ".claude", ".credentials.json")
    const creds = JSON.parse(readFileSync(credPath, "utf-8"))
    return creds.claudeAiOauth?.accessToken
  } catch {
    return undefined
  }
}

function getCleanEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of INHERITED_ENV_VARS) {
    const value = process.env[key]
    if (typeof value === "string" && !value.startsWith("()")) {
      env[key] = value
    }
  }
  // Pass fresh OAuth token directly — avoids race condition where
  // another Claude Code session refreshes the token between our
  // file read and the SDK subprocess's file read
  const token = readFreshOAuthToken()
  if (token) {
    env.CLAUDE_CODE_OAUTH_TOKEN = token
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

function imagesToAnthropicBlocks(
  images: ImageBlock[],
): AnthropicContentBlock[] {
  return images.map((img) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: img.source.media_type,
      data: img.source.data,
    },
  }))
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

function isAuthError(text: string): boolean {
  return (
    text.includes("401") ||
    text.includes("authentication_error") ||
    text.includes("OAuth token has expired") ||
    text.includes("Unauthorized")
  )
}

export class ClaudeCodeAdapter implements CodingToolAdapter {
  readonly name = "claude-code"

  async isAvailable(): Promise<boolean> {
    return typeof sdkQuery === "function"
  }

  async *query(
    options: CodingQueryOptions,
  ): AsyncIterable<CodingSessionMessage> {
    // Try once, retry on auth error (token may have been refreshed by Claude Code)
    const firstAttempt = this._executeQuery(options)
    const messages: CodingSessionMessage[] = []
    let gotAuthError = false

    for await (const msg of firstAttempt) {
      messages.push(msg)
      // Detect auth errors — SDK may return them as "success" (Claude Code
      // reports the error as its answer) or as "error" (SDK catches it)
      if (
        msg.type === "result" &&
        typeof msg.text === "string" &&
        isAuthError(msg.text) &&
        messages.filter((m) => m.type === "tool_call").length === 0
      ) {
        gotAuthError = true
        break
      }
    }

    if (gotAuthError) {
      // Wait for Claude Code to refresh its token, then retry once
      await new Promise((r) => setTimeout(r, 3000))
      yield* this._executeQuery(options)
      return
    }

    // No auth error — yield all collected messages
    for (const msg of messages) {
      yield msg
    }
  }

  private async *_executeQuery(
    options: CodingQueryOptions,
  ): AsyncIterable<CodingSessionMessage> {
    const {
      prompt,
      systemPrompt,
      workingDirectory,
      hooks,
      timeout,
      maxBudgetUsd,
      model,
      resume,
      images,
    } = options

    const transcript: CodingTranscriptEntry[] = []
    const startTime = Date.now()

    const abortController = new AbortController()
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    if (timeout) {
      timeoutHandle = setTimeout(() => abortController.abort(), timeout)
    }

    try {
      const sdkHooks: Record<
        string,
        Array<{ hooks: Array<(...args: unknown[]) => Promise<unknown>> }>
      > = {}

      if (hooks?.preToolUse) {
        const preToolUseHook = hooks.preToolUse
        sdkHooks.PreToolUse = [
          {
            hooks: [
              async (input: unknown) => {
                const hookInput = input as {
                  tool_name: string
                  tool_input: Record<string, unknown>
                }
                const result = await preToolUseHook(
                  hookInput.tool_name,
                  (hookInput.tool_input ?? {}) as Record<string, unknown>,
                )
                return {
                  continue: result.decision === "allow",
                  hookSpecificOutput: {
                    hookEventName: "PreToolUse" as const,
                    permissionDecision: result.decision,
                    permissionDecisionReason: result.reason,
                  },
                }
              },
            ],
          },
        ]
      }

      if (hooks?.postToolUse) {
        const postToolUseHook = hooks.postToolUse
        sdkHooks.PostToolUse = [
          {
            hooks: [
              async (input: unknown) => {
                const hookInput = input as {
                  tool_name: string
                  tool_input: Record<string, unknown>
                  tool_response: unknown
                }
                await postToolUseHook(
                  hookInput.tool_name,
                  (hookInput.tool_input ?? {}) as Record<string, unknown>,
                  String(hookInput.tool_response ?? ""),
                )
                return { continue: true }
              },
            ],
          },
        ]
      }

      const cleanEnv = getCleanEnv()
      const sdkOptions: Record<string, unknown> = {
        cwd: workingDirectory,
        systemPrompt,
        permissionMode: "bypassPermissions" as const,
        allowDangerouslySkipPermissions: true,
        settingSources: ["project"] as const,
        abortController,
        hooks: Object.keys(sdkHooks).length > 0 ? sdkHooks : undefined,
        persistSession: true,
        env: cleanEnv,
      }

      if (maxBudgetUsd !== undefined) {
        sdkOptions.maxBudgetUsd = maxBudgetUsd
      }
      if (model !== undefined) {
        sdkOptions.model = model
      }
      if (resume) {
        sdkOptions.resume = resume
      }

      // Build prompt — multimodal when images are provided
      let sdkPrompt: string | AsyncIterable<SDKUserMessage> = prompt
      if (images?.length) {
        const blocks: AnthropicContentBlock[] = [
          ...imagesToAnthropicBlocks(images),
          { type: "text", text: prompt },
        ]
        sdkPrompt = makePromptStream({ role: "user", content: blocks })
      }

      const stream = sdkQuery({
        prompt: sdkPrompt,
        options: sdkOptions as Parameters<typeof sdkQuery>[0]["options"],
      })

      for await (const message of stream) {
        const sdkMsg = message as Record<string, unknown>
        const msgType = sdkMsg.type as string

        if (msgType === "assistant") {
          const betaMessage = sdkMsg.message as {
            content?: Array<{
              type: string
              text?: string
              name?: string
              input?: Record<string, unknown>
              id?: string
            }>
          }

          if (betaMessage?.content) {
            for (const block of betaMessage.content) {
              if (block.type === "text" && block.text) {
                transcript.push({
                  role: "assistant",
                  content: block.text,
                  timestamp: new Date().toISOString(),
                })
                yield { type: "text", text: block.text }
              } else if (block.type === "tool_use" && block.name) {
                const toolInput = (block.input ?? {}) as Record<string, unknown>
                transcript.push({
                  role: "tool_call",
                  content: JSON.stringify(toolInput),
                  toolName: block.name,
                  toolInput,
                  timestamp: new Date().toISOString(),
                })
                yield { type: "tool_call", toolName: block.name, toolInput }
              }
            }
          }
        } else if (msgType === "result") {
          const subtype = sdkMsg.subtype as string
          const durationMs =
            (sdkMsg.duration_ms as number) ?? Date.now() - startTime
          const costUsd = sdkMsg.total_cost_usd as number | undefined
          const numTurns = sdkMsg.num_turns as number | undefined
          const resultSessionId = sdkMsg.session_id as string | undefined

          if (subtype === "success") {
            const resultText = (sdkMsg.result as string) ?? ""
            yield {
              type: "result",
              subtype: "success",
              text: resultText,
              durationMs,
              costUsd,
              numTurns,
              transcript,
              sessionId: resultSessionId,
            }
          } else if (subtype === "error_max_budget_usd") {
            yield {
              type: "result",
              subtype: "budget_exceeded",
              text:
                (sdkMsg.errors as string[])?.join("; ") ?? "Budget exceeded",
              durationMs,
              costUsd,
              numTurns,
              transcript,
              sessionId: resultSessionId,
            }
          } else if (subtype === "error_max_turns") {
            yield {
              type: "result",
              subtype: "timeout",
              text:
                (sdkMsg.errors as string[])?.join("; ") ?? "Max turns exceeded",
              durationMs,
              costUsd,
              numTurns,
              transcript,
              sessionId: resultSessionId,
            }
          } else {
            // error_during_execution and other error subtypes
            yield {
              type: "result",
              subtype: "error",
              text: (sdkMsg.errors as string[])?.join("; ") ?? "Unknown error",
              durationMs,
              costUsd,
              numTurns,
              transcript,
              sessionId: resultSessionId,
            }
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      yield { type: "error", error: errorMessage }
      yield {
        type: "result",
        subtype: "error",
        text: errorMessage,
        durationMs: Date.now() - startTime,
        transcript,
      }
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
      }
    }
  }
}
