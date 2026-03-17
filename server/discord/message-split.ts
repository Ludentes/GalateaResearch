const DEFAULT_MAX_LENGTH = 1900

/**
 * Split a message into chunks that fit within Discord's 2000-char limit.
 * Tries paragraph breaks first, then line breaks, then hard-cuts.
 */
export function splitMessage(
  text: string,
  maxLength = DEFAULT_MAX_LENGTH,
): string[] {
  if (!text.trim()) return []
  if (text.length <= maxLength) return [text]

  // Try paragraph splits first
  const paragraphs = text.split(/\n\n+/)
  const chunks = mergeChunks(paragraphs, maxLength, "\n\n")

  // For any chunk still too long, split on line breaks
  const refined: string[] = []
  for (const chunk of chunks) {
    if (chunk.length <= maxLength) {
      refined.push(chunk)
    } else {
      const lines = chunk.split(/\n/)
      refined.push(...mergeChunks(lines, maxLength, "\n"))
    }
  }

  // Hard-cut anything still too long
  const result: string[] = []
  for (const chunk of refined) {
    if (chunk.length <= maxLength) {
      result.push(chunk)
    } else {
      for (let i = 0; i < chunk.length; i += maxLength) {
        result.push(chunk.slice(i, i + maxLength))
      }
    }
  }

  return result.map((c) => c.trim()).filter(Boolean)
}

/**
 * Merge small segments into chunks that fit within maxLength,
 * joining with the given separator.
 */
function mergeChunks(
  segments: string[],
  maxLength: number,
  separator: string,
): string[] {
  const chunks: string[] = []
  let current = ""

  for (const segment of segments) {
    const trimmed = segment.trim()
    if (!trimmed) continue

    if (!current) {
      current = trimmed
    } else if (
      current.length + separator.length + trimmed.length <=
      maxLength
    ) {
      current += separator + trimmed
    } else {
      chunks.push(current)
      current = trimmed
    }
  }

  if (current) chunks.push(current)
  return chunks
}
