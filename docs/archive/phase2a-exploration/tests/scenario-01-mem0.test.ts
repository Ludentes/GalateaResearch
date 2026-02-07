/**
 * Scenario 1: Learning from Mistake (JWT → Clerk) - Mem0 Version
 *
 * Tests Mem0's ability to:
 * 1. Store conversation turns as memories
 * 2. Retrieve relevant information when queried
 *
 * Compare to Graphiti version to see which approach works better
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { Memory } from 'mem0ai/oss'

// Test scenario conversation (same as Graphiti test)
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

// Expected knowledge (same as Graphiti test)
const EXPECTED_KNOWLEDGE = {
  facts: [
    "Clerk preferred over JWT for Expo authentication",
    "JWT has refresh token issues in mobile apps",
    "Clerk handles token management automatically"
  ],
  preference: {
    subject: "Clerk",
    domain: "Expo authentication",
    confidence: "high"
  }
}

describe('Scenario 1: JWT → Clerk Learning (Mem0)', () => {
  const userId = `test-user-${Date.now()}`
  let memory: Memory

  beforeAll(async () => {
    // Initialize Mem0 OSS with on-premise setup
    // Using Ollama for embeddings + LLM, Qdrant for vector storage
    memory = new Memory({
      embedder: {
        provider: 'ollama',
        config: {
          model: 'nomic-embed-text',
          url: 'http://localhost:11434',
          embeddingDims: 768
        }
      },
      vectorStore: {
        provider: 'qdrant',
        config: {
          collectionName: 'mem0_test',
          url: 'http://localhost:6333',
          embeddingModelDims: 768,
          onDisk: true,
          checkCompatibility: false // Skip version check (server 1.16 vs client 1.13)
        }
      },
      llm: {
        provider: 'ollama',
        config: {
          model: 'gpt-oss:latest',
          baseURL: 'http://localhost:11434'
        }
      },
      disableHistory: true // Disable history DB for simpler setup
    })

    // Initialize the memory system
    await memory.add('initialization test', { userId })
  }, 60000)

  it('Phase 1: Store conversation as memories', async () => {
    console.log('\n=== PHASE 1: MEM0 STORAGE ===\n')

    for (let i = 0; i < CONVERSATION_TURNS.length; i++) {
      const turn = CONVERSATION_TURNS[i]
      const turnId = `turn-${i + 1}`

      console.log(`[Turn ${i + 1}]`)
      console.log(`User: ${turn.user}`)
      console.log(`Assistant: ${turn.assistant}`)

      // Store as memory in Mem0
      // Approach: Store the full exchange as a memory entry
      const memoryText = `User asked: ${turn.user}\nAssistant replied: ${turn.assistant}`

      const result = await memory.add(memoryText, {
        userId,
        metadata: {
          turn: i + 1,
          type: 'conversation',
          timestamp: Date.now()
        }
      })

      console.log(`✓ Stored in Mem0 (Results: ${JSON.stringify(result?.results?.slice(0, 1) || [])?.slice(0, 100)}...)`)
      console.log('')
    }

    console.log('All conversations stored in Mem0')
  }, 30000)

  it('Phase 2: Inspect what Mem0 stored', async () => {
    console.log('\n=== PHASE 2: MEM0 STORAGE INSPECTION ===\n')

    // Get all memories for this user
    const allMemories = await memory.getAll({ userId })
    const memoryList = allMemories?.results || []

    console.log(`Total memories stored: ${memoryList.length}`)
    console.log('\nStored memories:')
    if (memoryList.length > 0) {
      for (const mem of memoryList) {
        console.log(`  - ${mem.memory?.slice(0, 80)}...`)
      }
    } else {
      console.log('  (none)')
    }

    expect(memoryList.length).toBeGreaterThan(0)
  }, 20000)

  it('Phase 3: Test retrieval query', async () => {
    console.log('\n=== PHASE 3: MEM0 RETRIEVAL TEST ===\n')

    const query = "How should I implement auth in Expo?"
    console.log(`Query: "${query}"`)
    console.log('')

    // Search memories
    const searchResults = await memory.search(query, { userId, limit: 5 })
    const results = searchResults?.results || []

    console.log(`Retrieved ${results.length} memories:`)
    if (results.length > 0) {
      for (const result of results) {
        console.log(`  - "${result.memory?.slice(0, 100)}..."`)
        if (result.score) {
          console.log(`    Score: ${result.score.toFixed(3)}`)
        }
      }
    } else {
      console.log('  (none)')
    }

    // Check if Clerk preference was retrieved
    const clerkMentioned = results.some(r =>
      r.memory?.toLowerCase().includes('clerk')
    )
    const jwtMentioned = results.some(r =>
      r.memory?.toLowerCase().includes('jwt')
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
  }, 20000)

  it('Phase 4: Test specific preference retrieval', async () => {
    console.log('\n=== PHASE 4: SPECIFIC PREFERENCE QUERY ===\n')

    const query = "What authentication library should I use for Expo?"
    console.log(`Query: "${query}"`)
    console.log('')

    const searchResults = await memory.search(query, { userId, limit: 3 })
    const results = searchResults?.results || []

    console.log(`Retrieved ${results.length} memories:`)
    if (results.length > 0) {
      for (const result of results) {
        console.log(`\n  Memory:`)
        console.log(`    ${result.memory}`)
        if (result.score) {
          console.log(`    Relevance: ${(result.score * 100).toFixed(1)}%`)
        }
      }
    }

    // Check if the preference is clear
    const hasClerkPreference = results.some(r => {
      const mem = r.memory?.toLowerCase() || ''
      return mem.includes('clerk') &&
             (mem.includes('prefer') ||
              mem.includes('use clerk') ||
              mem.includes('switch to clerk'))
    })

    console.log('')
    console.log('--- PREFERENCE CLARITY ---')
    console.log(`Clear Clerk preference: ${hasClerkPreference ? '✓ Yes' : '✗ No'}`)

    if (hasClerkPreference) {
      console.log('✓ Mem0 retrieved enough context to understand the preference')
    } else {
      console.log('⚠ Preference not clear from retrieved memories')
    }
  }, 20000)
})
