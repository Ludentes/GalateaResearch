import { getHeartbeatConfig } from "../engine/config"
import { getAgentState } from "./agent-state"
import { tick } from "./tick"

let heartbeatTimer: ReturnType<typeof setInterval> | null = null

export function startHeartbeat(
  intervalOverride?: number,
): ReturnType<typeof setInterval> {
  const cfg = getHeartbeatConfig()
  const interval = intervalOverride ?? cfg.interval_ms

  heartbeatTimer = setInterval(async () => {
    try {
      if (cfg.skip_when_idle) {
        const state = await getAgentState()
        if (state.pendingMessages.length === 0) {
          return // Skip — nothing to do
        }
      }
      await tick("heartbeat")
    } catch (err) {
      console.error("[heartbeat] tick failed:", err)
    }
  }, interval)

  return heartbeatTimer
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}
