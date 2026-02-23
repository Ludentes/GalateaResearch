import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { ChannelMessage } from "./types"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskState {
  id: string
  description: string
  source: ChannelMessage
  status: "assigned" | "in_progress" | "blocked" | "done"
  phase: "exploring" | "deciding" | "implementing" | "verifying"
  progress: string[]
  artifacts: string[]
  phaseStartedAt: string
  toolCallCount: number
}

export type WorkPhase =
  | "idle"
  | "exploring"
  | "deciding"
  | "implementing"
  | "verifying"
  | "blocked"

export interface HistoryEntry {
  role: "user" | "assistant"
  content: string
  timestamp: string
}

export interface OperationalContext {
  tasks: TaskState[]
  workPhase: WorkPhase
  nextActions: string[]
  blockers: string[]
  carryover: string[]
  recentHistory: HistoryEntry[]
  phaseEnteredAt: string
  lastOutboundAt: string
  lastUpdated: string
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONTEXT_PATH = "data/agent/operational-context.json"
const MAX_HISTORY_ENTRIES = 10 // 5 exchanges = 10 messages

function emptyContext(): OperationalContext {
  const now = new Date().toISOString()
  return {
    tasks: [],
    workPhase: "idle",
    nextActions: [],
    blockers: [],
    carryover: [],
    recentHistory: [],
    phaseEnteredAt: now,
    lastOutboundAt: "",
    lastUpdated: now,
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export async function loadOperationalContext(
  contextPath = DEFAULT_CONTEXT_PATH,
): Promise<OperationalContext> {
  if (!existsSync(contextPath)) return emptyContext()
  const content = await readFile(contextPath, "utf-8")
  return JSON.parse(content)
}

export async function saveOperationalContext(
  ctx: OperationalContext,
  contextPath = DEFAULT_CONTEXT_PATH,
): Promise<void> {
  ctx.lastUpdated = new Date().toISOString()
  await mkdir(path.dirname(contextPath), { recursive: true })
  await writeFile(contextPath, JSON.stringify(ctx, null, 2))
}

// ---------------------------------------------------------------------------
// Task management
// ---------------------------------------------------------------------------

export function addTask(
  ctx: OperationalContext,
  description: string,
  source: ChannelMessage,
): TaskState {
  const task: TaskState = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    description,
    source,
    status: "assigned",
    phase: "exploring",
    progress: [],
    artifacts: [],
    phaseStartedAt: new Date().toISOString(),
    toolCallCount: 0,
  }
  ctx.tasks.push(task)
  return task
}

export function getActiveTask(ctx: OperationalContext): TaskState | undefined {
  // Priority: in_progress > assigned > blocked
  return (
    ctx.tasks.find((t) => t.status === "in_progress") ??
    ctx.tasks.find((t) => t.status === "assigned")
  )
}

export function updateTaskPhase(
  task: TaskState,
  phase: TaskState["phase"],
): void {
  task.phase = phase
  task.phaseStartedAt = new Date().toISOString()
}

export function completeTask(
  ctx: OperationalContext,
  taskId: string,
): TaskState | undefined {
  const task = ctx.tasks.find((t) => t.id === taskId)
  if (!task) return undefined
  task.status = "done"
  // Add summary to carryover
  ctx.carryover.push(
    `Completed: ${task.description}. Artifacts: ${task.artifacts.join(", ") || "none"}.`,
  )
  return task
}

// ---------------------------------------------------------------------------
// History management
// ---------------------------------------------------------------------------

export function pushHistoryEntry(
  ctx: OperationalContext,
  role: "user" | "assistant",
  content: string,
): void {
  ctx.recentHistory.push({
    role,
    content,
    timestamp: new Date().toISOString(),
  })
  // Bound to MAX_HISTORY_ENTRIES
  if (ctx.recentHistory.length > MAX_HISTORY_ENTRIES) {
    ctx.recentHistory = ctx.recentHistory.slice(-MAX_HISTORY_ENTRIES)
  }
}

export function recordOutbound(ctx: OperationalContext): void {
  ctx.lastOutboundAt = new Date().toISOString()
}

// ---------------------------------------------------------------------------
// Phase duration (for guardrails)
// ---------------------------------------------------------------------------

export function phaseDurationMs(ctx: OperationalContext): number {
  if (!ctx.phaseEnteredAt) return 0
  return Date.now() - new Date(ctx.phaseEnteredAt).getTime()
}

export function timeSinceLastOutboundMs(ctx: OperationalContext): number {
  if (!ctx.lastOutboundAt) return Infinity
  return Date.now() - new Date(ctx.lastOutboundAt).getTime()
}
