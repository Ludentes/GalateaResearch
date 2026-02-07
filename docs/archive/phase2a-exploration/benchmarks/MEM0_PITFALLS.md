# Mem0 Pitfalls and Limitations

**Date:** 2026-02-06
**Purpose:** Document known issues with Mem0 to avoid surprises like we had with Graphiti

---

## Critical Discovery: Two Different Products

**Mem0 has two separate implementations:**

1. **Cloud API (`mem0ai` default import)**: Requires paid API key, managed service
2. **OSS Self-Hosted (`mem0ai/oss` import)**: Can run fully local with your own infrastructure

**Pitfall:** The documentation doesn't clearly distinguish between these. Many examples show cloud usage without mentioning you need an API key.

---

## Known Technical Limitations

### 1. Local Deployment Issues

**Problem:** [Local deployment is not well documented](https://github.com/mem0ai/mem0/issues/2432) and requires significant setup effort.

**Evidence from GitHub Issues:**
- Issue #2432: "Local deployment of mem0 not achievable" - no clear Docker setup or deployment instructions
- Issue #2444: "Mem0 demo local deployment problem" - multimodal demo requires internet and API keys even for "local" examples
- The `main.py` server file is "a REST API interface, not a real backend" according to developers

**Impact:** You can't just `npm install` and go. Requires manual configuration of vector DB, embeddings, and LLM providers.

### 2. Performance and Cost Issues

**Problem:** [Latency and cost scale linearly with input tokens](https://arxiv.org/html/2504.19413v1).

**Why it matters:**
- Processing 100k+ tokens on every query is slow and expensive
- Traditional RAG approaches hit context limits quickly
- Manual pruning requires multiple LLM calls, increasing overhead

**Comparison:** Graphiti has same issue (all LLM-based extraction has token costs), but Mem0 processes more because it doesn't do upfront extraction.

### 3. The "Lost in the Middle" Problem

**Problem:** [Model attention quality drops with very long contexts](https://medium.com/@EleventhHourEnthusiast/mem0-building-production-ready-ai-agents-with-scalable-long-term-memory-9c534cd39264).

**What happens:**
- Information from early in conversation gets ignored
- Key context gets buried in "a sea of other data"
- Retrieval returns relevant snippets but model misses them during generation

**Impact:** You can retrieve the right memory but the LLM still gives wrong answer because it's overwhelmed by context.

### 4. Limited Graph Memory Benefits

**Problem:** [Graph structures offer limited benefit for simple queries](https://www.cognee.ai/blog/deep-dives/ai-memory-tools-evaluation).

**When graph memory doesn't help:**
- Single-turn queries (most common case)
- Simple fact lookup
- Tasks requiring integration across multiple sessions (graph doesn't span sessions well)

**When it DOES help:**
- Multi-agent scenarios with shared context
- Compliance/auditing (tracking entity relationships over time)
- Complex entity networks within single conversation

### 5. Production Control Issues

**Problem:** [Default agent behavior lacks production-ready controls](https://www.datacamp.com/tutorial/mem0-tutorial).

**What's missing:**
- Fine control over what gets stored
- Advanced retrieval filtering
- Rate limit handling (free tier)
- Proper error handling around memory operations
- Delays needed after saving new memories (eventual consistency)

**Workaround:** Build wrapper layer with these controls yourself.

### 6. Topic Shifting Complexity

**Problem:** [Hard to maintain context when conversation changes topics](https://apidog.com/blog/mem0-memory-llm-agents/).

**Example:**
1. User talks about dietary preferences
2. Switches to programming for 2 hours
3. Returns to food questions

**Challenge:** System must:
- Recognize topic shift
- Weight recent vs relevant context
- Avoid mixing unrelated memories

**Impact:** Generic vector search doesn't handle this well - needs metadata filtering or custom logic.

---

## Mem0 vs Graphiti Comparison

| Aspect | Mem0 | Graphiti/Graphlit |
|--------|------|-------------------|
| **Architecture** | Store conversation snippets | Extract structured entities + relationships |
| **Retrieval** | Vector similarity on raw text | Graph queries + vector search |
| **Setup Complexity** | High (underdocumented) | High (complex extraction tuning) |
| **Quality Consistency** | Depends on embedding quality | Depends on extraction quality (21% recall) |
| **Data Loss** | Minimal (stores full text) | Severe (79% data loss during extraction) |
| **Query Speed** | Fast (vector search only) | Slower (graph + vector) |
| **Context Window** | Eventually hits limits | Same issue |
| **Multi-format** | Text-focused | Supports multiple content types |
| **Best Use Case** | Simple assistants, short-term memory | Knowledge bases, complex entity networks |

### Key Insight from [Graphlit vs Mem0](https://www.graphlit.com/vs/mem0):

> "If agents are relatively narrow—such as customer support bots or small assistants managing short-term history—Mem0 is a solid tool. **But users will outgrow Mem0's model quickly**, which is why Graphlit was built to support agents with deep memory, rich context, and real-world adaptability."

### Benchmark Results from [Cognee Evaluation](https://www.cognee.ai/blog/deep-dives/ai-memory-tools-evaluation):

**Important:** Mem0 significantly outperforms Graphiti in **efficiency**:
- Faster loading times
- Lower resource consumption
- But accuracy differences were "not statistically significant"

**Caveat:** Graphiti team disputed these results, claiming "_search functionality" shows "significant improvement" - suggests proper configuration matters a lot.

---

## What This Means for Galatea

### Why Mem0 Might Work Better Than Graphiti:

1. **No Extraction Loss**: Stores full text, no 79% data loss
2. **Simpler Pipeline**: Skip extraction step entirely
3. **More Predictable**: Vector search is well-understood, no "will LLM extract this?" uncertainty
4. **Faster Setup**: Once configured, just embed and store

### Why Mem0 Might Still Fail:

1. **Retrieval != Understanding**: Retrieving right snippet doesn't guarantee LLM uses it correctly
2. **Context Window**: Eventually hits same limits as Graphiti
3. **Topic Mixing**: Will it retrieve JWT problems when queried about "Expo auth" later?
4. **No Structure**: Can't query "what preferences have I set?" - only semantic search

### Empirical Testing Required:

We need to run the same scenario tests:
- Can it retrieve Clerk preference when asked "How should I implement auth in Expo?"
- Does it handle multi-turn evolution (JWT problem → switch decision)?
- How does quality degrade over time as more memories accumulate?

---

## Recommendations

### 1. Use OSS Version

```typescript
import { Memory } from 'mem0ai/oss'  // NOT just 'mem0ai'

const memory = new Memory({
  embedder: {
    provider: 'ollama',
    config: {
      model: 'nomic-embed-text',
      url: 'http://localhost:11434'
    }
  },
  vectorStore: {
    provider: 'qdrant',
    config: {
      collectionName: 'galatea_memory',
      url: 'http://localhost:6333',
      embeddingModelDims: 768,
      onDisk: true
    }
  },
  llm: {
    provider: 'ollama',
    config: {
      model: 'gpt-oss:latest',
      baseURL: 'http://localhost:11434'
    }
  }
})
```

### 2. Add Production Controls

Wrap Mem0 with:
- Pre-storage filtering (Gatekeeper-style)
- Post-retrieval ranking (relevance + recency)
- Error handling and retries
- Rate limiting awareness

### 3. Monitor Context Growth

Track:
- Total memories per user/session
- Average retrieval result count
- Query latency trends
- When context window issues start appearing

### 4. Compare Empirically

Run ALL reference scenarios against:
- Graphiti (already tested, 0/5 passed)
- Pattern-based extraction (1/1 passed so far)
- Mem0 OSS (pending)

Pick winner based on actual scenario results, not theoretical comparisons.

---

## Sources

- [Self-Hosted AI Companion - Mem0](https://docs.mem0.ai/cookbooks/companions/local-companion-ollama)
- [Local deployment not achievable - GitHub Issue #2432](https://github.com/mem0ai/mem0/issues/2432)
- [Mem0: Building Production-Ready AI Agents - arXiv](https://arxiv.org/html/2504.19413v1)
- [Choosing a Memory Infrastructure: Mem0 vs. Graphlit](https://www.graphlit.com/vs/mem0)
- [AI Memory Tools Evaluation - Cognee](https://www.cognee.ai/blog/deep-dives/ai-memory-tools-evaluation)
- [Mem0 Tutorial - DataCamp](https://www.datacamp.com/tutorial/mem0-tutorial)

---

## Next Steps

1. ✅ Document Mem0 pitfalls (this file)
2. ⏳ Fix scenario-01-mem0.test.ts to use OSS import
3. ⏳ Run test and compare results to Graphiti (0 entities/facts) and Pattern-based (3 preferences captured)
4. ⏳ Expand to remaining 4 scenarios if results promising
5. ⏳ Make architecture decision based on empirical evidence
