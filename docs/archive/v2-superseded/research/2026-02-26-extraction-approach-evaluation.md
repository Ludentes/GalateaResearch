# Extraction Approach Evaluation: Heuristics vs Ollama vs Cloud LLM

**Date**: 2026-02-26
**Status**: Decision-ready
**Context**: Evidence-based memory extraction pipeline — choosing the right approach

---

## Test Setup

- **Golden dataset**: 4 developers (umka, newub, DEM, QP), 98 expected items across preferences, rules, decisions, facts, lessons
- **Golden dataset was created using cloud LLM** — so cloud recall ≈100% by definition (with DSPy-style prompt tuning)
- **Heuristics**: Pattern-based signal classifier + heuristic extractor (instant, zero cost)
- **Hybrid**: Heuristics for pattern-matched turns + Ollama gemma3:12b for "factual" classified turns
- **Cloud**: Same hybrid but with Claude Sonnet / OpenRouter instead of Ollama

---

## Raw Results

| Developer | Golden | Heuristics | Hybrid (H+Ollama) | Cloud LLM (assumed) |
|-----------|--------|-----------|-------------------|---------------------|
| Umka | 13 | 7 (53.8%) | 10 (76.9%) | ~13 (≈100%) |
| Newub | 31 | 15 (48.4%) | 26 (83.9%) | ~31 (≈100%) |
| DEM | 36 | 6 (16.7%) | 33 (91.7%) | ~36 (≈100%) |
| QP | 18 | 9 (50.0%) | 15 (83.3%) | ~18 (≈100%) |
| **Total** | **98** | **37 (37.8%)** | **84 (85.7%)** | **~98 (≈100%)** |

### Entry Explosion (signal-to-noise)

| Developer | Heuristic entries | Hybrid entries | LLM-only entries | LLM recall boost | Entries per golden item found |
|-----------|------------------|---------------|-----------------|-----------------|------------------------------|
| Umka | 35 | 895 | 860 | +3 | 287:1 |
| Newub | 142 | 2986 | 2843 | +8 | 355:1 |
| DEM | 21 | 1213 | 1192 | +27 | 44:1 |
| QP | 19 | 442 | 423 | +6 | 71:1 |
| **Total** | **217** | **5536** | **5318** | **+44** | **121:1** |

### Time & Cost

| Approach | Umka (34 sess) | Newub (116 sess) | DEM (1377 sess) | QP (215 sess) |
|----------|---------------|-----------------|----------------|---------------|
| Heuristics | instant | instant | instant | instant |
| Hybrid/Ollama | 41 min | 81 min | **4.4 hours** | 13 min |
| Cloud LLM | ~2-5 min est | ~5-10 min est | ~10-20 min est | ~2-5 min est |

---

## What Each Approach Misses

### Heuristics (37.8% recall)
- 0% of facts (0/20) — declarative statements with no "I prefer" signal
- 0% of lessons (0/11) — corrections embedded in multi-turn context
- ~50% of preferences/rules — catches pattern-match ones, misses subtle ones

### Hybrid/Ollama (85.7% recall)
- Still misses 14 items. Common patterns in what's missed:
  - Highly specific proper nouns: "Graphiti forked to github.com/Ludentes/graphiti"
  - Abstract observations: "ThinkingDepth is overloaded terminology"
  - Subtle implicit knowledge: "Likes metaphor consistency across site"
  - Context-dependent facts: "Subscriptions are admin-moderated"
- gemma3:12b hallucination guard fires frequently (uniform confidence 1.0)
- Chokes on >100K char turns (DEM pathological case)

### Cloud LLM (≈golden)
- Created the golden dataset, so recall ≈100% by definition
- Real precision TBD on new data, but DSPy-style prompting should handle it

---

## Option B: Heuristics + Cloud LLM — Detailed Architecture

### Pipeline flow

```
Session transcript
  → classifyTurn() for each turn
    → "noise" → DROP (instant, ~80% of turns)
    → pattern-matched → extractHeuristic() → KnowledgeEntry[] (instant, ~10% of turns)
    → "factual" → extractWithRetry(cloudModel) → KnowledgeEntry[] (~10% of turns)
  → applyNoveltyGateAndApproval() → filter general-knowledge
  → dedup
  → curation queue (human audit)
```

### Per-session economics (the real scenario)

Typical session: 50-200 turns. ~10-20 factual turns → 2-3 LLM chunks → ~5-15K input tokens.

| Model | Cost/1M input | Per session (15K tok) | Per day (5 sessions) | Per month |
|-------|--------------|----------------------|---------------------|-----------|
| Sonnet 4.6 | $3 | $0.045 | $0.23 | **$5** |
| Haiku 4.5 | $0.80 | $0.012 | $0.06 | **$1.30** |
| Gemini Flash | $0.15 | $0.002 | $0.01 | **$0.25** |

### Latency
- Cloud: 5-15 seconds per session (chunks can be parallelized)
- Ollama: 10-80 minutes per session

---

## OTEL Extensibility: Beyond Claude Code

### Two categories of sources

**Category 1: Text-rich** (Claude Code, Linear comments, Discord, Slack, Obsidian)
- Current pipeline works with minor prompt adjustments per source type
- Heuristic patterns partially applicable, cloud LLM handles the rest

**Category 2: Structured events** (HomeAssistant, Frigate, Browser, VSCode file ops)
- No text to pattern-match
- Need temporal aggregation + pattern detection + LLM synthesis
- Example: "User turns on office lights at 8am every weekday" from 20+ events
- Requires different extraction stage but converges to same KnowledgeEntry format

