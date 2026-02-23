// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import path from "node:path"
import { tick, setAdapter } from "../tick"
import type { ChannelMessage } from "../types"
import { updateAgentState } from "../agent-state"

// Mock modules that tick depends on but we don't want to call
vi.mock("../../memory/context-assembler", () => ({
  assembleContext: vi.fn().mockResolvedValue({
    systemPrompt: "You are Galatea",
    sections: [],
    metadata: { prepromptsLoaded: 0, knowledgeEntries: 0, rulesCount: 0, homeostasisGuidanceIncluded: false },
  }),
}))

vi.mock("../../providers", () => ({
  getModelWithFallback: vi.fn().mockReturnValue({ model: "test-model" }),
}))

vi.mock("../agent-loop", () => ({
  runAgentLoop: vi.fn().mockResolvedValue({
    text: "I'll help with that.",
    totalSteps: 1,
    finishReason: "text",
    steps: [],
  }),
}))

vi.mock("../dispatcher", () => ({
  dispatchMessage: vi.fn().mockResolvedValue(undefined),
}))

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

    // Without adapter, should respond normally via agent loop
    expect(result.action).toBe("respond")
  })
})
