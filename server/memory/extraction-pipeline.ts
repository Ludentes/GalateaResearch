import path from "node:path"
import type { LanguageModel } from "ai"
import { extractKnowledge } from "./knowledge-extractor"
import {
  appendEntries,
  isDuplicate,
  readEntries,
  renderMarkdown,
} from "./knowledge-store"
import { filterSignalTurns } from "./signal-classifier"
import { readTranscript } from "./transcript-reader"
import type { ExtractionResult, KnowledgeEntry, TranscriptTurn } from "./types"

export interface ExtractionOptions {
  transcriptPath: string
  model: LanguageModel
  storePath: string
  mdPath?: string
  chunkSize?: number
}

export async function runExtraction(
  options: ExtractionOptions,
): Promise<ExtractionResult> {
  const {
    transcriptPath,
    model,
    storePath,
    mdPath = path.join(path.dirname(storePath), "knowledge.md"),
    chunkSize = 20,
  } = options

  const allTurns = await readTranscript(transcriptPath)
  const signalTurns = filterSignalTurns(allTurns)
  const noiseTurns = allTurns.length - signalTurns.length

  const source = `session:${path.basename(transcriptPath, ".jsonl")}`
  const allExtracted: KnowledgeEntry[] = []

  for (let i = 0; i < signalTurns.length; i += chunkSize) {
    const chunk = signalTurns.slice(i, i + chunkSize)
    const withContext = addSurroundingContext(chunk, allTurns)
    const extracted = await extractKnowledge(withContext, model, source)
    allExtracted.push(...extracted)
  }

  const existing = await readEntries(storePath)
  const newEntries: KnowledgeEntry[] = []
  let duplicatesSkipped = 0

  for (const entry of allExtracted) {
    if (isDuplicate(entry, [...existing, ...newEntries])) {
      duplicatesSkipped++
    } else {
      newEntries.push(entry)
    }
  }

  if (newEntries.length > 0) {
    await appendEntries(newEntries, storePath)
  }

  await renderMarkdown([...existing, ...newEntries], mdPath)

  return {
    entries: newEntries,
    stats: {
      turnsProcessed: allTurns.length,
      signalTurns: signalTurns.length,
      noiseTurns,
      entriesExtracted: allExtracted.length,
      duplicatesSkipped,
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
