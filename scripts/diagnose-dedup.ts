/**
 * Diagnose dedup Path 3 (embeddings) on real entries.
 * Shows: for each run2 entry, the closest run1 entry by cosine similarity,
 * plus Jaccard scores, to understand what Path 3 caught / missed.
 */
import { readFile } from "node:fs/promises"
import {
  batchEmbed,
  cosineSimilarity,
  normalizedJaccard,
} from "../server/memory/knowledge-store"
import type { KnowledgeEntry } from "../server/memory/types"

interface Match {
  run2Idx: number
  run2Entry: KnowledgeEntry
  bestRun1Idx: number
  bestRun1Entry: KnowledgeEntry
  cosSim: number
  contentJaccard: number
  evidenceJaccard: number
  path1: boolean
  path2: boolean
  path3: boolean
}

const STORE = process.argv[2] || "data/memory/entries.jsonl"
const OLLAMA_URL = process.argv[3] || "http://localhost:11434"
const RUN1_COUNT = 140 // entries from first run

async function main() {
  const raw = await readFile(STORE, "utf-8")
  const all: KnowledgeEntry[] = raw
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l))

  const run1 = all.slice(0, RUN1_COUNT)
  const run2 = all.slice(RUN1_COUNT)

  console.log(`Run 1: ${run1.length} entries, Run 2: ${run2.length} entries\n`)

  // Embed all entries
  console.log("Computing embeddings...")
  const allTexts = all.map((e) => e.content)
  const embeddings = await batchEmbed(allTexts, OLLAMA_URL)

  if (!embeddings) {
    console.error("Failed to get embeddings from Ollama")
    process.exit(1)
  }
  console.log(
    `Got ${embeddings.length} embeddings (dim=${embeddings[0].length})\n`,
  )

  // For each run2 entry, find best match in run1
  const matches: Match[] = []

  for (let i = 0; i < run2.length; i++) {
    const r2Idx = RUN1_COUNT + i
    let bestCos = -1
    let bestR1Idx = 0

    for (let j = 0; j < run1.length; j++) {
      const cos = cosineSimilarity(embeddings[r2Idx], embeddings[j])
      if (cos > bestCos) {
        bestCos = cos
        bestR1Idx = j
      }
    }

    const contentJac = normalizedJaccard(
      run2[i].content,
      run1[bestR1Idx].content,
    )
    const evidenceJac =
      run2[i].evidence && run1[bestR1Idx].evidence
        ? normalizedJaccard(run2[i].evidence!, run1[bestR1Idx].evidence!)
        : 0

    matches.push({
      run2Idx: i,
      run2Entry: run2[i],
      bestRun1Idx: bestR1Idx,
      bestRun1Entry: run1[bestR1Idx],
      cosSim: bestCos,
      contentJaccard: contentJac,
      evidenceJaccard: evidenceJac,
      path1: evidenceJac >= 0.5 && contentJac >= 0.2,
      path2: contentJac >= 0.5,
      path3: bestCos > 0.85,
    })
  }

  // Sort by cosine similarity descending
  matches.sort((a, b) => b.cosSim - a.cosSim)

  // Summary stats
  const caughtByPath1 = matches.filter((m) => m.path1).length
  const caughtByPath2 = matches.filter((m) => m.path2).length
  const caughtByPath3Only = matches.filter(
    (m) => m.path3 && !m.path1 && !m.path2,
  ).length
  const caughtByAny = matches.filter(
    (m) => m.path1 || m.path2 || m.path3,
  ).length
  const caughtByNone = matches.filter(
    (m) => !m.path1 && !m.path2 && !m.path3,
  ).length

  console.log("=== SUMMARY (run2 entries vs closest run1 match) ===")
  console.log(`Path 1 (evidence+content): ${caughtByPath1}`)
  console.log(`Path 2 (content only):     ${caughtByPath2}`)
  console.log(`Path 3 only (embeddings):  ${caughtByPath3Only}`)
  console.log(`Caught by any path:        ${caughtByAny}`)
  console.log(`Not caught:                ${caughtByNone}`)
  console.log()

  // Show Path 3 catches that Paths 1+2 missed
  const path3Only = matches.filter((m) => m.path3 && !m.path1 && !m.path2)
  if (path3Only.length > 0) {
    console.log(
      "=== PATH 3 UNIQUE CATCHES (embedding caught, Jaccard missed) ===",
    )
    for (const m of path3Only) {
      printMatch(m)
    }
  }

  // Show near-misses: cosine 0.75-0.85 that weren't caught
  const nearMisses = matches.filter(
    (m) => m.cosSim >= 0.75 && m.cosSim <= 0.85 && !m.path1 && !m.path2,
  )
  if (nearMisses.length > 0) {
    console.log(`\n=== NEAR MISSES (cosine 0.75-0.85, not caught) ===`)
    for (const m of nearMisses) {
      printMatch(m)
    }
  }

  // Show top 10 highest cosine pairs
  console.log("\n=== TOP 20 CLOSEST PAIRS (by cosine) ===")
  for (const m of matches.slice(0, 20)) {
    const caught = m.path1 || m.path2 || m.path3
    const paths = [
      m.path1 ? "P1" : "",
      m.path2 ? "P2" : "",
      m.path3 ? "P3" : "",
    ]
      .filter(Boolean)
      .join("+")
    console.log(
      `cos=${m.cosSim.toFixed(3)} cJ=${m.contentJaccard.toFixed(2)} eJ=${m.evidenceJaccard.toFixed(2)} ${caught ? `[CAUGHT ${paths}]` : "[MISSED]"}`,
    )
    console.log(`  R1: ${m.bestRun1Entry.content.slice(0, 100)}`)
    console.log(`  R2: ${m.run2Entry.content.slice(0, 100)}`)
    console.log()
  }

  // Show bottom 10 (most different)
  console.log("=== BOTTOM 5 (most different from any run1 entry) ===")
  for (const m of matches.slice(-5)) {
    console.log(
      `cos=${m.cosSim.toFixed(3)} cJ=${m.contentJaccard.toFixed(2)} eJ=${m.evidenceJaccard.toFixed(2)}`,
    )
    console.log(`  R2: ${m.run2Entry.content.slice(0, 120)}`)
    console.log()
  }
}

function printMatch(m: Match) {
  console.log(
    `cos=${m.cosSim.toFixed(3)} cJ=${m.contentJaccard.toFixed(2)} eJ=${m.evidenceJaccard.toFixed(2)}`,
  )
  console.log(
    `  R1 [${m.bestRun1Entry.type}]: ${m.bestRun1Entry.content.slice(0, 120)}`,
  )
  console.log(
    `  R2 [${m.run2Entry.type}]: ${m.run2Entry.content.slice(0, 120)}`,
  )
  if (m.bestRun1Entry.evidence) {
    console.log(`  R1 ev: ${m.bestRun1Entry.evidence.slice(0, 100)}`)
  }
  if (m.run2Entry.evidence) {
    console.log(`  R2 ev: ${m.run2Entry.evidence.slice(0, 100)}`)
  }
  console.log()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
