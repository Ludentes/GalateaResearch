// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs"
import path from "node:path"
import { generateClaudeMd, generateSkillFiles, generateSubagentDefinitions } from "../artifact-generator"
import { appendEntries } from "../knowledge-store"
import type { KnowledgeEntry } from "../types"

const TEST_DIR = "data/test-artifact-gen"
const STORE_PATH = path.join(TEST_DIR, "entries.jsonl")
const OUTPUT_DIR = path.join(TEST_DIR, ".claude")

function makeEntry(
  content: string,
  type: KnowledgeEntry["type"],
  confidence: number,
): KnowledgeEntry {
  return {
    id: crypto.randomUUID(),
    type,
    content,
    confidence,
    entities: [],
    source: "test",
    extractedAt: new Date().toISOString(),
  }
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true })
  writeFileSync(STORE_PATH, "")
})

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
})

describe("generateClaudeMd", () => {
  it("generates CLAUDE.md with rules section from hard rules", async () => {
    await appendEntries(
      [
        makeEntry("Always use pnpm, never npm or yarn", "rule", 0.95),
        makeEntry("Check null on user objects before PR", "rule", 0.90),
        makeEntry("Use NativeWind for styling in Expo projects", "preference", 0.92),
      ],
      STORE_PATH,
    )

    const md = await generateClaudeMd({ storePath: STORE_PATH, outputDir: OUTPUT_DIR })

    expect(md).toContain("## Rules")
    expect(md).toContain("pnpm")
    expect(md).toContain("null")
    expect(existsSync(path.join(OUTPUT_DIR, "CLAUDE.md"))).toBe(true)
  })

  it("includes high-confidence preferences", async () => {
    await appendEntries(
      [
        makeEntry("Use shadcn/ui for all frontend components", "preference", 0.88),
        makeEntry("Prefer functional components over class components", "preference", 0.85),
      ],
      STORE_PATH,
    )

    const md = await generateClaudeMd({ storePath: STORE_PATH, outputDir: OUTPUT_DIR })
    expect(md).toContain("## Preferences")
    expect(md).toContain("shadcn")
  })

  it("excludes low-confidence entries", async () => {
    await appendEntries(
      [
        makeEntry("Maybe use Tailwind?", "preference", 0.3),
        makeEntry("Always use TypeScript", "rule", 0.95),
      ],
      STORE_PATH,
    )

    const md = await generateClaudeMd({ storePath: STORE_PATH, outputDir: OUTPUT_DIR })
    expect(md).not.toContain("Maybe use Tailwind")
    expect(md).toContain("TypeScript")
  })

  it("excludes superseded entries", async () => {
    const entries = [
      makeEntry("Use npm", "preference", 0.9),
      makeEntry("Use pnpm", "preference", 0.95),
    ]
    entries[0].supersededBy = entries[1].id
    await appendEntries(entries, STORE_PATH)

    const md = await generateClaudeMd({ storePath: STORE_PATH, outputDir: OUTPUT_DIR })
    expect(md).not.toContain("Use npm")
    expect(md).toContain("pnpm")
  })

  it("includes procedures section", async () => {
    await appendEntries(
      [
        makeEntry(
          "To create an Expo screen: 1) Create file in app/(tabs)/ 2) Use functional component 3) Style with NativeWind",
          "procedure",
          0.92,
        ),
      ],
      STORE_PATH,
    )

    const md = await generateClaudeMd({ storePath: STORE_PATH, outputDir: OUTPUT_DIR })
    expect(md).toContain("## Procedures")
    expect(md).toContain("Expo screen")
  })
})

describe("generateSkillFiles", () => {
  it("generates skill file from high-confidence procedure", async () => {
    await appendEntries(
      [
        makeEntry(
          "To create an Expo screen: 1) Create file in app/(tabs)/<name>.tsx 2) Use functional component 3) Style with NativeWind 4) Add to router",
          "procedure",
          0.93,
        ),
      ],
      STORE_PATH,
    )

    const skills = await generateSkillFiles({ storePath: STORE_PATH, outputDir: OUTPUT_DIR })
    expect(skills.length).toBe(1)
    expect(existsSync(path.join(OUTPUT_DIR, "skills"))).toBe(true)

    const skillContent = readFileSync(
      path.join(OUTPUT_DIR, "skills", skills[0].filename),
      "utf-8",
    )
    expect(skillContent).toContain("Expo screen")
  })

  it("skips procedures below confidence threshold", async () => {
    await appendEntries(
      [makeEntry("Maybe do this thing", "procedure", 0.5)],
      STORE_PATH,
    )

    const skills = await generateSkillFiles({ storePath: STORE_PATH, outputDir: OUTPUT_DIR })
    expect(skills.length).toBe(0)
  })
})

describe("generateSubagentDefinitions", () => {
  it("generates subagent definition from review-specific procedures", async () => {
    await appendEntries(
      [
        makeEntry("Review PR: check for null safety violations", "procedure", 0.92),
        makeEntry("Review PR: verify test coverage for new functions", "procedure", 0.90),
        makeEntry("Review PR: check NativeWind class usage", "procedure", 0.88),
        makeEntry("Review PR: verify error handling in API calls", "procedure", 0.91),
        makeEntry("Review PR: check import organization", "procedure", 0.87),
      ],
      STORE_PATH,
    )

    const agents = await generateSubagentDefinitions({
      storePath: STORE_PATH,
      outputDir: OUTPUT_DIR,
      minProcedures: 3,
    })

    expect(agents.length).toBeGreaterThan(0)
    expect(existsSync(path.join(OUTPUT_DIR, "agents"))).toBe(true)

    const agentContent = readFileSync(
      path.join(OUTPUT_DIR, "agents", agents[0].filename),
      "utf-8",
    )
    expect(agentContent).toContain("Review")
    expect(agentContent).toContain("Read")
  })

  it("skips when insufficient procedures", async () => {
    await appendEntries(
      [makeEntry("Review PR: check null safety", "procedure", 0.9)],
      STORE_PATH,
    )

    const agents = await generateSubagentDefinitions({
      storePath: STORE_PATH,
      outputDir: OUTPUT_DIR,
      minProcedures: 3,
    })
    expect(agents.length).toBe(0)
  })
})
