#!/usr/bin/env node
/**
 * Score existing Mem0 results from Qdrant against golden dataset
 */

import fs from 'fs'
import { calculateScores } from './lib/scoring'
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
}

async function main() {
  // Load golden dataset
  const dataset: GoldenDataset = JSON.parse(
    fs.readFileSync('tests/fixtures/graphiti-golden-dataset.json', 'utf8')
  )

  // Fetch all Mem0 data from Qdrant
  const response = await fetch('http://localhost:6333/collections/mem0_benchmark/points/scroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      limit: 100,
      with_payload: true,
      with_vector: false
    })
  })

  const data = await response.json() as any
  const points = data?.result?.points || []

  console.log(`\nFetched ${points.length} memories from Qdrant\n`)

  // Group by test case
  const byTestCase = new Map<string, any[]>()
  for (const point of points) {
    const testCaseId = point.payload?.test_case_id
    if (!testCaseId) continue

    if (!byTestCase.has(testCaseId)) {
      byTestCase.set(testCaseId, [])
    }
    byTestCase.get(testCaseId)!.push(point)
  }

  console.log(`Grouped into ${byTestCase.size} test cases\n`)

  // Score each test case
  const results: any[] = []

  for (const testCase of dataset.cases) {
    const memories = byTestCase.get(testCase.id) || []

    // Extract entities and facts from memories
    const entities: Array<{ name: string; labels: string[] }> = []
    const facts: Array<{ source: string; target: string; fact: string }> = []

    for (const mem of memories) {
      const text = mem.payload?.data || ''
      if (!text) continue

      // Extract entity-like patterns
      const entityMatches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || []
      for (const entity of entityMatches) {
        if (!entities.some(e => e.name.toLowerCase() === entity.toLowerCase())) {
          entities.push({ name: entity, labels: [] })
        }
      }

      // Parse fact patterns: "X verb Y" or treat whole text as fact
      const factMatch = text.match(/^(.+?)\s+(is|has|uses|prefers?|wants?|feels?|will|should|includes?|switched)\s+(.+)$/i)
      if (factMatch) {
        const [, source, , target] = factMatch
        facts.push({
          source: source.trim(),
          target: target.trim(),
          fact: text
        })
      } else {
        // Treat as user-centric fact
        facts.push({
          source: 'user',
          target: 'user',
          fact: text
        })
      }
    }

    const extracted: ExtractedOutput = {
      entities,
      facts,
      parse_success: memories.length > 0,
      latency_ms: 0
    }

    const scores = calculateScores(
      testCase.expectedOutput,
      extracted
    )

    console.log(`[${testCase.id}]`)
    console.log(`  Memories: ${memories.length}`)
    console.log(`  Entities: ${entities.length} (expected ${testCase.expectedOutput.entities.length})`)
    console.log(`  Facts: ${facts.length} (expected ${testCase.expectedOutput.facts.length})`)
    console.log(`  Entity F1: ${scores.entity_f1.toFixed(3)}`)
    console.log(`  Fact F1: ${scores.fact_f1.toFixed(3)}`)
    console.log()

    results.push({
      test_case_id: testCase.id,
      category: testCase.category,
      memories_count: memories.length,
      ...scores
    })
  }

  // Calculate aggregates
  const validResults = results.filter(r => r.parse_success)
  const avgEntityF1 = validResults.reduce((sum, r) => sum + r.entity_f1, 0) / validResults.length
  const avgFactF1 = validResults.reduce((sum, r) => sum + r.fact_f1, 0) / validResults.length
  const parseSuccessRate = validResults.length / dataset.cases.length

  console.log(`${'='.repeat(70)}`)
  console.log('AGGREGATE RESULTS - Mem0 with GPT-OSS')
  console.log(`${'='.repeat(70)}`)
  console.log(`Parse Success Rate: ${(parseSuccessRate * 100).toFixed(1)}%`)
  console.log(`Avg Entity F1: ${avgEntityF1.toFixed(3)}`)
  console.log(`Avg Fact F1: ${avgFactF1.toFixed(3)}`)
  console.log(`${'='.repeat(70)}`)

  // Save results
  const outputPath = `benchmark-results/mem0-gpt-oss-scored-${Date.now()}.json`
  fs.mkdirSync('benchmark-results', { recursive: true })
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        model: 'gpt-oss:latest',
        system: 'mem0',
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

  console.log(`\nResults saved to: ${outputPath}`)
}

main().catch(console.error)
