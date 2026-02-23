/**
 * expand-gold.ts
 *
 * Processes additional session transcripts to expand the gold-standard dataset.
 * Uses the real pipeline logic: signal filtering → chunking → context → extraction.
 * Outputs real transcript turns as input (not reconstructed evidence).
 *
 * Usage:
 *   pnpm tsx experiments/extraction/expand-gold.ts
 *   pnpm tsx experiments/extraction/expand-gold.ts --sessions 8be0af56,c12c3462
 *   pnpm tsx experiments/extraction/expand-gold.ts --chunk-size 10
 *
 * Appends to gold-standard.jsonl (existing items preserved).
 */

import { appendFile, readFile, stat } from "node:fs/promises"
import { resolve } from "node:path"
import { config } from "dotenv"
config({ override: true })

import { generateObject } from "ai"
import { ollama } from "ai-sdk-ollama"
import { ExtractionSchema } from "../../server/memory/knowledge-extractor"
import { filterSignalTurns } from "../../server/memory/signal-classifier"
import { readTranscript } from "../../server/memory/transcript-reader"
import type { TranscriptTurn } from "../../server/memory/types"

const TRANSCRIPT_DIR =
  "/home/newub/.claude/projects/-home-newub-w-galatea"
const OUTPUT_PATH = resolve(import.meta.dirname, "gold-standard.jsonl")
const MODEL_ID = "gemma3:12b"

// Sessions to process — mid-sized ones with real content
const DEFAULT_SESSIONS = [
  "8be0af56-d09e-4821-b47e-3b475a548c72", // 312 turns
  "c12c3462-6840-4995-aafd-66264f340965", // 239 turns
  "515bba1a-13c0-470a-a3e3-759c0136f97f", // 338 turns
  "dd80b5a9-dfc9-4f37-936e-be1b515314e7", // 85 turns
  "0c7c0dce-f2d1-4a5f-aff5-e4867d4b63cf", // 1885 turns
]

interface GoldItem {
  input: Array<{ role: "user" | "assistant"; content: string }>
  expected: {
    items: Array<{
      type: string
      content: string
      confidence: number
      entities: string[]
      about?: { entity: string; type: string }
    }>
  }
  _meta: {
    source: string
    chunkIndex: number
    turnCount: number
    note: string
  }
}

// Parse CLI args
const args = process.argv.slice(2)
const chunkSize = args.includes("--chunk-size")
  ? Number(args[args.indexOf("--chunk-size") + 1])
  : 15
const sessionArg = args.includes("--sessions")
  ? args[args.indexOf("--sessions") + 1].split(",")
  : undefined
const maxChunks = args.includes("--max-chunks")
  ? Number(args[args.indexOf("--max-chunks") + 1])
  : undefined

const EXTRACTION_PROMPT = `You are a knowledge extraction system. Read this conversation transcript between a user and an AI coding assistant, and extract knowledge that would help a developer agent working on this project.

For each piece of knowledge, classify it:
- preference: user prefers X over Y
- fact: X is true about this project, team, or codebase
- rule: never do X, always do Y (hard constraint)
- procedure: step-by-step process for doing X
- correction: user corrected a mistake — extract the CORRECT answer
- decision: user chose X over alternatives

Rules for extraction:
- Only extract knowledge useful to a developer agent
- Skip greetings, confirmations, tool output noise, and meta-conversation
- Prefer explicit user statements over inferences
- For corrections, extract the RIGHT answer (not the wrong one)
- Merge related items (don't extract "uses TypeScript" and "prefers TypeScript" separately)
- Be conservative: when in doubt, don't extract
- Set confidence to 1.0 for explicit "I always/never/prefer" statements

Subject tagging (about field):
- Tag WHO or WHAT the knowledge is about
- "Mary prefers Discord" → about: {entity: "mary", type: "user"}
- "Never push to main" → about: {entity: "galatea", type: "project"} or omit (project is default)
- "Mobile apps need offline support" → about: {entity: "mobile-dev", type: "domain"}
- If the subject is the current project in general, omit the about field
- Use the person's first name (lowercase) as entity for user-specific knowledge
- When a user states a personal preference, tag it as about that user`

