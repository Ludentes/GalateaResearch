import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

interface SessionExtractionRecord {
  extractedAt: string
  entriesCount: number
  transcriptPath: string
}

export interface ExtractionState {
  sessions: Record<string, SessionExtractionRecord>
}

const DEFAULT_STATE_PATH = "data/memory/extraction-state.json"

export async function getExtractionState(
  statePath = DEFAULT_STATE_PATH,
): Promise<ExtractionState> {
  if (!existsSync(statePath)) return { sessions: {} }
  const content = await readFile(statePath, "utf-8")
  return JSON.parse(content)
}

export async function isSessionExtracted(
  sessionId: string,
  statePath = DEFAULT_STATE_PATH,
): Promise<boolean> {
  const state = await getExtractionState(statePath)
  return sessionId in state.sessions
}

export async function markSessionExtracted(
  sessionId: string,
  opts: {
    entriesCount: number
    transcriptPath: string
    statePath?: string
  },
): Promise<void> {
  const statePath = opts.statePath || DEFAULT_STATE_PATH
  const state = await getExtractionState(statePath)

  state.sessions[sessionId] = {
    extractedAt: new Date().toISOString(),
    entriesCount: opts.entriesCount,
    transcriptPath: opts.transcriptPath,
  }

  await mkdir(path.dirname(statePath), { recursive: true })
  await writeFile(statePath, JSON.stringify(state, null, 2))
}
