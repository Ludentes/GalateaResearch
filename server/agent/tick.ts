import { assessDimensions } from "../engine/homeostasis-engine"
import type {
  AgentContext,
  HomeostasisState,
  TrustLevel,
} from "../engine/types"
import { assembleContext } from "../memory/context-assembler"
import { retrieveRelevantFacts } from "../memory/fact-retrieval"
import { appendEntries } from "../memory/knowledge-store"
import { createWorkKnowledge } from "../memory/work-to-knowledge"
import { emitEvent } from "../observation/emit"
import type { TickDecisionRecord } from "../observation/tick-record"
import { appendTickRecord, getTickRecordPath } from "../observation/tick-record"
import { getLLMConfig } from "../providers/config"
import { getModelWithFallback } from "../providers"
import {
  OllamaBackpressureError,
  OllamaCircuitOpenError,
} from "../providers/ollama-queue"
import type { AgentTool } from "./agent-loop"
import { runAgentLoop } from "./agent-loop"
import { runClaudeCodeRespond } from "./claude-code-respond"
import { loadAgentSpec } from "./agent-spec"
import {
  appendActivityLog,
  getAgentState,
  removeMessage,
  updateAgentState,
} from "./agent-state"
import type { CodingToolAdapter } from "./coding-adapter/types"
import { executeWorkArc } from "./coding-adapter/work-arc"
import { dispatchMessage } from "./dispatcher"
import {
  addTask,
  loadOperationalContext,
  pushHistoryEntry,
  recordOutbound,
  saveOperationalContext,
} from "./operational-memory"
import { inferRouting } from "./task-type-inference"
import { createAllTools } from "./tools"
import type { ChannelMessage, SelfModel, TickResult } from "./types"

// ---------------------------------------------------------------------------
// Tool registry — auto-populated with workspace tools per agent
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

function getAgentTools(agentId: string, workspace?: string): Record<string, AgentTool> {
  const workspaceRoot = workspace || process.cwd()
  return createAllTools(workspaceRoot)
}

// ---------------------------------------------------------------------------
// Coding tool adapter (Phase G)
// ---------------------------------------------------------------------------

let codingAdapter: CodingToolAdapter | undefined

export function setAdapter(adapter: CodingToolAdapter | undefined): void {
  codingAdapter = adapter
}

export function getAdapter(): CodingToolAdapter | undefined {
  return codingAdapter
}

// ---------------------------------------------------------------------------
// Tick decision record helper
// ---------------------------------------------------------------------------

