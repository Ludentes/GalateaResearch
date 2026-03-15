// @vitest-environment node
import { existsSync, rmSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { Artifact } from "../artifact"
import {
  addArtifact,
  addTask,
  completeTask,
  getActiveTask,
  loadOperationalContext,
  phaseDurationMs,
  pushHistoryEntry,
  recordOutbound,
  saveOperationalContext,
  timeSinceLastOutboundMs,
  updateTaskPhase,
  updateTaskSessionId,
} from "../operational-memory"
import type { ChannelMessage } from "../types"

const TEST_DIR = path.join(__dirname, "fixtures", "test-op-mem")
const CTX_PATH = path.join(TEST_DIR, "operational-context.json")

function makeMsg(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: "msg-1",
    channel: "discord",
    direction: "inbound",
    routing: {},
    from: "mary",
    content: "Implement user profile screen",
    messageType: "task_assignment",
    receivedAt: new Date().toISOString(),
    metadata: {},
    ...overrides,
  }
}

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
})

// ---------------------------------------------------------------------------
// Feature: Operational memory persists task state across ticks and restarts
// ---------------------------------------------------------------------------

describe("Operational Memory", () => {
  describe("persistence", () => {
    it("returns empty context when file does not exist", async () => {
      const ctx = await loadOperationalContext(CTX_PATH)
      expect(ctx.tasks).toEqual([])
      expect(ctx.workPhase).toBe("idle")
      expect(ctx.recentHistory).toEqual([])
    })

    // Scenario: Operational context persists across server restart
    it("saves and loads context across restarts", async () => {
      const ctx = await loadOperationalContext(CTX_PATH)
      addTask(ctx, "Build profile screen", makeMsg())
      ctx.workPhase = "implementing"
      pushHistoryEntry(ctx, "user", "Build the profile")
      pushHistoryEntry(ctx, "assistant", "On it!")

      await saveOperationalContext(ctx, CTX_PATH)

      // Simulate restart — load fresh
      const restored = await loadOperationalContext(CTX_PATH)
      expect(restored.tasks).toHaveLength(1)
      expect(restored.tasks[0].description).toBe("Build profile screen")
      expect(restored.tasks[0].status).toBe("assigned")
      expect(restored.workPhase).toBe("implementing")
      expect(restored.recentHistory).toHaveLength(2)
      expect(restored.lastUpdated).toBeTruthy()
    })
  })

  describe("task type", () => {
    it("creates task with explicit type", async () => {
      const ctx = await loadOperationalContext(CTX_PATH)
      const task = addTask(
        ctx,
        "Research auth options",
        makeMsg({ content: "research auth options" }),
        "research",
      )
      expect(task.type).toBe("research")
    })

    it("defaults task type to coding", async () => {
      const ctx = await loadOperationalContext(CTX_PATH)
      const task = addTask(
        ctx,
        "Implement settings",
        makeMsg({ content: "implement settings" }),
      )
      expect(task.type).toBe("coding")
    })

    it("accepts all five task types", async () => {
      const ctx = await loadOperationalContext(CTX_PATH)
      const types = [
        "coding",
        "research",
        "review",
        "admin",
        "communication",
      ] as const
      for (const t of types) {
        const task = addTask(ctx, `Task ${t}`, makeMsg(), t)
        expect(task.type).toBe(t)
      }
      expect(ctx.tasks).toHaveLength(5)
    })
  })

  describe("task management", () => {
    // Scenario: Task assignment creates TaskState
    it("creates a task from a channel message", async () => {
      const ctx = await loadOperationalContext(CTX_PATH)
      const task = addTask(ctx, "Implement user profile screen", makeMsg())

      expect(task.status).toBe("assigned")
      expect(task.phase).toBe("exploring")
      expect(task.source.channel).toBe("discord")
      expect(task.source.from).toBe("mary")
      expect(task.progress).toEqual([])
      expect(task.toolCallCount).toBe(0)
      expect(ctx.tasks).toContain(task)
    })

    // Scenario: Task progresses through phases
    it("updates task phase and resets phaseStartedAt", async () => {
      const ctx = await loadOperationalContext(CTX_PATH)
      const task = addTask(ctx, "Build it", makeMsg())
      const originalPhaseStart = task.phaseStartedAt

      // Small delay to ensure timestamps differ
      await new Promise((r) => setTimeout(r, 5))
      updateTaskPhase(task, "deciding")

      expect(task.phase).toBe("deciding")
      expect(task.phaseStartedAt).not.toBe(originalPhaseStart)
    })

    // Scenario: Multiple tasks tracked simultaneously
    it("getActiveTask returns in_progress over assigned", async () => {
      const ctx = await loadOperationalContext(CTX_PATH)
      const task1 = addTask(ctx, "Task 1", makeMsg({ id: "msg-1" }))
      const task2 = addTask(ctx, "Task 2", makeMsg({ id: "msg-2" }))
      task1.status = "assigned"
      task2.status = "in_progress"

      const active = getActiveTask(ctx)
      expect(active?.id).toBe(task2.id)
    })

    it("getActiveTask returns assigned when no in_progress", async () => {
      const ctx = await loadOperationalContext(CTX_PATH)
      addTask(ctx, "Task 1", makeMsg({ id: "msg-1" }))

      const active = getActiveTask(ctx)
      expect(active?.status).toBe("assigned")
    })

    it("getActiveTask returns undefined when no tasks", async () => {
      const ctx = await loadOperationalContext(CTX_PATH)
      expect(getActiveTask(ctx)).toBeUndefined()
    })

    // Scenario: Completed task populates carryover
    it("completes a task and adds carryover", async () => {
      const ctx = await loadOperationalContext(CTX_PATH)
      const task = addTask(ctx, "Build profile", makeMsg())
      task.status = "in_progress"
      addArtifact(ctx, task.id, {
        type: "document",
        path: "app/screens/Profile.tsx",
        description: "Profile screen component",
      })

      const completed = completeTask(ctx, task.id)

      expect(completed?.status).toBe("done")
      expect(ctx.carryover).toHaveLength(1)
      expect(ctx.carryover[0]).toContain("Build profile")
      expect(ctx.carryover[0]).toContain("Profile screen component")
    })
  })

  describe("history", () => {
    // Scenario: History is bounded
    it("bounds history to 10 entries (5 exchanges)", async () => {
      const ctx = await loadOperationalContext(CTX_PATH)

      // Push 12 messages (6 exchanges)
      for (let i = 0; i < 12; i++) {
        pushHistoryEntry(
          ctx,
          i % 2 === 0 ? "user" : "assistant",
          `message ${i}`,
        )
      }

      expect(ctx.recentHistory).toHaveLength(10)
      expect(ctx.recentHistory[0].content).toBe("message 2") // oldest kept
      expect(ctx.recentHistory[9].content).toBe("message 11") // newest
    })
  })

  describe("structured artifacts", () => {
    it("records structured MR artifact on task", async () => {
      const ctx = await loadOperationalContext(CTX_PATH)
      const task = addTask(ctx, "Implement settings", makeMsg(), "coding")
      const artifact: Artifact = {
        type: "mr",
        url: "https://gitlab.example.com/project/-/merge_requests/42",
        description: "Settings screen MR",
      }
      addArtifact(ctx, task.id, artifact)
      expect(task.artifacts).toHaveLength(1)
      expect(task.artifacts[0].type).toBe("mr")
      expect(task.artifacts[0].url).toContain("42")
    })

    it("records document artifact with path", async () => {
      const ctx = await loadOperationalContext(CTX_PATH)
      const task = addTask(ctx, "Research auth options", makeMsg(), "research")
      addArtifact(ctx, task.id, {
        type: "document",
        path: "docs/research/auth-options.md",
        description: "Auth options research",
      })
      expect(task.artifacts).toHaveLength(1)
      expect(task.artifacts[0].type).toBe("document")
      expect(task.artifacts[0].path).toBe("docs/research/auth-options.md")
    })

    it("supports multiple artifact types on one task", async () => {
      const ctx = await loadOperationalContext(CTX_PATH)
      const task = addTask(ctx, "Implement feature", makeMsg(), "coding")
      addArtifact(ctx, task.id, {
        type: "branch",
        description: "feature/settings",
      })
      addArtifact(ctx, task.id, {
        type: "commit",
        url: "https://gitlab.example.com/project/-/commit/abc123",
        description: "Initial commit",
      })
      addArtifact(ctx, task.id, {
        type: "mr",
        url: "https://gitlab.example.com/project/-/merge_requests/42",
        description: "Settings MR",
      })
      expect(task.artifacts).toHaveLength(3)
      expect(task.artifacts[0].type).toBe("branch")
      expect(task.artifacts[1].type).toBe("commit")
      expect(task.artifacts[2].type).toBe("mr")
    })

    it("ignores addArtifact for unknown task id", async () => {
      const ctx = await loadOperationalContext(CTX_PATH)
      addArtifact(ctx, "nonexistent", {
        type: "branch",
        description: "orphan",
      })
      expect(ctx.tasks).toHaveLength(0)
    })
  })

  describe("session resume", () => {
    it("stores Claude Code session ID on task", async () => {
      const ctx = await loadOperationalContext(CTX_PATH)
      const task = addTask(ctx, "Implement settings", makeMsg())
      updateTaskSessionId(ctx, task.id, "session-abc-123")
      expect(task.claudeSessionId).toBe("session-abc-123")
    })

    it("clears session ID on phase change", async () => {
      const ctx = await loadOperationalContext(CTX_PATH)
      const task = addTask(ctx, "Implement settings", makeMsg())
      updateTaskSessionId(ctx, task.id, "session-abc-123")
      updateTaskPhase(task, "implementing")
      expect(task.claudeSessionId).toBeUndefined()
    })

    it("persists session ID across save/load", async () => {
      const ctx = await loadOperationalContext(CTX_PATH)
      const task = addTask(ctx, "Implement settings", makeMsg())
      updateTaskSessionId(ctx, task.id, "session-xyz-789")
      await saveOperationalContext(ctx, CTX_PATH)

      const restored = await loadOperationalContext(CTX_PATH)
      expect(restored.tasks[0].claudeSessionId).toBe("session-xyz-789")
    })

    it("ignores updateTaskSessionId for unknown task", async () => {
      const ctx = await loadOperationalContext(CTX_PATH)
      updateTaskSessionId(ctx, "nonexistent", "session-abc")
      expect(ctx.tasks).toHaveLength(0)
    })
  })

  describe("time tracking", () => {
    it("measures phase duration", async () => {
      const ctx = await loadOperationalContext(CTX_PATH)
      ctx.phaseEnteredAt = new Date(Date.now() - 30_000).toISOString() // 30s ago

      const duration = phaseDurationMs(ctx)
      expect(duration).toBeGreaterThan(29_000)
      expect(duration).toBeLessThan(32_000)
    })

    it("measures time since last outbound", async () => {
      const ctx = await loadOperationalContext(CTX_PATH)
      recordOutbound(ctx)

      const elapsed = timeSinceLastOutboundMs(ctx)
      expect(elapsed).toBeLessThan(100) // just recorded
    })

    it("returns Infinity when no outbound recorded", async () => {
      const ctx = await loadOperationalContext(CTX_PATH)
      expect(timeSinceLastOutboundMs(ctx)).toBe(Infinity)
    })
  })
})
