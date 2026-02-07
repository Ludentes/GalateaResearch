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

**Clean previous benchmark data before running:**
```bash
pnpm benchmark:graphiti --config=granite-balanced --clean
```

**Test with custom env vars:**
```bash
MODEL_NAME=nemotron TEMPERATURE=0.3 pnpm benchmark:graphiti
```

**Adjust processing delay (faster benchmarks):**
```bash
# Reduce wait time to 3 seconds (default: 5s)
BENCHMARK_PROCESSING_DELAY=3000 pnpm benchmark:graphiti --config=granite4-tiny-h-comprehensive

# Or increase if Graphiti needs more time
BENCHMARK_PROCESSING_DELAY=10000 pnpm benchmark:all
```

**Test with OpenRouter (requires OPENROUTER_API_KEY in .env.local):**
```bash
pnpm benchmark:graphiti --config=openrouter-glm-free
```

**Run all configurations (44 total, ~6-7 hours):**
```bash
pnpm benchmark:all
```

**Run all with database cleanup before each:**
```bash
pnpm benchmark:all:clean
```

**Run specific subsets:**
```bash
# Only comprehensive configs (4 configs, ~40 minutes)
pnpm benchmark:comprehensive

# Only Granite 4 configs (13 configs, ~2 hours)
pnpm benchmark:granite4

# Only Nemotron configs (9 configs, ~1.5 hours)
pnpm benchmark:nemotron

# Only GPT-OSS configs (9 configs, ~1.5 hours)
pnpm benchmark:gpt-oss
```

## Configuration

**YAML presets** (`tests/configs/graphiti-benchmark-configs.yaml`):

*Baseline models:*
- `llama3.2-baseline` - Current production baseline (temp 0.7)

*Granite 3.1 baseline:*
- `granite-deterministic` - Granite 3.1 with temp 0.0
- `granite-conservative` - Granite 3.1 with temp 0.3
- `granite-balanced` - Granite 3.1 with temp 0.7
- `granite-creative` - Granite 3.1 with temp 1.0
- `granite-custom-prompt` - Granite 3.1 with custom system prompt

*Granite 4 experiments (13 configs):*
- `granite4-tiny-h-deterministic` - Tiny-h with temp 0.0
- `granite4-tiny-h-conservative` - Tiny-h with temp 0.3
- `granite4-tiny-h-moderate` - Tiny-h with temp 0.5
- `granite4-tiny-h-balanced` - Tiny-h with temp 0.7
- `granite4-tiny-h-creative` - Tiny-h with temp 1.0
- `granite4-tiny-h-fact-direction` - Tiny-h with fact direction prompt
- `granite4-tiny-h-detailed-facts` - Tiny-h with detailed facts prompt
- `granite4-tiny-h-strict` - Tiny-h with strict extraction (temp 0.3)
- `granite4-tiny-h-comprehensive` - Tiny-h with comprehensive prompt (temp 0.5)
- `granite4-standard-deterministic` - Standard with temp 0.0
- `granite4-standard-balanced` - Standard with temp 0.7
- `granite4-standard-comprehensive` - Standard with comprehensive prompt

*Nemotron-3-Nano experiments (9 configs):*
- `nemotron-deterministic` - Temp 0.0
- `nemotron-conservative` - Temp 0.3
- `nemotron-moderate` - Temp 0.5
- `nemotron-balanced` - Temp 0.7
- `nemotron-creative` - Temp 1.0
- `nemotron-very-creative` - Temp 1.5
- `nemotron-fact-direction-prompt` - Emphasizes correct source→target direction
- `nemotron-detailed-facts-prompt` - Preserves all details (reasons, conditions)
- `nemotron-strict-extraction` - Strict rules, low temp 0.3
- `nemotron-comprehensive-prompt` - Combined best practices, temp 0.5

*GPT-OSS experiments (9 configs):*
- `gpt-oss-deterministic` - Temp 0.0
- `gpt-oss-conservative` - Temp 0.3
- `gpt-oss-moderate` - Temp 0.5
- `gpt-oss-balanced` - Temp 0.7
- `gpt-oss-creative` - Temp 1.0
- `gpt-oss-very-creative` - Temp 1.5
- `gpt-oss-fact-direction-prompt` - Emphasizes correct source→target direction
- `gpt-oss-detailed-facts-prompt` - Preserves all details (reasons, conditions)
- `gpt-oss-strict-extraction` - Strict rules, low temp 0.3
- `gpt-oss-comprehensive-prompt` - Combined best practices, temp 0.5