async function main() {
  const sessions = sessionArg || DEFAULT_SESSIONS
  const model = ollama(MODEL_ID)

  // Count existing items
  let existingCount = 0
  try {
    const existing = await readFile(OUTPUT_PATH, "utf-8")
    existingCount = existing.trim().split("\n").filter(Boolean).length
  } catch {
    // File doesn't exist yet
  }
  console.log(`[expand] Existing gold-standard items: ${existingCount}`)
  console.log(`[expand] Model: ${MODEL_ID}, chunk size: ${chunkSize}`)
  console.log(`[expand] Sessions to process: ${sessions.length}`)
  console.log()

  let totalAdded = 0
  let totalChunks = 0

  for (const sessionId of sessions) {
    const shortId = sessionId.slice(0, 8)
    const transcriptPath = resolve(TRANSCRIPT_DIR, `${sessionId}.jsonl`)

    // Check file exists
    try {
      await stat(transcriptPath)
    } catch {
      console.log(`[expand] ${shortId}: transcript not found, skipping`)
      continue
    }

    console.log(`[expand] ${shortId}: reading transcript...`)
    const allTurns = await readTranscript(transcriptPath)
    const signalTurns = filterSignalTurns(allTurns)
    console.log(
      `[expand] ${shortId}: ${allTurns.length} turns, ${signalTurns.length} signal`,
    )

    if (signalTurns.length === 0) {
      console.log(`[expand] ${shortId}: no signal turns, skipping`)
      continue
    }

    // Truncate long turns (assistant responses with code dumps, etc.)
    const MAX_TURN_CHARS = 500
    const truncatedAllTurns = allTurns.map((t) => ({
      ...t,
      content:
        t.content.length > MAX_TURN_CHARS
          ? t.content.slice(0, MAX_TURN_CHARS) + "..."
          : t.content,
    }))
    const truncatedSignalTurns = signalTurns.map((t) => ({
      ...t,
      content:
        t.content.length > MAX_TURN_CHARS
          ? t.content.slice(0, MAX_TURN_CHARS) + "..."
          : t.content,
    }))

    // Chunk signal turns with surrounding context
    const chunks: TranscriptTurn[][] = []
    for (let i = 0; i < truncatedSignalTurns.length; i += chunkSize) {
      const chunk = truncatedSignalTurns.slice(i, i + chunkSize)
      const withContext = addSurroundingContext(chunk, truncatedAllTurns)
      chunks.push(withContext)
    }

    const chunksToProcess = maxChunks
      ? chunks.slice(0, maxChunks)
      : chunks

    console.log(
      `[expand] ${shortId}: ${chunksToProcess.length} chunks to process`,
    )

    for (let ci = 0; ci < chunksToProcess.length; ci++) {
      const chunk = chunksToProcess[ci]
      totalChunks++

      const transcript = chunk
        .map((t) => {
          let line = `[${t.role.toUpperCase()}]: ${t.content}`
          if (t.toolUse) {
            for (const tool of t.toolUse) {
              line += `\n  [TOOL: ${tool.name} — ${tool.input.slice(0, 150)}]`
            }
          }
          return line
        })
        .join("\n\n")

      try {
        const { object } = await generateObject({
          model,
          schema: ExtractionSchema,
          prompt: `${EXTRACTION_PROMPT}\n\n---\n\nTRANSCRIPT:\n${transcript}`,
          temperature: 0,
          maxRetries: 0,
        })

        if (object.items.length === 0) {
          console.log(
            `[expand] ${shortId} chunk ${ci + 1}/${chunksToProcess.length}: 0 items (empty)`,
          )
          continue
        }

        // Build gold item with actual transcript turns as input
        const goldItem: GoldItem = {
          input: chunk.map((t) => ({
            role: t.role,
            content: t.content,
          })),
          expected: {
            items: object.items.map((item) => ({
              type: item.type,
              content: item.content,
              confidence: item.confidence,
              entities: item.entities,
              ...(item.about ? { about: item.about } : {}),
            })),
          },
          _meta: {
            source: `session:${sessionId}`,
            chunkIndex: ci,
            turnCount: chunk.length,
            note: "DRAFT — review and correct",
          },
        }

        await appendFile(OUTPUT_PATH, JSON.stringify(goldItem) + "\n")
        totalAdded++

        console.log(
          `[expand] ${shortId} chunk ${ci + 1}/${chunksToProcess.length}: ${object.items.length} items extracted`,
        )
      } catch (error) {
        console.error(
          `[expand] ${shortId} chunk ${ci + 1}/${chunksToProcess.length}: FAILED — ${error instanceof Error ? error.message : error}`,
        )
      }
    }
    console.log()
  }

  const finalCount = existingCount + totalAdded
  console.log("=" .repeat(60))
  console.log(`[expand] Done. Added ${totalAdded} items from ${totalChunks} chunks`)
  console.log(`[expand] Gold-standard now has ${finalCount} items total`)
  console.log()
  console.log("Next: review new items, then re-seed:")
  console.log("  pnpm tsx experiments/extraction/seed-dataset.ts")
}

function addSurroundingContext(
  signalTurns: TranscriptTurn[],
  allTurns: TranscriptTurn[],
): TranscriptTurn[] {
  const signalSet = new Set(signalTurns)
  const result: TranscriptTurn[] = []
  const added = new Set<TranscriptTurn>()

  for (let i = 0; i < allTurns.length; i++) {
    if (signalSet.has(allTurns[i])) {
      if (
        i > 0 &&
        allTurns[i - 1].role === "assistant" &&
        !added.has(allTurns[i - 1])
      ) {
        result.push(allTurns[i - 1])
        added.add(allTurns[i - 1])
      }
      if (!added.has(allTurns[i])) {
        result.push(allTurns[i])
        added.add(allTurns[i])
      }
      if (
        i + 1 < allTurns.length &&
        allTurns[i + 1].role === "assistant" &&
        !added.has(allTurns[i + 1])
      ) {
        result.push(allTurns[i + 1])
        added.add(allTurns[i + 1])
      }
    }
  }

  return result
}

main().catch(console.error)
