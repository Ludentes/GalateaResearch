// @vitest-environment node
import type { LanguageModel } from "ai"
import { describe, expect, it, vi } from "vitest"
import type { TranscriptTurn } from "../types"

// Mock AI SDK's generateObject
vi.mock("ai", () => ({
  generateObject: vi.fn().mockResolvedValue({
    object: {
      items: [
        {
          type: "preference",
          content: "User prefers pnpm over npm",
          confidence: 0.95,
          evidence: "User said: I prefer using pnpm",
          entities: ["pnpm", "npm"],
        },
        {
          type: "fact",
          content: "Project uses TypeScript strict mode",
          confidence: 0.85,
          evidence: "User requested strict mode setup",
          entities: ["TypeScript"],
        },
      ],
    },
  }),
}))

import { extractKnowledge } from "../knowledge-extractor"

describe("Knowledge Extractor", () => {
  const turns: TranscriptTurn[] = [
    { role: "user", content: "I prefer using pnpm for package management" },
    { role: "assistant", content: "I'll use pnpm going forward." },
    { role: "user", content: "Let's set up TypeScript strict mode" },
    { role: "assistant", content: "Setting up TypeScript strict mode." },
  ]

  it("returns KnowledgeEntry array", async () => {
    const entries = await extractKnowledge(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
    )
    expect(entries).toHaveLength(2)
    expect(entries[0].type).toBe("preference")
    expect(entries[1].type).toBe("fact")
  })

  it("assigns id, source, and extractedAt", async () => {
    const entries = await extractKnowledge(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
    )
    expect(entries[0].id).toBeDefined()
    expect(entries[0].source).toBe("session:test")
    expect(entries[0].extractedAt).toBeDefined()
  })

  it("preserves confidence and entities from LLM", async () => {
    const entries = await extractKnowledge(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
    )
    expect(entries[0].confidence).toBe(0.95)
    expect(entries[0].entities).toContain("pnpm")
  })

  it("includes evidence", async () => {
    const entries = await extractKnowledge(
      turns,
      {} as unknown as LanguageModel,
      "session:test",
    )
    expect(entries[0].evidence).toContain("pnpm")
  })
})
