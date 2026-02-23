# Extraction Prompt Eval Loop

Systematic evaluation of knowledge extraction prompt quality using Langfuse datasets.

## Setup

1. Ensure Langfuse is running at `localhost:3000` and `.env` has keys set
2. Ensure Ollama is running with `gemma3:12b` pulled

## Workflow

### 1. Build gold-standard draft

```bash
pnpm tsx experiments/extraction/build-gold-draft.ts
```

Reads `data/memory/entries.jsonl`, groups entries by extraction chunk, and outputs `gold-standard.jsonl`.

### 2. Review and correct gold-standard.jsonl

Open `gold-standard.jsonl` and for each item:
- Correct `about` fields (most entries currently lack them)
- Correct `entities` arrays (many are empty)
- Adjust `confidence` values
- Remove the `_meta` field
- Add/remove items as needed

### 3. Push to Langfuse

```bash
pnpm tsx experiments/extraction/seed-dataset.ts
```

Creates dataset `extraction-gold-standard` in Langfuse and pushes all items.

### 4. Store prompt in Langfuse (one-time)

Push the current extraction prompt to Langfuse as `knowledge-extraction`. Do this via the Langfuse UI or SDK. The eval runner fetches this prompt by name.

### 5. Run eval

```bash
# Use prompt from Langfuse
pnpm tsx experiments/extraction/run-eval.ts

# Use specific prompt version
pnpm tsx experiments/extraction/run-eval.ts --prompt-version 2

# Use local prompt from knowledge-extractor.ts
pnpm tsx experiments/extraction/run-eval.ts --local-prompt

# Limit items (for quick iteration)
pnpm tsx experiments/extraction/run-eval.ts --limit 5
```

### 6. Compare in Langfuse

Open `localhost:3000` > Datasets > `extraction-gold-standard` > Runs to compare scores across prompt versions.

## Scoring Metrics

| Metric | Description |
|--------|-------------|
| `about_recall` | % of expected `about` fields correctly produced |
| `about_precision` | % of produced `about` fields that match expected |
| `entity_recall` | % of expected entities found in actual output |
| `type_accuracy` | % of items with correct type classification |
| `count_accuracy` | 1 - \|expected_count - actual_count\| / expected_count |

## Files

| File | Purpose |
|------|---------|
| `build-gold-draft.ts` | Generate draft gold-standard from existing entries |
| `gold-standard.jsonl` | Gold-standard dataset (manually curated) |
| `seed-dataset.ts` | Push gold-standard to Langfuse |
| `run-eval.ts` | Run extraction and score against gold-standard |
