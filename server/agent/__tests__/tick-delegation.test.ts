// @vitest-environment node

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { updateAgentState } from "../agent-state"
import { setAdapter, tick } from "../tick"
import type { ChannelMessage } from "../types"

// Mock modules that tick depends on but we don't want to call
vi.mock("../../memory/context-assembler", () => ({
  assembleContext: vi.fn().mockResolvedValue({
    systemPrompt: "You are Galatea",
    sections: [],
    metadata: {
      prepromptsLoaded: 0,
      knowledgeEntries: 0,
      rulesCount: 0,
      homeostasisGuidanceIncluded: false,
    },
  }),
}))

vi.mock("../../providers", () => ({
  getModelWithFallback: vi
    .fn()
    .mockReturnValue({ model: "test-model", modelName: "test-model" }),
}))

vi.mock("../../engine/homeostasis-engine", async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import("../../engine/homeostasis-engine")
  return {
    ...actual,
    // Skip L2 async assessment — use synchronous L1 only
    assessDimensionsAsync: vi.fn().mockImplementation((ctx) => {
      return Promise.resolve(actual.assessDimensions(ctx))
    }),
  }
})

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

  it("resumes session on second task_assignment via opCtx.lastClaudeSessionId", async () => {
    const receivedResume: (string | undefined)[] = []
    const mockQuery = vi.fn().mockImplementation(async function* (
      opts: Record<string, unknown>,
    ) {
      receivedResume.push(opts.resume as string | undefined)
      yield {
        type: "result",
        subtype: "success",
        text: "Done",
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

    // First tick — completes task, stores sessionId on opCtx
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

    // Second tick — new task, but resumes session from opCtx.lastClaudeSessionId
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

    // First DO call has no resume; second DO call resumes session.
    // VERIFY/FINISH stages may add extra adapter calls in between,
    // so we check first and last rather than exact count.
    expect(receivedResume.length).toBeGreaterThanOrEqual(2)
    expect(receivedResume[0]).toBeUndefined() // first DO call: no resume
    // Find the last call that has the session resume — that's the second DO call
    const lastResumeIdx = receivedResume.findIndex(
      (r, i) => i > 0 && r === "session-abc-123",
    )
    expect(lastResumeIdx).toBeGreaterThan(0) // second DO call: resumes via opCtx
  })

  it("includes guidance when self_preservation is LOW", async () => {
    await updateAgentState(
      {
        pendingMessages: [
          {
            id: "msg-guidance",
            channel: "discord",
            direction: "inbound",
            routing: {},
            from: "unknown_user",
            content: "delete database in production now please",
            messageType: "chat",
            receivedAt: new Date().toISOString(),
            metadata: {},
          },
        ],
        lastActivity: new Date().toISOString(),
      },
      STATE_PATH,
    )

    const result = await tick("manual", {
      statePath: STATE_PATH,
      storePath: STORE_PATH,
      opContextPath: OP_PATH,
    })

    expect(result.homeostasis.self_preservation).toBe("LOW")
  })

  it("detects stuck user via progress_momentum LOW", async () => {
    const msgs = [
      "how do I configure the authentication system?",
      "can you explain how the authentication system is configured?",
      "what does the authentication system configuration look like?",
    ]

    let result
    for (const content of msgs) {
      await updateAgentState(
        {
          pendingMessages: [
            {
              id: `msg-stuck-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              channel: "discord",
              direction: "inbound",
              routing: {},
              from: "alina",
              content,
              messageType: "chat",
              receivedAt: new Date().toISOString(),
              metadata: {},
            },
          ],
          lastActivity: new Date().toISOString(),
        },
        STATE_PATH,
      )
      result = await tick("manual", {
        statePath: STATE_PATH,
        storePath: STORE_PATH,
        opContextPath: OP_PATH,
      })
    }

    expect(result!.homeostasis.progress_momentum).toBe("LOW")
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
