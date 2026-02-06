#!/usr/bin/env node
/**
 * Graphiti LLM Benchmark Runner
 *
 * Tests different LLM configurations (models, temperature, prompts) and logs
 * results to Langfuse for comparison.
 */

import fs from 'fs'
import Langfuse from 'langfuse'
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

interface Config {
  name: string
  model: string
  temperature: number
  system_prompt?: string
  description?: string
}

/**
 * Ingest a test case into Graphiti.
 */
async function ingestTestCase(testCase: TestCase): Promise<void> {
  const graphitiMessages = testCase.input.messages.map((m, idx) => ({
    content: m.content,
    role_type: m.role,
    role: m.role,
    name: `${testCase.id}-msg${idx}`,
    source_description: `benchmark:${testCase.id}`
  }))

  const response = await fetch('http://localhost:18000/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      group_id: testCase.input.group_id,
      messages: graphitiMessages
    })
  })

  if (!response.ok) {
    throw new Error(`Graphiti ingestion failed: ${response.statusText}`)
  }
}

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Extract results from FalkorDB for a test case.
 */
async function extractResults(groupId: string): Promise<ExtractedOutput> {
  const startTime = Date.now()

  try {
    // Import FalkorDB client
    const { getGraph } = await import('../server/integrations/falkordb')
    const graph = await getGraph('galatea_memory')

    // Query entities
    const entitiesQuery = `
      MATCH (e:Entity)
      WHERE e.group_id = $groupId
      RETURN e.name as name, e.labels as labels
    `
    const entitiesResult = await graph.query(entitiesQuery, { params: { groupId } })

    const entities = (entitiesResult.data || []).map((row: any) => ({
      name: row.name,
      labels: row.labels || []
    }))

    // Query facts
    const factsQuery = `
      MATCH (s:Entity)-[r:RELATES_TO]->(t:Entity)
      WHERE r.group_id = $groupId
      RETURN s.name as source, t.name as target, r.fact as fact
    `
    const factsResult = await graph.query(factsQuery, { params: { groupId } })

    const facts = (factsResult.data || []).map((row: any) => ({
      source: row.source,
      target: row.target,
      fact: row.fact
    }))

    return {
      entities,
      facts,
      parse_success: true,
      latency_ms: Date.now() - startTime
    }
  } catch (error) {
    return {
      entities: [],
      facts: [],
      parse_success: false,
      latency_ms: Date.now() - startTime,
      error: error.message
    }
  }
}

