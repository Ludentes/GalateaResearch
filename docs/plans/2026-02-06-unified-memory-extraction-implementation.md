# Unified Memory Extraction - Implementation Plan

**Date:** 2026-02-06
**Design Doc:** [2026-02-06-unified-memory-extraction-design.md](./2026-02-06-unified-memory-extraction-design.md)
**Estimated Effort:** 3-4 days
**Dependencies:** PostgreSQL with pgvector, Ollama with llama3.2:latest

## Overview

This plan implements a unified heuristic gatekeeper + extraction system to replace Mem0/Graphiti, providing:
- Pattern-based extraction (70% fast path, <1ms)
- Ollama LLM fallback (30%, local, free)
- Simple PostgreSQL storage with hybrid search
- Two memory pathways using shared extraction logic

## Phase 1: Foundation (Day 1)

### Task 1.1: Database Schema & Migrations

**File:** `server/db/migrations/YYYYMMDDHHMMSS_create_facts_table.ts`

```typescript
import { sql } from 'drizzle-orm'
import { pgTable, uuid, text, real, timestamp, vector, index } from 'drizzle-orm/pg-core'

export const facts = pgTable('facts', {
  id: uuid('id').primaryKey().defaultRandom(),
  content: text('content').notNull(),
  category: text('category').notNull(), // 'preference' | 'policy' | 'technology' | 'decision' | 'temporal' | 'other'
  confidence: real('confidence').notNull(),
  extractionMethod: text('extraction_method').notNull(), // 'pattern' | 'llm'
  entities: text('entities').array(),

  // Source tracking
  sourceSession: uuid('source_session').references(() => sessions.id),
  sourceUserMessage: text('source_user_message'),
  sourceAssistantMessage: text('source_assistant_message'),
  sourceActivitySession: uuid('source_activity_session'), // For observational pathway
  createdAt: timestamp('created_at').defaultNow(),

  // Multi-agent support
  agentId: uuid('agent_id'),
  visibility: text('visibility').default('private'), // 'private' | 'team' | 'global'

  // Search
  embedding: vector('embedding', { dimensions: 768 }),
  tsvector: text('tsvector'), // Generated column for BM25
}, (table) => ({
  embeddingIdx: index('facts_embedding_idx').using('ivfflat', table.embedding.op('vector_cosine_ops')),
  tsvectorIdx: index('facts_tsvector_idx').using('gin', sql`to_tsvector('english', ${table.content})`),
  categoryIdx: index('facts_category_idx').on(table.category),
  visibilityIdx: index('facts_visibility_idx').on(table.visibility, table.agentId),
  createdIdx: index('facts_created_idx').on(table.createdAt),
}))
```

**Drizzle config update:** `server/db/schema.ts`
```typescript
export * from './migrations/YYYYMMDDHHMMSS_create_facts_table'
```

**Migration command:**
```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

**Verification:**
```bash
psql $DATABASE_URL -c "\d facts"
```

**Expected:** Table with all columns and indexes created.

---

### Task 1.2: Pattern Library

**File:** `server/memory/patterns.ts`

```typescript
export interface PatternDefinition {
  pattern: RegExp
  template: (match: RegExpMatchArray) => string
  category: FactCategory
  confidence: number
  extractEntities?: (match: RegExpMatchArray) => string[]
}

export type FactCategory = 'preference' | 'policy' | 'technology' | 'decision' | 'temporal' | 'other'

export const PREFERENCE_PATTERNS: PatternDefinition[] = [
  {
    pattern: /\bI prefer ([\w\s]+?)(?:\s+(?:over|to|instead of)\s+([\w\s]+?))?(?:\s+(?:for|when|because)|[.,!?]|$)/i,
    template: (match) => {
      const preferred = match[1].trim()
      const alternative = match[2]?.trim()
      return alternative
        ? `User prefers ${preferred} over ${alternative}`
        : `User prefers ${preferred}`
    },
    category: 'preference',
    confidence: 0.9,
    extractEntities: (match) => [match[1].trim(), match[2]?.trim()].filter(Boolean),
  },
  {
    pattern: /\bI (?:like|love|always use) ([\w\s]+?)(?:\s+(?:for|when|because)|[.,!?]|$)/i,
    template: (match) => `User likes ${match[1].trim()}`,
    category: 'preference',
    confidence: 0.85,
    extractEntities: (match) => [match[1].trim()],
  },
  {
    pattern: /\bI (?:hate|dislike|never use|avoid) ([\w\s]+?)(?:\s+(?:for|when|because)|[.,!?]|$)/i,
    template: (match) => `User dislikes ${match[1].trim()}`,
    category: 'preference',
    confidence: 0.85,
    extractEntities: (match) => [match[1].trim()],
  },
]

export const POLICY_PATTERNS: PatternDefinition[] = [
  {
    pattern: /\b[Ww]e (?:always|never|should|must)(?: always)? (use |include |add |check )?([\w\s]+?)(?:\s+(?:for|when|in|because)|[.,!?]|$)/i,
    template: (match) => {
      const action = match[1]?.trim() || 'use'
      const target = match[2].trim()
      return `Team policy: always ${action}${target}`
    },
    category: 'policy',
    confidence: 0.85,
    extractEntities: (match) => [match[2].trim()],
  },
  {
    pattern: /\b[Oo]ur (?:standard|convention|policy|rule|practice) is to ([\w\s]+?)(?:\s+(?:for|when|because)|[.,!?]|$)/i,
    template: (match) => `Team policy: ${match[1].trim()}`,
    category: 'policy',
    confidence: 0.9,
    extractEntities: (match) => [match[1].trim()],
  },
]

