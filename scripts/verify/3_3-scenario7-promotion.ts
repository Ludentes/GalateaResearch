import { existsSync, readFileSync, rmSync } from "node:fs"
import {
  consolidateToClaudeMd,
  findConsolidationCandidates,
} from "../../server/memory/consolidation"
import { appendEntries } from "../../server/memory/knowledge-store"

const storePath = "/tmp/galatea-scenario7/entries.jsonl"
const mdPath = "/tmp/galatea-scenario7/CLAUDE.md"

// Simulate 3 sessions observing same preference
await appendEntries(
  [
    {
      id: crypto.randomUUID(),
      type: "preference",
      content: "Use pnpm for package management",
      confidence: 0.9,
      entities: [],
      source: "session:day1",
      extractedAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      type: "preference",
      content: "Use pnpm for package management",
      confidence: 0.95,
      entities: [],
      source: "session:day3",
      extractedAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      type: "preference",
      content: "Use pnpm for package management",
      confidence: 0.88,
      entities: [],
      source: "session:day5",
      extractedAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      type: "fact",
      content: "One-off observation about debugging",
      confidence: 0.5,
      entities: [],
      source: "session:day2",
      extractedAt: new Date().toISOString(),
    },
  ],
  storePath,
)

const candidates = await findConsolidationCandidates(storePath)
console.log("Promotion candidates:", candidates.length)
console.log(
  "Promoted content:",
  candidates.map((c) => c.content),
)

const result = await consolidateToClaudeMd(storePath, mdPath)
console.log("Consolidated to CLAUDE.md:", result.consolidated, "entries")

if (existsSync(mdPath)) {
  const md = readFileSync(mdPath, "utf-8")
  console.log("CLAUDE.md contains pnpm:", md.includes("pnpm"))
  console.log("CLAUDE.md does NOT contain one-off:", !md.includes("debugging"))
}

rmSync("/tmp/galatea-scenario7", { recursive: true })
process.exit(0)
