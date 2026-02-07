# Graphiti LLM Testing Suite Design

**Date**: 2026-02-06
**Status**: Ready for Implementation
**Purpose**: Systematic evaluation of different LLM configurations (models, temperature, prompts) for Graphiti entity/fact extraction

---

## Problem Statement

Graphiti's entity extraction quality depends heavily on the LLM configuration. We've experienced issues with Ollama models (`llama3.2`) and need a systematic way to:

1. Test different Ollama models (`granite3.1-dense:8b`, `nemotron`)
2. Test OpenRouter models as fallbacks
3. Experiment with temperature and system prompts
4. Measure extraction quality objectively
5. Compare runs side-by-side
6. Track improvements over time

**Current Pain**: Manual testing, subjective evaluation, no historical tracking.

**Desired State**: Automated test suite with golden dataset, objective metrics, Langfuse dashboard for comparison.

---

## Architecture Overview

```
Golden Dataset (JSON)
    ↓
Test Runner Script (TypeScript)
    ↓
Configure Graphiti (model/temp/prompt via env vars)
    ↓
Ingest test messages → Graphiti
    ↓
Extract results from FalkorDB
    ↓
Score against ground truth (precision/recall/F1)
    ↓
Log to Langfuse (Sessions + Scores)
    ↓
Compare runs in Langfuse UI
```

**Key Components:**

1. **Golden Dataset** (`tests/fixtures/graphiti-golden-dataset.json`) - Test cases with ground truth
2. **Test Runner** (`scripts/benchmark-graphiti.ts`) - Main orchestration script
3. **Config Manager** (`tests/configs/graphiti-benchmark-configs.yaml`) - Model/temp/prompt presets
4. **Scoring Engine** - Calculate precision/recall/F1 for entities and facts
5. **Langfuse Integration** - Track experiments, compare runs, visualize results

**Technology Stack:**
- Langfuse (experiment tracking, already integrated)
- TypeScript (scripting)
- FalkorDB (query results directly)
- Docker Compose (restart Graphiti with new configs)

---

## Component 1: Test Dataset Structure

### File: `tests/fixtures/graphiti-golden-dataset.json`

**Schema:**
```typescript
interface GoldenDataset {
  version: string           // "v1", "v2" for versioning
  description: string
  cases: TestCase[]
}

interface TestCase {
  id: string               // Unique identifier
  category:
    | "entity_extraction"  // Tests entity recognition
    | "fact_extraction"    // Tests relationship extraction
    | "deduplication"      // Tests entity merging
    | "temporal"           // Tests time-based facts
    | "edge_case"          // Tests unusual inputs

  input: {
    messages: Array<{
      content: string
      role: "user" | "assistant"
    }>
    group_id: string       // Isolation per test case
  }

  expectedOutput: {
    entities: Array<{
      name: string
      labels?: string[]    // Optional: ["Technology", "Tool"]
    }>
    facts: Array<{
      fact: string
      source_entity: string
      target_entity: string
    }>
    should_not_extract?: {
      entities?: string[]  // Things that should NOT be extracted
      facts?: string[]
    }
  }

  notes?: string           // Why this test exists
}
```

**Example Test Cases:**

```json
{
  "version": "v1",
  "description": "Golden dataset for Graphiti LLM evaluation",
  "cases": [
    {
      "id": "preference-simple",
      "category": "entity_extraction",
      "input": {
        "messages": [
          { "content": "I prefer dark mode", "role": "user" }
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
      "notes": "Basic preference extraction"
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
          { "name": "PostgreSQL", "labels": ["Database"] },
          { "name": "Redis", "labels": ["Cache"] },
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
      }
    },
    {
      "id": "dedup-same-entity",
      "category": "deduplication",
      "input": {
        "messages": [
          { "content": "I use Docker for containers", "role": "user" },
          { "content": "Docker is great for development", "role": "assistant" }
        ],
        "group_id": "test-dedup"
      },
      "expectedOutput": {
        "entities": [
          { "name": "Docker" }
        ],
        "facts": [
          {
            "fact": "user uses Docker for containers",
            "source_entity": "user",
            "target_entity": "Docker"
          }
        ]
      },
      "notes": "Tests entity deduplication - Docker mentioned twice should create ONE entity"
    }
  ]
}
```

