import {
  classifyTurn,
  filterSignalTurns,
} from "../server/memory/signal-classifier"
import { readTranscript } from "../server/memory/transcript-reader"

async function main() {
  const sessionPath = process.argv[2]
  if (!sessionPath) {
    console.error(
      "Usage: pnpm tsx scripts/verify-classifier-detail.ts <session.jsonl>",
    )
    process.exit(1)
  }

  const turns = await readTranscript(sessionPath)
  const userTurns = turns.filter((t) => t.role === "user")

  const classified = userTurns.map((t) => ({
    type: classifyTurn(t).type,
    conf: classifyTurn(t).confidence,
    pattern: classifyTurn(t).pattern || "",
    fullText: t.content,
  }))

  // Show ALL examples of each signal type (not factual — too many)
  for (const type of ["preference", "correction", "policy", "decision"]) {
    const examples = classified.filter((c) => c.type === type)
    if (examples.length > 0) {
      console.log(
        `\n${"=".repeat(60)}\n${type.toUpperCase()} (${examples.length} total)\n${"=".repeat(60)}`,
      )
      for (const [i, e] of examples.entries()) {
        const text =
          e.fullText.length > 300
            ? `${e.fullText.slice(0, 300)}...`
            : e.fullText
        console.log(`\n  #${i + 1} [conf: ${e.conf}, pattern: ${e.pattern}]`)
        console.log(`  ${text.replace(/\n/g, "\n  ")}`)
      }
    }
  }

  // Show all noise examples
  const noise = classified.filter((c) => c.type === "noise")
  console.log(
    `\n${"=".repeat(60)}\nNOISE (${noise.length} total)\n${"=".repeat(60)}`,
  )
  for (const [i, e] of noise.entries()) {
    const text =
      e.fullText.length > 150 ? `${e.fullText.slice(0, 150)}...` : e.fullText
    console.log(`  #${i + 1} [conf: ${e.conf}] ${text.replace(/\n/g, "\\n")}`)
  }

  // Show first 10 factual for review
  const factual = classified.filter((c) => c.type === "factual")
  console.log(
    `\n${"=".repeat(60)}\nFACTUAL — first 10 of ${factual.length}\n${"=".repeat(60)}`,
  )
  for (const e of factual.slice(0, 10)) {
    const text =
      e.fullText.length > 200 ? `${e.fullText.slice(0, 200)}...` : e.fullText
    console.log(`  [${e.conf}] ${text.replace(/\n/g, "\\n")}`)
  }

  console.log(`\n${"=".repeat(60)}`)
  const signal = filterSignalTurns(turns)
  console.log(
    `Signal: ${signal.length}/${userTurns.length} (${Math.round((signal.length / userTurns.length) * 100)}%)`,
  )
}

main()
