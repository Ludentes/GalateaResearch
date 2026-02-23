import { existsSync, readFileSync } from "node:fs"
import { appendFile, mkdir } from "node:fs/promises"
import path from "node:path"
import type { ObservationEvent } from "./types"

/**
 * Read all events from the JSONL store.
 */
export async function readEvents(
  storePath: string,
): Promise<ObservationEvent[]> {
  if (!existsSync(storePath)) return []

  const lines = readFileSync(storePath, "utf-8").split("\n")
  const events: ObservationEvent[] = []

  for (const line of lines) {
    if (line.trim()) {
      try {
        events.push(JSON.parse(line))
      } catch (err) {
        console.error(`Failed to parse event line: ${line}`, err)
      }
    }
  }

  return events
}

/**
 * Append events to the JSONL store.
 * Creates store directory if it doesn't exist.
 */
export async function appendEvents(
  storePath: string,
  events: ObservationEvent[],
): Promise<void> {
  const dir = path.dirname(storePath)
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }

  const lines = `${events.map((e) => JSON.stringify(e)).join("\n")}\n`
  await appendFile(storePath, lines)
}
