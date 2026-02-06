// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock the DB module
vi.mock("../../db", () => ({
  db: {
    select: vi.fn(),
  },
}))

// Mock the graphiti-client
vi.mock("../graphiti-client", () => ({
  searchFacts: vi.fn(),
}))

import { db } from "../../db"
import { searchFacts } from "../graphiti-client"
import { assembleContext } from "../context-assembler"
import type { ContextBudget, FactResult } from "../types"

// Helper to set up the chained DB query mock
function mockPreprompts(rows: Array<{
  id: string
  name: string
  type: string
  content: string
  priority: number | null
  active: boolean | null
}>) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(rows),
  }
  vi.mocked(db.select).mockReturnValue(chain as never)
}

function makeFact(overrides: Partial<FactResult> & { fact: string }): FactResult {
  return {
    uuid: `fact-${Math.random().toString(36).slice(2, 8)}`,
    name: "RELATES_TO",
    valid_at: null,
    invalid_at: null,
    created_at: new Date().toISOString(),
    expired_at: null,
    ...overrides,
  }
}

describe("context-assembler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("assembleContext", () => {
    it("returns preprompts-only when Graphiti returns no facts", async () => {
      mockPreprompts([
        {
          id: "1",
          name: "core-identity",
          type: "core",
          content: "You are Galatea.",
          priority: 5,
          active: true,
        },
      ])
      vi.mocked(searchFacts).mockResolvedValue([])

      const ctx = await assembleContext("session-1", "Hello")

      expect(ctx.systemPrompt).toContain("You are Galatea.")
      expect(ctx.sections).toHaveLength(1)
      expect(ctx.sections[0].name).toBe("CONSTRAINTS")
      expect(ctx.metadata.retrievalStats.hardRulesCount).toBe(1)
      expect(ctx.metadata.retrievalStats.factsRetrieved).toBe(0)
    })

    it("separates hard rules (priority <= 10) from procedures (priority > 10)", async () => {
      mockPreprompts([
        {
          id: "1",
          name: "rule",
          type: "hard_rule",
          content: "Never share secrets.",
          priority: 1,
          active: true,
        },
        {
          id: "2",
          name: "procedure",
          type: "domain",
          content: "Greet the user warmly.",
          priority: 20,
          active: true,
        },
      ])
      vi.mocked(searchFacts).mockResolvedValue([])

      const ctx = await assembleContext("session-1", "Hello")

      expect(ctx.sections).toHaveLength(2)
      expect(ctx.sections[0].name).toBe("CONSTRAINTS")
      expect(ctx.sections[0].content).toBe("Never share secrets.")
      expect(ctx.sections[1].name).toBe("RELEVANT PROCEDURES")
      expect(ctx.sections[1].content).toBe("Greet the user warmly.")
      expect(ctx.metadata.retrievalStats.hardRulesCount).toBe(1)
      expect(ctx.metadata.retrievalStats.proceduresMatched).toBe(1)
    })

    it("includes facts from Graphiti in RELEVANT KNOWLEDGE section", async () => {
      mockPreprompts([])
      vi.mocked(searchFacts).mockResolvedValue([
        makeFact({ fact: "User prefers dark mode" }),
        makeFact({ fact: "User uses Vim keybindings" }),
      ])

      const ctx = await assembleContext("session-1", "What do I prefer?")

      expect(ctx.sections).toHaveLength(1)
      expect(ctx.sections[0].name).toBe("RELEVANT KNOWLEDGE")
      expect(ctx.sections[0].content).toContain("User prefers dark mode")
      expect(ctx.sections[0].content).toContain("User uses Vim keybindings")
      expect(ctx.metadata.retrievalStats.factsRetrieved).toBe(2)
    })

    it("assembles all 3 sections when preprompts + facts exist", async () => {
      mockPreprompts([
        {
          id: "1",
          name: "rule",
          type: "hard_rule",
          content: "Be helpful.",
          priority: 5,
          active: true,
        },
        {
          id: "2",
          name: "procedure",
          type: "domain",
          content: "Respond formally.",
          priority: 50,
          active: true,
        },
      ])
      vi.mocked(searchFacts).mockResolvedValue([
        makeFact({ fact: "User likes tea" }),
      ])

      const ctx = await assembleContext("session-1", "What do I drink?")

      expect(ctx.sections).toHaveLength(3)
      // Sections are sorted by priority: CONSTRAINTS(1) < PROCEDURES(2) < KNOWLEDGE(3)
      expect(ctx.sections[0].name).toBe("CONSTRAINTS")
      expect(ctx.sections[1].name).toBe("RELEVANT PROCEDURES")
      expect(ctx.sections[2].name).toBe("RELEVANT KNOWLEDGE")

      // System prompt contains all sections with headers
      expect(ctx.systemPrompt).toContain("## CONSTRAINTS")
      expect(ctx.systemPrompt).toContain("## RELEVANT PROCEDURES")
      expect(ctx.systemPrompt).toContain("## RELEVANT KNOWLEDGE")
    })

    it("passes sessionId and 'global' as group_ids to searchFacts", async () => {
      mockPreprompts([])
      vi.mocked(searchFacts).mockResolvedValue([])

      await assembleContext("my-session-42", "query")

      expect(searchFacts).toHaveBeenCalledWith(
        "query",
        ["my-session-42", "global"],
        20,
      )
    })

    it("handles null priority values as 0 (hard rule)", async () => {
      mockPreprompts([
        {
          id: "1",
          name: "no-priority",
          type: "core",
          content: "Priority is null.",
          priority: null,
          active: true,
        },
      ])
      vi.mocked(searchFacts).mockResolvedValue([])

      const ctx = await assembleContext("session-1", "Hello")

      // null priority → 0 → treated as hard rule (≤ 10)
      expect(ctx.sections).toHaveLength(1)
      expect(ctx.sections[0].name).toBe("CONSTRAINTS")
    })

    it("trims facts to fit within token budget", async () => {
      mockPreprompts([])
      // Each fact is ~6 tokens ("- <fact>\n" ≈ 24 chars / 4)
      // Create facts that exceed a tiny budget
      const manyFacts = Array.from({ length: 50 }, (_, i) =>
        makeFact({ fact: `Fact number ${i} with some extra padding text here` }),
      )
      vi.mocked(searchFacts).mockResolvedValue(manyFacts)

      // Use a very small facts budget (100 tokens ≈ 400 chars)
      const tinyBudget: ContextBudget = {
        total: 200,
        hardRules: 50,
        procedures: 50,
        facts: 100,
        models: 0,
        episodes: 0,
      }

      const ctx = await assembleContext("session-1", "query", tinyBudget)

      // Should include fewer than all 50 facts
      expect(ctx.metadata.retrievalStats.factsRetrieved).toBeGreaterThan(0)
      expect(ctx.metadata.retrievalStats.factsRetrieved).toBeLessThan(50)
    })

    it("returns empty sections when no preprompts and no facts", async () => {
      mockPreprompts([])
      vi.mocked(searchFacts).mockResolvedValue([])

      const ctx = await assembleContext("session-1", "Hello")

      expect(ctx.sections).toHaveLength(0)
      expect(ctx.systemPrompt).toBe("")
      expect(ctx.metadata.totalTokens).toBe(0)
      expect(ctx.metadata.retrievalStats.factsRetrieved).toBe(0)
    })

    it("tracks assembly time in metadata", async () => {
      mockPreprompts([])
      vi.mocked(searchFacts).mockResolvedValue([])

      const ctx = await assembleContext("session-1", "Hello")

      expect(ctx.metadata.assemblyTimeMs).toBeGreaterThanOrEqual(0)
    })

    it("gracefully handles Graphiti search failure", async () => {
      mockPreprompts([
        {
          id: "1",
          name: "rule",
          type: "hard_rule",
          content: "Be safe.",
          priority: 5,
          active: true,
        },
      ])
      // searchFacts returns empty array on failure (graceful degradation in client)
      vi.mocked(searchFacts).mockResolvedValue([])

      const ctx = await assembleContext("session-1", "Hello")

      // Should still have preprompts
      expect(ctx.sections).toHaveLength(1)
      expect(ctx.sections[0].name).toBe("CONSTRAINTS")
      expect(ctx.metadata.retrievalStats.factsRetrieved).toBe(0)
    })

    it("combines multiple hard rules into single CONSTRAINTS section", async () => {
      mockPreprompts([
        {
          id: "1",
          name: "rule-1",
          type: "hard_rule",
          content: "Rule one.",
          priority: 1,
          active: true,
        },
        {
          id: "2",
          name: "rule-2",
          type: "hard_rule",
          content: "Rule two.",
          priority: 5,
          active: true,
        },
      ])
      vi.mocked(searchFacts).mockResolvedValue([])

      const ctx = await assembleContext("session-1", "Hello")

      expect(ctx.sections).toHaveLength(1)
      expect(ctx.sections[0].name).toBe("CONSTRAINTS")
      expect(ctx.sections[0].content).toBe("Rule one.\n\nRule two.")
    })

    it("marks CONSTRAINTS as non-truncatable and others as truncatable", async () => {
      mockPreprompts([
        {
          id: "1",
          name: "rule",
          type: "hard_rule",
          content: "Critical rule.",
          priority: 1,
          active: true,
        },
        {
          id: "2",
          name: "proc",
          type: "domain",
          content: "A procedure.",
          priority: 20,
          active: true,
        },
      ])
      vi.mocked(searchFacts).mockResolvedValue([
        makeFact({ fact: "A fact" }),
      ])

      const ctx = await assembleContext("session-1", "query")

      const constraints = ctx.sections.find((s) => s.name === "CONSTRAINTS")
      const procedures = ctx.sections.find(
        (s) => s.name === "RELEVANT PROCEDURES",
      )
      const knowledge = ctx.sections.find(
        (s) => s.name === "RELEVANT KNOWLEDGE",
      )

      expect(constraints?.truncatable).toBe(false)
      expect(procedures?.truncatable).toBe(true)
      expect(knowledge?.truncatable).toBe(true)
    })

    it("scores more recent facts higher", async () => {
      mockPreprompts([])
      const now = new Date()
      const oldDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) // 90 days ago
      vi.mocked(searchFacts).mockResolvedValue([
        makeFact({ fact: "Old fact", created_at: oldDate.toISOString() }),
        makeFact({ fact: "Recent fact", created_at: now.toISOString() }),
      ])

      const ctx = await assembleContext("session-1", "query")

      // Both should be included, recent fact should come first
      // (both have graphitiScore=1.0, but recent has higher recency)
      const lines = ctx.sections[0].content.split("\n")
      expect(lines[0]).toContain("Recent fact")
      expect(lines[1]).toContain("Old fact")
    })
  })
})
