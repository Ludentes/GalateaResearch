import { appendEvents } from "./event-store"
import type { ObservationEvent } from "./types"

const DEFAULT_STORE_PATH = "data/observations/events.jsonl"

/**
 * Format an event for console output.
 * Severity-aware: warning/error → console.warn, else console.log.
 */
function logToConsole(event: ObservationEvent): void {
  const severity = event.attributes.severity as string | undefined
  const tag = `[${event.source}]`
  const attrs = Object.entries(event.attributes)
    .filter(([k]) => k !== "event.name" && k !== "severity")
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")

  const line = `${tag} ${event.body}${attrs ? ` | ${attrs}` : ""}`

  if (severity === "error") {
    console.error(line)
  } else if (severity === "warning") {
    console.warn(line)
  } else {
    console.log(line)
  }
}

/**
 * Emit a single observation event.
 * Writes to JSONL store AND logs to console.
 * Auto-generates id and timestamp.
 */
export async function emitEvent(
  event: Omit<ObservationEvent, "id" | "timestamp">,
  storePath = DEFAULT_STORE_PATH,
): Promise<void> {
  const full: ObservationEvent = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...event,
  }
  logToConsole(full)
  await appendEvents(storePath, [full])
}
