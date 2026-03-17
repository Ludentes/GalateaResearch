// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  parseGlabActivity,
  type GlabActivityResult,
} from "../glab-activity-parser"

describe("parseGlabActivity", () => {
  it("detects glab issue list output and extracts issue references", () => {
    const toolSteps = [
      {
        toolName: "bash" as const,
        toolArgs: {
          command:
            "GIT_CONFIG_NOSYSTEM=1 glab issue list --repo gitlab.maugry.ru/kyurkov/agenttestproject",
        },
        toolResult: `#42\tBuild pricing page\topen\t2026-03-15T10:00:00Z
#43\tFix navigation bug\topen\t2026-03-17T08:30:00Z`,
      },
    ]
    const result = parseGlabActivity(toolSteps)
    expect(result.queriedGitLab).toBe(true)
    expect(result.issueActivity).toHaveLength(2)
    expect(result.issueActivity[0]).toEqual({
      id: "gitlab:issue:42",
      title: "Build pricing page",
      lastActivityAt: "2026-03-15T10:00:00Z",
    })
  })

  it("detects glab mr list output", () => {
    const toolSteps = [
      {
        toolName: "bash" as const,
        toolArgs: {
          command:
            "GIT_CONFIG_NOSYSTEM=1 glab mr list --repo gitlab.maugry.ru/kyurkov/agenttestproject",
        },
        toolResult: `!12\tAdd pricing page\topen\t2026-03-17T14:00:00Z
!13\tFix footer\tmerged\t2026-03-16T09:00:00Z`,
      },
    ]
    const result = parseGlabActivity(toolSteps)
    expect(result.queriedGitLab).toBe(true)
    expect(result.mrActivity).toHaveLength(2)
    expect(result.mrActivity[0]).toEqual({
      id: "gitlab:mr:12",
      title: "Add pricing page",
      lastActivityAt: "2026-03-17T14:00:00Z",
    })
  })

  it("detects glab issue create and extracts new work item", () => {
    const toolSteps = [
      {
        toolName: "bash" as const,
        toolArgs: {
          command:
            'GIT_CONFIG_NOSYSTEM=1 glab issue create --title "Implement footer" --assignee beki --repo gitlab.maugry.ru/kyurkov/agenttestproject',
        },
        toolResult: `Creating issue in kyurkov/agenttestproject
#55 Implement footer
https://gitlab.maugry.ru/kyurkov/agenttestproject/-/issues/55`,
      },
    ]
    const result = parseGlabActivity(toolSteps)
    expect(result.createdItems).toHaveLength(1)
    expect(result.createdItems[0]).toEqual({
      id: "gitlab:issue:55",
      title: "Implement footer",
      assignedTo: "beki",
    })
  })

  it("returns empty result when no glab commands found", () => {
    const toolSteps = [
      {
        toolName: "bash" as const,
        toolArgs: { command: "pnpm vitest run" },
        toolResult: "All tests pass",
      },
    ]
    const result = parseGlabActivity(toolSteps)
    expect(result.queriedGitLab).toBe(false)
    expect(result.issueActivity).toHaveLength(0)
    expect(result.mrActivity).toHaveLength(0)
    expect(result.createdItems).toHaveLength(0)
  })

  it("handles glab commands that fail gracefully", () => {
    const toolSteps = [
      {
        toolName: "bash" as const,
        toolArgs: {
          command: "GIT_CONFIG_NOSYSTEM=1 glab issue list --repo foo/bar",
        },
        toolResult: "error: could not resolve host",
      },
    ]
    const result = parseGlabActivity(toolSteps)
    expect(result.queriedGitLab).toBe(true)
    expect(result.issueActivity).toHaveLength(0)
  })

  it("handles transcript entries from work arc (CodingTranscriptEntry format)", () => {
    const transcriptEntries = [
      {
        role: "tool_call" as const,
        toolName: "Bash",
        content:
          "GIT_CONFIG_NOSYSTEM=1 glab issue list --repo gitlab.maugry.ru/kyurkov/agenttestproject",
      },
      {
        role: "tool_result" as const,
        toolName: "Bash",
        content: `#42\tBuild pricing page\topen\t2026-03-15T10:00:00Z`,
      },
    ]
    const result = parseGlabActivity(transcriptEntries)
    expect(result.queriedGitLab).toBe(true)
    expect(result.issueActivity).toHaveLength(1)
  })
})