export const TECHNOLOGY_PATTERNS: PatternDefinition[] = [
  {
    pattern: /\b[Ss]witched from ([\w\s.]+?) to ([\w\s.]+?)(?:\s+(?:for|because|since|as))?/i,
    template: (match) => `Team switched from ${match[1].trim()} to ${match[2].trim()}`,
    category: 'technology',
    confidence: 0.9,
    extractEntities: (match) => [match[1].trim(), match[2].trim()],
  },
  {
    pattern: /\b[Uu]sing ([\w\s.]+?) (?:for|to handle|to manage) ([\w\s]+?)(?:\s+(?:now|currently)|[.,!?]|$)/i,
    template: (match) => `Team uses ${match[1].trim()} for ${match[2].trim()}`,
    category: 'technology',
    confidence: 0.85,
    extractEntities: (match) => [match[1].trim(), match[2].trim()],
  },
  {
    pattern: /\b[Mm]igrated (?:from )?([\w\s.]+?) to ([\w\s.]+?)(?:\s+(?:for|because)|[.,!?]|$)/i,
    template: (match) => `Team migrated from ${match[1].trim()} to ${match[2].trim()}`,
    category: 'technology',
    confidence: 0.9,
    extractEntities: (match) => [match[1].trim(), match[2].trim()],
  },
]

export const DECISION_PATTERNS: PatternDefinition[] = [
  {
    pattern: /\b[Ww]e (?:decided|chose) to ([\w\s]+?)(?:\s+(?:because|since|as)\s+([\w\s]+?))?(?:[.,!?]|$)/i,
    template: (match) => {
      const decision = match[1].trim()
      const reason = match[2]?.trim()
      return reason
        ? `Team decided to ${decision} because ${reason}`
        : `Team decided to ${decision}`
    },
    category: 'decision',
    confidence: 0.85,
    extractEntities: (match) => [match[1].trim()],
  },
  {
    pattern: /\b[Ff]ound (?:a )?(?:workaround|solution|fix) for ([\w\s.]+?) by ([\w\s]+)/i,
    template: (match) => `Found workaround for ${match[1].trim()} by ${match[2].trim()}`,
    category: 'decision',
    confidence: 0.85,
    extractEntities: (match) => [match[1].trim(), match[2].trim()],
  },
]

export const TEMPORAL_PATTERNS: PatternDefinition[] = [
  {
    pattern: /\b[Ss]tarted using ([\w\s.]+?)(?: (?:last|this) (\w+)|(\d+) (\w+) ago)/i,
    template: (match) => {
      const tech = match[1].trim()
      const timeRef = match[2] || `${match[3]} ${match[4]} ago`
      return `Started using ${tech} ${timeRef}`
    },
    category: 'temporal',
    confidence: 0.8,
    extractEntities: (match) => [match[1].trim()],
  },
  {
    pattern: /\b[Bb]een using ([\w\s.]+?) for (?:about |~)?(\d+) (\w+)/i,
    template: (match) => `Been using ${match[1].trim()} for ${match[2]} ${match[3]}`,
    category: 'temporal',
    confidence: 0.8,
    extractEntities: (match) => [match[1].trim()],
  },
]

export const ALL_PATTERNS: PatternDefinition[] = [
  ...PREFERENCE_PATTERNS,
  ...POLICY_PATTERNS,
  ...TECHNOLOGY_PATTERNS,
  ...DECISION_PATTERNS,
  ...TEMPORAL_PATTERNS,
]
```

**Tests:** `server/memory/patterns.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { PREFERENCE_PATTERNS, POLICY_PATTERNS, TECHNOLOGY_PATTERNS, DECISION_PATTERNS, TEMPORAL_PATTERNS } from './patterns'

