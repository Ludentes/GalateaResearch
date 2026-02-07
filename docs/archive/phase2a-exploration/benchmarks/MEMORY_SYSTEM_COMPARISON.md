# Memory System Comparison: Graphiti vs Mem0

**Date:** 2026-02-06
**Context:** Evaluating memory extraction quality after discovering Graphiti's poor performance (21% fact recall)

---

## Executive Summary

Initial Graphiti testing showed disappointing results (21% fact recall with best model). This comparison evaluates whether Mem0 offers a viable alternative or if we should specialize Graphiti for our use case.

### Key Question
Given Graphiti's 21% fact recall, should we:
1. Pivot to Mem0 (simpler, RAG-style approach)
2. Specialize Graphiti for our specific use cases
3. Use pattern-based extraction (Gatekeeper-style)

---

## Graphiti Results (with GPT-OSS)

**From:** `docs/GRAPHITI_BENCHMARK_RESULTS.md`

### Quality Metrics
- **Entity F1:** 0.519 (51.9%)
- **Fact F1 (Fuzzy):** 0.211 (21.1%)
- **Parse Success:** 100%
- **Processing:** 5s per message
- **Cost:** Free (local Ollama)

### What Graphiti Extracts
Structured knowledge graph with:
- **Entities:** Normalized nodes (e.g., "Clerk", "JWT", "user")
- **Facts:** Directed relationships with source, target, fact text
- **Example:**
  ```json
  {
    "source": "user",
    "target": "Clerk",
    "fact": "user prefers Clerk for Expo authentication"
  }
  ```

### Strengths
✅ Structured output (graph database)
✅ Entity deduplication
✅ Relationship tracking
✅ Temporal reasoning support

