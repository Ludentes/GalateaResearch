import { appendEvents } from "./event-store"
import type { ObservationEvent } from "./types"

const DEFAULT_STORE_PATH = "data/observations/events.jsonl"

/**
 * Emit a single observation event to the JSONL store.
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
  await appendEvents(storePath, [full])
}
