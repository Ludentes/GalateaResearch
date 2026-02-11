import { readEntries } from "../server/memory/knowledge-store"

async function main() {
  const entries = await readEntries("data/memory/entries.jsonl")
  const active = entries.filter((e) => !e.supersededBy)

  console.log("Total entries:", entries.length)
  console.log("Active entries:", active.length)
  console.log()

  const rules = active.filter((e) => e.type === "rule")
  const prefs = active.filter((e) => e.type === "preference")
  const facts = active.filter((e) => e.type === "fact")
  const procedures = active.filter((e) => e.type === "procedure")
  const decisions = active.filter((e) => e.type === "decision")
  const corrections = active.filter((e) => e.type === "correction")

  console.log("By type:")
  console.log("  Rules:", rules.length, "(non-truncatable)")
  console.log("  Preferences:", prefs.length)
  console.log("  Facts:", facts.length)
  console.log("  Procedures:", procedures.length)
  console.log("  Decisions:", decisions.length)
  console.log("  Corrections:", corrections.length)
  console.log()

  console.log("=== CONSTRAINTS (always included) ===")
  for (const r of rules) console.log("  -", r.content)
  console.log()

  console.log(
    "=== LEARNED KNOWLEDGE (top 15 by confidence, truncatable) ===",
  )
  const knowledge = [...prefs, ...facts, ...decisions, ...corrections]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 15)
  for (const k of knowledge)
    console.log(`  [${k.type} ${k.confidence}]`, k.content)
  console.log()

  const allContent = active.map((e) => e.content).join("\n")
  const estimatedTokens = Math.ceil(allContent.length / 4)
  console.log(
    "Estimated tokens for all knowledge:",
    estimatedTokens,
    "/ 4000 budget",
  )
  if (estimatedTokens > 4000) {
    console.log(
      "WARNING: Knowledge exceeds token budget — truncation will occur",
    )
  }
}

main().catch(console.error)
