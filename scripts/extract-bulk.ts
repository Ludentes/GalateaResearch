/**
 * Bulk extraction analysis — runs heuristic extraction on all sessions
 * in a .claude/projects directory structure and produces statistics.
 *
 * Usage: pnpm tsx scripts/extract-bulk.ts <claude-dir> [label]
 * Example: pnpm tsx scripts/extract-bulk.ts ~/w/galatea/data/otherdevs/dem/.claude dem
 */
import { readTranscript } from "../server/memory/transcript-reader"
import { classifyTurn } from "../server/memory/signal-classifier"
import { extractHeuristic } from "../server/memory/heuristic-extractor"
import { applyNoveltyGateAndApproval } from "../server/memory/post-extraction"
import type { KnowledgeEntry, SignalClassification } from "../server/memory/types"
import { readdirSync, statSync } from "node:fs"
import path from "node:path"

const claudeDir = process.argv[2]
const label = process.argv[3] || "unknown"

if (!claudeDir) {
  console.error("Usage: pnpm tsx scripts/extract-bulk.ts <claude-dir> [label]")
  process.exit(1)
}

function findSessionFiles(dir: string): string[] {
  const files: string[] = []
  const projectsDir = path.join(dir, "projects")
  try {
    for (const project of readdirSync(projectsDir)) {
      const projPath = path.join(projectsDir, project)
      if (!statSync(projPath).isDirectory()) continue
      for (const file of readdirSync(projPath)) {
        if (file.endsWith(".jsonl") && !file.includes("subagent")) {
          files.push(path.join(projPath, file))
        }
      }
    }
  } catch {
    console.error(`Cannot read ${projectsDir}`)
  }
  return files
}

interface SignalStats {
  type: string
  count: number
  examples: string[]
}

async function main() {
  const sessionFiles = findSessionFiles(claudeDir)
  console.log(`[${label}] Found ${sessionFiles.length} session files\n`)

  const allEntries: KnowledgeEntry[] = []
  const allRawEntries: KnowledgeEntry[] = []
  let totalTurns = 0
  let totalSessions = 0
  let emptySessions = 0
  let errorSessions = 0

  // Track signal classification distribution
  const signalCounts = new Map<string, number>()
  // Track missed signals — factual turns we can't extract heuristically
  const factualExamples: string[] = []

  for (const sessionPath of sessionFiles) {
    try {
      const turns = await readTranscript(sessionPath)
      if (turns.length === 0) {
        emptySessions++
        continue
      }
      totalSessions++
      totalTurns += turns.length

      const rawEntries: KnowledgeEntry[] = []

      for (const turn of turns) {
        const classification = classifyTurn(turn)
        signalCounts.set(
          classification.type,
          (signalCounts.get(classification.type) || 0) + 1,
        )

        if (classification.type === "noise") continue

        if (classification.type === "factual") {
          if (factualExamples.length < 30) {
            factualExamples.push(turn.content.slice(0, 150))
          }
          continue
        }

        const result = extractHeuristic(turn, classification, `session:bulk`)
        rawEntries.push(...result.entries)
      }

      allRawEntries.push(...rawEntries)
      const gated = applyNoveltyGateAndApproval(rawEntries)
      allEntries.push(...gated)
    } catch {
      errorSessions++
    }
  }

  // ========== SUMMARY ==========
  console.log(`${"=".repeat(60)}`)
  console.log(`  ${label.toUpperCase()} — EXTRACTION SUMMARY`)
  console.log(`${"=".repeat(60)}`)
  console.log(`  Total session files: ${sessionFiles.length}`)
  console.log(`  Sessions with content: ${totalSessions}`)
  console.log(`  Empty sessions: ${emptySessions}`)
  console.log(`  Error sessions: ${errorSessions}`)
  console.log(`  Total turns: ${totalTurns}`)

  // Signal distribution
  console.log(`\n  Signal classification distribution:`)
  for (const [type, count] of [...signalCounts].sort((a, b) => b[1] - a[1])) {
    const pct = ((count / totalTurns) * 100).toFixed(1)
    console.log(`    ${type}: ${count} (${pct}%)`)
  }

  // Raw vs gated
  console.log(`\n  Raw entries (before gate): ${allRawEntries.length}`)
  console.log(`  Entries after gate: ${allEntries.length}`)
  const generalDropped = allRawEntries.filter(
    (e) => e.novelty === "general-knowledge",
  ).length
  console.log(`  General knowledge dropped: ${generalDropped}`)

  // Entry type distribution
  const typeCounts = new Map<string, number>()
  for (const e of allEntries) {
    typeCounts.set(e.type, (typeCounts.get(e.type) || 0) + 1)
  }
  console.log(`\n  Entry type distribution:`)
  for (const [type, count] of [...typeCounts].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${type}: ${count}`)
  }

  // Model distribution
  const userModel = allEntries.filter((e) => e.about?.type === "user")
  const teamModel = allEntries.filter((e) => e.about?.type === "team")
  const projectModel = allEntries.filter((e) => e.about?.type === "project")
  console.log(`\n  Cognitive model distribution:`)
  console.log(`    User: ${userModel.length}`)
  console.log(`    Team: ${teamModel.length}`)
  console.log(`    Project: ${projectModel.length}`)

  // Curation status
  const approved = allEntries.filter(
    (e) => e.curationStatus === "approved",
  ).length
  const pending = allEntries.filter(
    (e) => e.curationStatus === "pending",
  ).length
  console.log(`\n  Curation: ${approved} auto-approved, ${pending} pending`)

  // Quality samples — show some examples per type
  console.log(`\n${"=".repeat(60)}`)
  console.log(`  QUALITY SAMPLES (up to 5 per type)`)
  console.log(`${"=".repeat(60)}`)

  const byType = new Map<string, KnowledgeEntry[]>()
  for (const e of allEntries) {
    const list = byType.get(e.type) || []
    list.push(e)
    byType.set(e.type, list)
  }

  for (const [type, items] of byType) {
    console.log(`\n  --- ${type.toUpperCase()} (${items.length} total, showing 5) ---`)
    for (const item of items.slice(0, 5)) {
      const about = item.about ? `[${item.about.type}]` : ""
      console.log(`  ${about} ${item.content.slice(0, 120)}`)
    }
  }

  // Show factual turns that heuristics can't handle
  if (factualExamples.length > 0) {
    console.log(`\n${"=".repeat(60)}`)
    console.log(`  FACTUAL TURNS (missed by heuristics, would need LLM)`)
    console.log(`  Showing ${Math.min(15, factualExamples.length)} of ${signalCounts.get("factual") || 0}`)
    console.log(`${"=".repeat(60)}`)
    for (const ex of factualExamples.slice(0, 15)) {
      console.log(`  > ${ex}`)
    }
  }

  // Yield rate
  const yieldRate = totalTurns > 0
    ? ((allEntries.length / totalTurns) * 100).toFixed(2)
    : "0"
  console.log(`\n  YIELD: ${allEntries.length} entries from ${totalTurns} turns (${yieldRate}%)`)
}

main().catch(console.error)
