// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock the graphiti-client
vi.mock("../graphiti-client", () => ({
  searchFacts: vi.fn(),
  ingestMessages: vi.fn(),
}))

import {
  getSelfModel,
  getUserModel,
  updateSelfModel,
  updateUserModel,
} from "../cognitive-models"
import { ingestMessages, searchFacts } from "../graphiti-client"
import type { FactResult } from "../types"

function makeFact(fact: string, createdAt?: string): FactResult {
  return {
    uuid: `fact-${Math.random().toString(36).slice(2, 8)}`,
    name: "RELATES_TO",
    fact,
    valid_at: null,
    invalid_at: null,
    created_at: createdAt ?? new Date().toISOString(),
    expired_at: null,
  }
}

describe("cognitive-models", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("getSelfModel", () => {
    it("returns empty model when no facts found", async () => {
      vi.mocked(searchFacts).mockResolvedValue([])

      const model = await getSelfModel("galatea")

      expect(model.strengths).toEqual([])
      expect(model.weaknesses).toEqual([])
      expect(model.recentMisses).toEqual([])
      expect(searchFacts).toHaveBeenCalledWith(
        "self:galatea strengths weaknesses recent misses",
        ["global"],
        30,
      )
    })

    it("classifies strength facts", async () => {
      vi.mocked(searchFacts).mockResolvedValue([
        makeFact("Strength: Strong at React component design"),
        makeFact("Good at TypeScript type inference"),
      ])

      const model = await getSelfModel("galatea")

      expect(model.strengths).toHaveLength(2)
      expect(model.strengths[0]).toContain("React component design")
    })

    it("classifies weakness facts", async () => {
      vi.mocked(searchFacts).mockResolvedValue([
        makeFact("Weakness: Struggles with complex SQL joins"),
        makeFact("Weakness in handling async race conditions"),
      ])

      const model = await getSelfModel("galatea")

      expect(model.weaknesses).toHaveLength(2)
      expect(model.weaknesses[0]).toContain("SQL joins")
    })

    it("classifies recent miss facts", async () => {
      vi.mocked(searchFacts).mockResolvedValue([
        makeFact("Forgot to add loading state in last PR"),
        makeFact("Missed null check on user input"),
      ])

      const model = await getSelfModel("galatea")

      expect(model.recentMisses).toHaveLength(2)
    })

    it("classifies mixed facts into correct buckets", async () => {
      vi.mocked(searchFacts).mockResolvedValue([
        makeFact("Strong at CSS flexbox layout"),
        makeFact("Weakness: struggles with GraphQL schemas"),
        makeFact("Forgot error boundary in modal component"),
        makeFact("Good at writing tests"),
      ])

      const model = await getSelfModel("galatea")

      expect(model.strengths).toHaveLength(2)
      expect(model.weaknesses).toHaveLength(1)
      expect(model.recentMisses).toHaveLength(1)
    })
  })

  describe("getUserModel", () => {
    it("returns empty model when no facts found", async () => {
      vi.mocked(searchFacts).mockResolvedValue([])

      const model = await getUserModel("alice")

      expect(model.preferences).toEqual([])
      expect(model.expectations).toEqual([])
      expect(model.communicationStyle).toBeNull()
      expect(searchFacts).toHaveBeenCalledWith(
        "user:alice preferences expectations communication style",
        ["global"],
        30,
      )
    })

    it("extracts communication style", async () => {
      vi.mocked(searchFacts).mockResolvedValue([
        makeFact("Communication style: concise and direct"),
      ])

      const model = await getUserModel("alice")

      expect(model.communicationStyle).toContain("concise and direct")
    })

    it("extracts expectations", async () => {
      vi.mocked(searchFacts).mockResolvedValue([
        makeFact("Expects tests for every new feature"),
        makeFact("Requires PR reviews before merge"),
        makeFact("User wants detailed commit messages"),
      ])

      const model = await getUserModel("alice")

      expect(model.expectations).toHaveLength(3)
    })

    it("defaults unclassified facts to preferences", async () => {
      vi.mocked(searchFacts).mockResolvedValue([
        makeFact("Prefers dark mode"),
        makeFact("Uses Vim keybindings"),
        makeFact("Likes Catppuccin Mocha theme"),
      ])

      const model = await getUserModel("alice")

      expect(model.preferences).toHaveLength(3)
    })

    it("classifies mixed facts correctly", async () => {
      vi.mocked(searchFacts).mockResolvedValue([
        makeFact("Prefers TypeScript strict mode"),
        makeFact("Expects comprehensive error handling"),
        makeFact("Communicates in a technical, precise manner"),
      ])

      const model = await getUserModel("alice")

      expect(model.preferences).toHaveLength(1)
      expect(model.expectations).toHaveLength(1)
      expect(model.communicationStyle).toContain("technical")
    })
  })

  describe("updateSelfModel", () => {
    it("ingests a strength observation", async () => {
      vi.mocked(ingestMessages).mockResolvedValue(true)

      const result = await updateSelfModel(
        "galatea",
        "strength",
        "Good at React component patterns",
      )

      expect(result).toBe(true)
      expect(ingestMessages).toHaveBeenCalledWith("global", [
        expect.objectContaining({
          content: expect.stringContaining(
            "strength: Good at React component patterns",
          ),
          role_type: "system",
          source_description: "cognitive-model:self:galatea",
        }),
      ])
    })

    it("ingests a weakness observation", async () => {
      vi.mocked(ingestMessages).mockResolvedValue(true)

      await updateSelfModel("galatea", "weakness", "Struggles with complex SQL")

      const msg = vi.mocked(ingestMessages).mock.calls[0][1][0]
      expect(msg.content).toContain("weakness")
      expect(msg.content).toContain("Struggles with complex SQL")
    })

    it("ingests a recent miss observation", async () => {
      vi.mocked(ingestMessages).mockResolvedValue(true)

      await updateSelfModel("galatea", "recent_miss", "Forgot loading state")

      const msg = vi.mocked(ingestMessages).mock.calls[0][1][0]
      expect(msg.content).toContain("recent miss")
    })

    it("returns false on ingestion failure", async () => {
      vi.mocked(ingestMessages).mockResolvedValue(false)

      const result = await updateSelfModel("galatea", "strength", "anything")

      expect(result).toBe(false)
    })
  })

  describe("updateUserModel", () => {
    it("ingests a preference observation", async () => {
      vi.mocked(ingestMessages).mockResolvedValue(true)

      const result = await updateUserModel(
        "alice",
        "preference",
        "Prefers dark mode",
      )

      expect(result).toBe(true)
      expect(ingestMessages).toHaveBeenCalledWith("global", [
        expect.objectContaining({
          content: expect.stringContaining("preference: Prefers dark mode"),
          source_description: "cognitive-model:user:alice",
        }),
      ])
    })

    it("ingests an expectation observation", async () => {
      vi.mocked(ingestMessages).mockResolvedValue(true)

      await updateUserModel(
        "alice",
        "expectation",
        "Expects tests for all features",
      )

      const msg = vi.mocked(ingestMessages).mock.calls[0][1][0]
      expect(msg.content).toContain("expectation")
    })

    it("ingests a communication style observation", async () => {
      vi.mocked(ingestMessages).mockResolvedValue(true)

      await updateUserModel(
        "alice",
        "communication_style",
        "Concise and technical",
      )

      const msg = vi.mocked(ingestMessages).mock.calls[0][1][0]
      expect(msg.content).toContain("communication style")
    })
  })
})
