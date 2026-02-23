// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { Message } from "../compressor"
import { SlidingWindowCompressor } from "../sliding-window"

const compressor = new SlidingWindowCompressor()

function msg(role: "user" | "assistant", content: string): Message {
  return { role, content }
}

describe("SlidingWindowCompressor", () => {
  it("keeps all messages when under budget", async () => {
    const messages = [msg("user", "hello"), msg("assistant", "hi")]
    const result = await compressor.compress(messages, 1000)
    expect(result.messages).toHaveLength(2)
    expect(result.dropped).toBe(0)
  })

  it("always keeps first message", async () => {
    const messages = [
      msg("user", "a".repeat(100)),
      msg("assistant", "b".repeat(100)),
      msg("user", "c".repeat(100)),
      msg("assistant", "d".repeat(100)),
      msg("user", "e".repeat(100)),
    ]
    // Budget only fits ~2 messages (100 chars / 4 = 25 tokens each)
    const result = await compressor.compress(messages, 60)
    expect(result.messages[0].content).toBe("a".repeat(100))
    expect(result.dropped).toBeGreaterThan(0)
  })

  it("keeps newest messages after first", async () => {
    const messages = [
      msg("user", "first"),
      msg("assistant", "second"),
      msg("user", "third"),
      msg("assistant", "fourth"),
      msg("user", "fifth"),
    ]
    // Enough for first + last 2
    const result = await compressor.compress(messages, 15)
    expect(result.messages[0].content).toBe("first")
    const lastContent = result.messages[result.messages.length - 1].content
    expect(lastContent).toBe("fifth")
  })

  it("returns empty for empty input", async () => {
    const result = await compressor.compress([], 1000)
    expect(result.messages).toHaveLength(0)
    expect(result.dropped).toBe(0)
  })

  it("single message always kept", async () => {
    const result = await compressor.compress([msg("user", "hello")], 1)
    expect(result.messages).toHaveLength(1)
  })
})