function buildTickRecord(params: {
  tickId: string
  agentId: string
  trigger: TickDecisionRecord["trigger"]
  homeostasis: HomeostasisState
  routing: TickDecisionRecord["routing"]
  execution: Partial<TickDecisionRecord["execution"]>
  outcome: TickDecisionRecord["outcome"]
  durationMs: number
}): TickDecisionRecord {
  return {
    tickId: params.tickId,
    agentId: params.agentId,
    timestamp: new Date().toISOString(),
    trigger: params.trigger,
    homeostasis: params.homeostasis,
    guidance: [],
    routing: params.routing,
    execution: {
      adapter: params.execution.adapter ?? "none",
      sessionResumed: params.execution.sessionResumed ?? false,
      toolCalls: params.execution.toolCalls ?? 0,
      durationMs: params.durationMs,
    },
    resources: {},
    outcome: params.outcome,
  }
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

interface TickOptions {
  agentId?: string
  statePath?: string
  storePath?: string
  opContextPath?: string
}

export async function tick(
  _trigger: "manual" | "heartbeat" | "webhook",
  opts?: TickOptions,
): Promise<TickResult> {
  const tickId = crypto.randomUUID()
  const tickStart = Date.now()

  const agentId = opts?.agentId ?? "galatea"
  const statePath = opts?.statePath
  const storePath = opts?.storePath ?? "data/memory/entries.jsonl"
  const opContextPath = opts?.opContextPath

  // Stage 1: Load operational context + self-model
  const selfModel = await checkSelfModel()
  const opCtx = await loadOperationalContext(opContextPath)

  // Load agent spec for tools_context injection
  let toolsContext: string | undefined
  try {
    const spec = await loadAgentSpec(agentId)
    toolsContext = spec.tools_context
  } catch {
    // Agent spec not found — not critical, skip tools_context
  }

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

    // Find active task from operational context
    const activeOpTask = opCtx.tasks.find(
      (t) => t.status === "in_progress" || t.status === "assigned",
    )

    const agentContext: AgentContext = {
      sessionId: `tick-${Date.now()}`,
      currentMessage: msg.content,
      messageHistory: [],
      retrievedFacts,
      lastMessageTime: new Date(msg.receivedAt),
      hasAssignedTask: !!state.activeTask || !!activeOpTask,
      // Operational memory fields
      lastOutboundAt: opCtx.lastOutboundAt || undefined,
      phaseEnteredAt: activeOpTask?.phaseStartedAt || opCtx.phaseEnteredAt,
      taskPhase: activeOpTask?.phase,
      taskCount: opCtx.tasks.filter((t) => t.status !== "done").length,
      taskToolCallCount: activeOpTask?.toolCallCount,
      // Trust/safety — sourceTrustLevel is set by trust resolver (Phase G).
      // Until then, defaults to "NONE" (most restrictive).
      sourceChannel: msg.channel,
      sourceIdentity: msg.from,
    }

    const homeostasis = assessDimensions(agentContext)
    const context = await assembleContext({
      storePath,
      agentContext,
      retrievedEntries: facts.entries,
    })

    // Stage 3b: Delegate to coding adapter for task_assignment messages
    if (msg.messageType === "task_assignment" && codingAdapter) {
      const task = addTask(opCtx, msg.content, msg)
      task.status = "in_progress"

      const workDir = (msg.metadata?.workspace as string) ?? process.cwd()
      const workContext = toolsContext
        ? {
            ...context,
            systemPrompt: `${context.systemPrompt}\n\n## Available CLI Tools\n${toolsContext}`,
          }
        : context
      const arcResult = await executeWorkArc({
        adapter: codingAdapter,
        task: { id: task.id, description: task.description },
        context: workContext,
        workingDirectory: workDir,
        trustLevel: (agentContext.sourceTrustLevel ?? "MEDIUM") as TrustLevel,
      })

      // Update task status based on result
      let knowledgeCount = 0
      if (arcResult.status === "completed") {
        task.status = "done"
        task.progress.push(arcResult.text)
        // Extract knowledge from completed work
        const knowledgeEntries = createWorkKnowledge(task, agentId)
        knowledgeCount = knowledgeEntries.length
        if (knowledgeCount > 0) {
          appendEntries(knowledgeEntries, storePath).catch(() => {})
        }
      } else if (arcResult.status === "blocked") {
        task.status = "blocked"
        opCtx.blockers.push(arcResult.text)
      } else {
        task.status = "in_progress"
        opCtx.carryover.push(
          `SDK session ${arcResult.status}: ${arcResult.text}`,
        )
      }

      const statusText =
        arcResult.status === "completed"
          ? `Task completed: ${arcResult.text}`
          : `Task ${arcResult.status}: ${arcResult.text}`

      const outbound: ChannelMessage = {
        id: `delegate-${msg.id}`,
        channel: msg.channel,
        direction: "outbound",
        routing: { ...msg.routing, replyToId: msg.id },
        from: agentId,
        content: statusText,
        messageType: "status_update",
        receivedAt: new Date().toISOString(),
        metadata: {},
      }

      try {
        await dispatchMessage(outbound)
      } catch {
        /* logged */
      }

      recordOutbound(opCtx)
      await saveOperationalContext(opCtx, opContextPath)
      await removeMessage(msg, statePath)

      const tickResult: TickResult = {
        homeostasis,
        retrievedFacts,
        context,
        selfModel,
        pendingMessages: pending,
        action: "delegate",
        action_target: { channel: msg.channel, to: msg.from },
        response: { text: statusText },
        delegation: {
          adapter: codingAdapter.name,
          taskId: task.id,
          status:
            arcResult.status === "completed"
              ? "completed"
              : arcResult.status === "blocked"
                ? "failed"
                : (arcResult.status as
                    | "started"
                    | "completed"
                    | "failed"
                    | "timeout"),
          transcript: arcResult.transcript,
          costUsd: arcResult.costUsd,
        },
        timestamp: new Date().toISOString(),
      }
      await appendActivityLog(tickResult, statePath)

      // Fire-and-forget — never block tick on persistence failure
      const delegateRecord = buildTickRecord({
        tickId,
        agentId,
        trigger: {
          type: _trigger === "heartbeat" ? "heartbeat" : "message",
          source: `${msg.channel}:${msg.from}`,
        },
        homeostasis,
        routing: inferRouting(msg.content, msg.messageType),
        execution: {
          adapter: "claude-code",
          sessionResumed: false,
          toolCalls: 0,
        },
        outcome: {
          action: "delegate",
          response: statusText,
          artifactsCreated: [],
          knowledgeEntriesCreated: knowledgeCount,
        },
        durationMs: Date.now() - tickStart,
      })
      appendTickRecord(delegateRecord, getTickRecordPath(agentId)).catch(
        () => {},
      )

      return tickResult
    }

    // Stage 4: Generate response — Agent SDK direct or AI SDK agent loop
    let llmResult: string | undefined
    let loopToolCalls = 0
    let loopToolNames: string[] = []
    let executionAdapter: "claude-code" | "direct-response" = "direct-response"

    const providerOverride = msg.metadata?.providerOverride as
      | string
      | undefined
    const llmAvailable =
      providerOverride !== "none" &&
      selfModel.availableProviders.length > 0

    if (llmAvailable) {
      const config = getLLMConfig()

      // Record inbound in operational history
      pushHistoryEntry(opCtx, "user", msg.content)

      const systemPrompt = toolsContext
        ? `${context.systemPrompt}\n\n## Available CLI Tools\n${toolsContext}`
        : context.systemPrompt

      if (config.provider === "claude-code") {
        // Agent SDK direct path — uses built-in tools, session persistence
        executionAdapter = "claude-code"
        try {
          // Build conversation history from operational context
          const ccHistory = opCtx.recentHistory
            .slice(0, -1)
            .map((h) => ({ role: h.role, content: h.content }))

          const result = await runClaudeCodeRespond({
            agentId,
            systemPrompt,
            userMessage: msg.content,
            history: ccHistory,
            workingDirectory:
              (msg.metadata?.workspace as string) ?? process.cwd(),
            timeoutMs: 120_000,
            model: config.model !== "sonnet" ? config.model : undefined,
          })

          if (result.ok) {
            llmResult = result.text
            loopToolCalls = result.toolCalls
            loopToolNames = result.toolNames

            // Record assistant response in operational history
            pushHistoryEntry(opCtx, "assistant", llmResult)
          }
          // else: ok=false → llmResult stays undefined → powered-down template
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : String(err)
          emitEvent({
            type: "log",
            source: `${agentId}-api`,
            body: "claude_code_respond.error",
            attributes: {
              "event.name": "claude_code_respond.error",
              error: errorMsg,
            },
          }).catch(() => {})
          // Fall through to powered-down template response
        }
      } else {
        // AI SDK agent loop — for ollama, openrouter, etc.
        try {
          const { model } = getModelWithFallback()

          // Build history from operational context (exclude the message we just added)
          const history = opCtx.recentHistory
            .slice(0, -1)
            .map((h) => ({ role: h.role, content: h.content }))

          const loopResult = await runAgentLoop({
            model,
            system: systemPrompt,
            messages: [{ role: "user", content: msg.content }],
            tools: getAgentTools(
              agentId,
              msg.metadata?.workspace as string,
            ),
            history,
            config: { maxSteps: 8, timeoutMs: 120_000 },
          })

          llmResult = loopResult.text
          const toolSteps = loopResult.steps.filter(
            (s) => s.type === "tool_call",
          )
          loopToolCalls = toolSteps.length
          loopToolNames = toolSteps
            .map((s) => s.toolName)
            .filter((n): n is string => !!n)

          // Record assistant response in operational history
          pushHistoryEntry(opCtx, "assistant", llmResult)

          // Log loop metadata
          if (
            loopResult.totalSteps > 1 ||
            loopResult.finishReason !== "text"
          ) {
            emitEvent({
              type: "log",
              source: `${agentId}-api`,
              body: "agent_loop.completed",
              attributes: {
                "event.name": "agent_loop.completed",
                finishReason: loopResult.finishReason,
                totalSteps: String(loopResult.totalSteps),
                toolCalls: String(
                  loopResult.steps.filter(
                    (s) => s.type === "tool_call",
                  ).length,
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
        from: agentId,
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
          source: `${agentId}-api`,
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

      // Fire-and-forget — never block tick on persistence failure
      const respondRecord = buildTickRecord({
        tickId,
        agentId,
        trigger: {
          type: _trigger === "heartbeat" ? "heartbeat" : "message",
          source: `${msg.channel}:${msg.from}`,
        },
        homeostasis,
        routing: inferRouting(msg.content, msg.messageType),
        execution: {
          adapter: executionAdapter,
          toolCalls: loopToolCalls,
          toolNames: loopToolNames.length > 0 ? loopToolNames : undefined,
        },
        outcome: {
          action: "respond",
          response: llmResult,
          artifactsCreated: [],
          knowledgeEntriesCreated: 0,
        },
        durationMs: Date.now() - tickStart,
      })
      appendTickRecord(respondRecord, getTickRecordPath(agentId)).catch(
        () => {},
      )

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
      from: agentId,
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
        source: `${agentId}-api`,
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

    // Fire-and-forget — never block tick on persistence failure
    const templateRecord = buildTickRecord({
      tickId,
      agentId,
      trigger: {
        type: _trigger === "heartbeat" ? "heartbeat" : "message",
        source: `${msg.channel}:${msg.from}`,
      },
      homeostasis,
      routing: inferRouting(msg.content, msg.messageType),
      execution: { adapter: "none" },
      outcome: {
        action: "respond",
        response: templateText,
        artifactsCreated: [],
        knowledgeEntriesCreated: 0,
      },
      durationMs: Date.now() - tickStart,
    })
    appendTickRecord(templateRecord, getTickRecordPath(agentId)).catch(() => {})

    return templateResult
  }

  // No pending messages → idle
  const idleActiveTask = opCtx.tasks.find(
    (t) => t.status === "in_progress" || t.status === "assigned",
  )
  const agentContext: AgentContext = {
    sessionId: `tick-${Date.now()}`,
    currentMessage: "",
    messageHistory: [],
    retrievedFacts: [],
    hasAssignedTask: !!state.activeTask || !!idleActiveTask,
    lastOutboundAt: opCtx.lastOutboundAt || undefined,
    taskCount: opCtx.tasks.filter((t) => t.status !== "done").length,
  }

  await saveOperationalContext(opCtx, opContextPath)

  const idleHomeostasis = assessDimensions(agentContext)

  const tickResult: TickResult = {
    homeostasis: idleHomeostasis,
    retrievedFacts: [],
    context: await assembleContext({ storePath, agentContext }),
    selfModel,
    pendingMessages: pending,
    action: "idle",
    timestamp: new Date().toISOString(),
  }
  await appendActivityLog(tickResult, statePath)

  // Fire-and-forget — never block tick on persistence failure
  const idleRecord = buildTickRecord({
    tickId,
    agentId,
    trigger: {
      type: _trigger === "heartbeat" ? "heartbeat" : "internal",
    },
    homeostasis: idleHomeostasis,
    routing: { level: "interaction", reasoning: "no_pending_messages" },
    execution: { adapter: "none" },
    outcome: {
      action: "idle",
      artifactsCreated: [],
      knowledgeEntriesCreated: 0,
    },
    durationMs: Date.now() - tickStart,
  })
  appendTickRecord(idleRecord, getTickRecordPath(agentId)).catch(() => {})

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
