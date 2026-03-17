// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { clearHandlers, dispatchMessage } from "../../agent/dispatcher"
import type { ChannelMessage } from "../../agent/types"
import { DiscordManager } from "../manager"

// Mock bot creation to avoid real Discord connections
vi.mock("../bot", () => {
  const sentMessages: Array<{ channelId: string; content: string }> = []
  return {
    createAgentBot: vi.fn().mockImplementation((agentId: string) => ({
      agentId,
      client: {
        user: { tag: `${agentId}#1234` },
        channels: {
          fetch: vi.fn().mockResolvedValue(null),
        },
      },
      stop: vi.fn(),
    })),
    sendViaBot: vi
      .fn()
      .mockImplementation(
        async (_bot: unknown, channelId: string, content: string) => {
          sentMessages.push({ channelId, content })
          return true
        },
      ),
    _sentMessages: sentMessages,
  }
})

describe("Discord integration", () => {
  beforeEach(() => {
    clearHandlers()
    vi.clearAllMocks()
  })

  it("routes outbound message to correct agent bot", async () => {
    const manager = new DiscordManager()
    await manager.startAgent("beki", "fake-token", { ops_channel_id: "" })
    manager.registerOutboundHandler()

    const { sendViaBot } = await import("../bot")

    const message: ChannelMessage = {
      id: "test-1",
      channel: "discord",
      direction: "outbound",
      routing: {},
      from: "beki",
      content: "Task completed",
      messageType: "status_update",
      receivedAt: new Date().toISOString(),
      metadata: { discordChannelId: "ch-123" },
    }

    await dispatchMessage(message)
    expect(sendViaBot).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "beki" }),
      "ch-123",
      "Task completed",
      undefined,
    )
  })

  it("logs warning when no bot exists for agent", async () => {
    const manager = new DiscordManager()
    await manager.startAgent("beki", "fake-token", { ops_channel_id: "" })
    manager.registerOutboundHandler()

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const message: ChannelMessage = {
      id: "test-2",
      channel: "discord",
      direction: "outbound",
      routing: {},
      from: "besa",
      content: "Status update",
      messageType: "status_update",
      receivedAt: new Date().toISOString(),
      metadata: { discordChannelId: "ch-456" },
    }

    await dispatchMessage(message)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No bot for agent "besa"'),
    )
    warnSpy.mockRestore()
  })

  it("posts failure alert to ops channel", async () => {
    const manager = new DiscordManager()
    await manager.startAgent("beki", "fake-token", {
      ops_channel_id: "ops-channel-id",
    })
    manager.registerOutboundHandler()

    const { sendViaBot } = await import("../bot")

    const message: ChannelMessage = {
      id: "test-3",
      channel: "discord",
      direction: "outbound",
      routing: {},
      from: "beki",
      content: "Task failed: could not install dependencies",
      messageType: "status_update",
      receivedAt: new Date().toISOString(),
      metadata: { discordChannelId: "ch-123" },
    }

    await dispatchMessage(message)

    // Called twice: once for the reply, once for ops alert
    expect(sendViaBot).toHaveBeenCalledTimes(2)
    expect(sendViaBot).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "beki" }),
      "ops-channel-id",
      expect.stringContaining("Delegation failed"),
    )
  })
})
