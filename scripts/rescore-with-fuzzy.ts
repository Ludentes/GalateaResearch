#!/usr/bin/env node
/**
 * Re-score existing benchmark results with fuzzy matching
 */
import fs from 'fs'
import { calculateScores } from './lib/scoring'
import { calculateFuzzyScores } from './lib/fuzzy-scoring'
import type { ExpectedOutput, ExtractedOutput } from './lib/scoring'

async function main() {
  const { getGraph } = await import('../server/integrations/falkordb')
  const graph = await getGraph('galatea_memory')

  // Load golden dataset
  const dataset = JSON.parse(
    fs.readFileSync('tests/fixtures/graphiti-golden-dataset.json', 'utf8')
  )

  // Get run timestamps to analyze
  const runsToAnalyze = process.argv.slice(2)

  if (runsToAnalyze.length === 0) {
    console.log('Usage: tsx scripts/rescore-with-fuzzy.ts <run-timestamp-1> [run-timestamp-2] ...')
    console.log('\nExample: tsx scripts/rescore-with-fuzzy.ts 1770404507802')
    console.log('\nAvailable runs:')

    const resultsDir = 'results'
    const files = fs.readdirSync(resultsDir)
      .filter(f => f.startsWith('benchmark-') && f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 10)

    files.forEach(f => {
      const timestamp = f.match(/(\d{13})\.json$/)?.[1]
      if (timestamp) {
        const result = JSON.parse(fs.readFileSync(`${resultsDir}/${f}`, 'utf8'))
        console.log(`  ${timestamp} - ${result.config.model} (temp ${result.config.temperature})`)
      }
    })
    process.exit(1)
  }

  console.log('='.repeat(80))
  console.log('RE-SCORING WITH FUZZY MATCHING')
  console.log('='.repeat(80))
  console.log()

  for (const runTimestamp of runsToAnalyze) {
    console.log('─'.repeat(80))
    console.log(`Analyzing run: ${runTimestamp}`)
    console.log('─'.repeat(80))
    console.log()

    // Find config info from results file
    const resultsFiles = fs.readdirSync('results')
      .filter(f => f.includes(runTimestamp))

    let configInfo = 'Unknown'
    if (resultsFiles.length > 0) {
      const result = JSON.parse(fs.readFileSync(`results/${resultsFiles[0]}`, 'utf8'))
      configInfo = `${result.config.model} (temp ${result.config.temperature})`
    }
    console.log(`Config: ${configInfo}`)
    console.log()

    const strictResults = []
    const fuzzyResults = []

    // Process each test case
    for (const testCase of dataset.cases) {
      const groupId = `${testCase.input.group_id}-${runTimestamp}`

      // Extract from FalkorDB
      const entitiesResult = await graph.query(`
        MATCH (e:Entity)
        WHERE e.group_id = $groupId
        RETURN e.name as name, e.labels as labels
      `, { params: { groupId } })

      const factsResult = await graph.query(`
        MATCH (s:Entity)-[r:RELATES_TO]->(t:Entity)
        WHERE r.group_id = $groupId
        RETURN s.name as source, t.name as target, r.fact as fact
      `, { params: { groupId } })

      const extracted: ExtractedOutput = {
        entities: (entitiesResult.data || []).map((row: any) => ({
          name: row.name,
          labels: row.labels || []
        })),
        facts: (factsResult.data || []).map((row: any) => ({
          source: row.source,
          target: row.target,
          fact: row.fact
        })),
        parse_success: true,
        latency_ms: 0
      }

      // Score with both methods
      const strictScore = calculateScores(testCase.expectedOutput, extracted)
      const fuzzyScore = calculateFuzzyScores(testCase.expectedOutput, extracted, 0.7)

      strictResults.push(strictScore)
      fuzzyResults.push(fuzzyScore)
    }

    // Aggregate scores
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length

    const strictAgg = {
      entity_f1: avg(strictResults.map(r => r.entity_f1)),
      entity_precision: avg(strictResults.map(r => r.entity_precision)),
      entity_recall: avg(strictResults.map(r => r.entity_recall)),
      fact_f1: avg(strictResults.map(r => r.fact_f1)),
      fact_precision: avg(strictResults.map(r => r.fact_precision)),
      fact_recall: avg(strictResults.map(r => r.fact_recall))
    }

    const fuzzyAgg = {
      entity_f1: avg(fuzzyResults.map(r => r.entity_f1)),
      entity_precision: avg(fuzzyResults.map(r => r.entity_precision)),
      entity_recall: avg(fuzzyResults.map(r => r.entity_recall)),
      fact_f1: avg(fuzzyResults.map(r => r.fact_f1)),
      fact_precision: avg(fuzzyResults.map(r => r.fact_precision)),
      fact_recall: avg(fuzzyResults.map(r => r.fact_recall))
    }

    // Display comparison
    console.log('COMPARISON: Strict vs Fuzzy Matching')
    console.log()
    console.log('                    Strict    Fuzzy    Improvement')
    console.log('─'.repeat(60))
    console.log(`Entity F1:          ${strictAgg.entity_f1.toFixed(3)}    ${fuzzyAgg.entity_f1.toFixed(3)}    ${((fuzzyAgg.entity_f1 - strictAgg.entity_f1) * 100).toFixed(1)}%`)
    console.log(`Entity Precision:   ${strictAgg.entity_precision.toFixed(3)}    ${fuzzyAgg.entity_precision.toFixed(3)}    ${((fuzzyAgg.entity_precision - strictAgg.entity_precision) * 100).toFixed(1)}%`)
    console.log(`Entity Recall:      ${strictAgg.entity_recall.toFixed(3)}    ${fuzzyAgg.entity_recall.toFixed(3)}    ${((fuzzyAgg.entity_recall - strictAgg.entity_recall) * 100).toFixed(1)}%`)
    console.log()
    console.log(`Fact F1:            ${strictAgg.fact_f1.toFixed(3)}    ${fuzzyAgg.fact_f1.toFixed(3)}    ${((fuzzyAgg.fact_f1 - strictAgg.fact_f1) * 100).toFixed(1)}%`)
    console.log(`Fact Precision:     ${strictAgg.fact_precision.toFixed(3)}    ${fuzzyAgg.fact_precision.toFixed(3)}    ${((fuzzyAgg.fact_precision - strictAgg.fact_precision) * 100).toFixed(1)}%`)
    console.log(`Fact Recall:        ${strictAgg.fact_recall.toFixed(3)}    ${fuzzyAgg.fact_recall.toFixed(3)}    ${((fuzzyAgg.fact_recall - strictAgg.fact_recall) * 100).toFixed(1)}%`)
    console.log()

    // Interpretation
    if (fuzzyAgg.fact_f1 > strictAgg.fact_f1 + 0.2) {
      console.log('✅ SIGNIFICANT IMPROVEMENT - Fuzzy matching reveals usable data!')
      console.log('   The extracted facts are semantically correct but worded differently.')
    } else if (fuzzyAgg.fact_f1 > strictAgg.fact_f1 + 0.1) {
      console.log('⚠️  MODERATE IMPROVEMENT - Some benefit from fuzzy matching.')
      console.log('   Data quality is mixed - some facts match, many still missing.')
    } else {
      console.log('❌ MINIMAL IMPROVEMENT - Fuzzy matching doesn\'t help much.')
      console.log('   The core issue is lack of extracted facts, not matching strictness.')
    }
    console.log()
  }

  console.log('='.repeat(80))
  console.log('CONCLUSION')
  console.log('='.repeat(80))
  console.log()
  console.log('If fuzzy scores are significantly higher:')
  console.log('  → The data IS usable, just need looser matching')
  console.log('  → Consider implementing fuzzy matching in production')
  console.log()
  console.log('If fuzzy scores are still low:')
  console.log('  → Core problem is Graphiti not extracting facts')
  console.log('  → Consider hybrid approach or alternative solutions')
  console.log()
}

main().catch(console.error).finally(() => process.exit(0))
