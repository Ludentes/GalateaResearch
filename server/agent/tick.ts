import { assessDimensions } from "../engine/homeostasis-engine"
import type { AgentContext } from "../engine/types"
import { assembleContext } from "../memory/context-assembler"
import { retrieveRelevantFacts } from "../memory/fact-retrieval"
import { getModelWithFallback } from "../providers"
import {
  OllamaBackpressureError,
  OllamaCircuitOpenError,
} from "../providers/ollama-queue"
import { emitEvent } from "../observation/emit"
import {
  appendActivityLog,
  getAgentState,
  removeMessage,
  updateAgentState,
} from "./agent-state"
import { runAgentLoop } from "./agent-loop"
import type { AgentTool } from "./agent-loop"
import { dispatchMessage } from "./dispatcher"
import {
  loadOperationalContext,
  pushHistoryEntry,
  recordOutbound,
  saveOperationalContext,
} from "./operational-memory"
import type { ChannelMessage, SelfModel, TickResult } from "./types"

// ---------------------------------------------------------------------------
// Tool registry — stub tools for F.2 scaffolding
// ---------------------------------------------------------------------------

const registeredTools: Record<string, AgentTool> = {}

export function registerTool(name: string, tool: AgentTool): void {
  registeredTools[name] = tool
}

export function clearTools(): void {
  for (const key of Object.keys(registeredTools)) {
    delete registeredTools[key]
  }
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

interface TickOptions {
  statePath?: string
  storePath?: string
  opContextPath?: string
}

export async function tick(
  _trigger: "manual" | "heartbeat" | "webhook",
  opts?: TickOptions,
): Promise<TickResult> {
  const statePath = opts?.statePath
  const storePath = opts?.storePath ?? "data/memory/entries.jsonl"
  const opContextPath = opts?.opContextPath

  // Stage 1: Load operational context + self-model
  const selfModel = await checkSelfModel()
  const opCtx = await loadOperationalContext(opContextPath)

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
      retrievedEntries: facts.entries,
    })

    // Stage 4: Agent loop (ReAct pattern with budget controls)
    let llmResult: string | undefined
    if (selfModel.availableProviders.length > 0) {
      const { model } = getModelWithFallback()
      try {
        // Record inbound in operational history
        pushHistoryEntry(opCtx, "user", msg.content)

        // Build history from operational context (exclude the message we just added)
        const history = opCtx.recentHistory
          .slice(0, -1)
          .map((h) => ({ role: h.role, content: h.content }))

        const loopResult = await runAgentLoop({
          model,
          system: context.systemPrompt,
          messages: [{ role: "user", content: msg.content }],
          tools: Object.keys(registeredTools).length > 0
            ? registeredTools
            : undefined,
          history,
          config: { maxSteps: 5, timeoutMs: 60_000 },
        })

        llmResult = loopResult.text

        // Record assistant response in operational history
        pushHistoryEntry(opCtx, "assistant", llmResult)

        // Log loop metadata
        if (loopResult.totalSteps > 1 || loopResult.finishReason !== "text") {
          emitEvent({
            type: "log",
            source: "galatea-api",
            body: "agent_loop.completed",
            attributes: {
              "event.name": "agent_loop.completed",
              finishReason: loopResult.finishReason,
              totalSteps: String(loopResult.totalSteps),
              toolCalls: String(
                loopResult.steps.filter((s) => s.type === "tool_call").length,
              ),
            },
          }).catch(() => {})
        }
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
      // Build outbound ChannelMessage
      const outbound: ChannelMessage = {
        id: `reply-${msg.id}`,
        channel: msg.channel,
        direction: "outbound",
        routing: {
          ...msg.routing,
          replyToId: msg.id,
        },
        from: "galatea",
        content: llmResult,
        messageType: msg.messageType,
        receivedAt: new Date().toISOString(),
        metadata: { ...msg.metadata },
      }

      // Dispatch response to channel
      try {
        await dispatchMessage(outbound)
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

      // Record outbound time + save operational context
      recordOutbound(opCtx)
      await saveOperationalContext(opCtx, opContextPath)

      // Update state: remove pending message, update activity
      await removeMessage(msg, statePath)
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

    // Powered-down mode: pending message but no LLM available
    const templateText =
      "I received your message but I'm currently unable to generate a response — no language model is available. I'll respond properly once connectivity is restored."

    const templateOutbound: ChannelMessage = {
      id: `template-${msg.id}`,
      channel: msg.channel,
      direction: "outbound",
      routing: {
        ...msg.routing,
        replyToId: msg.id,
      },
      from: "galatea",
      content: templateText,
      messageType: msg.messageType,
      receivedAt: new Date().toISOString(),
      metadata: { ...msg.metadata },
    }

    try {
      await dispatchMessage(templateOutbound)
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

    await removeMessage(msg, statePath)
    await saveOperationalContext(opCtx, opContextPath)

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

  await saveOperationalContext(opCtx, opContextPath)

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