describe('Pattern Matching', () => {
  describe('PREFERENCE_PATTERNS', () => {
    it('extracts simple preference', () => {
      const text = "I prefer dark mode"
      const pattern = PREFERENCE_PATTERNS[0]
      const match = text.match(pattern.pattern)
      expect(match).toBeTruthy()
      expect(pattern.template(match!)).toBe('User prefers dark mode')
    })

    it('extracts preference with alternative', () => {
      const text = "I prefer VS Code over Vim"
      const pattern = PREFERENCE_PATTERNS[0]
      const match = text.match(pattern.pattern)
      expect(match).toBeTruthy()
      expect(pattern.template(match!)).toBe('User prefers VS Code over Vim')
    })

    it('extracts entities', () => {
      const text = "I prefer React over Vue"
      const pattern = PREFERENCE_PATTERNS[0]
      const match = text.match(pattern.pattern)
      expect(pattern.extractEntities!(match!)).toEqual(['React', 'Vue'])
    })
  })

  describe('TECHNOLOGY_PATTERNS', () => {
    it('extracts technology switch', () => {
      const text = "We switched from JWT to Clerk for authentication"
      const pattern = TECHNOLOGY_PATTERNS[0]
      const match = text.match(pattern.pattern)
      expect(match).toBeTruthy()
      expect(pattern.template(match!)).toBe('Team switched from JWT to Clerk')
    })
  })

  describe('POLICY_PATTERNS', () => {
    it('extracts team policy', () => {
      const text = "We always add null checks for optional parameters"
      const pattern = POLICY_PATTERNS[0]
      const match = text.match(pattern.pattern)
      expect(match).toBeTruthy()
      expect(pattern.template(match!)).toContain('Team policy')
    })
  })

  describe('DECISION_PATTERNS', () => {
    it('extracts workaround', () => {
      const text = "Found a workaround for NativeWind v4 by using className prop"
      const pattern = DECISION_PATTERNS[1]
      const match = text.match(pattern.pattern)
      expect(match).toBeTruthy()
      expect(pattern.template(match!)).toContain('Found workaround')
    })
  })

  describe('TEMPORAL_PATTERNS', () => {
    it('extracts temporal event', () => {
      const text = "Started using React last month"
      const pattern = TEMPORAL_PATTERNS[0]
      const match = text.match(pattern.pattern)
      expect(match).toBeTruthy()
      expect(pattern.template(match!)).toContain('Started using React')
    })
  })
})
```

**Verification:**
```bash
pnpm vitest run server/memory/patterns.test.ts
```

**Expected:** All pattern tests pass.

---

### Task 1.3: Shared Extraction Logic

**File:** `server/memory/fact-extractor.ts`

```typescript
import { ALL_PATTERNS, type FactCategory } from './patterns'
import { generateText } from 'ai'
import { ollama } from 'ollama-ai-provider'

export interface ExtractedFact {
  content: string
  category: FactCategory
  confidence: number
  extractionMethod: 'pattern' | 'llm'
  entities: string[]
}

/**
 * Extract facts using pattern matching (fast path)
 */
export function extractFactsWithPatterns(
  text: string,
  categoryFilter?: FactCategory
): ExtractedFact[] {
  const facts: ExtractedFact[] = []
  const patternsToTry = categoryFilter
    ? ALL_PATTERNS.filter(p => p.category === categoryFilter)
    : ALL_PATTERNS

  for (const { pattern, template, category, confidence, extractEntities } of patternsToTry) {
    const match = text.match(pattern)
    if (match) {
      facts.push({
        content: template(match),
        category,
        confidence,
        extractionMethod: 'pattern',
        entities: extractEntities ? extractEntities(match) : [],
      })
      // Return first match (prioritize higher confidence patterns first in ALL_PATTERNS)
      break
    }
  }

  return facts
}

/**
 * Extract facts using LLM (fallback for ambiguous cases)
 */
export async function extractFactsWithLLM(
  context: string,
  text: string
): Promise<ExtractedFact[]> {
  try {
    const { text: response } = await generateText({
      model: ollama('llama3.2:latest'),
      prompt: `You are a fact extraction system. Analyze the conversation and extract factual statements that should be remembered.

Context: ${context}
Text to analyze: ${text}

Extract facts in these categories:
- preference: User preferences (tools, approaches, styles)
- policy: Team policies and standards
- technology: Technology choices and changes
- decision: Decisions made with reasoning
- temporal: Time-based events (started using X, been using Y for Z)
- other: Other factual statements

Guidelines:
- Only extract facts that are factual and worth remembering
- Skip greetings, confirmations, questions, general knowledge
- Focus on user-specific or project-specific information
- Be concise and clear

Output JSON:
{
  "shouldIngest": boolean,
  "reason": "brief explanation",
  "facts": [
    {
      "content": "extracted fact in natural language",
      "category": "preference|policy|technology|decision|temporal|other",
      "confidence": 0.0-1.0,
      "entities": ["entity1", "entity2"]
    }
  ]
}`,
      temperature: 0.1,
    })

    const parsed = JSON.parse(response)
    if (!parsed.shouldIngest || !parsed.facts || parsed.facts.length === 0) {
      return []
    }

    return parsed.facts.map((f: any) => ({
      content: f.content,
      category: f.category,
      confidence: f.confidence,
      extractionMethod: 'llm' as const,
      entities: f.entities || [],
    }))
  } catch (error) {
    console.error('LLM extraction failed:', error)
    return []
  }
}
```

**Tests:** `server/memory/fact-extractor.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { extractFactsWithPatterns } from './fact-extractor'

