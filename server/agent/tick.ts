import { generateText } from "ai"
import type { AgentContext } from "../engine/types"
import { assessDimensions } from "../engine/homeostasis-engine"
import { assembleContext } from "../memory/context-assembler"
import { retrieveRelevantFacts } from "../memory/fact-retrieval"
import { getModel } from "../providers"
import { appendActivityLog, getAgentState, removePendingMessage, updateAgentState } from "./agent-state"
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
    if (selfModel.availableProviders.length > 0) {
      const { model } = getModel()
      const result = await generateText({
        model,
        system: context.systemPrompt,
        messages: [{ role: "user", content: msg.content }],
      })

      // Dispatch response to channel
      try {
        await dispatch(
          { channel: msg.channel, to: msg.from },
          result.text,
          msg.metadata,
        )
      } catch {
        // No handler registered for this channel — response still returned via API
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
        response: { text: result.text },
        timestamp: new Date().toISOString(),
      }
      await appendActivityLog(tickResult, statePath)
      return tickResult
    }
  }

  // No pending messages or no LLM → idle
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
    // Ollama not available
  }

  // Check OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    providers.push("openrouter")
  }

  // Check Claude Code
  if (process.env.ANTHROPIC_API_KEY) {
    providers.push("claude-code")
  }

  return { availableProviders: providers }
}
