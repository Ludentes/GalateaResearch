import { assessDimensions, getGuidance } from "../engine/homeostasis-engine"
import { getAgentConfig } from "../engine/config"
import { resolveTrust } from "../engine/trust-resolver"
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
import { getModelWithFallback } from "../providers"
import { getLLMConfig } from "../providers/config"
import {
  OllamaBackpressureError,
  OllamaCircuitOpenError,
} from "../providers/ollama-queue"
import type { AgentTool } from "./agent-loop"
import { runAgentLoop } from "./agent-loop"
import type { AgentSpec } from "./agent-spec"
import { loadAgentSpec } from "./agent-spec"
import {
  appendActivityLog,
  getAgentState,
  removeMessage,
  updateAgentState,
} from "./agent-state"
import { runClaudeCodeRespond } from "./claude-code-respond"
import type { CodingToolAdapter } from "./coding-adapter/types"
import { executeWorkArc } from "./coding-adapter/work-arc"
import { dispatchMessage } from "./dispatcher"
import {
  addTask,
  getActiveTask,
  loadOperationalContext,
  pushHistoryEntry,
  recordOutbound,
  saveOperationalContext,
} from "./operational-memory"
import { classifyWithLLM, inferRouting } from "./task-type-inference"
import { createAllTools } from "./tools"
import type { ChannelMessage, SelfModel, TickResult } from "./types"

// ---------------------------------------------------------------------------
// Adapter timeout resolver — maps task type to appropriate timeout
// ---------------------------------------------------------------------------

function getAdapterTimeout(taskType: string | undefined): number {
  const config = getAgentConfig()
  const timeouts = config.adapter_timeouts

  if (!taskType) {
    return timeouts.default ?? 180_000
  }

  return timeouts[taskType] ?? timeouts.default ?? 180_000
}

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

function getAgentTools(
  _agentId: string,
  workspace?: string,
): Record<string, AgentTool> {
  const workspaceRoot = workspace || process.cwd()
  return createAllTools(workspaceRoot)
}

// ---------------------------------------------------------------------------
// Coding tool adapter (Phase G)
// ---------------------------------------------------------------------------

let codingAdapter: CodingToolAdapter | undefined
let adapterInitialized = false

async function ensureAdapter(): Promise<CodingToolAdapter | undefined> {
  if (!adapterInitialized) {
    adapterInitialized = true
    try {
      const { ClaudeCodeAdapter } = await import(
        "./coding-adapter/claude-code-adapter"
      )
      codingAdapter = new ClaudeCodeAdapter()
    } catch {
      // Adapter unavailable — SDK not installed
    }
  }
  return codingAdapter
}

export function setAdapter(adapter: CodingToolAdapter | undefined): void {
  codingAdapter = adapter
  adapterInitialized = true
}

