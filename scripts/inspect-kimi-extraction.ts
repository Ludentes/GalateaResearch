#!/usr/bin/env node
/**
 * Inspect what Kimi actually extracted to FalkorDB
 */

async function main() {
  const { getGraph } = await import('../server/integrations/falkordb')
  const graph = await getGraph('galatea_memory')

  // Find Kimi run data
  const runTimestamp = '1770404507802'

  console.log('='.repeat(80))
  console.log('WHAT DID KIMI K2.5 ACTUALLY EXTRACT?')
  console.log('='.repeat(80))
  console.log()

  // Get ALL entities from Kimi run
  const allEntities = await graph.query(`
    MATCH (e:Entity)
    WHERE e.group_id STARTS WITH 'test-' AND e.group_id ENDS WITH '${runTimestamp}'
    RETURN e.name as name, e.group_id as group_id, e.labels as labels
    ORDER BY e.group_id
  `)

  console.log(`Total Entities Extracted: ${allEntities.data?.length || 0}`)
  console.log()

  // Group by test
  const entitiesByTest = new Map()
  if (allEntities.data) {
    for (const entity of allEntities.data) {
      const testId = entity.group_id.replace(`-${runTimestamp}`, '')
      if (!entitiesByTest.has(testId)) {
        entitiesByTest.set(testId, [])
      }
      entitiesByTest.get(testId).push(entity)
    }
  }

  // Get ALL facts from Kimi run
  const allFacts = await graph.query(`
    MATCH (s:Entity)-[r:RELATES_TO]->(t:Entity)
    WHERE r.group_id STARTS WITH 'test-' AND r.group_id ENDS WITH '${runTimestamp}'
    RETURN s.name as source, t.name as target, r.fact as fact, r.group_id as group_id
    ORDER BY r.group_id
  `)

  console.log(`Total Facts Extracted: ${allFacts.data?.length || 0}`)
  console.log()

  // Group by test
  const factsByTest = new Map()
  if (allFacts.data) {
    for (const fact of allFacts.data) {
      const testId = fact.group_id.replace(`-${runTimestamp}`, '')
      if (!factsByTest.has(testId)) {
        factsByTest.set(testId, [])
      }
      factsByTest.get(testId).push(fact)
    }
  }

  // Show first 5 test cases in detail
  const testIds = Array.from(entitiesByTest.keys()).slice(0, 5)

  for (const testId of testIds) {
    console.log('─'.repeat(80))
    console.log(`Test: ${testId}`)
    console.log('─'.repeat(80))

    const entities = entitiesByTest.get(testId) || []
    const facts = factsByTest.get(testId) || []

    console.log(`\nEntities (${entities.length}):`)
    entities.forEach((e: any) => {
      console.log(`  - ${e.name}`)
      if (e.labels && e.labels.length > 0) {
        console.log(`    labels: ${e.labels.join(', ')}`)
      }
    })

    console.log(`\nFacts (${facts.length}):`)
    if (facts.length === 0) {
      console.log('  (none - this is why Fact F1 = 0)')
    } else {
      facts.forEach((f: any, i: number) => {
        console.log(`  ${i + 1}. ${f.source} → ${f.target}`)
        console.log(`     "${f.fact}"`)
      })
    }
    console.log()
  }

  console.log('='.repeat(80))
  console.log('KEY QUESTIONS:')
  console.log('='.repeat(80))
  console.log()
  console.log('1. Are the entities reasonable/useful? (even if names differ)')
  console.log('2. Are there ANY facts at all? Or mostly zero?')
  console.log('3. If facts exist, are they semantically correct (even if wording differs)?')
  console.log('4. Could this data be valuable with looser matching?')
  console.log()
}

main().catch(console.error).finally(() => process.exit(0))
