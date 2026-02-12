#!/usr/bin/env -S pnpm tsx
/**
 * Claude Code SessionEnd hook — auto-extract knowledge from completed sessions.
 *
 * Receives JSON on stdin: { session_id, transcript_path, cwd, ... }
 * Runs extraction pipeline on the transcript.
 * Tracks extraction state to avoid re-processing.
 */
import path from "node:path"
import { existsSync } from "node:fs"
import { appendFile, mkdir } from "node:fs/promises"

// Read hook input from stdin
const input = await new Promise<string>((resolve) => {
  let data = ""
  process.stdin.on("data", (chunk) => (data += chunk))
  process.stdin.on("end", () => resolve(data))
})

const hookData = JSON.parse(input)
const { session_id, transcript_path, cwd } = hookData

const LOG_FILE = path.join(
  process.env.HOME || "~",
  ".claude",
  "state",
  "auto-extract.log",
)

async function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  await mkdir(path.dirname(LOG_FILE), { recursive: true })
  await appendFile(LOG_FILE, line)
}

try {
  // Resolve project root from cwd or transcript path
  const projectRoot = cwd || path.dirname(path.dirname(transcript_path))
  const storePath = path.join(projectRoot, "data/memory/entries.jsonl")
  const statePath = path.join(projectRoot, "data/memory/extraction-state.json")

  // Dynamic imports — relative to project root
  const { isSessionExtracted, markSessionExtracted } = await import(
    path.join(projectRoot, "server/memory/extraction-state")
  )
  const { runExtraction } = await import(
    path.join(projectRoot, "server/memory/extraction-pipeline")
  )
  const { createOllamaModel } = await import(
    path.join(projectRoot, "server/providers/ollama")
  )

  // Check if already extracted
  if (await isSessionExtracted(session_id, statePath)) {
    await log(`Skip: ${session_id} already extracted`)
    process.exit(0)
  }

  // Check transcript exists
  if (!transcript_path || !existsSync(transcript_path)) {
    await log(`Skip: no transcript at ${transcript_path}`)
    process.exit(0)
  }

  await log(`Extracting: ${session_id} from ${transcript_path}`)

  const model = createOllamaModel(
    process.env.LLM_MODEL || "glm-4.7-flash:latest",
    process.env.OLLAMA_BASE_URL || "http://localhost:11434",
  )

  const result = await runExtraction({
    transcriptPath: transcript_path,
    model,
    storePath,
  })

  await markSessionExtracted(session_id, {
    entriesCount: result.entries.length,
    transcriptPath: transcript_path,
    statePath,
  })

  await log(
    `Done: ${session_id} — ${result.entries.length} new entries ` +
      `(${result.stats.turnsProcessed} turns, ${result.stats.duplicatesSkipped} dupes)`,
  )

  // Output for Claude Code
  console.log(
    JSON.stringify({
      continue: true,
      reason: `Extracted ${result.entries.length} knowledge entries`,
    }),
  )
} catch (err) {
  await log(`Error: ${session_id} — ${err}`)
  // Don't block session end on extraction failure
  process.exit(0)
}
