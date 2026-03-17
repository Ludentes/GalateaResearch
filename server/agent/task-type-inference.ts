import type { TaskType } from "./operational-memory"

export interface RoutingDecision {
  level: "interaction" | "task"
  taskType?: TaskType
  reasoning: string
  confidence: "high" | "low"
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
      confidence: "high",
    }
  }

  // Task signals: action verbs + references
  if (hasTaskSignal(lower)) {
    return {
      level: "task",
      taskType: inferTaskType(lower),
      reasoning: "Contains task signal (action verb + reference)",
      confidence: "high",
    }
  }

  // No pattern match — low confidence, may need LLM classification
  return {
    level: "interaction",
    reasoning: "No task signal detected — treating as interaction",
    confidence: "low",
  }
}

// -- English patterns --

const EN_CODING_VERBS = /(?:implement|build|create|add|fix|refactor)/
const EN_RESEARCH_VERBS =
  /(?:research|investigate|compare|evaluate|find out|look into)/
const EN_REVIEW_VERBS = /(?:review|check)/
const EN_REVIEW_TARGETS = /(?:mr|merge request|pull request|!\d+|code|код|мр)/
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
const RU_ADMIN_TARGETS = /(?:задач[уи]?|тикет|спринт|issue|milestone|майлстоун)/
const RU_UI_TARGETS = /(?:экран|страниц[уы]?|компонент|фич[уа]?|модул[ья])/

function hasTaskSignal(lower: string): boolean {
  const taskPatterns = [
    // English
    new RegExp(`${EN_CODING_VERBS.source}\\s+.*#\\d+`),
    new RegExp(`${EN_CODING_VERBS.source}\\s+.*!\\d+`),
    new RegExp(`${EN_RESEARCH_VERBS.source}\\s+`),
    new RegExp(
      `${EN_REVIEW_VERBS.source}\\s+(?:.*?\\s)?${EN_REVIEW_TARGETS.source}`,
    ),
    new RegExp(
      `${EN_ADMIN_VERBS.source}\\s+(?:.*?\\s)?${EN_ADMIN_TARGETS.source}`,
    ),
    new RegExp(`${EN_CODING_VERBS.source}\\s+.*${EN_UI_TARGETS.source}`),
    // Russian
    new RegExp(`${RU_CODING_VERBS.source}\\s+.*#\\d+`),
    new RegExp(`${RU_CODING_VERBS.source}\\s+.*!\\d+`),
    new RegExp(`${RU_RESEARCH_VERBS.source}\\s+`),
    new RegExp(
      `${RU_REVIEW_VERBS.source}\\s+(?:.*?\\s)?${RU_REVIEW_TARGETS.source}`,
    ),
    new RegExp(
      `${RU_ADMIN_VERBS.source}\\s+(?:.*?\\s)?${RU_ADMIN_TARGETS.source}`,
    ),
    new RegExp(`${RU_CODING_VERBS.source}\\s+.*${RU_UI_TARGETS.source}`),
  ]
  return taskPatterns.some((p) => p.test(lower))
}

function inferTaskType(lower: string): TaskType {
  const hasCodingVerb = new RegExp(
    `${EN_CODING_VERBS.source}|${RU_CODING_VERBS.source}`,
  ).test(lower)
  const hasResearchVerb = new RegExp(
    `${EN_RESEARCH_VERBS.source}|${RU_RESEARCH_VERBS.source}`,
  ).test(lower)

  // When both coding and research verbs are present (e.g. "investigate and fix"),
  // the deliverable is code — classify as coding
  if (hasResearchVerb && !hasCodingVerb) {
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

  // Admin (EN + RU) — allow optional words between verb and target
  if (
    new RegExp(
      `(?:${EN_ADMIN_VERBS.source}|${RU_ADMIN_VERBS.source})\\s+(?:.*?\\s)?(?:${EN_ADMIN_TARGETS.source}|${RU_ADMIN_TARGETS.source})`,
    ).test(lower)
  ) {
    return "admin"
  }

  return "coding"
}

// ---------------------------------------------------------------------------
// LLM-based classification fallback for low-confidence heuristic results
// ---------------------------------------------------------------------------

const CLASSIFY_PROMPT =
  `Classify this message as either a task or a quick interaction.

Rules:
- "task" = requires work: coding, research, review, file operations, analysis, creating something
- "interaction" = quick reply: greetings, status questions, opinions, clarifications, thank you

If task, also classify the type:
- research: investigate, compare, evaluate, find information
- review: review code, MR, pull request
- admin: create tasks, plan sprints, assign work
- coding: implement, fix, build, modify files (default for ambiguous tasks)

Reply with EXACTLY one line in this format:
task:<type>
OR
interaction

Message: "{message}"`.trim()

export async function classifyWithLLM(
  content: string,
): Promise<RoutingDecision | null> {
  try {
    const { query } = await import("@anthropic-ai/claude-agent-sdk")

    const prompt = CLASSIFY_PROMPT.replace("{message}", content.slice(0, 500))

    let result = ""
    const queryOptions: Record<string, unknown> = {
      systemPrompt:
        "You are a message classifier. Reply with exactly one line, nothing else.",
      model: "haiku",
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: 1,
      abortController: new AbortController(),
    }

    const stream = query({
      prompt,
      options: queryOptions,
    } as Parameters<typeof query>[0])

    for await (const msg of stream) {
      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text") result += block.text
        }
      }
    }

    const line = result.trim().toLowerCase()

    if (line === "interaction") {
      return {
        level: "interaction",
        reasoning: "LLM classified as interaction",
        confidence: "high",
      }
    }

    const taskMatch = line.match(/^task:(\w+)$/)
    if (taskMatch) {
      const typeStr = taskMatch[1]
      const validTypes: TaskType[] = [
        "research",
        "review",
        "admin",
        "coding",
        "communication",
      ]
      const taskType: TaskType = validTypes.includes(typeStr as TaskType)
        ? (typeStr as TaskType)
        : "coding"
      return {
        level: "task",
        taskType,
        reasoning: `LLM classified as task:${taskType}`,
        confidence: "high",
      }
    }

    // Unparseable response — can't classify
    return null
  } catch {
    // LLM unavailable — can't classify
    return null
  }
}
