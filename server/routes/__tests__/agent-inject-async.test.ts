// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  validateInjectBody,
  buildChannelMessage,
} from "../api/agent/inject.post"

// These unit tests verify the existing validation/build functions still work.
// The async behavior is tested via scenario runner integration.

describe("inject validation", () => {
  it("rejects missing agentId", () => {
    expect(
      validateInjectBody({
        content: "hi",
        from: "u",
        channel: "discord",
      }),
    ).toBe("Missing required field: agentId")
  })

  it("accepts valid body", () => {
    expect(
      validateInjectBody({
        agentId: "beki",
        content: "hi",
        from: "kirill",
        channel: "discord",
      }),
    ).toBeNull()
  })
})

describe("buildChannelMessage", () => {
  it("builds a channel message with defaults", () => {
    const msg = buildChannelMessage({
      agentId: "beki",
      content: "hello",
      from: "kirill",
      channel: "discord",
    })
    expect(msg.messageType).toBe("chat")
    expect(msg.direction).toBe("inbound")
  })
})
