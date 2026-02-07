/**
 * Scenario 1: Learning from Mistake (JWT → Clerk) - Mem0-Style Approach
 *
 * Tests RAG-style memory (Mem0 approach):
 * 1. Store full conversation text (no extraction)
 * 2. Use vector embeddings for semantic search
 * 3. Retrieve relevant context based on query
 *
 * Using: Ollama (embeddings) + Qdrant (vector store)
 */

import { describe, it, expect, beforeAll } from 'vitest'

// Test scenario conversation (same as other tests)
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

const QDRANT_URL = 'http://localhost:6333'
const OLLAMA_URL = 'http://localhost:11434'
const COLLECTION_NAME = 'mem0_style_test'

// Helper: Get embeddings from Ollama
async function getEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'nomic-embed-text',
      prompt: text
    })
  })

  const data = await response.json() as { embedding: number[] }
  return data.embedding
}

// Helper: Create Qdrant collection
async function createCollection() {
  await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
    method: 'DELETE'
  }).catch(() => {}) // Ignore if doesn't exist

  await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vectors: {
        size: 768, // nomic-embed-text dimension
        distance: 'Cosine'
      }
    })
  })
}

// Helper: Store memory in Qdrant
async function storeMemory(id: string, text: string, metadata: any) {
  const embedding = await getEmbedding(text)

  await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      points: [{
        id,
        vector: embedding,
        payload: {
          text,
          ...metadata
        }
      }]
    })
  })
}

// Helper: Search memories
async function searchMemories(query: string, limit: number = 5) {
  const queryEmbedding = await getEmbedding(query)

  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector: queryEmbedding,
      limit,
      with_payload: true
    })
  })

  const data = await response.json() as { result: Array<{ id: string | number, score: number, payload: any }> }
  return data.result
}

describe('Scenario 1: JWT → Clerk Learning (Mem0-Style RAG)', () => {
  beforeAll(async () => {
    await createCollection()
  }, 30000)

  it('Phase 1: Store conversations as full text', async () => {
    console.log('\n=== PHASE 1: MEM0-STYLE STORAGE ===\n')

    for (let i = 0; i < CONVERSATION_TURNS.length; i++) {
      const turn = CONVERSATION_TURNS[i]
      const turnId = `turn-${i + 1}`

      console.log(`[Turn ${i + 1}]`)
      console.log(`User: ${turn.user}`)
      console.log(`Assistant: ${turn.assistant}`)

      // Store full conversation text (Mem0 approach: no extraction)
      const fullText = `User: ${turn.user}\n\nAssistant: ${turn.assistant}`

      await storeMemory(turnId, fullText, {
        turn: i + 1,
        type: 'conversation',
        timestamp: Date.now()
      })

      console.log(`✓ Stored in Qdrant (ID: ${turnId})`)
      console.log('')
    }

    console.log('All conversations stored')
  }, 60000)

  it('Phase 2: Inspect storage', async () => {
    console.log('\n=== PHASE 2: STORAGE INSPECTION ===\n')

    const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`)
    const data = await response.json() as { result: { points_count: number } }

    console.log(`Total memories stored: ${data.result.points_count}`)
    expect(data.result.points_count).toBe(4)
  }, 20000)

  it('Phase 3: Test retrieval query', async () => {
    console.log('\n=== PHASE 3: RETRIEVAL TEST ===\n')

    const query = "How should I implement auth in Expo?"
    console.log(`Query: "${query}"`)
    console.log('')

    const results = await searchMemories(query, 5)

    console.log(`Retrieved ${results.length} memories:`)
    for (const result of results) {
      console.log(`\n  [Score: ${result.score.toFixed(3)}]`)
      console.log(`  ${result.payload.text.replace(/\n/g, '\n  ')}`)
    }

    // Check if Clerk preference was retrieved
    const clerkMentioned = results.some(r =>
      r.payload.text.toLowerCase().includes('clerk')
    )
    const jwtMentioned = results.some(r =>
      r.payload.text.toLowerCase().includes('jwt')
    )

    console.log('')
    console.log('--- RETRIEVAL QUALITY ---')
    console.log(`Clerk mentioned: ${clerkMentioned ? '✓ Yes' : '✗ No'}`)
    console.log(`JWT mentioned: ${jwtMentioned ? '✓ Yes' : '✗ No'}`)

    if (clerkMentioned) {
      console.log('✓ SUCCESS: Query retrieved Clerk-related information')
    } else {
      console.log('✗ FAILURE: Query did NOT retrieve Clerk information')
    }

    expect(clerkMentioned).toBe(true)
  }, 60000)

  it('Phase 4: Test specific preference retrieval', async () => {
    console.log('\n=== PHASE 4: PREFERENCE CLARITY TEST ===\n')

    const query = "What authentication library should I use for Expo?"
    console.log(`Query: "${query}"`)
    console.log('')

    const results = await searchMemories(query, 3)

    console.log(`Top ${results.length} results:`)
    for (const result of results) {
      console.log(`\n  [Relevance: ${(result.score * 100).toFixed(1)}%]`)
      const text = result.payload.text
      // Truncate for readability
      const preview = text.length > 200 ? text.slice(0, 200) + '...' : text
      console.log(`  ${preview.replace(/\n/g, '\n  ')}`)
    }

    // Check if preference is clear from top results
    const topResult = results[0]
    const hasClerkPreference = topResult &&
      topResult.payload.text.toLowerCase().includes('clerk') &&
      (topResult.payload.text.toLowerCase().includes('prefer') ||
       topResult.payload.text.toLowerCase().includes('use clerk') ||
       topResult.payload.text.toLowerCase().includes('switch to clerk'))

    console.log('')
    console.log('--- PREFERENCE CLARITY ---')
    console.log(`Clear Clerk preference in top result: ${hasClerkPreference ? '✓ Yes' : '✗ No'}`)

    if (hasClerkPreference) {
      console.log('✓ Mem0-style RAG retrieved sufficient context for the preference')
    } else {
      console.log('⚠ Preference not immediately clear from top result')
    }
  }, 60000)
})
