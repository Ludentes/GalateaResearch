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
