# Phase F Qualitative Report: Agent Runtime v2

**Date:** 2026-02-23
**Branch:** `feature/phase-f-agent-runtime-v2`
**Duration:** ~3 days (Feb 21-23)
**Scope:** 11 commits, 38 files changed, +4,324 / -292 lines, 324 tests

---

## What Phase F Was About

Phase F was the inflection point between "a brain that observes" and "an agent that acts." Before Phase F, Galatea could learn from conversations, assess its own psychological state, and retrieve facts — but it operated in a request-response tick loop with no concept of ongoing work, no tool execution, no multi-channel awareness, and no safety boundaries. It was a brain in a jar.

Phase F gave the brain a body.

---

## What Galatea Can Do Now

### 1. Receive Work from Multiple Channels

A unified `ChannelMessage` type normalizes input from Discord (DMs, guild mentions, threads) and the dashboard into a single format. The dispatcher routes outbound responses back to the correct channel. Intent classification distinguishes chat from task assignments. This means the agent no longer cares *where* a message comes from — it processes a `ChannelMessage` and responds through the same channel.

**What this enables:** Adding a new channel (Telegram, Slack, email) requires writing one adapter (~50 lines), not touching any agent logic.

### 2. Execute Multi-Step Work with Tools

The ReAct agent loop replaces the one-shot tick. The agent can now:
- Receive a task
- Call tools (currently stubs — file read, file write, shell, git)
- Read tool results
- Decide what to do next
- Repeat until done or budget exhausted

Budget controls (max steps, timeout) prevent runaway loops. History is passed to each LLM call so the agent has context across iterations.

**What this enables:** Phase G plugs real MCP tools into this loop. The loop itself is complete.

### 3. Track Work Across Restarts

Operational memory persists task state (assigned, exploring, deciding, implementing, verifying, done), conversation history (bounded to 5 exchanges), phase timing, and carryover notes. If the process restarts, the agent picks up where it left off.

**What this enables:** Long-running work arcs that survive deployment, crashes, or heartbeat interruptions.

### 4. Self-Regulate with 7 Dimensions

The homeostasis engine gained a 7th dimension: `self_preservation`, implementing Asimov's Three Laws as a continuous signal — not a gate. The engine now integrates operational memory: communication cooldown prevents spam (HIGH when <5 min since last outbound), silence detection flags neglected conversations (LOW when 3+ hours), over-research guardrail nudges the agent to stop exploring and start building (HIGH when exploring 2+ hours), and idle detection pushes the agent to seek work.

**What this enables:** The agent's behavior is shaped by its internal sense of balance, not by hard-coded rules. Adding new behavioral signals means adding a dimension, not rewriting control flow.

### 5. Retrieve Knowledge at Scale

Vector retrieval via Qdrant (thin REST client, no dependency) with composite re-ranking (similarity 0.4, recency 0.2, confidence 0.3, source quality 0.1) replaces pure keyword matching. Hard rules (type=rule, confidence=1.0) are always included regardless of ranking. Graceful fallback to keyword retrieval when Qdrant or embeddings are unavailable.

**What this enables:** Scaling beyond the current 212 entries to thousands, with semantic rather than keyword matching.

### 6. Guard Against Hallucination

Post-extraction confabulation guards validate LLM output before it enters the knowledge store: hallucinated entities are removed, invented `about` fields are cleared, uniform confidence is flagged and adjusted, and monoculture type distributions generate warnings. This runs automatically after every extraction.

**What this enables:** Higher quality knowledge store, fewer garbage entries polluting retrieval and context.

### 7. Assemble Rich Context Within Budget

The context assembler now supports 6 section types (constraints, identity, self-regulation, operational context, conversation history, tool definitions, learned knowledge, procedures) within a 12K token budget with per-section accounting. Non-truncatable sections (rules, identity) are always included. Truncation drops lowest-ranked entries first. Budget usage is logged per-section.

**What this enables:** The agent's system prompt is no longer a flat concatenation — it's a structured, prioritized, auditable assembly with known budget characteristics.

### 8. Operate Within Safety Boundaries

A four-layer safety model is designed and documented:
- **Layer 0:** LLM built-in guardrails (leveraged, not rebuilt)
- **Layer 0.5:** Local guardrail model (`gpt-oss-safeguard:latest`, verified working)
- **Layer 1:** Homeostasis `self_preservation` (implemented, 19+ destructive patterns)
- **Layer 2:** Hard guardrails (designed for Phase G — workspace boundaries, branch protection, command allowlist, secrets scanning, tool risk metadata)

Trust matrix (channel x identity) determines effective permissions. Jailbreak defense is multi-layered.

**What this enables:** Phase G can implement tool execution with confidence that safety boundaries exist at every level.

---

## What Changed Architecturally

Before Phase F, the architecture was:

```
Message → tick() → assess homeostasis → assemble context → LLM → respond → done
```

After Phase F:

```
ChannelMessage → normalize → queue in operational memory
                              ↓
tick(heartbeat) → check pending → assess homeostasis (7 dims)
                              ↓
                   agent loop (ReAct) → [tool call → result → next step]*
                              ↓
                   assemble context (12K, 6 section types, budget accounting)
                              ↓
                   dispatch response → channel adapter → Discord/Dashboard
                              ↓
                   update operational memory (task state, history, timing)
```

