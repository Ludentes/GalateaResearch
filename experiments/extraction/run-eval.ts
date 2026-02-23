/**
 * run-eval.ts
 *
 * Runs knowledge extraction against the Langfuse gold-standard dataset,
 * scores results, and logs traces + scores back to Langfuse as a dataset run.
 *
 * Scoring metrics:
 *   - about_recall:    % of expected `about` fields correctly produced
 *   - about_precision: % of produced `about` fields that match expected
 *   - entity_recall:   % of expected entities found across all items
 *   - type_accuracy:   % of items with correct type classification
 *   - count_accuracy:  1 - |expected - actual| / expected (clamped to [0, 1])
 *
 * Usage:
 *   pnpm tsx experiments/extraction/run-eval.ts
 *   pnpm tsx experiments/extraction/run-eval.ts --prompt-version 2
 *   pnpm tsx experiments/extraction/run-eval.ts --local-prompt
 *   pnpm tsx experiments/extraction/run-eval.ts --timeout 60
 *
 * Requires LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY, LANGFUSE_BASE_URL in .env
 */

// Save CLI-specified env vars before dotenv override
const cliLlmModel = process.env.LLM_MODEL
import { config } from "dotenv"
config({ override: true })
// Restore CLI-specified LLM_MODEL (it should take precedence over .env)
if (cliLlmModel) {
  process.env.LLM_MODEL = cliLlmModel
}
import { generateObject, generateText } from "ai"
import type { LanguageModel } from "ai"
import { ollama } from "ai-sdk-ollama"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { Langfuse } from "langfuse"
import { ExtractionSchema } from "../../server/memory/knowledge-extractor"

const DATASET_NAME = "extraction-gold-standard"
const PROMPT_NAME = "knowledge-extraction"

const BASE_URL = process.env.LANGFUSE_BASE_URL || "http://localhost:3000"
const AUTH = Buffer.from(
  `${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`,
).toString("base64")

interface ExpectedItem {
  type: string
  content: string
  confidence: number
  entities: string[]
  about?: { entity: string; type: string }
}

interface Expected {
  items: ExpectedItem[]
}

interface DatasetItem {
  id: string
  input: Array<{ role: string; content: string }>
  expectedOutput: Expected
  status: string
}

interface Scores {
  about_recall: number
  about_precision: number
  about_f1: number
  entity_recall: number
  entity_precision: number
  entity_f1: number
  type_accuracy: number
  count_accuracy: number
}

// Parse CLI args
const args = process.argv.slice(2)
const promptVersion = args.includes("--prompt-version")
  ? Number(args[args.indexOf("--prompt-version") + 1])
  : undefined
const useLocalPrompt = args.includes("--local-prompt")
const itemLimit = args.includes("--limit")
  ? Number(args[args.indexOf("--limit") + 1])
  : undefined
const perItemTimeoutSec = args.includes("--timeout")
  ? Number(args[args.indexOf("--timeout") + 1])
  : 120
const temperature = args.includes("--temperature")
  ? Number(args[args.indexOf("--temperature") + 1])
  : 0
const noFormat = args.includes("--no-format")
const useHints = args.includes("--hints")
const cliModel = args.includes("--model")
  ? args[args.indexOf("--model") + 1]
  : undefined
const MODEL_ID = cliModel || process.env.LLM_MODEL || "gemma3:12b"

