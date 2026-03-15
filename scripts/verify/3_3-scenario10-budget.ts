import { rmSync } from "fs"
import { assembleContext } from "../../server/memory/context-assembler"
import { appendEntries } from "../../server/memory/knowledge-store"

const storePath = "/tmp/galatea-scenario10/entries.jsonl"

// Create 30 entries to force budget overflow
const entries = Array.from({ length: 30 }, (_, i) => ({
  id: crypto.randomUUID(),
  type: "fact" as const,
  content:
    "This is fact number " +
    i +
    " with enough content to consume tokens in the context window budget allocation system",
  confidence: 0.9 - i * 0.01,
  entities: ["expo"],
  source: "session:test",
  extractedAt: new Date().toISOString(),
}))
await appendEntries(entries, storePath)

const ctx = await assembleContext({
  storePath,
  agentContext: {
    sessionId: "test",
    currentMessage: "Tell me about expo",
    messageHistory: [],
    retrievedFacts: entries,
  },
})
console.log("System prompt length:", ctx.systemPrompt.length)
console.log("Knowledge entries included:", ctx.metadata.knowledgeEntries)
console.log(
  "All 30 included?",
  ctx.metadata.knowledgeEntries === 30
    ? "YES (budget large enough)"
    : "NO (budget enforced, only " + ctx.metadata.knowledgeEntries + " fit)",
)

rmSync("/tmp/galatea-scenario10", { recursive: true })
process.exit(0)
