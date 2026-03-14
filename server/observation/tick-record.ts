import { appendFile, mkdir, readFile } from "node:fs/promises"
import path from "node:path"

export interface TickDecisionRecord {
  tickId: string
  agentId: string
  timestamp: string
  trigger: {
    type: "message" | "heartbeat" | "internal"
    source?: string
    trustLevel?: string
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- serialized from HomeostasisState
  homeostasis: Record<string, any>
  guidance: string[]
  routing: {
    level: "interaction" | "task"
    taskType?: string
    reasoning?: string
  }
  execution: {
    adapter: "claude-code" | "direct-response" | "none"
    sessionResumed: boolean
    toolCalls: number
    toolNames?: string[]
    durationMs: number
    costUsd?: number
  }
  resources: {
    inputTokens?: number
    outputTokens?: number
    subscriptionUsage5h?: number
  }
  outcome: {
    action: "respond" | "delegate" | "ask" | "idle" | "extract"
    response?: string
    artifactsCreated: string[]
    knowledgeEntriesCreated: number
  }
}

export function getTickRecordPath(agentId: string): string {
  return `data/observations/ticks/${agentId}.jsonl`
}

export async function appendTickRecord(
  record: TickDecisionRecord,
  filePath: string,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await appendFile(filePath, `${JSON.stringify(record)}\n`)
}

export async function readTickRecords(
  filePath: string,
  options?: { limit?: number; offset?: number },
): Promise<TickDecisionRecord[]> {
  let content: string
  try {
    content = await readFile(filePath, "utf-8")
  } catch {
    return []
  }

  let records = content
    .split("\n")
    .filter((line) => line.trim() !== "")
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as TickDecisionRecord]
      } catch {
        return []
      }
    })

  const offset = options?.offset ?? 0
  if (offset > 0) {
    records = records.slice(offset)
  }

  if (options?.limit !== undefined) {
    records = records.slice(0, options.limit)
  }

  return records
}

export async function readLastTickRecord(
  filePath: string,
): Promise<TickDecisionRecord | null> {
  let content: string
  try {
    content = await readFile(filePath, "utf-8")
  } catch {
    return null
  }

  const lines = content.split("\n").filter((line) => line.trim() !== "")
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]) as TickDecisionRecord
    } catch {}
  }
  return null
}
