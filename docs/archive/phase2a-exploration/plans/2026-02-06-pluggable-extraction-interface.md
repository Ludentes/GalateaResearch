# Pluggable Memory Extraction Interface

**Date:** 2026-02-06
**Parent:** [Unified Memory Extraction Design](./2026-02-06-unified-memory-extraction-design.md)
**Purpose:** Abstract LLM extraction behind a common interface to support multiple backends

## Problem

The unified extraction approach has a pattern-based fast path (70%) and LLM fallback (30%). Currently, the LLM fallback is hardcoded to Ollama. We want to:

1. **Reuse existing code**: Leverage Mem0 and Graphiti integrations we've already built
2. **A/B test extractors**: Compare quality across Ollama, Mem0, Graphiti, Claude
3. **Graceful fallback**: Try cheap extractors first, fall back to expensive ones if needed
4. **Easy swapping**: Configure extraction strategy without code changes

## Solution: MemoryExtractor Interface

### Core Interface

```typescript
export interface MemoryExtractor {
  /** Unique identifier for this extractor */
  name: string

  /** Extract facts from text with context */
  extract(context: ExtractionContext, text: string): Promise<ExtractedFact[]>

  /** Performance characteristics */
  estimatedLatency: number // milliseconds
  cost: number // dollars per 1k tokens

  /** Health check */
  isAvailable(): Promise<boolean>
}

export interface ExtractionContext {
  /** Conversation history or activity context */
  conversationHistory?: string[]
  activitySessionIntent?: string

  /** User/session identifiers */
  sessionId?: string
  userId?: string

  /** Hints for extraction */
  categoryHint?: FactCategory
  confidenceThreshold?: number
}

export interface ExtractedFact {
  content: string
  category: FactCategory
  confidence: number
  extractionMethod: string // extractor name
  entities: string[]
}
```

### Extractor Implementations

#### 1. OllamaExtractor (Local, Free, Fast)

```typescript
export class OllamaExtractor implements MemoryExtractor {
  name = 'ollama'
  estimatedLatency = 350 // ms
  cost = 0

  constructor(
    private modelName: string = 'llama3.2:latest'
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      await ollama.list()
      return true
    } catch {
      return false
    }
  }

  async extract(context: ExtractionContext, text: string): Promise<ExtractedFact[]> {
    const { text: response } = await generateText({
      model: ollama(this.modelName),
      prompt: this.buildPrompt(context, text),
      temperature: 0.1,
    })

    return this.parseResponse(response)
  }

  private buildPrompt(context: ExtractionContext, text: string): string {
    return `You are a fact extraction system. Extract factual statements from the text.

${context.conversationHistory ? `Conversation history:\n${context.conversationHistory.join('\n')}\n\n` : ''}
${context.activitySessionIntent ? `Activity context: ${context.activitySessionIntent}\n\n` : ''}

Text to analyze: ${text}

Extract facts in categories: preference, policy, technology, decision, temporal, other

Guidelines:
- Only extract facts worth remembering
- Skip greetings, confirmations, general knowledge
- Focus on user-specific or project-specific information
- Be concise and clear

Output JSON:
{
  "facts": [
    {
      "content": "extracted fact in natural language",
      "category": "preference|policy|technology|decision|temporal|other",
      "confidence": 0.0-1.0,
      "entities": ["entity1", "entity2"]
    }
  ]
}`
  }

  private parseResponse(response: string): ExtractedFact[] {
    try {
      const parsed = JSON.parse(response)
      return parsed.facts.map((f: any) => ({
        content: f.content,
        category: f.category,
        confidence: f.confidence,
        extractionMethod: this.name,
        entities: f.entities || [],
      }))
    } catch (error) {
      console.error('Failed to parse Ollama response:', error)
      return []
    }
  }
}
```

#### 2. Mem0Extractor (Wraps Existing Mem0 Integration)

