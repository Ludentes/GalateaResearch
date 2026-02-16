import { generateText } from "ai"
import { assessDimensions } from "../engine/homeostasis-engine"
import type { AgentContext } from "../engine/types"
import { assembleContext } from "../memory/context-assembler"
import { retrieveRelevantFacts } from "../memory/fact-retrieval"
import { getModelWithFallback } from "../providers"
import {
  OllamaBackpressureError,
  OllamaCircuitOpenError,
  ollamaQueue,
} from "../providers/ollama-queue"
import { emitEvent } from "../observation/emit"
import {
  appendActivityLog,
  getAgentState,
  removePendingMessage,
  updateAgentState,
} from "./agent-state"
import { dispatch } from "./dispatcher"
import type { SelfModel, TickResult } from "./types"

interface TickOptions {
  statePath?: string
  storePath?: string
}

export async function tick(
  _trigger: "manual" | "heartbeat" | "webhook",
  opts?: TickOptions,
): Promise<TickResult> {
  const statePath = opts?.statePath
  const storePath = opts?.storePath ?? "data/memory/entries.jsonl"

  // Stage 1: Self-model (check available providers)
  const selfModel = await checkSelfModel()

  // Stage 2: Read state
  const state = await getAgentState(statePath)
  const pending = state.pendingMessages

  // Stage 3: Decide what to act on
  if (pending.length > 0) {
    const msg = pending[0] // oldest first

    // Retrieve facts relevant to the message + sender entity
    const facts = await retrieveRelevantFacts(msg.content, storePath, {
      additionalEntities: [msg.from],
    })
    const retrievedFacts = facts.entries

    const agentContext: AgentContext = {
      sessionId: `tick-${Date.now()}`,
      currentMessage: msg.content,
      messageHistory: [],
      retrievedFacts,
      lastMessageTime: new Date(msg.receivedAt),
      hasAssignedTask: !!state.activeTask,
    }

    const homeostasis = assessDimensions(agentContext)
    const context = await assembleContext({
      storePath,
      agentContext,
    })

    // Stage 4: LLM action (only if provider available)
    let llmResult: string | undefined
    if (selfModel.availableProviders.length > 0) {
      const { model } = getModelWithFallback()
      try {
        const result = await ollamaQueue.enqueue(
          () =>
            generateText({
              model,
              system: context.systemPrompt,
              messages: [{ role: "user", content: msg.content }],
              abortSignal: AbortSignal.timeout(60_000),
            }),
          "batch",
        )
        llmResult = result.text
      } catch (err) {
        if (
          err instanceof OllamaCircuitOpenError ||
          err instanceof OllamaBackpressureError
        ) {
          // Fall through to powered-down template response below
        } else {
          throw err
        }
      }
    }

    if (llmResult !== undefined) {
      // Dispatch response to channel
      try {
        await dispatch(
          { channel: msg.channel, to: msg.from },
          llmResult,
          msg.metadata,
        )
      } catch (err) {
        emitEvent({
          type: "log",
          source: "galatea-api",
          body: "tick.dispatch_failed",
          attributes: {
            "event.name": "tick.dispatch_failed",
            severity: "warning",
            channel: msg.channel,
            to: msg.from,
            error: String(err),
          },
        }).catch(() => {})
      }

      // Update state: remove pending message, update activity
      await removePendingMessage(msg, statePath)
      await updateAgentState(
        { lastActivity: new Date().toISOString() },
        statePath,
      )

      const tickResult: TickResult = {
        homeostasis,
        retrievedFacts,
        context,
        selfModel,
        pendingMessages: pending,
        action: "respond",
        action_target: { channel: msg.channel, to: msg.from },
        response: { text: llmResult },
        timestamp: new Date().toISOString(),
      }
      await appendActivityLog(tickResult, statePath)
      return tickResult
    }

    // Powered-down mode: pending message but no LLM available (or circuit/backpressure)
    const templateText =
      "I received your message but I'm currently unable to generate a response — no language model is available. I'll respond properly once connectivity is restored."

    try {
      await dispatch(
        { channel: msg.channel, to: msg.from },
        templateText,
        msg.metadata,
      )
    } catch (err) {
      emitEvent({
        type: "log",
        source: "galatea-api",
        body: "tick.dispatch_failed",
        attributes: {
          "event.name": "tick.dispatch_failed",
          severity: "warning",
          channel: msg.channel,
          to: msg.from,
          mode: "powered-down",
          error: String(err),
        },
      }).catch(() => {})
    }

    await removePendingMessage(msg, statePath)

    const templateResult: TickResult = {
      homeostasis,
      retrievedFacts,
      context,
      selfModel,
      pendingMessages: pending,
      action: "respond",
      action_target: { channel: msg.channel, to: msg.from },
      response: { text: templateText, template: true },
      timestamp: new Date().toISOString(),
    }
    await appendActivityLog(templateResult, statePath)
    return templateResult
  }

  // No pending messages → idle
  const agentContext: AgentContext = {
    sessionId: `tick-${Date.now()}`,
    currentMessage: "",
    messageHistory: [],
    retrievedFacts: [],
    hasAssignedTask: !!state.activeTask,
  }

  const tickResult: TickResult = {
    homeostasis: assessDimensions(agentContext),
    retrievedFacts: [],
    context: await assembleContext({ storePath, agentContext }),
    selfModel,
    pendingMessages: pending,
    action: "idle",
    timestamp: new Date().toISOString(),
  }
  await appendActivityLog(tickResult, statePath)
  return tickResult
}

async function checkSelfModel(): Promise<SelfModel> {
  const providers: string[] = []

  // Check Ollama
  const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434"
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    })
    if (res.ok) providers.push("ollama")
  } catch {
    // Expected: Ollama not running — not an error
  }

  // Check OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    providers.push("openrouter")
  }

  // Check Claude Code (uses CLI auth, not API key)
  try {
    const { execSync } = await import("node:child_process")
    execSync("claude --version", { timeout: 3000, stdio: "pipe" })
    providers.push("claude-code")
  } catch {
    // Expected: Claude CLI not installed — not an error
  }

  return { availableProviders: providers }
}
