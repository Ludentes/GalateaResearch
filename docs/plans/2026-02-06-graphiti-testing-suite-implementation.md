# Graphiti LLM Testing Suite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build automated testing suite to evaluate Graphiti's entity/fact extraction quality across different LLM configurations (models, temperature, prompts) with objective metrics and Langfuse dashboard comparison.

**Architecture:** Golden dataset (JSON) → Test runner (TypeScript) → Graphiti ingestion → FalkorDB extraction → Scoring (F1/precision/recall) → Langfuse logging → Dashboard comparison.

**Tech Stack:** TypeScript, Vitest, Langfuse SDK, FalkorDB, YAML config, Docker Compose

---

## Prerequisites

**Required before starting:**
- [ ] Langfuse configured (self-hosted or cloud) with API keys in `.env.local`
- [ ] Graphiti container running at `:18000`
- [ ] FalkorDB running at `:16379` with `galatea_memory` graph
- [ ] Ollama models pulled: `llama3.2`, `granite3.1-dense:8b`, `nemotron`

**Verify:**
```bash
# Check Langfuse keys
grep LANGFUSE .env.local

# Check Graphiti health
curl http://localhost:18000/healthcheck

# Check FalkorDB
docker exec galatea-falkordb-1 redis-cli GRAPH.LIST

# Check Ollama models
ollama list | grep -E "(llama3.2|granite|nemotron)"
```

---

## Task 1: Create Golden Dataset Foundation

**Files:**
- Create: `tests/fixtures/graphiti-golden-dataset.json`

**Step 1: Create fixtures directory**

```bash
mkdir -p tests/fixtures
```

**Step 2: Write initial golden dataset (5 test cases)**

Create `tests/fixtures/graphiti-golden-dataset.json`:

```json
{
  "version": "v1",
  "description": "Golden dataset for Graphiti LLM evaluation - initial 5 core test cases",
  "cases": [
    {
      "id": "preference-simple",
      "category": "entity_extraction",
      "input": {
        "messages": [
          {
            "content": "I prefer dark mode",
            "role": "user"
          }
        ],
        "group_id": "test-preference-simple"
      },
      "expectedOutput": {
        "entities": [
          { "name": "dark mode" },
          { "name": "user" }
        ],
        "facts": [
          {
            "fact": "user prefers dark mode",
            "source_entity": "user",
            "target_entity": "dark mode"
          }
        ]
      },
      "notes": "Basic preference extraction - simplest case"
    },
    {
      "id": "tech-stack-complex",
      "category": "fact_extraction",
      "input": {
        "messages": [
          {
            "content": "We use PostgreSQL for the database and Redis for caching",
            "role": "user"
          }
        ],
        "group_id": "test-tech-stack"
      },
      "expectedOutput": {
        "entities": [
          { "name": "PostgreSQL" },
          { "name": "Redis" },
          { "name": "team" }
        ],
        "facts": [
          {
            "fact": "team uses PostgreSQL for database",
            "source_entity": "team",
            "target_entity": "PostgreSQL"
          },
          {
            "fact": "team uses Redis for caching",
            "source_entity": "team",
            "target_entity": "Redis"
          }
        ]
      },
      "notes": "Multiple facts from single message - tests fact extraction"
    },
    {
      "id": "dedup-same-entity",
      "category": "deduplication",
      "input": {
        "messages": [
          {
            "content": "I use Docker for containers",
            "role": "user"
          },
          {
            "content": "Docker is great for development",
            "role": "assistant"
          }
        ],
        "group_id": "test-dedup"
      },
      "expectedOutput": {
        "entities": [
          { "name": "Docker" },
          { "name": "user" }
        ],
        "facts": [
          {
            "fact": "user uses Docker for containers",
            "source_entity": "user",
            "target_entity": "Docker"
          }
        ]
      },
      "notes": "Docker mentioned twice should create ONE entity - tests deduplication"
    },
    {
      "id": "policy-extraction",
      "category": "fact_extraction",
      "input": {
        "messages": [
          {
            "content": "We always use TypeScript for new projects",
            "role": "user"
          }
        ],
        "group_id": "test-policy"
      },
      "expectedOutput": {
        "entities": [
          { "name": "TypeScript" },
          { "name": "team" }
        ],
        "facts": [
          {
            "fact": "team always uses TypeScript for new projects",
            "source_entity": "team",
            "target_entity": "TypeScript"
          }
        ]
      },
      "notes": "Policy statement - tests 'always' pattern recognition"
    },
    {
      "id": "edge-case-empty",
      "category": "edge_case",
      "input": {
        "messages": [
          {
            "content": "Hi",
            "role": "user"
          }
        ],
        "group_id": "test-edge-empty"
      },
      "expectedOutput": {
        "entities": [],
        "facts": []
      },
      "notes": "Greeting with no extractable content - should extract nothing"
    }
  ]
}
```

**Step 3: Verify JSON is valid**

Run: `cat tests/fixtures/graphiti-golden-dataset.json | jq .`

Expected: JSON parsed successfully, shows 5 test cases

**Step 4: Commit**

```bash
git add tests/fixtures/graphiti-golden-dataset.json
git commit -m "feat(benchmark): add golden dataset with 5 core test cases

Initial test cases covering:
- Entity extraction (preference-simple)
- Fact extraction (tech-stack-complex, policy-extraction)
- Deduplication (dedup-same-entity)
- Edge cases (edge-case-empty)

Dataset version: v1"
```

---

## Task 2: Create Benchmark Config Presets

**Files:**
- Create: `tests/configs/graphiti-benchmark-configs.yaml`

**Step 1: Create configs directory**

```bash
mkdir -p tests/configs
```

**Step 2: Write YAML config file**

Create `tests/configs/graphiti-benchmark-configs.yaml`:

