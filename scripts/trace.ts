#!/usr/bin/env -S pnpm exec tsx
/**
 * Pipeline trace tool — diagnose why facts were or weren't retrieved.
 *
 * Usage:
 *   pnpm exec tsx scripts/trace.ts "your query here"
 *   pnpm exec tsx scripts/trace.ts "your query" --store path/to/entries.jsonl
 *   pnpm exec tsx scripts/trace.ts "your query" --entity alina
 *   pnpm exec tsx scripts/trace.ts "your query" --verbose
 */
import { retrieveRelevantFacts } from "../server/memory/fact-retrieval"
import type { PipelineTrace, TraceStep } from "../server/memory/fact-retrieval"

const args = process.argv.slice(2)
const query = args.find((a) => !a.startsWith("--"))
const storePath = getFlag(args, "--store") ?? "data/memory/entries.jsonl"
const additionalEntities = getAllFlags(args, "--entity")
const verbose = args.includes("--verbose")

if (!query) {
  console.error("Usage: pnpm exec tsx scripts/trace.ts \"your query here\"")
  console.error("")
  console.error("Options:")
  console.error("  --store <path>    Knowledge store path (default: data/memory/entries.jsonl)")
  console.error("  --entity <name>   Add entity to search (repeatable, e.g. --entity alina)")
  console.error("  --verbose         Show per-entry details for all stages")
  process.exit(1)
}

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined
}

function getAllFlags(args: string[], flag: string): string[] {
  const values: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && i + 1 < args.length) {
      values.push(args[i + 1])
    }
  }
  return values
}

;(async () => {
  const result = await retrieveRelevantFacts(query, storePath, {
    trace: true,
    additionalEntities: additionalEntities.length > 0 ? additionalEntities : undefined,
  })

  const trace = result.trace!

  // Header
  console.log("=" .repeat(70))
  console.log("PIPELINE TRACE")
  console.log("=" .repeat(70))
  console.log(`Query:    ${trace.query}`)
  console.log(`Store:    ${trace.storePath}`)
  console.log(`Time:     ${trace.timestamp}`)
  console.log()

  // Entities
  console.log("--- Entities ---")
  console.log(`From message:  ${trace.entities.fromMessage.length > 0 ? trace.entities.fromMessage.join(", ") : "(none)"}`)
  console.log(`Additional:    ${trace.entities.additional.length > 0 ? trace.entities.additional.join(", ") : "(none)"}`)
  console.log(`Known in store: ${trace.entities.knownInStore.length} entities`)
  if (verbose && trace.entities.knownInStore.length > 0) {
    console.log(`  ${trace.entities.knownInStore.join(", ")}`)
  }
  console.log()

  // Keywords
  console.log("--- Keywords ---")
  console.log(`Significant: ${trace.keywords.length > 0 ? trace.keywords.join(", ") : "(none — all filtered by stop words or too short)"}`)
  console.log()

  // Config snapshot
  console.log("--- Config ---")
  for (const [k, v] of Object.entries(trace.config)) {
    console.log(`  ${k}: ${v}`)
  }
  console.log()

  // Stages
  for (const step of trace.steps) {
    printStage(step, verbose)
  }

  // Result
  console.log("=" .repeat(70))
  console.log(`RESULT: ${result.entries.length} entries retrieved`)
  console.log("=" .repeat(70))
  for (const e of result.entries) {
    console.log(`  [${e.confidence.toFixed(2)}] ${e.type} | ${e.content.slice(0, 80)}`)
  }

  if (result.entries.length === 0) {
    console.log()
    console.log("--- Diagnosis ---")
    diagnose(trace)
  }

  process.exit(0)
})()

function printStage(step: TraceStep, verbose: boolean): void {
  const icon = step.filtered > 0 ? "!" : "+"
  console.log(`[${icon}] Stage: ${step.stage}`)
  console.log(`    Input: ${step.input} | Output: ${step.output} | Filtered: ${step.filtered}`)

  if (verbose) {
    for (const d of step.details) {
      const mark = d.action === "pass" ? "  PASS" : "  FILT"
      console.log(`    ${mark} ${d.id.slice(0, 8)}  ${d.content.slice(0, 50)}`)
      console.log(`          reason: ${d.reason}`)
    }
  } else {
    // Show only filtered entries (the interesting ones)
    const filtered = step.details.filter((d) => d.action === "filter")
    if (filtered.length > 0 && filtered.length <= 10) {
      for (const d of filtered) {
        console.log(`    FILT ${d.id.slice(0, 8)}  ${d.content.slice(0, 50)}`)
        console.log(`         reason: ${d.reason}`)
      }
    } else if (filtered.length > 10) {
      for (const d of filtered.slice(0, 5)) {
        console.log(`    FILT ${d.id.slice(0, 8)}  ${d.content.slice(0, 50)}`)
        console.log(`         reason: ${d.reason}`)
      }
      console.log(`    ... and ${filtered.length - 5} more filtered`)
    }
  }
  console.log()
}

function diagnose(trace: PipelineTrace): void {
  const hints: string[] = []

  // No entities found
  if (trace.entities.fromMessage.length === 0 && trace.entities.additional.length === 0) {
    hints.push(
      "No entities matched. The query doesn't contain any known entity names.\n" +
      "  Try: --entity <name> to manually specify an entity.\n" +
      "  Or: check if your entity is in the store with: grep -i '<name>' data/memory/entries.jsonl"
    )
  }

  // No keywords
  if (trace.keywords.length === 0) {
    hints.push(
      "No significant keywords extracted. All words were either too short\n" +
      "  (< keyword_min_length) or in the stop words list.\n" +
      "  Check: server/engine/config.yaml → retrieval.keyword_min_length and stop_words.retrieval"
    )
  }

  // Keywords extracted but no matches
  const kwStep = trace.steps.find((s) => s.stage === "keyword_match")
  if (kwStep && kwStep.output === 0 && trace.keywords.length > 0) {
    hints.push(
      `Keywords [${trace.keywords.join(", ")}] didn't match any entries.\n` +
      "  The entries may use different terminology. Try:\n" +
      "  1. Search the store directly: grep -i '<keyword>' data/memory/entries.jsonl\n" +
      "  2. Lower the threshold: config.yaml → retrieval.keyword_overlap_threshold"
    )
  }

  // Entity match filtered everything
  const entStep = trace.steps.find((s) => s.stage === "entity_match")
  if (entStep && entStep.filtered === entStep.input && trace.entities.fromMessage.length > 0) {
    hints.push(
      `Entity "${trace.entities.fromMessage[0]}" was found in query but matched 0 entries.\n` +
      "  Check if entries have this entity in about.entity, entities[], or content."
    )
  }

  if (hints.length === 0) {
    hints.push("No specific diagnosis available. Try --verbose for full per-entry details.")
  }

  for (const hint of hints) {
    console.log(hint)
    console.log()
  }
}
