/**
 * Scenario 1: Learning from Mistake (JWT → Clerk)
 *
 * Tests memory system's ability to:
 * 1. Capture learning from failed approach → successful pivot
 * 2. Retrieve preference when similar problem encountered later
 *
 * Success criteria:
 * When queried "How should I implement auth in Expo?", system should
 * retrieve information guiding toward Clerk (not JWT)
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { ingestMessages, searchFacts } from '../../server/memory/graphiti-client'
import { evaluateGatekeeper } from '../../server/memory/gatekeeper'
import { getGraph } from '../../server/integrations/falkordb'

// Test scenario conversation
const CONVERSATION_TURNS = [
  {
    user: "I'm implementing authentication for our Expo app. Should I use JWT tokens?",
    assistant: "JWT tokens are a common choice for authentication. For an Expo app, you'd typically implement a custom JWT solution with token storage in SecureStore and refresh token logic."
  },
  {
    user: "I'm running into issues with JWT refresh tokens. They keep expiring unexpectedly and the refresh flow is buggy.",
    assistant: "JWT refresh token flows can be tricky in mobile apps. The token rotation and storage coordination between the app and backend often causes issues."
  },
  {
    user: "This is taking too long. Let's switch to Clerk instead.",
    assistant: "Good choice! Clerk is much more reliable for Expo apps. It handles all the token management, refresh logic, and session handling out of the box. You'll save a lot of time."
  },
  {
    user: "Agreed. I'll use Clerk for all future auth implementations.",
    assistant: "Perfect. I'll remember that Clerk is your preferred auth solution for Expo projects."
  }
]

// What we EXPECT to learn
const EXPECTED_KNOWLEDGE = {
  facts: [
    "Clerk preferred over JWT for Expo authentication",
    "JWT has refresh token issues in mobile apps",
    "Clerk handles token management automatically"
  ],
  entities: [
    "Clerk",
    "JWT",
    "Expo",
    "authentication"
  ],
  preference: {
    subject: "Clerk",
    domain: "Expo authentication",
    confidence: "high"
  }
}

// What Gatekeeper would extract (pattern-based)
const GATEKEEPER_EXTRACTIONS = CONVERSATION_TURNS.map(turn => ({
  user: turn.user,
  assistant: turn.assistant,
  gatekeeper: evaluateGatekeeper(turn.user, turn.assistant),
  patterns: extractWithPatterns(turn.user, turn.assistant)
}))

function extractWithPatterns(user: string, assistant: string) {
  const extractions: any[] = []

  // Pattern 1: "running into issues with X" → problem signal
  const issueMatch = user.match(/running into issues with (\w+)/i) ||
                     user.match(/issues with (\w+)/i)
  if (issueMatch) {
    extractions.push({
      type: 'problem',
      subject: issueMatch[1],
      text: user
    })
  }

  // Pattern 2: "Let's switch to X instead" → preference signal
  const switchMatch = user.match(/let'?s (?:switch to|use) (\w+)(?: instead)?/i)
  if (switchMatch) {
    extractions.push({
      type: 'preference',
      subject: switchMatch[1],
      reason: 'switched to',
      confidence: 'high'
    })
  }

  // Pattern 3: "I'll use X for all future..." → strong preference
  const futureMatch = user.match(/i'?ll use (\w+) for (?:all )?future/i)
  if (futureMatch) {
    extractions.push({
      type: 'preference',
      subject: futureMatch[1],
      scope: 'future',
      confidence: 'very high'
    })
  }

  // Pattern 4: Assistant confirms preference
  const rememberMatch = assistant.match(/i'?ll remember that (\w+) is (?:your )?preferred/i)
  if (rememberMatch) {
    extractions.push({
      type: 'preference_confirmed',
      subject: rememberMatch[1],
      confirmed_by: 'assistant'
    })
  }

  return extractions
}

describe('Scenario 1: JWT → Clerk Learning', () => {
  const groupId = `test-scenario-01-${Date.now()}`

  beforeAll(async () => {
    // Clear any previous test data
    const graph = await getGraph('galatea_memory')
    await graph.query(`
      MATCH (e:Entity)
      WHERE e.group_id = $groupId
      DETACH DELETE e
    `, { params: { groupId } })
  })

  it('Phase 1: Ingest conversation', async () => {
    console.log('\n=== PHASE 1: INGESTION ===\n')

    for (let i = 0; i < CONVERSATION_TURNS.length; i++) {
      const turn = CONVERSATION_TURNS[i]
      const turnId = `turn-${i + 1}`

      console.log(`[Turn ${i + 1}]`)
      console.log(`User: ${turn.user}`)
      console.log(`Assistant: ${turn.assistant}`)

      // Ingest (use correct Graphiti message format)
      const episodeBody = `user: ${turn.user}\nassistant: ${turn.assistant}`
      const result = await ingestMessages(groupId, [{
        role_type: 'user',
        role: 'user',
        name: turnId,
        source_description: `scenario-01-turn-${i + 1}`,
        content: episodeBody,
        uuid: turnId
      }])

      expect(result).toBe(true)
      console.log(`✓ Ingested as ${turnId}`)

      // Show gatekeeper decision
      const gatekeeper = evaluateGatekeeper(turn.user, turn.assistant)
      console.log(`Gatekeeper: ${gatekeeper.shouldIngest ? '✓ KEEP' : '✗ SKIP'} (${gatekeeper.category}) - ${gatekeeper.reason}`)
      console.log('')
    }

    // Wait for Graphiti processing
    console.log('Waiting 10 seconds for Graphiti entity extraction...')
    await new Promise(resolve => setTimeout(resolve, 10000))
  }, 30000)

  it('Phase 2: Inspect what Graphiti extracted', async () => {
    console.log('\n=== PHASE 2: GRAPHITI EXTRACTION ===\n')

    const graph = await getGraph('galatea_memory')

    // Get entities
    const entities = await graph.query(`
      MATCH (e:Entity)
      WHERE e.group_id = $groupId
      RETURN e.name as name, e.summary as summary
      ORDER BY e.name
    `, { params: { groupId } })

    console.log('Entities extracted:')
    if (entities.data && entities.data.length > 0) {
      for (const row of entities.data) {
        console.log(`  - ${row.name}${row.summary ? ` (${row.summary})` : ''}`)
      }
    } else {
      console.log('  (none)')
    }

    // Get facts
    const facts = await graph.query(`
      MATCH (source:Entity)-[r:RELATES_TO]->(target:Entity)
      WHERE r.group_id = $groupId
      RETURN source.name as source, target.name as target, r.fact as fact
    `, { params: { groupId } })

    console.log('\nFacts extracted:')
    if (facts.data && facts.data.length > 0) {
      for (const row of facts.data) {
        console.log(`  ${row.source} → ${row.target}: "${row.fact}"`)
      }
    } else {
      console.log('  (none)')
    }

    // Compare to expectations
    console.log('\n--- EXPECTED vs ACTUAL ---')
    console.log('\nExpected entities:', EXPECTED_KNOWLEDGE.entities.join(', '))
    console.log('Actual entities:', entities.data?.map((r: any) => r.name).join(', ') || '(none)')

    console.log('\nExpected facts:')
    EXPECTED_KNOWLEDGE.facts.forEach(f => console.log(`  - ${f}`))
    console.log('\nActual facts:')
    if (facts.data && facts.data.length > 0) {
      facts.data.forEach((f: any) => console.log(`  - ${f.fact}`))
    } else {
      console.log('  (none)')
    }
  }, 20000)

  it('Phase 3: Test retrieval query', async () => {
    console.log('\n=== PHASE 3: RETRIEVAL TEST ===\n')

    const query = "How should I implement auth in Expo?"
    console.log(`Query: "${query}"`)
    console.log('')

    const results = await searchFacts(query, [groupId], 10)

    console.log(`Retrieved ${results.length} facts:`)
    if (results.length > 0) {
      for (const fact of results) {
        console.log(`  - "${fact.fact}"`)
        console.log(`    Score: ${fact.score?.toFixed(3) || 'N/A'}`)
      }
    } else {
      console.log('  (none)')
    }

    // Check if Clerk preference was retrieved
    const clerkMentioned = results.some(r =>
      r.fact.toLowerCase().includes('clerk')
    )
    const jwtMentioned = results.some(r =>
      r.fact.toLowerCase().includes('jwt')
    )

    console.log('')
    console.log('--- RETRIEVAL QUALITY ---')
    console.log(`Clerk mentioned: ${clerkMentioned ? '✓ Yes' : '✗ No'}`)
    console.log(`JWT mentioned: ${jwtMentioned ? '✓ Yes' : '✗ No'}`)

    if (clerkMentioned) {
      console.log('✓ SUCCESS: Query retrieved Clerk preference')
    } else {
      console.log('✗ FAILURE: Query did NOT retrieve Clerk preference')
    }
  }, 20000)

  it('Phase 4: Show what Gatekeeper-based extraction would capture', async () => {
    console.log('\n=== PHASE 4: GATEKEEPER-BASED EXTRACTION ===\n')

    console.log('Pattern-based extractions from conversation:\n')

    GATEKEEPER_EXTRACTIONS.forEach((turn, i) => {
      console.log(`[Turn ${i + 1}]`)
      console.log(`User: ${turn.user.slice(0, 60)}...`)

      if (turn.patterns.length > 0) {
        console.log('Extracted:')
        turn.patterns.forEach(p => {
          console.log(`  - Type: ${p.type}`)
          console.log(`    Subject: ${p.subject || 'N/A'}`)
          if (p.reason) console.log(`    Reason: ${p.reason}`)
          if (p.confidence) console.log(`    Confidence: ${p.confidence}`)
        })
      } else {
        console.log('  (no patterns matched)')
      }
      console.log('')
    })

    // Aggregate what would be learned
    const allExtractions = GATEKEEPER_EXTRACTIONS.flatMap(t => t.patterns)
    const preferences = allExtractions.filter(e => e.type === 'preference' || e.type === 'preference_confirmed')
    const problems = allExtractions.filter(e => e.type === 'problem')

    console.log('--- AGGREGATED KNOWLEDGE ---')
    console.log('\nPreferences learned:')
    preferences.forEach(p => {
      console.log(`  - ${p.subject} (confidence: ${p.confidence || 'medium'})`)
    })

    console.log('\nProblems encountered:')
    problems.forEach(p => {
      console.log(`  - ${p.subject}`)
    })

    console.log('\nWould this solve the retrieval problem?')
    const hasClerkPreference = preferences.some(p =>
      p.subject.toLowerCase() === 'clerk'
    )
    console.log(`Has Clerk preference: ${hasClerkPreference ? '✓ Yes' : '✗ No'}`)

    if (hasClerkPreference) {
      console.log('✓ Pattern-based extraction would capture the key preference')
    } else {
      console.log('✗ Pattern-based extraction would also miss this')
    }
  })
})