```yaml
configurations:
  - name: llama3.2-baseline
    model: llama3.2
    temperature: 0.7
    description: Current production baseline

  - name: granite-conservative
    model: granite3.1-dense:8b
    temperature: 0.3
    description: Test granite with low temperature for consistency

  - name: granite-balanced
    model: granite3.1-dense:8b
    temperature: 0.7
    description: Test granite with default temperature

  - name: granite-creative
    model: granite3.1-dense:8b
    temperature: 1.0
    description: Test granite with high temp for variety

  - name: nemotron-balanced
    model: nemotron
    temperature: 0.7
    description: Test nemotron with default temperature

  - name: granite-custom-prompt
    model: granite3.1-dense:8b
    temperature: 0.7
    system_prompt: |
      You are a precise entity and relationship extractor for a knowledge graph.

      Rules:
      - Extract only concrete entities mentioned explicitly
      - Avoid extracting pronouns (I, you, we) as separate entities
      - Deduplicate similar entities (e.g., "Docker" and "docker" are the same)
      - Create facts only for explicitly stated relationships
      - Use consistent entity names (lowercase for common nouns, proper case for names)
    description: Test custom system prompt for better extraction
```

**Step 3: Verify YAML is valid**

Install yaml tool if needed: `pnpm add -D yaml`

Run: `node -e "const yaml = require('yaml'); const fs = require('fs'); console.log(yaml.parse(fs.readFileSync('tests/configs/graphiti-benchmark-configs.yaml', 'utf8')))"`

Expected: YAML parsed successfully, shows 6 configurations

**Step 4: Commit**

```bash
git add tests/configs/graphiti-benchmark-configs.yaml
git commit -m "feat(benchmark): add config presets for model testing

6 configurations covering:
- llama3.2-baseline (current production)
- granite-conservative/balanced/creative (temperature variations)
- nemotron-balanced
- granite-custom-prompt (system prompt experiment)"
```

---

## Task 3: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install langfuse and yaml**

Run: `pnpm add langfuse yaml`

Expected: Both packages added to dependencies

**Step 2: Install type definitions**

Run: `pnpm add -D @types/node`

Expected: Types added to devDependencies

**Step 3: Verify installation**

Run: `node -e "require('langfuse'); require('yaml'); console.log('OK')"`

Expected: Output "OK" with no errors

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(benchmark): add langfuse and yaml dependencies

Added:
- langfuse (experiment tracking SDK)
- yaml (config file parsing)
- @types/node (TypeScript support)"
```

---

## Task 4: Create Scoring Engine (Part 1: Entity Matching)

**Files:**
- Create: `scripts/lib/scoring.ts`
- Create: `scripts/lib/__tests__/scoring.test.ts`

**Step 1: Write failing test for entity normalization**

Create `scripts/lib/__tests__/scoring.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { matchEntity } from '../scoring'

