import { appendFile, mkdir, readFile } from "node:fs/promises"
import path from "node:path"

export interface TickDecisionRecord {
  tickId: string
  agentId: string
  timestamp: string
  trigger: {
    type: "message" | "heartbeat" | "internal"
    source?: string
  }
  homeostasis: Record<
    string,
    {
      state: "HEALTHY" | "ELEVATED" | "LOW"
      method?: string
    }
  >
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
    durationMs: number
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
