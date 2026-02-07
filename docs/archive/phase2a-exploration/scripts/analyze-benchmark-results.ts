#!/usr/bin/env node
/**
 * Deep analysis of benchmark results to identify specific failure patterns
 */
import fs from 'fs'

async function main() {
  const { getGraph } = await import('../server/integrations/falkordb')
  const graph = await getGraph('galatea_memory')

  // Get the most recent benchmark result file
  const resultsDir = 'results'
  const files = fs.readdirSync(resultsDir)
    .filter(f => f.startsWith('benchmark-') && f.endsWith('.json'))
    .sort()
    .reverse()

  if (files.length === 0) {
    console.error('No benchmark results found')
    process.exit(1)
  }

  const latestFile = files[0]
  console.log(`Analyzing: ${latestFile}\n`)

  const results = JSON.parse(fs.readFileSync(`${resultsDir}/${latestFile}`, 'utf8'))

  // Load golden dataset
  const dataset = JSON.parse(
    fs.readFileSync('tests/fixtures/graphiti-golden-dataset.json', 'utf8')
  )

  // Extract run timestamp from results
  const runTimestamp = latestFile.match(/(\d+)\.json$/)?.[1]
  if (!runTimestamp) {
    console.error('Could not extract run timestamp from filename')
    process.exit(1)
  }

  console.log('='.repeat(80))
  console.log('DEEP ANALYSIS OF FACT EXTRACTION FAILURES')
  console.log('='.repeat(80))
  console.log()

  // Analyze each test case
  for (const result of results.results) {
    const testCase = dataset.cases.find((c: any) => c.id === result.testCase)
    if (!testCase) continue

    const expectedFacts = testCase.expectedOutput.facts
    if (expectedFacts.length === 0) continue // Skip tests with no expected facts

    console.log('─'.repeat(80))
    console.log(`TEST: ${testCase.id}`)
    console.log('─'.repeat(80))
    console.log(`Input: "${testCase.input.messages[0].content}"`)
    console.log()

    console.log(`Expected Facts (${expectedFacts.length}):`)
    expectedFacts.forEach((f: any, i: number) => {
      console.log(`  ${i + 1}. ${f.source_entity} → ${f.target_entity}`)
      console.log(`     "${f.fact}"`)
    })
    console.log()

    // Query FalkorDB for actual extracted facts
    const groupId = `${testCase.input.group_id}-${runTimestamp}`

    const entitiesResult = await graph.query(`
      MATCH (e:Entity)
      WHERE e.group_id = $groupId
      RETURN e.name as name
    `, { params: { groupId } })

    const factsResult = await graph.query(`
      MATCH (s:Entity)-[r:RELATES_TO]->(t:Entity)
      WHERE r.group_id = $groupId
      RETURN s.name as source, t.name as target, r.fact as fact
    `, { params: { groupId } })

    console.log(`Extracted Entities (${entitiesResult.data?.length || 0}):`)
    if (entitiesResult.data && entitiesResult.data.length > 0) {
      entitiesResult.data.forEach((e: any) => {
        console.log(`  - ${e.name}`)
      })
    } else {
      console.log('  (none)')
    }
    console.log()

    console.log(`Extracted Facts (${factsResult.data?.length || 0}):`)
    if (factsResult.data && factsResult.data.length > 0) {
      factsResult.data.forEach((f: any, i: number) => {
        console.log(`  ${i + 1}. ${f.source} → ${f.target}`)
        console.log(`     "${f.fact}"`)
      })
    } else {
      console.log('  (none)')
    }
    console.log()

    // Analysis
    console.log('ANALYSIS:')

    if (!factsResult.data || factsResult.data.length === 0) {
      console.log('  ❌ NO FACTS EXTRACTED - Graphiti created zero relationships')
      console.log('     This is the most common failure mode')
    } else {
      // Check for direction issues
      const directionIssues = factsResult.data.filter((extracted: any) => {
        return expectedFacts.some((expected: any) => {
          const sourceMatch = extracted.source.toLowerCase() === expected.target_entity.toLowerCase()
          const targetMatch = extracted.target.toLowerCase() === expected.source_entity.toLowerCase()
          return sourceMatch && targetMatch // Reversed!
        })
      })

      if (directionIssues.length > 0) {
        console.log('  ⚠️  DIRECTION REVERSED - Facts have source/target swapped')
      }

      // Check for missing details
      const detailIssues = factsResult.data.filter((extracted: any) => {
        return expectedFacts.some((expected: any) => {
          const factWords = expected.fact.split(' ')
          const extractedWords = extracted.fact.split(' ')
          return factWords.length > extractedWords.length + 3 // Missing significant content
        })
      })

      if (detailIssues.length > 0) {
        console.log('  ⚠️  MISSING DETAILS - Facts lack important context from input')
      }

      // Check for completely wrong facts
      const wrongFacts = factsResult.data.filter((extracted: any) => {
        return !expectedFacts.some((expected: any) => {
          const extractedFact = extracted.fact.toLowerCase()
          const expectedFact = expected.fact.toLowerCase()
          // Check if they share significant words
          const expectedWords = new Set(expectedFact.split(' ').filter(w => w.length > 3))
          const extractedWords = new Set(extractedFact.split(' ').filter(w => w.length > 3))
          const overlap = [...expectedWords].filter(w => extractedWords.has(w)).length
          return overlap >= expectedWords.size * 0.5 // At least 50% word overlap
        })
      })

      if (wrongFacts.length > 0) {
        console.log('  ❌ HALLUCINATED FACTS - Extracted facts not present in input')
      }
    }

    console.log()
    console.log(`Scores: Entity F1=${result.scores.entity_f1.toFixed(3)}, Fact F1=${result.scores.fact_f1.toFixed(3)}`)
    console.log()
  }

  console.log('='.repeat(80))
  console.log('SUMMARY OF FAILURE PATTERNS')
  console.log('='.repeat(80))

  const patterns = {
    no_facts: 0,
    reversed: 0,
    missing_details: 0,
    hallucinated: 0,
    correct: 0
  }

  for (const result of results.results) {
    if (result.scores.fact_f1 === 0) {
      patterns.no_facts++
    } else if (result.scores.fact_f1 === 1) {
      patterns.correct++
    } else {
      // Partial match - some issue present
      patterns.missing_details++
    }
  }

  console.log(`No facts extracted:    ${patterns.no_facts} / ${results.results.length}`)
  console.log(`Missing details:       ${patterns.missing_details} / ${results.results.length}`)
  console.log(`Perfect extraction:    ${patterns.correct} / ${results.results.length}`)
  console.log()
  console.log(`Overall Fact F1: ${results.aggregated.fact_f1.toFixed(3)}`)
  console.log()
}

main().catch(console.error).finally(() => process.exit(0))
