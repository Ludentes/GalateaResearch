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
export function stripIdeWrappers(text: string): string {
  let result = text.trim()

  // Strip IDE system event blocks (both whole-message and inline)
  result = result.replace(/<ide_opened_file>[\s\S]*?<\/ide_opened_file>/gi, "")
  result = result.replace(/<ide_selection>[\s\S]*?<\/ide_selection>/gi, "")

  // Strip tool/completion wrapper blocks
  result = result.replace(/<attempt_completion>[\s\S]*?<\/attempt_completion>/gi, "")
  result = result.replace(/<result>[\s\S]*?<\/result>/gi, "")

  // Strip Cline/Roo Code wrapper blocks
  result = result.replace(/<environment_details>[\s\S]*?<\/environment_details>/gi, "")
  result = result.replace(/<todos>[\s\S]*?<\/todos>/gi, "")
  result = result.replace(/<update_todo_list>[\s\S]*?<\/update_todo_list>/gi, "")
  result = result.replace(/<question>[\s\S]*?<\/question>/gi, "")
  result = result.replace(/<follow_up>[\s\S]*?<\/follow_up>/gi, "")
  result = result.replace(/<suggest[^>]*>[\s\S]*?<\/suggest>/gi, "")

  // Extract inner content from wrapper tags
  result = result.replace(/<feedback>\s*/gi, "").replace(/\s*<\/feedback>/gi, "")
  result = result.replace(/<task>\s*/gi, "").replace(/\s*<\/task>/gi, "")
  result = result
    .replace(/<command-message>[\s\S]*?<\/command-message>/gi, "")
    .replace(/<command-name>[\s\S]*?<\/command-name>/gi, "")
    .replace(/<command-args>[\s\S]*?<\/command-args>/gi, "")

  // Clean up orphaned closing tags (from incomplete wrappers)
  result = result.replace(/<\/ide_opened_file>/gi, "")
  result = result.replace(/<\/ide_selection>/gi, "")
  result = result.replace(/<\/attempt_completion>/gi, "")
  result = result.replace(/<\/result>/gi, "")
  result = result.replace(/<\/feedback>/gi, "")
  result = result.replace(/<\/task>/gi, "")
  result = result.replace(/<\/environment_details>/gi, "")
  result = result.replace(/<\/todos>/gi, "")
  result = result.replace(/<\/update_todo_list>/gi, "")
  result = result.replace(/<\/question>/gi, "")
  result = result.replace(/<\/follow_up>/gi, "")
  result = result.replace(/<\/suggest>/gi, "")

  return result.trim()
}

function contentSignature(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content.slice(0, 100)
  return content
    .map((b) => `${b.type}:${(b.text || b.name || "").slice(0, 40)}`)
    .join("|")
}

function parseTurn(
  role: "user" | "assistant",
  content: string | ContentBlock[],
): TranscriptTurn {
  if (typeof content === "string") {
    return { role, content: content.trim() }
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
      const resultText =
        typeof block.content === "string"
          ? block.content
          : Array.isArray(block.content)
            ? block.content
                .filter((b) => b.type === "text")
                .map((b) => b.text || "")
                .join(" ")
            : ""
      toolResults.push({
        content: resultText.slice(0, 200),
        isError: block.is_error || false,
      })
    }
  }

  return {
    role,
    content: text,
    toolUse: toolUse.length ? toolUse : undefined,
    toolResults: toolResults.length ? toolResults : undefined,
  }
}
