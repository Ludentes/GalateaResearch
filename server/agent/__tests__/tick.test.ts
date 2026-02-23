// @vitest-environment node
import { existsSync, rmSync } from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appendEntries } from "../../memory/knowledge-store"
import type { KnowledgeEntry } from "../../memory/types"
import type { ChannelMessage } from "../types"
import {
  getAgentState,
  updateAgentState,
} from "../agent-state"
import { tick } from "../tick"

// Mock the agent loop — tick now delegates to runAgentLoop
vi.mock("../agent-loop", () => ({
  runAgentLoop: vi.fn().mockResolvedValue({
    text: "Here's a status update on the project.",
    steps: [{ type: "text", text: "Here's a status update on the project.", durationMs: 10 }],
    finishReason: "text",
    totalSteps: 1,
  }),
}))

vi.mock("../../providers", () => ({
  getModel: vi.fn().mockReturnValue({
    model: {},
    modelName: "test-model",
  }),
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

// Mock operational memory
vi.mock("../operational-memory", () => ({
  loadOperationalContext: vi.fn().mockResolvedValue({
    tasks: [],
    workPhase: "idle",
    nextActions: [],
    blockers: [],
    carryover: [],
    recentHistory: [],
    phaseEnteredAt: new Date().toISOString(),
    lastOutboundAt: "",
    lastUpdated: new Date().toISOString(),
  }),
  saveOperationalContext: vi.fn().mockResolvedValue(undefined),
  pushHistoryEntry: vi.fn(),
  recordOutbound: vi.fn(),
}))

// Mock the DB-dependent assembleContext
vi.mock("../../memory/context-assembler", () => ({
  assembleContext: vi.fn().mockResolvedValue({
    systemPrompt: "You are Galatea. Active task: MQTT persistence",
    sections: [],
    metadata: {
      prepromptsLoaded: 1,
      knowledgeEntries: 5,
      rulesCount: 0,
      homeostasisGuidanceIncluded: true,
    },
  }),
}))

const TEST_DIR = path.join(__dirname, "fixtures", "test-tick")
const STATE_PATH = path.join(TEST_DIR, "state.json")
const STORE_PATH = path.join(TEST_DIR, "entries.jsonl")

const alinaEntry: KnowledgeEntry = {
  id: "alina-1",
  type: "preference",
  content: "Alina prefers status updates in Russian",
  confidence: 0.95,
  entities: ["alina"],
  about: { entity: "alina", type: "user" },
  source: "session:test",
  extractedAt: "2026-02-11T11:00:00Z",
}

const projectEntry: KnowledgeEntry = {
  id: "mqtt-1",
  type: "fact",
  content: "MQTT client uses QoS 1 for reliability",
  confidence: 0.9,
  entities: ["mqtt", "umka"],
  about: { entity: "umka", type: "project" },
  source: "session:test",
  extractedAt: "2026-02-11T10:00:00Z",
}

function makeMessage(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: `test-${Date.now()}`,
    channel: "discord",
    direction: "inbound",
    routing: {},
    from: "alina",
    content: "Как дела? Что с проектом?",
    messageType: "chat",
    receivedAt: new Date().toISOString(),
    metadata: {},
    ...overrides,
  }
}

describe("tick()", () => {
  beforeEach(async () => {
    await appendEntries([alinaEntry, projectEntry], STORE_PATH)
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  it("returns idle when no pending messages", async () => {
    await updateAgentState(
      {
        lastActivity: new Date().toISOString(),
        pendingMessages: [],
        activeTask: { project: "umka", topic: "MQTT" },
      },
      STATE_PATH,
    )

    const result = await tick("manual", {
      statePath: STATE_PATH,
      storePath: STORE_PATH,
    })

    expect(result.action).toBe("idle")
    expect(result.pendingMessages).toHaveLength(0)
  })

  it("responds to pending message", async () => {
    await updateAgentState(
      {
        lastActivity: new Date().toISOString(),
        pendingMessages: [
          makeMessage({
            receivedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
          }),
        ],
      },
      STATE_PATH,
    )

    const result = await tick("manual", {
      statePath: STATE_PATH,
      storePath: STORE_PATH,
    })

    expect(result.action).toBe("respond")
    expect(result.action_target).toEqual({
      channel: "discord",
      to: "alina",
    })
    expect(result.response?.text).toBeTruthy()
  })

  it("retrieves user model entries for message sender", async () => {
    await updateAgentState(
      {
        lastActivity: new Date().toISOString(),
        pendingMessages: [makeMessage({ content: "Как дела?" })],
      },
      STATE_PATH,
    )

    const result = await tick("manual", {
      statePath: STATE_PATH,
      storePath: STORE_PATH,
    })

    const alinaFacts = result.retrievedFacts.filter(
      (f) => f.about?.entity === "alina",
    )
    expect(alinaFacts.length).toBeGreaterThan(0)
  })

  it("removes pending message after responding", async () => {
    await updateAgentState(
      {
        lastActivity: new Date().toISOString(),
        pendingMessages: [makeMessage({ content: "Status?" })],
      },
      STATE_PATH,
    )

    await tick("manual", { statePath: STATE_PATH, storePath: STORE_PATH })
    const state = await getAgentState(STATE_PATH)
    expect(state.pendingMessages).toHaveLength(0)
  })

  it("includes homeostasis assessment in result", async () => {
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
    })

    expect(result.homeostasis).toBeDefined()
    expect(result.homeostasis.knowledge_sufficiency).toBeDefined()
    expect(result.homeostasis.communication_health).toBeDefined()
  })

  it("includes self-model with available providers", async () => {
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
    })

    expect(result.selfModel).toBeDefined()
    expect(Array.isArray(result.selfModel.availableProviders)).toBe(true)
  })
})
