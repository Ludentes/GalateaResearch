import { readTranscript } from "../../server/memory/transcript-reader"
import { classifyTurn } from "../../server/memory/signal-classifier"

async function main() {
  const files = process.argv.slice(2).filter(f => f.endsWith(".jsonl") && !f.includes("_"))
  let total = 0, noise = 0, factual = 0, heuristic = 0, user_turns = 0

  for (const file of files) {
    try {
      const turns = await readTranscript(file)
      for (const turn of turns) {
        total++
        if (turn.role !== "user") continue
        user_turns++
        const c = classifyTurn(turn)
        if (c.type === "noise") noise++
        else if (c.type === "factual") factual++
        else heuristic++
      }
    } catch {}
  }
  console.log(`Total turns: ${total}, User turns: ${user_turns}`)
  console.log(`  Noise: ${noise}, Factual: ${factual}, Heuristic-eligible: ${heuristic}`)
  console.log(`  Factual % of user: ${((factual/user_turns)*100).toFixed(1)}%`)
}
main()
