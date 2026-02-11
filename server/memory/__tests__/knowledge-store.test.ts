// @vitest-environment node
import { existsSync, rmSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  appendEntries,
  appendEntry,
  isDuplicate,
  readEntries,
  renderMarkdown,
} from "../knowledge-store"
import type { KnowledgeEntry } from "../types"

const TEST_DIR = path.join(__dirname, "fixtures", "test-store")
const TEST_STORE = path.join(TEST_DIR, "entries.jsonl")
const TEST_MD = path.join(TEST_DIR, "knowledge.md")

const sampleEntry: KnowledgeEntry = {
  id: "test-1",
  type: "preference",
  content: "User prefers pnpm over npm",
  confidence: 0.95,
  entities: ["pnpm", "npm"],
  evidence: "User said: always use pnpm",
  source: "session:abc123",
  extractedAt: "2026-02-11T10:00:00Z",
}

describe("Knowledge Store", () => {
  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  it("readEntries returns empty array for non-existent file", async () => {
    const entries = await readEntries(TEST_STORE)
    expect(entries).toEqual([])
  })

  it("appendEntry creates file and writes entry", async () => {
    await appendEntry(sampleEntry, TEST_STORE)
    const entries = await readEntries(TEST_STORE)
    expect(entries).toHaveLength(1)
    expect(entries[0].content).toBe("User prefers pnpm over npm")
  })

  it("appendEntries writes multiple entries", async () => {
    const entry2: KnowledgeEntry = {
      ...sampleEntry,
      id: "test-2",
      type: "fact",
      content: "Project uses PostgreSQL",
      entities: ["PostgreSQL"],
    }
    await appendEntries([sampleEntry, entry2], TEST_STORE)
    const entries = await readEntries(TEST_STORE)
    expect(entries).toHaveLength(2)
  })

  it("isDuplicate detects similar content with overlapping entities", () => {
    const candidate: KnowledgeEntry = {
      ...sampleEntry,
      id: "test-new",
      content: "User prefers pnpm instead of npm",
    }
    expect(isDuplicate(candidate, [sampleEntry])).toBe(true)
  })

  it("isDuplicate allows different topics", () => {
    const candidate: KnowledgeEntry = {
      ...sampleEntry,
      id: "test-new",
      content: "PostgreSQL runs on port 5432",
      entities: ["PostgreSQL"],
    }
    expect(isDuplicate(candidate, [sampleEntry])).toBe(false)
  })

  it("renderMarkdown produces structured sections", async () => {
    const entries: KnowledgeEntry[] = [
      sampleEntry,
      {
        ...sampleEntry,
        id: "t2",
        type: "rule",
        content: "Never commit .env files",
        entities: [".env"],
        confidence: 1.0,
      },
      {
        ...sampleEntry,
        id: "t3",
        type: "fact",
        content: "Uses TanStack Start",
        entities: ["TanStack"],
        confidence: 0.9,
      },
    ]
    const md = await renderMarkdown(entries, TEST_MD)
    expect(md).toContain("## Preferences")
    expect(md).toContain("User prefers pnpm over npm")
    expect(md).toContain("## Rules")
    expect(md).toContain("Never commit .env files")
    expect(md).toContain("## Facts")
  })

  it("renderMarkdown excludes superseded entries", async () => {
    const entries: KnowledgeEntry[] = [
      { ...sampleEntry, supersededBy: "test-2" },
      {
        ...sampleEntry,
        id: "test-2",
        content: "User strongly prefers pnpm",
        confidence: 1.0,
      },
    ]
    const md = await renderMarkdown(entries, TEST_MD)
    expect(md).not.toContain("User prefers pnpm over npm")
    expect(md).toContain("User strongly prefers pnpm")
  })
})
