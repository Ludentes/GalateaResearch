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

  // 4. Run test cases (one for now - testing ingestion)
  const testCase = dataset.cases[0]
  console.log(`\nTesting ingestion with: ${testCase.id}`)

  try {
    await ingestTestCase(testCase)
    console.log('  ✓ Ingested to Graphiti')

    console.log('  Waiting 15s for processing...')
    await sleep(15000)

    console.log('  ✓ Processing complete')

    console.log('  Extracting results from FalkorDB...')
    const extracted = await extractResults(testCase.input.group_id)

    console.log(`  ✓ Extracted ${extracted.entities.length} entities, ${extracted.facts.length} facts`)
    console.log(`  Entities: ${extracted.entities.map(e => e.name).join(', ')}`)
  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`)
  }

  // Shutdown Langfuse
  await langfuse.shutdownAsync()

  console.log('\nBenchmark complete!')
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