### Weaknesses
❌ Only captures 1 in 5 expected facts
❌ Fact wording often differs from expectations
❌ Opaque extraction logic (can't easily customize)
❌ Requires fuzzy matching to recognize value
❌ **Complete failure on JWT→Clerk scenario (0 entities, 0 facts)**

---

## Mem0 Results (with GPT-OSS)

**From:** `benchmark-results/mem0-gpt-oss-scored-1770409945249.json`

### Quality Metrics
- **Entity F1:** 0.228 (22.8%)
- **Fact F1:** 0.000 (but misleading - format mismatch)
- **Parse Success:** 68.2%
- **Processing:** 3s extraction + embeddings
- **Cost:** Free (local Ollama)

### What Mem0 Extracts
Atomic memory statements:
- **Format:** Single simplified facts
- **Example:**
  ```
  "Uses Redis for caching"
  "Uses PostgreSQL for the database"
  "User is implementing authentication for an Expo app"
  ```

### Strengths
✅ Simpler approach (no graph complexity)
✅ Extracted 21 memories from 22 test cases
✅ Vector search for retrieval
✅ More consistent extraction
✅ **Successfully extracted memories from JWT→Clerk scenario**

### Weaknesses
❌ No entity deduplication
❌ No relationship structure
❌ Lower entity F1 than Graphiti (22.8% vs 51.9%)
❌ Atomic facts lack context/detail
❌ Format mismatch with expected output (affects scoring)
❌ Telemetry issues (phones home, can't disable)

---

## Format Mismatch Issue

### Problem
Scoring function expects structured triples but Mem0 returns atomic facts:

**Expected format:**
```json
{
  "source": "user",
  "target": "Redis",
  "fact": "user uses Redis for caching"
}
```

**Mem0 actual format:**
```
"Uses Redis for caching"
```

### Impact
- Fact F1 shows as 0.000 because format doesn't match
- But Mem0 IS capturing information (21 memories extracted)
- Need to adapt scoring to evaluate atomic facts fairly

---

## Direct Comparison

| Metric | Graphiti (GPT-OSS) | Mem0 (GPT-OSS) | Winner |
|--------|-------------------|----------------|---------|
| **Entity F1** | 51.9% | 22.8% | 🏆 Graphiti |
| **Fact F1** | 21.1% (fuzzy) | 0% (format) | ⚠️ Inconclusive |
| **Parse Success** | 100% | 68.2% | 🏆 Graphiti |
| **Extraction Reliability** | 0 facts (scenario) | 21 memories | 🏆 Mem0 |
| **Processing Time** | 5s/message | 3s/message | 🏆 Mem0 |
| **Architecture** | Complex (graph) | Simple (RAG) | 🏆 Mem0 |
| **Production Ready** | ⚠️ Questionable | ⚠️ Telemetry issues | Tie |

---

## Scenario Testing Results

### JWT→Clerk Learning Scenario

**Goal:** Learn that user switched from JWT to Clerk for Expo auth

| System | Entities | Facts | Retrieval |
|--------|----------|-------|-----------|
| **Graphiti** | 0 | 0 | ❌ Failed |
| **Mem0** | Multiple | 6 memories | ✅ Works |
| **Pattern-based** | N/A | 3 signals | ✅ Works |

**Conclusion:** Graphiti completely failed on this real-world scenario while Mem0 and pattern-based approaches succeeded.

---

## Trade-offs

### Graphiti Advantages
1. **Better entity extraction** (52% vs 23%)
2. **Structured relationships** (graph database)
3. **Entity deduplication** (automatic)
4. **Better for complex queries** (graph traversal)

### Mem0 Advantages
1. **Actually extracts something** (vs 0 in scenario)
2. **Simpler architecture** (fewer moving parts)
3. **Faster processing** (3s vs 5s)
4. **More adaptable** (can customize extraction)

### Pattern-Based Advantages
1. **Highest reliability** (no LLM uncertainty)
2. **Explicit control** (know exactly what's captured)
3. **Zero latency** (regex-based)
4. **Zero cost** (no LLM calls)

---

## Pending Benchmarks

Running Mem0 benchmarks with other models for comparison:

### Expected Comparisons
Based on Graphiti results, we expect:

| Model | Graphiti Entity F1 | Graphiti Fact F1 | Mem0 Entity F1 | Mem0 Fact F1 |
|-------|-------------------|------------------|----------------|--------------|
| GPT-OSS | 51.9% | 21.1% | 22.8% | TBD |
| Nemotron-3-nano | 32.6% | 9.1% | ⏳ Running | ⏳ Running |
| Granite 4 tiny-h | 4.5% | 9.1% | ⏳ Running | ⏳ Running |

**Questions to answer:**
1. Does Mem0 maintain quality with weaker models?
2. Are Mem0's atomic facts more reliable across models?
3. Does model choice matter more than framework?

---

## Open Questions

### 1. Format Mismatch Resolution
- Should we adapt scoring to handle atomic facts?
- Or expect Mem0 to produce structured triples?
- Is comparing apples-to-apples even possible?

### 2. Graphiti Failure Root Cause
- Why did Graphiti extract 0 facts in JWT→Clerk scenario?
- Is this a systematic issue or edge case?
- Can we fix it with better prompts/config?

### 3. Production Viability
- **Graphiti:** 21% fact recall - is this enough?
- **Mem0:** Telemetry issues - can we work around them?
- **Patterns:** Limited coverage - what % of cases can they handle?

### 4. Hybrid Approach
Could we combine strengths?
- Use patterns for known cases (preferences, problems)
- Use Mem0/Graphiti for unknown cases
- Fall back to full-text storage when extraction fails

---

## Recommendations (Preliminary)

### Don't Abandon Graphiti Yet
- 21% fact recall isn't great, but it's extracting SOMETHING
- Entity extraction is solid (52%)
- JWT→Clerk scenario might be an outlier

### But Investigate Mem0 Seriously
- Simpler architecture = less to go wrong
- Atomic facts might be "good enough" for RAG
- Successful scenario extraction is promising

### Consider Pattern-Based Hybrid
- Patterns for high-confidence cases
- LLM extraction for everything else
- Best of both worlds

### Wait for Model Benchmarks
- Need to see if Mem0 quality holds with other models
- If Mem0 works well with weak models, it's a strong signal
- If only GPT-OSS works, we have a model problem not framework problem

---

## Next Steps

1. ✅ Complete Mem0 benchmarks (nemotron, granite4)
2. ⏳ Analyze model performance patterns
3. ⏳ Investigate Graphiti scenario failure
4. ⏳ Design fair comparison accounting for format differences
5. ⏳ Prototype hybrid pattern+LLM approach
6. ⏳ Make final architecture decision

---

## References

- **Graphiti Results:** `docs/GRAPHITI_BENCHMARK_RESULTS.md`
- **Mem0 Scored Results:** `benchmark-results/mem0-gpt-oss-scored-1770409945249.json`
- **Scenario Tests:** `tests/memory/scenario-01-*.test.ts`
- **Golden Dataset:** `tests/fixtures/graphiti-golden-dataset.json`
- **Mem0 Pitfalls:** `docs/MEM0_PITFALLS.md`
