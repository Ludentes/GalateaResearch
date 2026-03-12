import type { TaskType } from "./operational-memory"

export interface RoutingDecision {
  level: "interaction" | "task"
  taskType?: TaskType
  reasoning: string
}

/**
 * Infers whether a message should create a task or be handled as a quick
 * interaction, and what type of task it should be.
 *
 * This is a heuristic — the LLM + homeostasis provide the final decision.
 * This function provides the initial signal for routing.
 */
export function inferRouting(
  content: string,
  messageType?: string,
): RoutingDecision {
  const lower = content.toLowerCase()

  // Explicit task_assignment from channel adapter
  if (messageType === "task_assignment") {
    return {
      level: "task",
      taskType: inferTaskType(lower),
      reasoning: "Message type is task_assignment",
    }
  }

  // Task signals: action verbs + references
  if (hasTaskSignal(lower)) {
    return {
      level: "task",
      taskType: inferTaskType(lower),
      reasoning: "Contains task signal (action verb + reference)",
    }
  }

  // Default: interaction
  return {
    level: "interaction",
    reasoning: "No task signal detected — treating as interaction",
  }
}

function hasTaskSignal(lower: string): boolean {
  const taskPatterns = [
    /(?:implement|build|create|add|fix|refactor)\s+.*#\d+/,
    /(?:implement|build|create|add|fix|refactor)\s+.*!\d+/,
    /(?:research|investigate|compare|evaluate|find out|look into)\s+/,
    /(?:review|check)\s+(?:mr|merge request|pull request|!\d+|code)/,
    /(?:create|assign|plan)\s+(?:task|issue|sprint|ticket)/,
    /(?:implement|build|create|add)\s+.*(?:screen|page|component|feature|module)/,
  ]
  return taskPatterns.some((p) => p.test(lower))
}

function inferTaskType(lower: string): TaskType {
  if (
    /(?:research|investigate|compare|evaluate|find out|look into)/.test(lower)
  ) {
    return "research"
  }

  if (
    /(?:review|check)\s+(?:mr|merge request|pull request|!\d+|code)/.test(
      lower,
    )
  ) {
    return "review"
  }

  if (
    /(?:create|assign|plan)\s+(?:task|issue|sprint|ticket|milestone)/.test(
      lower,
    )
  ) {
    return "admin"
  }

  return "coding"
}
