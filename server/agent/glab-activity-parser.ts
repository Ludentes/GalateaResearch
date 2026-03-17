// server/agent/glab-activity-parser.ts

export interface GlabActivityItem {
  id: string // "gitlab:issue:42" or "gitlab:mr:12"
  title: string
  lastActivityAt: string // ISO timestamp
}

export interface GlabCreatedItem {
  id: string // "gitlab:issue:55"
  title: string
  assignedTo?: string
}

export interface GlabActivityResult {
  queriedGitLab: boolean
  issueActivity: GlabActivityItem[]
  mrActivity: GlabActivityItem[]
  createdItems: GlabCreatedItem[]
}

/** Minimal tool step — works with both LoopStep and CodingTranscriptEntry */
interface ToolStep {
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolResult?: string
  // CodingTranscriptEntry format
  role?: string
  content?: string
}

const GLAB_CMD_RE = /\bglab\s+(issue|mr)\s+(list|view|create|update)/i
const ISSUE_LINE_RE = /^#(\d+)\t(.+?)\t\w+\t(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)$/
const MR_LINE_RE = /^!(\d+)\t(.+?)\t\w+\t(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)$/
const CREATED_ISSUE_RE = /^#(\d+)\s+(.+)$/m
const ASSIGNEE_RE = /--assignee\s+(\S+)/

export function parseGlabActivity(steps: ToolStep[]): GlabActivityResult {
  const result: GlabActivityResult = {
    queriedGitLab: false,
    issueActivity: [],
    mrActivity: [],
    createdItems: [],
  }

  // Normalize: pair tool_call + tool_result entries from coding transcript
  const normalized = normalizeSteps(steps)

  for (const step of normalized) {
    const command = step.command
    const output = step.output
    if (!command || !GLAB_CMD_RE.test(command)) continue

    result.queriedGitLab = true
    if (!output) continue

    const match = command.match(GLAB_CMD_RE)
    if (!match) continue
    const [, resource, action] = match

    if (action === "list" || action === "view") {
      const lines = output.split("\n").filter(Boolean)
      for (const line of lines) {
        if (resource === "issue") {
          const m = line.match(ISSUE_LINE_RE)
          if (m) {
            result.issueActivity.push({
              id: `gitlab:issue:${m[1]}`,
              title: m[2],
              lastActivityAt: m[3],
            })
          }
        } else if (resource === "mr") {
          const m = line.match(MR_LINE_RE)
          if (m) {
            result.mrActivity.push({
              id: `gitlab:mr:${m[1]}`,
              title: m[2],
              lastActivityAt: m[3],
            })
          }
        }
      }
    } else if (action === "create" && resource === "issue") {
      const titleMatch = output.match(CREATED_ISSUE_RE)
      const assigneeMatch = command.match(ASSIGNEE_RE)
      if (titleMatch) {
        result.createdItems.push({
          id: `gitlab:issue:${titleMatch[1]}`,
          title: titleMatch[2],
          assignedTo: assigneeMatch?.[1],
        })
      }
    }
  }

  return result
}

interface NormalizedStep {
  command: string
  output?: string
}

function normalizeSteps(steps: ToolStep[]): NormalizedStep[] {
  const normalized: NormalizedStep[] = []

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]

    // LoopStep format: has toolArgs.command and toolResult
    if (step.toolArgs?.command && typeof step.toolArgs.command === "string") {
      normalized.push({
        command: step.toolArgs.command,
        output: step.toolResult ?? undefined,
      })
      continue
    }

    // CodingTranscriptEntry format: role=tool_call, next entry is tool_result
    if (
      step.role === "tool_call" &&
      step.toolName?.toLowerCase() === "bash" &&
      step.content
    ) {
      const next = steps[i + 1]
      const output = next?.role === "tool_result" ? next.content : undefined
      normalized.push({
        command: step.content,
        output: output ?? undefined,
      })
      continue
    }
  }

  return normalized
}