async function api(
  path: string,
  opts?: { method?: string; body?: unknown },
): Promise<unknown> {
  const method = opts?.method ?? "GET"
  const res = await fetch(`${BASE_URL}/api/public${path}`, {
    method,
    headers: {
      Authorization: `Basic ${AUTH}`,
      ...(opts?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  })
  if (!res.ok) {
    throw new Error(`Langfuse API ${method} ${path}: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

async function fetchAllDatasetItems(): Promise<DatasetItem[]> {
  const items: DatasetItem[] = []
  let page = 1
  while (true) {
    const res = (await api(
      `/dataset-items?datasetName=${DATASET_NAME}&limit=100&page=${page}`,
    )) as { data: DatasetItem[]; meta: { totalPages: number } }
    items.push(...res.data)
    if (page >= res.meta.totalPages) break
    page++
  }
  return items.filter((item) => item.status === "ACTIVE")
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout after ${ms / 1000}s: ${label}`)),
      ms,
    )
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

function promptCharCount(text: string): string {
  const chars = text.length
  const approxTokens = Math.round(chars / 4)
  return `${chars}ch/~${approxTokens}tok`
}

async function main() {
  const langfuse = new Langfuse({
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    baseUrl: BASE_URL,
  })

  console.log(`[eval] Langfuse: ${BASE_URL}`)
  console.log(`[eval] Project: ${process.env.LANGFUSE_PUBLIC_KEY?.slice(0, 15)}...`)

  // Fetch prompt
  let promptText: string
  if (useLocalPrompt) {
    const { readFile } = await import("node:fs/promises")
    const { resolve } = await import("node:path")
    const source = await readFile(
      resolve(import.meta.dirname, "../../server/memory/knowledge-extractor.ts"),
      "utf-8",
    )
    const match = source.match(
      /const EXTRACTION_PROMPT = `([\s\S]*?)`/,
    )
    if (!match) throw new Error("Could not extract EXTRACTION_PROMPT from source")
    promptText = match[1]
    console.log("[eval] Using local prompt from knowledge-extractor.ts")
  } else {
    try {
      const prompt = await langfuse.getPrompt(PROMPT_NAME, promptVersion)
      promptText = prompt.prompt as string
      console.log(
        `[eval] Using Langfuse prompt "${PROMPT_NAME}" v${prompt.version}`,
      )
    } catch {
      console.error(
        `[eval] Prompt "${PROMPT_NAME}" not found in Langfuse. Push it first or use --local-prompt`,
      )
      process.exit(1)
    }
  }

  // Fetch dataset items via REST API (not SDK — avoids auth/caching issues)
  console.log("[eval] Fetching dataset items via REST API...")
  let datasetItems = await fetchAllDatasetItems()

  if (itemLimit) {
    datasetItems = datasetItems.slice(0, itemLimit)
  }

  console.log(`[eval] Dataset "${DATASET_NAME}": ${datasetItems.length} items`)

  // Log input size stats
  const inputSizes = datasetItems.map((item) => {
    const text = item.input.map((t) => t.content).join("\n")
    return text.length
  })
  const maxInput = Math.max(...inputSizes)
  const avgInput = Math.round(inputSizes.reduce((a, b) => a + b, 0) / inputSizes.length)
  console.log(`[eval] Input sizes: avg=${avgInput}ch, max=${maxInput}ch`)

  // Model slug for run name: strip provider prefix and special chars
  const modelSlug = MODEL_ID.replace(/^openrouter:/, "").replace(/[/:]/g, "-").replace(/\./g, "")
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const tempSuffix = temperature > 0 ? `-t${temperature}` : ""
  const formatSuffix = noFormat ? "-nofmt" : ""
  const hintsSuffix = useHints ? "-hints" : ""
  const runName = `${modelSlug}${tempSuffix}${formatSuffix}${hintsSuffix}-${ts}`
  console.log(`[eval] Run name: ${runName}`)
  console.log(`[eval] Model: ${MODEL_ID}`)
  console.log(`[eval] Temperature: ${temperature}`)
  console.log(`[eval] Per-item timeout: ${perItemTimeoutSec}s`)
  console.log()

  // Build hints from gold standard if --hints is set
  if (useHints) {
    const people = new Set<string>()
    const entities = new Set<string>()
    for (const item of datasetItems) {
      const exp = item.expectedOutput as Expected
      for (const entry of exp.items) {
        if (entry.about?.type === "user") people.add(entry.about.entity)
        for (const e of entry.entities) entities.add(e)
      }
    }
    const hintsLines: string[] = []
    hintsLines.push(`Project name: "umka"`)
    if (people.size > 0) {
      hintsLines.push(`Known people: ${[...people].join(", ")} — use these names in the about field when the user refers to themselves or others`)
    }
    if (entities.size > 0) {
      hintsLines.push(`Known entity slugs: ${[...entities].sort().join(", ")} — prefer these exact slugs when tagging entities`)
    }
    const hintsBlock = `CONTEXT HINTS:\n${hintsLines.join("\n")}\n\n`
    promptText = promptText.replace("{{hints}}", hintsBlock)
    console.log(`[eval] Hints: ${people.size} people, ${entities.size} entities`)
  } else {
    promptText = promptText.replace("{{hints}}", "")
  }

  const allScores: Scores[] = []
  let failures = 0
  let timeouts = 0
  let totalTokens = 0
  const timings: Array<{ index: number; duration: number; inputChars: number; status: string }> = []
  const runStart = Date.now()

  for (let i = 0; i < datasetItems.length; i++) {
    const dsItem = datasetItems[i]
    const input = dsItem.input as Array<{ role: string; content: string }>
    const expected = dsItem.expectedOutput as Expected

    // Format transcript
    const transcript = input
      .map((t) => `[${t.role.toUpperCase()}]: ${t.content}`)
      .join("\n\n")

    const fullPrompt = `${promptText}\n\n---\n\nTRANSCRIPT:\n${transcript}`
    const inputChars = transcript.length

    // Create trace
    const trace = langfuse.trace({
      name: "extraction-eval",
      input: { transcript: input },
      metadata: {
        model: MODEL_ID,
        runName,
        datasetItemIndex: i,
        inputChars,
        promptSize: promptCharCount(fullPrompt),
      },
    })

    const generation = trace.generation({
      name: "extract-knowledge",
      model: MODEL_ID,
      input: fullPrompt,
    })

    const itemStart = Date.now()

    try {
      const model: LanguageModel = MODEL_ID.startsWith("openrouter:")
        ? createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! })(MODEL_ID.slice("openrouter:".length)) as LanguageModel
        : ollama(MODEL_ID)

      let object: any
      let usage: any

      if (noFormat) {
        // Use generateText to avoid Ollama's JSON format mode
        const jsonSchema = JSON.stringify(ExtractionSchema.shape, null, 2)
        const textResult = await withTimeout(
          generateText({
            model,
            prompt: fullPrompt + `\n\nRespond with a valid JSON object matching this schema:\n${jsonSchema}\n\nJSON:`,
            temperature,
            maxRetries: 0,
          }),
          perItemTimeoutSec * 1000,
          `item ${i + 1} (${inputChars}ch)`,
        )
        const raw = textResult.text
        // Extract JSON from response (may be wrapped in markdown code blocks)
        const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/)
        if (!jsonMatch) throw new Error(`No object generated: could not parse the response.`)
        object = ExtractionSchema.parse(JSON.parse(jsonMatch[1]))
        usage = textResult.usage
      } else {
        const result = await withTimeout(
          generateObject({
            model,
            schema: ExtractionSchema,
            prompt: fullPrompt,
            temperature,
            maxRetries: 0,
          }),
          perItemTimeoutSec * 1000,
          `item ${i + 1} (${inputChars}ch)`,
        )
        object = result.object
        usage = result.usage
      }

      const duration = (Date.now() - itemStart) / 1000
      generation.end({
        output: object,
        usage: usage ? { input: (usage as any).promptTokens ?? usage.totalTokens, output: (usage as any).completionTokens ?? 0 } : undefined,
      })
      trace.update({ output: object })
      if (usage?.totalTokens) totalTokens += usage.totalTokens

      // Score
      const scores = scoreResult(object.items, expected.items)
      allScores.push(scores)

      // Link to dataset run and log scores
      for (const [name, value] of Object.entries(scores)) {
        trace.score({ name, value, dataType: "NUMERIC" })
      }

      // Link trace to dataset item as part of the run
      await api("/dataset-run-items", {
        method: "POST",
        body: {
          runName,
          runDescription: `Model: ${MODEL_ID}, temp: ${temperature}, prompt: ${useLocalPrompt ? "local" : `langfuse v${promptVersion ?? "latest"}`}`,
          metadata: { model: MODEL_ID, temperature, promptSource: useLocalPrompt ? "local" : "langfuse" },
          datasetItemId: dsItem.id,
          traceId: trace.id,
        },
      })

      timings.push({ index: i, duration, inputChars, status: "ok" })

      console.log(
        `[eval] Item ${i + 1}/${datasetItems.length} (${duration.toFixed(1)}s, ${inputChars}ch): ` +
          `about_f1=${scores.about_f1.toFixed(2)} ent_f1=${scores.entity_f1.toFixed(2)} ` +
          `type=${scores.type_accuracy.toFixed(2)} count=${scores.count_accuracy.toFixed(2)}`,
      )
    } catch (error) {
      const duration = (Date.now() - itemStart) / 1000
      const isTimeout = error instanceof Error && error.message.startsWith("Timeout")
      if (isTimeout) timeouts++
      failures++

      generation.end({
        output: null,
        statusMessage: error instanceof Error ? error.message : String(error),
        level: "ERROR",
      })
      trace.update({
        output: null,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          duration,
          inputChars,
        },
      })

      timings.push({ index: i, duration, inputChars, status: isTimeout ? "timeout" : "error" })

      console.error(
        `[eval] Item ${i + 1}/${datasetItems.length} (${duration.toFixed(1)}s, ${inputChars}ch): ` +
          `${isTimeout ? "TIMEOUT" : "FAILED"} — ${error instanceof Error ? error.message : error}`,
      )
    }
  }

  await langfuse.flushAsync()
  const totalDuration = (Date.now() - runStart) / 1000

  // Print summary
  console.log()
  console.log("=".repeat(70))
  console.log(`Run: ${runName}`)
  console.log(`Model: ${MODEL_ID}`)
  console.log(`Items: ${datasetItems.length} (${failures} failures, ${timeouts} timeouts)`)
  console.log(`Total time: ${totalDuration.toFixed(1)}s (avg ${(totalDuration / datasetItems.length).toFixed(1)}s/item)`)
  if (totalTokens > 0) {
    console.log(`Total tokens: ${totalTokens.toLocaleString()}`)
  }

  if (allScores.length > 0) {
    const avg = averageScores(allScores)
    console.log()
    console.log("Average scores:")
    for (const [name, value] of Object.entries(avg)) {
      console.log(`  ${name}: ${value.toFixed(3)}`)
    }
    const overallAvg =
      Object.values(avg).reduce((a, b) => a + b, 0) /
      Object.values(avg).length
    console.log(`  overall: ${overallAvg.toFixed(3)}`)
  }

  // Timing breakdown
  const okTimings = timings.filter((t) => t.status === "ok")
  if (okTimings.length > 0) {
    const sorted = [...okTimings].sort((a, b) => b.duration - a.duration)
    console.log()
    console.log("Slowest items:")
    for (const t of sorted.slice(0, 5)) {
      console.log(`  Item ${t.index + 1}: ${t.duration.toFixed(1)}s (${t.inputChars}ch)`)
    }
  }

  if (failures > 0) {
    const failedTimings = timings.filter((t) => t.status !== "ok")
    console.log()
    console.log("Failed/timed-out items:")
    for (const t of failedTimings) {
      console.log(`  Item ${t.index + 1}: ${t.status} after ${t.duration.toFixed(1)}s (${t.inputChars}ch)`)
    }
  }

  console.log("=".repeat(70))
  console.log(`View results: ${BASE_URL}`)
}

