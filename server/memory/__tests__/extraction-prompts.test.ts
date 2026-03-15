// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  buildConsolidationPrompt,
  getExtractionPrompt,
} from "../extraction-prompts"

describe("getExtractionPrompt", () => {
  it("returns default prompt when optimized=false", () => {
    const prompt = getExtractionPrompt(false)
    expect(prompt).toContain("knowledge extraction system")
    expect(prompt).not.toContain("precise knowledge extraction")
  })

  it("returns optimized prompt when optimized=true", () => {
    const prompt = getExtractionPrompt(true)
    expect(prompt).toContain("precise knowledge extraction")
    expect(prompt).toContain("≤10 items per chunk")
  })
})

describe("buildConsolidationPrompt", () => {
  it("includes existing entries in prompt", () => {
    const prompt = buildConsolidationPrompt(
      ["Use PostgreSQL", "Prefers pnpm"],
      20,
    )
    expect(prompt).toContain("EXISTING KNOWLEDGE")
    expect(prompt).toContain("Use PostgreSQL")
    expect(prompt).toContain("Prefers pnpm")
  })

  it("includes max entries limit", () => {
    const prompt = buildConsolidationPrompt([], 10)
    expect(prompt).toContain("10")
  })
})