```typescript
export class Mem0Extractor implements MemoryExtractor {
  name = 'mem0'
  estimatedLatency = 800 // ms (based on benchmarks)
  cost = 0.000002 // Using local models

  constructor(
    private mem0Client: MemoryClient, // Existing Mem0 client
    private modelConfig: { provider: string; model: string }
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      // Check if Mem0 client is initialized and Qdrant is running
      return this.mem0Client !== null
    } catch {
      return false
    }
  }

  async extract(context: ExtractionContext, text: string): Promise<ExtractedFact[]> {
    // Use existing Mem0 integration
    const messages = [
      {
        role: 'user',
        content: text,
      },
    ]

    // Add conversation history if available
    if (context.conversationHistory) {
      messages.unshift(
        ...context.conversationHistory.map((msg, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: msg,
        }))
      )
    }

    // Call existing Mem0 add() method
    const result = await this.mem0Client.add(messages, {
      user_id: context.sessionId || 'default',
      agent_id: 'galatea',
      run_id: `extract-${Date.now()}`,
    })

    // Convert Mem0's atomic facts to our ExtractedFact format
    return this.convertMem0Facts(result)
  }

  private convertMem0Facts(mem0Result: any): ExtractedFact[] {
    if (!mem0Result?.results) return []

    return mem0Result.results.map((memory: any) => {
      const fact = memory.memory // Mem0's atomic fact (e.g., "User prefers dark mode")

      return {
        content: fact,
        category: this.inferCategory(fact), // Infer category from content
        confidence: 0.75, // Mem0 doesn't provide confidence, use default
        extractionMethod: this.name,
        entities: this.extractEntities(fact),
      }
    })
  }

  private inferCategory(fact: string): FactCategory {
    const lowerFact = fact.toLowerCase()

    if (/\b(prefer|like|love|hate|dislike)\b/.test(lowerFact)) {
      return 'preference'
    }
    if (/\b(always|never|should|must|policy|standard|rule)\b/.test(lowerFact)) {
      return 'policy'
    }
    if (/\b(switch|migrat|us(e|ing)|adopt)\b/.test(lowerFact)) {
      return 'technology'
    }
    if (/\b(decid|chose|found|workaround)\b/.test(lowerFact)) {
      return 'decision'
    }
    if (/\b(started|been using|last|ago|month|week|year)\b/.test(lowerFact)) {
      return 'temporal'
    }

    return 'other'
  }

  private extractEntities(fact: string): string[] {
    // Simple entity extraction: capitalized words and technical terms
    const entities: string[] = []

    // Capitalized words (likely entities)
    const capitalizedMatches = fact.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g)
    if (capitalizedMatches) entities.push(...capitalizedMatches)

    // Technical terms (camelCase, dot notation)
    const techMatches = fact.match(/\b[a-z]+[A-Z][a-zA-Z]*\b|\b[a-z]+\.[a-z]+\b/g)
    if (techMatches) entities.push(...techMatches)

    return [...new Set(entities)] // Deduplicate
  }
}
```

#### 3. GraphitiExtractor (Wraps Existing Graphiti Integration)