async function main() {
  console.log('=== Graphiti LLM Benchmark ===\n')

  // 1. Setup Langfuse
  const langfuse = new Langfuse({
    secretKey: process.env.LANGFUSE_SECRET_KEY!,
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  })

  // 2. Load golden dataset
  const dataset: GoldenDataset = JSON.parse(
    fs.readFileSync('tests/fixtures/graphiti-golden-dataset.json', 'utf8')
  )

  console.log(`Loaded dataset: ${dataset.description}`)
  console.log(`Version: ${dataset.version}`)
  console.log(`Test cases: ${dataset.cases.length}\n`)

  // 3. Load config (env vars for now)
  const config: Config = {
    name: 'env-vars',
    model: process.env.MODEL_NAME || 'llama3.2',
    temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
    system_prompt: process.env.SYSTEM_PROMPT
  }

  console.log(`Configuration: ${config.model} (temp=${config.temperature})`)

  // 4. Create Langfuse session for this run
  const runName = `${config.model}-temp${config.temperature}-${Date.now()}`
  console.log(`\nStarting run: ${runName}\n`)

  const session = langfuse.trace({
    name: `Experiment: ${runName}`,
    sessionId: runName,
    metadata: {
      model: config.model,
      temperature: config.temperature,
      system_prompt: config.system_prompt || 'default',
      dataset_version: dataset.version
    },
    tags: ['benchmark', config.model, dataset.version]
  })

  // 5. Run all test cases
  const results = []
  for (let i = 0; i < dataset.cases.length; i++) {
    const testCase = dataset.cases[i]
    console.log(`\n[${i + 1}/${dataset.cases.length}] Testing: ${testCase.id}`)

    const testSpan = session.span({
      name: testCase.id,
      metadata: {
        category: testCase.category,
        notes: testCase.notes
      }
    })

    try {
      // Ingest
      console.log('  Ingesting...')
      await ingestTestCase(testCase)

      // Wait for processing
      console.log('  Waiting for processing...')
      await sleep(15000)

      // Extract
      console.log('  Extracting results...')
      const extracted = await extractResults(testCase.input.group_id)

      // Score
      const scores = calculateScores(testCase.expectedOutput, extracted)

      // Log results
      console.log(`  Entity F1: ${scores.entity_f1.toFixed(3)}  Fact F1: ${scores.fact_f1.toFixed(3)}`)

      // Log to Langfuse
      testSpan.score({ name: 'entity_f1', value: scores.entity_f1 })
      testSpan.score({ name: 'entity_precision', value: scores.entity_precision })
      testSpan.score({ name: 'entity_recall', value: scores.entity_recall })
      testSpan.score({ name: 'fact_f1', value: scores.fact_f1 })
      testSpan.score({ name: 'fact_precision', value: scores.fact_precision })
      testSpan.score({ name: 'fact_recall', value: scores.fact_recall })
      testSpan.score({ name: 'parse_success', value: scores.parse_success ? 1 : 0 })

      testSpan.update({
        input: testCase.input,
        output: extracted
      })

      // Flag low-performing cases
      if (scores.entity_f1 < 0.5) {
        testSpan.update({
          metadata: {
            ...testSpan.metadata,
            warning: 'Low entity F1 score'
          }
        })
      }

      testSpan.end()
      results.push({ testCase: testCase.id, scores })

    } catch (error) {
      console.error(`  ✗ Error: ${(error as Error).message}`)
      testSpan.update({
        level: 'ERROR',
        statusMessage: (error as Error).message
      })
      testSpan.end()
      results.push({
        testCase: testCase.id,
        scores: {
          entity_f1: 0,
          fact_f1: 0,
          parse_success: false,
          error: (error as Error).message
        }
      })
    }
  }

  // 6. Aggregate scores
  const validResults = results.filter(r => r.scores.parse_success !== false)

  if (validResults.length === 0) {
    console.log('\n⚠️  All test cases failed - no valid results to aggregate')
    return
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length

  const aggregated = {
    entity_f1: avg(validResults.map(r => r.scores.entity_f1)),
    entity_precision: avg(validResults.map(r => r.scores.entity_precision)),
    entity_recall: avg(validResults.map(r => r.scores.entity_recall)),
    fact_f1: avg(validResults.map(r => r.scores.fact_f1)),
    fact_precision: avg(validResults.map(r => r.scores.fact_precision)),
    fact_recall: avg(validResults.map(r => r.scores.fact_recall)),
    parse_success_rate: (validResults.length / results.length) * 100
  }

  // Log aggregate scores to session
  session.score({ name: 'avg_entity_f1', value: aggregated.entity_f1 })
  session.score({ name: 'avg_entity_precision', value: aggregated.entity_precision })
  session.score({ name: 'avg_entity_recall', value: aggregated.entity_recall })
  session.score({ name: 'avg_fact_f1', value: aggregated.fact_f1 })
  session.score({ name: 'avg_fact_precision', value: aggregated.fact_precision })
  session.score({ name: 'avg_fact_recall', value: aggregated.fact_recall })
  session.score({ name: 'parse_success_rate', value: aggregated.parse_success_rate })

  // Display summary
  console.log('\n=== Summary ===')
  console.log(`Entity F1: ${aggregated.entity_f1.toFixed(3)}`)
  console.log(`Entity Precision: ${aggregated.entity_precision.toFixed(3)}`)
  console.log(`Entity Recall: ${aggregated.entity_recall.toFixed(3)}`)
  console.log(`Fact F1: ${aggregated.fact_f1.toFixed(3)}`)
  console.log(`Fact Precision: ${aggregated.fact_precision.toFixed(3)}`)
  console.log(`Fact Recall: ${aggregated.fact_recall.toFixed(3)}`)
  console.log(`Parse Success: ${aggregated.parse_success_rate.toFixed(1)}%`)
  console.log(`\nView details in Langfuse: ${process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com'}`)

  // Save results to file
  const resultsFile = `results/benchmark-${runName}.json`
  fs.mkdirSync('results', { recursive: true })
  fs.writeFileSync(
    resultsFile,
    JSON.stringify({ config, results, aggregated }, null, 2)
  )
  console.log(`Results saved to: ${resultsFile}`)

  // Shutdown Langfuse (flushes all pending events)
  await langfuse.shutdownAsync()

  console.log('\nBenchmark complete!')
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