describe('extractFactsWithPatterns', () => {
  it('extracts preference fact', () => {
    const facts = extractFactsWithPatterns('I prefer dark mode for coding')
    expect(facts).toHaveLength(1)
    expect(facts[0].content).toContain('prefers dark mode')
    expect(facts[0].category).toBe('preference')
    expect(facts[0].extractionMethod).toBe('pattern')
    expect(facts[0].confidence).toBeGreaterThan(0.8)
  })

  it('extracts technology switch', () => {
    const facts = extractFactsWithPatterns('We switched from JWT to Clerk for auth')
    expect(facts).toHaveLength(1)
    expect(facts[0].content).toContain('switched from JWT to Clerk')
    expect(facts[0].category).toBe('technology')
    expect(facts[0].entities).toContain('JWT')
    expect(facts[0].entities).toContain('Clerk')
  })

  it('returns empty array when no patterns match', () => {
    const facts = extractFactsWithPatterns('Hello, how are you?')
    expect(facts).toHaveLength(0)
  })

  it('filters by category', () => {
    const facts = extractFactsWithPatterns('I prefer React', 'preference')
    expect(facts).toHaveLength(1)
    expect(facts[0].category).toBe('preference')
  })
})
```

**Verification:**
```bash
pnpm vitest run server/memory/fact-extractor.test.ts
```

**Expected:** All extraction tests pass.

---

## Phase 2: Conversational Pathway (Day 2)

### Task 2.1: Unified Gatekeeper + Extraction

**File:** `server/memory/gatekeeper-with-extraction.ts`

```typescript
import { extractFactsWithPatterns, extractFactsWithLLM, type ExtractedFact } from './fact-extractor'

// Existing gatekeeper patterns from GATEKEEPER.md
const GREETING_RE = /^(hi|hello|hey|thanks|thank you|great|awesome|ok|okay|sure|sounds good)[\s!.]*$/i
const CONFIRMATION_RE = /^(yes|no|yep|nope|yeah|ok|okay|sure|got it|understood)[\s!.]*$/i
const QUESTION_ONLY_RE = /^(what|when|where|why|how|who|can|could|would|should|is|are|does|do)\b.*\?$/i

export interface GatekeeperExtractionResult {
  shouldIngest: boolean
  reason?: string
  category?: string
  extractedFacts: ExtractedFact[]
  needsLlmExtraction?: boolean
}

/**
 * Unified gatekeeper that both filters and extracts facts
 */
export function evaluateGatekeeperWithExtraction(
  userMessage: string,
  assistantResponse: string
): GatekeeperExtractionResult {
  const trimmed = userMessage.trim()

  // Fast skip: greetings and confirmations (short messages)
  if (trimmed.length < 50) {
    if (GREETING_RE.test(trimmed) || CONFIRMATION_RE.test(trimmed)) {
      return {
        shouldIngest: false,
        reason: 'Greeting or confirmation',
        extractedFacts: [],
      }
    }
  }

  // Fast skip: pure questions
  if (QUESTION_ONLY_RE.test(trimmed)) {
    return {
      shouldIngest: false,
      reason: 'Pure question without facts',
      extractedFacts: [],
    }
  }

  // Try pattern-based extraction
  const patternFacts = extractFactsWithPatterns(trimmed)
  if (patternFacts.length > 0) {
    return {
      shouldIngest: true,
      reason: 'Pattern matched',
      category: patternFacts[0].category,
      extractedFacts: patternFacts,
    }
  }

  // Check if this looks like it might contain factual information
  // (not general knowledge, not just conversational filler)
  const mightContainFacts = /\b(use|using|prefer|decided|switched|started|always|never|policy|standard|should|must)\b/i.test(trimmed)

  if (mightContainFacts) {
    return {
      shouldIngest: true,
      category: 'needs_llm_extraction',
      extractedFacts: [],
      needsLlmExtraction: true,
    }
  }

  // Skip: likely general knowledge or conversational filler
  return {
    shouldIngest: false,
    reason: 'No extractable facts detected',
    extractedFacts: [],
  }
}
```

**Tests:** `server/memory/gatekeeper-with-extraction.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { evaluateGatekeeperWithExtraction } from './gatekeeper-with-extraction'

describe('evaluateGatekeeperWithExtraction', () => {
  it('skips greetings', () => {
    const result = evaluateGatekeeperWithExtraction('Hi there!', '')
    expect(result.shouldIngest).toBe(false)
    expect(result.reason).toContain('Greeting')
  })

  it('skips confirmations', () => {
    const result = evaluateGatekeeperWithExtraction('Sounds good!', '')
    expect(result.shouldIngest).toBe(false)
  })

  it('skips pure questions', () => {
    const result = evaluateGatekeeperWithExtraction('What is React?', '')
    expect(result.shouldIngest).toBe(false)
    expect(result.reason).toContain('Pure question')
  })

  it('extracts preference with pattern', () => {
    const result = evaluateGatekeeperWithExtraction('I prefer TypeScript over JavaScript', '')
    expect(result.shouldIngest).toBe(true)
    expect(result.extractedFacts).toHaveLength(1)
    expect(result.extractedFacts[0].category).toBe('preference')
    expect(result.extractedFacts[0].extractionMethod).toBe('pattern')
  })

  it('marks for LLM extraction when patterns fail but might contain facts', () => {
    const result = evaluateGatekeeperWithExtraction(
      'Our team decided to use a microservices architecture for scalability',
      ''
    )
    expect(result.shouldIngest).toBe(true)
    expect(result.needsLlmExtraction).toBe(true)
  })
})
```

**Verification:**
```bash
pnpm vitest run server/memory/gatekeeper-with-extraction.test.ts
```

---

### Task 2.2: Fact Storage

**File:** `server/db/queries/facts.ts`

```typescript
import { db } from '../connection'
import { facts } from '../schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import { generateEmbedding } from '@/server/embeddings'
import type { ExtractedFact } from '@/server/memory/fact-extractor'