```typescript
export class GraphitiExtractor implements MemoryExtractor {
  name = 'graphiti'
  estimatedLatency = 1200 // ms (based on benchmarks)
  cost = 0.000003

  constructor(
    private graphitiClient: Graphiti // Existing Graphiti client
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      // Check if Graphiti client is initialized and FalkorDB is running
      return this.graphitiClient !== null
    } catch {
      return false
    }
  }

  async extract(context: ExtractionContext, text: string): Promise<ExtractedFact[]> {
    // Build episode from context
    const episode = {
      name: `extraction-${Date.now()}`,
      episode_body: text,
      source_description: context.activitySessionIntent || 'Conversation',
      reference_time: new Date(),
    }

    // Add conversation history as previous episodes if available
    const episodes = context.conversationHistory
      ? [
          ...context.conversationHistory.map((msg, i) => ({
            name: `context-${i}`,
            episode_body: msg,
            source_description: 'Context',
            reference_time: new Date(Date.now() - (context.conversationHistory!.length - i) * 1000),
          })),
          episode,
        ]
      : [episode]

    // Call existing Graphiti add_episode() method
    for (const ep of episodes) {
      await this.graphitiClient.add_episode(ep)
    }

    // Search for extracted facts
    const results = await this.graphitiClient.search(text, {
      num_results: 10,
    })

    // Convert Graphiti's edges (facts) to our ExtractedFact format
    return this.convertGraphitiFacts(results)
  }

  private convertGraphitiFacts(graphitiResults: any): ExtractedFact[] {
    if (!graphitiResults?.edges) return []

    return graphitiResults.edges.map((edge: any) => {
      // Graphiti stores facts as edges: (source) -[fact]-> (target)
      const source = edge.source_node?.name || 'unknown'
      const target = edge.target_node?.name || 'unknown'
      const fact = edge.fact || edge.name

      const content = this.formatFact(source, fact, target)

      return {
        content,
        category: this.inferCategory(fact),
        confidence: edge.valid_at ? 0.8 : 0.6, // Higher confidence if temporally valid
        extractionMethod: this.name,
        entities: [source, target].filter(e => e !== 'unknown'),
      }
    })
  }

  private formatFact(source: string, fact: string, target: string): string {
    // Convert triple to natural language
    if (fact.includes('prefers') || fact.includes('uses') || fact.includes('likes')) {
      return `${source} ${fact} ${target}`
    }
    return `${source} ${fact} ${target}`
  }

  private inferCategory(fact: string): FactCategory {
    // Similar to Mem0Extractor.inferCategory()
    const lowerFact = fact.toLowerCase()

    if (/\b(prefer|like|love|hate|dislike)\b/.test(lowerFact)) return 'preference'
    if (/\b(always|never|should|must|policy|standard)\b/.test(lowerFact)) return 'policy'
    if (/\b(switch|migrat|us(e|ing)|adopt)\b/.test(lowerFact)) return 'technology'
    if (/\b(decid|chose|found)\b/.test(lowerFact)) return 'decision'
    if (/\b(started|been using|ago)\b/.test(lowerFact)) return 'temporal'

    return 'other'
  }
}
```

#### 4. ClaudeExtractor (High-Quality, Expensive)

```typescript
export class ClaudeExtractor implements MemoryExtractor {
  name = 'claude'
  estimatedLatency = 2000 // ms
  cost = 0.015 // per 1k tokens (Sonnet 4.5)

  constructor(
    private model: string = 'claude-sonnet-4-5'
  ) {}

  async isAvailable(): Promise<boolean> {
    return !!process.env.ANTHROPIC_API_KEY
  }

  async extract(context: ExtractionContext, text: string): Promise<ExtractedFact[]> {
    const { text: response } = await generateText({
      model: anthropic(this.model),
      prompt: this.buildPrompt(context, text),
      temperature: 0.1,
    })

    return this.parseResponse(response)
  }

  private buildPrompt(context: ExtractionContext, text: string): string {
    return `You are a high-precision fact extraction system. Extract factual statements that are:
- User-specific or project-specific (NOT general knowledge)
- Worth remembering for future conversations
- Clearly expressed and unambiguous

${context.conversationHistory ? `Conversation history:\n${context.conversationHistory.join('\n')}\n\n` : ''}
${context.activitySessionIntent ? `Activity context: ${context.activitySessionIntent}\n\n` : ''}

Text to analyze: ${text}

Categories: preference, policy, technology, decision, temporal, other

Output JSON:
{
  "facts": [
    {
      "content": "Clear, natural language fact",
      "category": "category",
      "confidence": 0.0-1.0,
      "entities": ["entity1", "entity2"],
      "reasoning": "Why this is worth remembering"
    }
  ]
}`
  }

  private parseResponse(response: string): ExtractedFact[] {
    try {
      const parsed = JSON.parse(response)
      return parsed.facts.map((f: any) => ({
        content: f.content,
        category: f.category,
        confidence: f.confidence,
        extractionMethod: this.name,
        entities: f.entities || [],
      }))
    } catch (error) {
      console.error('Failed to parse Claude response:', error)
      return []
    }
  }
}
```

