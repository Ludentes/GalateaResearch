#!/usr/bin/env node
/**
 * Mem0 LLM Benchmark Runner
 *
 * Tests Mem0's memory extraction quality using the same golden dataset
 * as the Graphiti benchmark for direct comparison.
 */

// Set telemetry env var BEFORE any imports
process.env.MEM0_TELEMETRY = 'false'

import { config } from 'dotenv'
// Load .env.local for benchmark-specific Langfuse credentials
config({ path: '.env.local' })

import fs from 'fs'
import Langfuse from 'langfuse'
import { Memory } from 'mem0ai/oss'
import type { ExtractedOutput } from './lib/scoring'
import { calculateScores } from './lib/scoring'

interface GoldenDataset {
  version: string
  description: string
  cases: TestCase[]
}

interface TestCase {
  id: string
  category: string
  input: {
    messages: Array<{ content: string; role: string }>
    group_id: string
  }
  expectedOutput: {
    entities: Array<{ name: string; labels?: string[] }>
    facts: Array<{
      fact: string
      source_entity: string
      target_entity: string
    }>
  }
  notes?: string
}

interface Mem0Config {
  name: string
  model: string
  temperature: number
  description?: string
}

/**
 * Clear previous benchmark data from Qdrant.
 */
async function clearBenchmarkData(): Promise<void> {
  console.log('Clearing previous Mem0 benchmark data...')

  // Delete mem0_benchmark collection if it exists
  try {
    await fetch('http://localhost:6333/collections/mem0_benchmark', {
      method: 'DELETE'
    })
  } catch (error) {
    // Collection might not exist yet
  }

  // Recreate with correct dimensions
  await fetch('http://localhost:6333/collections/mem0_benchmark', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vectors: {
        size: 768, // nomic-embed-text dimension
        distance: 'Cosine'
      }
    })
  })

  console.log('✓ Cleared benchmark data\n')
}

/**
 * Create Mem0 memory instance with given config.
 */
function createMemory(config: Mem0Config): Memory {
  // Telemetry already disabled at top of file

  return new Memory({
    embedder: {
      provider: 'ollama',
      config: {
        model: 'nomic-embed-text',
        url: 'http://localhost:11434',
        embeddingDims: 768
      }
    },
    vectorStore: {
      provider: 'qdrant',
      config: {
        collectionName: 'mem0_benchmark',
        url: 'http://localhost:6333',
        embeddingModelDims: 768,
        onDisk: true,
        checkCompatibility: false
      }
    },
    llm: {
      provider: 'ollama',
      config: {
        model: config.model,
        baseURL: 'http://localhost:11434'
      }
    },
    disableHistory: true,
    // Disable telemetry to avoid memory_migrations collection issues
    version: 'v1.1' // Use stable version
  } as any)
}

/**
 * Ingest a test case into Mem0.
 */
