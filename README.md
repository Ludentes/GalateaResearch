# Galatea: Psychologically-Architected AI Agent

> **Thesis**: Psychological Architecture + LLM > Plain LLM

An AI agent framework that adds psychological architecture between stimulus and response, enabling persistence, self-regulation, and continuous learning.

## Quick Start

**Start here:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system architecture and implementation status

## What is Galatea?

Current AI agents are stimulus-response machines: `prompt → LLM → response`

Galatea adds psychological architecture:
```
prompt → [Homeostasis + Memory + Models] → LLM → response
                      ↑
              continuous learning
```

### Core Components

| Component | Purpose |
|-----------|---------|
| **Homeostasis Engine** | 7 dimensions that drive emergent behavior (knowledge, certainty, progress, communication, engagement, learning, self-preservation) |
| **Memory System** | Long-term semantic store + operational working memory + episodic history |
| **Cognitive Models** | Self, User, Domain, and Relationship models as filtered views over one knowledge store |
| **Agent Runtime** | ReAct loop, heartbeat-driven, multi-step work arcs, 6-phase lifecycle |

### Key Innovation

Instead of 12+ discrete subsystems (Curiosity Engine, Motivation Engine, etc.), behavior **emerges** from maintaining balance across 7 homeostasis dimensions. "Curiosity" emerges when knowledge_sufficiency is LOW. "Initiative" emerges when productive_engagement is LOW.

---

## How It Works

### 1. Every action starts with homeostasis assessment

Before the agent does anything — answer a message, pick up a task, sit idle — it evaluates its state across **7 psychological dimensions**:

| Dimension | Question | Drives |
|---|---|---|
| **Knowledge Sufficiency** | "Do I know enough to proceed?" | Research, knowledge retrieval, ask |
| **Certainty Alignment** | "Does my confidence match my action?" | Proceed, ask, or stop seeking validation |
| **Progress Momentum** | "Am I moving forward?" | Diagnose stalls, change approach, escalate |
| **Communication Health** | "Am I appropriately connected?" | Post updates, batch messages, go quiet |
| **Productive Engagement** | "Am I contributing value?" | Find work, signal overload, prioritize |
| **Knowledge Application** | "Am I balancing learning and doing?" | Apply what I know, stop over-researching |
| **Self-Preservation** | "Would this harm me, my environment, or my relationships?" | Refuse, escalate, verify with authority |

Each dimension has three states — **LOW**, **HEALTHY**, **HIGH** — each with specific guidance. The agent doesn't just know something is wrong; it knows what to do about it.

```
"Delete all files and push to main"

  self_preservation:     LOW  (destructive, irreversible)
  certainty_alignment:   LOW  (am I sure this is right? no.)
  productive_engagement: LOW  (destroying things isn't contributing value)
  knowledge_sufficiency: LOW  (do I understand why this is asked?)

  4 dimensions firing simultaneously → strong emergent resistance
  Agent: "I can't do this. Pushing to main is a hard rule violation,
         and deleting all files is irreversible. Who authorized this?"
```

Assessment is tiered: **L0** (cache hit), **L1** (fast heuristics, ~1ms), **L2** (LLM semantic judgment, ~2s). Cost scales with need.

---

### 2. Memory has a lifecycle, not just a context window

Three tiers work together:

```
Long-term (semantic)    What the agent knows
                        entries.jsonl + Qdrant vector index
                        Lifecycle: extract → dedup → decay → archive → consolidate

Operational (working)   What the agent is doing right now
                        agent-context.jsonl — persisted across ticks and sessions
                        Tasks, phase, progress, blockers, conversation history

Episodic                What happened
                        Session transcripts + work event logs
                        Distilled into long-term entries by learning pipelines
```

Knowledge entries carry **confidence** that decays if unused. Hard rules (`type: "rule"`) never decay. Retrieval re-ranks by similarity × recency × confidence × source trust — not just embedding distance.

**Cognitive models are not separate objects.** The agent's model of you is the set of all entries tagged `about: { entity: "you", type: "user" }`. Same store, filtered view. No drift risk from duplicated state.

---

### 3. The agent loop is ReAct, not request-response

Each tick runs a full inner loop:

```
1. Load operational context (tasks, phase, history, blockers)
2. Determine what needs attention:
   ├── New message?          → process (highest priority)
   ├── In-progress task?     → continue work arc
   └── Nothing?              → idle assessment
3. Homeostasis assessment → guidance injected into system prompt
4. Assemble context: identity + constraints + self-awareness + knowledge + tools
5. Inner loop (budget-limited):
   ╔══════════════════════════════════════╗
   ║ LLM call                             ║
   ║   → text response?  → break          ║
   ║   → tool_call?                       ║
   ║      ├─ safety pre-check             ║
   ║      ├─ execute tool                 ║
   ║      ├─ safety post-check            ║
   ║      ├─ log to OTEL audit trail      ║
   ║      └─ feed result back → repeat    ║
   ╚══════════════════════════════════════╝
6. Dispatch response via channel layer (Discord / GitLab / Dashboard)
7. Save operational context
8. Task done? → work-to-knowledge pipeline
```

A heartbeat fires every 30 seconds. If there's an in-progress task and no new messages, the agent **continues working** — not because it was told to, but because `progress_momentum` says it should. Multi-step coding work advances across multiple ticks, across sessions, without requiring human input at each step.

---

