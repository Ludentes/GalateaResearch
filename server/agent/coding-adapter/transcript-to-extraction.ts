import type { TranscriptTurn } from "../../memory/types"
import type { CodingTranscriptEntry } from "./types"

/**
 * Convert CodingTranscriptEntry[] from an adapter session into
 * TranscriptTurn[] compatible with the extraction pipeline.
 *
 * The extraction pipeline expects turns with role + content.
 * Tool calls are folded into the preceding assistant turn as context.
 */
export function transcriptToTurns(
  transcript: CodingTranscriptEntry[],
): TranscriptTurn[] {
  if (transcript.length === 0) return []

  const turns: TranscriptTurn[] = []

  for (const entry of transcript) {
    if (entry.role === "assistant") {
      turns.push({
        role: "assistant",
        content: entry.content,
      })
    } else if (entry.role === "tool_call") {
      const toolContext = entry.toolName
        ? `[Tool: ${entry.toolName}] ${entry.content}`
        : entry.content
      turns.push({
        role: "user",
        content: toolContext,
      })
    } else if (entry.role === "tool_result") {
      const resultContext = entry.toolName
        ? `[Result: ${entry.toolName}] ${entry.content}`
        : entry.content
      turns.push({
        role: "user",
        content: resultContext,
      })
    }
  }

  return turns
}
