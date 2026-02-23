// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ChannelMessage } from "../types"
import { toChannelMessage } from "../types"
import {
  clearHandlers,
  dispatchMessage,
  registerHandler,
  registerMessageHandler,
} from "../dispatcher"

// ---------------------------------------------------------------------------
// Feature: Channel message normalization
// ---------------------------------------------------------------------------

describe("ChannelMessage type", () => {
  it("converts legacy PendingMessage to ChannelMessage", () => {
    const legacy = {
      from: "alice",
      channel: "discord",
      content: "Hello!",
      receivedAt: "2026-02-23T00:00:00.000Z",
      metadata: { discordChannelId: "ch-123" },
    }

    const cm = toChannelMessage(legacy)

    expect(cm.id).toBeTruthy()
    expect(cm.channel).toBe("discord")
    expect(cm.direction).toBe("inbound")
    expect(cm.from).toBe("alice")
    expect(cm.content).toBe("Hello!")
    expect(cm.messageType).toBe("chat")
    expect(cm.routing).toEqual({})
    expect(cm.metadata).toEqual({ discordChannelId: "ch-123" })
  })

  it("defaults to 'internal' channel when channel is empty", () => {
    const legacy = {
      from: "bot",
      channel: "",
      content: "test",
      receivedAt: "2026-02-23T00:00:00.000Z",
    }

    const cm = toChannelMessage(legacy)
    expect(cm.channel).toBe("internal")
  })
})

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
  it("dispatches to registered ChannelMessageHandler", async () => {
    const sendFn = vi.fn()
    registerMessageHandler("discord", { send: sendFn })

    const msg = makeOutboundMessage()
    await dispatchMessage(msg)

    expect(sendFn).toHaveBeenCalledWith(msg)
  })

  // Scenario: Outbound dispatch to dashboard
  it("dispatches to dashboard handler", async () => {
    const sendFn = vi.fn()
    registerMessageHandler("dashboard", { send: sendFn })

    const msg = makeOutboundMessage({ channel: "dashboard" })
    await dispatchMessage(msg)

    expect(sendFn).toHaveBeenCalledWith(msg)
  })

  // Scenario: Round-trip routing preserves context
  it("preserves routing metadata through dispatch", async () => {
    const sendFn = vi.fn()
    registerMessageHandler("discord", { send: sendFn })

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

  // Backward compat: falls back to legacy handler
  it("falls back to legacy ChannelHandler when no MessageHandler registered", async () => {
    const sendFn = vi.fn()
    registerHandler("discord", { send: sendFn })

    const msg = makeOutboundMessage({
      metadata: { discordChannelId: "ch-456" },
    })
    await dispatchMessage(msg)

    expect(sendFn).toHaveBeenCalledWith(
      { channel: "discord", to: "galatea" },
      "Hello, world!",
      { discordChannelId: "ch-456" },
    )
  })

  // New handler takes precedence over legacy
  it("prefers ChannelMessageHandler over legacy handler", async () => {
    const legacySend = vi.fn()
    const newSend = vi.fn()
    registerHandler("discord", { send: legacySend })
    registerMessageHandler("discord", { send: newSend })

    const msg = makeOutboundMessage()
    await dispatchMessage(msg)

    expect(legacySend).not.toHaveBeenCalled()
    expect(newSend).toHaveBeenCalledWith(msg)
  })

  it("clearHandlers clears both registries", async () => {
    registerHandler("discord", { send: vi.fn() })
    registerMessageHandler("dashboard", { send: vi.fn() })

    clearHandlers()

    await expect(
      dispatchMessage(makeOutboundMessage({ channel: "discord" })),
    ).rejects.toThrow()
    await expect(
      dispatchMessage(makeOutboundMessage({ channel: "dashboard" })),
    ).rejects.toThrow()
  })
})
