import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { AgentState, PendingMessage } from "./types"

const DEFAULT_STATE_PATH = "data/agent/state.json"

const EMPTY_STATE: AgentState = {
  lastActivity: new Date().toISOString(),
  pendingMessages: [],
}

export async function getAgentState(
  statePath = DEFAULT_STATE_PATH,
): Promise<AgentState> {
  if (!existsSync(statePath)) return { ...EMPTY_STATE }
  const content = await readFile(statePath, "utf-8")
  return JSON.parse(content)
}

export async function updateAgentState(
  patch: Partial<AgentState>,
  statePath = DEFAULT_STATE_PATH,
): Promise<void> {
  const current = await getAgentState(statePath)
  const updated = { ...current, ...patch }
  await mkdir(path.dirname(statePath), { recursive: true })
  await writeFile(statePath, JSON.stringify(updated, null, 2))
}

export async function addPendingMessage(
  msg: PendingMessage,
  statePath = DEFAULT_STATE_PATH,
): Promise<void> {
  const state = await getAgentState(statePath)
  state.pendingMessages.push(msg)
  await updateAgentState(state, statePath)
}

export async function removePendingMessage(
  msg: PendingMessage,
  statePath = DEFAULT_STATE_PATH,
): Promise<void> {
  const state = await getAgentState(statePath)
  state.pendingMessages = state.pendingMessages.filter(
    (m) =>
      !(
        m.from === msg.from &&
        m.content === msg.content &&
        m.receivedAt === msg.receivedAt
      ),
  )
  await updateAgentState(state, statePath)
}