export interface StoredFact extends ExtractedFact {
  id: string
  sourceSession?: string
  sourceUserMessage?: string
  sourceAssistantMessage?: string
  sourceActivitySession?: string
  agentId?: string
  visibility: 'private' | 'team' | 'global'
  createdAt: Date
}

export async function storeFact(
  fact: ExtractedFact,
  context: {
    sessionId?: string
    userMessage?: string
    assistantMessage?: string
    activitySessionId?: string
    agentId?: string
    visibility?: 'private' | 'team' | 'global'
  }
): Promise<StoredFact> {
  const embedding = await generateEmbedding(fact.content)

  const [inserted] = await db.insert(facts).values({
    content: fact.content,
    category: fact.category,
    confidence: fact.confidence,
    extractionMethod: fact.extractionMethod,
    entities: fact.entities,
    sourceSession: context.sessionId,
    sourceUserMessage: context.userMessage,
    sourceAssistantMessage: context.assistantMessage,
    sourceActivitySession: context.activitySessionId,
    agentId: context.agentId,
    visibility: context.visibility || 'private',
    embedding,
  }).returning()

  return {
    id: inserted.id,
    content: inserted.content,
    category: inserted.category as any,
    confidence: inserted.confidence,
    extractionMethod: inserted.extractionMethod as any,
    entities: inserted.entities || [],
    sourceSession: inserted.sourceSession || undefined,
    sourceUserMessage: inserted.sourceUserMessage || undefined,
    sourceAssistantMessage: inserted.sourceAssistantMessage || undefined,
    sourceActivitySession: inserted.sourceActivitySession || undefined,
    agentId: inserted.agentId || undefined,
    visibility: inserted.visibility as any,
    createdAt: inserted.createdAt,
  }
}

export async function searchFacts(
  query: string,
  options: {
    sessionId?: string
    agentId?: string
    visibility?: ('private' | 'team' | 'global')[]
    category?: string
    limit?: number
  } = {}
): Promise<StoredFact[]> {
  const queryEmbedding = await generateEmbedding(query)
  const limit = options.limit || 10

  // Hybrid search: vector similarity + BM25
  const results = await db.execute(sql`
    WITH vector_search AS (
      SELECT id, 1 - (embedding <=> ${queryEmbedding}::vector) AS similarity
      FROM facts
      WHERE ${options.sessionId ? sql`source_session = ${options.sessionId}` : sql`1=1`}
        AND ${options.agentId ? sql`agent_id = ${options.agentId}` : sql`1=1`}
        AND ${options.visibility ? sql`visibility = ANY(${options.visibility})` : sql`1=1`}
        AND ${options.category ? sql`category = ${options.category}` : sql`1=1`}
      ORDER BY similarity DESC
      LIMIT ${limit}
    ),
    bm25_search AS (
      SELECT id, ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', ${query})) AS rank
      FROM facts
      WHERE to_tsvector('english', content) @@ plainto_tsquery('english', ${query})
        AND ${options.sessionId ? sql`source_session = ${options.sessionId}` : sql`1=1`}
        AND ${options.agentId ? sql`agent_id = ${options.agentId}` : sql`1=1`}
        AND ${options.visibility ? sql`visibility = ANY(${options.visibility})` : sql`1=1`}
        AND ${options.category ? sql`category = ${options.category}` : sql`1=1`}
      ORDER BY rank DESC
      LIMIT ${limit}
    )
    SELECT f.*,
           COALESCE(v.similarity, 0) * 0.7 + COALESCE(b.rank, 0) * 0.3 AS combined_score
    FROM facts f
    LEFT JOIN vector_search v ON f.id = v.id
    LEFT JOIN bm25_search b ON f.id = b.id
    WHERE v.id IS NOT NULL OR b.id IS NOT NULL
    ORDER BY combined_score DESC
    LIMIT ${limit}
  `)

  return results.rows.map((row: any) => ({
    id: row.id,
    content: row.content,
    category: row.category,
    confidence: row.confidence,
    extractionMethod: row.extraction_method,
    entities: row.entities || [],
    sourceSession: row.source_session,
    sourceUserMessage: row.source_user_message,
    sourceAssistantMessage: row.source_assistant_message,
    sourceActivitySession: row.source_activity_session,
    agentId: row.agent_id,
    visibility: row.visibility,
    createdAt: row.created_at,
  }))
}
```

---

### Task 2.3: Integrate with Chat API

**File:** `server/routes/api/chat.post.ts`

Update the chat endpoint to use unified gatekeeper + extraction:

```typescript
import { evaluateGatekeeperWithExtraction } from '@/server/memory/gatekeeper-with-extraction'
import { extractFactsWithLLM } from '@/server/memory/fact-extractor'
import { storeFact } from '@/server/db/queries/facts'

// ... existing imports ...

