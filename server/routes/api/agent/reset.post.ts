import { rm } from "node:fs/promises"
import { defineEventHandler, HTTPError, readBody } from "h3"
import { loadAgentSpec } from "../../../agent/agent-spec"
import { updateAgentState } from "../../../agent/agent-state"
import { clearAgentSession } from "../../../agent/claude-code-respond"
import {
  emptyContext,
  saveOperationalContext,
} from "../../../agent/operational-memory"
import { clearConfigCache } from "../../../engine/config"
import { clearCache } from "../../../engine/homeostasis-engine"
import { getTickRecordPath } from "../../../observation/tick-record"

// Provider cache is system-level state, not per-agent — don't invalidate on reset

interface ResetBody {
  agentId?: string
  clearTicks?: boolean
  clearKnowledge?: boolean
}

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as ResetBody

  if (!body.agentId) {
    throw new HTTPError("Missing required field: agentId", { status: 400 })
  }

  const agentId = body.agentId
  const cleared: string[] = []

  // 1. Clear in-memory Claude Code SDK session (conversation history)
  clearAgentSession(agentId)
  cleared.push("agentSession")

  // 2. Reset agent state file (pendingMessages + activityLog)
  await updateAgentState({
    lastActivity: new Date().toISOString(),
    pendingMessages: [],
    activityLog: [],
  })
  cleared.push("agentState")

  // 3. Reset operational context (recentHistory, tasks, carryover)
  // Use per-agent path from spec to avoid cross-agent contamination
  let opPath: string | undefined
  try {
    const spec = await loadAgentSpec(agentId)
    opPath = spec.operational_memory
  } catch (err) {
    console.warn(`[reset] Agent spec not found for ${agentId}:`, err)
  }
  await saveOperationalContext(emptyContext(), opPath)
  cleared.push("operationalContext")

  // 4. Clear homeostasis dimension cache (in-memory, per-session)
  clearCache()
  cleared.push("homeostasisCache")

  // 5. Reload config from disk (picks up config.yaml changes without restart)
  clearConfigCache()
  cleared.push("configCache")

  // 6. Optionally clear tick records
  if (body.clearTicks) {
    const tickPath = getTickRecordPath(agentId)
    await rm(tickPath, { force: true })
    cleared.push("tickRecords")
  }

  // 7. Optionally truncate knowledge store
  if (body.clearKnowledge) {
    const { writeFile } = await import("node:fs/promises")
    await writeFile("data/memory/entries.jsonl", "", "utf-8")
    cleared.push("knowledgeStore")
  }

  return { ok: true, agentId, cleared }
})
