#!/usr/bin/env node
/**
 * Graphiti LLM Benchmark Runner
 *
 * Tests different LLM configurations (models, temperature, prompts) and logs
 * results to Langfuse for comparison.
 */

import { config } from 'dotenv'
// Load .env.local for benchmark-specific Langfuse credentials
config({ path: '.env.local' })

import fs from 'fs'
import yaml from 'yaml'
import Langfuse from 'langfuse'
import type { ExtractedOutput } from './lib/scoring'
import { calculateScores } from './lib/scoring'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

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
  base_url?: string
  api_key_env?: string
}

/**
 * Clear previous benchmark data from FalkorDB.
 */
async function clearBenchmarkData(): Promise<void> {
  const { getGraph } = await import('../server/integrations/falkordb')
  const graph = await getGraph('galatea_memory')

  console.log('Clearing previous benchmark data...')

  // Delete all entities with benchmark group_ids (test-*)
  await graph.query(`
    MATCH (e:Entity)
    WHERE e.group_id STARTS WITH 'test-'
    DELETE e
  `)

  // Delete all relationships with benchmark group_ids
  await graph.query(`
    MATCH ()-[r:RELATES_TO]->()
    WHERE r.group_id STARTS WITH 'test-'
    DELETE r
  `)

  console.log('✓ Cleared benchmark data\n')
}

/**
 * Ingest a test case into Graphiti.
 */
async function ingestTestCase(testCase: TestCase, runTimestamp: number): Promise<void> {
  const uniqueGroupId = `${testCase.input.group_id}-${runTimestamp}`

  const graphitiMessages = testCase.input.messages.map((m, idx) => ({
    content: m.content,
    role_type: m.role,
    role: m.role,
    name: `${testCase.id}-msg${idx}`,
    source_description: `benchmark:${testCase.id}`,
    group_id: uniqueGroupId
  }))

  const response = await fetch('http://localhost:18000/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      group_id: uniqueGroupId,
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
 * Load configuration from YAML file or env vars.
 */
function loadConfig(configNameOrPath?: string): Config {
  if (!configNameOrPath) {
    // Load from environment variables
    return {
      name: 'env-vars',
      model: process.env.MODEL_NAME || 'llama3.2',
      temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
      system_prompt: process.env.SYSTEM_PROMPT
    }
  }

  // Load from YAML file
  const configs = yaml.parse(
    fs.readFileSync('tests/configs/graphiti-benchmark-configs.yaml', 'utf8')
  )

  const config = configs.configurations.find((c: Config) => c.name === configNameOrPath)
  if (!config) {
    throw new Error(`Configuration not found: ${configNameOrPath}`)
  }

  return config
}

/**
 * Update Graphiti container environment and restart.
 */
async function updateGraphitiConfig(config: Config): Promise<void> {
  // Build env content
  const lines = [
    `MODEL_NAME=${config.model}`,
    `TEMPERATURE=${config.temperature}`
  ]

  if (config.system_prompt) {
    lines.push(`SYSTEM_PROMPT="${config.system_prompt.replace(/\n/g, '\\n')}"`)
  }

  if (config.base_url) {
    lines.push(`OPENAI_BASE_URL=${config.base_url}`)
  }

  if (config.api_key_env) {
    const apiKey = process.env[config.api_key_env]
    if (!apiKey) {
      throw new Error(`API key not found in environment: ${config.api_key_env}`)
    }
    lines.push(`OPENAI_API_KEY=${apiKey}`)
  }

  const envContent = lines.join('\n')
  fs.writeFileSync('.env.graphiti', envContent)

  console.log('Restarting Graphiti container...')
  await execAsync('docker compose restart graphiti')

  console.log('Waiting for Graphiti to be healthy...')
  await waitForGraphitiHealthy()
  console.log('✓ Graphiti ready\n')
}

/**
 * Wait for Graphiti healthcheck to pass.
 */
async function waitForGraphitiHealthy(maxWaitMs = 30000): Promise<void> {
  const startTime = Date.now()
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch('http://localhost:18000/healthcheck')
      if (response.ok) {
        const data = await response.json()
        if (data.status === 'healthy') {
          return
        }
      }
    } catch (error) {
      // Not ready yet
    }
    await sleep(1000)
  }
  throw new Error('Graphiti did not become healthy in time')
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
      error: (error as Error).message
    }
  }
}

