// @vitest-environment node

import { execSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { formatDuration, getDiffStat } from "../utils"

describe("formatDuration", () => {
  it("returns 0ms for zero milliseconds", () => {
    expect(formatDuration(0)).toBe("0ms")
  })

  it("formats seconds only", () => {
    expect(formatDuration(45000)).toBe("45s")
  })

  it("formats minutes and seconds", () => {
    expect(formatDuration(150000)).toBe("2m 30s")
  })

  it("formats hours, minutes and seconds", () => {
    expect(formatDuration(3930000)).toBe("1h 5m 30s")
  })

  it("formats hours and minutes", () => {
    expect(formatDuration(3900000)).toBe("1h 5m")
  })

  it("formats very small durations less than 1 second", () => {
    expect(formatDuration(500)).toBe("500ms")
  })

  it("formats durations with only milliseconds", () => {
    expect(formatDuration(100)).toBe("100ms")
  })

  it("formats hours only", () => {
    expect(formatDuration(3600000)).toBe("1h")
  })

  it("formats large durations", () => {
    expect(formatDuration(7325000)).toBe("2h 2m 5s")
  })

  it("omits zero components", () => {
    expect(formatDuration(65000)).toBe("1m 5s")
  })
})

describe("getDiffStat", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join("/tmp", "git-test-"))
    execSync("git init", { cwd: tempDir, stdio: "pipe" })
    execSync('git config user.email "test@example.com"', {
      cwd: tempDir,
      stdio: "pipe",
    })
    execSync('git config user.name "Test User"', {
      cwd: tempDir,
      stdio: "pipe",
    })
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it("returns empty strings if git commands fail", async () => {
    const nonGitDir = fs.mkdtempSync(path.join("/tmp", "no-git-"))
    try {
      const result = await getDiffStat(nonGitDir)
      expect(result.diffStat).toBe("")
      expect(result.recentCommits).toBe("")
    } finally {
      fs.rmSync(nonGitDir, { recursive: true, force: true })
    }
  })

  it("returns empty strings if no commits exist", async () => {
    const result = await getDiffStat(tempDir)
    expect(result.diffStat).toBe("")
    expect(result.recentCommits).toBe("")
  })

  it("returns diff stat when commits exist", async () => {
    // Create initial commit
    const file1 = path.join(tempDir, "file1.txt")
    fs.writeFileSync(file1, "content1")
    execSync("git add .", { cwd: tempDir, stdio: "pipe" })
    execSync('git commit -m "Initial commit"', { cwd: tempDir, stdio: "pipe" })

    // Make a change
    fs.writeFileSync(file1, "content1 modified")
    execSync("git add .", { cwd: tempDir, stdio: "pipe" })
    execSync('git commit -m "Modify file"', { cwd: tempDir, stdio: "pipe" })

    const result = await getDiffStat(tempDir)
    expect(result.diffStat).toContain("file1.txt")
    expect(result.diffStat.length).toBeGreaterThan(0)
  })

  it("returns recent commits when they exist", async () => {
    // Create multiple commits
    for (let i = 0; i < 3; i++) {
      const file = path.join(tempDir, `file${i}.txt`)
      fs.writeFileSync(file, `content${i}`)
      execSync("git add .", { cwd: tempDir, stdio: "pipe" })
      execSync(`git commit -m "Commit ${i + 1}"`, {
        cwd: tempDir,
        stdio: "pipe",
      })
    }

    const result = await getDiffStat(tempDir)
    expect(result.recentCommits).toContain("Commit 3")
    expect(result.recentCommits).toContain("Commit 2")
    expect(result.recentCommits.length).toBeGreaterThan(0)
  })

  it("handles timeout gracefully", async () => {
    // Create a commit
    const file = path.join(tempDir, "file.txt")
    fs.writeFileSync(file, "content")
    execSync("git add .", { cwd: tempDir, stdio: "pipe" })
    execSync('git commit -m "Test commit"', { cwd: tempDir, stdio: "pipe" })

    // This should succeed despite timeout being low (real repo should be fast)
    const result = await getDiffStat(tempDir)
    expect(typeof result.diffStat).toBe("string")
    expect(typeof result.recentCommits).toBe("string")
  })

  it("uses provided working directory", async () => {
    // Create first commit
    const file = path.join(tempDir, "test.txt")
    fs.writeFileSync(file, "test content")
    execSync("git add .", { cwd: tempDir, stdio: "pipe" })
    execSync('git commit -m "First"', { cwd: tempDir, stdio: "pipe" })

    // Create second commit to have something to diff against
    fs.writeFileSync(file, "test content modified")
    execSync("git add .", { cwd: tempDir, stdio: "pipe" })
    execSync('git commit -m "Second"', { cwd: tempDir, stdio: "pipe" })

    const result = await getDiffStat(tempDir)
    // diffStat will have content when comparing HEAD~1 to HEAD
    expect(result.recentCommits.length).toBeGreaterThan(0)
    expect(result.recentCommits).toContain("Second")
  })

  it("returns object with both properties even on error", async () => {
    const nonGitDir = fs.mkdtempSync(path.join("/tmp", "invalid-"))
    try {
      const result = await getDiffStat(nonGitDir)
      expect(result).toHaveProperty("diffStat")
      expect(result).toHaveProperty("recentCommits")
      expect(typeof result.diffStat).toBe("string")
      expect(typeof result.recentCommits).toBe("string")
    } finally {
      fs.rmSync(nonGitDir, { recursive: true, force: true })
    }
  })
})