export default defineEventHandler(async (event) => {
  // ... existing code to get message, sessionId, etc. ...

  // Get assistant response (existing streaming logic)
  const { text: assistantResponse } = await streamText({
    model: getModel(),
    messages: [...conversationHistory, userMessage],
    // ... existing config ...
  })

  // AFTER response is complete, evaluate gatekeeper + extract facts
  const gatekeeperResult = evaluateGatekeeperWithExtraction(
    userMessage.content,
    assistantResponse
  )

  if (gatekeeperResult.shouldIngest) {
    if (gatekeeperResult.extractedFacts.length > 0) {
      // Pattern-based extraction succeeded
      for (const fact of gatekeeperResult.extractedFacts) {
        await storeFact(fact, {
          sessionId,
          userMessage: userMessage.content,
          assistantMessage: assistantResponse,
          visibility: 'private', // Default for chat
        })
      }
    } else if (gatekeeperResult.needsLlmExtraction) {
      // Fallback to LLM extraction
      const llmFacts = await extractFactsWithLLM(
        conversationHistory.map(m => m.content).join('\n'),
        userMessage.content
      )
      for (const fact of llmFacts) {
        await storeFact(fact, {
          sessionId,
          userMessage: userMessage.content,
          assistantMessage: assistantResponse,
          visibility: 'private',
        })
      }
    }
  }

  // ... existing return logic ...
})
```

**Verification:**
```bash
# Start server
pnpm dev

# Test chat endpoint with preference
curl -X POST http://localhost:13000/api/chat \\
  -H "Content-Type: application/json" \\
  -d '{"sessionId":"test-123","message":"I prefer TypeScript over JavaScript"}'

# Check database
psql $DATABASE_URL -c "SELECT content, category, extraction_method FROM facts WHERE source_session = 'test-123';"
```

**Expected:** Fact stored with content "User prefers TypeScript over JavaScript", category "preference", extraction_method "pattern".

---

## Phase 3: Observational Pathway (Day 3)

### Task 3.1: Update Memory Formation Layer

**File:** `server/observation/memory-formation.ts` (update existing)

```typescript
import { extractFactsWithPatterns, extractFactsWithLLM } from '@/server/memory/fact-extractor'
import { storeFact } from '@/server/db/queries/facts'

export const formMemoriesFromDialogue = internalAction({
  handler: async (ctx, args: {
    dialogueId: string
    activitySessionId: string
    validatedIntent: string
    response: string
  }) => {
    // Try pattern-based extraction first (fast path)
    const patternFacts = extractFactsWithPatterns(args.response)

    if (patternFacts.length > 0) {
      // Fast path: pattern matched (expected 70% of cases)
      for (const fact of patternFacts) {
        await storeFact(fact, {
          activitySessionId: args.activitySessionId,
          visibility: 'team', // Observational facts are team-visible by default
        })
      }
      return {
        factsExtracted: patternFacts.length,
        extractionMethod: 'pattern',
      }
    }

    // Fallback: LLM extraction (expected 30% of cases)
    const llmFacts = await extractFactsWithLLM(
      args.validatedIntent,
      args.response
    )

    for (const fact of llmFacts) {
      await storeFact(fact, {
        activitySessionId: args.activitySessionId,
        visibility: 'team',
      })
    }

    return {
      factsExtracted: llmFacts.length,
      extractionMethod: llmFacts.length > 0 ? 'llm' : 'none',
    }
  }
})
```

**Verification:**
```bash
# Trigger observation pipeline (depends on existing test setup)
# Check that facts are being stored with source_activity_session set

psql $DATABASE_URL -c "SELECT content, category, extraction_method, visibility FROM facts WHERE source_activity_session IS NOT NULL LIMIT 10;"
```

**Expected:** Facts from observational pathway with visibility='team'.

---

## Phase 4: Cross-Agent Support & Pattern Detection (Day 4)

### Task 4.1: Cross-Agent Queries

**File:** `server/db/queries/facts.ts` (add functions)

```typescript
/**
 * Detect patterns across team members
 * Example: Find repeated PR review feedback from Agent-1
 */
export async function detectCrossAgentPatterns(
  teamId: string,
  options: {
    category?: string
    minOccurrences?: number
    limit?: number
  } = {}
): Promise<Array<{
  agentId: string
  content: string
  occurrences: number
  category: string
}>> {
  const minOccurrences = options.minOccurrences || 2
  const limit = options.limit || 20

  const results = await db.execute(sql`
    SELECT
      agent_id,
      content,
      COUNT(*) as occurrences,
      category
    FROM facts
    WHERE visibility = 'team'
      AND agent_id IS NOT NULL
      ${options.category ? sql`AND category = ${options.category}` : sql``}
    GROUP BY agent_id, content, category
    HAVING COUNT(*) >= ${minOccurrences}
    ORDER BY occurrences DESC
    LIMIT ${limit}
  `)

  return results.rows.map((row: any) => ({
    agentId: row.agent_id,
    content: row.content,
    occurrences: Number(row.occurrences),
    category: row.category,
  }))
}

/**
 * Get team-wide facts for enriching agent context
 */
export async function getTeamFacts(
  teamId: string,
  options: {
    category?: string
    limit?: number
  } = {}
): Promise<StoredFact[]> {
  const limit = options.limit || 50

  const results = await db.select()
    .from(facts)
    .where(
      and(
        eq(facts.visibility, 'team'),
        options.category ? eq(facts.category, options.category) : sql`1=1`
      )
    )
    .orderBy(desc(facts.createdAt))
    .limit(limit)

  return results.map(row => ({
    id: row.id,
    content: row.content,
    category: row.category as any,
    confidence: row.confidence,
    extractionMethod: row.extractionMethod as any,
    entities: row.entities || [],
    sourceSession: row.sourceSession || undefined,
    sourceUserMessage: row.sourceUserMessage || undefined,
    sourceAssistantMessage: row.sourceAssistantMessage || undefined,
    sourceActivitySession: row.sourceActivitySession || undefined,
    agentId: row.agentId || undefined,
    visibility: row.visibility as any,
    createdAt: row.createdAt,
  }))
}
```

**Tests:** `server/db/queries/facts.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { storeFact, detectCrossAgentPatterns, getTeamFacts } from './facts'

