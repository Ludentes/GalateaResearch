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
 *
 * Supports both English and Russian input.
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

// -- English patterns --

const EN_CODING_VERBS = /(?:implement|build|create|add|fix|refactor)/
const EN_RESEARCH_VERBS =
  /(?:research|investigate|compare|evaluate|find out|look into)/
const EN_REVIEW_VERBS = /(?:review|check)/
const EN_REVIEW_TARGETS =
  /(?:mr|merge request|pull request|!\d+|code|код|мр)/
const EN_ADMIN_VERBS = /(?:create|assign|plan)/
const EN_ADMIN_TARGETS = /(?:task|issue|sprint|ticket|milestone)/
const EN_UI_TARGETS = /(?:screen|page|component|feature|module)/

// -- Russian patterns --

const RU_CODING_VERBS =
  /(?:реализуй|сделай|добавь|исправь|пофикси|рефактори|напиши|собери|построй|создай)/
const RU_RESEARCH_VERBS =
  /(?:исследуй|изучи|сравни|оцени|найди|посмотри|разберись|проанализируй)/
const RU_REVIEW_VERBS = /(?:проверь|ревьюни|посмотри|проревьюй|глянь)/
const RU_REVIEW_TARGETS = /(?:мр|мерж|пулл?\s*реквест|!\d+|код|code|mr)/
const RU_ADMIN_VERBS = /(?:создай|назначь|спланируй|заведи|распредели)/
const RU_ADMIN_TARGETS =
  /(?:задач[уи]?|тикет|спринт|issue|milestone|майлстоун)/
const RU_UI_TARGETS =
  /(?:экран|страниц[уы]?|компонент|фич[уа]?|модул[ья])/

function hasTaskSignal(lower: string): boolean {
  const taskPatterns = [
    // English
    new RegExp(`${EN_CODING_VERBS.source}\\s+.*#\\d+`),
    new RegExp(`${EN_CODING_VERBS.source}\\s+.*!\\d+`),
    new RegExp(`${EN_RESEARCH_VERBS.source}\\s+`),
    new RegExp(
      `${EN_REVIEW_VERBS.source}\\s+(?:.*?\\s)?${EN_REVIEW_TARGETS.source}`,
    ),
    new RegExp(`${EN_ADMIN_VERBS.source}\\s+${EN_ADMIN_TARGETS.source}`),
    new RegExp(
      `${EN_CODING_VERBS.source}\\s+.*${EN_UI_TARGETS.source}`,
    ),
    // Russian
    new RegExp(`${RU_CODING_VERBS.source}\\s+.*#\\d+`),
    new RegExp(`${RU_CODING_VERBS.source}\\s+.*!\\d+`),
    new RegExp(`${RU_RESEARCH_VERBS.source}\\s+`),
    new RegExp(
      `${RU_REVIEW_VERBS.source}\\s+(?:.*?\\s)?${RU_REVIEW_TARGETS.source}`,
    ),
    new RegExp(`${RU_ADMIN_VERBS.source}\\s+${RU_ADMIN_TARGETS.source}`),
    new RegExp(
      `${RU_CODING_VERBS.source}\\s+.*${RU_UI_TARGETS.source}`,
    ),
  ]
  return taskPatterns.some((p) => p.test(lower))
}

function inferTaskType(lower: string): TaskType {
  // Research (EN + RU)
  if (
    new RegExp(
      `${EN_RESEARCH_VERBS.source}|${RU_RESEARCH_VERBS.source}`,
    ).test(lower)
  ) {
    return "research"
  }

  // Review (EN + RU)
  if (
    new RegExp(
      `(?:${EN_REVIEW_VERBS.source}|${RU_REVIEW_VERBS.source})\\s+(?:.*?\\s)?(?:${EN_REVIEW_TARGETS.source}|${RU_REVIEW_TARGETS.source})`,
    ).test(lower)
  ) {
    return "review"
  }

  // Admin (EN + RU)
  if (
    new RegExp(
      `(?:${EN_ADMIN_VERBS.source}|${RU_ADMIN_VERBS.source})\\s+(?:${EN_ADMIN_TARGETS.source}|${RU_ADMIN_TARGETS.source})`,
    ).test(lower)
  ) {
    return "admin"
  }

  return "coding"
}
