// @vitest-environment node

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

// Skip L2 async assessment — use synchronous L1 only
vi.mock("../../engine/homeostasis-engine", async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import("../../engine/homeostasis-engine")
  return {
    ...actual,
    assessDimensionsAsync: vi.fn().mockImplementation((ctx) => {
      return Promise.resolve(actual.assessDimensions(ctx))
    }),
  }
})

vi.mock("../../agent/agent-loop", () => ({
  runAgentLoop: vi.fn().mockResolvedValue({
    text: "I'll help with that.",
    totalSteps: 1,
    finishReason: "text",
    steps: [],
  }),
}))

vi.mock("../../agent/dispatcher", () => ({
  dispatchMessage: vi.fn().mockResolvedValue(undefined),
}))

import { updateAgentState } from "../../agent/agent-state"
import type {
  CodingQueryOptions,
  CodingSessionMessage,
  CodingToolAdapter,
} from "../../agent/coding-adapter/types"
import { loadOperationalContext } from "../../agent/operational-memory"
import { setAdapter, tick } from "../../agent/tick"
import type { ChannelMessage } from "../../agent/types"

const TEST_DIR = "data/test-work-arc-e2e"
const STATE_PATH = path.join(TEST_DIR, "state.json")
const STORE_PATH = path.join(TEST_DIR, "entries.jsonl")
const OP_PATH = path.join(TEST_DIR, "op-context.json")

function makeTaskMessage(
  content = "Create user profile screen with edit functionality",
): ChannelMessage {
  return {
    id: "msg-task-e2e",
    channel: "discord",
    direction: "inbound",
    routing: {},
    from: "pm-user",
    content,
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

describe("E2E work arc flow", () => {
  it("full work arc: task_assignment -> delegate -> completed", async () => {
    const mockQuery = vi.fn().mockImplementation(async function* (
      _opts: CodingQueryOptions,
    ) {
      yield {
        type: "result",
        subtype: "success",
        text: "Task completed successfully",
        durationMs: 2000,
        costUsd: 0.05,
        numTurns: 3,
        transcript: [
          {
            role: "assistant",
            content: "Starting work on profile screen",
            timestamp: new Date().toISOString(),
          },
          {
            role: "tool_call",
            content: "Write",
            toolName: "Write",
            toolInput: { file_path: "/tmp/test-workspace/profile.ts" },
            timestamp: new Date().toISOString(),
          },
          {
            role: "tool_result",
            content: "File written",
            toolName: "Write",
            timestamp: new Date().toISOString(),
          },
        ],
      } satisfies CodingSessionMessage
    })

    const adapter: CodingToolAdapter = {
      name: "e2e-mock",
      isAvailable: vi.fn().mockResolvedValue(true),
      query: mockQuery,
    }
    setAdapter(adapter)

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

    // Assert delegation result
    expect(result.action).toBe("delegate")
    expect(result.delegation).toBeDefined()
    expect(result.delegation?.adapter).toBe("e2e-mock")
    expect(result.delegation?.status).toBe("completed")

    // Assert adapter.query was called (DO phase + optional VERIFY phase)
    expect(mockQuery.mock.calls.length).toBeGreaterThanOrEqual(1)
    const queryOpts = mockQuery.mock.calls[0][0] as CodingQueryOptions
    expect(queryOpts.prompt).toContain("Create user profile screen")

    // Assert hooks.preToolUse was passed
    expect(queryOpts.hooks).toBeDefined()
    expect(queryOpts.hooks?.preToolUse).toBeTypeOf("function")
  }, 30_000)

  it("operational memory updated on success (BDD G.3)", async () => {
    const mockQuery = vi.fn().mockImplementation(async function* (
      _opts: CodingQueryOptions,
    ) {
      yield {
        type: "result",
        subtype: "success",
        text: "Profile screen implemented",
        durationMs: 1500,
        costUsd: 0.03,
        numTurns: 2,
        transcript: [],
      } satisfies CodingSessionMessage
    })

    const adapter: CodingToolAdapter = {
      name: "e2e-mock",
      isAvailable: vi.fn().mockResolvedValue(true),
      query: mockQuery,
    }
    setAdapter(adapter)

    await updateAgentState(
      {
        pendingMessages: [makeTaskMessage()],
        lastActivity: new Date().toISOString(),
      },
      STATE_PATH,
    )

    await tick("manual", {
      statePath: STATE_PATH,
      storePath: STORE_PATH,
      opContextPath: OP_PATH,
    })

    // Load operational context and verify task was set to "done"
    const opCtx = await loadOperationalContext(OP_PATH)
    expect(opCtx.tasks.length).toBeGreaterThanOrEqual(1)
    const task = opCtx.tasks[opCtx.tasks.length - 1]
    expect(task.status).toBe("done")
    expect(task.progress).toContain("Profile screen implemented")
  }, 30_000)

  it("preToolUse hook blocks destructive command (BDD Trace 9)", async () => {
    const decisions: Array<{ toolName: string; decision: string }> = []

    const mockQuery = vi.fn().mockImplementation(async function* (
      opts: CodingQueryOptions,
    ) {
      // Manually invoke the preToolUse hook with different tools
      const hook = opts.hooks?.preToolUse
      if (hook) {
        // Read tool should be allowed
        const readResult = await hook("Read", {
          file_path: "/tmp/test-workspace/file.ts",
        })
        decisions.push({ toolName: "Read", decision: readResult.decision })

        // Destructive Bash command should be denied
        const bashResult = await hook("Bash", { command: "rm -rf /" })
        decisions.push({ toolName: "Bash", decision: bashResult.decision })
      }

      yield {
        type: "result",
        subtype: "success",
        text: "Task done with hook checks",
        durationMs: 500,
        costUsd: 0.01,
        numTurns: 1,
        transcript: [],
      } satisfies CodingSessionMessage
    })

    const adapter: CodingToolAdapter = {
      name: "e2e-mock",
      isAvailable: vi.fn().mockResolvedValue(true),
      query: mockQuery,
    }
    setAdapter(adapter)

    await updateAgentState(
      {
        pendingMessages: [makeTaskMessage()],
        lastActivity: new Date().toISOString(),
      },
      STATE_PATH,
    )

    await tick("manual", {
      statePath: STATE_PATH,
      storePath: STORE_PATH,
      opContextPath: OP_PATH,
    })

    // Verify hook decisions were captured (DO phase + VERIFY phase)
    // Each phase invokes the adapter which triggers 2 hook calls
    expect(decisions.length).toBeGreaterThanOrEqual(2)
    expect(decisions[0]).toEqual({ toolName: "Read", decision: "allow" })
    expect(decisions[1]).toEqual({ toolName: "Bash", decision: "deny" })
  }, 30_000)
})