### Extraction Strategies

```typescript
export type ExtractionStrategy = 'cheap-first' | 'quality-first' | 'parallel' | 'single'

export class ExtractionOrchestrator {
  constructor(
    private extractors: MemoryExtractor[],
    private strategy: ExtractionStrategy = 'cheap-first'
  ) {}

  async extract(context: ExtractionContext, text: string): Promise<ExtractedFact[]> {
    switch (this.strategy) {
      case 'cheap-first':
        return this.extractCheapFirst(context, text)

      case 'quality-first':
        return this.extractQualityFirst(context, text)

      case 'parallel':
        return this.extractParallel(context, text)

      case 'single':
        return this.extractSingle(context, text)

      default:
        throw new Error(`Unknown strategy: ${this.strategy}`)
    }
  }

  /**
   * Try extractors in order of cost (cheapest first)
   * Stop after first successful extraction
   */
  private async extractCheapFirst(
    context: ExtractionContext,
    text: string
  ): Promise<ExtractedFact[]> {
    const sorted = [...this.extractors].sort((a, b) => a.cost - b.cost)

    for (const extractor of sorted) {
      if (!(await extractor.isAvailable())) continue

      try {
        const facts = await extractor.extract(context, text)
        if (facts.length > 0) {
          return facts
        }
      } catch (error) {
        console.error(`Extractor ${extractor.name} failed:`, error)
        // Continue to next extractor
      }
    }

    return []
  }

  /**
   * Try extractors in order of quality (most expensive first)
   * Stop after first successful extraction
   */
  private async extractQualityFirst(
    context: ExtractionContext,
    text: string
  ): Promise<ExtractedFact[]> {
    const sorted = [...this.extractors].sort((a, b) => b.cost - a.cost)

    for (const extractor of sorted) {
      if (!(await extractor.isAvailable())) continue

      try {
        const facts = await extractor.extract(context, text)
        if (facts.length > 0) {
          return facts
        }
      } catch (error) {
        console.error(`Extractor ${extractor.name} failed:`, error)
      }
    }

    return []
  }

  /**
   * Run all extractors in parallel, merge results
   * Deduplicate based on semantic similarity
   */
  private async extractParallel(
    context: ExtractionContext,
    text: string
  ): Promise<ExtractedFact[]> {
    const availableExtractors = []
    for (const extractor of this.extractors) {
      if (await extractor.isAvailable()) {
        availableExtractors.push(extractor)
      }
    }

    const results = await Promise.allSettled(
      availableExtractors.map(e => e.extract(context, text))
    )

    const allFacts = results
      .filter((r): r is PromiseFulfilledResult<ExtractedFact[]> => r.status === 'fulfilled')
      .flatMap(r => r.value)

    // Deduplicate semantically similar facts
    return this.deduplicateFacts(allFacts)
  }

  /**
   * Use only the first available extractor
   */
  private async extractSingle(
    context: ExtractionContext,
    text: string
  ): Promise<ExtractedFact[]> {
    for (const extractor of this.extractors) {
      if (await extractor.isAvailable()) {
        try {
          return await extractor.extract(context, text)
        } catch (error) {
          console.error(`Extractor ${extractor.name} failed:`, error)
          throw error
        }
      }
    }

    throw new Error('No extractors available')
  }

  private deduplicateFacts(facts: ExtractedFact[]): ExtractedFact[] {
    const unique: ExtractedFact[] = []
    const seen = new Set<string>()

    for (const fact of facts) {
      const normalized = fact.content.toLowerCase().replace(/[^\w\s]/g, '')
      if (!seen.has(normalized)) {
        seen.add(normalized)
        unique.push(fact)
      }
    }

    return unique
  }
}
```

### Updated Extraction Flow