function scoreResult(
  actual: ExpectedItem[],
  expected: ExpectedItem[],
): Scores {
  const expectedWithAbout = expected.filter((e) => e.about)
  let aboutRecallHits = 0
  for (const exp of expectedWithAbout) {
    const match = actual.find(
      (a) =>
        a.about &&
        a.about.entity.toLowerCase() === exp.about!.entity.toLowerCase() &&
        a.about.type === exp.about!.type,
    )
    if (match) aboutRecallHits++
  }
  const aboutRecall =
    expectedWithAbout.length > 0
      ? aboutRecallHits / expectedWithAbout.length
      : 1.0

  const actualWithAbout = actual.filter((a) => a.about)
  let aboutPrecisionHits = 0
  for (const act of actualWithAbout) {
    const match = expected.find(
      (e) =>
        e.about &&
        e.about.entity.toLowerCase() === act.about!.entity.toLowerCase() &&
        e.about.type === act.about!.type,
    )
    if (match) aboutPrecisionHits++
  }
  const aboutPrecision =
    actualWithAbout.length > 0
      ? aboutPrecisionHits / actualWithAbout.length
      : expectedWithAbout.length === 0
        ? 1.0
        : 0.0

  const expectedEntities = new Set(
    expected.flatMap((e) => e.entities.map((ent) => ent.toLowerCase())),
  )
  const actualEntities = new Set(
    actual.flatMap((a) => a.entities.map((ent) => ent.toLowerCase())),
  )
  let entityRecallHits = 0
  for (const ent of expectedEntities) {
    if (actualEntities.has(ent)) entityRecallHits++
  }
  const entityRecall =
    expectedEntities.size > 0 ? entityRecallHits / expectedEntities.size : 1.0

  let entityPrecisionHits = 0
  for (const ent of actualEntities) {
    if (expectedEntities.has(ent)) entityPrecisionHits++
  }
  const entityPrecision =
    actualEntities.size > 0
      ? entityPrecisionHits / actualEntities.size
      : expectedEntities.size === 0
        ? 1.0
        : 0.0

  let typeHits = 0
  for (const exp of expected) {
    const bestMatch = findBestContentMatch(exp.content, actual)
    if (bestMatch && bestMatch.type === exp.type) typeHits++
  }
  const typeAccuracy = expected.length > 0 ? typeHits / expected.length : 1.0

  const countDiff = Math.abs(expected.length - actual.length)
  const countAccuracy =
    expected.length > 0
      ? Math.max(0, 1 - countDiff / expected.length)
      : actual.length === 0
        ? 1.0
        : 0.0

  const aboutF1 = aboutRecall + aboutPrecision > 0
    ? 2 * aboutRecall * aboutPrecision / (aboutRecall + aboutPrecision)
    : 0
  const entityF1 = entityRecall + entityPrecision > 0
    ? 2 * entityRecall * entityPrecision / (entityRecall + entityPrecision)
    : 0

  return {
    about_recall: aboutRecall,
    about_precision: aboutPrecision,
    about_f1: aboutF1,
    entity_recall: entityRecall,
    entity_precision: entityPrecision,
    entity_f1: entityF1,
    type_accuracy: typeAccuracy,
    count_accuracy: countAccuracy,
  }
}

