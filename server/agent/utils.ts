/**
 * Format a duration in milliseconds to a human-readable string.
 *
 * @example
 * formatDuration(0) => "0ms"
 * formatDuration(500) => "500ms"
 * formatDuration(45000) => "45s"
 * formatDuration(150000) => "2m 30s"
 * formatDuration(3930000) => "1h 5m 30s"
 */
export function formatDuration(ms: number): string {
  if (ms === 0) {
    return "0ms"
  }

  if (ms < 1000) {
    return `${ms}ms`
  }

  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)

  const parts: string[] = []

  if (hours > 0) {
    parts.push(`${hours}h`)
  }

  if (minutes > 0) {
    parts.push(`${minutes}m`)
  }

  if (seconds > 0) {
    parts.push(`${seconds}s`)
  }

  return parts.join(" ")
}
