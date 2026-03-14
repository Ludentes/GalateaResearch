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

let msgCounter = 0
function makeTaskMessage(content?: string): ChannelMessage {
  msgCounter++
  return {
    id: `msg-task-${msgCounter}`,
    channel: "discord",
    direction: "inbound",
    routing: {},
    from: "pm-user",
    content: content ?? "Create user profile screen with edit functionality",
    messageType: "task_assignment",
    receivedAt: new Date().toISOString(),
    metadata: { workspace: "/tmp/test-workspace" },
  }
}

beforeEach(() => {
  msgCounter = 0
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

  it("resumes session on second task_assignment when task is in-progress", async () => {
    const receivedResume: (string | undefined)[] = []
    const mockQuery = vi.fn().mockImplementation(async function* (opts: Record<string, unknown>) {
      receivedResume.push(opts.resume as string | undefined)
      yield {
        type: "result",
        subtype: "success",
        text: "in progress",
        durationMs: 100,
        costUsd: 0.01,
        numTurns: 1,
        transcript: [],
        sessionId: "session-abc-123",
      }
    })
    setAdapter({
      name: "test-adapter",
      isAvailable: vi.fn().mockResolvedValue(true),
      query: mockQuery,
    })

    // First tick — creates new task, no resume
    await updateAgentState(
      {
        pendingMessages: [makeTaskMessage("implement feature A")],
        lastActivity: new Date().toISOString(),
      },
      STATE_PATH,
    )
    const result1 = await tick("webhook", {
      statePath: STATE_PATH,
      storePath: STORE_PATH,
      opContextPath: OP_PATH,
    })
    // First tick completes the task (status "completed" → task.status = "done")
    // so the session is cleared. We need the task to stay in_progress.
    // Let's use a "timeout" subtype so task stays in_progress with sessionId preserved.
    expect(result1.action).toBe("delegate")

    // Reset mock to return timeout (keeps task in_progress)
    mockQuery.mockImplementation(async function* (opts: Record<string, unknown>) {
      receivedResume.push(opts.resume as string | undefined)
      yield {
        type: "result",
        subtype: "error_max_turns",
        text: "Max turns exceeded",
        durationMs: 100,
        costUsd: 0.01,
        numTurns: 5,
        transcript: [],
        sessionId: "session-abc-123",
      }
    })

    // Re-run first tick with timeout result so task stays in_progress
    receivedResume.length = 0
    await updateAgentState(
      {
        pendingMessages: [makeTaskMessage("implement feature A")],
        lastActivity: new Date().toISOString(),
      },
      STATE_PATH,
    )
    await tick("webhook", {
      statePath: STATE_PATH,
      storePath: STORE_PATH,
      opContextPath: OP_PATH,
    })

    // Second tick — should find in_progress task and resume session
    await updateAgentState(
      {
        pendingMessages: [makeTaskMessage("also add tests for feature A")],
        lastActivity: new Date().toISOString(),
      },
      STATE_PATH,
    )
    await tick("webhook", {
      statePath: STATE_PATH,
      storePath: STORE_PATH,
      opContextPath: OP_PATH,
    })

    expect(receivedResume).toHaveLength(2)
    expect(receivedResume[0]).toBeUndefined()         // first call: no resume
    expect(receivedResume[1]).toBe("session-abc-123")  // second call: resumes
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
