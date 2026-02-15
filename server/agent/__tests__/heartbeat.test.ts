// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { startHeartbeat, stopHeartbeat } from "../heartbeat"

// Mock tick to avoid real LLM calls
vi.mock("../tick", () => ({
  tick: vi.fn().mockResolvedValue({
    action: "idle",
    homeostasis: {
      knowledge_sufficiency: "HEALTHY",
      certainty_alignment: "HEALTHY",
      progress_momentum: "HEALTHY",
      communication_health: "HEALTHY",
      productive_engagement: "HEALTHY",
      knowledge_application: "HEALTHY",
    },
    pendingMessages: [],
  }),
}))

// Mock agent-state — return pending messages so skip_when_idle doesn't skip
vi.mock("../agent-state", () => ({
  getAgentState: vi.fn().mockResolvedValue({
    pendingMessages: [
      { from: "test", content: "hello", channel: "test", receivedAt: new Date().toISOString() },
    ],
    lastActivity: new Date().toISOString(),
  }),
  appendActivityLog: vi.fn(),
}))

describe("Heartbeat Scheduler", () => {
  afterEach(() => {
    stopHeartbeat()
    vi.restoreAllMocks()
  })

  it("starts and can be stopped", () => {
    const timer = startHeartbeat(100)
    expect(timer).toBeDefined()
    stopHeartbeat()
  })

  it("calls tick on interval", async () => {
    const { tick } = await import("../tick")
    startHeartbeat(50)

    // Wait for at least 2 ticks
    await new Promise((r) => setTimeout(r, 120))
    stopHeartbeat()

    expect(tick).toHaveBeenCalledWith("heartbeat")
    expect((tick as any).mock.calls.length).toBeGreaterThanOrEqual(1)
  })
})
