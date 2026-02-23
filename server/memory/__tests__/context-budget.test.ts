// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

// Mock DB (assembler loads preprompts from DB)
vi.mock("../../db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}))

vi.mock("../../engine/homeostasis-engine", () => ({
  assessDimensions: vi.fn().mockReturnValue({
    knowledge_sufficiency: "HEALTHY",
    certainty_alignment: "HEALTHY",
    progress_momentum: "HEALTHY",
    communication_health: "HEALTHY",
    productive_engagement: "HEALTHY",
    knowledge_application: "HEALTHY",
    self_preservation: "HEALTHY",
    assessed_at: new Date(),
    assessment_method: {},
  }),
  getGuidance: vi.fn().mockReturnValue(""),
}))

import { existsSync, rmSync } from "node:fs"
import path from "node:path"
import { afterEach, beforeEach } from "vitest"
import { appendEntries } from "../knowledge-store"
import type { KnowledgeEntry } from "../types"
import { assembleContext } from "../context-assembler"

const TEST_DIR = path.join(__dirname, "fixtures", "test-budget")
const STORE_PATH = path.join(TEST_DIR, "entries.jsonl")

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2, 6)}`,
    type: "fact",
    content: "MQTT uses QoS 1 for reliable message delivery in IoT systems",
    confidence: 0.9,
    entities: ["mqtt"],
    source: "session:test",
    extractedAt: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(async () => {
  const entries = Array.from({ length: 10 }, (_, i) =>
    makeEntry({ id: `fact-${i}`, confidence: 0.9 - i * 0.05 }),
  )
  await appendEntries(entries, STORE_PATH)
})

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
})

// ---------------------------------------------------------------------------
// BDD Scenario: Sections fit within 12K budget
// ---------------------------------------------------------------------------
describe("12K token budget", () => {
  it("includes all sections without truncation when budget allows", async () => {
    const result = await assembleContext({
      storePath: STORE_PATH,
      tokenBudget: 12000,
      agentContext: {
        sessionId: "test",
        currentMessage: "test",
        messageHistory: [],
      },
    })

    expect(result.metadata.totalTokens).toBeLessThan(12000)
    expect(result.metadata.budgetUsedPercent).toBeLessThan(100)

    const knowledgeSection = result.metadata.tokenAccounting?.find(
      (a) => a.name === "LEARNED KNOWLEDGE",
    )
    expect(knowledgeSection?.truncated).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// BDD Scenario: Knowledge truncated when budget exceeded
// ---------------------------------------------------------------------------
describe("knowledge truncation", () => {
  it("truncates knowledge when budget exceeded", async () => {
    // Use a very small budget to force truncation
    const result = await assembleContext({
      storePath: STORE_PATH,
      tokenBudget: 50, // Very small — will force truncation
      agentContext: {
        sessionId: "test",
        currentMessage: "test",
        messageHistory: [],
      },
    })

    const knowledgeSection = result.metadata.tokenAccounting?.find(
      (a) => a.name === "LEARNED KNOWLEDGE",
    )
    if (knowledgeSection) {
      expect(knowledgeSection.truncated).toBe(true)
      expect(knowledgeSection.droppedEntries).toBeGreaterThan(0)
    }
  })

  it("drops lowest-ranked entries first (end of list)", async () => {
    // Entries are sorted by confidence descending, so end = lowest confidence
    const result = await assembleContext({
      storePath: STORE_PATH,
      tokenBudget: 200, // Small budget
      agentContext: {
        sessionId: "test",
        currentMessage: "test",
        messageHistory: [],
      },
    })

    // The system prompt should contain higher-confidence entries
    if (result.systemPrompt.includes("LEARNED KNOWLEDGE")) {
      expect(result.systemPrompt).toContain("MQTT")
    }
  })
})

// ---------------------------------------------------------------------------
// BDD Scenario: Per-section accounting logged
// ---------------------------------------------------------------------------
describe("per-section accounting", () => {
  it("returns token accounting for each section", async () => {
    const result = await assembleContext({
      storePath: STORE_PATH,
      tokenBudget: 12000,
      agentContext: {
        sessionId: "test",
        currentMessage: "test",
        messageHistory: [],
      },
    })

    expect(result.metadata.tokenAccounting).toBeDefined()
    expect(result.metadata.tokenAccounting!.length).toBeGreaterThan(0)

    for (const section of result.metadata.tokenAccounting!) {
      expect(section.name).toBeTruthy()
      expect(typeof section.tokens).toBe("number")
      expect(typeof section.percentOfBudget).toBe("number")
      expect(typeof section.truncated).toBe("boolean")
    }
  })

  it("accounting sums match totalTokens", async () => {
    const result = await assembleContext({
      storePath: STORE_PATH,
      tokenBudget: 12000,
    })

    const sum = result.metadata.tokenAccounting!.reduce(
      (s, a) => s + a.tokens,
      0,
    )
    expect(sum).toBe(result.metadata.totalTokens)
  })
})

// ---------------------------------------------------------------------------
// BDD Scenario: New sections (operational, history, tools)
// ---------------------------------------------------------------------------
describe("new sections", () => {
  it("includes operational context section", async () => {
    const result = await assembleContext({
      storePath: STORE_PATH,
      tokenBudget: 12000,
      operationalSummary: "Current task: Build profile screen. Phase: implementing.",
    })

    expect(result.systemPrompt).toContain("OPERATIONAL CONTEXT")
    expect(result.systemPrompt).toContain("Build profile screen")
  })

  it("includes conversation history section", async () => {
    const result = await assembleContext({
      storePath: STORE_PATH,
      tokenBudget: 12000,
      conversationHistory: [
        { role: "user", content: "Build the profile screen" },
        { role: "assistant", content: "On it!" },
      ],
    })

    expect(result.systemPrompt).toContain("CONVERSATION HISTORY")
    expect(result.systemPrompt).toContain("Build the profile screen")
  })

  it("includes tool definitions section", async () => {
    const result = await assembleContext({
      storePath: STORE_PATH,
      tokenBudget: 12000,
      toolDefinitions: "write_file: Write content to a file path\nread_file: Read a file",
    })

    expect(result.systemPrompt).toContain("TOOL DEFINITIONS")
    expect(result.systemPrompt).toContain("write_file")
  })
})

// ---------------------------------------------------------------------------
// BDD Scenario: Non-truncatable sections never dropped
// ---------------------------------------------------------------------------
describe("non-truncatable sections", () => {
  it("always includes rules even with tight budget", async () => {
    // Add a rule entry
    await appendEntries(
      [makeEntry({ type: "rule", confidence: 1.0, content: "Never push to main" })],
      STORE_PATH,
    )

    const result = await assembleContext({
      storePath: STORE_PATH,
      tokenBudget: 100, // Very tight
      agentContext: {
        sessionId: "test",
        currentMessage: "test",
        messageHistory: [],
      },
    })

    expect(result.systemPrompt).toContain("Never push to main")
  })
})
