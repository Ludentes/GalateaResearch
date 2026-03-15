/**
 * Extract cognitive models (user/team/project) from real session transcripts
 * using the heuristic extraction pipeline.
 *
 * Usage: pnpm tsx scripts/extract-models.ts [session1.jsonl] [session2.jsonl] ...
 * Default: all 4 telejobs sessions
 */

import { extractHeuristic } from "../server/memory/heuristic-extractor"
import { applyNoveltyGateAndApproval } from "../server/memory/post-extraction"
import { classifyTurn } from "../server/memory/signal-classifier"
import { readTranscript } from "../server/memory/transcript-reader"
import type { KnowledgeEntry } from "../server/memory/types"

const DEFAULT_SESSIONS = [
  `${process.env.HOME}/.claude/projects/-home-newub-w-telejobs/35244eda-104c-446c-b8fb-ab1393e52886.jsonl`,
  `${process.env.HOME}/.claude/projects/-home-newub-w-telejobs/d420c723-31d1-4dc1-93e9-a88e0e9af7a0.jsonl`,
  `${process.env.HOME}/.claude/projects/-home-newub-w-telejobs/ca99baa5-df89-4cbe-aa6d-6e2e0dccc41c.jsonl`,
  `${process.env.HOME}/.claude/projects/-home-newub-w-telejobs/6fb18ac2-a431-49a4-aa16-90ba15829dfc.jsonl`,
]

async function main() {
  const sessionPaths =
    process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_SESSIONS

  const allEntries: KnowledgeEntry[] = []
  let totalTurns = 0
  let signalTurns = 0
  let noiseTurns = 0

  for (const sessionPath of sessionPaths) {
    const sessionId = sessionPath
      .split("/")
      .pop()
      ?.replace(".jsonl", "")
      .slice(0, 8)
    const source = `session:${sessionId}`

    try {
      const turns = await readTranscript(sessionPath)
      totalTurns += turns.length

      const rawEntries: KnowledgeEntry[] = []

      for (const turn of turns) {
        const classification = classifyTurn(turn)
        if (classification.type === "noise") {
          noiseTurns++
          continue
        }
        if (classification.type === "factual") {
          signalTurns++
          // Skip factual — would need LLM
          continue
        }
        signalTurns++
        const result = extractHeuristic(turn, classification, source)
        rawEntries.push(...result.entries)
      }

      const gated = applyNoveltyGateAndApproval(rawEntries)
      allEntries.push(...gated)
      console.log(
        `[${sessionId}] ${turns.length} turns → ${rawEntries.length} raw → ${gated.length} after gate`,
      )
    } catch (err) {
      console.error(`[${sessionId}] SKIP: ${err}`)
    }
  }

  console.log(`\n=== EXTRACTION SUMMARY ===`)
  console.log(`Sessions: ${sessionPaths.length}`)
  console.log(`Total turns: ${totalTurns}`)
  console.log(`Signal: ${signalTurns}, Noise: ${noiseTurns}`)
  console.log(`Entries after gate: ${allEntries.length}`)

  // Group by about.type
  const userModel = allEntries.filter((e) => e.about?.type === "user")
  const teamModel = allEntries.filter((e) => e.about?.type === "team")
  const projectModel = allEntries.filter((e) => e.about?.type === "project")
  const noAbout = allEntries.filter((e) => !e.about)

  console.log(`\nUser model: ${userModel.length}`)
  console.log(`Team model: ${teamModel.length}`)
  console.log(`Project model: ${projectModel.length}`)
  if (noAbout.length > 0) console.log(`No about: ${noAbout.length}`)

  // Print models
  const printModel = (name: string, entries: KnowledgeEntry[]) => {
    if (entries.length === 0) return
    console.log(`\n${"=".repeat(60)}`)
    console.log(`  ${name} (${entries.length} entries)`)
    console.log(`${"=".repeat(60)}`)

    // Group by type within model
    const byType = new Map<string, KnowledgeEntry[]>()
    for (const e of entries) {
      const list = byType.get(e.type) || []
      list.push(e)
      byType.set(e.type, list)
    }

    for (const [type, items] of byType) {
      console.log(`\n  --- ${type.toUpperCase()} (${items.length}) ---`)
      for (const item of items) {
        const status = item.curationStatus === "approved" ? "✓" : "○"
        const conf = item.confidence.toFixed(2)
        console.log(`  ${status} [${conf}] ${item.content}`)
        if (item.entities.length > 0) {
          console.log(`           entities: ${item.entities.join(", ")}`)
        }
      }
    }
  }

  printModel("USER MODEL (personal preferences & habits)", userModel)
  printModel("TEAM MODEL (shared conventions & policies)", teamModel)
  printModel("PROJECT MODEL (codebase rules & decisions)", projectModel)

  // Stats
  console.log(`\n${"=".repeat(60)}`)
  console.log(`  STATS`)
  console.log(`${"=".repeat(60)}`)
  const approved = allEntries.filter(
    (e) => e.curationStatus === "approved",
  ).length
  const pending = allEntries.filter(
    (e) => e.curationStatus === "pending",
  ).length
  const generalKnowledge = allEntries.filter(
    (e) => e.novelty === "general-knowledge",
  ).length
  console.log(`  Auto-approved: ${approved}`)
  console.log(`  Pending review: ${pending}`)
  console.log(`  General knowledge (will be dropped): ${generalKnowledge}`)

  // Type distribution
  const typeCounts = new Map<string, number>()
  for (const e of allEntries) {
    typeCounts.set(e.type, (typeCounts.get(e.type) || 0) + 1)
  }
  console.log(`\n  Type distribution:`)
  for (const [type, count] of [...typeCounts].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${type}: ${count}`)
  }
}

main().catch(console.error)