async function ingestTestCase(
  memory: Memory,
  testCase: TestCase,
  runTimestamp: number
): Promise<void> {
  const userId = `${testCase.input.group_id}-${runTimestamp}`

  // Combine all messages into a single conversation text
  const conversationText = testCase.input.messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n\n')

  // Add to Mem0
  await memory.add(conversationText, {
    userId,
    metadata: {
      test_case_id: testCase.id,
      category: testCase.category
    }
  })
}

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Extract results from Qdrant directly (bypass Mem0's getAll to avoid telemetry issues).
 */
async function extractResults(
  _memory: Memory,
  testCaseId: string
): Promise<ExtractedOutput> {
  const startTime = Date.now()

  try {
    // Query Qdrant directly to get all points with this test_case_id
    const response = await fetch('http://localhost:6333/collections/mem0_benchmark/points/scroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: {
          must: [
            {
              key: 'test_case_id',
              match: { value: testCaseId }
            }
          ]
        },
        limit: 100,
        with_payload: true,
        with_vector: false
      })
    })

    const data = await response.json() as any
    // Qdrant scroll returns {result: {points: [...], next_page_offset: ...}}
    const points = (data?.result?.points || data?.points || [])

    // Extract memories from Qdrant points
    // Mem0 stores extracted facts in the 'data' field
    const memories = points.map((p: any) => ({
      memory: p.payload?.data || p.payload?.memory || p.payload?.text || ''
    }))

    // Mem0 returns atomic memories, not structured entities/facts
    // We need to infer entities and facts from the memory text
    const entities: Array<{ name: string; labels: string[] }> = []
    const facts: Array<{ source: string; target: string; fact: string }> = []

    // Simple heuristic: extract entity mentions and fact statements
    for (const mem of memories) {
      const text = mem.memory || ''
      if (!text) continue

      // Extract entity-like patterns (capitalized words, proper nouns)
      const entityMatches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || []
      for (const entity of entityMatches) {
        if (!entities.some(e => e.name.toLowerCase() === entity.toLowerCase())) {
          entities.push({ name: entity, labels: [] })
        }
      }

      // Treat each memory as a potential fact
      // Try to parse "X <verb> Y" patterns
      const factMatch = text.match(/^(.+?)\s+(is|has|uses|prefers?|wants?|feels?|will|should)\s+(.+)$/i)
      if (factMatch) {
        const [, source, , target] = factMatch
        facts.push({
          source: source.trim(),
          target: target.trim(),
          fact: text
        })
      } else {
        // If no clear pattern, create a self-referential fact
        facts.push({
          source: 'user',
          target: 'user',
          fact: text
        })
      }
    }

    return {
      entities,
      facts,
      parse_success: memories.length > 0,
      latency_ms: Date.now() - startTime
    }
  } catch (error) {
    console.error('Error extracting results:', error)
    return {
      entities: [],
      facts: [],
      parse_success: false,
      latency_ms: Date.now() - startTime
    }
  }
}

/**
 * Run benchmark for a single configuration.
 */
