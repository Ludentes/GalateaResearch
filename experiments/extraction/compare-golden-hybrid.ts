/**
 * Compare hybrid (heuristic + Ollama) extraction against golden dataset.
 * Runs the full extraction pipeline with LLM fallback on factual turns.
 *
 * Usage: pnpm tsx experiments/extraction/compare-golden-hybrid.ts <developer> <session-files...>
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { parse as parseYaml } from "yaml"
import { readTranscript } from "../../server/memory/transcript-reader"
import { classifyTurn } from "../../server/memory/signal-classifier"
import { extractHeuristic } from "../../server/memory/heuristic-extractor"
import { extractWithRetry } from "../../server/memory/knowledge-extractor"
import { applyNoveltyGateAndApproval } from "../../server/memory/post-extraction"
import { getModel } from "../../server/providers/index"
import type { KnowledgeEntry, TranscriptTurn } from "../../server/memory/types"

interface ExpectedModel {
  user_model?: { preferences?: string[] }
  team_model?: { rules?: string[] }
  project_model?: {
    decisions?: string[]
    rules?: string[]
    facts?: string[]
    lessons?: string[]
  }
}

function extractKeyTerms(expected: string): string[] {
  const stops = new Set([
    "the", "for", "and", "with", "from", "not", "all", "use", "should",
    "must", "can", "has", "are", "was", "our", "its", "that", "this",
    "when", "before", "after", "first", "then", "also", "into",
  ])
  return expected
    .toLowerCase()
    .replace(/[()—–\-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stops.has(w))
    .slice(0, 4)
}

function checkRecall(entries: KnowledgeEntry[], expected: string[]): { found: string[]; missed: string[] } {
  const found: string[] = []
  const missed: string[] = []
  for (const exp of expected) {
    const terms = extractKeyTerms(exp)
    const match = entries.some((e) => {
      const content = e.content.toLowerCase()
      const matched = terms.filter((t) => content.includes(t))
      return matched.length >= Math.ceil(terms.length / 2)
    })
    if (match) found.push(exp)
    else missed.push(exp)
  }
  return { found, missed }
}

function dedup(entries: KnowledgeEntry[]): KnowledgeEntry[] {
  const seen = new Set<string>()
  const unique: KnowledgeEntry[] = []
  for (const e of entries) {
    const key = e.content.toLowerCase().trim().replace(/\s+/g, " ").slice(0, 200)
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(e)
    }
  }
  return unique
}

async function main() {
  const developer = process.argv[2]
  if (!developer || process.argv.length < 4) {
    console.error("Usage: pnpm tsx experiments/extraction/compare-golden-hybrid.ts <developer> <session-files...>")
    process.exit(1)
  }

  const yamlPath = path.join(import.meta.dirname, "expected-models.yaml")
  const allModels = parseYaml(readFileSync(yamlPath, "utf-8"))
  const expected: ExpectedModel = allModels[developer]
  if (!expected) { console.error(`No model for: ${developer}`); process.exit(1) }

  const jsonlFiles = process.argv.slice(3).filter(f => f.endsWith(".jsonl") && !path.basename(f).includes("_"))

  console.log(`\n=== Golden Hybrid Comparison: ${developer} ===`)
  console.log(`Sessions: ${jsonlFiles.length}`)

  const { model } = getModel("ollama", "gemma3:12b")

  const heuristicEntries: KnowledgeEntry[] = []
  const llmEntries: KnowledgeEntry[] = []
  let totalTurns = 0
  let factualTurns = 0
  const t0 = Date.now()

  // First pass: count total factual chunks for progress
  let totalFactualChunks = 0
  const chunkSize = 8
  const sessionData: Array<{ file: string; turns: TranscriptTurn[] }> = []
  for (const file of jsonlFiles) {
    try {
      const turns = await readTranscript(file)
      sessionData.push({ file, turns })
      let sessionFactual = 0
      for (const turn of turns) {
        if (classifyTurn(turn).type === "factual") sessionFactual++
      }
      // Each factual turn becomes ~2 turns with context, chunks of 8
      totalFactualChunks += Math.ceil((sessionFactual * 2) / chunkSize)
    } catch {}
  }

  let completedChunks = 0
  let llmTimeMs = 0

  for (let si = 0; si < sessionData.length; si++) {
    const { file, turns } = sessionData[si]
    totalTurns += turns.length
    const source = `session:${path.basename(file, ".jsonl")}`

    // Heuristic pass
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i]
      const classification = classifyTurn(turn)
      if (classification.type === "noise") continue
      if (classification.type === "factual") continue // handled in LLM pass
      const preceding = i > 0 && turns[i - 1].role === "assistant" ? turns[i - 1] : undefined
      const result = extractHeuristic(turn, classification, source, preceding)
      heuristicEntries.push(...result.entries)
    }

    // Collect factual turns with context for LLM
    const factualWithContext: TranscriptTurn[] = []
    for (let i = 0; i < turns.length; i++) {
      const classification = classifyTurn(turns[i])
      if (classification.type === "factual") {
        factualTurns++
        if (i > 0 && turns[i - 1].role === "assistant") {
          factualWithContext.push(turns[i - 1])
        }
        factualWithContext.push(turns[i])
      }
    }

    // LLM extraction in chunks
    for (let i = 0; i < factualWithContext.length; i += chunkSize) {
      const chunk = factualWithContext.slice(i, i + chunkSize)
      completedChunks++
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0)
      const pct = ((completedChunks / Math.max(totalFactualChunks, 1)) * 100).toFixed(0)
      const avgChunkTime = completedChunks > 1 ? llmTimeMs / (completedChunks - 1) : 10000
      const remaining = ((totalFactualChunks - completedChunks) * avgChunkTime / 1000).toFixed(0)
      process.stdout.write(`\r  [${pct}%] session ${si + 1}/${sessionData.length} chunk ${completedChunks}/${totalFactualChunks} | ${elapsed}s elapsed, ~${remaining}s remaining | ${llmEntries.length} LLM entries`)
      try {
        const ct0 = Date.now()
        const extracted = await extractWithRetry(chunk, model, source)
        llmTimeMs += Date.now() - ct0
        llmEntries.push(...extracted)
      } catch {
        // skip failed chunks
      }
    }
  }
  console.log() // newline after progress

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

  // Combine and gate
  const allRaw = [...heuristicEntries, ...llmEntries]
  const gated = applyNoveltyGateAndApproval(allRaw)
  const deduped = dedup(gated)

  console.log(`\nTurns: ${totalTurns} (${factualTurns} factual → LLM)`)
  console.log(`Heuristic entries: ${heuristicEntries.length}`)
  console.log(`LLM entries: ${llmEntries.length}`)
  console.log(`After gate: ${gated.length}`)
  console.log(`After dedup: ${deduped.length}`)
  console.log(`Time: ${elapsed}s`)
  console.log()

  // Recall
  console.log("--- RECALL ---\n")
  let totalExpected = 0, totalFound = 0

  const categories = [
    { name: "User preferences", items: expected.user_model?.preferences },
    { name: "Team rules", items: expected.team_model?.rules },
    { name: "Project decisions", items: expected.project_model?.decisions },
    { name: "Project rules", items: expected.project_model?.rules },
    { name: "Project facts", items: expected.project_model?.facts },
    { name: "Project lessons", items: expected.project_model?.lessons },
  ]

  for (const { name, items } of categories) {
    if (!items?.length) continue
    const r = checkRecall(deduped, items)
    totalExpected += items.length
    totalFound += r.found.length
    console.log(`  ${name}: ${r.found.length}/${items.length}`)
    for (const f of r.found) console.log(`    ✓ ${f}`)
    for (const m of r.missed) console.log(`    ✗ ${m}`)
  }

  console.log(`\n  RECALL TOTAL: ${totalFound}/${totalExpected} (${((totalFound / totalExpected) * 100).toFixed(1)}%)`)

  // Precision quick check
  const suspicious = deduped.filter(e => {
    const c = e.content.toLowerCase()
    return c.length < 10 || c.includes("<") || /^(ok|yes|no|thanks|sure|got it)/i.test(c) || c.split(" ").length < 3
  })
  console.log(`\n--- PRECISION ---`)
  console.log(`  Good: ${deduped.length - suspicious.length}, Suspicious: ${suspicious.length}`)
  if (suspicious.length > 0) {
    for (const s of suspicious.slice(0, 5)) {
      console.log(`    ? [${s.type}] "${s.content.slice(0, 80)}"`)
    }
  }

  // Show LLM-only recall (what did LLM add that heuristics missed?)
  const heuristicGated = dedup(applyNoveltyGateAndApproval(heuristicEntries))
  const llmOnlyEntries = deduped.filter(e => !heuristicGated.some(h => h.content.toLowerCase().trim() === e.content.toLowerCase().trim()))
  console.log(`\n--- LLM-ONLY CONTRIBUTION ---`)
  console.log(`  Entries only from LLM: ${llmOnlyEntries.length}`)
  
  // Which golden items does LLM add?
  let llmOnlyRecall = 0
  for (const { name, items } of categories) {
    if (!items?.length) continue
    const heuristicRecall = checkRecall(heuristicGated, items)
    const hybridRecall = checkRecall(deduped, items)
    const llmAdded = hybridRecall.found.filter(f => !heuristicRecall.found.includes(f))
    if (llmAdded.length > 0) {
      console.log(`  ${name}: LLM added ${llmAdded.length}`)
      for (const a of llmAdded) console.log(`    + ${a}`)
      llmOnlyRecall += llmAdded.length
    }
  }
  console.log(`  Total LLM recall boost: +${llmOnlyRecall} items`)
  console.log()
}

main()
