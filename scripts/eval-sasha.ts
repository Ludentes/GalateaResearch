/**
 * eval-sasha.ts
 *
 * Runs the full extraction pipeline on Sasha's sessions (new dev, unseen data).
 * Filters out PM app sessions automatically.
 * Writes all extracted entries to a separate store so we don't pollute dev stores.
 *
 * Usage:
 *   pnpm tsx scripts/eval-sasha.ts [--sessions-dir <dir>] [--store <path>]
 *
 * Env: OPENROUTER_API_KEY required for cloud extraction.
 */
import { config } from "dotenv"

config({ override: true })

import { existsSync, mkdirSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { parseArgs } from "node:util"
import { runExtraction } from "../server/memory/extraction-pipeline"
import { createOpenRouterModel } from "../server/providers/openrouter"

const { values } = parseArgs({
  options: {
    "sessions-dir": {
      type: "string",
      default: "data/otherdevs/sasha",
    },
    store: {
      type: "string",
      default: "data/sasha-eval/entries.jsonl",
    },
    model: {
      type: "string",
      default: "anthropic/claude-haiku-4.5",
    },
    "dry-run": { type: "boolean", default: false },
  },
})

const APP_RE = /^\s*<(system|user)\b/i

async function getFirstUserText(filePath: string): Promise<string | null> {
  const raw = await readFile(filePath, "utf-8")
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue
    try {
      const d = JSON.parse(line)
      if (d.type !== "user") continue
      const content = d.message?.content
      if (typeof content === "string") return content
      if (Array.isArray(content)) {
        for (const b of content) {
          if (b?.type === "text" && b.text) return b.text
        }
      }
    } catch {}
  }
  return null
}

async function hasToolUse(filePath: string): Promise<boolean> {
  const raw = await readFile(filePath, "utf-8")
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue
    try {
      const d = JSON.parse(line)
      if (d.type !== "assistant") continue
      const content = d.message?.content
      if (!Array.isArray(content)) continue
      for (const b of content) {
        if (b?.type === "tool_use") return true
      }
    } catch {}
  }
  return false
}

async function collectDevSessions(sessionsDir: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises")
  const results: string[] = []

  const projectDirs = await readdir(sessionsDir, { withFileTypes: true })
  for (const pd of projectDirs) {
    if (!pd.isDirectory()) continue
    const projectPath = path.join(sessionsDir, pd.name)
    const files = await readdir(projectPath)
    for (const fname of files) {
      if (!fname.endsWith(".jsonl")) continue
      const fpath = path.join(projectPath, fname)
      const [firstUser, hasTool] = await Promise.all([
        getFirstUserText(fpath),
        hasToolUse(fpath),
      ])
      if (!hasTool) continue
      if (firstUser && APP_RE.test(firstUser)) continue
      results.push(fpath)
    }
  }

  return results.sort()
}

async function main() {
  const sessionsDir = path.resolve(values["sessions-dir"]!)
  const storePath = path.resolve(values.store!)
  const modelId = values.model!
  const dryRun = values["dry-run"]!

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY is required")
    process.exit(1)
  }

  console.log(`Scanning for dev sessions in: ${sessionsDir}`)
  const sessions = await collectDevSessions(sessionsDir)
  console.log(`Found ${sessions.length} real dev sessions\n`)

  if (dryRun) {
    console.log("DRY RUN — sessions that would be processed:")
    for (const s of sessions) console.log(`  ${s}`)
    return
  }

  // Ensure store directory exists
  const storeDir = path.dirname(storePath)
  if (!existsSync(storeDir)) mkdirSync(storeDir, { recursive: true })

  const model = createOpenRouterModel(modelId, apiKey)
  console.log(`Model: ${modelId}`)
  console.log(`Store: ${storePath}\n`)
  console.log("=".repeat(60))

  let totalEntries = 0
  let totalTurns = 0

  for (const [i, sessionPath] of sessions.entries()) {
    const sessionName = path
      .relative(sessionsDir, sessionPath)
      .replace(/\.jsonl$/, "")
    console.log(`\n[${i + 1}/${sessions.length}] ${sessionName}`)

    try {
      const result = await runExtraction({
        transcriptPath: sessionPath,
        model,
        storePath,
        force: false,
      })

      if (result.stats.skippedAlreadyExtracted) {
        console.log("  (already extracted, skipping)")
        continue
      }

      const {
        turnsProcessed,
        signalTurns,
        entriesExtracted,
        duplicatesSkipped,
      } = result.stats
      console.log(`  turns: ${turnsProcessed} total, ${signalTurns} signal`)
      console.log(
        `  entries: ${entriesExtracted} extracted, ${duplicatesSkipped} dedup skipped, ${result.entries.length} new`,
      )
      totalEntries += result.entries.length
      totalTurns += turnsProcessed

      for (const e of result.entries) {
        console.log(`    [${e.type}] ${e.content}`)
      }
    } catch (err) {
      console.error(`  ERROR: ${err}`)
    }
  }

  console.log(`\n${"=".repeat(60)}`)
  console.log(
    `TOTAL: ${sessions.length} sessions, ${totalTurns} turns, ${totalEntries} new entries`,
  )
  console.log(`Store: ${storePath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
