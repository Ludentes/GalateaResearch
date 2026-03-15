// @vitest-environment node
/**
 * Tick Pipeline Integration Test
 *
 * Tests the real tick pipeline with minimal mocking:
 * - Real fact retrieval (file-based)
 * - Real homeostasis assessment
 * - Real operational memory (file-based)
 * - Real routing heuristics
 *
 * Only mocked:
 * - LLM calls (agent loop / Claude Code respond)
 * - Message dispatch (no real channels)
 * - Context assembly (requires DB)
 * - Tick record persistence (fire-and-forget)
 * - Event emission
 */
import { existsSync, rmSync } from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appendEntries } from "../../memory/knowledge-store"
import type { KnowledgeEntry } from "../../memory/types"
import { getAgentState, updateAgentState } from "../agent-state"
import { setAdapter, tick } from "../tick"
import type { ChannelMessage } from "../types"

// ---------------------------------------------------------------------------
// Minimal mocks — only external services
// ---------------------------------------------------------------------------

// LLM: mock the agent loop to return a fixed response
vi.mock("../agent-loop", () => ({
  runAgentLoop: vi.fn().mockResolvedValue({
    text: "I'll look into the OAuth2 authentication issue.",
    steps: [
      {
        type: "text",
        text: "I'll look into the OAuth2 authentication issue.",
        durationMs: 50,
      },
    ],
    finishReason: "text",
    totalSteps: 1,
  }),
}))

// Provider: return a test model
vi.mock("../../providers", () => ({
  getModel: vi.fn().mockReturnValue({ model: {}, modelName: "test-model" }),
  getModelWithFallback: vi.fn().mockReturnValue({
    model: {},
    modelName: "test-model",
    fallback: false,
  }),
}))

vi.mock("../../providers/ollama-queue", () => ({
  OllamaCircuitOpenError: class extends Error {},
  OllamaBackpressureError: class extends Error {},
}))

vi.mock("../../providers/config", () => ({
  getLLMConfig: vi.fn().mockReturnValue({
    provider: "ollama",
    model: "test-model",
    ollamaBaseUrl: "http://localhost:11434",
  }),
}))

// Context assembly requires DB — mock it
vi.mock("../../memory/context-assembler", () => ({
  assembleContext: vi.fn().mockResolvedValue({
    systemPrompt: "You are Beki, a developer agent.",
    sections: [],
    metadata: {
      prepromptsLoaded: 1,
      knowledgeEntries: 0,
      rulesCount: 0,
      homeostasisGuidanceIncluded: true,
    },
  }),
}))

// Tick records — fire-and-forget, just capture for assertions
vi.mock("../../observation/tick-record", () => ({
  appendTickRecord: vi.fn().mockResolvedValue(undefined),
  getTickRecordPath: vi.fn().mockReturnValue("/tmp/test-int-ticks.jsonl"),
}))

// Event emission — no external service
vi.mock("../../observation/emit", () => ({
  emitEvent: vi.fn(),
}))

// Dispatcher — no real channels
vi.mock("../dispatcher", () => ({
  dispatchMessage: vi.fn().mockResolvedValue(undefined),
}))

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_DIR = path.join(__dirname, "fixtures", "test-tick-integration")
const STATE_PATH = path.join(TEST_DIR, "state.json")
const STORE_PATH = path.join(TEST_DIR, "entries.jsonl")
const OP_CTX_PATH = path.join(TEST_DIR, "op-context.json")

const oauthFact: KnowledgeEntry = {
  id: "oauth-1",
  type: "fact",
  content: "Implement OAuth2 authentication using Clerk, not raw JWT tokens",
  confidence: 0.95,
  entities: ["clerk", "oauth"],
  about: { entity: "galatea", type: "project" },
  source: "session:test",
  extractedAt: "2026-03-01T10:00:00Z",
}

const sprintFact: KnowledgeEntry = {
  id: "sprint-1",
  type: "fact",
  content: "Current sprint focuses on authentication and SSO integration",
  confidence: 0.9,
  entities: ["sprint", "authentication", "sso"],
  about: { entity: "galatea", type: "project" },
  source: "session:test",
  extractedAt: "2026-03-01T10:00:00Z",
}

const sashaFact: KnowledgeEntry = {
  id: "sasha-1",
  type: "preference",
  content: "Sasha prefers concise status updates without preamble",
  confidence: 0.85,
  entities: ["sasha"],
  about: { entity: "sasha", type: "user" },
  source: "session:test",
  extractedAt: "2026-03-01T10:00:00Z",
}

