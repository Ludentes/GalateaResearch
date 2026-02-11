// @vitest-environment node

import path from "node:path"
import { describe, expect, it } from "vitest"
import { classifyTurn, filterSignalTurns } from "../signal-classifier"
import { readTranscript } from "../transcript-reader"

const FIXTURE = path.join(__dirname, "fixtures", "sample-session.jsonl")

describe("Extraction Quality", () => {
  describe("transcript reader fidelity", () => {
    it("preserves all user messages from fixture", async () => {
      const turns = await readTranscript(FIXTURE)
      const userContent = turns
        .filter((t) => t.role === "user")
        .map((t) => t.content)

      expect(userContent).toContain(
        "I prefer using pnpm for package management",
      )
      expect(userContent).toContain(
        "Let's set up the TypeScript project with strict checks enabled",
      )
      expect(userContent).toContain("hi")
      expect(userContent).toContain(
        "No, that's wrong \u2014 use the other tsconfig",
      )
    })

    it("does not include meta or system messages", async () => {
      const turns = await readTranscript(FIXTURE)
      const all = turns.map((t) => t.content).join(" ")

      expect(all).not.toContain("System prompt")
      expect(all).not.toContain("Processing")
    })
  })

  describe("signal classifier accuracy", () => {
    it("correctly identifies signal vs noise in fixture", async () => {
      const turns = await readTranscript(FIXTURE)
      const userTurns = turns.filter((t) => t.role === "user")

      const classifications = userTurns.map((t) => ({
        content: t.content.slice(0, 40),
        type: classifyTurn(t).type,
      }))

      // "I prefer using pnpm" -> preference (signal)
      expect(
        classifications.find((c) => c.content.includes("pnpm"))?.type,
      ).toBe("preference")

      // "hi" -> noise
      expect(classifications.find((c) => c.content === "hi")?.type).toBe(
        "noise",
      )

      // "No, that's wrong" -> correction (signal)
      expect(
        classifications.find((c) => c.content.includes("wrong"))?.type,
      ).toBe("correction")
    })

    it("filters out noise, keeps signal", async () => {
      const turns = await readTranscript(FIXTURE)
      const signal = filterSignalTurns(turns)

      expect(signal.length).toBeLessThan(turns.length)
      expect(signal.every((t) => t.role === "user")).toBe(true)
      expect(signal.some((t) => t.content.includes("pnpm"))).toBe(true)
      expect(signal.every((t) => t.content !== "hi")).toBe(true)
    })
  })
})