**Versioning Strategy:**
- `v1`: Initial 10-20 core cases (preferences, tech stack, policies)
- `v2`: Add edge cases discovered during testing
- `v3`: Add temporal reasoning, multi-turn conversations
- Keep all versions for regression testing

**Dataset Size:**
- Start: 10-15 test cases (cover common patterns)
- Target: 20-30 test cases (comprehensive coverage)
- Max: 50 test cases (diminishing returns)

---

## Component 2: Scoring & Evaluation

### Metrics

**Entity Extraction:**
- **Precision**: `matched_entities / total_extracted_entities`
- **Recall**: `matched_entities / total_expected_entities`
- **F1**: `2 * (precision * recall) / (precision + recall)`

**Fact Extraction:**
- Same metrics (precision, recall, F1)
- More complex: facts have structure (source, target, text)

**Metadata:**
- **Parse success**: Did JSON parsing succeed?
- **Entity count**: Total entities extracted
- **Fact count**: Total facts extracted
- **Latency**: Extraction time (ms)

### Matching Logic

**Entity Matching (Fuzzy):**
```typescript
function matchEntity(extracted: string, expected: string): boolean {
  // Normalize: lowercase, trim, remove extra spaces
  const normalize = (s: string) =>
    s.toLowerCase().trim().replace(/\s+/g, ' ')

  return normalize(extracted) === normalize(expected)
}
```

**Rationale**: Model might extract "Dark Mode" vs "dark mode" - semantically same.

**Fact Matching (Stricter):**
```typescript
function matchFact(
  extracted: { fact: string, source: string, target: string },
  expected: { fact: string, source: string, target: string }
): boolean {
  // Must match source AND target entities
  const entitiesMatch =
    matchEntity(extracted.source, expected.source) &&
    matchEntity(extracted.target, expected.target)

  if (!entitiesMatch) return false

  // Fact text: exact match after normalization (v1)
  // Future: could use embedding similarity (v2)
  return normalize(extracted.fact) === normalize(expected.fact)
}
```

**Edge Cases:**
- Division by zero: If no entities extracted → F1 = 0
- Perfect score: 0 expected, 0 extracted → F1 = 1.0 ✓

### Scoring Implementation

```typescript
interface Scores {
  entity_precision: number  // 0-1
  entity_recall: number     // 0-1
  entity_f1: number         // 0-1
  fact_precision: number
  fact_recall: number
  fact_f1: number
  parse_success: boolean
  total_entities: number
  total_facts: number
  latency_ms: number
}

function calculateScores(
  expected: ExpectedOutput,
  extracted: ExtractedOutput
): Scores {
  // Entity scoring
  const matchedEntities = extracted.entities.filter(e =>
    expected.entities.some(exp => matchEntity(e.name, exp.name))
  )

  const entity_precision = extracted.entities.length > 0
    ? matchedEntities.length / extracted.entities.length
    : 0

  const entity_recall = expected.entities.length > 0
    ? matchedEntities.length / expected.entities.length
    : (extracted.entities.length === 0 ? 1 : 0)  // Edge case

  const entity_f1 = (entity_precision + entity_recall) > 0
    ? 2 * (entity_precision * entity_recall) / (entity_precision + entity_recall)
    : 0

  // Fact scoring (similar logic)
  const matchedFacts = extracted.facts.filter(f =>
    expected.facts.some(exp => matchFact(f, exp))
  )

  const fact_precision = extracted.facts.length > 0
    ? matchedFacts.length / extracted.facts.length
    : 0

  const fact_recall = expected.facts.length > 0
    ? matchedFacts.length / expected.facts.length
    : (extracted.facts.length === 0 ? 1 : 0)

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

---

## Component 3: Test Runner

### File: `scripts/benchmark-graphiti.ts`

**Main Flow:**

```typescript
import Langfuse from 'langfuse'
import yaml from 'yaml'
import fs from 'fs'

