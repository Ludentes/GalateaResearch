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
    if (turn.content || (turn.toolUse && turn.toolUse.length > 0)) {
      turns.push(turn)
    }
  }

  return turns
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
