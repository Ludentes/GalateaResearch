import path from "node:path"
import type { LanguageModel } from "ai"
import { getExtractionConfig, getExtractionStrategyConfig } from "../engine/config"
import { getLLMConfig } from "../providers/config"
import { consolidateExtraction } from "./extraction-consolidation"
import { getExtractionPrompt } from "./extraction-prompts"
import { extractHeuristic } from "./heuristic-extractor"
import { extractWithRetry } from "./knowledge-extractor"
import {
  appendEntries,
  deduplicateEntries,
  readEntries,
} from "./knowledge-store"
import { applyNoveltyGateAndApproval } from "./post-extraction"
import { classifyTurn } from "./signal-classifier"
import { getStrategyModel } from "./strategy-model"
import { readTranscript } from "./transcript-reader"
import { emitEvent } from "../observation/emit"
import { consolidateToClaudeMd } from "./consolidation"
import type { ExtractionResult, KnowledgeEntry, TranscriptTurn } from "./types"

export interface ExtractionOptions {
  transcriptPath: string
  model?: LanguageModel
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
  const strategyCfg = getExtractionStrategyConfig()
  const {
    transcriptPath,
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

  // Classify all turns
  const classified = allTurns
    .map((turn) => ({ turn, classification: classifyTurn(turn) }))
    .filter(({ classification }) => classification.type !== "noise")

  const signalCount = classified.length
  const noiseCount = allTurns.length - signalCount

  // Partition: heuristic-eligible vs LLM-eligible
  const heuristicTurns = classified.filter(
    ({ classification }) => classification.type !== "factual",
  )
  const llmCandidates = classified
    .filter(({ classification }) => classification.type === "factual")
    .map(({ turn }) => turn)

  console.log(
    `[pipeline] ${source}: ${allTurns.length} turns, ${signalCount} signal (${heuristicTurns.length} heuristic, ${llmCandidates.length} llm-eligible), ${noiseCount} noise`,
  )

  const allExtracted: KnowledgeEntry[] = []
  let chunksFailed = 0

  // 1. Heuristic extraction (instant, always runs)
  const heuristicEntries: KnowledgeEntry[] = []
  for (const { turn, classification } of heuristicTurns) {
    const idx = allTurns.indexOf(turn)
    const preceding =
      idx > 0 && allTurns[idx - 1].role === "assistant"
        ? allTurns[idx - 1]
        : undefined
    const result = extractHeuristic(turn, classification, source, preceding)
    heuristicEntries.push(...result.entries)
  }

  // Apply novelty gate + auto-approval to heuristic entries
  const gatedHeuristic =
    heuristicEntries.length > 0
      ? applyNoveltyGateAndApproval(heuristicEntries)
      : []
  allExtracted.push(...gatedHeuristic)

  if (gatedHeuristic.length > 0) {
    console.log(
      `[pipeline] heuristic: ${gatedHeuristic.length} entries (${heuristicEntries.length} pre-gate)`,
    )
  }

  // 2. LLM extraction (slow path)
  // Determine LLM model from strategy (options.model overrides for backward compat)
  const strategyModel = options.model ?? getStrategyModel(strategyCfg)
  const isCloud = strategyCfg.strategy === "cloud"
  const llmExtracted: KnowledgeEntry[] = []

  let signalTurnsForLLM: TranscriptTurn[]
  if (!strategyModel || strategyCfg.strategy === "heuristics-only") {
    signalTurnsForLLM = []
  } else {
    signalTurnsForLLM = llmCandidates
  }

  // Narrow model type for LLM path (guard above ensures non-null when signalTurnsForLLM is non-empty)
  const llmModel = strategyModel as NonNullable<typeof strategyModel>

  // Get the right prompt based on strategy config
  const extractionPrompt = getExtractionPrompt(strategyCfg.optimized_prompt)

  for (let i = 0; i < signalTurnsForLLM.length; i += chunkSize) {
    const chunk = signalTurnsForLLM.slice(i, i + chunkSize)
    const withContext = addSurroundingContext(chunk, allTurns)
    const chunkNum = Math.floor(i / chunkSize) + 1
    console.log(
      `[pipeline] chunk ${chunkNum}: ${chunk.length} signal + ${withContext.length - chunk.length} context = ${withContext.length} turns`,
    )
    const t0 = Date.now()
    const extracted = await extractWithRetry(
      withContext,
      llmModel,
      source,
      [0, 0.3, 0.7],
      {
        prompt: extractionPrompt,
        useQueue: !isCloud,
      },
    )
    console.log(
      `[pipeline] chunk ${chunkNum}: extracted ${extracted.length} entries in ${Date.now() - t0}ms`,
    )
    if (extracted.length === 0 && withContext.length > 0) {
      chunksFailed++
    }
    llmExtracted.push(...extracted)
  }
  allExtracted.push(...llmExtracted)

  // Consolidation stage (Chain of Density) — filter near-dupes before dedup
  const consolidated = await consolidateExtraction(
    allExtracted,
    existing,
    strategyCfg.consolidation,
  )

  console.log(
    `[pipeline] consolidation: ${allExtracted.length} → ${consolidated.length} entries`,
  )

  console.log(
    `[pipeline] dedup start: ${consolidated.length} candidates vs ${existing.length} existing`,
  )
  const t1 = Date.now()
  const { unique: newEntries, duplicatesSkipped } = await deduplicateEntries(
    consolidated,
    existing,
    getLLMConfig().ollamaBaseUrl,
  )
  console.log(
    `[pipeline] dedup done: ${newEntries.length} unique, ${duplicatesSkipped} skipped in ${Date.now() - t1}ms`,
  )

  if (newEntries.length > 0) {
    await appendEntries(newEntries, storePath)

    // Run consolidation to CLAUDE.md if claudeMdPath configured
    if (claudeMdPath) {
      consolidateToClaudeMd(storePath, claudeMdPath).catch((err) => {
        emitEvent({
          type: "log",
          source: "galatea-api",
          body: "consolidation.failed",
          attributes: {
            "event.name": "consolidation.failed",
            severity: "warning",
            error: String(err),
            storePath,
            claudeMdPath,
          },
        }).catch(() => {})
      })
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
  ).catch(() => {})

  return {
    entries: newEntries,
    stats: {
      turnsProcessed: allTurns.length,
      signalTurns: signalCount,
      noiseTurns: noiseCount,
      entriesExtracted: allExtracted.length,
      duplicatesSkipped,
      chunksFailed: chunksFailed > 0 ? chunksFailed : undefined,
      heuristicEntries: gatedHeuristic.length,
      llmEntries: llmExtracted.length,
      llmSkipped: strategyCfg.strategy === "heuristics-only",
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