*External providers:*
- `openrouter-glm-free` - OpenRouter's free GLM-4.5-Air model

**Environment variables:**
- `MODEL_NAME` - Ollama model name
- `TEMPERATURE` - Temperature (0.0-2.0)
- `SYSTEM_PROMPT` - Custom system prompt
- `OPENROUTER_API_KEY` - OpenRouter API key (required for openrouter-* configs)
- `BENCHMARK_PROCESSING_DELAY` - Wait time after ingestion in ms (default: 5000)
- `BENCHMARK_LANGFUSE_SECRET_KEY` - Langfuse auth
- `BENCHMARK_LANGFUSE_PUBLIC_KEY` - Langfuse auth
- `BENCHMARK_LANGFUSE_BASE_URL` - Langfuse URL (default: http://localhost:3000)

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
- Datasets tab: Version-controlled test cases
- Prompts tab: System prompt versions
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

## Data Isolation

Each benchmark run uses **unique group IDs** to prevent duplicate entities across runs:

**How it works:**
- Group IDs include a timestamp: `test-simple-1738875640123`
- Each run creates isolated data in FalkorDB
- Previous runs remain in the database (useful for debugging)

**Cleaning old data:**
```bash
# Delete all previous benchmark data before running
pnpm benchmark:graphiti --clean
```

The `--clean` flag removes all entities and relationships with `group_id` starting with `test-*`. This is useful when:
- Database is getting too large
- You want a fresh start
- Debugging data corruption issues

**Note:** Without `--clean`, old benchmark data persists indefinitely. This allows comparing extraction results across runs but may slow down FalkorDB over time.

## Understanding Metrics in Detail

The benchmark calculates separate metrics for **entities** and **facts**, each with three core measurements: Precision, Recall, and F1 Score.

### Entity Metrics

**Entity Precision** measures accuracy: "Of all entities extracted, how many were correct?"

```
Entity Precision = (Correctly Extracted Entities) / (Total Extracted Entities)
```

**Example:**
- Expected entities: `["Docker", "user"]`
- Extracted entities: `["Docker", "PostgreSQL", "user"]`
- Matched: `["Docker", "user"]` (2 matched)
- Precision = 2 / 3 = **0.667** (67%)

**Interpretation:** Low entity precision means the model is extracting **too many** entities (false positives/noise).

---

**Entity Recall** measures completeness: "Of all expected entities, how many were found?"

```
Entity Recall = (Correctly Extracted Entities) / (Total Expected Entities)
```

**Example:**
- Expected entities: `["Docker", "Redis", "user"]`
- Extracted entities: `["Docker", "user"]`
- Matched: `["Docker", "user"]` (2 matched)
- Recall = 2 / 3 = **0.667** (67%)

**Interpretation:** Low entity recall means the model is **missing** entities (false negatives/too conservative).

---

**Entity F1 Score** balances precision and recall:

```
Entity F1 = 2 × (Precision × Recall) / (Precision + Recall)
```

**Example:**
- Precision = 0.667, Recall = 0.667
- F1 = 2 × (0.667 × 0.667) / (0.667 + 0.667) = **0.667**

**Interpretation:**
- **1.0** = Perfect extraction (all entities correct, none missed, no noise)
- **0.8-0.9** = Good extraction (minor issues)
- **0.5-0.7** = Moderate issues (missing entities or extracting noise)
- **< 0.5** = Poor extraction (major problems)

---

### Fact Metrics

**Fact Precision** measures accuracy: "Of all facts extracted, how many were correct?"

```
Fact Precision = (Correctly Extracted Facts) / (Total Extracted Facts)
```

**What makes a fact "correct"?** A fact matches if **ALL THREE** components match:
1. Source entity matches (with normalization: case-insensitive, whitespace collapsed)
2. Target entity matches (with normalization)
3. Fact text matches (with normalization)

**Example:**
- Expected fact: `{source: "user", target: "Docker", fact: "user uses Docker"}`
- Extracted fact: `{source: "User", target: "docker", fact: "user  uses Docker"}`
- **Match!** ✅ (after normalization)

**Example of non-match:**
- Expected fact: `{source: "user", target: "Docker", fact: "user prefers Docker"}`
- Extracted fact: `{source: "user", target: "Docker", fact: "user uses Docker"}`
- **No match!** ❌ (fact text differs: "prefers" vs "uses")

**Calculation Example:**
- Expected facts: 2 facts
- Extracted facts: `[fact1_correct, fact2_incorrect, fact3_noise]` (3 extracted)
- Matched: 1 fact
- Precision = 1 / 3 = **0.333** (33%)

**Interpretation:** Low fact precision means the model creates **incorrect relationships** or **hallucinates** connections.

---

**Fact Recall** measures completeness: "Of all expected facts, how many were found?"

```
Fact Recall = (Correctly Extracted Facts) / (Total Expected Facts)
```

**Example:**
- Expected facts: `[fact1, fact2, fact3]` (3 expected)
- Extracted facts: `[fact1, fact2]` (only 2 extracted, both correct)
- Matched: 2 facts
- Recall = 2 / 3 = **0.667** (67%)

**Interpretation:** Low fact recall means the model **misses relationships** that are present in the text.

---

**Fact F1 Score** balances precision and recall:

```
Fact F1 = 2 × (Fact Precision × Fact Recall) / (Fact Precision + Fact Recall)
```

**Interpretation:** Same as Entity F1 - measures overall fact extraction quality.

---

### Key Differences: Entity vs Fact Metrics

| Aspect | Entity Metrics | Fact Metrics |
|--------|---------------|--------------|
| **What's measured** | Individual entities (nodes) | Relationships between entities (edges) |
| **Matching criteria** | Entity name only (normalized) | Source + Target + Fact text (all must match) |
| **Difficulty** | Easier (single string match) | Harder (triple match required) |
| **Common issue** | Over-extraction (noise) | Missing relationships (zero facts) |

**Why are fact metrics often lower?**
1. Facts require **3-way match** (source + target + text)
2. Graphiti may create relationships without proper `group_id` tagging
3. Fact text variations ("uses" vs "utilizes") don't match even if semantically similar
4. LLM may extract facts but database query doesn't find them

---

### Edge Cases

**Empty expected, empty extracted:**
- Precision = **1.0** (no false positives)
- Recall = **1.0** (no false negatives)
- F1 = **1.0** (perfect for empty case)

**Empty expected, non-empty extracted:**
- Precision = **0** (all extractions are noise)
- Recall = **1.0** (no ground truth to miss)
- F1 = **0** (penalized for over-extraction)

**Non-empty expected, empty extracted:**
- Precision = **0** (no valid extractions)
- Recall = **0** (missed everything)
- F1 = **0** (complete failure)

---

### Interpreting Score Combinations

**High Precision, Low Recall:**
- Model is **conservative** - only extracts when very confident
- Misses many valid entities/facts
- **Action:** Lower temperature, adjust prompt to be less cautious

**Low Precision, High Recall:**
- Model is **aggressive** - extracts everything it sees
- Creates noise and false positives
- **Action:** Raise temperature, adjust prompt to be more selective

**Both Low:**
- Model is fundamentally struggling
- **Action:** Try different model, improve prompts, check data quality

**Both High:**
- Model is performing well! 🎉
- **Action:** Deploy to production, or optimize further

---

### Parse Success Rate

```
Parse Success = (Tests with valid JSON) / (Total Tests) × 100%
```

**What it means:**
- **100%** = Model always produces valid JSON (good!)
- **< 100%** = Model sometimes produces malformed output
- **< 90%** = Serious reliability issue

**Note:** Parse failures are excluded from precision/recall calculations (only valid results are scored).

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

**Langfuse 401 Unauthorized:**
- Check BENCHMARK_LANGFUSE_* env vars in `.env.local`
- Verify keys match your Langfuse project

## Best Practices

1. **Test baseline first** - Establish reference scores
2. **Change one variable** - Model OR temp OR prompt at a time
3. **Run multiple times** - LLMs have variance
4. **Add test cases gradually** - Start with 5, grow to 20-30
5. **Version dataset** - Increment version when adding cases
6. **Use Langfuse** - Compare runs visually in dashboard
7. **Document findings** - Keep notes on what works best
