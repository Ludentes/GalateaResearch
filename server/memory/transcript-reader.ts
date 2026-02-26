import { readFile } from "node:fs/promises"
import type { TranscriptTurn } from "./types"

interface ContentBlock {
  type: string
  text?: string
  name?: string
  input?: Record<string, unknown>
  content?: string | ContentBlock[]
  is_error?: boolean
}

interface JournalEntry {
  type: string
  isMeta?: boolean
  message?: {
    id?: string
    role?: string
    content: string | ContentBlock[]
  }
}

export async function readTranscript(
  filePath: string,
): Promise<TranscriptTurn[]> {
  const raw = await readFile(filePath, "utf-8")
  const lines = raw.trim().split("\n").filter(Boolean)

  const turns: TranscriptTurn[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    let entry: JournalEntry
    try {
      entry = JSON.parse(line)
    } catch {
      console.warn(`[transcript] Skipping invalid JSON line: ${line.slice(0, 100)}`)
      continue
    }

    if (entry.type !== "user" && entry.type !== "assistant") continue
    if (entry.isMeta) continue
    if (!entry.message?.content) continue

    const role = (entry.message.role || entry.type) as "user" | "assistant"
    if (role !== "user" && role !== "assistant") continue

    // Dedup streaming assistant messages by id + content signature
    if (role === "assistant" && entry.message.id) {
      const key = `${entry.message.id}:${contentSignature(entry.message.content)}`
      if (seen.has(key)) continue
      seen.add(key)
    }

    const turn = parseTurn(role, entry.message.content)
    if (!turn.content && !(turn.toolUse && turn.toolUse.length > 0)) continue
    if (isInternalNoise(turn.content)) continue

    turns.push(turn)
  }

  return turns
}

/**
 * Filter out internal Claude Code artifacts that aren't real conversation:
 * - "[Request interrupted by user]" / "[Request interrupted by user for tool use]"
 * - <command-name>...</command-name> slash command XML
 * - <local-command-stdout>...</local-command-stdout> command output XML
 * - Session continuation summaries (start with "This session is being continued")
 */
function isInternalNoise(text: string): boolean {
  if (!text) return true
  const trimmed = text.trim()
  if (trimmed.startsWith("[Request interrupted")) return true
  if (trimmed.startsWith("<command-name>")) return true
  if (trimmed.startsWith("<local-command-stdout>")) return true
  if (trimmed.startsWith("<task-notification>")) return true
  if (trimmed.startsWith("This session is being continued")) return true
  return false
}

/**
 * Strip IDE-injected XML wrappers from user content.
 * Extracts inner text from <feedback>, <task>, etc.
 * Drops pure system events (<ide_opened_file>, <ide_selection>).
 */
/**
 * Strip IDE/tool XML wrappers from user content.
 *
 * Based on structural analysis of JSONL transcripts (see
 * docs/research/2026-02-26-jsonl-transcript-structure.md).
 *
 * Tags fall into three categories:
 * 1. STRIP entirely (tag + content) — code, tool output, IDE events, Cline state
 * 2. UNWRAP (remove tags, keep inner text) — task descriptions, feedback
 * 3. Orphaned closing tags — cleanup for incomplete wrappers
 */

// Tags to strip entirely: content is code, tool output, or system state
const STRIP_TAGS = [
  // IDE events
  "ide_opened_file",
  "ide_selection",
  // Embedded code content
  "file_content",
  "diff",
  // Cline/Roo Code tools (contain code, commands, diffs)
  "read_file",
  "apply_diff",
  "write_to_file",
  "execute_command",
  "list_files",
  "attempt_completion",
  "actual_tool_name",
  // Cline/Roo Code tool output
  "result",
  "file_write_result",
  "error_details",
  "notice",
  "tool_use_error",
  // Cline/Roo Code state and UI
  "environment_details",
  "todos",
  "update_todo_list",
  "question",
  "follow_up",
  // Claude Code internal
  "command-message",
  "command-name",
  "command-args",
]

// Tags to unwrap: remove tags but keep inner text (user's actual words)
const UNWRAP_TAGS = ["task", "feedback"]

// Build regex patterns once
const STRIP_RES = STRIP_TAGS.map(
  (tag) => new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"),
)
const UNWRAP_OPEN_RES = UNWRAP_TAGS.map(
  (tag) => new RegExp(`<${tag}[^>]*>\\s*`, "gi"),
)
const UNWRAP_CLOSE_RES = UNWRAP_TAGS.map(
  (tag) => new RegExp(`\\s*<\\/${tag}>`, "gi"),
)
// Match suggest with optional attributes
STRIP_RES.push(/<suggest[^>]*>[\s\S]*?<\/suggest>/gi)
// Orphaned closing tags — all tags from both lists
const ALL_TAGS = [...STRIP_TAGS, ...UNWRAP_TAGS]
const ORPHANED_CLOSE_RE = new RegExp(
  `<\\/(?:${ALL_TAGS.join("|")})>`,
  "gi",
)