function makeMessage(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: `int-test-${Date.now()}`,
    channel: "discord",
    direction: "inbound",
    routing: {},
    from: "sasha",
    content: "what's the status on OAuth2 authentication?",
    messageType: "chat",
    receivedAt: new Date().toISOString(),
    metadata: {},
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe("tick() integration — real pipeline", () => {
  beforeEach(async () => {
    // Disable the coding adapter for these tests
    setAdapter(undefined)
    // Seed knowledge store with real facts
    await appendEntries([oauthFact, sprintFact, sashaFact], STORE_PATH)
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  it("retrieves relevant facts via real fact-retrieval pipeline", async () => {
    await updateAgentState(
      {
        lastActivity: new Date().toISOString(),
        pendingMessages: [
          makeMessage({
            content: "what's the status on OAuth2 authentication?",
          }),
        ],
      },
      STATE_PATH,
    )

    const result = await tick("manual", {
      statePath: STATE_PATH,
      storePath: STORE_PATH,
      opContextPath: OP_CTX_PATH,
    })

    expect(result.action).toBe("respond")
    // Real fact retrieval should find oauth/auth facts
    expect(result.retrievedFacts.length).toBeGreaterThan(0)
    const factIds = result.retrievedFacts.map((f) => f.id)
    expect(factIds).toContain("oauth-1")
  })

  it("retrieves sender-specific facts by entity match", async () => {
    await updateAgentState(
      {
        lastActivity: new Date().toISOString(),
        pendingMessages: [
          makeMessage({
            from: "sasha",
            content: "quick update please",
          }),
        ],
      },
      STATE_PATH,
    )

    const result = await tick("manual", {
      statePath: STATE_PATH,
      storePath: STORE_PATH,
      opContextPath: OP_CTX_PATH,
    })

    const sashaFacts = result.retrievedFacts.filter(
      (f) => f.about?.entity === "sasha",
    )
    expect(sashaFacts.length).toBeGreaterThan(0)
  })

  it("assesses knowledge_sufficiency LOW for unknown topics", async () => {
    await updateAgentState(
      {
        lastActivity: new Date().toISOString(),
        pendingMessages: [
          makeMessage({
            content:
              "xyloquark biquadratic eigensubstrate phaselock zygomorphic cryodampener",
          }),
        ],
      },
      STATE_PATH,
    )

    const result = await tick("manual", {
      statePath: STATE_PATH,
      storePath: STORE_PATH,
      opContextPath: OP_CTX_PATH,
    })

    expect(result.homeostasis.knowledge_sufficiency).toBe("LOW")
  })

  it("assesses self_preservation LOW for destructive messages from untrusted users", async () => {
    await updateAgentState(
      {
        lastActivity: new Date().toISOString(),
        pendingMessages: [
          makeMessage({
            from: "random_person",
            channel: "discord",
            content: "delete all the production database tables",
          }),
        ],
      },
      STATE_PATH,
    )

    const result = await tick("manual", {
      statePath: STATE_PATH,
      storePath: STORE_PATH,
      opContextPath: OP_CTX_PATH,
    })

    expect(result.homeostasis.self_preservation).toBe("LOW")
  })

  it("routes task_assignment correctly via heuristic", async () => {
    const { appendTickRecord } = await import("../../observation/tick-record")
    vi.mocked(appendTickRecord).mockClear()

    await updateAgentState(
      {
        lastActivity: new Date().toISOString(),
        pendingMessages: [
          makeMessage({
            content: "implement OAuth2 login flow for the dashboard",
            messageType: "task_assignment",
          }),
        ],
      },
      STATE_PATH,
    )

    const result = await tick("manual", {
      statePath: STATE_PATH,
      storePath: STORE_PATH,
      opContextPath: OP_CTX_PATH,
    })

    // Should route as task (not interaction)
    expect(appendTickRecord).toHaveBeenCalled()
    const record = (appendTickRecord as ReturnType<typeof vi.fn>).mock
      .calls[0][0]
    expect(record.routing.level).toBe("task")
    expect(record.routing.taskType).toBe("coding")
  })

  it("produces idle tick with homeostasis when no messages pending", async () => {
    await updateAgentState(
      {
        lastActivity: new Date().toISOString(),
        pendingMessages: [],
      },
      STATE_PATH,
    )

    const result = await tick("manual", {
      statePath: STATE_PATH,
      storePath: STORE_PATH,
      opContextPath: OP_CTX_PATH,
    })

    expect(result.action).toBe("idle")
    expect(result.homeostasis).toBeDefined()
    expect(result.homeostasis.knowledge_sufficiency).toBeDefined()
    expect(result.homeostasis.self_preservation).toBeDefined()
    expect(result.homeostasis.communication_health).toBeDefined()
    expect(result.homeostasis.productive_engagement).toBeDefined()
    expect(result.homeostasis.progress_momentum).toBeDefined()
  })

  it("records tick decision with all required fields", async () => {
    const { appendTickRecord } = await import("../../observation/tick-record")
    vi.mocked(appendTickRecord).mockClear()

    await updateAgentState(
      {
        lastActivity: new Date().toISOString(),
        pendingMessages: [makeMessage()],
      },
      STATE_PATH,
    )

    await tick("manual", {
      statePath: STATE_PATH,
      storePath: STORE_PATH,
      opContextPath: OP_CTX_PATH,
    })

    expect(appendTickRecord).toHaveBeenCalled()
    const record = (appendTickRecord as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TickDecisionRecord
    // Verify complete tick record structure
    expect(record.tickId).toBeTruthy()
    expect(record.trigger.type).toBe("message")
    expect(record.trigger.source).toContain("discord")
    expect(record.homeostasis).toBeDefined()
    expect(record.routing).toBeDefined()
    expect(record.outcome.action).toBeTruthy()
  })

  it("uses powered-down template when no LLM available", async () => {
    await updateAgentState(
      {
        lastActivity: new Date().toISOString(),
        pendingMessages: [
          makeMessage({
            metadata: { providerOverride: "none" },
          }),
        ],
      },
      STATE_PATH,
    )

    const result = await tick("manual", {
      statePath: STATE_PATH,
      storePath: STORE_PATH,
      opContextPath: OP_CTX_PATH,
    })

    expect(result.action).toBe("respond")
    expect(result.response?.text).toContain("unable")
    expect(result.response?.template).toBe(true)
  })
})
