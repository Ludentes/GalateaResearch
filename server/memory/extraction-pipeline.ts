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
import type { ExtractionResult, KnowledgeEntry, TranscriptTurn } from "./types"

export interface ExtractionOptions {
  transcriptPath: string
  model: LanguageModel
  storePath: string
  chunkSize?: number
  force?: boolean
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

  const allExtracted: KnowledgeEntry[] = []
  let chunksFailed = 0

  for (let i = 0; i < signalTurns.length; i += chunkSize) {
    const chunk = signalTurns.slice(i, i + chunkSize)
    const withContext = addSurroundingContext(chunk, allTurns)
    const extracted = await extractWithRetry(withContext, model, source)
    if (extracted.length === 0 && withContext.length > 0) {
      chunksFailed++
    }
    allExtracted.push(...extracted)
  }

  const { unique: newEntries, duplicatesSkipped } = await deduplicateEntries(
    allExtracted,
    existing,
    getLLMConfig().ollamaBaseUrl,
  )

  if (newEntries.length > 0) {
    await appendEntries(newEntries, storePath)
  }

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
