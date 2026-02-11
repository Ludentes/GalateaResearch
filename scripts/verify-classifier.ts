import {
  classifyTurn,
  filterSignalTurns,
} from "../server/memory/signal-classifier"
import { readTranscript } from "../server/memory/transcript-reader"

async function main() {
  const sessionPath = process.argv[2]
  if (!sessionPath) {
    console.error(
      "Usage: pnpm tsx scripts/verify-classifier.ts <session.jsonl>",
    )
    process.exit(1)
  }

  const turns = await readTranscript(sessionPath)
  const userTurns = turns.filter((t) => t.role === "user")

  const classified = userTurns.map((t) => ({
    type: classifyTurn(t).type,
    conf: classifyTurn(t).confidence,
    pattern: classifyTurn(t).pattern || "",
    text: t.content.slice(0, 100),
  }))

  // Summary
  const byType: Record<string, number> = {}
  for (const c of classified) {
    byType[c.type] = (byType[c.type] || 0) + 1
  }
  console.log("Classification summary:")
  for (const [type, count] of Object.entries(byType).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${type}: ${count}`)
  }
  console.log()

  // Show examples of each type
  for (const type of [
    "preference",
    "correction",
    "policy",
    "decision",
    "factual",
    "noise",
  ]) {
    const examples = classified.filter((c) => c.type === type).slice(0, 3)
    if (examples.length > 0) {
      console.log(`--- ${type.toUpperCase()} (${byType[type] || 0} total) ---`)
      for (const e of examples) {
        console.log(
          `  [${e.conf}${e.pattern ? ` ${e.pattern}` : ""}] ${e.text}`,
        )
      }
      console.log()
    }
  }

  const signal = filterSignalTurns(turns)
  console.log(
    `Signal ratio: ${signal.length}/${userTurns.length} (${Math.round((signal.length / userTurns.length) * 100)}%)`,
  )
}

main()