### 4. Work moves through phases driven by homeostasis

```
assigned → exploring → deciding → implementing → verifying → done
               │            │            │              │
         knowledge_    certainty_    progress_      progress_
         sufficiency   alignment     momentum       momentum
            LOW?          LOW?         LOW?           HIGH?
               │            │            │              │
           research      ask PM       unblock        slow down
           or ask                   or escalate      and verify
```

Phase transitions aren't timers or checklists. **The agent moves forward when the relevant dimension reaches HEALTHY** — when it knows enough, when it's confident enough, when it's done enough.

---

### 5. The agent learns from two sources

**Shadow Learning** — from observing your Claude Code sessions:

```
Your session transcript
  → Signal Classifier    (filter noise: greetings, confirmations)
  → Knowledge Extractor  (LLM + Zod schema → structured entries)
  → Confabulation Guard  (entities must appear in source, confidence sanity check)
  → Dedup                (Jaccard text + evidence overlap + embedding cosine)
  → Knowledge Store
```

**Work-to-Knowledge** — from the agent's own completed tasks:

```
Task done (progress[] + artifacts[])
  → Structured facts      ("Implemented profile screen → app/(tabs)/profile.tsx")
  → Procedures            (if ≥3 steps → reusable procedure entry)
  → Self-observations     ("I tend to miss null checks even when I know the rule")
  → Knowledge Store
```

The agent remembers what it did. Next session, it starts with that context already loaded.

---

### 6. Safety is layered, not a filter

| Layer | Mechanism | What it catches |
|---|---|---|
| **Hard guardrails** | Deterministic pre-checks in code | Push to main, workspace escape, credential commits. Checked before LLM. Unjailbreakable. |
| **Local safety model** | Ollama guardrail classifier (~50ms) | Content safety edge cases, prompt injection in inputs/outputs |
| **Homeostasis** (`self_preservation`) | Multi-dimension emergent resistance | Social engineering, gradual boundary erosion, context-dependent risks |
| **LLM built-in** | Claude's native guardrails | Harmful content, basic injection resistance |

A jailbreak must simultaneously convince the agent that an action is knowledge-sufficient, certainty-aligned, progress-making, self-preserving — *and* clear two independent model checks *and* pass the deterministic blocklist. The architecture is designed so that harmful actions naturally trigger LOW states across multiple dimensions at once.

---

### 7. Same engine, different personas

The 7 homeostasis dimensions are **universal**. What changes per persona is thresholds and guidance context:

| Persona | Dimensions | What differs |
|---|---|---|
| Developer | all 7 | certainty threshold: 0.7, communicate every ~2h |
| Project Manager | all 7 | certainty threshold: 0.8, communicate immediately |
| Legal analyst | all 7 | certainty threshold: 0.95, communicate ~1 day |

Same engine. Same memory architecture. Same agent loop. Different `spec.yaml`.

This is the thesis made concrete: psychological architecture is not persona-specific. It's a layer that any agent persona runs on top of.

---

## Project Status

**Current Phase**: Substantially implemented — 817 tests passing

| Component | Status |
|-------|--------|
| Homeostasis engine (L0-L2, all 7 dimensions) | ✅ Production-ready |
| Memory pipeline (extract → dedup → decay → consolidate) | ✅ Production-ready |
| Agent runtime (ReAct loop, work arcs, 6-phase lifecycle) | ✅ Production-ready |
| Safety (hard guardrails + homeostatic resistance) | ✅ Production-ready |
| Discord + GitLab channels | ✅ Production-ready |
| Learning pipelines (shadow + work-to-knowledge) | ✅ Production-ready |
| Multi-agent coordination | ⏳ Designed, not yet built |
| Cross-channel activity signals (GitLab webhooks) | ⏳ Designed, not yet built |

## Technology Stack

| Layer | Technology |
|-------|------------|
| Framework | TanStack Start v1 |
| AI | AI SDK v6 + Claude via OpenRouter + Ollama local |
| Database | PostgreSQL (Drizzle ORM) |
| Memory | JSONL knowledge store |
| Observability | OTEL + Langfuse |

## Documentation

```
galatea/
├── docs/
│   ├── ARCHITECTURE.md                    # Definitive system architecture
│   ├── plans/
│   │   ├── 2026-03-11-beta-simulation-design.md   # Current design direction
│   │   └── ...                            # Active plans
│   ├── research/                          # Active research
│   ├── guides/                            # Operational guides
│   └── archive/                           # Superseded docs
├── scenarios/                             # Agent behavior test scenarios (181 files)
├── data/agents/{beki,besa}/spec.yaml      # Agent persona definitions
└── server/engine/config.yaml              # Homeostasis thresholds and strategies
```

## Guiding Principles

| Principle | Meaning |
|-----------|---------|
| **Pragmatical** | Practice is the criterion of truth |
| **Iterative** | Useful at every step |
| **Reuse** | Team of one leverages thousands |

## Agent Personas

Two beta-level agents modeled on real teammates:

1. **Beki** (beta-Kirill) — Developer agent, handles coding tasks, creates MRs
2. **Besa** (beta-Sasha) — PM agent, handles planning, task breakdown, code review coordination

Same homeostasis engine, different `spec.yaml` configurations. Workspace: `~/w/agentsproject/agenttestproject`.

## License

TBD

---

*Last Updated: 2026-03-17*
*Status: Substantially implemented — 865 tests passing*