export async function getAdapter(): Promise<CodingToolAdapter | undefined> {
  return ensureAdapter()
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
    guidance: getGuidance(params.homeostasis as HomeostasisState)
      .split("\n\n")
      .filter(Boolean),
    routing: params.routing,
    execution: {
      adapter: params.execution.adapter ?? "none",
      sessionResumed: params.execution.sessionResumed ?? false,
      toolCalls: params.execution.toolCalls ?? 0,
      toolNames: params.execution.toolNames,
      durationMs: params.durationMs,
      costUsd: params.execution.costUsd,
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

// Per-agent mutex — prevents concurrent tick execution that causes adapter
// failures when back-to-back messages race on the Claude Code SDK session.
const agentLocks = new Map<string, Promise<TickResult>>()

export async function tick(
  _trigger: "manual" | "heartbeat" | "webhook",
  opts?: TickOptions,
): Promise<TickResult> {
  const agentId = opts?.agentId ?? "galatea"

  // Wait for any in-flight tick for this agent to complete before starting
  const pending = agentLocks.get(agentId)
  if (pending) {
    try {
      await pending
    } catch {
      // Previous tick failed — proceed anyway
    }
  }

  const tickPromise = tickInner(_trigger, agentId, opts)
  agentLocks.set(agentId, tickPromise)
  try {
    return await tickPromise
  } finally {
    // Only clear if still our promise (not replaced by a newer tick)
    if (agentLocks.get(agentId) === tickPromise) {
      agentLocks.delete(agentId)
    }
  }
}

async function tickInner(
  _trigger: "manual" | "heartbeat" | "webhook",
  agentId: string,
  opts?: TickOptions,
): Promise<TickResult> {
  const tickId = crypto.randomUUID()
  const tickStart = Date.now()
  const statePath = opts?.statePath
  const storePath = opts?.storePath ?? "data/memory/entries.jsonl"
  const opContextPath = opts?.opContextPath

  // Stage 1: Load operational context + self-model
  const selfModel = await checkSelfModel()
  const opCtx = await loadOperationalContext(opContextPath)

  // Load agent spec for tools_context + trust config
  let toolsContext: string | undefined
  let specTrust: AgentSpec["trust"] | undefined
  try {
    const spec = await loadAgentSpec(agentId)
    toolsContext = spec.tools_context
    specTrust = spec.trust
  } catch {
    // Agent spec not found — not critical
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

    // Record inbound in operational history (before assessment, so stuck detection sees it)
    pushHistoryEntry(opCtx, "user", msg.content)

    // Find active task from operational context
    const activeOpTask = opCtx.tasks.find(
      (t) => t.status === "in_progress" || t.status === "assigned",
    )

    const agentContext: AgentContext = {
      sessionId: `tick-${Date.now()}`,
      currentMessage: msg.content,
      messageHistory: opCtx.recentHistory.map((h) => ({
        role: h.role,
        content: h.content,
      })),
      retrievedFacts,
      lastMessageTime: new Date(msg.receivedAt),
      hasAssignedTask: !!state.activeTask || !!activeOpTask,
      // Operational memory fields
      lastOutboundAt: opCtx.lastOutboundAt || undefined,
      phaseEnteredAt: activeOpTask?.phaseStartedAt || opCtx.phaseEnteredAt,
      taskPhase: activeOpTask?.phase,
      taskCount: opCtx.tasks.filter((t) => t.status !== "done").length,
      taskToolCallCount: activeOpTask?.toolCallCount,
      // Trust/safety — resolved from agent spec trust config
      sourceChannel: msg.channel,
      sourceIdentity: msg.from,
      sourceTrustLevel: specTrust
        ? resolveTrust(specTrust, msg.channel, msg.from)
        : undefined,
    }

    const homeostasis = assessDimensions(agentContext)
    const context = await assembleContext({
      storePath,
      agentContext,
      retrievedEntries: facts.entries,
    })

    // Smart routing: heuristic first, LLM fallback for low-confidence
    let routing = inferRouting(msg.content, msg.messageType)
    if (
      routing.confidence === "low" &&
      selfModel.availableProviders.length > 0
    ) {
      const llmRouting = await classifyWithLLM(msg.content)
      if (llmRouting) {
        routing = llmRouting
      }
    }

    // Stage 3b: Delegate to coding adapter for explicit task assignments
    const adapter = await ensureAdapter()
    if (msg.messageType === "task_assignment" && adapter) {
      const existingTask = getActiveTask(opCtx)
      const task = existingTask ?? addTask(opCtx, msg.content, msg)
      if (existingTask) {
        task.progress.push(`Follow-up: ${msg.content}`)
      }
      task.status = "in_progress"

      const resumeSessionId = task.claudeSessionId ?? opCtx.lastClaudeSessionId
      const sessionResumed = !!resumeSessionId
      const workDir = (msg.metadata?.workspace as string) ?? process.cwd()
      const workContext = toolsContext
        ? {
            ...context,
            systemPrompt: `${context.systemPrompt}\n\n## Available CLI Tools\n${toolsContext}`,
          }
        : context
      const config = getLLMConfig()
      const taskDescription = existingTask ? msg.content : task.description
      const arcResult = await executeWorkArc({
        adapter,
        task: { id: task.id, description: taskDescription },
        context: workContext,
        workingDirectory: workDir,
        trustLevel: (agentContext.sourceTrustLevel ?? "MEDIUM") as TrustLevel,
        model: config.model,
        sessionId: resumeSessionId,
      })

      // Store session ID for potential resume (both on task and context)
      if (arcResult.sessionId) {
        task.claudeSessionId = arcResult.sessionId
        opCtx.lastClaudeSessionId = arcResult.sessionId
      }

      // Update task status based on result
      let knowledgeCount = 0
      if (arcResult.status === "completed") {
        task.status = "done"
        task.claudeSessionId = undefined
        task.progress.push(arcResult.text)
        // Extract knowledge from completed work
        const knowledgeEntries = createWorkKnowledge(task, agentId)
        knowledgeCount = knowledgeEntries.length
        if (knowledgeCount > 0) {
          appendEntries(knowledgeEntries, storePath).catch(() => {})
        }
      } else if (arcResult.status === "blocked") {
        task.status = "blocked"
        task.claudeSessionId = undefined
        opCtx.blockers.push(arcResult.text)
      } else {
        task.status = "in_progress"
        // Keep claudeSessionId for resume on next tick
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
          adapter: adapter.name,
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
          trustLevel: agentContext.sourceTrustLevel,
        },
        homeostasis,
        routing,
        execution: {
          adapter: "claude-code",
          sessionResumed,
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
    let loopCostUsd: number | undefined
    let executionAdapter: "claude-code" | "direct-response" = "direct-response"

    const providerOverride = msg.metadata?.providerOverride as
      | string
      | undefined
    const llmAvailable =
      providerOverride !== "none" && selfModel.availableProviders.length > 0

    if (llmAvailable) {
      const config = getLLMConfig()

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
            timeoutMs: getAdapterTimeout(routing.taskType),
            model:
              (msg.metadata?.modelOverride as string) || config.model,
          })

          if (result.ok) {
            llmResult = result.text
            loopToolCalls = result.toolCalls
            loopToolNames = result.toolNames
            loopCostUsd = result.costUsd

            // Record assistant response in operational history
            pushHistoryEntry(opCtx, "assistant", llmResult)
          } else {
            console.warn(
              `[tick] Claude Code adapter failed for ${agentId}: ${result.text} (${result.durationMs}ms)`,
            )
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err)
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
            tools: getAgentTools(agentId, msg.metadata?.workspace as string),
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
          if (loopResult.totalSteps > 1 || loopResult.finishReason !== "text") {
            emitEvent({
              type: "log",
              source: `${agentId}-api`,
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
          } else if (
            err instanceof TypeError &&
            (err as Error).message === "fetch failed"
          ) {
            // Provider unreachable (connection refused) — fall through
          } else if (
            (err as Error).name === "OllamaError" ||
            (err as Error).message?.includes("ECONNREFUSED")
          ) {
            // Ollama SDK connection error — fall through
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
          trustLevel: agentContext.sourceTrustLevel,
        },
        homeostasis,
        routing,
        execution: {
          adapter: executionAdapter,
          toolCalls: loopToolCalls,
          toolNames: loopToolNames.length > 0 ? loopToolNames : undefined,
          costUsd: loopCostUsd,
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
        trustLevel: agentContext.sourceTrustLevel,
      },
      homeostasis,
      routing,
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

// ---------------------------------------------------------------------------
// Provider availability cache — avoids spawning subprocesses on every tick
// ---------------------------------------------------------------------------

let cachedSelfModel: SelfModel | null = null
let selfModelCachedAt = 0
const SELF_MODEL_TTL_MS = 60_000 // re-check every 60s

export function invalidateProviderCache(): void {
  cachedSelfModel = null
  selfModelCachedAt = 0
}

async function checkSelfModel(): Promise<SelfModel> {
  const now = Date.now()
  if (cachedSelfModel && now - selfModelCachedAt < SELF_MODEL_TTL_MS) {
    return cachedSelfModel
  }

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
  // Use `which` first (fast), then verify with --version only if needed
  try {
    const { execSync } = await import("node:child_process")
    execSync("which claude", { timeout: 2000, stdio: "pipe" })
    providers.push("claude-code")
  } catch {
    // Expected: Claude CLI not installed — not an error
  }

  cachedSelfModel = { availableProviders: providers }
  selfModelCachedAt = now
  return cachedSelfModel
}
