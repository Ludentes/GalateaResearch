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

/**
 * Get git diff stats and recent commits from a working directory.
 * Returns empty strings if git commands fail.
 *
 * @param workDir - The working directory to run git commands in
 * @returns Object with diffStat (from "git diff --stat HEAD~1") and
 *          recentCommits (from "git log --oneline -3")
 * @example
 * const { diffStat, recentCommits } = await getDiffStat("/path/to/repo")
 * // diffStat: "file1.txt | 5 +++++\n file2.ts | 10 +-------"
 * // recentCommits: "abc1234 Fix bug\ndef5678 Add feature\n..."
 */
export async function getDiffStat(
  workDir: string,
): Promise<{ diffStat: string; recentCommits: string }> {
  const { execSync } = await import("node:child_process")

  const diffStat = (() => {
    try {
      return execSync("git diff --stat HEAD~1", {
        cwd: workDir,
        encoding: "utf-8",
        timeout: 5000,
      }).trim()
    } catch {
      return ""
    }
  })()

  const recentCommits = (() => {
    try {
      return execSync("git log --oneline -3", {
        cwd: workDir,
        encoding: "utf-8",
        timeout: 5000,
      }).trim()
    } catch {
      return ""
    }
  })()

  return { diffStat, recentCommits }
}
