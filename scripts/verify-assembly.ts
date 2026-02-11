import { assembleContext } from "../server/memory/context-assembler"

async function main() {
  const ctx = await assembleContext()
  console.log("System prompt length:", ctx.systemPrompt.length, "chars")
  console.log("Estimated tokens:", Math.ceil(ctx.systemPrompt.length / 4))
  console.log("Preprompts loaded:", ctx.metadata.prepromptsLoaded)
  console.log("Knowledge entries:", ctx.metadata.knowledgeEntries)
  console.log("Rules count:", ctx.metadata.rulesCount)
  console.log()
  console.log("Sections:")
  for (const s of ctx.sections) {
    console.log(
      `  [${s.priority}] ${s.name} (${s.content.length} chars, truncatable: ${s.truncatable})`,
    )
  }
  console.log()
  console.log("--- Full system prompt ---")
  console.log(ctx.systemPrompt)
}

main().catch(console.error)
