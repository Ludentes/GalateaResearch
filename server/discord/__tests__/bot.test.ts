// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { handleInboundMessage } from "../handlers"

// Mock addPendingMessage
vi.mock("../../agent/agent-state", () => ({
  addPendingMessage: vi.fn(),
}))

describe("Discord Handlers", () => {
  it("converts Discord message to PendingMessage", async () => {
    const { addPendingMessage } = await import("../../agent/agent-state")

    await handleInboundMessage({
      authorUsername: "testuser",
      content: "Hello agent!",
      channelId: "123",
      messageId: "456",
      guildId: "789",
    })

    expect(addPendingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "testuser",
        channel: "discord",
        content: "Hello agent!",
        metadata: {
          discordChannelId: "123",
          discordMessageId: "456",
          discordGuildId: "789",
        },
      }),
    )
  })

  it("omits guildId from metadata when not provided", async () => {
    const { addPendingMessage } = await import("../../agent/agent-state")
    vi.mocked(addPendingMessage).mockClear()

    await handleInboundMessage({
      authorUsername: "dmuser",
      content: "DM message",
      channelId: "999",
      messageId: "888",
    })

    expect(addPendingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "dmuser",
        channel: "discord",
        content: "DM message",
        metadata: {
          discordChannelId: "999",
          discordMessageId: "888",
        },
      }),
    )
  })
})
