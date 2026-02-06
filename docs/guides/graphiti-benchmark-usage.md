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
- `granite-deterministic` - Zero temperature (0.0)
- `granite-conservative` - Low temp (0.3)
- `granite-balanced` - Default temp (0.7)
- `granite-creative` - High temp (1.0)
- `nemotron-balanced` - Nemotron default
- `granite-custom-prompt` - Custom system prompt

**Environment variables:**
- `MODEL_NAME` - Ollama model name
- `TEMPERATURE` - Temperature (0.0-2.0)
- `SYSTEM_PROMPT` - Custom system prompt
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
