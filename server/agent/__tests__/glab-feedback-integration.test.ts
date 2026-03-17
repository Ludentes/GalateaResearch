// @vitest-environment node
import { describe, expect, it } from "vitest"
import { assessDimensions, clearCache } from "../../engine/homeostasis-engine"
import type { AgentContext } from "../../engine/types"
import { parseGlabActivity } from "../glab-activity-parser"

function makeContext(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    sessionId: `test-${Date.now()}`,
    currentMessage: "",
    messageHistory: [],
    retrievedFacts: [],
    hasAssignedTask: true,
    ...overrides,
  }
}

describe("homeostasis feedback loop — glab activity resolves pressure", () => {
  it("stale work → LOW, then glab check → HEALTHY", () => {
    clearCache()

    // Step 1: stale work causes LOW
    const staleCtx = makeContext({
      activeWorkItems: [
        {
          id: "gitlab:issue:42",
          title: "Build pricing page",
          lastActivityAt: new Date(Date.now() - 72 * 60 * 60_000).toISOString(),
          assignedTo: "beki",
          delegatedAt: new Date(Date.now() - 96 * 60 * 60_000).toISOString(),
        },
      ],
      outboundFollowUps: 0,
    })
    const staleDimensions = assessDimensions(staleCtx)
    expect(staleDimensions.progress_momentum).toBe("LOW")

    clearCache()

    // Step 2: agent checks GitLab, finds recent activity
    const glabOutput = parseGlabActivity([
      {
        toolName: "bash",
        toolArgs: {
          command:
            "GIT_CONFIG_NOSYSTEM=1 glab issue list --repo gitlab.maugry.ru/kyurkov/agenttestproject",
        },
        toolResult: `#42\tBuild pricing page\topen\t${new Date().toISOString()}`,
      },
    ])

    // Step 3: update the work item with fresh activity
    const updatedWorkItems = [...staleCtx.activeWorkItems!]
    for (const item of glabOutput.issueActivity) {
      const existing = updatedWorkItems.find((w) => w.id === item.id)
      if (existing) existing.lastActivityAt = item.lastActivityAt
    }

    // Step 4: re-assess with fresh data
    const freshCtx = makeContext({
      activeWorkItems: updatedWorkItems,
      outboundFollowUps: 1,
    })
    const freshDimensions = assessDimensions(freshCtx)
    expect(freshDimensions.progress_momentum).toBe("HEALTHY")
  })

  it("glab issue create auto-populates activeWorkItems", () => {
    const result = parseGlabActivity([
      {
        toolName: "bash",
        toolArgs: {
          command:
            'GIT_CONFIG_NOSYSTEM=1 glab issue create --title "Add footer" --assignee beki --repo gitlab.maugry.ru/kyurkov/agenttestproject',
        },
        toolResult: `Creating issue in kyurkov/agenttestproject
#55 Add footer
https://gitlab.maugry.ru/kyurkov/agenttestproject/-/issues/55`,
      },
    ])

    expect(result.createdItems).toHaveLength(1)
    expect(result.createdItems[0].id).toBe("gitlab:issue:55")
    expect(result.createdItems[0].assignedTo).toBe("beki")
  })
})