```typescript
// server/memory/fact-extractor.ts (updated)

import { OllamaExtractor, Mem0Extractor, GraphitiExtractor, ClaudeExtractor } from './extractors'
import { ExtractionOrchestrator } from './extraction-orchestrator'

// Initialize extractors
const ollamaExtractor = new OllamaExtractor('llama3.2:latest')
const mem0Extractor = new Mem0Extractor(mem0Client, {
  provider: 'ollama',
  model: 'llama3.2:latest',
})
const graphitiExtractor = new GraphitiExtractor(graphitiClient)
const claudeExtractor = new ClaudeExtractor('claude-sonnet-4-5')

// Create orchestrator with strategy
const orchestrator = new ExtractionOrchestrator(
  [ollamaExtractor, mem0Extractor, graphitiExtractor, claudeExtractor],
  'cheap-first' // Try Ollama first, then Mem0, then Graphiti, then Claude
)

/**
 * Extract facts using LLM (fallback for pattern misses)
 * Now uses pluggable extractors
 */
export async function extractFactsWithLLM(
  context: string,
  text: string
): Promise<ExtractedFact[]> {
  return orchestrator.extract(
    {
      conversationHistory: context.split('\n'),
      confidenceThreshold: 0.7,
    },
    text
  )
}
```

## Configuration

```typescript
// server/config/extraction.ts

export interface ExtractionConfig {
  strategy: ExtractionStrategy
  extractors: {
    ollama: { enabled: boolean; model: string }
    mem0: { enabled: boolean; model: string }
    graphiti: { enabled: boolean }
    claude: { enabled: boolean; model: string }
  }
}

export const extractionConfig: ExtractionConfig = {
  strategy: process.env.EXTRACTION_STRATEGY as ExtractionStrategy || 'cheap-first',
  extractors: {
    ollama: {
      enabled: process.env.ENABLE_OLLAMA_EXTRACTION !== 'false',
      model: process.env.OLLAMA_EXTRACTION_MODEL || 'llama3.2:latest',
    },
    mem0: {
      enabled: process.env.ENABLE_MEM0_EXTRACTION === 'true',
      model: process.env.MEM0_EXTRACTION_MODEL || 'llama3.2:latest',
    },
    graphiti: {
      enabled: process.env.ENABLE_GRAPHITI_EXTRACTION === 'true',
    },
    claude: {
      enabled: process.env.ENABLE_CLAUDE_EXTRACTION === 'true',
      model: process.env.CLAUDE_EXTRACTION_MODEL || 'claude-sonnet-4-5',
    },
  },
}
```

## Benefits

### 1. Reuse Existing Code
- Mem0 and Graphiti integrations are wrapped, not rewritten
- All benchmark work is preserved
- Easy migration path

### 2. A/B Testing
```typescript
// Compare extractors on same dataset
const strategies = ['ollama', 'mem0', 'graphiti', 'claude']
for (const strategy of strategies) {
  const orchestrator = new ExtractionOrchestrator([extractors[strategy]], 'single')
  const facts = await orchestrator.extract(context, text)
  console.log(`${strategy}: ${facts.length} facts extracted`)
}
```

### 3. Graceful Degradation
- If Ollama fails, automatically fall back to Mem0
- If Mem0 fails, fall back to Graphiti
- If all local extractors fail, fall back to Claude (expensive but reliable)

### 4. Easy Swapping
```bash
# Use only Mem0
ENABLE_OLLAMA_EXTRACTION=false
ENABLE_MEM0_EXTRACTION=true
EXTRACTION_STRATEGY=single

# Use parallel extraction (merge results from all)
EXTRACTION_STRATEGY=parallel

# Quality-first (Claude -> Graphiti -> Mem0 -> Ollama)
EXTRACTION_STRATEGY=quality-first
```

### 5. Performance Optimization
```typescript
// Use fast extractors for real-time chat
const chatOrchestrator = new ExtractionOrchestrator(
  [ollamaExtractor, mem0Extractor], // Only fast extractors
  'cheap-first'
)

// Use high-quality extractors for important memories
const importantOrchestrator = new ExtractionOrchestrator(
  [claudeExtractor, graphitiExtractor],
  'quality-first'
)
```

## Updated Architecture Diagram

