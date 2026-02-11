// @vitest-environment node
import path from "node:path"
import { describe, expect, it } from "vitest"
import { readTranscript } from "../transcript-reader"

const FIXTURE = path.join(__dirname, "fixtures", "sample-session.jsonl")

describe("Transcript Reader", () => {
  it("parses user and assistant turns from JSONL", async () => {
    const turns = await readTranscript(FIXTURE)
    expect(turns.length).toBeGreaterThan(0)
    expect(
      turns.every((t) => t.role === "user" || t.role === "assistant"),
    ).toBe(true)
  })

  it("skips non-conversation entry types (system, progress)", async () => {
    const turns = await readTranscript(FIXTURE)
    expect(
      turns.every((t) => !t.content.includes("System prompt loaded")),
    ).toBe(true)
    expect(turns.every((t) => !t.content.includes("Processing..."))).toBe(true)
  })

  it("deduplicates streaming assistant messages (same id)", async () => {
    const turns = await readTranscript(FIXTURE)
    const editTurns = turns.filter((t) =>
      t.content.includes("TypeScript strict mode"),
    )
    expect(editTurns).toHaveLength(1)
  })

  it("skips isMeta entries", async () => {
    const turns = await readTranscript(FIXTURE)
    expect(
      turns.every((t) => !t.content.includes("[System prompt updated]")),
    ).toBe(true)
  })

  it("extracts text from string content", async () => {
    const turns = await readTranscript(FIXTURE)
    // msg8 has string content (not array)
    const stringContent = turns.find((t) => t.content.includes("root tsconfig"))
    expect(stringContent).toBeDefined()
  })

  it("extracts text from content block arrays", async () => {
    const turns = await readTranscript(FIXTURE)
    const first = turns.find((t) => t.role === "assistant")
    expect(first?.content).toBe("I'll use pnpm going forward.")
  })

  it("extracts tool_use information", async () => {
    const turns = await readTranscript(FIXTURE)
    const withTools = turns.find((t) => t.toolUse && t.toolUse.length > 0)
    expect(withTools).toBeDefined()
    expect(withTools?.toolUse?.[0].name).toBe("Edit")
  })

  it("preserves turn order", async () => {
    const turns = await readTranscript(FIXTURE)
    const userTurns = turns.filter((t) => t.role === "user")
    expect(userTurns[0].content).toContain("pnpm")
    expect(userTurns[1].content).toContain("TypeScript")
  })
})
