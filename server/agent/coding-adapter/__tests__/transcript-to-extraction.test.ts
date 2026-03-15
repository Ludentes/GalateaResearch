// @vitest-environment node
import { describe, expect, it } from "vitest"
import { transcriptToTurns } from "../transcript-to-extraction"
import type { CodingTranscriptEntry } from "../types"

describe("transcriptToTurns", () => {
  it("converts assistant entries to assistant turns", () => {
    const transcript: CodingTranscriptEntry[] = [
      {
        role: "assistant",
        content: "I'll create the file with NativeWind styling",
        timestamp: "2026-02-23T10:00:00Z",
      },
      {
        role: "tool_call",
        content: '{"file_path":"src/profile.tsx"}',
        toolName: "Write",
        timestamp: "2026-02-23T10:00:01Z",
      },
      {
        role: "tool_result",
        content: "File written",
        toolName: "Write",
        timestamp: "2026-02-23T10:00:02Z",
      },
      {
        role: "assistant",
        content: "Now I'll run the tests",
        timestamp: "2026-02-23T10:00:03Z",
      },
    ]

    const turns = transcriptToTurns(transcript)
    expect(turns.length).toBeGreaterThan(0)
    const assistantTurns = turns.filter((t) => t.role === "assistant")
    expect(assistantTurns.length).toBe(2)
  })

  it("preserves tool call context for extraction", () => {
    const transcript: CodingTranscriptEntry[] = [
      {
        role: "assistant",
        content: "Using pnpm as the package manager",
        timestamp: "2026-02-23T10:00:00Z",
      },
      {
        role: "tool_call",
        content: '{"command":"pnpm test"}',
        toolName: "Bash",
        timestamp: "2026-02-23T10:00:01Z",
      },
      {
        role: "tool_result",
        content: "All tests pass",
        toolName: "Bash",
        timestamp: "2026-02-23T10:00:05Z",
      },
    ]

    const turns = transcriptToTurns(transcript)
    expect(turns.some((t) => t.content.includes("pnpm"))).toBe(true)
  })

  it("handles empty transcript", () => {
    const turns = transcriptToTurns([])
    expect(turns).toEqual([])
  })
})
