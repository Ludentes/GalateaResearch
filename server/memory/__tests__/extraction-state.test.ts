// @vitest-environment node
import { existsSync, rmSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  getExtractionState,
  isSessionExtracted,
  markSessionExtracted,
} from "../extraction-state"

const TEST_STATE = path.join(__dirname, "fixtures", "test-state.json")

describe("Extraction State", () => {
  afterEach(() => {
    if (existsSync(TEST_STATE)) rmSync(TEST_STATE)
  })

  it("returns empty state for non-existent file", async () => {
    const state = await getExtractionState(TEST_STATE)
    expect(state.sessions).toEqual({})
  })

  it("marks a session as extracted", async () => {
    await markSessionExtracted("session-abc", {
      entriesCount: 5,
      transcriptPath: "/tmp/session.jsonl",
      statePath: TEST_STATE,
    })
    const state = await getExtractionState(TEST_STATE)
    expect(state.sessions["session-abc"]).toBeDefined()
    expect(state.sessions["session-abc"].entriesCount).toBe(5)
    expect(state.sessions["session-abc"].extractedAt).toBeDefined()
  })

  it("detects already-extracted sessions", async () => {
    await markSessionExtracted("session-abc", {
      entriesCount: 3,
      transcriptPath: "/tmp/s.jsonl",
      statePath: TEST_STATE,
    })
    expect(await isSessionExtracted("session-abc", TEST_STATE)).toBe(true)
    expect(await isSessionExtracted("session-xyz", TEST_STATE)).toBe(false)
  })

  it("preserves existing state when adding new session", async () => {
    await markSessionExtracted("s1", {
      entriesCount: 2,
      transcriptPath: "/tmp/s1.jsonl",
      statePath: TEST_STATE,
    })
    await markSessionExtracted("s2", {
      entriesCount: 4,
      transcriptPath: "/tmp/s2.jsonl",
      statePath: TEST_STATE,
    })
    const state = await getExtractionState(TEST_STATE)
    expect(Object.keys(state.sessions)).toHaveLength(2)
  })
})
