/**
 * Compare hybrid (heuristic + Cloud LLM) extraction against golden dataset.
 * Uses OpenRouter with optimized extraction prompt (manual DSPy).
 *
 * Usage: pnpm tsx experiments/extraction/compare-golden-cloud.ts <developer> <model-id> <session-files...>
 * Example: pnpm tsx experiments/extraction/compare-golden-cloud.ts qp anthropic/claude-haiku-4.5 ~/.../*.jsonl
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { generateObject } from "ai"
import { parse as parseYaml } from "yaml"
import { z } from "zod"
import { validateExtraction } from "../../server/memory/confabulation-guard"
import { extractHeuristic } from "../../server/memory/heuristic-extractor"
import { applyNoveltyGateAndApproval } from "../../server/memory/post-extraction"
import { classifyTurn } from "../../server/memory/signal-classifier"
import { readTranscript } from "../../server/memory/transcript-reader"
import type { KnowledgeEntry, TranscriptTurn } from "../../server/memory/types"

// --- Optimized extraction prompt (manual DSPy from golden dataset analysis) ---
// Key changes from the default prompt:
// 1. Emphasize FACTS and LESSONS — heuristics miss 100% of these
// 2. Give examples of the kinds of facts/lessons we want (from golden misses)
// 3. Tighten "be conservative" to reduce the 121:1 noise ratio
// 4. Emphasize architectural decisions and domain constraints over implementation details
const OPTIMIZED_PROMPT = `You are a precise knowledge extraction system for a developer memory tool. Extract ONLY durable, reusable knowledge from this conversation between a user and an AI coding assistant.

TARGET KNOWLEDGE TYPES (in priority order):

1. **fact**: Architectural facts about the project, team, or domain.
   Examples of GOOD facts:
   - "Author is a user with specific role in backend"
   - "Platform has video publications with preview + original"
   - "Subscriptions are admin-moderated"
   - "Payment system has 4-layer validation chain"
   These are things a new developer joining the project NEEDS to know.

2. **decision**: Explicit choices made between alternatives.
   Examples: "Use PostgreSQL not MongoDB", "FIFO ordering for queue processing"
   Must reflect a deliberate choice, not just usage.

3. **rule**: Hard constraints or policies the team enforces.
   Examples: "Use null | string for nullable fields, not undefined"
   Must be prescriptive (do/don't), not descriptive.

4. **lesson**: Knowledge gained from debugging, mistakes, or surprises.
   Examples of GOOD lessons:
   - "TypeORM: set null explicitly for nullable field updates, not undefined"
   - "GraphQL: nullable optional DTO fields need explicit @Field type"
   - "Postgres rejects 'Object' type for union columns"
   These come from "aha moments" — something didn't work as expected.

5. **preference**: Personal working style preferences.
   Examples: "Prefers LSP for VS Code preparation", "Wants copy project, fill env, run one command"

6. **correction**: User corrected the AI — extract the CORRECT answer only.

CRITICAL RULES FOR PRECISION:
- Extract ≤10 items per chunk. Quality over quantity.
- Each item must be a COMPLETE, STANDALONE statement. No references to "this", "the above", "it".
- Skip implementation details (specific code changes, file edits, variable names) — extract the PRINCIPLE behind them.
- Skip tool output, error logs, and debugging steps — extract only the LESSON learned.
- Skip anything a competent developer already knows (general-knowledge).
- When the user describes how their system works (architecture, data model, integrations), ALWAYS extract these as facts.
- When debugging reveals unexpected behavior, extract the insight as a lesson.
- Merge related items: "uses TypeScript" and "prefers TypeScript" = one item.
- Confidence: 1.0 for explicit statements, 0.8 for strong context, 0.6 for inferences. USE 0.6 SPARINGLY.

Subject tagging (about field):
- ALWAYS set about. entity = lowercase name, type = user|project|agent|domain|team.
- Personal preferences → about the user.
- Project architecture → about the project.
- Technology quirks (TypeORM, GraphQL) → about the domain.

Novelty:
- "project-specific": About THIS project/team/codebase.
- "domain-specific": Specialized knowledge a general dev might not know.
- "general-knowledge": DO NOT EXTRACT. Skip entirely.

Origin:
- "explicit-statement": User directly said it.
- "observed-failure": From debugging/mistakes.
- "observed-pattern": Repeated 2+ times.
- "inferred": You guessed. MAX 2 inferred items per chunk.`

const ExtractionSchema = z.object({
  items: z.array(
    z.object({
      type: z.enum([
        "preference",
        "fact",
        "rule",
        "procedure",
        "correction",
        "decision",
      ]),
      content: z.string().describe("Concise, actionable, standalone statement"),
      confidence: z.number().describe("0.0 to 1.0"),
      evidence: z
        .string()
        .describe("The specific transcript text that supports this"),
      entities: z.array(z.string()),
      about: z
        .object({
          entity: z.string(),
          type: z.enum(["user", "project", "agent", "domain", "team"]),
        })
        .optional(),
      novelty: z.enum([
        "project-specific",
        "domain-specific",
        "general-knowledge",
      ]),
      origin: z.enum([
        "explicit-statement",
        "observed-failure",
        "observed-pattern",
        "inferred",
      ]),
    }),
  ),
})

// --- Golden dataset types and helpers ---
interface ExpectedModel {
  user_model?: { preferences?: string[] }
  team_model?: { rules?: string[] }
  project_model?: {
    decisions?: string[]
    rules?: string[]
    facts?: string[]
    lessons?: string[]
  }
}

function extractKeyTerms(expected: string): string[] {
  const stops = new Set([
    "the",
    "for",
    "and",
    "with",
    "from",
    "not",
    "all",
    "use",
    "should",
    "must",
    "can",
    "has",
    "are",
    "was",
    "our",
    "its",
    "that",
    "this",
    "when",
    "before",
    "after",
    "first",
    "then",
    "also",
    "into",
  ])
  return expected
    .toLowerCase()
    .replace(/[()—–-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stops.has(w))
    .slice(0, 4)
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
      const matched = terms.filter((t) => content.includes(t))
      return matched.length >= Math.ceil(terms.length / 2)
    })
    if (match) found.push(exp)
    else missed.push(exp)
  }
  return { found, missed }
}

function dedup(entries: KnowledgeEntry[]): KnowledgeEntry[] {
  const seen = new Set<string>()
  const unique: KnowledgeEntry[] = []
  for (const e of entries) {
    const key = e.content
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 200)
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(e)
    }
  }
  return unique
}

async function extractCloud(
  turns: TranscriptTurn[],
  model: ReturnType<ReturnType<typeof createOpenRouter>>,
  source: string,
): Promise<KnowledgeEntry[]> {
  const transcript = turns
    .map((t) => `[${t.role.toUpperCase()}]: ${t.content}`)
    .join("\n\n")

  // Truncate massive turns to 30K chars (avoid exceeding context)
  const truncated =
    transcript.length > 30000
      ? `${transcript.slice(0, 30000)}\n\n[...truncated...]`
      : transcript

  const promptText = `${OPTIMIZED_PROMPT}\n\n---\n\nTRANSCRIPT:\n${truncated}`

  const t0 = Date.now()
  try {
    const { object, usage } = await generateObject({
      model: model as any,
      schema: ExtractionSchema,
      prompt: promptText,
      temperature: 0,
      maxRetries: 2,
      abortSignal: AbortSignal.timeout(30_000),
    })

    const elapsed = Date.now() - t0
    const cost = usage
      ? ((usage as any).inputTokens * 0.001 +
          (usage as any).outputTokens * 0.005) /
        1000
      : 0
    console.log(
      `  [cloud] ${object.items.length} items in ${elapsed}ms | ` +
        `${(usage as any)?.inputTokens ?? "?"}in/${(usage as any)?.outputTokens ?? "?"}out | $${cost.toFixed(4)}`,
    )

    const rawEntries: KnowledgeEntry[] = object.items.map((item) => ({
      id: crypto.randomUUID(),
      // Map "lesson" type items that come through as facts/corrections
      ...item,
      source,
      extractedAt: new Date().toISOString(),
    }))

    const guardResult = validateExtraction(rawEntries, transcript)
    if (guardResult.warnings.length > 0) {
      for (const w of guardResult.warnings) console.warn(`  [guard] ${w}`)
    }

    return applyNoveltyGateAndApproval(guardResult.entries)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.warn(
      `  [cloud] FAILED (${Date.now() - t0}ms): ${msg.slice(0, 500)}`,
    )
    if ((error as any)?.responseBody)
      console.warn(
        `  [cloud] Body: ${String((error as any).responseBody).slice(0, 300)}`,
      )
    return []
  }
}

// --- Main ---
async function main() {
  const developer = process.argv[2]
  const modelId = process.argv[3]
  if (!developer || !modelId || process.argv.length < 5) {
    console.error(
      "Usage: pnpm tsx experiments/extraction/compare-golden-cloud.ts <developer> <model-id> <session-files...>",
    )
    process.exit(1)
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY not set")
    process.exit(1)
  }

  const yamlPath = path.join(import.meta.dirname, "expected-models.yaml")
  const allModels = parseYaml(readFileSync(yamlPath, "utf-8"))
  const expected: ExpectedModel = allModels[developer]
  if (!expected) {
    console.error(`No model for: ${developer}`)
    process.exit(1)
  }

  const jsonlFiles = process.argv
    .slice(4)
    .filter((f) => f.endsWith(".jsonl") && !path.basename(f).includes("_"))

  console.log(`\n=== Golden Cloud Comparison: ${developer} (${modelId}) ===`)
  console.log(`Sessions: ${jsonlFiles.length}`)

  const provider = createOpenRouter({ apiKey })
  const model = provider(modelId)

  const heuristicEntries: KnowledgeEntry[] = []
  const llmEntries: KnowledgeEntry[] = []
  let totalTurns = 0
  let factualTurns = 0
  const _totalCost = 0
  const t0 = Date.now()
  const chunkSize = 8

  for (let si = 0; si < jsonlFiles.length; si++) {
    const file = jsonlFiles[si]
    let turns: TranscriptTurn[]
    try {
      turns = await readTranscript(file)
    } catch {
      continue
    }

    totalTurns += turns.length
    const source = `session:${path.basename(file, ".jsonl")}`
    process.stdout.write(
      `\r  Session ${si + 1}/${jsonlFiles.length} (${turns.length} turns)...`,
    )

    // Heuristic pass
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i]
      const classification = classifyTurn(turn)
      if (classification.type === "noise" || classification.type === "factual")
        continue
      const preceding =
        i > 0 && turns[i - 1].role === "assistant" ? turns[i - 1] : undefined
      const result = extractHeuristic(turn, classification, source, preceding)
      heuristicEntries.push(...result.entries)
    }

    // Collect factual turns with context for cloud LLM
    const factualWithContext: TranscriptTurn[] = []
    for (let i = 0; i < turns.length; i++) {
      const classification = classifyTurn(turns[i])
      if (classification.type === "factual") {
        factualTurns++
        if (i > 0 && turns[i - 1].role === "assistant") {
          factualWithContext.push(turns[i - 1])
        }
        factualWithContext.push(turns[i])
      }
    }

    // Cloud LLM extraction in chunks
    for (let i = 0; i < factualWithContext.length; i += chunkSize) {
      const chunk = factualWithContext.slice(i, i + chunkSize)
      const entries = await extractCloud(chunk, model, source)
      llmEntries.push(...entries)
    }
  }
  console.log()

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

  // Combine and gate
  const allRaw = [...heuristicEntries, ...llmEntries]
  const gated = applyNoveltyGateAndApproval(allRaw)
  const deduped = dedup(gated)

  console.log(`\nTurns: ${totalTurns} (${factualTurns} factual → cloud)`)
  console.log(`Heuristic entries: ${heuristicEntries.length}`)
  console.log(`Cloud LLM entries: ${llmEntries.length}`)
  console.log(`After gate: ${gated.length}`)
  console.log(`After dedup: ${deduped.length}`)
  console.log(`Time: ${elapsed}s`)
  console.log()

  // Recall
  console.log("--- RECALL ---\n")
  let totalExpected = 0,
    totalFound = 0

  const categories = [
    { name: "User preferences", items: expected.user_model?.preferences },
    { name: "Team rules", items: expected.team_model?.rules },
    { name: "Project decisions", items: expected.project_model?.decisions },
    { name: "Project rules", items: expected.project_model?.rules },
    { name: "Project facts", items: expected.project_model?.facts },
    { name: "Project lessons", items: expected.project_model?.lessons },
  ]

  for (const { name, items } of categories) {
    if (!items?.length) continue
    const r = checkRecall(deduped, items)
    totalExpected += items.length
    totalFound += r.found.length
    console.log(`  ${name}: ${r.found.length}/${items.length}`)
    for (const f of r.found) console.log(`    ✓ ${f}`)
    for (const m of r.missed) console.log(`    ✗ ${m}`)
  }

  console.log(
    `\n  RECALL TOTAL: ${totalFound}/${totalExpected} (${((totalFound / totalExpected) * 100).toFixed(1)}%)`,
  )

  // Precision
  const suspicious = deduped.filter((e) => {
    const c = e.content.toLowerCase()
    return (
      c.length < 10 ||
      c.includes("<") ||
      /^(ok|yes|no|thanks|sure|got it)/i.test(c) ||
      c.split(" ").length < 3
    )
  })
  console.log(`\n--- PRECISION ---`)
  console.log(
    `  Good: ${deduped.length - suspicious.length}, Suspicious: ${suspicious.length}`,
  )
  if (suspicious.length > 0) {
    for (const s of suspicious.slice(0, 5)) {
      console.log(`    ? [${s.type}] "${s.content.slice(0, 80)}"`)
    }
  }

  // LLM-only contribution
  const heuristicGated = dedup(applyNoveltyGateAndApproval(heuristicEntries))
  const llmOnlyEntries = deduped.filter(
    (e) =>
      !heuristicGated.some(
        (h) =>
          h.content.toLowerCase().trim() === e.content.toLowerCase().trim(),
      ),
  )
  console.log(`\n--- CLOUD LLM CONTRIBUTION ---`)
  console.log(`  Entries only from cloud: ${llmOnlyEntries.length}`)

  let llmOnlyRecall = 0
  for (const { name, items } of categories) {
    if (!items?.length) continue
    const heuristicRecall = checkRecall(heuristicGated, items)
    const hybridRecall = checkRecall(deduped, items)
    const llmAdded = hybridRecall.found.filter(
      (f) => !heuristicRecall.found.includes(f),
    )
    if (llmAdded.length > 0) {
      console.log(`  ${name}: cloud added ${llmAdded.length}`)
      for (const a of llmAdded) console.log(`    + ${a}`)
      llmOnlyRecall += llmAdded.length
    }
  }
  console.log(`  Total cloud recall boost: +${llmOnlyRecall} items`)

  // Sample of all extracted entries for manual review
  console.log(`\n--- SAMPLE ENTRIES (first 20) ---`)
  for (const e of deduped.slice(0, 20)) {
    console.log(`  [${e.type}] (${e.confidence}) ${e.content.slice(0, 100)}`)
  }
  console.log()
}

main()