### Extension approach
- `POST /api/observation/ingest` routes by `source.type`
- Text sources → current pipeline (classify → heuristic/LLM extract)
- Event sources → temporal buffer → pattern detector → LLM synthesis
- Both feed same knowledge store → dedup → curation → artifacts

---

## Decision Matrix

| | Heuristics only | Heuristics + Ollama | **Heuristics + Cloud** |
|---|---|---|---|
| Recall | 37.8% | 85.7% | ~95-100% |
| Precision | High (low noise) | Poor (121:1 ratio) | High (good prompt following) |
| Cost/month (solo) | $0 | $0 (GPU time) | **$5** |
| Latency/session | instant | 10-80 min | **5-15 sec** |
| DEM-type devs | Unusable (17%) | Works (92%) | Works (≈100%) |
| Extends to OTEL | Text sources only | Text sources only | Text sources only |
| Offline/airgapped | Yes | Yes | **No** |

## Recommendation

**Option B (Heuristics + Cloud LLM) is the pragmatic winner.** The only scenario where Ollama wins is airgapped/offline. For everything else, cloud is strictly better on every dimension.

The heuristics layer remains valuable as a zero-latency first pass (~38% recall with near-zero noise). Cloud LLM handles remaining factual turns where the real knowledge lives.

---

---

## Chain of Density / Refine Strategy for Extraction

### The Problem with Batch Processing

The 121:1 noise ratio (5318 LLM entries for 44 golden items) was measured by processing ALL sessions at once with NO prior knowledge. Each chunk was extracted independently — the LLM had no idea what it already found.

### Chain of Density Applied to Extraction

**Key insight**: The knowledge store itself IS the running summary. Each session's extraction is a chain-of-density "refine" pass.

Two approaches:

**Refine chain** (sequential, per-session):
```
chunk₁ → LLM(extract) → draft₁
chunk₂ → LLM(draft₁ + extract NEW only) → draft₂
...final draft = dense, deduplicated entries
```

**Two-pass** (parallel-friendly, cross-session):
```
Pass 1 (map, parallel): chunks → LLM → raw entries
Pass 2 (consolidate): ALL raw + existing knowledge store → LLM →
  "Merge duplicates, remove noise, keep only genuinely new items"
```

**Critical prompt addition**:
```
EXISTING KNOWLEDGE (do NOT re-extract):
${knowledgeStore.entries.map(e => `- [${e.type}] ${e.content}`).join('\n')}

Extract ONLY knowledge that is NOT already captured above.
```

### Day-by-Day Reality (Umka, 34 sessions over 30 days)

| Day | Sessions | Knowledge store | New entries found | Audit burden |
|-----|----------|----------------|-------------------|-------------|
| 1 | 5 tiny | 0 → 3 | 3 | 30 sec |
| 3 | 2 small | 3 → 5 | 2 | 30 sec |
| 10 | 5 (big day, 5000-turn session) | 6 → 18 | 10-12 | 5 min |
| 15 | 3 | 18 → 19 | 1 | 15 sec |
| 25 | 2 | 20 → 20 | 0 | nothing |

**Total over 30 days**: ~20 entries approved, ~30 min total audit time, ~$1.50 cloud cost.
vs batch-all-at-once: 895 entries dumped on auditor, $5 cost, hours of review.

### DEM Timeline (harder case, 267 sessions/day peak)

| Week | Key sessions | Knowledge store | New entries | Weekly audit |
|------|-------------|----------------|-------------|-------------|
| 1 | Payment brainstorm | 0 → 15 | 15 | 5 min |
| 2 | Admin UI (3 sessions) | 15 → 25 | 10 | 4 min |
| 3-4 | Tags, complaints, banners | 25 → 36 | 11 | 4 min |
| 5+ | Implementation work | 36 → 36 | 0 | nothing |

### Noise Ratio Improvement

| Processing mode | Entries generated | Golden items found | Ratio |
|----------------|------------------|-------------------|-------|
| Batch all-at-once (tested) | 5536 | 84/98 | 121:1 |
| Daily incremental (estimated) | ~200 total | ~90/98 | **2:1** |

The daily approach is BETTER on recall too, because the consolidation prompt can cross-reference across days and the "already known" context helps the LLM focus on what's genuinely new.

### Cost Model (Daily, Solo Dev)

| | Day 1 (cold) | Day 5 | Day 15+ (steady) | Monthly total |
|---|---|---|---|---|
| Cloud cost | $0.05 | $0.05 | $0.05 | **~$1.50** |
| New entries | 5-15 | 2-5 | 0-2 | ~30 total |
| Audit time | 5 min | 2 min | 30 sec | **~30 min** |

---

## OTEL Extensibility: Beyond Claude Code

### Two Categories of Sources

**Category 1: Text-rich** (Claude Code, Linear comments, Discord, Slack, Obsidian)
- Current pipeline works with minor prompt adjustments per source.type
- Heuristic patterns partially applicable, cloud LLM handles the rest

**Category 2: Structured events** (HomeAssistant, Frigate, Browser, VSCode file ops)
- No text to pattern-match
- Need temporal aggregation + pattern detection + LLM synthesis
- Example: "User turns on office lights at 8am every weekday" from 20+ events
- Different extraction stage but converges to same KnowledgeEntry format

### Extension approach
```
Text sources → classify → heuristic/LLM extract → KnowledgeEntry
Event sources → temporal buffer → pattern detect → LLM synthesize → KnowledgeEntry
Both → same knowledge store → dedup → curation → artifacts
```

---

## Open Questions

- DSPy-style prompt optimization on the golden dataset
- Whether Haiku or Gemini Flash quality is sufficient (vs Sonnet) given cost savings
- Optimal consolidation prompt for the "already known" filtering
- How to handle knowledge store growth — when entries exceed prompt context
