#!/usr/bin/env node
/**
 * Rescore Mem0 results using atomic fact scoring.
 *
 * The original scoring expected structured triples, but Mem0 returns atomic facts.
 * This script applies appropriate scoring for the atomic fact format.
 */

import fs from 'fs'
import { scoreAtomicFacts, scoreAtomicEntities } from './lib/atomic-scoring'
import type { AtomicFact, ExpectedFact } from './lib/atomic-scoring'

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
  console.log('='.repeat(80))
  console.log('ATOMIC FACT SCORING - Mem0 GPT-OSS')
  console.log('='.repeat(80))
  console.log()

  // Score each test case
  const results: any[] = []

  for (const testCase of dataset.cases) {
    const memories = byTestCase.get(testCase.id) || []

    // Convert to atomic facts
    const atomicFacts: AtomicFact[] = memories.map(mem => ({
      memory: mem.payload?.data || ''
    })).filter(f => f.memory) // Remove empty

    // Convert expected output to format for atomic scoring
    const expectedFacts: ExpectedFact[] = testCase.expectedOutput.facts.map(f => ({
      fact: f.fact,
      source_entity: f.source_entity,
      target_entity: f.target_entity
    }))

    // Score facts
    const factScores = scoreAtomicFacts(atomicFacts, expectedFacts)

    // Score entities
    const entityScores = scoreAtomicEntities(
      atomicFacts,
      testCase.expectedOutput.entities
    )

    console.log(`[${testCase.id}] ${testCase.category}`)
    console.log(`  Memories: ${atomicFacts.length}`)
    console.log(`  Entity Recall: ${(entityScores.recall * 100).toFixed(1)}% (found ${entityScores.found.length}/${testCase.expectedOutput.entities.length})`)
    console.log(`  Entity F1: ${(entityScores.f1 * 100).toFixed(1)}%`)
    console.log(`  Fact Recall: ${(factScores.recall * 100).toFixed(1)}% (matched ${factScores.matches}/${expectedFacts.length})`)
    console.log(`  Fact F1: ${(factScores.f1 * 100).toFixed(1)}%`)

    // Show which entities were found
    if (entityScores.found.length > 0) {
      console.log(`  Found entities: ${entityScores.found.join(', ')}`)
    }

    // Show sample memories
    if (atomicFacts.length > 0) {
      console.log(`  Sample: "${atomicFacts[0].memory.substring(0, 60)}${atomicFacts[0].memory.length > 60 ? '...' : ''}"`)
    }

    console.log()

    results.push({
      test_case_id: testCase.id,
      category: testCase.category,
      memories_count: atomicFacts.length,
      entity_precision: entityScores.precision,
      entity_recall: entityScores.recall,
      entity_f1: entityScores.f1,
      fact_precision: factScores.precision,
      fact_recall: factScores.recall,
      fact_f1: factScores.f1,
      parse_success: atomicFacts.length > 0,
      entities_found: entityScores.found
    })
  }

  // Calculate aggregates
  const validResults = results.filter(r => r.parse_success)
  const avgEntityF1 = validResults.reduce((sum, r) => sum + r.entity_f1, 0) / validResults.length
  const avgFactF1 = validResults.reduce((sum, r) => sum + r.fact_f1, 0) / validResults.length
  const avgEntityRecall = validResults.reduce((sum, r) => sum + r.entity_recall, 0) / validResults.length
  const avgFactRecall = validResults.reduce((sum, r) => sum + r.fact_recall, 0) / validResults.length
  const parseSuccessRate = validResults.length / dataset.cases.length

  console.log('='.repeat(80))
  console.log('AGGREGATE RESULTS - Mem0 with GPT-OSS (Atomic Scoring)')
  console.log('='.repeat(80))
  console.log(`Parse Success Rate: ${(parseSuccessRate * 100).toFixed(1)}%`)
  console.log(`Avg Entity Recall: ${(avgEntityRecall * 100).toFixed(1)}%`)
  console.log(`Avg Entity F1: ${(avgEntityF1 * 100).toFixed(1)}%`)
  console.log(`Avg Fact Recall: ${(avgFactRecall * 100).toFixed(1)}%`)
  console.log(`Avg Fact F1: ${(avgFactF1 * 100).toFixed(1)}%`)
  console.log('='.repeat(80))

  // Compare to Graphiti baseline
  console.log()
  console.log('COMPARISON TO GRAPHITI GPT-OSS:')
  console.log('  Graphiti Entity F1: 51.9%')
  console.log(`  Mem0 Entity F1:     ${(avgEntityF1 * 100).toFixed(1)}%`)
  console.log()
  console.log('  Graphiti Fact F1 (Fuzzy): 21.1%')
  console.log(`  Mem0 Fact F1 (Atomic):    ${(avgFactF1 * 100).toFixed(1)}%`)
  console.log()

  // Save results
  const outputPath = `benchmark-results/mem0-gpt-oss-atomic-scored-${Date.now()}.json`
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        model: 'gpt-oss:latest',
        system: 'mem0',
        scoring_method: 'atomic',
        dataset_version: dataset.version,
        results,
        aggregate: {
          parse_success_rate: parseSuccessRate,
          avg_entity_recall: avgEntityRecall,
          avg_entity_f1: avgEntityF1,
          avg_fact_recall: avgFactRecall,
          avg_fact_f1: avgFactF1
        }
      },
      null,
      2
    )
  )

  console.log(`Results saved to: ${outputPath}`)
}

main().catch(console.error)
