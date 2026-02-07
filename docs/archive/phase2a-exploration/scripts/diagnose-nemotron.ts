#!/usr/bin/env node
/**
 * Diagnose nemotron benchmark failures
 */

async function main() {
  const { getGraph } = await import('../server/integrations/falkordb')
  const graph = await getGraph('galatea_memory')

  const runTimestamp = '1770405535470'

  console.log('='.repeat(80))
  console.log('NEMOTRON DIAGNOSTIC')
  console.log('='.repeat(80))
  console.log()

  // Check all test groups for this run
  const allData = await graph.query(`
    MATCH (e:Entity)
    WHERE e.group_id STARTS WITH 'test-' AND e.group_id ENDS WITH '${runTimestamp}'
    RETURN DISTINCT e.group_id as group_id
    ORDER BY e.group_id
  `)

  console.log(`Total test groups with data: ${allData.data?.length || 0} / 22`)
  console.log()

  if (allData.data && allData.data.length > 0) {
    console.log('Groups with extracted entities:')
    for (const row of allData.data) {
      const groupId = row.group_id

      // Count entities
      const entities = await graph.query(`
        MATCH (e:Entity)
        WHERE e.group_id = $groupId
        RETURN count(e) as count
      `, { params: { groupId } })

      // Count facts
      const facts = await graph.query(`
        MATCH ()-[r:RELATES_TO]->()
        WHERE r.group_id = $groupId
        RETURN count(r) as count
      `, { params: { groupId } })

      const entityCount = entities.data?.[0]?.count || 0
      const factCount = facts.data?.[0]?.count || 0

      console.log(`  ${groupId.replace(`-${runTimestamp}`, '')}: ${entityCount} entities, ${factCount} facts`)
    }
  }

  console.log()
  console.log('─'.repeat(80))
  console.log('ANALYSIS:')
  console.log('─'.repeat(80))

  const testsWithData = allData.data?.length || 0
  const successRate = (testsWithData / 22 * 100).toFixed(1)

  console.log(`Data extraction success: ${testsWithData}/22 tests (${successRate}%)`)

  if (testsWithData < 5) {
    console.log()
    console.log('❌ CRITICAL FAILURE - Most tests failed completely')
    console.log('Likely causes:')
    console.log('  1. Ollama crashed/hung during processing')
    console.log('  2. Nemotron model timed out (24GB model is very large)')
    console.log('  3. Graphiti API errors (fetch failed)')
    console.log('  4. Model produced invalid output that crashed extraction')
    console.log()
    console.log('Recommendation: Nemotron-3-nano is too unreliable for production use')
  }
}

main().catch(console.error).finally(() => process.exit(0))