describe('Cross-Agent Queries', () => {
  beforeEach(async () => {
    // Clean test database
    await db.delete(facts).where(sql`1=1`)
  })

  it('detects repeated patterns from same agent', async () => {
    // Store same fact 3 times from Agent-1
    await storeFact(
      {
        content: 'Should add null check',
        category: 'policy',
        confidence: 0.9,
        extractionMethod: 'pattern',
        entities: [],
      },
      { agentId: 'agent-1', visibility: 'team' }
    )
    await storeFact(
      {
        content: 'Should add null check',
        category: 'policy',
        confidence: 0.9,
        extractionMethod: 'pattern',
        entities: [],
      },
      { agentId: 'agent-1', visibility: 'team' }
    )
    await storeFact(
      {
        content: 'Should add null check',
        category: 'policy',
        confidence: 0.9,
        extractionMethod: 'pattern',
        entities: [],
      },
      { agentId: 'agent-1', visibility: 'team' }
    )

    const patterns = await detectCrossAgentPatterns('team-1', {
      minOccurrences: 2,
    })

    expect(patterns).toHaveLength(1)
    expect(patterns[0].content).toBe('Should add null check')
    expect(patterns[0].occurrences).toBe(3)
    expect(patterns[0].agentId).toBe('agent-1')
  })

  it('retrieves team facts', async () => {
    await storeFact(
      {
        content: 'Team uses TypeScript',
        category: 'technology',
        confidence: 0.9,
        extractionMethod: 'pattern',
        entities: ['TypeScript'],
      },
      { visibility: 'team' }
    )

    const teamFacts = await getTeamFacts('team-1')
    expect(teamFacts).toHaveLength(1)
    expect(teamFacts[0].content).toBe('Team uses TypeScript')
    expect(teamFacts[0].visibility).toBe('team')
  })
})
```

---

### Task 4.2: Enrich Prompts with Team Facts

**File:** `server/memory/context-enrichment.ts`

```typescript
import { searchFacts, getTeamFacts } from '@/server/db/queries/facts'

export async function enrichPromptWithMemory(
  userQuery: string,
  sessionId: string,
  options: {
    includeTeamFacts?: boolean
    maxFacts?: number
  } = {}
): Promise<string> {
  const maxFacts = options.maxFacts || 5

  // Search for relevant facts from this session
  const sessionFacts = await searchFacts(userQuery, {
    sessionId,
    limit: maxFacts,
  })

  let enrichedContext = ''

  if (sessionFacts.length > 0) {
    enrichedContext += '\n\n## Relevant Personal Context:\n'
    sessionFacts.forEach(fact => {
      enrichedContext += `- ${fact.content}\n`
    })
  }

  // Optionally include team-wide facts
  if (options.includeTeamFacts) {
    const teamFacts = await getTeamFacts('team-1', { limit: maxFacts })
    if (teamFacts.length > 0) {
      enrichedContext += '\n\n## Relevant Team Context:\n'
      teamFacts.forEach(fact => {
        enrichedContext += `- ${fact.content}\n`
      })
    }
  }

  return enrichedContext
}
```

**Integration with Chat API:** `server/routes/api/chat.post.ts`

```typescript
import { enrichPromptWithMemory } from '@/server/memory/context-enrichment'

export default defineEventHandler(async (event) => {
  // ... existing code ...

  // Enrich prompt with memory before sending to LLM
  const enrichedContext = await enrichPromptWithMemory(
    userMessage.content,
    sessionId,
    { includeTeamFacts: false } // Enable for multi-agent scenarios
  )

  const systemPrompt = `You are Galatea, a helpful AI assistant.${enrichedContext}`

  const { text: assistantResponse } = await streamText({
    model: getModel(),
    system: systemPrompt,
    messages: [...conversationHistory, userMessage],
    // ... existing config ...
  })

  // ... rest of handler ...
})
```

---

## Testing & Validation

### Manual Test Plan

**Test 1: Pattern-Based Extraction**
```bash
# Chat with preference
curl -X POST http://localhost:13000/api/chat \\
  -d '{"sessionId":"test-1","message":"I prefer dark mode for coding"}'

# Verify fact stored
psql $DATABASE_URL -c "SELECT * FROM facts WHERE source_session='test-1';"
```

**Expected:** Fact with content "User prefers dark mode", extraction_method="pattern".

---

**Test 2: Technology Switch**
```bash
curl -X POST http://localhost:13000/api/chat \\
  -d '{"sessionId":"test-2","message":"We switched from JWT to Clerk for authentication"}'

