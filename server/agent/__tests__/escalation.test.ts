// @vitest-environment node
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  checkForEscalation,
  cleanupEscalation,
  type EscalationRequest,
  isValidEscalation,
  parseEscalationFile,
} from "../escalation"

const validRequest: EscalationRequest = {
  taskId: "task-123",
  agentId: "beki",
  reason: "Cannot find API docs for payment service",
  category: "knowledge_gap",
  timestamp: "2026-03-16T12:00:00Z",
}

describe("isValidEscalation", () => {
  it("returns true for a valid escalation request", () => {
    expect(isValidEscalation(validRequest)).toBe(true)
  })

  it("returns true when optional dimensions are present", () => {
    const withDimensions = {
      ...validRequest,
      dimensions: { knowledge_sufficiency: "LOW" },
    }
    expect(isValidEscalation(withDimensions)).toBe(true)
  })

  it("returns false for null", () => {
    expect(isValidEscalation(null)).toBe(false)
  })

  it("returns false for undefined", () => {
    expect(isValidEscalation(undefined)).toBe(false)
  })

  it("returns false for a string", () => {
    expect(isValidEscalation("not an object")).toBe(false)
  })

  it("returns false when taskId is missing", () => {
    const { taskId, ...rest } = validRequest
    expect(isValidEscalation(rest)).toBe(false)
  })

  it("returns false when agentId is missing", () => {
    const { agentId, ...rest } = validRequest
    expect(isValidEscalation(rest)).toBe(false)
  })

  it("returns false when reason is missing", () => {
    const { reason, ...rest } = validRequest
    expect(isValidEscalation(rest)).toBe(false)
  })

  it("returns false when category is missing", () => {
    const { category, ...rest } = validRequest
    expect(isValidEscalation(rest)).toBe(false)
  })

  it("returns false when timestamp is missing", () => {
    const { timestamp, ...rest } = validRequest
    expect(isValidEscalation(rest)).toBe(false)
  })

  it("returns false when a field has wrong type", () => {
    expect(isValidEscalation({ ...validRequest, taskId: 123 })).toBe(false)
  })
})

describe("parseEscalationFile", () => {
  it("parses valid JSON into an EscalationRequest", () => {
    const json = JSON.stringify(validRequest)
    const result = parseEscalationFile(json)
    expect(result).toEqual(validRequest)
  })

  it("returns null for invalid JSON", () => {
    expect(parseEscalationFile("{broken")).toBeNull()
  })

  it("returns null for valid JSON that is not an escalation", () => {
    expect(parseEscalationFile('{"foo":"bar"}')).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(parseEscalationFile("")).toBeNull()
  })
})

describe("escalation file operations", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "escalation-test-"))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("reads escalation file from .escalations dir", async () => {
    const escDir = path.join(tmpDir, ".escalations")
    await mkdir(escDir, { recursive: true })
    await writeFile(
      path.join(escDir, "task-123.json"),
      JSON.stringify({
        taskId: "task-123",
        agentId: "beki",
        reason: "Need help",
        category: "knowledge_gap",
        timestamp: new Date().toISOString(),
      }),
    )

    const result = await checkForEscalation(tmpDir, "task-123")
    expect(result).not.toBeNull()
    expect(result!.reason).toBe("Need help")
  })

  it("returns null when no escalation file exists", async () => {
    const result = await checkForEscalation(tmpDir, "task-999")
    expect(result).toBeNull()
  })

  it("cleans up escalation file after reading", async () => {
    const escDir = path.join(tmpDir, ".escalations")
    await mkdir(escDir, { recursive: true })
    const filePath = path.join(escDir, "task-123.json")
    await writeFile(
      filePath,
      JSON.stringify({
        taskId: "task-123",
        agentId: "beki",
        reason: "Need help",
        category: "blocked",
        timestamp: new Date().toISOString(),
      }),
    )

    await cleanupEscalation(tmpDir, "task-123")
    expect(existsSync(filePath)).toBe(false)
  })

  it("cleanupEscalation is safe when file doesnt exist", async () => {
    // Should not throw
    await cleanupEscalation(tmpDir, "nonexistent")
  })
})
