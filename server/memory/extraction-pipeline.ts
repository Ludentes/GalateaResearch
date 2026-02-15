import path from "node:path"
import type { LanguageModel } from "ai"
import { getExtractionConfig } from "../engine/config"
import { getLLMConfig } from "../providers/config"
import { extractWithRetry } from "./knowledge-extractor"
import {
  appendEntries,
  deduplicateEntries,
  readEntries,
} from "./knowledge-store"
import { filterSignalTurns } from "./signal-classifier"
import { readTranscript } from "./transcript-reader"
import { emitEvent } from "../observation/emit"
import { consolidateToClaudeMd } from "./consolidation"
import type { ExtractionResult, KnowledgeEntry, TranscriptTurn } from "./types"

export interface ExtractionOptions {
  transcriptPath: string
  model: LanguageModel
  storePath: string
  chunkSize?: number
  force?: boolean
  observationStorePath?: string
  claudeMdPath?: string
}

export async function runExtraction(
  options: ExtractionOptions,
): Promise<ExtractionResult> {
  const extractionCfg = getExtractionConfig()
  const {
    transcriptPath,
    model,
    storePath,
    chunkSize = extractionCfg.chunk_size,
    force = false,
    observationStorePath,
    claudeMdPath,
  } = options

  const source = `session:${path.basename(transcriptPath, ".jsonl")}`
  const existing = await readEntries(storePath)

  if (!force && existing.some((e) => e.source === source)) {
    return {
      entries: [],
      stats: {
        turnsProcessed: 0,
        signalTurns: 0,
        noiseTurns: 0,
        entriesExtracted: 0,
        duplicatesSkipped: 0,
        skippedAlreadyExtracted: true,
      },
    }
  }

  const allTurns = await readTranscript(transcriptPath)
  const signalTurns = filterSignalTurns(allTurns)
  const noiseTurns = allTurns.length - signalTurns.length

  console.log(
    `[pipeline] ${source}: ${allTurns.length} turns, ${signalTurns.length} signal, ${noiseTurns} noise, chunkSize=${chunkSize}`,
  )

  const allExtracted: KnowledgeEntry[] = []
  let chunksFailed = 0

  for (let i = 0; i < signalTurns.length; i += chunkSize) {
    const chunk = signalTurns.slice(i, i + chunkSize)
    const withContext = addSurroundingContext(chunk, allTurns)
    const chunkNum = Math.floor(i / chunkSize) + 1
    console.log(
      `[pipeline] chunk ${chunkNum}: ${chunk.length} signal + ${withContext.length - chunk.length} context = ${withContext.length} turns`,
    )
    const t0 = Date.now()
    const extracted = await extractWithRetry(withContext, model, source)
    console.log(
      `[pipeline] chunk ${chunkNum}: extracted ${extracted.length} entries in ${Date.now() - t0}ms`,
    )
    if (extracted.length === 0 && withContext.length > 0) {
      chunksFailed++
    }
    allExtracted.push(...extracted)
  }

  console.log(
    `[pipeline] dedup start: ${allExtracted.length} candidates vs ${existing.length} existing`,
  )
  const t1 = Date.now()
  const { unique: newEntries, duplicatesSkipped } = await deduplicateEntries(
    allExtracted,
    existing,
    getLLMConfig().ollamaBaseUrl,
  )
  console.log(
    `[pipeline] dedup done: ${newEntries.length} unique, ${duplicatesSkipped} skipped in ${Date.now() - t1}ms`,
  )

  if (newEntries.length > 0) {
    await appendEntries(newEntries, storePath)

    // Run consolidation if claudeMdPath configured
    if (claudeMdPath) {
      consolidateToClaudeMd(storePath, claudeMdPath).catch(() => {})
    }
  }

  emitEvent(
    {
      type: "log",
      source: "galatea-api",
      body: "extraction.complete",
      attributes: {
        "event.name": "extraction.complete",
        "entries.count": newEntries.length,
        "turns.processed": allTurns.length,
        "duplicates.skipped": duplicatesSkipped,
      },
    },
    observationStorePath,
  ).catch(() => {}) // fire-and-forget

  return {
    entries: newEntries,
    stats: {
      turnsProcessed: allTurns.length,
      signalTurns: signalTurns.length,
      noiseTurns,
      entriesExtracted: allExtracted.length,
      duplicatesSkipped,
      chunksFailed: chunksFailed > 0 ? chunksFailed : undefined,
    },
  }
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
