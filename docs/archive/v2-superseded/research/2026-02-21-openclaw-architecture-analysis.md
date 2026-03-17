# OpenClaw Architecture Analysis — Lessons for Galatea

**Date:** 2026-02-21
**Context:** Research to inform remaining Galatea gaps (11-13) and Phase F planning
**OpenClaw version:** As of Feb 2026 (post-Steinberger departure to OpenAI)

---

## What Is OpenClaw?

OpenClaw (formerly Clawdbot) is a free, open-source autonomous AI agent by Peter Steinberger. It runs a **local gateway process** as a control plane for all agent activity, connecting outward to LLMs and inward to messaging channels + local tools.

- **Gateway**: Node.js WebSocket server (`127.0.0.1:18789`), routes messages through access control, dispatches to agent runtime
- **Agent Runtime**: Session resolution → context assembly → model invocation → tool execution → response delivery
- **Multi-channel**: WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Teams, Matrix, WebChat, macOS, iOS/Android (15+ adapters)
- **Skills**: 100+ preconfigured AgentSkills for shell commands, file management, web automation
- **Storage**: Everything is local Markdown files — conversations, memory, preferences never leave your machine

### Key Sources

- [OpenClaw Docs: Memory](https://docs.openclaw.ai/concepts/memory)
- [OpenClaw Architecture Overview (ppaolo)](https://ppaolo.substack.com/p/openclaw-system-architecture-overview)
- [Cognitive Architecture Guide (shawnharris)](https://shawnharris.com/building-a-cognitive-architecture-for-your-openclaw-agent/)
- [12-Layer Memory Architecture (coolmanns)](https://github.com/coolmanns/openclaw-memory-architecture)
- [Thinking Agents Manifesto (Issue #17363)](https://github.com/openclaw/openclaw/issues/17363)
- [Goertzel critique: "Hands Without a Brain"](https://bengoertzel.substack.com/p/openclaw-amazing-hands-for-a-brain)
- [Memory Deep Dive (snowan)](https://snowan.gitbook.io/study-notes/ai-blogs/openclaw-memory-system-deep-dive)

---

## OpenClaw Memory Architecture

### Two-Tier Core Memory

| Tier | File | Lifespan | Purpose |
|------|------|----------|---------|
| **Daily logs** | `memory/YYYY-MM-DD.md` | 1-2 days (today + yesterday auto-loaded) | Episodic, append-only journals |
| **Long-term** | `MEMORY.md` | Indefinite | Curated facts, decisions, preferences |

### Retrieval Mechanisms

Two agent-facing tools:
- **`memory_search`**: Semantic recall over indexed Markdown snippets (~400-token chunks, 80-token overlap). Returns snippet text, file path, line ranges, similarity scores
- **`memory_get`**: Targeted read of specific files/line ranges

**Hybrid search**: Vector similarity (semantic) + BM25 keyword matching. SQLite with `sqlite-vec` extension for in-database vector operations.

### Embedding Backends (priority order)

1. Local GGUF models (nomic-embed-text-v2-moe, 768-dim, ~7ms GPU)
2. OpenAI embeddings (~200ms)
3. Gemini embeddings
4. Voyage embeddings
5. QMD sidecar (local BM25 + vectors + reranking, via Bun + node-llama-cpp)

### Post-Retrieval Processing

**MMR re-ranking** balances relevance with diversity (lambda=0.7 default, Jaccard text similarity).

**Temporal decay**: Exponential score decay for dated daily notes, 30-day half-life. `MEMORY.md` and non-dated files never decay.

### Auto-Flush (Memory Persistence)

When context approaches compaction (`currentTokens >= contextWindow - reserve - threshold`), a silent agentic turn triggers: model decides what to persist to `MEMORY.md` or daily logs. Returns `NO_REPLY` if nothing important. The agent writes its own memory.

**No automatic forgetting mechanism.** Daily logs age naturally, sessions accumulate indefinitely. SQLite index grows ~500MB/year. This is a known limitation.

---

## Community Extensions: 12-Layer Memory Architecture

A community project (coolmanns) builds a 12-layer system on top of OpenClaw:

| Layers | What | Latency |
|--------|------|---------|
| 1-3 | Identity files, MEMORY.md, project knowledge | 0ms (always loaded) |
| 4-5 | SQLite facts DB (FTS5), GPU semantic search | <1ms / 7ms |
| 5a | Domain RAG (4,361 chunks) | 100ms |
| 6-9 | Daily logs, runbooks, gating policies, state checkpoints | On-demand |
| 10-12 | Continuity plugin, stability plugin (entropy monitoring), graph-memory plugin | Runtime |

**Knowledge graph**: 3,108 facts, 1,009 relations, 275 aliases in SQLite + FTS5. Three-tier activation: Hot (recent), Warm (moderate), Cool (stale). Daily cron `graph-decay.py` demotes stale facts.

**Stability plugin**: Entropy monitoring + confabulation guards — detects when the model hallucinates and prevents memory poisoning.

---

## Cognitive Architecture (shawnharris)

### Three-Tier Memory Model

| Tier | File | Purpose |
|------|------|---------|
| **Strategic** | `MEMORY.md` | Identity, relationships, lessons learned |
| **Operational** | `active-context.md` | Working memory: active tasks, pending decisions, project states |
| **Tactical** | `YYYY-MM-DD.md` | Episodic: raw notes, session events |

### Information Gating

**Upward consolidation**: tactical → operational → strategic
**Downward decomposition**: strategic goals → operational tasks → tactical actions

**Input priority classification**:
- P0 Critical → active-context.md
- P1 Operational → active-context.md
- P2 Contextual → Daily notes
- P3 Ephemeral → Session only

**Procedural memory** (`memory/runbooks/`): Exact commands, API endpoints, auth flows. Survives model switches and context limits.

---

## Idle Cognition: The Thinking Agents Manifesto

**Argument**: "An agent that only thinks when prompted is not an intelligent assistant. It's a tool with good manners."

### Two-Tier Architecture (Kahneman System 1/2)

- **System 1 (Peripheral Tick)**: Cheap model every ~5 min. "Is anything worth paying attention to?" Most ticks → nothing. Cost: $0.015/day
- **System 2 (Escalation)**: Frontier model when something is interesting (~5% of ticks)

Key insight: "You don't need GPT-4 to notice something is interesting. You need GPT-4 to figure out what to do about it."

### Implementation: "Thinking Clock"

1. Periodic timer every 5 minutes
2. Cheap model (GPT-4o-mini, Gemini Flash, DeepSeek, Llama) scans context
3. Binary decision: sleep or escalate
4. Persistent memory across ticks enables pattern recognition

---

## Goertzel Critique: "Hands Without a Brain"

Ben Goertzel argues OpenClaw is "a better set of hands for an artificial brain" — great execution, no cognition.

### Five Missing Cognitive Capabilities

1. **Abstraction & Generalization** — Can't make big leaps beyond training data
2. **Long-Term Memory** — No persistent episodic memory worth the name
3. **Working Memory & Reasoning** — Can't systematically explore solution spaces with backtracking
4. **Self-Understanding** — No grounded models of self, world, or users
5. **Goal-Driven Motivation** — Fundamentally reactive, not purposeful

### Proposed Solution: QwestorClaw

- **Brain (Qwestor)**: Cognition — memory structures, goal management, verification gates
- **Hands (OpenClaw)**: Execution — approved actions within security boundaries
- **Guardrails**: Deterministic policy mediating brain-to-hands

---

## Comparative Analysis: Galatea vs OpenClaw

### Where OpenClaw Is Ahead

| Area | OpenClaw | Galatea | Gap |
|------|----------|---------|-----|
| **Agent-written memory** | Auto-flush: agent decides what to remember in real-time | Pipeline extracts from transcripts after-the-fact | Medium |
| **Operational memory** | `active-context.md` scratchpad for current work state | No working memory — only long-term semantic store | **High** |
| **Multi-channel** | 15+ messaging adapters via gateway pattern | Discord + dashboard UI | Low (not priority) |
| **Session trust** | Main = full access, DM = Docker sandbox | No trust model | Low (not priority) |
| **Embedding search** | Hybrid vector + BM25, SQLite-vec, GPU embeddings | Keyword overlap + entity matching only | Medium |
| **Procedural runbooks** | `memory/runbooks/` with exact commands | Procedures as KnowledgeEntry.type="procedure" (text only) | Medium |

### Where Galatea Is Ahead

| Area | Galatea | OpenClaw | Advantage |
|------|---------|----------|-----------|
| **Self-regulation** | 6-dimension homeostasis with L0-L2, targeted guidance | Binary "Thinking Clock" cron job | **Strong** |
| **Typed knowledge** | fact/preference/rule/correction/decision/procedure with confidence, entities, about | Flat Markdown, no structure | **Strong** |
| **Knowledge lifecycle** | Extract → dedup → retrieve → decay → archive → consolidate | No automatic forgetting, LLM decides what to write | **Strong** |
| **Evaluation** | Gold-standard dataset (52 items), Langfuse versioning, quantitative evals | None | **Strong** |
| **Supersession** | Explicit contradictions handled via supersededBy | No contradiction model | Medium |
| **Entity-based retrieval** | Retrieve by entity ("everything about Alina") | Requires LLM-mediated search or full-text | Medium |

### Shared Patterns

| Pattern | OpenClaw | Galatea |
|---------|----------|---------|
| File-based storage | Markdown files | JSONL files |
| Heartbeat/tick | Thinking Clock (5min) | tick() with heartbeat (30s) |
| Skills/tools | AgentSkills (100+) | Planned Phase F SKILL.md |
| Context compression | Token-aware compaction | Sliding window |
| Local LLM preference | Ollama/llama.cpp | Ollama (glm-4.7-flash, gemma3:12b) |
| Temporal decay | 30-day half-life on daily notes | 30-day grace → exponential decay on entries |

---

## Lessons for Galatea: Gap-by-Gap Analysis

### Gap 11: Session Model

**OpenClaw's approach**: Sessions are channel-scoped (`main`, `dm:<channel>:<id>`, `group:<channel>:<id>`). Each gets its own append-only event log. Trust boundaries baked into session type.

**Lesson**: Don't overthink session boundaries. A session = a conversation in a channel. The operational memory (`active-context.md`) handles cross-session continuity, not the session model itself. Galatea should:
- Keep session = Claude Code conversation file (current approach is fine)
- Add operational memory for cross-session continuity (new)
- Session metadata (who, what project, what phase) belongs in operational memory, not session definition

### Gap 12: Work Execution Model

**OpenClaw's approach**: The agent uses tools (shell, browser, file ops) in response to user messages. No autonomous work planning — it's reactive. The Thinking Clock adds some proactivity but only for monitoring, not execution.

**Goertzel's critique directly applies here**: OpenClaw has hands but no brain. It executes instructions, doesn't plan work.

**Lesson**: Neither OpenClaw nor Galatea has solved autonomous work execution. But Galatea's homeostasis model provides the foundation OpenClaw lacks:
- Homeostasis dimensions (productive_engagement, progress_momentum) can detect "stuck" or "idle" states
- The tick loop can trigger work, not just responses
- What's missing is a **task model** — a representation of "what work am I doing, where am I in it, what's next"
- OpenClaw's `active-context.md` is the closest thing to this, but it's unstructured

**Proposed approach for Galatea**: An operational memory layer that tracks:
- Current task(s) with status
- Work arc: explore → decide → implement → verify
- Next action and blockers
- This sits between the tick loop (which runs it) and the knowledge store (which informs it)

### Gap 13: LLM Hallucination

**OpenClaw's approach**: The 12-layer community architecture includes a "stability plugin" with entropy monitoring and confabulation guards. Also, the cognitive architecture emphasizes "Don't rely on the model to figure it out. Structure embodies desired behaviors."

**Lesson**: Validates our approach — strict prompts, schema enforcement, heuristic hints. But also suggests:
- **Confabulation guards**: Post-generation validation that checks extracted facts against source text
- **Entropy monitoring**: Detect when model output divergence indicates hallucination
- These could be lightweight additions to our extraction pipeline

### Phase F: Skills

**OpenClaw's approach**: 100+ preconfigured AgentSkills. Skills are injected selectively into prompts (not all skills every turn). User-extensible.

**Lesson**: OpenClaw proves the skills model works at scale. For Galatea's SKILL.md auto-generation:
- Start with procedural memory extraction (we already have `type: "procedure"`)
- Convert high-confidence repeated procedures to runbook-style files
- Selective injection (only relevant skills per context) is important for token budget

### Phase F: Safety

**OpenClaw's approach**: Three layers: behavioral rules (AGENTS.md), pattern detection (injection attempts), monitoring/audit (weekly Opus review).

**Lesson**: The monitoring layer is interesting — use a smart model periodically to audit what the agent has been doing. Could fit naturally into our homeostasis tick cycle.

---

## Recommendations: What to Build Next

Based on this analysis and our gap/roadmap state:

### 1. Operational Memory Layer (addresses Gaps 11, 12)

A new `active-context.md` (or structured equivalent) that the agent reads/writes each tick:
- Current task(s) with status and work phase
- Pending decisions and blockers
- Cross-session continuity notes
- Loaded at tick start, updated at tick end

This is the single highest-impact addition. It bridges the gap between "knowing things" (knowledge store) and "doing things" (work execution).

### 2. Embedding-Based Retrieval (addresses retrieval quality)

Our keyword + entity matching works for 192 entries but won't scale. OpenClaw's hybrid approach (vector + BM25) with SQLite-vec is a proven pattern. We already generate embeddings for deduplication — extend to retrieval.

### 3. Confabulation Guards (addresses Gap 13)

Post-extraction validation: check that extracted entities actually appear in source text, that "about" fields reference known people, that confidence isn't uniformly 1.0. Lightweight, no LLM needed.

### 4. Update Roadmap

The roadmap is stale (Phase E still shows as "concept"). Phase E is ~95% done. Phase F should be re-scoped based on these learnings: operational memory + embedding retrieval + confabulation guards before skills auto-generation.

---

*Research conducted 2026-02-21. Sources linked throughout.*