psql $DATABASE_URL -c "SELECT * FROM facts WHERE source_session='test-2';"
```

**Expected:** Fact with content "Team switched from JWT to Clerk", entities=["JWT","Clerk"].

---

**Test 3: LLM Fallback**
```bash
# Message that doesn't match patterns but has facts
curl -X POST http://localhost:13000/api/chat \\
  -d '{"sessionId":"test-3","message":"Our team decided to adopt microservices for better scalability"}'

psql $DATABASE_URL -c "SELECT * FROM facts WHERE source_session='test-3';"
```

**Expected:** Fact extracted via LLM, extraction_method="llm".

---

**Test 4: Memory Retrieval**
```bash
# Set preference
curl -X POST http://localhost:13000/api/chat \\
  -d '{"sessionId":"test-4","message":"I prefer React over Vue"}'

# Query about preference
curl -X POST http://localhost:13000/api/chat \\
  -d '{"sessionId":"test-4","message":"What frontend framework should I use?"}'
```

**Expected:** Assistant response mentions "you prefer React" based on retrieved memory.

---

**Test 5: Cross-Agent Pattern Detection**
```typescript
// Simulate 3 PR reviews from Agent-1 with null check feedback
await storeFact({ content: 'Should add null check', ... }, { agentId: 'agent-1', visibility: 'team' })
await storeFact({ content: 'Should add null check', ... }, { agentId: 'agent-1', visibility: 'team' })
await storeFact({ content: 'Should add null check', ... }, { agentId: 'agent-1', visibility: 'team' })

// Detect pattern
const patterns = await detectCrossAgentPatterns('team-1', { minOccurrences: 2 })
```

**Expected:** Pattern detected with occurrences=3.

---

### Automated Test Suite

**Run all tests:**
```bash
pnpm vitest run server/memory/**/*.test.ts
pnpm vitest run server/db/queries/facts.test.ts
```

**Expected:** All tests pass (>90% code coverage).

---

## Performance Benchmarks

### Benchmark Script: `scripts/benchmark-memory-extraction.ts`

```typescript
import { extractFactsWithPatterns, extractFactsWithLLM } from '../server/memory/fact-extractor'
import { performance } from 'perf_hooks'

const testMessages = [
  "I prefer dark mode",
  "We switched from JWT to Clerk",
  "Started using React last month",
  "Our team decided to adopt microservices for scalability", // LLM fallback
]

async function benchmark() {
  console.log('Pattern-Based Extraction:')
  for (const msg of testMessages.slice(0, 3)) {
    const start = performance.now()
    const facts = extractFactsWithPatterns(msg)
    const duration = performance.now() - start
    console.log(`  "${msg}" -> ${facts.length} facts in ${duration.toFixed(2)}ms`)
  }

  console.log('\nLLM Fallback Extraction:')
  const llmMsg = testMessages[3]
  const start = performance.now()
  const facts = await extractFactsWithLLM('', llmMsg)
  const duration = performance.now() - start
  console.log(`  "${llmMsg}" -> ${facts.length} facts in ${duration.toFixed(2)}ms`)
}

benchmark()
```

**Run:**
```bash
pnpm tsx scripts/benchmark-memory-extraction.ts
```

**Expected:**
- Pattern-based: <1ms per message
- LLM fallback: 200-500ms per message

---

## Deployment Checklist

- [ ] Run migrations: `pnpm drizzle-kit migrate`
- [ ] Verify pgvector extension installed: `CREATE EXTENSION IF NOT EXISTS vector;`
- [ ] Verify Ollama running with llama3.2:latest: `ollama list`
- [ ] Run full test suite: `pnpm vitest run`
- [ ] Run performance benchmarks: `pnpm tsx scripts/benchmark-memory-extraction.ts`
- [ ] Manual smoke tests (5 test scenarios above)
- [ ] Monitor extraction method distribution (target 70% pattern, 30% LLM)
- [ ] Monitor fact quality (manual review of 100 sampled facts)

---

## Monitoring & Iteration

### Metrics to Track

1. **Extraction Method Distribution:**
   ```sql
   SELECT extraction_method, COUNT(*)
   FROM facts
   GROUP BY extraction_method;
   ```
   Target: 70% pattern, 30% llm

2. **Pattern Miss Rate:**
   Log when `needsLlmExtraction=true` to identify missing patterns

3. **Fact Quality:**
   Manual review of 100 random facts per week:
   ```sql
   SELECT * FROM facts ORDER BY RANDOM() LIMIT 100;
   ```

4. **Retrieval Quality:**
   Track whether enriched context improves responses (user feedback)

### Iteration Plan

**Week 1-2:** Monitor extraction distribution, identify common LLM fallback cases

**Week 3-4:** Add new patterns based on common LLM fallback cases

**Month 2:** Achieve target 70/30 split and >85% fact quality

---

## Open Questions & Future Work

1. **Pattern Library Growth:** As we add more patterns, matching time increases. Consider pattern indexing or categorization.

2. **Confidence Tuning:** Initial confidence scores are estimates. Need calibration based on retrieval usefulness.

3. **Entity Linking:** Should we deduplicate entities across facts? (e.g., "React", "react", "React.js")

4. **Temporal Decay:** Should older facts have lower confidence scores?

5. **Fact Contradictions:** How to handle contradictory facts? (e.g., "I prefer Vue" after "I prefer React")