async function main() {
  console.log('=== Graphiti LLM Benchmark ===\n')

  // Parse CLI args
  const args = process.argv.slice(2)
  const configFlag = args.find(arg => arg.startsWith('--config='))
  const configName = configFlag?.split('=')[1]
  const cleanFlag = args.includes('--clean')

  // 1. Setup Langfuse (dedicated benchmark project)
  const langfuse = new Langfuse({
    secretKey: process.env.BENCHMARK_LANGFUSE_SECRET_KEY!,
    publicKey: process.env.BENCHMARK_LANGFUSE_PUBLIC_KEY!,
    baseUrl: process.env.BENCHMARK_LANGFUSE_BASE_URL
  })

  // 2. Optional cleanup
  if (cleanFlag) {
    await clearBenchmarkData()
  }

  // 3. Load golden dataset
  const dataset: GoldenDataset = JSON.parse(
    fs.readFileSync('tests/fixtures/graphiti-golden-dataset.json', 'utf8')
  )

  console.log(`Loaded dataset: ${dataset.description}`)
  console.log(`Version: ${dataset.version}`)
  console.log(`Test cases: ${dataset.cases.length}\n`)

  // Upload golden dataset to Langfuse (if not exists)
  const datasetName = `graphiti-golden-${dataset.version}`
  let langfuseDataset = await langfuse.api.datasetsGet(datasetName).catch(() => null)

  if (!langfuseDataset) {
    console.log(`Creating Langfuse dataset: ${datasetName}`)
    langfuseDataset = await langfuse.api.datasetsCreate({
      name: datasetName,
      description: dataset.description,
      metadata: { version: dataset.version }
    })

    // Upload all test cases as dataset items
    for (const testCase of dataset.cases) {
      await langfuse.api.datasetItemsCreate({
        datasetName: datasetName,
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        metadata: {
          id: testCase.id,
          category: testCase.category,
          notes: testCase.notes
        }
      })
    }
    console.log(`  Uploaded ${dataset.cases.length} test cases to dataset`)
  } else {
    console.log(`Using existing Langfuse dataset: ${datasetName}`)
  }

  // 4. Load config
  const config: Config = loadConfig(configName)

  console.log(`Configuration: ${config.model} (temp=${config.temperature})`)

  // Update Graphiti container with config (if using named config)
  if (configName) {
    console.log('Updating Graphiti configuration...')
    await updateGraphitiConfig(config)
  } else {
    console.log('Using env vars - Graphiti container not restarted\n')
  }

  // Manage system prompt via Langfuse Prompts
  let promptVersion = null
  if (config.system_prompt) {
    const promptName = `graphiti-system-prompt-${config.name}`

    // Always create a new prompt version - Langfuse handles deduplication
    // This avoids the "prompt not found" error on first run
    promptVersion = await langfuse.createPrompt({
      name: promptName,
      prompt: config.system_prompt,
      config: {
        model: config.model,
        temperature: config.temperature
      }
    })
    console.log(`  Using prompt: ${promptName} (version ${promptVersion.version})`)
  }

  // 5. Create Langfuse session for this run
  const runTimestamp = Date.now()
  const runName = `${config.model}-temp${config.temperature}-${runTimestamp}`
  console.log(`\nStarting run: ${runName}\n`)

  const session = langfuse.trace({
    name: `Experiment: ${runName}`,
    sessionId: runName,
    metadata: {
      model: config.model,
      temperature: config.temperature,
      system_prompt: config.system_prompt || 'default',
      prompt_name: promptVersion?.name,
      prompt_version: promptVersion?.version,
      dataset_version: dataset.version,
      dataset_name: datasetName
    },
    tags: ['benchmark', config.model, dataset.version]
  })

  // 6. Run all test cases
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
      await ingestTestCase(testCase, runTimestamp)

      // Wait for processing
      const processingDelay = parseInt(process.env.BENCHMARK_PROCESSING_DELAY || '5000')
      console.log(`  Waiting for processing (${processingDelay}ms)...`)
      await sleep(processingDelay)

      // Extract
      console.log('  Extracting results...')
      const extracted = await extractResults(`${testCase.input.group_id}-${runTimestamp}`)

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
          entity_precision: 0,
          entity_recall: 0,
          entity_f1: 0,
          fact_precision: 0,
          fact_recall: 0,
          fact_f1: 0,
          parse_success: false,
          total_entities: 0,
          total_facts: 0,
          latency_ms: 0
        }
      })
    }
  }

  // 7. Aggregate scores
  const validResults = results.filter(r => r.scores.parse_success !== false && 'entity_precision' in r.scores)

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
  console.log(`\nView details in Langfuse: ${process.env.BENCHMARK_LANGFUSE_BASE_URL || 'https://cloud.langfuse.com'}`)

  // Save results to file
  // Sanitize filename (replace slashes from model names like moonshotai/kimi)
  const safeRunName = runName.replace(/\//g, '-')
  const resultsFile = `results/benchmark-${safeRunName}.json`
  fs.mkdirSync('results', { recursive: true })
  fs.writeFileSync(
    resultsFile,
    JSON.stringify({ config, results, aggregated }, null, 2)
  )
  console.log(`Results saved to: ${resultsFile}`)

  // Shutdown Langfuse (flushes all pending events)
  // Add timeout to prevent hanging
  await Promise.race([
    langfuse.shutdownAsync(),
    new Promise(resolve => setTimeout(resolve, 5000))
  ])

  console.log('\nBenchmark complete!')

  // Force exit to prevent hanging (Langfuse sometimes keeps event loop alive)
  process.exit(0)
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
