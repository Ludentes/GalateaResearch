// @vitest-environment node
import { describe, expect, it } from "vitest"
import { splitMessage } from "../message-split"

describe("splitMessage", () => {
  it("returns single-element array for short messages", () => {
    expect(splitMessage("hello")).toEqual(["hello"])
  })

  it("returns empty array for empty string", () => {
    expect(splitMessage("")).toEqual([])
  })

  it("splits on paragraph breaks when message exceeds limit", () => {
    const para1 = "A".repeat(800)
    const para2 = "B".repeat(800)
    const text = `${para1}\n\n${para2}`
    const chunks = splitMessage(text, 1000)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toBe(para1)
    expect(chunks[1]).toBe(para2)
  })

  it("splits on line breaks when paragraph chunks are too large", () => {
    const line1 = "A".repeat(500)
    const line2 = "B".repeat(500)
    const line3 = "C".repeat(500)
    const text = `${line1}\n${line2}\n${line3}`
    const chunks = splitMessage(text, 600)
    expect(chunks).toHaveLength(3)
  })

  it("hard-cuts when no natural break points exist", () => {
    const text = "A".repeat(3000)
    const chunks = splitMessage(text, 1000)
    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toHaveLength(1000)
    expect(chunks[1]).toHaveLength(1000)
    expect(chunks[2]).toHaveLength(1000)
  })

  it("uses 1900 as default max length", () => {
    const text = "A".repeat(3800)
    const chunks = splitMessage(text)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(1900)
  })

  it("trims whitespace from chunks", () => {
    const text = "Hello\n\n  \n\nWorld"
    const chunks = splitMessage(text, 10)
    expect(chunks).toEqual(["Hello", "World"])
  })
})
