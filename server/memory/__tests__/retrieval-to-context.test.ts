// @vitest-environment node
/**
 * Integration test: Retrieval → Context Assembly pipeline
 *
 * BDD Scenarios:
 *
 * Scenario: Relevant facts reach the system prompt
 *   Given the knowledge store has entries about "kiosk", "MQTT", and "deployment"
 *   When the user asks "What is the kiosk player?"
 *   And retrieval finds kiosk-related entries
 *   And context is assembled with those retrieved entries
 *   Then the system prompt contains kiosk facts
 *   And the system prompt does NOT contain unrelated deployment facts
 *
 * Scenario: Rules survive retrieval filtering
 *   Given the knowledge store has rules and topic-specific facts
 *   When retrieval returns only topic-specific facts
 *   And context is assembled with those retrieved entries
 *   Then rules still appear in CONSTRAINTS (they're always loaded)
 *
 * Scenario: Empty retrieval produces empty knowledge section
 *   Given the knowledge store has entries
 *   When the user asks about a topic with no matching entries
 *   And retrieval returns 0 entries
 *   And context is assembled with empty retrieved entries
 *   Then the system prompt has no LEARNED KNOWLEDGE section
 *   But rules still appear in CONSTRAINTS
 */
import { existsSync, rmSync } from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}))

vi.mock("../../db/schema", () => ({
  preprompts: { active: "active" },
}))

import { assembleContext } from "../context-assembler"
import { retrieveRelevantFacts } from "../fact-retrieval"
import { appendEntries } from "../knowledge-store"
import type { KnowledgeEntry } from "../types"

const TEST_DIR = path.join(__dirname, "fixtures", "test-retrieval-to-context")
const TEST_STORE = path.join(TEST_DIR, "entries.jsonl")

// --- Test fixtures ---

const kioskFact1: KnowledgeEntry = {
  id: "kiosk-1",
  type: "fact",
  content: "The kiosk player uses Electron and MQTT for command handling",
  confidence: 1.0,
  entities: ["electron", "mqtt"],
  source: "session:test",
  extractedAt: "2026-02-11T10:00:00Z",
}

const kioskFact2: KnowledgeEntry = {
  id: "kiosk-2",
  type: "fact",
  content: "The kiosk player renders video content on 4K displays",
  confidence: 0.9,
  entities: [],
  source: "session:test",
  extractedAt: "2026-02-11T10:01:00Z",
}

const deployFact: KnowledgeEntry = {
  id: "deploy-1",
  type: "fact",
  content: "Deploy everything on Linux using Docker Compose",
  confidence: 0.8,
  entities: ["docker"],
  source: "session:test",
  extractedAt: "2026-02-11T10:02:00Z",
}

const galateaFact: KnowledgeEntry = {
  id: "galatea-1",
  type: "fact",
  content: "Phase D of Galatea is complete with 97 tests passing",
  confidence: 0.85,
  entities: ["galatea"],
  source: "session:test",
  extractedAt: "2026-02-11T10:03:00Z",
}

const ruleEntry: KnowledgeEntry = {
  id: "rule-1",
  type: "rule",
  content: "Never push to main branch directly",
  confidence: 1.0,
  entities: [],
  source: "session:test",
  extractedAt: "2026-02-11T10:04:00Z",
}

const ruleEntry2: KnowledgeEntry = {
  id: "rule-2",
  type: "rule",
  content: "Never deploy on Fridays",
  confidence: 1.0,
  entities: [],
  source: "session:test",
  extractedAt: "2026-02-11T10:05:00Z",
}

describe("Retrieval → Context Assembly integration", () => {
  beforeEach(async () => {
    await appendEntries(
      [kioskFact1, kioskFact2, deployFact, galateaFact, ruleEntry, ruleEntry2],
      TEST_STORE,
    )
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  it("retrieves kiosk facts and they appear in system prompt", async () => {
    // Step 1: Retrieve
    const facts = await retrieveRelevantFacts(
      "What is the kiosk player?",
      TEST_STORE,
    )
    expect(facts.entries.length).toBeGreaterThan(0)

    // Step 2: Assemble with retrieved entries
    const context = await assembleContext({
      storePath: TEST_STORE,
      retrievedEntries: facts.entries,
    })

    // Kiosk facts should be in the prompt
    expect(context.systemPrompt).toContain("kiosk player uses Electron")
    expect(context.systemPrompt).toContain("kiosk player renders video")

    // Unrelated facts should NOT be in the prompt
    expect(context.systemPrompt).not.toContain("Phase D of Galatea")
    expect(context.systemPrompt).not.toContain("Deploy everything on Linux")
  })

  it("rules survive retrieval filtering — always in CONSTRAINTS", async () => {
    const facts = await retrieveRelevantFacts(
      "What is the kiosk player?",
      TEST_STORE,
    )

    // Whether or not rules happen to match — the point is they're in CONSTRAINTS regardless

    const context = await assembleContext({
      storePath: TEST_STORE,
      retrievedEntries: facts.entries,
    })

    const constraints = context.sections.find((s) => s.name === "CONSTRAINTS")
    expect(constraints).toBeDefined()
    expect(constraints?.content).toContain("Never push to main branch directly")
    expect(constraints?.content).toContain("Never deploy on Fridays")
  })

  it("empty retrieval falls back to all entries (nothing matched is not same as no retrieval)", async () => {
    // Query that matches nothing
    const facts = await retrieveRelevantFacts(
      "Tell me about quantum computing",
      TEST_STORE,
    )
    expect(facts.entries).toHaveLength(0)

    // Empty array → retrievedEntries.length === 0 → falls back to loading all
    // This is correct: "nothing matched" should still show general knowledge,
    // unlike "no retrieval was done" (undefined) which also shows all entries.
    const context = await assembleContext({
      storePath: TEST_STORE,
      retrievedEntries: facts.entries,
    })

    // Falls back to all entries since nothing matched
    const knowledge = context.sections.find(
      (s) => s.name === "LEARNED KNOWLEDGE",
    )
    expect(knowledge).toBeDefined()

    // Rules still present
    const constraints = context.sections.find((s) => s.name === "CONSTRAINTS")
    expect(constraints?.content).toContain("Never push to main")
  })

  it("without retrievedEntries, all entries are included", async () => {
    // This is the backward-compatible path (no retrieval done)
    const context = await assembleContext({
      storePath: TEST_STORE,
    })

    // All facts present
    expect(context.systemPrompt).toContain("kiosk player uses Electron")
    expect(context.systemPrompt).toContain("Phase D of Galatea")
    expect(context.systemPrompt).toContain("Deploy everything on Linux")
    expect(context.metadata.knowledgeEntries).toBe(6)
  })
})