async function main() {
  // 1. Setup Langfuse
  const langfuse = new Langfuse({
    secretKey: process.env.LANGFUSE_SECRET_KEY!,
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  })

  // 2. Load configuration
  const config = loadConfig(process.argv[2]) // --config name or env vars

  // 3. Load golden dataset
  const dataset = JSON.parse(
    fs.readFileSync('tests/fixtures/graphiti-golden-dataset.json', 'utf8')
  )

  // 4. Create Langfuse session for this run
  const runName = `${config.name || config.model}-${Date.now()}`
  console.log(`\n=== Starting Benchmark: ${runName} ===`)
  console.log(`Model: ${config.model}`)
  console.log(`Temperature: ${config.temperature}`)
  console.log(`Test Cases: ${dataset.cases.length}`)

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

  // 5. Run each test case
  const results = []
  for (let i = 0; i < dataset.cases.length; i++) {
    const testCase = dataset.cases[i]
    console.log(`\n[${i + 1}/${dataset.cases.length}] Testing: ${testCase.id}`)

    // Create span for this test case
    const testSpan = session.span({
      name: testCase.id,
      metadata: {
        category: testCase.category,
        notes: testCase.notes
      }
    })

    try {
      // Ingest messages to Graphiti
      await ingestTestCase(testCase)

      // Wait for async processing (Graphiti entity extraction takes ~10-15s)
      console.log('  Waiting for Graphiti processing...')
      await sleep(15000)

      // Extract results from FalkorDB
      const extracted = await extractResults(testCase.input.group_id)

      // Score against ground truth
      const scores = calculateScores(testCase.expectedOutput, extracted)

      // Log results
      console.log(`  Entity F1: ${scores.entity_f1.toFixed(3)}  Fact F1: ${scores.fact_f1.toFixed(3)}`)

      // Attach scores to test span
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
      console.error(`  ERROR: ${error.message}`)
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

  // 6. Aggregate scores across all test cases
  const aggregated = aggregateScores(results)

  // 7. Attach aggregate scores to session
  session.score({ name: 'avg_entity_f1', value: aggregated.entity_f1 })
  session.score({ name: 'avg_entity_precision', value: aggregated.entity_precision })
  session.score({ name: 'avg_entity_recall', value: aggregated.entity_recall })
  session.score({ name: 'avg_fact_f1', value: aggregated.fact_f1 })
  session.score({ name: 'avg_fact_precision', value: aggregated.fact_precision })
  session.score({ name: 'avg_fact_recall', value: aggregated.fact_recall })
  session.score({ name: 'parse_success_rate', value: aggregated.parse_success_rate })

  // 8. Display summary
  console.log('\n=== Summary ===')
  console.log(`Entity F1: ${aggregated.entity_f1.toFixed(3)}`)
  console.log(`Entity Precision: ${aggregated.entity_precision.toFixed(3)}`)
  console.log(`Entity Recall: ${aggregated.entity_recall.toFixed(3)}`)
  console.log(`Fact F1: ${aggregated.fact_f1.toFixed(3)}`)
  console.log(`Fact Precision: ${aggregated.fact_precision.toFixed(3)}`)
  console.log(`Fact Recall: ${aggregated.fact_recall.toFixed(3)}`)
  console.log(`Parse Success: ${aggregated.parse_success_rate.toFixed(1)}%`)
  console.log(`\nView details in Langfuse: ${process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com'}`)

  // 9. Save results to file (backup)
  const resultsFile = `results/benchmark-${runName}.json`
  fs.mkdirSync('results', { recursive: true })
  fs.writeFileSync(
    resultsFile,
    JSON.stringify({ config, results, aggregated }, null, 2)
  )
  console.log(`Results saved to: ${resultsFile}`)

  // 10. Cleanup
  session.end()
  await langfuse.shutdownAsync()
}
```

**Key Helper Functions:**

```typescript
async function ingestTestCase(testCase: TestCase) {
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

async function extractResults(groupId: string): Promise<ExtractedOutput> {
  const startTime = Date.now()

  // Query FalkorDB for entities
  const entitiesQuery = `
    MATCH (e:Entity)
    WHERE e.group_id = $groupId
    RETURN e.name as name, e.labels as labels
  `

  // Query FalkorDB for facts
  const factsQuery = `
    MATCH (s:Entity)-[r:RELATES_TO]->(t:Entity)
    WHERE r.group_id = $groupId
    RETURN s.name as source, t.name as target, r.fact as fact
  `

  try {
    // Execute queries via FalkorDB client
    const { getGraph } = await import('../server/integrations/falkordb')
    const graph = getGraph('galatea_memory')

    const entitiesResult = await graph.query(entitiesQuery, { groupId })
    const factsResult = await graph.query(factsQuery, { groupId })

    const entities = entitiesResult.map(row => ({
      name: row.get('name'),
      labels: row.get('labels') || []
    }))

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

function aggregateScores(results: Array<{ scores: Scores }>): AggregatedScores {
  const validResults = results.filter(r => r.scores.parse_success)

  if (validResults.length === 0) {
    return {
      entity_f1: 0,
      entity_precision: 0,
      entity_recall: 0,
      fact_f1: 0,
      fact_precision: 0,
      fact_recall: 0,
      parse_success_rate: 0
    }
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length

  return {
    entity_f1: avg(validResults.map(r => r.scores.entity_f1)),
    entity_precision: avg(validResults.map(r => r.scores.entity_precision)),
    entity_recall: avg(validResults.map(r => r.scores.entity_recall)),
    fact_f1: avg(validResults.map(r => r.scores.fact_f1)),
    fact_precision: avg(validResults.map(r => r.scores.fact_precision)),
    fact_recall: avg(validResults.map(r => r.scores.fact_recall)),
    parse_success_rate: (validResults.length / results.length) * 100
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

---

## Component 4: Configuration Management

### File: `tests/configs/graphiti-benchmark-configs.yaml`

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

**Config Loader:**

```typescript
interface Config {
  name: string
  model: string
  temperature: number
  system_prompt?: string
  description?: string
}

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

**Update Graphiti Container:**

```typescript
async function updateGraphitiConfig(config: Config) {
  // Write environment variables
  const envContent = `
MODEL_NAME=${config.model}
TEMPERATURE=${config.temperature}
${config.system_prompt ? `SYSTEM_PROMPT="${config.system_prompt.replace(/\n/g, '\\n')}"` : ''}
  `.trim()

  fs.writeFileSync('.env.graphiti', envContent)

  // Restart Graphiti container to pick up new env vars
  console.log('Restarting Graphiti container...')
  await exec('docker compose restart graphiti')

  // Wait for healthcheck
  console.log('Waiting for Graphiti to be healthy...')
  await waitForGraphitiHealthy()
}

async function waitForGraphitiHealthy(maxWaitMs = 30000) {
  const startTime = Date.now()
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch('http://localhost:18000/healthcheck')
      if (response.ok) {
        const data = await response.json()
        if (data.status === 'healthy') {
          console.log('Graphiti is healthy!')
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

---

## Component 5: Langfuse Dashboard Experience

### What You'll See

**1. Sessions List View:**
```
┌───────────────────────────────────────────────────────────────┐
│ Sessions                                     [Filter] [Sort]  │
├───────────────────────────────────────────────────────────────┤
│ ✓ granite3.1-balanced-1738858234                              │
│   avg_entity_f1: 0.89  avg_fact_f1: 0.82                     │
│   Tags: benchmark, granite3.1-dense:8b, v1                    │
│   20 spans • 5m 30s                                           │
├───────────────────────────────────────────────────────────────┤
│ ✓ llama3.2-baseline-1738857123                                │
│   avg_entity_f1: 0.76  avg_fact_f1: 0.68                     │
│   Tags: benchmark, llama3.2, v1                               │
│   20 spans • 5m 15s                                           │
├───────────────────────────────────────────────────────────────┤
│ ✓ nemotron-balanced-1738856012                                │
│   avg_entity_f1: 0.81  avg_fact_f1: 0.74                     │
│   Tags: benchmark, nemotron, v1                               │
│   20 spans • 5m 45s                                           │
└───────────────────────────────────────────────────────────────┘

[Compare Selected]  [Export CSV]
```

**2. Session Detail View:**
```
Session: granite3.1-balanced-1738858234

Configuration:
  Model: granite3.1-dense:8b
  Temperature: 0.7
  System Prompt: default
  Dataset: v1

Aggregate Scores:
  avg_entity_f1: 0.89      ████████░
  avg_entity_precision: 0.92  █████████
  avg_entity_recall: 0.87  ████████░
  avg_fact_f1: 0.82        ████████░
  avg_fact_precision: 0.84 ████████░
  avg_fact_recall: 0.80    ████████░
  parse_success_rate: 100% ██████████

Test Cases (20):
  ✓ preference-simple       entity_f1: 1.00  fact_f1: 1.00
  ✓ tech-stack-complex      entity_f1: 0.83  fact_f1: 0.75
  ⚠ dedup-same-entity       entity_f1: 0.50  fact_f1: 0.67  [Low entity F1]
  ✓ temporal-reasoning      entity_f1: 0.91  fact_f1: 0.88
  ✓ policy-extraction       entity_f1: 0.95  fact_f1: 0.89
  ... (click to expand)
```

**3. Comparison View:**
```
Compare: 3 sessions selected

                           granite3.1  llama3.2  nemotron
avg_entity_f1                  0.89      0.76      0.81
avg_entity_precision           0.92      0.78      0.84
avg_entity_recall              0.87      0.75      0.79
avg_fact_f1                    0.82      0.68      0.74
parse_success_rate            100%      100%       95%

Best performer: granite3.1-balanced-1738858234
```

**4. Filters & Analytics:**
- Filter by tag: `tag:benchmark AND tag:granite3.1`
- Group by model: See average F1 per model across all runs
- Time series: Track improvements as you add more test cases
- Export: CSV download for external analysis

---

## Usage Examples

### Quick Test (Env Vars)

```bash
# Test with granite
MODEL_NAME=granite3.1-dense:8b pnpm benchmark:graphiti

# Test with different temperature
MODEL_NAME=granite3.1-dense:8b TEMPERATURE=0.3 pnpm benchmark:graphiti

# Test with custom prompt
SYSTEM_PROMPT="Extract entities carefully" \
  MODEL_NAME=nemotron \
  pnpm benchmark:graphiti
```

### Named Config

```bash
# Test specific config from YAML
pnpm benchmark:graphiti --config granite-conservative

# Test all configs (batch mode)
pnpm benchmark:graphiti --all-configs
```

### View Results

```bash
# Open Langfuse dashboard
open http://localhost:3000  # or cloud.langfuse.com

# Results also saved locally
cat results/benchmark-granite3.1-balanced-1738858234.json
```

---

## Implementation Checklist

### Phase 1: Foundation (1-2 hours)

- [ ] Create `tests/fixtures/graphiti-golden-dataset.json`
  - [ ] Add 5 basic test cases (preference, tech stack, policy, dedup, edge case)
  - [ ] Version as `v1`
- [ ] Create `tests/configs/graphiti-benchmark-configs.yaml`
  - [ ] Add 3 configs (llama3.2-baseline, granite-balanced, nemotron-balanced)
- [ ] Add `pnpm benchmark:graphiti` script to `package.json`
- [ ] Install dependencies: `pnpm add langfuse yaml`

### Phase 2: Scoring Engine (2-3 hours)

- [ ] Create `scripts/lib/scoring.ts`
  - [ ] Implement `matchEntity()` with normalization
  - [ ] Implement `matchFact()` with entity + text matching
  - [ ] Implement `calculateScores()` with F1 calculation
  - [ ] Add unit tests for edge cases (0/0, division by zero)

### Phase 3: Test Runner (3-4 hours)

- [ ] Create `scripts/benchmark-graphiti.ts`
  - [ ] Implement `loadConfig()` from YAML or env vars
  - [ ] Implement `ingestTestCase()` via Graphiti HTTP API
  - [ ] Implement `extractResults()` via FalkorDB queries
  - [ ] Implement Langfuse session/span creation
  - [ ] Implement score logging to Langfuse
  - [ ] Implement summary display
  - [ ] Add error handling and retries

### Phase 4: Config Management (1-2 hours)

- [ ] Implement `updateGraphitiConfig()` for container restart
- [ ] Implement `waitForGraphitiHealthy()` with timeout
- [ ] Add `--all-configs` batch mode
- [ ] Test config switching works correctly

### Phase 5: Testing & Refinement (2-3 hours)

- [ ] Run baseline test with `llama3.2`
- [ ] Run test with `granite3.1-dense:8b`
- [ ] Run test with `nemotron`
- [ ] Verify Langfuse dashboard shows runs correctly
- [ ] Add 5-10 more test cases to golden dataset (v1 → v2)
- [ ] Document findings in results README

### Phase 6: Documentation (1 hour)

- [ ] Update README with usage examples
- [ ] Document expected scores for baseline models
- [ ] Create troubleshooting guide
- [ ] Add screenshots of Langfuse UI

**Total Estimated Time: 10-15 hours**

---

## Future Enhancements

### v2: Enhanced Matching

- **Semantic fact matching**: Use embedding similarity instead of exact text match
  - Allows "user prefers dark mode" to match "user likes dark mode"
- **Partial credit scoring**: Award 0.5 points for close matches
- **Entity label matching**: Compare extracted labels (e.g., "Database") against expected

### v3: Regression Detection

- **Baseline locking**: Mark a run as "baseline", flag when future runs drop >5% in F1
- **Automated alerts**: Notify when parse success rate drops below 90%
- **CI integration**: Run benchmark in GitHub Actions on model updates

### v4: Advanced Analysis

- **Error analysis**: Automatically categorize failures (missed entities, wrong facts, deduplication failures)
- **Confusion matrix**: What entities are commonly confused?
- **Latency optimization**: Track extraction time per test case, identify slow outliers

### v5: OpenRouter Integration

- **Fallback testing**: Test OpenRouter models when Ollama fails
- **Cost tracking**: Log API costs per run (OpenRouter is paid)
- **Model comparison**: Compare Ollama (free, local) vs OpenRouter (paid, cloud)

---

## Appendix: Langfuse Setup

### Self-Hosted (Recommended)

```yaml
# docker-compose.yml addition
langfuse:
  image: langfuse/langfuse:latest
  ports:
    - "3000:3000"
  environment:
    DATABASE_URL: postgresql://langfuse:langfuse@postgres:5432/langfuse
    NEXTAUTH_SECRET: change-me-in-production
    NEXTAUTH_URL: http://localhost:3000
  depends_on:
    - postgres
```

```bash
# Create Langfuse database
docker exec -it galatea-postgres-1 psql -U postgres -c "CREATE DATABASE langfuse;"
docker exec -it galatea-postgres-1 psql -U postgres -c "CREATE USER langfuse WITH PASSWORD 'langfuse';"
docker exec -it galatea-postgres-1 psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE langfuse TO langfuse;"

# Start Langfuse
docker compose up -d langfuse

# Create API keys
open http://localhost:3000
# Settings → API Keys → Create New Key
# Copy secret/public keys to .env.local
```

### Cloud (Alternative)

```bash
# Sign up at cloud.langfuse.com
# Get API keys from dashboard
# Add to .env.local

LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_PUBLIC_KEY=pk-lf-...
# LANGFUSE_BASE_URL not needed (defaults to cloud)
```

---

## Success Criteria

**Phase 1 Success:**
- [ ] Can run benchmark with 5 test cases
- [ ] Results appear in Langfuse dashboard
- [ ] Can compare 2 different model runs side-by-side

**Phase 2 Success:**
- [ ] Golden dataset has 20+ test cases
- [ ] Can run batch tests with all configs
- [ ] Identified best-performing model configuration

**Long-term Success:**
- [ ] Regression testing catches quality degradation
- [ ] Can evaluate new models in <15 minutes
- [ ] Results inform production Graphiti configuration

---

*Design created: 2026-02-06*
*Status: Ready for Implementation*
