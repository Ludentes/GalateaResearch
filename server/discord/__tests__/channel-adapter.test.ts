// @vitest-environment node
import { describe, expect, it } from "vitest"
import { normalizeDiscordMessage } from "../adapter"

// ---------------------------------------------------------------------------
// Feature: Discord message becomes ChannelMessage
// ---------------------------------------------------------------------------

describe("Discord channel adapter", () => {
  // Scenario: Discord message becomes ChannelMessage
  it("normalizes a Discord message to ChannelMessage", () => {
    const cm = normalizeDiscordMessage({
      authorUsername: "mary",
      content: "@galatea implement user profile",
      channelId: "ch-mobile-dev",
      messageId: "msg-789",
      guildId: "guild-1",
    })

    expect(cm.channel).toBe("discord")
    expect(cm.direction).toBe("inbound")
    expect(cm.from).toBe("mary")
    expect(cm.content).toBe("@galatea implement user profile")
    expect(cm.receivedAt).toBeTruthy()
    expect(cm.metadata.discordChannelId).toBe("ch-mobile-dev")
    expect(cm.metadata.discordMessageId).toBe("msg-789")
    expect(cm.metadata.discordGuildId).toBe("guild-1")
  })

  // Scenario: routing.mentionedAgents contains "galatea" for task assignment
  it("parses @galatea mention into routing.mentionedAgents", () => {
    const cm = normalizeDiscordMessage({
      authorUsername: "mary",
      content: "@galatea implement user profile",
      channelId: "ch-1",
      messageId: "msg-1",
    })

    expect(cm.routing.mentionedAgents).toContain("galatea")
  })

  // Scenario: task_assignment messageType for @galatea mentions
  it("classifies @mention messages as task_assignment", () => {
    const cm = normalizeDiscordMessage({
      authorUsername: "mary",
      content: "@galatea implement user profile",
      channelId: "ch-1",
      messageId: "msg-1",
    })

    expect(cm.messageType).toBe("task_assignment")
  })

  // Scenario: plain chat without mention
  it("classifies non-mention messages as chat", () => {
    const cm = normalizeDiscordMessage({
      authorUsername: "mary",
      content: "What do you think about NativeWind?",
      channelId: "ch-1",
      messageId: "msg-1",
    })

    expect(cm.messageType).toBe("chat")
  })

  // Scenario: thread routing
  it("includes threadId when provided", () => {
    const cm = normalizeDiscordMessage({
      authorUsername: "mary",
      content: "test",
      channelId: "ch-1",
      messageId: "msg-1",
      threadId: "thread-sprint-42",
    })

    expect(cm.routing.threadId).toBe("thread-sprint-42")
  })

  // Scenario: DM (no guildId)
  it("omits discordGuildId for DMs", () => {
    const cm = normalizeDiscordMessage({
      authorUsername: "mary",
      content: "Hello",
      channelId: "ch-dm",
      messageId: "msg-1",
    })

    expect(cm.metadata.discordGuildId).toBeUndefined()
  })
})
