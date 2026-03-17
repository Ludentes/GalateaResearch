// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DiscordManager } from "../manager"

// Mock createAgentBot
vi.mock("../bot", () => ({
  createAgentBot: vi.fn().mockResolvedValue({
    agentId: "beki",
    client: { user: { tag: "beki#1234" } },
    stop: vi.fn(),
  }),
  sendViaBot: vi.fn().mockResolvedValue(true),
}))

// Mock dispatcher
vi.mock("../../agent/dispatcher", () => ({
  registerHandler: vi.fn(),
}))

// Mock channel-log
vi.mock("../../agent/channel-log", () => ({
  appendToOutboundLog: vi.fn(),
}))

describe("DiscordManager", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("starts bots for agents with configured tokens", async () => {
    const { createAgentBot } = await import("../bot")
    const manager = new DiscordManager()
    await manager.startAgent("beki", "fake-token", {
      ops_channel_id: "",
    })

    expect(createAgentBot).toHaveBeenCalledWith("beki", "fake-token")
    expect(manager.getBot("beki")).toBeDefined()
  })

  it("stops all bots on shutdown", async () => {
    const manager = new DiscordManager()
    await manager.startAgent("beki", "fake-token", {
      ops_channel_id: "",
    })

    const bot = manager.getBot("beki")!
    await manager.stopAll()
    expect(bot.stop).toHaveBeenCalled()
  })

  it("returns undefined for unknown agent", () => {
    const manager = new DiscordManager()
    expect(manager.getBot("nobody")).toBeUndefined()
  })
})
