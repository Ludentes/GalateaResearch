// @vitest-environment node
import { describe, expect, it } from "vitest"
import { buildChannelMessage, validateInjectBody } from "../inject.post"

describe("inject endpoint helpers", () => {
  describe("validateInjectBody", () => {
    it("returns null for valid body", () => {
      const result = validateInjectBody({
        agentId: "agent-1",
        content: "hello",
        from: "user-1",
        channel: "discord",
      })
      expect(result).toBeNull()
    })

    it("returns error when agentId is missing", () => {
      const result = validateInjectBody({
        content: "hello",
        from: "user-1",
        channel: "discord",
      })
      expect(result).toBe("Missing required field: agentId")
    })

    it("returns error when content is missing", () => {
      const result = validateInjectBody({
        agentId: "agent-1",
        from: "user-1",
        channel: "discord",
      })
      expect(result).toBe("Missing required field: content")
    })

    it("returns error when from is missing", () => {
      const result = validateInjectBody({
        agentId: "agent-1",
        content: "hello",
        channel: "discord",
      })
      expect(result).toBe("Missing required field: from")
    })

    it("returns error when channel is missing", () => {
      const result = validateInjectBody({
        agentId: "agent-1",
        content: "hello",
        from: "user-1",
      })
      expect(result).toBe("Missing required field: channel")
    })

    it("returns error for invalid messageType", () => {
      const result = validateInjectBody({
        agentId: "agent-1",
        content: "hello",
        from: "user-1",
        channel: "discord",
        messageType: "review_comment",
      })
      expect(result).toBe(
        "Invalid messageType: review_comment. Must be one of: chat, task_assignment, status_update, greeting",
      )
    })

    it("accepts valid messageType values", () => {
      for (const messageType of [
        "chat",
        "task_assignment",
        "status_update",
        "greeting",
      ]) {
        const result = validateInjectBody({
          agentId: "agent-1",
          content: "hello",
          from: "user-1",
          channel: "discord",
          messageType,
        })
        expect(result).toBeNull()
      }
    })

    it("allows omitted messageType (defaults to chat)", () => {
      const result = validateInjectBody({
        agentId: "agent-1",
        content: "hello",
        from: "user-1",
        channel: "discord",
      })
      expect(result).toBeNull()
    })
  })

  describe("buildChannelMessage", () => {
    it("constructs message with correct defaults", () => {
      const msg = buildChannelMessage({
        agentId: "agent-1",
        content: "hello world",
        from: "user-1",
        channel: "discord",
      })

      expect(msg.channel).toBe("discord")
      expect(msg.direction).toBe("inbound")
      expect(msg.routing).toEqual({})
      expect(msg.from).toBe("user-1")
      expect(msg.content).toBe("hello world")
      expect(msg.messageType).toBe("chat")
      expect(msg.metadata).toEqual({})
      expect(msg.id).toMatch(/^inject-\d+-[a-z0-9]+$/)
      expect(msg.receivedAt).toBeTruthy()
    })

    it("uses provided messageType", () => {
      const msg = buildChannelMessage({
        agentId: "agent-1",
        content: "assign task",
        from: "pm-1",
        channel: "gitlab",
        messageType: "task_assignment",
      })

      expect(msg.messageType).toBe("task_assignment")
    })

    it("defaults messageType to chat when not provided", () => {
      const msg = buildChannelMessage({
        agentId: "agent-1",
        content: "hello",
        from: "user-1",
        channel: "dashboard",
      })

      expect(msg.messageType).toBe("chat")
    })
  })
})
