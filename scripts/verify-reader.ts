import { readTranscript } from "../server/memory/transcript-reader"

async function main() {
  const sessionPath = process.argv[2]
  if (!sessionPath) {
    console.error("Usage: pnpm tsx scripts/verify-reader.ts <session.jsonl>")
    process.exit(1)
  }

  const t0 = Date.now()
  const turns = await readTranscript(sessionPath)
  const elapsed = Date.now() - t0

  console.log(`Parsed ${turns.length} turns in ${elapsed}ms`)
  console.log(`User turns: ${turns.filter((t) => t.role === "user").length}`)
  console.log(
    `Assistant turns: ${turns.filter((t) => t.role === "assistant").length}`,
  )
  console.log(`With tool_use: ${turns.filter((t) => t.toolUse?.length).length}`)
  console.log()

  const userTurns = turns.filter((t) => t.role === "user")
  console.log("--- First 5 user messages ---")
  userTurns.slice(0, 5).forEach((t, i) => {
    console.log(`  ${i + 1}> ${t.content.slice(0, 150)}`)
  })
  console.log()
  console.log("--- Last 5 user messages ---")
  userTurns.slice(-5).forEach((t) => {
    console.log(`  > ${t.content.slice(0, 150)}`)
  })
}

main()