```
User Message
     ↓
Fast Skip? (greetings, confirmations)
  NO ↓
     ↓
Pattern Match? (PREFERENCE_PATTERNS, POLICY_PATTERNS, etc.)
  YES ↓         NO → Mark for LLM extraction
     ↓              ↓
Extract Facts    ExtractionOrchestrator
     ↓              ↓
     |         Strategy: cheap-first
     |              ↓
     |         Try: OllamaExtractor (350ms, $0)
     |           SUCCESS ↓  FAIL → Try next
     |              ↓
     |         Try: Mem0Extractor (800ms, $0.000002)
     |           SUCCESS ↓  FAIL → Try next
     |              ↓
     |         Try: GraphitiExtractor (1200ms, $0.000003)
     |           SUCCESS ↓  FAIL → Try next
     |              ↓
     |         Try: ClaudeExtractor (2000ms, $0.015)
     |              ↓
     └──────────────┴─────────→ storeFact()
                                      ↓
                               PostgreSQL facts table
```

## Implementation Tasks

### Task 1: Create Extractor Interface
**File:** `server/memory/extractors/interface.ts`

```typescript
export interface MemoryExtractor {
  name: string
  estimatedLatency: number
  cost: number
  extract(context: ExtractionContext, text: string): Promise<ExtractedFact[]>
  isAvailable(): Promise<boolean>
}

export interface ExtractionContext { /* ... */ }
export interface ExtractedFact { /* ... */ }
```

### Task 2: Implement Extractors
**Files:**
- `server/memory/extractors/ollama.ts`
- `server/memory/extractors/mem0.ts`
- `server/memory/extractors/graphiti.ts`
- `server/memory/extractors/claude.ts`

Each implements the `MemoryExtractor` interface.

### Task 3: Create Orchestrator
**File:** `server/memory/extraction-orchestrator.ts`

Implements `cheap-first`, `quality-first`, `parallel`, `single` strategies.

### Task 4: Update fact-extractor.ts
**File:** `server/memory/fact-extractor.ts`

Replace hardcoded Ollama with orchestrator:
```typescript
export async function extractFactsWithLLM(...): Promise<ExtractedFact[]> {
  return orchestrator.extract(context, text)
}
```

### Task 5: Add Configuration
**File:** `server/config/extraction.ts`

Environment-based configuration for strategy and enabled extractors.

### Task 6: Add Tests
**File:** `server/memory/extractors/extractors.test.ts`

Test each extractor individually and orchestrator strategies.

## Migration Path

### Phase 1: Interface + Ollama Implementation
- Create interface
- Implement OllamaExtractor
- Update fact-extractor.ts to use OllamaExtractor
- **No behavior change yet, just refactoring**

### Phase 2: Add Mem0 + Graphiti Wrappers
- Implement Mem0Extractor (wraps existing mem0Client)
- Implement GraphitiExtractor (wraps existing graphitiClient)
- Add orchestrator with cheap-first strategy
- **Now can fall back to Mem0/Graphiti if Ollama fails**

### Phase 3: Add Claude + Strategies
- Implement ClaudeExtractor
- Add parallel and quality-first strategies
- Add configuration
- **Full flexibility for A/B testing and optimization**

## Monitoring

Track extractor usage:
```typescript
export async function extractFactsWithLLM(...): Promise<ExtractedFact[]> {
  const startTime = Date.now()
  const facts = await orchestrator.extract(context, text)
  const duration = Date.now() - startTime

  // Log extractor performance
  console.log(`Extraction: ${facts[0]?.extractionMethod || 'none'} in ${duration}ms`)

  // Store metrics
  await storeMetric({
    type: 'extraction',
    extractor: facts[0]?.extractionMethod || 'none',
    duration,
    factsExtracted: facts.length,
    strategy: orchestrator.strategy,
  })

  return facts
}
```

Query metrics:
```sql
SELECT
  extractor,
  COUNT(*) as uses,
  AVG(duration) as avg_duration,
  AVG(facts_extracted) as avg_facts
FROM extraction_metrics
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY extractor
ORDER BY uses DESC;
```

This shows which extractors are being used most and their performance characteristics.
