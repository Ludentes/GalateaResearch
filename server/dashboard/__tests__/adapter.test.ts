// @vitest-environment node
import { describe, expect, it } from "vitest"
import { normalizeDashboardMessage } from "../adapter"

// ---------------------------------------------------------------------------
// Feature: Dashboard chat becomes ChannelMessage
// ---------------------------------------------------------------------------

describe("Dashboard channel adapter", () => {
  // Scenario: Dashboard chat becomes ChannelMessage
  it("normalizes a dashboard message to ChannelMessage", () => {
    const cm = normalizeDashboardMessage({
      from: "newub",
      content: "What do you know about NativeWind?",
    })

    expect(cm.channel).toBe("dashboard")
    expect(cm.direction).toBe("inbound")
    expect(cm.messageType).toBe("chat")
    expect(cm.from).toBe("newub")
    expect(cm.content).toBe("What do you know about NativeWind?")
    expect(cm.id).toMatch(/^dashboard-/)
    expect(cm.routing).toEqual({})
  })

  it("preserves metadata", () => {
    const cm = normalizeDashboardMessage({
      from: "newub",
      content: "test",
      metadata: { sessionId: "abc-123" },
    })

    expect(cm.metadata.sessionId).toBe("abc-123")
  })
})
