// @vitest-environment node
import { describe, expect, it } from "vitest"
import { pickNextMessage } from "../tick"
import type { ChannelMessage } from "../types"

function makeMsg(
  messageType: ChannelMessage["messageType"],
  content = "test",
): ChannelMessage {
  return {
    id: `msg-${Math.random()}`,
    channel: "discord",
    direction: "inbound",
    routing: {},
    from: "kirill",
    content,
    messageType,
    receivedAt: new Date().toISOString(),
    metadata: {},
  }
}

describe("pickNextMessage", () => {
  it("picks chat before task_assignment", () => {
    const task = makeMsg("task_assignment", "implement X")
    const chat = makeMsg("chat", "quick question")
    expect(pickNextMessage([task, chat])).toBe(chat)
  })

  it("picks greeting before task_assignment", () => {
    const task = makeMsg("task_assignment", "implement X")
    const greeting = makeMsg("greeting", "hello")
    expect(pickNextMessage([task, greeting])).toBe(greeting)
  })

  it("picks task_assignment before status_update", () => {
    const status = makeMsg("status_update", "done")
    const task = makeMsg("task_assignment", "implement X")
    expect(pickNextMessage([status, task])).toBe(task)
  })

  it("preserves FIFO within same priority", () => {
    const first = makeMsg("chat", "first")
    const second = makeMsg("chat", "second")
    expect(pickNextMessage([first, second])).toBe(first)
  })

  it("returns the only message when queue has one item", () => {
    const msg = makeMsg("chat", "only one")
    expect(pickNextMessage([msg])).toBe(msg)
  })
})