export function stripIdeWrappers(text: string): string {
  let result = text.trim()

  // 1. Strip entire tag+content blocks
  for (const re of STRIP_RES) {
    re.lastIndex = 0
    result = result.replace(re, "")
  }

  // 2. Unwrap: remove tags, keep inner text
  for (let i = 0; i < UNWRAP_TAGS.length; i++) {
    result = result.replace(UNWRAP_OPEN_RES[i], "")
    result = result.replace(UNWRAP_CLOSE_RES[i], "")
  }

  // 3. Clean up orphaned closing tags
  result = result.replace(ORPHANED_CLOSE_RE, "")

  return result.trim()
}

function contentSignature(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content.slice(0, 100)
  return content
    .map((b) => `${b.type}:${(b.text || b.name || "").slice(0, 40)}`)
    .join("|")
}

/**
 * Extract text from a tool_result block's content (string or array of blocks).
 */
function extractToolResultText(block: ContentBlock): string {
  const bc = block.content
  if (typeof bc === "string") return bc
  if (Array.isArray(bc)) {
    return bc
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join(" ")
  }
  return ""
}

/**
 * Extract the developer's answer from AskUserQuestion tool_result.
 * Format: 'User has answered your questions: "Q1?"="Answer1". ...'
 * Returns the answer text, or null if not an AskUserQuestion result.
 */
const USER_ANSWERED_RE = /^User has answered your questions:\s*/
const ANSWER_PAIR_RE = /"[^"]*?"\s*=\s*"([^"]*?)"/g

function extractUserAnswer(resultText: string): string | null {
  if (!USER_ANSWERED_RE.test(resultText)) return null

  // Extract all answer values from "question"="answer" pairs
  const answers: string[] = []
  let m: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
  while ((m = ANSWER_PAIR_RE.exec(resultText)) !== null) {
    const answer = m[1].trim()
    if (answer) answers.push(answer)
  }

  return answers.length > 0 ? answers.join("\n") : null
}

/**
 * Detect serialized conversation arrays embedded as strings.
 * Cline/Roo Code stores conversations as JSON arrays of {role, content} objects.
 */
const SERIALIZED_CONVERSATION_RE = /^\s*\[\s*\{\s*"role"\s*:/

function tryParseSerializedConversation(
  text: string,
): Array<{ role: string; content: unknown }> | null {
  if (!SERIALIZED_CONVERSATION_RE.test(text)) return null
  try {
    const parsed = JSON.parse(text)
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      typeof parsed[0] === "object" &&
      "role" in parsed[0] &&
      "content" in parsed[0]
    ) {
      return parsed
    }
  } catch {
    // Not valid JSON — treat as plain text
  }
  return null
}

/**
 * Extract only the human-authored text from a serialized conversation array.
 * Keeps user text blocks and strips assistant responses (code, file content).
 */
function extractUserTextFromConversation(
  messages: Array<{ role: string; content: unknown }>,
): string {
  const userTexts: string[] = []

  for (const msg of messages) {
    if (msg.role !== "user") continue

    if (typeof msg.content === "string") {
      userTexts.push(msg.content)
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content as ContentBlock[]) {
        if (block.type === "text" && block.text) {
          userTexts.push(block.text)
        }
        // Skip tool_result blocks — code/file output, not human speech
        // Exception: "User has answered" responses from AskUserQuestion
        if (block.type === "tool_result") {
          const resultText = extractToolResultText(block)
          const answer = extractUserAnswer(resultText)
          if (answer) userTexts.push(answer)
        }
      }
    }
  }

  return userTexts.join("\n")
}

function parseTurn(
  role: "user" | "assistant",
  content: string | ContentBlock[],
): TranscriptTurn {
  if (typeof content === "string") {
    const trimmed = content.trim()
    // Parse serialized conversation arrays (Cline/Roo Code format) —
    // extract only user text, discard assistant code/file content
    const conversation = tryParseSerializedConversation(trimmed)
    if (conversation) {
      const userText = extractUserTextFromConversation(conversation)
      return { role, content: userText.trim() }
    }
    return { role, content: trimmed }
  }

  let text = ""
  const toolUse: NonNullable<TranscriptTurn["toolUse"]> = []
  const toolResults: NonNullable<TranscriptTurn["toolResults"]> = []

  for (const block of content) {
    if (block.type === "text" && block.text) {
      text += (text ? "\n" : "") + block.text.trim()
    } else if (block.type === "tool_use" && block.name) {
      toolUse.push({
        name: block.name,
        input: JSON.stringify(block.input || {}),
      })
    } else if (block.type === "tool_result") {
      const resultText = extractToolResultText(block)
      toolResults.push({
        content: resultText.slice(0, 200),
        isError: block.is_error || false,
      })
      // Promote user answers from AskUserQuestion into main text —
      // these are actual developer decisions, not tool output
      const userAnswer = extractUserAnswer(resultText)
      if (userAnswer) {
        text += (text ? "\n" : "") + userAnswer
      }
    }
  }

  return {
    role,
    content: text,
    toolUse: toolUse.length ? toolUse : undefined,
    toolResults: toolResults.length ? toolResults : undefined,
  }
}
