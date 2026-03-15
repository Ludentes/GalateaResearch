// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { clearHandlers, dispatchMessage, registerHandler } from "../dispatcher"
import type { ChannelMessage } from "../types"

// ---------------------------------------------------------------------------
// Feature: Dispatcher with ChannelMessage
// ---------------------------------------------------------------------------

describe("dispatchMessage", () => {
  afterEach(() => {
    clearHandlers()
  })

  function makeOutboundMessage(
    overrides: Partial<ChannelMessage> = {},
  ): ChannelMessage {
    return {
      id: "msg-001",
      channel: "discord",
      direction: "outbound",
      routing: {},
      from: "galatea",
      content: "Hello, world!",
      messageType: "chat",
      receivedAt: new Date().toISOString(),
      metadata: {},
      ...overrides,
    }
  }

  // Scenario: Outbound dispatch to Discord
  it("dispatches to registered handler", async () => {
    const sendFn = vi.fn()
    registerHandler("discord", { send: sendFn })

    const msg = makeOutboundMessage()
    await dispatchMessage(msg)

    expect(sendFn).toHaveBeenCalledWith(msg)
  })

  // Scenario: Outbound dispatch to dashboard
  it("dispatches to dashboard handler", async () => {
    const sendFn = vi.fn()
    registerHandler("dashboard", { send: sendFn })

    const msg = makeOutboundMessage({ channel: "dashboard" })
    await dispatchMessage(msg)

    expect(sendFn).toHaveBeenCalledWith(msg)
  })

  // Scenario: Round-trip routing preserves context
  it("preserves routing metadata through dispatch", async () => {
    const sendFn = vi.fn()
    registerHandler("discord", { send: sendFn })

    const msg = makeOutboundMessage({
      routing: { threadId: "sprint-42", replyToId: "original-msg-123" },
    })
    await dispatchMessage(msg)

    const dispatched = sendFn.mock.calls[0][0] as ChannelMessage
    expect(dispatched.routing.threadId).toBe("sprint-42")
    expect(dispatched.routing.replyToId).toBe("original-msg-123")
  })

  it("throws for unregistered channel", async () => {
    const msg = makeOutboundMessage({ channel: "gitlab" })
    await expect(dispatchMessage(msg)).rejects.toThrow(
      "No handler registered for channel: gitlab",
    )
  })

  it("clearHandlers clears registry", async () => {
    registerHandler("discord", { send: vi.fn() })
    registerHandler("dashboard", { send: vi.fn() })

    clearHandlers()

    await expect(
      dispatchMessage(makeOutboundMessage({ channel: "discord" })),
    ).rejects.toThrow()
    await expect(
      dispatchMessage(makeOutboundMessage({ channel: "dashboard" })),
    ).rejects.toThrow()
  })

  it("allows overriding a handler", async () => {
    const first = vi.fn()
    const second = vi.fn()
    registerHandler("discord", { send: first })
    registerHandler("discord", { send: second })

    await dispatchMessage(makeOutboundMessage())
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalled()
  })
})
