import { getAgentConfig } from "../engine/config"
import { assessDimensions, getGuidance } from "../engine/homeostasis-engine"
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
import { loadAgentSecrets, loadAgentSpec } from "./agent-spec"
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
import { getDiffStat } from "./utils"

// ---------------------------------------------------------------------------
// Adapter timeout resolver — maps task type to appropriate timeout
// ---------------------------------------------------------------------------

function getAdapterTimeout(taskType: string | undefined): number {
  const { adapter_timeouts: timeouts } = getAgentConfig()
  const defaultTimeout = timeouts.default ?? 180_000
  return taskType ? (timeouts[taskType] ?? defaultTimeout) : defaultTimeout
}

// ---------------------------------------------------------------------------
// Priority queue — process higher-priority messages first
// ---------------------------------------------------------------------------

const MESSAGE_PRIORITY: Record<string, number> = {
  admin: 0,
  chat: 1,
  greeting: 1,
  task_assignment: 2,
  review_comment: 2,
  status_update: 3,
}

export function pickNextMessage(pending: ChannelMessage[]): ChannelMessage {
  return pending.reduce((best, msg) => {
    const bestPri = MESSAGE_PRIORITY[best.messageType] ?? 1
    const msgPri = MESSAGE_PRIORITY[msg.messageType] ?? 1
    return msgPri < bestPri ? msg : best
  })
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

  // Load agent spec for tools_context + trust config + workflow
  let spec: AgentSpec | undefined
  let toolsContext: string | undefined
  let specTrust: AgentSpec["trust"] | undefined
  try {
    spec = await loadAgentSpec(agentId)
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
    const msg = pickNextMessage(pending) // priority-sorted

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
    const homeostasisForContext: Record<string, string> = {}
    for (const [k, v] of Object.entries(homeostasis)) {
      if (k !== "assessed_at" && k !== "assessment_method") {
        homeostasisForContext[k] = v as string
      }
    }
    const context = await assembleContext({
      storePath,
      agentContext,
      retrievedEntries: facts.entries,
      workflowInstructions: spec?.workflow_instructions,
      homeostasisState: homeostasisForContext,
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
      // Use workspace from: message metadata > agent spec > cwd
      const specWorkspace = spec?.workspace
        ? `${process.cwd()}/${spec.workspace}`
        : undefined
      const baseDir =
        (msg.metadata?.workspace as string) ??
        specWorkspace ??
        process.cwd()

      // Create an isolated worktree for coding tasks so the main
      // working directory (and dev server) stays on main undisturbed.
      const { execSync } = await import("node:child_process")
      const worktreeBranch = `worktree-task/${task.id}`
      const worktreePath = `${baseDir}/.worktrees/task-${task.id}`
      let workDir = baseDir
      let usingWorktree = false
      try {
        execSync(
          `git worktree add "${worktreePath}" -b "${worktreeBranch}"`,
          { cwd: baseDir, encoding: "utf-8", timeout: 10_000 },
        )
        workDir = worktreePath
        usingWorktree = true
        console.log(`[tick] Created worktree at ${worktreePath}`)

        // Configure git identity and SSH for this agent
        const agentEmail = spec?.agent.email
        const agentName = spec?.agent.full_name ?? spec?.agent.name
        if (agentEmail) {
          execSync(`git config user.email "${agentEmail}"`, {
            cwd: workDir,
            encoding: "utf-8",
            timeout: 5000,
          })
        }
        if (agentName) {
          execSync(`git config user.name "${agentName}"`, {
            cwd: workDir,
            encoding: "utf-8",
            timeout: 5000,
          })
        }

      } catch (wtErr) {
        console.warn(
          "[tick] Worktree creation failed, using main dir:",
          (wtErr as Error).message,
        )
      }

      // Load agent secrets — applies to ALL delegate tasks (not just coding)
      const secrets = await loadAgentSecrets(agentId)
      if (secrets.gitlab?.ssh_host_alias) {
        ;(task as any)._sshHostAlias = secrets.gitlab.ssh_host_alias
      }
      if (secrets.gitlab?.token) {
        ;(task as any)._prevGitlabToken = process.env.GITLAB_TOKEN ?? null
        process.env.GITLAB_TOKEN = secrets.gitlab.token
      }

      const workContext = toolsContext
        ? {
            ...context,
            systemPrompt: `${context.systemPrompt}\n\n## Available CLI Tools\n${toolsContext}`,
          }
        : context
      const config = getLLMConfig()
      const rawDescription = existingTask ? msg.content : task.description
      const taskDescription = usingWorktree
        ? `${rawDescription}\n\n**Working directory:** You are in an isolated git worktree at \`${workDir}\` on branch \`${worktreeBranch}\`. The main repo is undisturbed. Commit your changes here — they will be pushed and an MR created automatically when you finish.`
        : rawDescription
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

      // ---------------------------------------------------------------
      // VERIFY phase — pipeline-enforced for completed coding tasks
      // ---------------------------------------------------------------
      if (arcResult.status === "completed" && routing.taskType === "coding") {
        try {
          const { diffStat, recentCommits } = await getDiffStat(workDir)

          const verifyPrompt = [
            "A coding task was just completed. Verify the work.",
            "",
            "## Original Task",
            taskDescription,
            "",
            "## What Was Done",
            diffStat || "(no recent commits to diff)",
            "",
            "## Recent Commits",
            recentCommits || "(no commits)",
            "",
            "## Checklist",
            "1. Run tests: pnpm vitest run — do they pass?",
            "2. Run linter: pnpm biome check — any violations?",
            "3. Review the diff: does it match what was asked?",
            "4. If issues found, fix them and commit the fix.",
            "",
            "Use /verification-before-completion.",
          ].join("\n")

          const verifyResult = await executeWorkArc({
            adapter,
            task: {
              id: `verify-${task.id}`,
              description: verifyPrompt,
            },
            context: workContext,
            workingDirectory: workDir,
            trustLevel: (agentContext.sourceTrustLevel ??
              "MEDIUM") as TrustLevel,
            model: (msg.metadata?.modelOverride as string) || config.model,
            timeout: getAdapterTimeout("review"),
          })

          console.log(
            `[tick] VERIFY: ${verifyResult.status} (${verifyResult.durationMs}ms)`,
          )
        } catch (err) {
          console.warn("[tick] VERIFY failed:", (err as Error).message)
        }
      }

      // ---------------------------------------------------------------
      // FINISH phase — ensure all changes are committed (even on failure)
      // ---------------------------------------------------------------
      if (routing.taskType === "coding") {
        try {
          const { execSync } = await import("node:child_process")
          const gitStatus = execSync("git status --porcelain", {
            cwd: workDir,
            encoding: "utf-8",
            timeout: 5000,
          }).trim()

          if (gitStatus.length > 0) {
            console.log(
              "[tick] FINISH: uncommitted changes, running commit arc",
            )
            await executeWorkArc({
              adapter,
              task: {
                id: `finish-${task.id}`,
                description:
                  "You have uncommitted changes. Stage relevant files and commit with a conventional commit message.",
              },
              context: workContext,
              workingDirectory: workDir,
              trustLevel: (agentContext.sourceTrustLevel ??
                "MEDIUM") as TrustLevel,
              model: (msg.metadata?.modelOverride as string) || config.model,
              timeout: 30_000,
            })
          }
        } catch (err) {
          console.warn("[tick] FINISH failed:", (err as Error).message)
        }
      }

      // ---------------------------------------------------------------
      // PUBLISH phase — push branch and create MR for coding tasks
      // ---------------------------------------------------------------
      let publishResult: {
        pushed?: boolean
        branch?: string
        mr?: string
        error?: string
      } = {}
      if (
        arcResult.status === "completed" &&
        routing.taskType === "coding"
      ) {
        try {
          const branch = execSync(
            "git rev-parse --abbrev-ref HEAD",
            { cwd: workDir, encoding: "utf-8", timeout: 5000 },
          ).trim()

          // Only push if on a feature/worktree branch (not main)
          if (branch !== "main" && branch !== "master") {
            // Ensure remote uses agent's SSH host alias (handles key + port)
            const sshAlias = (task as any)._sshHostAlias
            if (sshAlias) {
              try {
                const currentUrl = execSync(
                  "git remote get-url origin",
                  { cwd: workDir, encoding: "utf-8", timeout: 5000 },
                ).trim()
                // Replace hostname with SSH alias: git@host:path → git@alias:path
                const aliasUrl = currentUrl.replace(
                  /git@[^:]+:/,
                  `git@${sshAlias}:`,
                )
                if (aliasUrl !== currentUrl) {
                  execSync(
                    `git remote set-url origin "${aliasUrl}"`,
                    { cwd: workDir, encoding: "utf-8", timeout: 5000 },
                  )
                }
              } catch {
                // Non-fatal — push may still work with default SSH config
              }
            }
            execSync(`git push -u origin ${branch}`, {
              cwd: workDir,
              encoding: "utf-8",
              timeout: 30_000,
            })
            publishResult = { pushed: true, branch }
            console.log(`[tick] PUBLISH: pushed ${branch}`)

            // Create MR via glab (best-effort)
            try {
              const safeTitle = taskDescription
                .slice(0, 70)
                .replace(/["`$\\]/g, "")
              const mrOutput = execSync(
                `glab mr create --title "${safeTitle}" --fill --yes 2>&1`,
                { cwd: workDir, encoding: "utf-8", timeout: 30_000 },
              ).trim()
              publishResult.mr = mrOutput
              console.log(`[tick] PUBLISH: MR created — ${mrOutput}`)
            } catch (mrErr) {
              publishResult.mr = `failed: ${(mrErr as Error).message}`
              console.warn(
                "[tick] PUBLISH: MR creation failed (glab):",
                (mrErr as Error).message,
              )
            }
          } else {
            publishResult = { pushed: false, branch, error: "on main branch" }
            console.log("[tick] PUBLISH: skipped — on main branch")
          }
        } catch (err) {
          publishResult = {
            pushed: false,
            error: (err as Error).message,
          }
          console.warn("[tick] PUBLISH failed:", (err as Error).message)
        }
      }

      // ---------------------------------------------------------------
      // CLEANUP — remove worktree and restore env after PUBLISH
      // ---------------------------------------------------------------
      // Restore previous GITLAB_TOKEN (or remove if there wasn't one)
      if ("_prevGitlabToken" in (task as any)) {
        if ((task as any)._prevGitlabToken) {
          process.env.GITLAB_TOKEN = (task as any)._prevGitlabToken
        } else {
          delete process.env.GITLAB_TOKEN
        }
      }

      if (usingWorktree) {
        try {
          execSync(`git worktree remove --force "${worktreePath}"`, {
            cwd: baseDir,
            encoding: "utf-8",
            timeout: 10_000,
          })
          console.log(`[tick] Cleaned up worktree ${worktreePath}`)
        } catch (cleanupErr) {
          console.warn(
            "[tick] Worktree cleanup failed:",
            (cleanupErr as Error).message,
          )
        }
      }

      let statusText =
        arcResult.status === "completed"
          ? `Task completed: ${arcResult.text}`
          : `Task ${arcResult.status}: ${arcResult.text}`

      // Append publish result to status so the assigner knows what happened
      if (publishResult.pushed) {
        statusText += `\nBranch \`${publishResult.branch}\` pushed.`
        if (publishResult.mr && !publishResult.mr.startsWith("failed"))
          statusText += ` MR created: ${publishResult.mr}`
        else if (publishResult.mr)
          statusText += ` MR creation failed — please create manually.`
      } else if (publishResult.error) {
        statusText += `\n⚠ Publish failed: ${publishResult.error}. Changes are committed locally but not pushed.`
      }

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
        ...(publishResult.pushed !== undefined
          ? { publish: publishResult }
          : {}),
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
            model: (msg.metadata?.modelOverride as string) || config.model,
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
