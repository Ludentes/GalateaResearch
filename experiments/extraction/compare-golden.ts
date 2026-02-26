/**
 * Compare heuristic extraction output against expected-models.yaml golden dataset.
 *
 * Usage: pnpm tsx experiments/extraction/compare-golden.ts <developer> <session-glob>
 *
 * Examples:
 *   pnpm tsx experiments/extraction/compare-golden.ts umka ~/.claude/projects/-home-newub-w-Umka/*.jsonl
 *   pnpm tsx experiments/extraction/compare-golden.ts dem ~/w/galatea/data/otherdevs/dem/.claude/projects/*\/*.jsonl
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { parse as parseYaml } from "yaml"
import { readTranscript } from "../../server/memory/transcript-reader"
import { classifyTurn } from "../../server/memory/signal-classifier"
import { extractHeuristic } from "../../server/memory/heuristic-extractor"
import { applyNoveltyGateAndApproval } from "../../server/memory/post-extraction"
import type { KnowledgeEntry } from "../../server/memory/types"

interface ExpectedModel {
  user_model?: {
    preferences?: string[]
    note?: string
  }
  team_model?: {
    rules?: string[]
    workflow?: string[]
  }
  project_model?: {
    decisions?: string[]
    rules?: string[]
    facts?: string[]
    lessons?: string[]
  }
  expected_claude_md?: {
    sections_present?: string[]
    must_contain?: string[]
    must_not_contain?: string[]
  }
}

function extractKeyTerms(expected: string): string[] {
  // Extract meaningful terms (3+ chars, not stop words)
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
    .slice(0, 4) // top 4 terms
}

function checkRecall(
  entries: KnowledgeEntry[],
  expected: string[],
): { found: string[]; missed: string[] } {
  const found: string[] = []
  const missed: string[] = []

  for (const exp of expected) {
    const terms = extractKeyTerms(exp)
    const match = entries.some((e) => {
      const content = e.content.toLowerCase()
      // Require at least half the key terms to match
      const matched = terms.filter((t) => content.includes(t))
      return matched.length >= Math.ceil(terms.length / 2)
    })
    if (match) {
      found.push(exp)
    } else {
      missed.push(exp)
    }
  }

  return { found, missed }
}

function checkPrecision(entries: KnowledgeEntry[]): {
  good: KnowledgeEntry[]
  suspicious: KnowledgeEntry[]
} {
  const good: KnowledgeEntry[] = []
  const suspicious: KnowledgeEntry[] = []

  for (const e of entries) {
    const content = e.content.toLowerCase()
    // Check for common false positive indicators
    const isSuspicious =
      content.length < 10 ||
      content.includes("<") || // HTML/XML remnants
      /^(ok|yes|no|thanks|sure|got it)/i.test(content) ||
      content.split(" ").length < 3
    if (isSuspicious) {
      suspicious.push(e)
    } else {
      good.push(e)
    }
  }

  return { good, suspicious }
}

async function main() {
  const developer = process.argv[2]
  if (!developer || process.argv.length < 4) {
    console.error(
      "Usage: pnpm tsx experiments/extraction/compare-golden.ts <developer> <session-files...>",
    )
    process.exit(1)
  }

  // Load expected models
  const yamlPath = path.join(import.meta.dirname, "expected-models.yaml")
  const yamlContent = readFileSync(yamlPath, "utf-8")
  const allModels = parseYaml(yamlContent)
  const expected: ExpectedModel = allModels[developer]
  if (!expected) {
    console.error(`No expected model for developer: ${developer}`)
    console.error(`Available: ${Object.keys(allModels).join(", ")}`)
    process.exit(1)
  }

  // Session files passed as remaining args (shell-expanded glob)
  const jsonlFiles = process.argv
    .slice(3)
    .filter((f) => f.endsWith(".jsonl"))
    .filter((f) => !path.basename(f).includes("_"))

  console.log(`\n=== Golden Dataset Comparison: ${developer} ===`)
  console.log(`Sessions: ${jsonlFiles.length}`)

  // Extract from all sessions
  const allEntries: KnowledgeEntry[] = []
  let totalTurns = 0

  for (const file of jsonlFiles) {
    try {
      const turns = await readTranscript(file)
      totalTurns += turns.length
      for (let i = 0; i < turns.length; i++) {
        const turn = turns[i]
        const classification = classifyTurn(turn)
        if (classification.type === "noise" || classification.type === "factual")
          continue
        const preceding =
          i > 0 && turns[i - 1].role === "assistant"
            ? turns[i - 1]
            : undefined
        const result = extractHeuristic(turn, classification, `session:${developer}`, preceding)
        allEntries.push(...result.entries)
      }
    } catch {
      // skip bad files
    }
  }

  const gated = applyNoveltyGateAndApproval(allEntries)

  // Cross-session dedup: keep first occurrence of each content (normalized)
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

  const deduped = dedup(gated)

  console.log(`Turns: ${totalTurns}`)
  console.log(`Raw entries: ${allEntries.length}`)
  console.log(`After gate: ${gated.length}`)
  console.log(`After dedup: ${deduped.length} (${gated.length - deduped.length} duplicates removed)`)
  console.log()

  // === RECALL ===
  console.log("--- RECALL (expected entries found?) ---\n")

  let totalExpected = 0
  let totalFound = 0

  if (expected.user_model?.preferences?.length) {
    const r = checkRecall(deduped, expected.user_model.preferences)
    totalExpected += expected.user_model.preferences.length
    totalFound += r.found.length
    console.log(
      `  User preferences: ${r.found.length}/${expected.user_model.preferences.length}`,
    )
    for (const f of r.found) console.log(`    ✓ ${f}`)
    for (const m of r.missed) console.log(`    ✗ ${m}`)
  }

  if (expected.team_model?.rules?.length) {
    const r = checkRecall(deduped, expected.team_model.rules)
    totalExpected += expected.team_model.rules.length
    totalFound += r.found.length
    console.log(`  Team rules: ${r.found.length}/${expected.team_model.rules.length}`)
    for (const f of r.found) console.log(`    ✓ ${f}`)
    for (const m of r.missed) console.log(`    ✗ ${m}`)
  }

  if (expected.project_model?.decisions?.length) {
    const r = checkRecall(deduped, expected.project_model.decisions)
    totalExpected += expected.project_model.decisions.length
    totalFound += r.found.length
    console.log(
      `  Project decisions: ${r.found.length}/${expected.project_model.decisions.length}`,
    )
    for (const f of r.found) console.log(`    ✓ ${f}`)
    for (const m of r.missed) console.log(`    ✗ ${m}`)
  }

  if (expected.project_model?.rules?.length) {
    const r = checkRecall(deduped, expected.project_model.rules)
    totalExpected += expected.project_model.rules.length
    totalFound += r.found.length
    console.log(
      `  Project rules: ${r.found.length}/${expected.project_model.rules.length}`,
    )
    for (const f of r.found) console.log(`    ✓ ${f}`)
    for (const m of r.missed) console.log(`    ✗ ${m}`)
  }

  if (expected.project_model?.facts?.length) {
    const r = checkRecall(deduped, expected.project_model.facts)
    totalExpected += expected.project_model.facts.length
    totalFound += r.found.length
    console.log(
      `  Project facts: ${r.found.length}/${expected.project_model.facts.length}`,
    )
    for (const f of r.found) console.log(`    ✓ ${f}`)
    for (const m of r.missed) console.log(`    ✗ ${m}`)
  }

  if (expected.project_model?.lessons?.length) {
    const r = checkRecall(deduped, expected.project_model.lessons)
    totalExpected += expected.project_model.lessons.length
    totalFound += r.found.length
    console.log(
      `  Project lessons: ${r.found.length}/${expected.project_model.lessons.length}`,
    )
    for (const f of r.found) console.log(`    ✓ ${f}`)
    for (const m of r.missed) console.log(`    ✗ ${m}`)
  }

  console.log(`\n  RECALL TOTAL: ${totalFound}/${totalExpected} (${((totalFound / totalExpected) * 100).toFixed(1)}%)`)

  // === PRECISION ===
  console.log("\n--- PRECISION (are extracted entries good?) ---\n")

  const { good, suspicious } = checkPrecision(deduped)
  console.log(`  Good entries: ${good.length}`)
  console.log(`  Suspicious entries: ${suspicious.length}`)
  if (suspicious.length > 0) {
    console.log("  Suspicious samples:")
    for (const s of suspicious.slice(0, 10)) {
      console.log(`    ? [${s.type}] "${s.content.slice(0, 80)}"`)
    }
  }

  // === CLAUDE.MD CHECKS ===
  if (expected.expected_claude_md) {
    console.log("\n--- CLAUDE.MD ARTIFACT CHECKS ---\n")
    const allContent = deduped.map((e) => e.content).join("\n")

    if (expected.expected_claude_md.must_contain) {
      for (const term of expected.expected_claude_md.must_contain) {
        const found = allContent.toLowerCase().includes(term.toLowerCase())
        console.log(`  ${found ? "✓" : "✗"} must_contain: "${term}"`)
      }
    }

    if (expected.expected_claude_md.must_not_contain) {
      for (const term of expected.expected_claude_md.must_not_contain) {
        const absent = !allContent.toLowerCase().includes(term.toLowerCase())
        console.log(`  ${absent ? "✓" : "✗"} must_not_contain: "${term}"`)
      }
    }
  }

  // === DUPLICATES ===
  console.log("\n--- DUPLICATE ANALYSIS ---\n")
  const contentSet = new Map<string, number>()
  for (const e of gated) {
    const key = e.content.toLowerCase().trim()
    contentSet.set(key, (contentSet.get(key) || 0) + 1)
  }
  const dupes = [...contentSet.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1])
  console.log(`  Unique entries: ${contentSet.size}/${gated.length}`)
  if (dupes.length > 0) {
    console.log(`  Duplicates (${dupes.length}):`)
    for (const [content, count] of dupes.slice(0, 10)) {
      console.log(`    ${count}x "${content.slice(0, 70)}"`)
    }
  }

  console.log()
}

main()
