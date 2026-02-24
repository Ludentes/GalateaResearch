// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { KnowledgeEntry, KnowledgeNovelty, KnowledgeOrigin } from "../types"

describe("KnowledgeEntry novelty and origin types", () => {
  it("accepts novelty field with valid values", () => {
    const entry: KnowledgeEntry = {
      id: "test-1",
      type: "preference",
      content: "Uses pnpm",
      confidence: 0.9,
      entities: ["pnpm"],
      source: "session:abc",
      extractedAt: new Date().toISOString(),
      novelty: "project-specific",
      origin: "explicit-statement",
      curationStatus: "pending",
      sessionsExposed: 0,
      sessionsHelpful: 0,
      sessionsHarmful: 0,
    }
    expect(entry.novelty).toBe("project-specific")
    expect(entry.origin).toBe("explicit-statement")
  })

  it("accepts all curation statuses", () => {
    const statuses: Array<KnowledgeEntry["curationStatus"]> = [
      "pending", "approved", "rejected",
    ]
    expect(statuses).toHaveLength(3)
  })

  it("accepts outcome tracking fields", () => {
    const entry: KnowledgeEntry = {
      id: "test-2",
      type: "rule",
      content: "Never push to main",
      confidence: 1.0,
      entities: [],
      source: "session:def",
      extractedAt: new Date().toISOString(),
      novelty: "project-specific",
      origin: "observed-failure",
      curationStatus: "approved",
      curatedBy: "auto-approved",
      curatedAt: new Date().toISOString(),
      sessionsExposed: 5,
      sessionsHelpful: 4,
      sessionsHarmful: 0,
      impactScore: 0.8,
      enforcedBy: "hook",
      targetChannel: "hook",
    }
    expect(entry.impactScore).toBe(0.8)
    expect(entry.enforcedBy).toBe("hook")
  })
})
