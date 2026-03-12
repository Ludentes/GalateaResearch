// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { TaskState } from "../../agent/operational-memory"
import type { ChannelMessage } from "../../agent/types"
import { createWorkKnowledge } from "../work-to-knowledge"

function makeSource(): ChannelMessage {
  return {
    id: "msg-1",
    channel: "discord",
    direction: "inbound",
    routing: {},
    from: "sasha",
    content: "implement settings",
    messageType: "task_assignment",
    receivedAt: new Date().toISOString(),
    metadata: {},
  }
}

function makeTask(overrides: Partial<TaskState> = {}): TaskState {
  return {
    id: "task-123",
    description: "Implement user settings screen #101",
    source: makeSource(),
    type: "coding",
    status: "done",
    phase: "verifying",
    progress: [
      "Created branch feature/user-settings",
      "Implemented settings screen with NativeWind",
      "Added unit tests",
      "Created MR !45",
    ],
    artifacts: [
      { type: "branch", description: "feature/user-settings" },
      {
        type: "mr",
        url: "https://gitlab.example.com/-/merge_requests/45",
        description: "Settings screen MR !45",
      },
    ],
    phaseStartedAt: new Date().toISOString(),
    toolCallCount: 8,
    ...overrides,
  }
}

describe("Work-to-Knowledge", () => {
  it("creates fact entry from completed coding task", () => {
    const entries = createWorkKnowledge(makeTask(), "beki")
    expect(entries.length).toBeGreaterThanOrEqual(1)
    const fact = entries.find((e) => e.type === "fact")
    expect(fact).toBeDefined()
    expect(fact!.content).toContain("settings")
    expect(fact!.content).toContain("coding")
    expect(fact!.source).toBe("task:task-123")
    expect(fact!.about).toEqual({ entity: "beki", type: "agent" })
    expect(fact!.confidence).toBe(1)
  })

  it("includes progress steps in content", () => {
    const entries = createWorkKnowledge(makeTask(), "beki")
    const fact = entries[0]
    expect(fact.content).toContain("NativeWind")
    expect(fact.content).toContain("unit tests")
  })

  it("includes artifact summaries in content", () => {
    const entries = createWorkKnowledge(makeTask(), "beki")
    const fact = entries[0]
    expect(fact.content).toContain("branch")
    expect(fact.content).toContain("merge_requests/45")
  })

  it("creates entry for research task with document artifact", () => {
    const task = makeTask({
      type: "research",
      description: "Research auth options",
      progress: ["Evaluated Clerk, Auth0, Supabase Auth"],
      artifacts: [
        {
          type: "document",
          path: "docs/research/auth-options.md",
          description: "Auth options comparison",
        },
      ],
    })
    const entries = createWorkKnowledge(task, "besa")
    const fact = entries[0]
    expect(fact.content).toContain("research")
    expect(fact.content).toContain("auth-options.md")
    expect(fact.about).toEqual({ entity: "besa", type: "agent" })
  })

  it("creates entry for task with no progress", () => {
    const task = makeTask({ progress: [], artifacts: [] })
    const entries = createWorkKnowledge(task, "beki")
    expect(entries).toHaveLength(1)
    expect(entries[0].content).toContain("settings")
  })

  it("extracts issue and MR references as entities", () => {
    const entries = createWorkKnowledge(makeTask(), "beki")
    const fact = entries[0]
    expect(fact.entities).toContain("#101")
    expect(fact.entities).toContain("!45")
  })

  it("deduplicates extracted entities", () => {
    const task = makeTask({
      description: "Fix bug #101",
      artifacts: [
        {
          type: "mr",
          description: "Fix for #101",
          url: "https://example.com",
        },
      ],
    })
    const entries = createWorkKnowledge(task, "beki")
    const count = entries[0].entities.filter((e) => e === "#101").length
    expect(count).toBe(1)
  })

  it("sets origin to observed-pattern", () => {
    const entries = createWorkKnowledge(makeTask(), "beki")
    expect(entries[0].origin).toBe("observed-pattern")
  })
})