describe('matchEntity', () => {
  it('matches identical entities', () => {
    expect(matchEntity('Docker', 'Docker')).toBe(true)
  })

  it('matches case-insensitive', () => {
    expect(matchEntity('Docker', 'docker')).toBe(true)
    expect(matchEntity('POSTGRESQL', 'PostgreSQL')).toBe(true)
  })

  it('matches after whitespace normalization', () => {
    expect(matchEntity('dark  mode', 'dark mode')).toBe(true)
    expect(matchEntity('  React Native  ', 'React Native')).toBe(true)
  })

  it('does not match different entities', () => {
    expect(matchEntity('Docker', 'Redis')).toBe(false)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/lib/__tests__/scoring.test.ts`

Expected: FAIL with "Cannot find module '../scoring'"

**Step 3: Write minimal implementation**

Create `scripts/lib/scoring.ts`:

```typescript
/**
 * Scoring engine for Graphiti LLM benchmark evaluation.
 *
 * Calculates precision, recall, and F1 scores for entity and fact extraction.
 */

/**
 * Normalize string for fuzzy matching: lowercase, trim, collapse whitespace.
 */
function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Match two entity names with fuzzy normalization.
 */
export function matchEntity(extracted: string, expected: string): boolean {
  return normalize(extracted) === normalize(expected)
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run scripts/lib/__tests__/scoring.test.ts`

Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add scripts/lib/scoring.ts scripts/lib/__tests__/scoring.test.ts
git commit -m "feat(benchmark): add entity matching with fuzzy normalization

Implements matchEntity() with:
- Case-insensitive matching
- Whitespace normalization
- Trim + collapse extra spaces

Tests cover identical, case-insensitive, whitespace, and negative cases"
```

---

## Task 5: Create Scoring Engine (Part 2: Fact Matching)

**Files:**
- Modify: `scripts/lib/scoring.ts`
- Modify: `scripts/lib/__tests__/scoring.test.ts`

**Step 1: Write failing test for fact matching**

Add to `scripts/lib/__tests__/scoring.test.ts`:

```typescript
import { matchFact } from '../scoring'

describe('matchFact', () => {
  it('matches when source, target, and fact all match', () => {
    const extracted = {
      fact: 'user prefers dark mode',
      source: 'user',
      target: 'dark mode'
    }
    const expected = {
      fact: 'user prefers dark mode',
      source: 'user',
      target: 'dark mode'
    }
    expect(matchFact(extracted, expected)).toBe(true)
  })

  it('matches with entity name normalization', () => {
    const extracted = {
      fact: 'team uses PostgreSQL',
      source: 'Team',
      target: 'postgresql'
    }
    const expected = {
      fact: 'team uses PostgreSQL',
      source: 'team',
      target: 'PostgreSQL'
    }
    expect(matchFact(extracted, expected)).toBe(true)
  })

  it('does not match when source differs', () => {
    const extracted = {
      fact: 'user prefers dark mode',
      source: 'admin',
      target: 'dark mode'
    }
    const expected = {
      fact: 'user prefers dark mode',
      source: 'user',
      target: 'dark mode'
    }
    expect(matchFact(extracted, expected)).toBe(false)
  })

  it('does not match when target differs', () => {
    const extracted = {
      fact: 'user prefers dark mode',
      source: 'user',
      target: 'light mode'
    }
    const expected = {
      fact: 'user prefers dark mode',
      source: 'user',
      target: 'dark mode'
    }
    expect(matchFact(extracted, expected)).toBe(false)
  })

  it('does not match when fact text differs', () => {
    const extracted = {
      fact: 'user likes dark mode',
      source: 'user',
      target: 'dark mode'
    }
    const expected = {
      fact: 'user prefers dark mode',
      source: 'user',
      target: 'dark mode'
    }
    expect(matchFact(extracted, expected)).toBe(false)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/lib/__tests__/scoring.test.ts`

Expected: FAIL with "matchFact is not a function"

**Step 3: Write minimal implementation**

Add to `scripts/lib/scoring.ts`:

```typescript
export interface Fact {
  fact: string
  source: string | { name: string }
  target: string | { name: string }
}

/**
 * Match two facts: must match source AND target entities AND fact text.
 */
export function matchFact(
  extracted: Fact,
  expected: Fact
): boolean {
  // Extract entity names (handle both string and object formats)
  const extractedSource = typeof extracted.source === 'string'
    ? extracted.source
    : extracted.source.name
  const extractedTarget = typeof extracted.target === 'string'
    ? extracted.target
    : extracted.target.name
  const expectedSource = typeof expected.source === 'string'
    ? expected.source
    : expected.source.name
  const expectedTarget = typeof expected.target === 'string'
    ? expected.target
    : expected.target.name

  // Must match source AND target entities
  const entitiesMatch =
    matchEntity(extractedSource, expectedSource) &&
    matchEntity(extractedTarget, expectedTarget)

  if (!entitiesMatch) return false

  // Fact text must also match (normalized)
  return normalize(extracted.fact) === normalize(expected.fact)
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run scripts/lib/__tests__/scoring.test.ts`

Expected: All 9 tests PASS (4 entity + 5 fact)

**Step 5: Commit**

```bash
git add scripts/lib/scoring.ts scripts/lib/__tests__/scoring.test.ts
git commit -m "feat(benchmark): add fact matching with entity validation

Implements matchFact() requiring:
- Source entity match (normalized)
- Target entity match (normalized)
- Fact text match (normalized)

Tests cover matching, normalization, and negative cases for source/target/fact"
```

---

## Task 6: Create Scoring Engine (Part 3: Metrics Calculation)

**Files:**
- Modify: `scripts/lib/scoring.ts`
- Modify: `scripts/lib/__tests__/scoring.test.ts`

**Step 1: Write failing test for calculateScores**

Add to `scripts/lib/__tests__/scoring.test.ts`:

```typescript
import { calculateScores } from '../scoring'

describe('calculateScores', () => {
  it('calculates perfect entity scores', () => {
    const expected = {
      entities: [{ name: 'Docker' }, { name: 'user' }],
      facts: []
    }
    const extracted = {
      entities: [{ name: 'Docker' }, { name: 'user' }],
      facts: [],
      parse_success: true,
      latency_ms: 100
    }
    const scores = calculateScores(expected, extracted)

    expect(scores.entity_precision).toBe(1.0)
    expect(scores.entity_recall).toBe(1.0)
    expect(scores.entity_f1).toBe(1.0)
  })

  it('calculates partial entity scores', () => {
    const expected = {
      entities: [{ name: 'Docker' }, { name: 'Redis' }],
      facts: []
    }
    const extracted = {
      entities: [{ name: 'Docker' }, { name: 'PostgreSQL' }],
      facts: [],
      parse_success: true,
      latency_ms: 100
    }
    const scores = calculateScores(expected, extracted)

    // 1 matched out of 2 extracted = 0.5 precision
    expect(scores.entity_precision).toBe(0.5)
    // 1 matched out of 2 expected = 0.5 recall
    expect(scores.entity_recall).toBe(0.5)
    // F1 = 2 * (0.5 * 0.5) / (0.5 + 0.5) = 0.5
    expect(scores.entity_f1).toBe(0.5)
  })

  it('handles zero extracted entities edge case', () => {
    const expected = {
      entities: [{ name: 'Docker' }],
      facts: []
    }
    const extracted = {
      entities: [],
      facts: [],
      parse_success: true,
      latency_ms: 100
    }
    const scores = calculateScores(expected, extracted)

    expect(scores.entity_precision).toBe(0)
    expect(scores.entity_recall).toBe(0)
    expect(scores.entity_f1).toBe(0)
  })

  it('handles zero expected entities edge case (perfect empty)', () => {
    const expected = {
      entities: [],
      facts: []
    }
    const extracted = {
      entities: [],
      facts: [],
      parse_success: true,
      latency_ms: 100
    }
    const scores = calculateScores(expected, extracted)

    expect(scores.entity_precision).toBe(1.0)
    expect(scores.entity_recall).toBe(1.0)
    expect(scores.entity_f1).toBe(1.0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/lib/__tests__/scoring.test.ts`

Expected: FAIL with "calculateScores is not a function"

**Step 3: Write minimal implementation**

Add to `scripts/lib/scoring.ts`:

```typescript
export interface ExpectedOutput {
  entities: Array<{ name: string; labels?: string[] }>
  facts: Array<{
    fact: string
    source_entity: string
    target_entity: string
  }>
}

export interface ExtractedOutput {
  entities: Array<{ name: string; labels?: string[] }>
  facts: Array<{
    fact: string
    source: string
    target: string
  }>
  parse_success: boolean
  latency_ms: number
  error?: string
}

export interface Scores {
  entity_precision: number
  entity_recall: number
  entity_f1: number
  fact_precision: number
  fact_recall: number
  fact_f1: number
  parse_success: boolean
  total_entities: number
  total_facts: number
  latency_ms: number
}

/**
 * Calculate precision/recall/F1 scores for entity and fact extraction.
 */
export function calculateScores(
  expected: ExpectedOutput,
  extracted: ExtractedOutput
): Scores {
  // Entity scoring
  const matchedEntities = extracted.entities.filter(e =>
    expected.entities.some(exp => matchEntity(e.name, exp.name))
  )

  const entity_precision = extracted.entities.length > 0
    ? matchedEntities.length / extracted.entities.length
    : (expected.entities.length === 0 ? 1.0 : 0)

  const entity_recall = expected.entities.length > 0
    ? matchedEntities.length / expected.entities.length
    : (extracted.entities.length === 0 ? 1.0 : 0)

  const entity_f1 = (entity_precision + entity_recall) > 0
    ? 2 * (entity_precision * entity_recall) / (entity_precision + entity_recall)
    : 0

  // Fact scoring
  const matchedFacts = extracted.facts.filter(f => {
    const extractedFact: Fact = {
      fact: f.fact,
      source: f.source,
      target: f.target
    }
    return expected.facts.some(exp => {
      const expectedFact: Fact = {
        fact: exp.fact,
        source: exp.source_entity,
        target: exp.target_entity
      }
      return matchFact(extractedFact, expectedFact)
    })
  })

  const fact_precision = extracted.facts.length > 0
    ? matchedFacts.length / extracted.facts.length
    : (expected.facts.length === 0 ? 1.0 : 0)

  const fact_recall = expected.facts.length > 0
    ? matchedFacts.length / expected.facts.length
    : (extracted.facts.length === 0 ? 1.0 : 0)

  const fact_f1 = (fact_precision + fact_recall) > 0
    ? 2 * (fact_precision * fact_recall) / (fact_precision + fact_recall)
    : 0

  return {
    entity_precision,
    entity_recall,
    entity_f1,
    fact_precision,
    fact_recall,
    fact_f1,
    parse_success: extracted.parse_success,
    total_entities: extracted.entities.length,
    total_facts: extracted.facts.length,
    latency_ms: extracted.latency_ms
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run scripts/lib/__tests__/scoring.test.ts`

Expected: All 13 tests PASS

**Step 5: Commit**

```bash
git add scripts/lib/scoring.ts scripts/lib/__tests__/scoring.test.ts
git commit -m "feat(benchmark): add metrics calculation (precision/recall/F1)

Implements calculateScores() with:
- Entity precision/recall/F1
- Fact precision/recall/F1
- Edge case handling (0/0 = 1.0 for perfect empty)
- Metadata tracking (parse success, counts, latency)

Tests cover perfect scores, partial scores, and zero extraction edge cases"
```

---

## Task 7: Create Test Runner (Part 1: Foundation)

**Files:**
- Create: `scripts/benchmark-graphiti.ts`
- Modify: `package.json` (add script)

**Step 1: Create scripts directory structure**

```bash
mkdir -p scripts/lib
mkdir -p results
```

**Step 2: Write minimal test runner scaffold**

Create `scripts/benchmark-graphiti.ts`:

```typescript
#!/usr/bin/env node
/**
 * Graphiti LLM Benchmark Runner
 *
 * Tests different LLM configurations (models, temperature, prompts) and logs
 * results to Langfuse for comparison.
 */

import fs from 'fs'
import Langfuse from 'langfuse'

interface GoldenDataset {
  version: string
  description: string
  cases: TestCase[]
}

interface TestCase {
  id: string
  category: string
  input: {
    messages: Array<{ content: string; role: string }>
    group_id: string
  }
  expectedOutput: {
    entities: Array<{ name: string; labels?: string[] }>
    facts: Array<{
      fact: string
      source_entity: string
      target_entity: string
    }>
  }
  notes?: string
}

interface Config {
  name: string
  model: string
  temperature: number
  system_prompt?: string
  description?: string
}

async function main() {
  console.log('=== Graphiti LLM Benchmark ===\n')

  // 1. Setup Langfuse
  const langfuse = new Langfuse({
    secretKey: process.env.LANGFUSE_SECRET_KEY!,
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  })

  // 2. Load golden dataset
  const dataset: GoldenDataset = JSON.parse(
    fs.readFileSync('tests/fixtures/graphiti-golden-dataset.json', 'utf8')
  )

  console.log(`Loaded dataset: ${dataset.description}`)
  console.log(`Version: ${dataset.version}`)
  console.log(`Test cases: ${dataset.cases.length}\n`)

  // 3. Load config (env vars for now)
  const config: Config = {
    name: 'env-vars',
    model: process.env.MODEL_NAME || 'llama3.2',
    temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
    system_prompt: process.env.SYSTEM_PROMPT
  }

  console.log(`Configuration: ${config.model} (temp=${config.temperature})`)

  // Shutdown Langfuse
  await langfuse.shutdownAsync()

  console.log('\nBenchmark complete!')
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
```

**Step 3: Add npm script**

Add to `package.json` scripts:

```json
"benchmark:graphiti": "tsx scripts/benchmark-graphiti.ts"
```

**Step 4: Test script runs**

Run: `pnpm benchmark:graphiti`

Expected: Output shows dataset loaded, config displayed, "Benchmark complete!"

**Step 5: Commit**

```bash
git add scripts/benchmark-graphiti.ts package.json
git commit -m "feat(benchmark): add test runner scaffold

Initial benchmark script with:
- Langfuse setup
- Golden dataset loading
- Config loading from env vars
- Basic structure for expansion

Usage: pnpm benchmark:graphiti"
```

---

## Task 8: Create Test Runner (Part 2: Ingestion)

**Files:**
- Modify: `scripts/benchmark-graphiti.ts`

**Step 1: Add ingestion helper function**

Add to `scripts/benchmark-graphiti.ts` before `main()`:

```typescript
/**
 * Ingest a test case into Graphiti.
 */
async function ingestTestCase(testCase: TestCase): Promise<void> {
  const graphitiMessages = testCase.input.messages.map((m, idx) => ({
    content: m.content,
    role_type: m.role,
    role: m.role,
    name: `${testCase.id}-msg${idx}`,
    source_description: `benchmark:${testCase.id}`
  }))

  const response = await fetch('http://localhost:18000/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      group_id: testCase.input.group_id,
      messages: graphitiMessages
    })
  })

  if (!response.ok) {
    throw new Error(`Graphiti ingestion failed: ${response.statusText}`)
  }
}

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

**Step 2: Add ingestion to main loop**

Modify `main()` function, add after config loading:

```typescript
  // 4. Run test cases (one for now - testing ingestion)
  const testCase = dataset.cases[0]
  console.log(`\nTesting ingestion with: ${testCase.id}`)

  try {
    await ingestTestCase(testCase)
    console.log('  ✓ Ingested to Graphiti')

    console.log('  Waiting 15s for processing...')
    await sleep(15000)

    console.log('  ✓ Processing complete')
  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`)
  }
```

**Step 3: Test ingestion works**

Run: `pnpm benchmark:graphiti`

Expected:
- "Testing ingestion with: preference-simple"
- "✓ Ingested to Graphiti"
- "Waiting 15s for processing..."
- "✓ Processing complete"

**Step 4: Verify in FalkorDB**

Run: `docker exec galatea-falkordb-1 redis-cli GRAPH.QUERY galatea_memory "MATCH (e:Entity {group_id: 'test-preference-simple'}) RETURN e.name"`

Expected: Shows extracted entities (may include "dark mode", "user", etc.)

**Step 5: Commit**

```bash
git add scripts/benchmark-graphiti.ts
git commit -m "feat(benchmark): add Graphiti ingestion

Implements ingestTestCase() with:
- Message formatting for Graphiti API
- POST to /messages endpoint
- Error handling
- 15s wait for async processing

Tests with first test case (preference-simple)"
```

---

## Task 9: Create Test Runner (Part 3: Extraction)

**Files:**
- Modify: `scripts/benchmark-graphiti.ts`

**Step 1: Add FalkorDB extraction helper**

Add to `scripts/benchmark-graphiti.ts` before `main()`:

```typescript
import type { ExtractedOutput } from './lib/scoring'

/**
 * Extract results from FalkorDB for a test case.
 */
async function extractResults(groupId: string): Promise<ExtractedOutput> {
  const startTime = Date.now()

  try {
    // Import FalkorDB client
    const { getGraph } = await import('../server/integrations/falkordb')
    const graph = getGraph('galatea_memory')

    // Query entities
    const entitiesQuery = `
      MATCH (e:Entity)
      WHERE e.group_id = $groupId
      RETURN e.name as name, e.labels as labels
    `
    const entitiesResult = await graph.query(entitiesQuery, { groupId })

    const entities = entitiesResult.map(row => ({
      name: row.get('name'),
      labels: row.get('labels') || []
    }))

    // Query facts
    const factsQuery = `
      MATCH (s:Entity)-[r:RELATES_TO]->(t:Entity)
      WHERE r.group_id = $groupId
      RETURN s.name as source, t.name as target, r.fact as fact
    `
    const factsResult = await graph.query(factsQuery, { groupId })

    const facts = factsResult.map(row => ({
      source: row.get('source'),
      target: row.get('target'),
      fact: row.get('fact')
    }))

    return {
      entities,
      facts,
      parse_success: true,
      latency_ms: Date.now() - startTime
    }
  } catch (error) {
    return {
      entities: [],
      facts: [],
      parse_success: false,
      latency_ms: Date.now() - startTime,
      error: error.message
    }
  }
}
```

**Step 2: Add extraction to main loop**

Modify `main()` function, add after processing wait:

```typescript
    console.log('  Extracting results from FalkorDB...')
    const extracted = await extractResults(testCase.input.group_id)

    console.log(`  ✓ Extracted ${extracted.entities.length} entities, ${extracted.facts.length} facts`)
    console.log(`  Entities: ${extracted.entities.map(e => e.name).join(', ')}`)
```

**Step 3: Test extraction works**

Run: `pnpm benchmark:graphiti`

Expected:
- "Extracting results from FalkorDB..."
- "✓ Extracted N entities, M facts"
- "Entities: dark mode, user" (or similar)

**Step 4: Commit**

```bash
git add scripts/benchmark-graphiti.ts
git commit -m "feat(benchmark): add FalkorDB result extraction

Implements extractResults() with:
- Entity query (name + labels)
- Fact query (source + target + fact text)
- Error handling with graceful degradation
- Latency tracking

Tests with preference-simple case"
```

---

## Task 10: Create Test Runner (Part 4: Scoring)

**Files:**
- Modify: `scripts/benchmark-graphiti.ts`

**Step 1: Import scoring functions**

Add to top of `scripts/benchmark-graphiti.ts`:

```typescript
import { calculateScores } from './lib/scoring'
```

**Step 2: Add scoring to main loop**

Modify `main()` function, add after extraction:

```typescript
    console.log('  Scoring against ground truth...')
    const scores = calculateScores(testCase.expectedOutput, extracted)

    console.log(`  Entity F1: ${scores.entity_f1.toFixed(3)}`)
    console.log(`  Fact F1: ${scores.fact_f1.toFixed(3)}`)
    console.log(`  Parse success: ${scores.parse_success}`)
```

**Step 3: Test scoring works**

Run: `pnpm benchmark:graphiti`

Expected:
- "Scoring against ground truth..."
- "Entity F1: 0.XXX"
- "Fact F1: 0.XXX"
- "Parse success: true"

**Step 4: Commit**

```bash
git add scripts/benchmark-graphiti.ts
git commit -m "feat(benchmark): add scoring with ground truth comparison

Integrates calculateScores() with:
- Entity F1 display
- Fact F1 display
- Parse success indicator

Tests full pipeline: ingest → extract → score"
```

---

## Task 11: Create Test Runner (Part 5: Langfuse Logging)

**Files:**
- Modify: `scripts/benchmark-graphiti.ts`

**Step 1: Add Langfuse session creation**

Modify `main()` function, add after config logging:

```typescript
  // 4. Create Langfuse session for this run
  const runName = `${config.model}-temp${config.temperature}-${Date.now()}`
  console.log(`\nStarting run: ${runName}\n`)

  const session = langfuse.trace({
    name: `Experiment: ${runName}`,
    sessionId: runName,
    metadata: {
      model: config.model,
      temperature: config.temperature,
      system_prompt: config.system_prompt || 'default',
      dataset_version: dataset.version
    },
    tags: ['benchmark', config.model, dataset.version]
  })
```

**Step 2: Add test span and score logging**

Wrap the test case loop with span creation:

```typescript
  // 5. Run test case
  const testCase = dataset.cases[0]
  console.log(`Testing: ${testCase.id}`)

  const testSpan = session.span({
    name: testCase.id,
    metadata: {
      category: testCase.category,
      notes: testCase.notes
    }
  })

  try {
    // ... existing ingestion, extraction, scoring code ...

    // Log scores to Langfuse
    testSpan.score({ name: 'entity_f1', value: scores.entity_f1 })
    testSpan.score({ name: 'entity_precision', value: scores.entity_precision })
    testSpan.score({ name: 'entity_recall', value: scores.entity_recall })
    testSpan.score({ name: 'fact_f1', value: scores.fact_f1 })
    testSpan.score({ name: 'fact_precision', value: scores.fact_precision })
    testSpan.score({ name: 'fact_recall', value: scores.fact_recall })
    testSpan.score({ name: 'parse_success', value: scores.parse_success ? 1 : 0 })

    // Log input/output for debugging
    testSpan.update({
      input: testCase.input,
      output: extracted
    })

    console.log('  ✓ Logged to Langfuse')

  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`)
    testSpan.update({
      level: 'ERROR',
      statusMessage: error.message
    })
  } finally {
    testSpan.end()
  }

  // Add session-level aggregate score (single test for now)
  session.score({ name: 'avg_entity_f1', value: scores.entity_f1 })
  session.score({ name: 'avg_fact_f1', value: scores.fact_f1 })

  session.end()
```

**Step 3: Test Langfuse logging**

Run: `pnpm benchmark:graphiti`

Expected:
- "✓ Logged to Langfuse"
- Check Langfuse UI at http://localhost:3000 or cloud.langfuse.com
- Should see session with test span and scores

**Step 4: Commit**

```bash
git add scripts/benchmark-graphiti.ts
git commit -m "feat(benchmark): add Langfuse experiment tracking

Implements:
- Session creation with metadata (model, temp, dataset version)
- Test span per case with scores
- Score logging (entity/fact precision/recall/F1)
- Input/output logging for debugging
- Aggregate scores at session level

Results visible in Langfuse dashboard"
```

---

## Task 12: Create Test Runner (Part 6: Full Loop)

**Files:**
- Modify: `scripts/benchmark-graphiti.ts`

**Step 1: Add loop over all test cases**

Replace single test case with loop in `main()`:

```typescript
  // 5. Run all test cases
  const results = []
  for (let i = 0; i < dataset.cases.length; i++) {
    const testCase = dataset.cases[i]
    console.log(`\n[${i + 1}/${dataset.cases.length}] Testing: ${testCase.id}`)

    const testSpan = session.span({
      name: testCase.id,
      metadata: {
        category: testCase.category,
        notes: testCase.notes
      }
    })

    try {
      // Ingest
      console.log('  Ingesting...')
      await ingestTestCase(testCase)

      // Wait for processing
      console.log('  Waiting for processing...')
      await sleep(15000)

      // Extract
      console.log('  Extracting results...')
      const extracted = await extractResults(testCase.input.group_id)

      // Score
      const scores = calculateScores(testCase.expectedOutput, extracted)

      // Log results
      console.log(`  Entity F1: ${scores.entity_f1.toFixed(3)}  Fact F1: ${scores.fact_f1.toFixed(3)}`)

      // Log to Langfuse
      testSpan.score({ name: 'entity_f1', value: scores.entity_f1 })
      testSpan.score({ name: 'entity_precision', value: scores.entity_precision })
      testSpan.score({ name: 'entity_recall', value: scores.entity_recall })
      testSpan.score({ name: 'fact_f1', value: scores.fact_f1 })
      testSpan.score({ name: 'fact_precision', value: scores.fact_precision })
      testSpan.score({ name: 'fact_recall', value: scores.fact_recall })
      testSpan.score({ name: 'parse_success', value: scores.parse_success ? 1 : 0 })

      testSpan.update({
        input: testCase.input,
        output: extracted
      })

      // Flag low-performing cases
      if (scores.entity_f1 < 0.5) {
        testSpan.update({
          metadata: {
            ...testSpan.metadata,
            warning: 'Low entity F1 score'
          }
        })
      }

      testSpan.end()
      results.push({ testCase: testCase.id, scores })

    } catch (error) {
      console.error(`  ✗ Error: ${error.message}`)
      testSpan.update({
        level: 'ERROR',
        statusMessage: error.message
      })
      testSpan.end()
      results.push({
        testCase: testCase.id,
        scores: {
          entity_f1: 0,
          fact_f1: 0,
          parse_success: false,
          error: error.message
        }
      })
    }
  }
```

**Step 2: Add aggregate scoring**

Add after loop:

```typescript
  // 6. Aggregate scores
  const validResults = results.filter(r => r.scores.parse_success !== false)

  if (validResults.length === 0) {
    console.log('\n⚠️  All test cases failed - no valid results to aggregate')
    return
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length

  const aggregated = {
    entity_f1: avg(validResults.map(r => r.scores.entity_f1)),
    entity_precision: avg(validResults.map(r => r.scores.entity_precision)),
    entity_recall: avg(validResults.map(r => r.scores.entity_recall)),
    fact_f1: avg(validResults.map(r => r.scores.fact_f1)),
    fact_precision: avg(validResults.map(r => r.scores.fact_precision)),
    fact_recall: avg(validResults.map(r => r.scores.fact_recall)),
    parse_success_rate: (validResults.length / results.length) * 100
  }

  // Log aggregate scores to session
  session.score({ name: 'avg_entity_f1', value: aggregated.entity_f1 })
  session.score({ name: 'avg_entity_precision', value: aggregated.entity_precision })
  session.score({ name: 'avg_entity_recall', value: aggregated.entity_recall })
  session.score({ name: 'avg_fact_f1', value: aggregated.fact_f1 })
  session.score({ name: 'avg_fact_precision', value: aggregated.fact_precision })
  session.score({ name: 'avg_fact_recall', value: aggregated.fact_recall })
  session.score({ name: 'parse_success_rate', value: aggregated.parse_success_rate })

  // Display summary
  console.log('\n=== Summary ===')
  console.log(`Entity F1: ${aggregated.entity_f1.toFixed(3)}`)
  console.log(`Entity Precision: ${aggregated.entity_precision.toFixed(3)}`)
  console.log(`Entity Recall: ${aggregated.entity_recall.toFixed(3)}`)
  console.log(`Fact F1: ${aggregated.fact_f1.toFixed(3)}`)
  console.log(`Fact Precision: ${aggregated.fact_precision.toFixed(3)}`)
  console.log(`Fact Recall: ${aggregated.fact_recall.toFixed(3)}`)
  console.log(`Parse Success: ${aggregated.parse_success_rate.toFixed(1)}%`)
  console.log(`\nView details in Langfuse: ${process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com'}`)

  // Save results to file
  const resultsFile = `results/benchmark-${runName}.json`
  fs.mkdirSync('results', { recursive: true })
  fs.writeFileSync(
    resultsFile,
    JSON.stringify({ config, results, aggregated }, null, 2)
  )
  console.log(`Results saved to: ${resultsFile}`)

  session.end()
```

**Step 3: Test full loop**

Run: `pnpm benchmark:graphiti`

Expected:
- Processes all 5 test cases
- Shows progress: [1/5], [2/5], etc.
- Displays summary with aggregate scores
- Saves results to `results/benchmark-*.json`

**Step 4: Check Langfuse dashboard**

Open: http://localhost:3000 (or cloud.langfuse.com)

Expected: Session with 5 test spans, aggregate scores visible

**Step 5: Commit**

```bash
git add scripts/benchmark-graphiti.ts
git commit -m "feat(benchmark): implement full test loop with aggregation

Completes test runner with:
- Loop over all test cases
- Aggregate scoring (average across cases)
- Session-level scores in Langfuse
- Summary display with all metrics
- Results saved to JSON file (results/ directory)

Full pipeline working end-to-end"
```

---

## Task 13: Add Config File Loading

**Files:**
- Modify: `scripts/benchmark-graphiti.ts`

**Step 1: Add YAML config loader**

Add to top of `scripts/benchmark-graphiti.ts`:

```typescript
import yaml from 'yaml'
```

Add before `main()`:

```typescript
/**
 * Load configuration from YAML file or env vars.
 */
function loadConfig(configNameOrPath?: string): Config {
  if (!configNameOrPath) {
    // Load from environment variables
    return {
      name: 'env-vars',
      model: process.env.MODEL_NAME || 'llama3.2',
      temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
      system_prompt: process.env.SYSTEM_PROMPT
    }
  }

  // Load from YAML file
  const configs = yaml.parse(
    fs.readFileSync('tests/configs/graphiti-benchmark-configs.yaml', 'utf8')
  )

  const config = configs.configurations.find(c => c.name === configNameOrPath)
  if (!config) {
    throw new Error(`Configuration not found: ${configNameOrPath}`)
  }

  return config
}
```

**Step 2: Parse CLI arguments**

Modify `main()` to use config loader:

```typescript
  // Parse CLI args
  const args = process.argv.slice(2)
  const configFlag = args.find(arg => arg.startsWith('--config='))
  const configName = configFlag?.split('=')[1]

  // 3. Load config
  const config: Config = loadConfig(configName)
```

**Step 3: Test YAML config loading**

Run: `pnpm benchmark:graphiti --config=granite-balanced`

Expected:
- "Configuration: granite3.1-dense:8b (temp=0.7)"
- Runs with granite config from YAML

**Step 4: Test env var config (default)**

Run: `MODEL_NAME=nemotron pnpm benchmark:graphiti`

Expected:
- "Configuration: nemotron (temp=0.7)"
- Runs with env var config

**Step 5: Commit**

```bash
git add scripts/benchmark-graphiti.ts
git commit -m "feat(benchmark): add YAML config file loading

Implements loadConfig() with:
- YAML parsing from configs file
- Config lookup by name
- Env var fallback (default)
- CLI argument parsing (--config=name)

Usage:
- pnpm benchmark:graphiti --config=granite-balanced
- MODEL_NAME=nemotron pnpm benchmark:graphiti"
```

---

## Task 14: Add Graphiti Container Restart (Advanced)

**Files:**
- Modify: `scripts/benchmark-graphiti.ts`

**Step 1: Add container update helpers**

Add before `main()`:

```typescript
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * Update Graphiti container environment and restart.
 */
async function updateGraphitiConfig(config: Config): Promise<void> {
  // Write .env.graphiti file
  const envContent = `
MODEL_NAME=${config.model}
TEMPERATURE=${config.temperature}
${config.system_prompt ? `SYSTEM_PROMPT="${config.system_prompt.replace(/\n/g, '\\n')}"` : ''}
  `.trim()

  fs.writeFileSync('.env.graphiti', envContent)

  console.log('Restarting Graphiti container...')
  await execAsync('docker compose restart graphiti')

  console.log('Waiting for Graphiti to be healthy...')
  await waitForGraphitiHealthy()
  console.log('✓ Graphiti ready\n')
}

/**
 * Wait for Graphiti healthcheck to pass.
 */
async function waitForGraphitiHealthy(maxWaitMs = 30000): Promise<void> {
  const startTime = Date.now()
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch('http://localhost:18000/healthcheck')
      if (response.ok) {
        const data = await response.json()
        if (data.status === 'healthy') {
          return
        }
      }
    } catch (error) {
      // Not ready yet
    }
    await sleep(1000)
  }
  throw new Error('Graphiti did not become healthy in time')
}
```

**Step 2: Add config update to main**

Add to `main()` after config loading:

```typescript
  // Update Graphiti container with config (if using named config)
  if (configName) {
    console.log('Updating Graphiti configuration...')
    await updateGraphitiConfig(config)
  } else {
    console.log('Using env vars - Graphiti container not restarted\n')
  }
```

**Step 3: Test container restart (CAUTION: restarts Docker)**

Run: `pnpm benchmark:graphiti --config=granite-conservative`

Expected:
- "Updating Graphiti configuration..."
- "Restarting Graphiti container..."
- "✓ Graphiti ready"
- Container uses new MODEL_NAME and TEMPERATURE

**Step 4: Verify config applied**

Run: `docker exec galatea-graphiti-1 env | grep MODEL_NAME`

Expected: Shows `MODEL_NAME=granite3.1-dense:8b`

**Step 5: Commit**

```bash
git add scripts/benchmark-graphiti.ts
git commit -m "feat(benchmark): add Graphiti container restart with config

Implements updateGraphitiConfig() with:
- .env.graphiti file generation
- Docker Compose restart
- Healthcheck wait with timeout
- Applied when using --config flag

Allows testing different models without manual restart"
```

---

## Task 15: Documentation and Usage Examples

**Files:**
- Create: `docs/guides/graphiti-benchmark-usage.md`
- Modify: `README.md` (add benchmark section)

**Step 1: Create usage guide**

Create `docs/guides/graphiti-benchmark-usage.md`:

```markdown
# Graphiti LLM Benchmark Usage Guide

## Quick Start

**Run baseline test:**
```bash
pnpm benchmark:graphiti
```

**Test specific model:**
```bash
pnpm benchmark:graphiti --config=granite-balanced
```

**Test with custom env vars:**
```bash
MODEL_NAME=nemotron TEMPERATURE=0.3 pnpm benchmark:graphiti
```

## Configuration

**YAML presets** (`tests/configs/graphiti-benchmark-configs.yaml`):
- `llama3.2-baseline` - Current production
- `granite-conservative` - Low temp (0.3)
- `granite-balanced` - Default temp (0.7)
- `granite-creative` - High temp (1.0)
- `nemotron-balanced` - Nemotron default
- `granite-custom-prompt` - Custom system prompt

**Environment variables:**
- `MODEL_NAME` - Ollama model name
- `TEMPERATURE` - Temperature (0.0-2.0)
- `SYSTEM_PROMPT` - Custom system prompt
- `LANGFUSE_SECRET_KEY` - Langfuse auth
- `LANGFUSE_PUBLIC_KEY` - Langfuse auth

## Understanding Results

**Console output:**
```
[1/5] Testing: preference-simple
  Entity F1: 1.000  Fact F1: 1.000

=== Summary ===
Entity F1: 0.850
Fact F1: 0.720
Parse Success: 100.0%
```

**Langfuse dashboard:**
- Sessions view: Compare runs side-by-side
- Drill-down: See individual test case results
- Scores: Entity/Fact precision/recall/F1

## Adding Test Cases

Edit `tests/fixtures/graphiti-golden-dataset.json`:

```json
{
  "id": "my-new-test",
  "category": "entity_extraction",
  "input": {
    "messages": [
      { "content": "I use Vim for editing", "role": "user" }
    ],
    "group_id": "test-my-new"
  },
  "expectedOutput": {
    "entities": [
      { "name": "Vim" },
      { "name": "user" }
    ],
    "facts": [
      {
        "fact": "user uses Vim for editing",
        "source_entity": "user",
        "target_entity": "Vim"
      }
    ]
  },
  "notes": "Tests tool preference extraction"
}
```

Increment version: `"version": "v2"`

## Interpreting Scores

**F1 Score:**
- 1.0 = Perfect extraction
- 0.8-0.9 = Good extraction
- 0.5-0.7 = Moderate issues
- < 0.5 = Poor extraction

**Precision vs Recall:**
- High precision, low recall = Missing entities (conservative)
- Low precision, high recall = Extracting noise (aggressive)

**Parse Success:**
- < 100% = Model producing invalid JSON

## Troubleshooting

**Error: "Graphiti ingestion failed"**
- Check Graphiti is running: `curl http://localhost:18000/healthcheck`
- Check Ollama model exists: `ollama list`

**Error: "Cannot find module langfuse"**
- Install dependencies: `pnpm install`

**Low scores across all tests:**
- Check Ollama model quality (try OpenRouter fallback)
- Verify .env.graphiti applied correctly
- Check Graphiti logs: `docker logs galatea-graphiti-1`

## Best Practices

1. **Test baseline first** - Establish reference scores
2. **Change one variable** - Model OR temp OR prompt at a time
3. **Run multiple times** - LLMs have variance
4. **Add test cases gradually** - Start with 5, grow to 20-30
5. **Version dataset** - Increment version when adding cases
```

**Step 2: Add benchmark section to README**

Add to main README.md (after installation section):

```markdown
## Benchmarking Graphiti LLM Quality

Test different LLM configurations for entity/fact extraction:

```bash
# Run baseline
pnpm benchmark:graphiti

# Test specific config
pnpm benchmark:graphiti --config=granite-balanced

# Compare in Langfuse dashboard
open http://localhost:3000
```

See [Benchmark Usage Guide](docs/guides/graphiti-benchmark-usage.md) for details.
```

**Step 3: Commit documentation**

```bash
git add docs/guides/graphiti-benchmark-usage.md README.md
git commit -m "docs(benchmark): add comprehensive usage guide

Created:
- docs/guides/graphiti-benchmark-usage.md (complete guide)
- README.md benchmark section (quick start)

Covers:
- Quick start examples
- Configuration options
- Understanding results
- Adding test cases
- Interpreting scores
- Troubleshooting
- Best practices"
```

---

## Verification Checklist

**Before marking complete, verify:**

- [ ] Golden dataset has 5 test cases (entity, fact, dedup, policy, edge case)
- [ ] Config YAML has 6 presets (llama3.2, granite variations, nemotron)
- [ ] Scoring engine tests pass (13 tests for entity/fact/metrics)
- [ ] Test runner completes full loop (5 test cases processed)
- [ ] Langfuse shows session with 5 test spans and aggregate scores
- [ ] Results saved to `results/benchmark-*.json`
- [ ] `--config=NAME` flag works with YAML configs
- [ ] Env var config works (MODEL_NAME, TEMPERATURE)
- [ ] Container restart works with `--config` flag
- [ ] Documentation explains usage, scores, troubleshooting

**Run full verification:**
```bash
# Check tests pass
pnpm vitest run scripts/lib/__tests__/scoring.test.ts

# Run benchmark with config
pnpm benchmark:graphiti --config=granite-balanced

# Check Langfuse
open http://localhost:3000

# Check results file created
ls -la results/
```

---

## Success Criteria

**Implementation succeeds when:**

1. ✅ Can run benchmark with 5 test cases and get objective scores
2. ✅ Results logged to Langfuse with session + test spans
3. ✅ Can compare different models side-by-side in Langfuse UI
4. ✅ Can switch between configs via --config flag or env vars
5. ✅ Aggregate scores (Entity F1, Fact F1) calculated correctly
6. ✅ Results saved to JSON file for backup/analysis
7. ✅ Documentation covers usage, interpretation, troubleshooting

**Next steps after completion:**
- Add more test cases (grow to 20-30)
- Run batch mode (test all configs overnight)
- Identify best-performing model configuration
- Use findings to update production Graphiti config

---

*Implementation plan created: 2026-02-06*
*Estimated time: 8-12 hours (15 tasks)*
*Stack: TypeScript, Vitest, Langfuse, FalkorDB, YAML, Docker Compose*