The agent now has a lifecycle, not just a handler.

---

## What Is Still Missing to Reach the Ultimate Goal

The ultimate goal is an AI agent that learns from observing professionals, executes multi-step work autonomously, remembers its actions, communicates through multiple channels, and maintains safety boundaries — all running locally.

### Phase G: Work Execution (the critical next phase)

Phase F built the runtime. Phase G fills it with capability.

| Gap | What's Missing | Impact |
|-----|---------------|--------|
| **G.1 Tool implementation** | The agent loop calls stub tools. Real MCP tools (file read/write, shell, git) with risk metadata need to be wired. | Agent can reason about work but cannot *do* it. |
| **G.2 Safety implementation** | Layer 0.5 classifier is verified but not wired into the message pipeline. Pre/post execution filters exist as design, not code. Trust resolver not implemented. | Tools exist but lack runtime safety enforcement. |
| **G.3 Work arc** | The agent can track a task but doesn't know the homeostasis-driven work cycle (explore → decide → implement → verify). No trigger to autonomously start the next phase. | Agent responds to requests but doesn't drive work forward autonomously. |
| **G.4 GitLab integration** | No connection to the self-hosted GitLab (gitlab.maugry.ru). Can't create branches, push code, open MRs. | Agent is isolated from the actual development workflow. |
| **G.5 Work-to-knowledge pipeline** | Knowledge extraction only reads chat text. Tool call results, file changes, and work traces are invisible to the memory system. | Agent forgets what it *did*, only remembers what was *said*. |
| **G.6 Task routing** | No skill-based routing. Agent doesn't know which tools/patterns to apply for different task types. | Every task is treated the same regardless of complexity or domain. |

### Phase H: Persona + Multi-Agent (further out)

| Gap | What's Missing |
|-----|---------------|
| **H.1-H.2 Per-agent state + shared memory** | Currently single-agent. No way to run multiple Galatea instances with different personas sharing a knowledge base. |
| **H.3-H.4 Persona export/import** | Can't extract the learned persona into a portable format and deploy it elsewhere. |
| **H.5-H.6 Agent registry + cross-agent patterns** | No coordination between multiple agents. No way to detect that Agent A learned something Agent B needs. |

### Persistent Gaps (from KNOWN_GAPS.md)

| Gap | Severity | Notes |
|-----|----------|-------|
| **Session model unclear** | High | No clear session boundaries. Extraction operates on entire conversation files. Retrieval quality depends on context of when knowledge was created. |
| **LLM hallucination** | High | Local models (gemma3:12b) hallucinate ~43% of the time. Every LLM prompt must be strictly structured, schema-validated, and tested. The confabulation guard (F.6) mitigates but doesn't eliminate this. |
| **Memory overflow** | Medium | No strategy for when the knowledge store grows beyond what fits in context. Vector retrieval (F.5) helps but doesn't solve the fundamental problem of a growing unbounded store. |

---

## Honest Assessment

**What went well:**
- The 8 deliverables were implemented methodically with BDD scenarios, 93% of which have passing tests
- Code review found 2 critical issues, both fixed before merge
- Safety model design is thorough — the four-layer architecture with "homeostasis, not a gate" philosophy is sound
- Graceful degradation is consistent — every external dependency (Qdrant, Ollama, PostgreSQL) has a fallback path
- The verification guide enables reproducible manual testing

**What is fragile:**
- The agent loop is tested with mocks but never with a real LLM doing real tool calls — that's the Phase G integration boundary
- Trust levels default to NONE (most restrictive) because the trust resolver doesn't exist yet — every destructive pattern triggers safety guidance regardless of who's asking
- Qdrant is running but the `galatea-knowledge` collection hasn't been created or populated yet — vector retrieval falls back to keyword until the sync pipeline is wired

**What I'd worry about:**
- Phase G is where theory meets reality. The agent loop, safety model, and tool definitions are designed but untested end-to-end with real tools operating on real codebases
- The knowledge extraction prompt still needs systematic improvement (the Langfuse eval loop plan exists but isn't built yet)
- There's no integration test that exercises the full pipeline: Discord message → channel adapter → operational memory → agent loop with tools → extraction → knowledge in next context. Each piece works. The chain is untested.

---

## Distance to Ultimate Goal

```
Phase A ████████████ Foundation                    ✅ Complete
Phase B ████████████ Shadow Learning               ✅ Complete
Phase C ████████████ Observation + Homeostasis      ✅ Complete
Phase D ████████████ Formalize + Close the Loop     ✅ Complete
Phase E ████████████ Launch & Observe               ✅ Complete
Phase F ████████████ Agent Runtime v2               ✅ Complete (this report)
Phase G ░░░░░░░░░░░░ Work Execution                 ← Next (2 weeks)
Phase H ░░░░░░░░░░░░ Persona + Multi-Agent          ← Later (2-3 weeks)
```

Phase F is 6 of 8 phases complete. The brain is built, wired, and regulated. The body has a skeleton (agent loop, operational memory, channel dispatch) but no muscles (real tools, real work arcs). Phase G is where Galatea goes from "an agent that thinks about doing things" to "an agent that does things." Phase H is where it goes from "one agent" to "a platform for agents."

The hardest part is behind us (the cognitive architecture). The most visible part is ahead (the agent actually writing code, creating merge requests, and reporting back).
