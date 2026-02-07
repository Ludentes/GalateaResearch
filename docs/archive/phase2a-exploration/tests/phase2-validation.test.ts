/**
 * Phase 2 Memory System Validation Tests
 *
 * Tests the complete memory pipeline:
 * 1. Message ingestion via chat API
 * 2. Gatekeeper filtering
 * 3. Graphiti entity/fact extraction
 * 4. Cross-session retrieval
 *
 * Run with: pnpm test tests/memory/phase2-validation.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const GRAPHITI_URL = process.env.GRAPHITI_URL || 'http://localhost:18000'

// Helper to create session and get ID
async function createSession(name: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })

  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.statusText}`)
  }

  const data = await response.json()
  return data.id
}

// Helper to send message to chat API
async function sendMessage(sessionId: string, content: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      message: content,
      provider: 'ollama',
      model: 'llama3.2'
    })
  })

  if (!response.ok) {
    throw new Error(`Failed to send message: ${response.statusText}`)
  }

  // Read streaming response
  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  let fullResponse = ''

  if (reader) {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      fullResponse += decoder.decode(value, { stream: true })
    }
  }

  return fullResponse
}

// Helper to wait for Graphiti ingestion (fire-and-forget, so we need to poll)
async function waitForIngestion(delayMs: number = 2000): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, delayMs))
}

// Helper to search Graphiti facts
async function searchFacts(query: string, groupIds: string[]): Promise<any[]> {
  const response = await fetch(`${GRAPHITI_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      group_ids: groupIds,
      max_facts: 20
    })
  })

  if (!response.ok) {
    throw new Error(`Failed to search facts: ${response.statusText}`)
  }

  const data = await response.json()
  return data.facts || []
}

// Helper to get episodes for group
async function getEpisodes(groupId: string): Promise<any[]> {
  const response = await fetch(`${GRAPHITI_URL}/episodes/${groupId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  })

  if (!response.ok) {
    throw new Error(`Failed to get episodes: ${response.statusText}`)
  }

  const data = await response.json()
  return data.episodes || []
}

// Helper to check Graphiti health
async function checkGraphitiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${GRAPHITI_URL}/healthcheck`)
    return response.ok
  } catch {
    return false
  }
}

describe('Phase 2 Memory System Validation', () => {

  beforeAll(async () => {
    // Check Graphiti is running
    const healthy = await checkGraphitiHealth()
    if (!healthy) {
      throw new Error('Graphiti sidecar is not healthy. Start with: docker-compose up graphiti')
    }
  })

  describe('Test 1: Learning from Mistake (JWT → Clerk)', () => {
    let sessionId: string

    it('should create test session', async () => {
      sessionId = await createSession('test-jwt-clerk')
      expect(sessionId).toBeDefined()
      expect(sessionId).toMatch(/^[a-f0-9-]+$/) // UUID format
    })

    it('should handle JWT auth conversation', async () => {
      // Turn 1: User wants JWT
      const response1 = await sendMessage(
        sessionId,
        'I need to add authentication to my Expo app. Let\'s implement JWT-based auth with refresh tokens.'
      )
      expect(response1).toBeTruthy()

      // Turn 2: User hits issues
      const response2 = await sendMessage(
        sessionId,
        'I\'m getting token refresh errors in my mobile app. The refresh token isn\'t being stored properly. This is frustrating.'
      )
      expect(response2).toBeTruthy()

      // Turn 3: User switches to Clerk
      const response3 = await sendMessage(
        sessionId,
        'Let\'s try Clerk instead. I\'ve heard it handles mobile auth better.'
      )
      expect(response3).toBeTruthy()

      // Turn 4: User confirms success
      const response4 = await sendMessage(
        sessionId,
        'That worked! Clerk was much easier. I should have used it from the start.'
      )
      expect(response4).toBeTruthy()

      // Wait for ingestion (fire-and-forget)
      await waitForIngestion(3000)
    })

    it('should have ingested episodes', async () => {
      const episodes = await getEpisodes(sessionId)

      // Should have at least 2-4 episodes (gatekeeper may filter some)
      expect(episodes.length).toBeGreaterThanOrEqual(2)

      // Episodes should have content
      const hasJWTMention = episodes.some((ep: any) =>
        ep.content?.toLowerCase().includes('jwt') ||
        ep.name?.toLowerCase().includes('jwt')
      )
      expect(hasJWTMention).toBe(true)
    }, 10000)

    it('should extract JWT and Clerk entities', async () => {
      const facts = await searchFacts('authentication', [sessionId])

      // Should find facts related to auth
      expect(facts.length).toBeGreaterThan(0)

      // Should mention JWT or Clerk
      const authRelated = facts.some((fact: any) => {
        const text = fact.fact?.toLowerCase() || ''
        return text.includes('jwt') || text.includes('clerk') || text.includes('auth')
      })

      expect(authRelated).toBe(true)
    }, 10000)

    it('should extract preference fact (Clerk > JWT)', async () => {
      const facts = await searchFacts('Clerk JWT prefer', [sessionId])

      // Should find preference fact
      const hasPreference = facts.some((fact: any) => {
        const text = fact.fact?.toLowerCase() || ''
        return (text.includes('clerk') && text.includes('jwt')) ||
               (text.includes('clerk') && text.includes('prefer')) ||
               (text.includes('clerk') && text.includes('better'))
      })

      expect(hasPreference).toBe(true)
    }, 10000)
  })

  describe('Test 2: Workaround Discovery (NativeWind Bug)', () => {
    let sessionId: string

    it('should create test session', async () => {
      sessionId = await createSession('test-nativewind-bug')
      expect(sessionId).toBeDefined()
    })

    it('should handle NativeWind workaround conversation', async () => {
      // Turn 1: User encounters bug
      const response1 = await sendMessage(
        sessionId,
        'My Pressable component animations are flickering when I use NativeWind className. It works fine with inline styles.'
      )
      expect(response1).toBeTruthy()

      // Turn 2: User finds workaround
      const response2 = await sendMessage(
        sessionId,
        'I found a workaround: keep static styles in className like bg-blue-500, but move animated properties to the inline style prop. That fixed the flicker.'
      )
      expect(response2).toBeTruthy()

      await waitForIngestion(3000)
    })

    it('should extract NativeWind and Pressable entities', async () => {
      const facts = await searchFacts('NativeWind Pressable animation', [sessionId])

      expect(facts.length).toBeGreaterThan(0)

      const hasWorkaround = facts.some((fact: any) => {
        const text = fact.fact?.toLowerCase() || ''
        return text.includes('nativewind') || text.includes('pressable') || text.includes('flicker')
      })

      expect(hasWorkaround).toBe(true)
    }, 10000)

    it('should capture workaround as procedural knowledge', async () => {
      const facts = await searchFacts('inline style className', [sessionId])

      // Should find the workaround
      const hasWorkaroundDetails = facts.some((fact: any) => {
        const text = fact.fact?.toLowerCase() || ''
        return text.includes('inline') || text.includes('classname') || text.includes('animated')
      })

      expect(hasWorkaroundDetails).toBe(true)
    }, 10000)
  })

  describe('Test 3: PR Feedback Learning (Null Checks)', () => {
    let sessionId: string

    it('should create test session', async () => {
      sessionId = await createSession('test-pr-feedback')
      expect(sessionId).toBeDefined()
    })

    it('should handle PR feedback conversation', async () => {
      // Turn 1: User submits PR
      const response1 = await sendMessage(
        sessionId,
        'I just submitted a PR for the user profile screen.'
      )
      expect(response1).toBeTruthy()

      // Turn 2: Reviewer feedback
      const response2 = await sendMessage(
        sessionId,
        'The reviewer found a missing null check on user.email at line 47. I need to add: if (!user?.email) return null.'
      )
      expect(response2).toBeTruthy()

      // Turn 3: User fixes
      const response3 = await sendMessage(
        sessionId,
        'Fixed it and pushed. I should always check for null on user objects before accessing properties in PRs.'
      )
      expect(response3).toBeTruthy()

      await waitForIngestion(3000)
    })

    it('should extract null check pattern', async () => {
      const facts = await searchFacts('null check user object', [sessionId])

      expect(facts.length).toBeGreaterThan(0)

      const hasNullCheckPattern = facts.some((fact: any) => {
        const text = fact.fact?.toLowerCase() || ''
        return text.includes('null') && (text.includes('user') || text.includes('check'))
      })

      expect(hasNullCheckPattern).toBe(true)
    }, 10000)
  })

  describe('Test 4: Manual Knowledge Entry (Hard Rule)', () => {
    let sessionId: string

    it('should create test session', async () => {
      sessionId = await createSession('test-hard-rule')
      expect(sessionId).toBeDefined()
    })

    it('should handle explicit hard rule statement', async () => {
      const response = await sendMessage(
        sessionId,
        'Never use Realm database for this project. It has sync issues and painful migrations. Always use SQLite with Drizzle instead.'
      )
      expect(response).toBeTruthy()

      await waitForIngestion(3000)
    })

    it('should extract Realm hard rule', async () => {
      const facts = await searchFacts('Realm database', [sessionId])

      expect(facts.length).toBeGreaterThan(0)

      const hasRealmRule = facts.some((fact: any) => {
        const text = fact.fact?.toLowerCase() || ''
        return text.includes('realm') && (text.includes('never') || text.includes('not use') || text.includes('avoid'))
      })

      expect(hasRealmRule).toBe(true)
    }, 10000)

    it('should extract SQLite alternative', async () => {
      const facts = await searchFacts('SQLite Drizzle', [sessionId])

      const hasSQLiteAlternative = facts.some((fact: any) => {
        const text = fact.fact?.toLowerCase() || ''
        return text.includes('sqlite') || text.includes('drizzle')
      })

      expect(hasSQLiteAlternative).toBe(true)
    }, 10000)
  })

  describe('Test 5: Cross-Session Retrieval', () => {
    let session1Id: string
    let session2Id: string

    it('should create two sessions', async () => {
      session1Id = await createSession('test-cross-session-1')
      session2Id = await createSession('test-cross-session-2')
      expect(session1Id).toBeDefined()
      expect(session2Id).toBeDefined()
      expect(session1Id).not.toBe(session2Id)
    })

    it('should store fact in session 1', async () => {
      const response = await sendMessage(
        session1Id,
        'For this project, we always use Clerk for authentication in Expo apps.'
      )
      expect(response).toBeTruthy()

      await waitForIngestion(3000)
    })

    it('should retrieve fact from session 2 (cross-session)', async () => {
      // Search with BOTH session IDs (simulates "All sessions" search)
      const facts = await searchFacts('Clerk authentication', [session1Id, session2Id])

      // Should find the Clerk fact from session 1
      expect(facts.length).toBeGreaterThan(0)

      const hasClerkFact = facts.some((fact: any) => {
        const text = fact.fact?.toLowerCase() || ''
        return text.includes('clerk')
      })

      expect(hasClerkFact).toBe(true)
    }, 10000)

    it('should retrieve fact with global search (no group_id filter)', async () => {
      // Search globally (empty group_ids array means search all)
      const facts = await searchFacts('Clerk', [])

      // Should still find facts (global search)
      expect(facts.length).toBeGreaterThan(0)
    }, 10000)
  })

  describe('Test 6: Gatekeeper Filtering', () => {
    let sessionId: string

    it('should create test session', async () => {
      sessionId = await createSession('test-gatekeeper')
      expect(sessionId).toBeDefined()
    })

    it('should filter greetings (should NOT ingest)', async () => {
      await sendMessage(sessionId, 'Hi there!')
      await sendMessage(sessionId, 'Hello')
      await sendMessage(sessionId, 'Hey')
      await waitForIngestion(2000)

      const episodes = await getEpisodes(sessionId)

      // Should have 0 episodes (all filtered)
      expect(episodes.length).toBe(0)
    })

    it('should filter bare confirmations (should NOT ingest)', async () => {
      await sendMessage(sessionId, 'Ok')
      await sendMessage(sessionId, 'Thanks')
      await sendMessage(sessionId, 'Yes')
      await waitForIngestion(2000)

      const episodes = await getEpisodes(sessionId)

      // Should still have 0 episodes
      expect(episodes.length).toBe(0)
    })

    it('should ingest substantive technical content', async () => {
      await sendMessage(
        sessionId,
        'I prefer using TypeScript strict mode with noUncheckedIndexedAccess enabled for this project.'
      )
      await waitForIngestion(3000)

      const episodes = await getEpisodes(sessionId)

      // Should have 1 episode now
      expect(episodes.length).toBeGreaterThanOrEqual(1)
    })
  })
})
