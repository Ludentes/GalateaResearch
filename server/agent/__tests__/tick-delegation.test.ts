// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import path from "node:path"

// Mock the agent loop
vi.mock("../agent-loop", () => ({
  runAgentLoop: vi.fn().mockResolvedValue({
    text: "I'll handle that task.",
    steps: [{ type: "text", text: "I'll handle that task.", durationMs: 10 }],
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

const mockAddTask = vi.fn().mockImplementation((_ctx, description, _source) => ({
  id: `task-mock-${Date.now()}`,
  description,
  source: _source,
  status: "assigned",
  phase: "exploring",
  progress: [],
  artifacts: [],
  phaseStartedAt: new Date().toISOString(),
  toolCallCount: 0,
}))

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
  addTask: (...args: unknown[]) => mockAddTask(...args),
}))

// Mock the DB-dependent assembleContext
vi.mock("../../memory/context-assembler", () => ({
  assembleContext: vi.fn().mockResolvedValue({
    systemPrompt: "You are Galatea.",
    sections: [],
    metadata: {
      prepromptsLoaded: 1,
      knowledgeEntries: 0,
      rulesCount: 0,
      homeostasisGuidanceIncluded: false,
    },
  }),
}))

import { tick, setAdapter } from "../tick"
import type { ChannelMessage } from "../types"
import { updateAgentState } from "../agent-state"

const TEST_DIR = "data/test-tick-delegate"
const STATE_PATH = path.join(TEST_DIR, "state.json")
const STORE_PATH = path.join(TEST_DIR, "entries.jsonl")
const OP_PATH = path.join(TEST_DIR, "op-context.json")

function makeTaskMessage(): ChannelMessage {
  return {
    id: "msg-task-1",
    channel: "discord",
    direction: "inbound",
    routing: {},
    from: "pm-user",
    content: "Create user profile screen with edit functionality",
    messageType: "task_assignment",
    receivedAt: new Date().toISOString(),
    metadata: { workspace: "/tmp/test-workspace" },
  }
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true })
  writeFileSync(STORE_PATH, "")
})

afterEach(() => {
  setAdapter(undefined)
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
})

describe("tick with task delegation", () => {
  it("delegates task_assignment to adapter when adapter available", async () => {
    const mockQuery = vi.fn().mockImplementation(async function* () {
      yield {
        type: "result",
        subtype: "success",
        text: "Task completed",
        durationMs: 1000,
        costUsd: 0.01,
        numTurns: 2,
        transcript: [],
      }
    })
    setAdapter({
      name: "test-adapter",
      isAvailable: vi.fn().mockResolvedValue(true),
      query: mockQuery,
    })

    await updateAgentState(
      {
        pendingMessages: [makeTaskMessage()],
        lastActivity: new Date().toISOString(),
      },
      STATE_PATH,
    )

    const result = await tick("manual", {
      statePath: STATE_PATH,
      storePath: STORE_PATH,
      opContextPath: OP_PATH,
    })

    expect(result.action).toBe("delegate")
    expect(result.delegation).toBeDefined()
    expect(result.delegation?.status).toBe("completed")
  })

  it("falls back to respond when no adapter set", async () => {
    await updateAgentState(
      {
        pendingMessages: [makeTaskMessage()],
        lastActivity: new Date().toISOString(),
      },
      STATE_PATH,
    )

    const result = await tick("manual", {
      statePath: STATE_PATH,
      storePath: STORE_PATH,
      opContextPath: OP_PATH,
    })

    // Without adapter, should respond or use template (depending on LLM availability)
    expect(["respond", "idle"]).toContain(result.action)
  })
})