function findBestContentMatch(
  targetContent: string,
  candidates: ExpectedItem[],
): ExpectedItem | null {
  const targetWords = new Set(
    targetContent
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2),
  )

  let bestScore = 0
  let bestMatch: ExpectedItem | null = null

  for (const candidate of candidates) {
    const candidateWords = new Set(
      candidate.content
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 2),
    )
    const intersection = [...targetWords].filter((w) => candidateWords.has(w))
    const union = new Set([...targetWords, ...candidateWords])
    const jaccard = union.size > 0 ? intersection.length / union.size : 0

    if (jaccard > bestScore) {
      bestScore = jaccard
      bestMatch = candidate
    }
  }

  return bestScore > 0.15 ? bestMatch : null
}

function averageScores(scores: Scores[]): Scores {
  const sum: Scores = {
    about_recall: 0,
    about_precision: 0,
    about_f1: 0,
    entity_recall: 0,
    entity_precision: 0,
    entity_f1: 0,
    type_accuracy: 0,
    count_accuracy: 0,
  }
  for (const s of scores) {
    for (const key of Object.keys(sum) as (keyof Scores)[]) {
      sum[key] += s[key]
    }
  }
  for (const key of Object.keys(sum) as (keyof Scores)[]) {
    sum[key] /= scores.length
  }
  return sum
}

main().catch(console.error)
