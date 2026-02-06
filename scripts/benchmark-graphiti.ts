#!/usr/bin/env node
/**
 * Graphiti LLM Benchmark Runner
 *
 * Tests different LLM configurations (models, temperature, prompts) and logs
 * results to Langfuse for comparison.
 */

import fs from 'fs'
import Langfuse from 'langfuse'

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
