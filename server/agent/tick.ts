import { getAgentConfig } from "../engine/config"
import {
  assessDimensions,
  assessDimensionsAsync,
  getGuidance,
} from "../engine/homeostasis-engine"
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
import { checkForEscalation, cleanupEscalation } from "./escalation"
import { parseGlabActivity } from "./glab-activity-parser"
import type { OperationalContext } from "./operational-memory"
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
import type {
  ChannelMessage,
  ChannelName,
  SelfModel,
  TickResult,
} from "./types"
import { getTextContent } from "./types"
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
// Repo root resolution — workspace paths must resolve against the main repo,
// not the current worktree, because workspaces/ is gitignored.
// ---------------------------------------------------------------------------

let cachedRepoRoot: string | undefined

async function getMainRepoRoot(): Promise<string> {
  if (cachedRepoRoot) return cachedRepoRoot
  try {
    const { execSync } = await import("node:child_process")
    const gitCommonDir = execSync("git rev-parse --git-common-dir", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim()
    // --git-common-dir returns the .git dir of the main repo
    const { resolve, dirname } = await import("node:path")
    cachedRepoRoot = resolve(dirname(gitCommonDir))
    // Handle bare .git dir case (returns "." or absolute path ending in .git)
    if (cachedRepoRoot.endsWith("/.git")) {
      cachedRepoRoot = cachedRepoRoot.slice(0, -5)
    }
  } catch (err) {
    console.warn("[tick] Failed to resolve repo root via git:", err)
    cachedRepoRoot = process.cwd()
  }
  return cachedRepoRoot
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
    } catch (err) {
      console.warn("[tick] Coding adapter unavailable:", err)
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
// Tick timing instrumentation
// ---------------------------------------------------------------------------

interface TickTimings {
  specLoadMs?: number
  opContextLoadMs?: number
  factRetrievalMs?: number
  homeostasisMs?: number
  contextAssemblyMs?: number
  routingMs?: number
  llmMs?: number
  adapterMs?: number
  verifyMs?: number
  dispatchMs?: number
  totalMs?: number
}

function logTimings(agentId: string, tickId: string, timings: TickTimings) {
  const parts = Object.entries(timings)
    .filter(([, v]) => v !== undefined && v > 0)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")
  console.log(`[tick:timing] ${agentId} ${tickId.slice(0, 8)} ${parts}`)
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
  diagnostics?: TickDecisionRecord["diagnostics"]
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
    ...(params.diagnostics ? { diagnostics: params.diagnostics } : {}),
  }
}

// ---------------------------------------------------------------------------
// Action feedback — glab output parsing → opCtx update → dimension recovery
// ---------------------------------------------------------------------------

/**
 * Post-tick: scan tool outputs for GitLab activity and update opCtx.
 * Closes the homeostasis feedback loop: agent checks GitLab → opCtx updated → dimensions recover.
 */
function applyGlabFeedback(
  opCtx: OperationalContext,
  steps: Array<{
    toolName?: string
    toolArgs?: Record<string, unknown>
    toolResult?: string
    role?: string
    content?: string
  }>,
): void {
  const activity = parseGlabActivity(steps)
  if (!activity.queriedGitLab && activity.createdItems.length === 0) return

  if (activity.queriedGitLab) {
    opCtx.lastExternalCheckAt = new Date().toISOString()
  }

  if (!opCtx.activeWorkItems) opCtx.activeWorkItems = []

  const allActivity = [...activity.issueActivity, ...activity.mrActivity]
  for (const item of allActivity) {
    const existing = opCtx.activeWorkItems.find((w) => w.id === item.id)
    if (existing) {
      existing.lastActivityAt = item.lastActivityAt
      if (item.title) existing.title = item.title
    }
  }

  for (const created of activity.createdItems) {
    const exists = opCtx.activeWorkItems.some((w) => w.id === created.id)
    if (!exists) {
      opCtx.activeWorkItems.push({
        id: created.id,
        title: created.title,
        lastActivityAt: new Date().toISOString(),
        assignedTo: created.assignedTo,
        delegatedAt: created.assignedTo ? new Date().toISOString() : undefined,
      })
    }
  }

  // Increment outboundFollowUps only for active engagement (create/update),
  // not passive queries (list/view). A glab issue list is an external check,
  // not a follow-up with the assignee.
  if (activity.createdItems.length > 0) {
    opCtx.outboundFollowUps = (opCtx.outboundFollowUps ?? 0) + 1
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

export function clearAgentLock(agentId: string): void {
  agentLocks.delete(agentId)
}

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
    } catch (err) {
      console.warn("[tick] Previous tick for agent failed:", err)
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
  const optsOpContextPath = opts?.opContextPath

  const timings: TickTimings = {}

  // Stage 1: Load agent spec + operational context + self-model
  const selfModel = await checkSelfModel()

  // Load agent spec FIRST — we need operational_memory and knowledge_store paths
  let spec: AgentSpec | undefined
  let toolsContext: string | undefined
  let specTrust: AgentSpec["trust"] | undefined
  let t0 = Date.now()
  try {
    spec = await loadAgentSpec(agentId)
    toolsContext = spec.tools_context
    specTrust = spec.trust
  } catch (err) {
    console.warn(`[tick] Agent spec not found for ${agentId}:`, err)
  }
  timings.specLoadMs = Date.now() - t0

  // Use per-agent paths from spec to prevent cross-agent contamination
  const agentOpPath = optsOpContextPath ?? spec?.operational_memory ?? undefined
  t0 = Date.now()
  const opCtx = await loadOperationalContext(agentOpPath)
  timings.opContextLoadMs = Date.now() - t0
  const storePath =
    opts?.storePath ?? spec?.knowledge_store ?? "data/memory/entries.jsonl"

  // Build diagnostics closure — captures paths used for this tick
  const buildDiagnostics = (extra?: {
    modelUsed?: string
    providerUsed?: string
    factsRetrieved?: number
    escalation?: TickDecisionRecord["diagnostics"] extends
      | { escalation?: infer E }
      | undefined
      ? E
      : never
  }): TickDecisionRecord["diagnostics"] => ({
    operationalMemoryPath: agentOpPath ?? "data/agent/operational-context.json",
    knowledgeStorePath: storePath,
    specLoaded: !!spec,
    workspacePath: spec?.workspace,
    ...extra,
    timings: Object.fromEntries(
      Object.entries(timings).filter(([, v]) => v != null),
    ) as Record<string, number>,
  })

  // Stage 2: Read state
  const state = await getAgentState(statePath)
  const pending = state.pendingMessages

  // Stage 3: Decide what to act on
  if (pending.length > 0) {
    const msg = pickNextMessage(pending) // priority-sorted

    const textContent = getTextContent(msg.content)

    // Retrieve facts relevant to the message + sender entity
    t0 = Date.now()
    const facts = await retrieveRelevantFacts(textContent, storePath, {
      additionalEntities: [msg.from],
    })
    timings.factRetrievalMs = Date.now() - t0
    const retrievedFacts = facts.entries

    // Record inbound in operational history (before assessment, so stuck detection sees it)
    pushHistoryEntry(opCtx, "user", textContent)

    // Find active task from operational context
    const activeOpTask = opCtx.tasks.find(
      (t) => t.status === "in_progress" || t.status === "assigned",
    )

    // Find any blocked task with a pending escalation
    const escalationTask = opCtx.tasks.find(
      (t) => t.status === "blocked" && t.escalatedAt,
    )

    const agentContext: AgentContext = {
      sessionId: `tick-${Date.now()}`,
      currentMessage: textContent,
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
      // Escalation state
      pendingEscalation: escalationTask
        ? {
            category: escalationTask.escalationCategory ?? "blocked",
            escalatedAt: escalationTask.escalatedAt!,
          }
        : undefined,
      // Phase I: activity signal fields (from operational memory)
      activeWorkItems: opCtx.activeWorkItems ?? undefined,
      lastExternalCheckAt: opCtx.lastExternalCheckAt ?? undefined,
      outboundFollowUps: opCtx.outboundFollowUps ?? undefined,
      inboundActivityCount: opCtx.inboundActivityCount ?? undefined,
    }

    t0 = Date.now()
    const skipL2 = msg.metadata?.skipL2 === true
    const homeostasis = skipL2
      ? assessDimensions(agentContext)
      : await assessDimensionsAsync(agentContext)
    timings.homeostasisMs = Date.now() - t0
    const homeostasisForContext: Record<string, string> = {}
    for (const [k, v] of Object.entries(homeostasis)) {
      if (k !== "assessed_at" && k !== "assessment_method") {
        homeostasisForContext[k] = v as string
      }
    }
    t0 = Date.now()
    const context = await assembleContext({
      storePath,
      agentContext,
      retrievedEntries: facts.entries,
      workflowInstructions: spec?.workflow_instructions,
      homeostasisState: homeostasisForContext,
    })
    timings.contextAssemblyMs = Date.now() - t0

    // Smart routing: heuristic first, LLM fallback for low-confidence
    t0 = Date.now()
    let routing = inferRouting(textContent, msg.messageType)
    if (
      routing.confidence === "low" &&
      selfModel.availableProviders.length > 0
    ) {
      const llmRouting = await classifyWithLLM(textContent)
      if (llmRouting) {
        routing = llmRouting
      }
    }
    timings.routingMs = Date.now() - t0

    // Stage 3b: Delegate to coding adapter for explicit task assignments
    const adapter = await ensureAdapter()
    if (msg.messageType === "task_assignment" && adapter) {
      const existingTask = getActiveTask(opCtx)
      const task = existingTask ?? addTask(opCtx, textContent, msg)
      if (existingTask) {
        task.progress.push(`Follow-up: ${textContent}`)
      }
      task.status = "in_progress"

      // Resume from this task's own session, or from the most recently
      // completed task (for sequential follow-ups after completion).
      // Never use shared lastClaudeSessionId which can collide across
      // concurrent ticks.
      const resumeSessionId =
        task.claudeSessionId ??
        (existingTask
          ? undefined
          : opCtx.tasks
              .filter((t) => t.status === "done" && t.claudeSessionId)
              .at(-1)?.claudeSessionId)
      const sessionResumed = !!resumeSessionId
      // Resolve workspace relative to the main repo root (not cwd),
      // because workspaces/ is gitignored and won't exist in worktrees.
      const repoRoot = await getMainRepoRoot()
      const specWorkspace = spec?.workspace
        ? `${repoRoot}/${spec.workspace}`
        : undefined
      const baseDir =
        (msg.metadata?.workspace as string) ?? specWorkspace ?? repoRoot

      // Create an isolated worktree for coding tasks so the main
      // working directory (and dev server) stays on main undisturbed.
      const { execSync } = await import("node:child_process")
      // Generate descriptive branch name from task description
      const branchSlug = task.description
        .slice(0, 40)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
      const worktreeBranch = `${agentId}/${branchSlug || task.id}`
      const worktreePath = `${baseDir}/.worktrees/task-${task.id}`
      let workDir = baseDir
      let usingWorktree = false
      try {
        execSync(`git worktree add "${worktreePath}" -b "${worktreeBranch}"`, {
          cwd: baseDir,
          encoding: "utf-8",
          timeout: 10_000,
        })
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
      if (secrets.gitlab?.token) {
        ;(task as any)._prevGitlabToken = process.env.GITLAB_TOKEN ?? null
        process.env.GITLAB_TOKEN = secrets.gitlab.token
      }
      // Skip /etc/gitconfig — snap-confined glab can't read it
      process.env.GIT_CONFIG_NOSYSTEM = "1"

      // Set agent-specific Claude config directory (skills, plugins, settings)
      const prevClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR ?? null
      if (spec?.claude_config_dir) {
        process.env.CLAUDE_CONFIG_DIR = spec.claude_config_dir
      }

      const workContext = toolsContext
        ? {
            ...context,
            systemPrompt: `${context.systemPrompt}\n\n## Available CLI Tools\n${toolsContext}`,
          }
        : context
      const config = getLLMConfig()
      // Pass raw content through for multimodal support (images)
      const rawDescription = existingTask ? textContent : task.description
      // Extract images from content blocks for the adapter
      const images = Array.isArray(msg.content)
        ? msg.content.filter(
            (b): b is import("./types").ImageBlock => b.type === "image",
          )
        : undefined
      const taskDescription = usingWorktree
        ? `${rawDescription}\n\n**Working directory:** You are in an isolated git worktree at \`${workDir}\` on branch \`${worktreeBranch}\`. The main repo is undisturbed.\n\n**When you finish:** Commit your changes, push the branch (\`git push -u origin ${worktreeBranch}\`), and create a merge request. If push or MR creation fails, report the error — do not fail silently.`
        : rawDescription
      t0 = Date.now()
      const arcResult = await executeWorkArc({
        adapter,
        task: { id: task.id, description: taskDescription },
        context: workContext,
        workingDirectory: workDir,
        trustLevel: (agentContext.sourceTrustLevel ?? "MEDIUM") as TrustLevel,
        model: (msg.metadata?.modelOverride as string) || config.model,
        sessionId: resumeSessionId,
        images: images?.length ? images : undefined,
        timeout: getAdapterTimeout(routing.taskType),
      })
      timings.adapterMs = Date.now() - t0

      // Store session ID for potential resume (both on task and context)
      if (arcResult.sessionId) {
        task.claudeSessionId = arcResult.sessionId
        opCtx.lastClaudeSessionId = arcResult.sessionId
      }

      // Update task status based on result
      let knowledgeCount = 0
      if (arcResult.status === "completed") {
        task.status = "done"
        // Keep claudeSessionId — a follow-up message may resume this session
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
      // ESCALATION check — agent may have written an escalation file
      // ---------------------------------------------------------------
      const escalation = await checkForEscalation(workDir, task.id)
      if (escalation) {
        task.status = "blocked"
        task.escalatedAt = new Date().toISOString()
        task.escalationCategory = escalation.category
        opCtx.blockers.push(
          `Escalated (${escalation.category}): ${escalation.reason}`,
        )

        // Dispatch escalation message to the configured target
        if (spec?.escalation_target) {
          const escalationMsg: ChannelMessage = {
            id: `escalate-${msg.id}`,
            channel: spec.escalation_target.channel as ChannelName,
            direction: "outbound",
            routing: { replyToId: msg.id },
            from: agentId,
            content: `**Escalation from ${spec.agent.name}** (${escalation.category}):\n\n${escalation.reason}\n\nTask: ${task.description}`,
            messageType: "status_update",
            receivedAt: new Date().toISOString(),
            metadata: {
              escalation: true,
              category: escalation.category,
            },
          }
          try {
            await dispatchMessage(escalationMsg)
          } catch {
            console.warn("[tick] Failed to dispatch escalation message")
          }
        }

        await cleanupEscalation(workDir, task.id)
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
            "1. Run tests if available (pnpm vitest run or similar) — do they pass?",
            "2. Run linter if configured (pnpm biome check or similar) — any violations?",
            "3. Review the diff: does it match what was asked?",
            "4. Check: are all changes committed? (git status --porcelain should be empty)",
            "5. Check: was the branch pushed? (git log origin/<branch>..HEAD should be empty)",
            "   If not pushed, push it now: git push -u origin <current-branch>",
            "6. Check: was a merge request created?",
            "   If not, create one now using glab or the GitLab API.",
            "7. If any issues found, fix them, commit, and push.",
            "",
            "Report what you found and fixed. Never skip a failing check silently.",
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
      // CLEANUP — restore env and remove worktree
      // ---------------------------------------------------------------
      // Restore previous GITLAB_TOKEN (or remove if there wasn't one)
      if ("_prevGitlabToken" in (task as any)) {
        if ((task as any)._prevGitlabToken) {
          process.env.GITLAB_TOKEN = (task as any)._prevGitlabToken
        } else {
          delete process.env.GITLAB_TOKEN
        }
      }

      // Restore CLAUDE_CONFIG_DIR
      if (prevClaudeConfigDir) {
        process.env.CLAUDE_CONFIG_DIR = prevClaudeConfigDir
      } else {
        delete process.env.CLAUDE_CONFIG_DIR
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
      } catch (err) {
        console.warn("[tick] Failed to dispatch message:", err)
      }

      // Action feedback: parse glab outputs from work arc transcript
      applyGlabFeedback(opCtx, arcResult.transcript)
      recordOutbound(opCtx)
      await saveOperationalContext(opCtx, agentOpPath)
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
          status: escalation
            ? "failed"
            : arcResult.status === "completed"
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
          escalation: escalation
            ? {
                category: escalation.category,
                reason: escalation.reason,
                target: spec?.escalation_target?.entity,
              }
            : undefined,
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
          toolCalls: arcResult.transcript.filter((e) => e.role === "tool_call")
            .length,
          toolNames: [
            ...new Set(
              arcResult.transcript
                .filter((e) => e.role === "tool_call" && e.toolName)
                .map((e) => e.toolName as string),
            ),
          ],
        },
        outcome: {
          action: "delegate",
          response: statusText,
          artifactsCreated: [],
          knowledgeEntriesCreated: knowledgeCount,
        },
        durationMs: Date.now() - tickStart,
        diagnostics: buildDiagnostics({
          modelUsed: (msg.metadata?.modelOverride as string) || config.model,
          providerUsed: "claude-code",
          factsRetrieved: retrievedFacts.length,
          escalation: escalation
            ? {
                category: escalation.category,
                reason: escalation.reason,
                target: spec?.escalation_target?.entity,
              }
            : undefined,
        }),
      })
      appendTickRecord(delegateRecord, getTickRecordPath(agentId)).catch(
        (err) => console.warn("[tick] Failed to persist tick record:", err),
      )

      timings.totalMs = Date.now() - tickStart
      logTimings(agentId, tickId, timings)
      return tickResult
    }

    // Stage 4: Generate response — Agent SDK direct or AI SDK agent loop
    let llmResult: string | undefined
    let loopToolCalls = 0
    let loopToolNames: string[] = []
    let loopCostUsd: number | undefined
    let loopStepsForFeedback: Array<{
      toolName?: string
      toolArgs?: Record<string, unknown>
      toolResult?: string
    }> = []
    let executionAdapter: "claude-code" | "direct-response" = "direct-response"
    let usedProvider: string | undefined

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
        usedProvider = "claude-code"
        try {
          // Build conversation history from operational context
          const ccHistory = opCtx.recentHistory
            .slice(0, -1)
            .map((h) => ({ role: h.role, content: h.content }))

          t0 = Date.now()
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

          timings.llmMs = Date.now() - t0
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
          const { model, modelName } = getModelWithFallback()
          usedProvider = modelName.includes(":")
            ? modelName.split(":")[0]
            : config.provider

          // Build history from operational context (exclude the message we just added)
          const history = opCtx.recentHistory
            .slice(0, -1)
            .map((h) => ({ role: h.role, content: h.content }))

          t0 = Date.now()
          const loopResult = await runAgentLoop({
            model,
            system: systemPrompt,
            messages: [{ role: "user", content: textContent }],
            tools: getAgentTools(agentId, msg.metadata?.workspace as string),
            history,
            config: { maxSteps: 8, timeoutMs: 120_000 },
          })

          timings.llmMs = Date.now() - t0
          llmResult = loopResult.text
          const toolSteps = loopResult.steps.filter(
            (s) => s.type === "tool_call",
          )
          loopToolCalls = toolSteps.length
          loopToolNames = toolSteps
            .map((s) => s.toolName)
            .filter((n): n is string => !!n)

          // Capture steps for action feedback parsing
          loopStepsForFeedback = loopResult.steps

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

      // Action feedback: parse glab outputs from agent loop
      if (loopStepsForFeedback.length > 0) {
        applyGlabFeedback(opCtx, loopStepsForFeedback)
      }

      // Record outbound time + save operational context
      recordOutbound(opCtx)
      await saveOperationalContext(opCtx, agentOpPath)

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
        diagnostics: buildDiagnostics({
          providerUsed: usedProvider,
          factsRetrieved: retrievedFacts.length,
        }),
      })
      appendTickRecord(respondRecord, getTickRecordPath(agentId)).catch((err) =>
        console.warn("[tick] Failed to persist tick record:", err),
      )

      timings.totalMs = Date.now() - tickStart
      logTimings(agentId, tickId, timings)
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
    await saveOperationalContext(opCtx, agentOpPath)

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
      diagnostics: buildDiagnostics({
        factsRetrieved: retrievedFacts.length,
      }),
    })
    appendTickRecord(templateRecord, getTickRecordPath(agentId)).catch((err) =>
      console.warn("[tick] Failed to persist tick record:", err),
    )

    timings.totalMs = Date.now() - tickStart
    logTimings(agentId, tickId, timings)
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
    // Phase I: activity signal fields (from operational memory)
    activeWorkItems: opCtx.activeWorkItems ?? undefined,
    lastExternalCheckAt: opCtx.lastExternalCheckAt ?? undefined,
    outboundFollowUps: opCtx.outboundFollowUps ?? undefined,
    inboundActivityCount: opCtx.inboundActivityCount ?? undefined,
  }

  await saveOperationalContext(opCtx, agentOpPath)

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
    diagnostics: buildDiagnostics(),
  })
  appendTickRecord(idleRecord, getTickRecordPath(agentId)).catch((err) =>
    console.warn("[tick] Failed to persist tick record:", err),
  )

  timings.totalMs = Date.now() - tickStart
  logTimings(agentId, tickId, timings)
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
