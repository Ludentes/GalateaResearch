// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { ContentBlock } from "../types"
import { getTextContent } from "../types"

describe("getTextContent", () => {
  it("returns string input as-is", () => {
    expect(getTextContent("hello world")).toBe("hello world")
  })

  it("extracts text from a single text block", () => {
    const blocks: ContentBlock[] = [{ type: "text", text: "hello" }]
    expect(getTextContent(blocks)).toBe("hello")
  })

  it("returns empty string for a single image block", () => {
    const blocks: ContentBlock[] = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: "iVBORw0KGgo=",
        },
      },
    ]
    expect(getTextContent(blocks)).toBe("")
  })

  it("extracts only text from mixed text+image blocks, joined by newline", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "before" },
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: "/9j/4AAQ",
        },
      },
      { type: "text", text: "after" },
    ]
    expect(getTextContent(blocks)).toBe("before\nafter")
  })

  it("returns empty string for an empty array", () => {
    expect(getTextContent([])).toBe("")
  })

  it("joins multiple text blocks with newline", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "line one" },
      { type: "text", text: "line two" },
      { type: "text", text: "line three" },
    ]
    expect(getTextContent(blocks)).toBe("line one\nline two\nline three")
  })
})
