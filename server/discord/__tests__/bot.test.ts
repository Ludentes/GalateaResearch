// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { handleInboundMessage } from "../handlers"

// Mock addMessage
vi.mock("../../agent/agent-state", () => ({
  addMessage: vi.fn(),
}))

describe("Discord Handlers", () => {
  it("converts Discord message to ChannelMessage and queues it", async () => {
    const { addMessage } = await import("../../agent/agent-state")

    await handleInboundMessage({
      authorUsername: "testuser",
      content: "Hello agent!",
      channelId: "123",
      messageId: "456",
      guildId: "789",
    })

    expect(addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "discord",
        direction: "inbound",
        from: "testuser",
        content: "Hello agent!",
        metadata: expect.objectContaining({
          discordChannelId: "123",
          discordMessageId: "456",
          discordGuildId: "789",
          targetAgent: "galatea",
        }),
      }),
      undefined,
    )
  })

  it("omits guildId from metadata when not provided", async () => {
    const { addMessage } = await import("../../agent/agent-state")
    vi.mocked(addMessage).mockClear()

    await handleInboundMessage({
      authorUsername: "dmuser",
      content: "DM message",
      channelId: "999",
      messageId: "888",
    })

    const call = vi.mocked(addMessage).mock.calls[0][0]
    expect(call.metadata.discordGuildId).toBeUndefined()
    expect(call.metadata.discordChannelId).toBe("999")
  })
})