async function runBenchmark(config: Mem0Config): Promise<void> {
  const runTimestamp = Date.now()

  // Initialize Langfuse
  const langfuse = new Langfuse({
    secretKey: process.env.LANGFUSE_SECRET_KEY!,
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
    baseUrl: process.env.LANGFUSE_HOST
  })

  console.log(`\n${'='.repeat(70)}`)
  console.log(`BENCHMARK: ${config.name}`)
  console.log(`Model: ${config.model}`)
  console.log(`Temperature: ${config.temperature}`)
  console.log(`${'='.repeat(70)}\n`)

  // Load golden dataset
  const dataset: GoldenDataset = JSON.parse(
    fs.readFileSync('tests/fixtures/graphiti-golden-dataset.json', 'utf8')
  )

  console.log(`Dataset: ${dataset.description}`)
  console.log(`Test cases: ${dataset.cases.length}\n`)

  // Clear old data
  await clearBenchmarkData()

  // Create Memory instance
  const memory = createMemory(config)

  // Results storage
  const results: any[] = []

  // Process each test case
  for (let i = 0; i < dataset.cases.length; i++) {
    const testCase = dataset.cases[i]
    console.log(`[${i + 1}/${dataset.cases.length}] ${testCase.id}: ${testCase.category}`)

    const trace = langfuse.trace({
      name: `mem0-benchmark-${config.name}`,
      metadata: {
        test_case_id: testCase.id,
        category: testCase.category,
        model: config.model,
        temperature: config.temperature,
        run_timestamp: runTimestamp
      }
    })

    try {
      // Ingest
      const ingestStart = Date.now()
      try {
        await ingestTestCase(memory, testCase, runTimestamp)
      } catch (error) {
        // Mem0 telemetry errors are non-fatal, continue
        if (!String(error).includes('telemetry') && !String(error).includes('getUserId')) {
          throw error
        }
      }
      const ingestLatency = Date.now() - ingestStart

      // Wait for Mem0 processing (LLM extraction happens during add())
      console.log('  Waiting for Mem0 extraction...')
      await sleep(3000) // Brief delay for any async operations

      // Extract results
      let extracted: ExtractedOutput
      try {
        extracted = await extractResults(memory, testCase.id)
      } catch (error) {
        // Handle telemetry errors gracefully
        if (String(error).includes('telemetry') || String(error).includes('getUserId')) {
          console.log('  ⚠ Telemetry error (non-fatal), continuing...')
          extracted = {
            entities: [],
            facts: [],
            parse_success: false,
            latency_ms: Date.now() - ingestStart
          }
        } else {
          throw error
        }
      }

      // Calculate scores
      const scores = calculateScores(
        testCase.expectedOutput,
        extracted
      )

      console.log(`  Parse: ${extracted.parse_success ? '✓' : '✗'}`)
      console.log(`  Entities: ${extracted.entities.length} (expected ${testCase.expectedOutput.entities.length})`)
      console.log(`  Facts: ${extracted.facts.length} (expected ${testCase.expectedOutput.facts.length})`)
      console.log(`  Entity F1: ${scores.entity_f1.toFixed(3)}`)
      console.log(`  Fact F1: ${scores.fact_f1.toFixed(3)}`)
      console.log(`  Latency: ${ingestLatency}ms\n`)

      // Log to Langfuse
      const gen = trace.generation({
        name: 'mem0-extraction',
        model: config.model
      })
      gen.end({
        output: extracted
      })

      trace.score({
        name: 'entity_f1',
        value: scores.entity_f1
      })

      trace.score({
        name: 'fact_f1',
        value: scores.fact_f1
      })

      results.push({
        test_case_id: testCase.id,
        category: testCase.category,
        ...scores,
        extracted,
        latency_ms: ingestLatency
      })
    } catch (error) {
      console.error(`  ✗ Error: ${error}`)
      trace.event({
        name: 'error',
        metadata: { error: String(error) }
      })

      results.push({
        test_case_id: testCase.id,
        category: testCase.category,
        error: String(error)
      })
    }
  }

  // Calculate aggregate scores
  const validResults = results.filter(r => !r.error)
  const avgEntityF1 = validResults.reduce((sum, r) => sum + r.entity_f1, 0) / validResults.length
  const avgFactF1 = validResults.reduce((sum, r) => sum + r.fact_f1, 0) / validResults.length
  const parseSuccessRate = validResults.filter(r => r.extracted?.parse_success).length / results.length

  console.log(`\n${'='.repeat(70)}`)
  console.log('AGGREGATE RESULTS')
  console.log(`${'='.repeat(70)}`)
  console.log(`Parse Success Rate: ${(parseSuccessRate * 100).toFixed(1)}%`)
  console.log(`Avg Entity F1: ${avgEntityF1.toFixed(3)}`)
  console.log(`Avg Fact F1: ${avgFactF1.toFixed(3)}`)
  console.log(`${'='.repeat(70)}\n`)

  // Save results
  const outputPath = `benchmark-results/mem0-${config.name}-${runTimestamp}.json`
  fs.mkdirSync('benchmark-results', { recursive: true })
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        config,
        run_timestamp: runTimestamp,
        dataset_version: dataset.version,
        results,
        aggregate: {
          parse_success_rate: parseSuccessRate,
          avg_entity_f1: avgEntityF1,
          avg_fact_f1: avgFactF1
        }
      },
      null,
      2
    )
  )

  console.log(`Results saved to: ${outputPath}`)

  // Flush Langfuse
  await langfuse.flushAsync()
}

/**
 * Main entry point.
 */
async function main() {
  const modelArg = process.argv[2]
  const model = modelArg || 'gpt-oss:latest'
  const modelName = model.replace(':latest', '').replace(':', '-')

  const config: Mem0Config = {
    name: `mem0-${modelName}`,
    model,
    temperature: 0.7,
    description: `Mem0 with ${model}`
  }

  await runBenchmark(config)
}

main().catch(console.error)
