# Galatea Development Roadmap

> **Vision:** Create off-the-shelf developer agents by shadowing real professionals, learning their unique processes, and deploying agents that behave like trained team members.

**Architecture Principle:** Build **two things** (Homeostasis + Memory-with-lifecycle). Everything else leverages the ecosystem (LLM, Skills, MCP, Agent Teams).

---

## Phase Overview

| Phase | Status | Focus | Key Deliverables | Duration |
|-------|--------|-------|------------------|----------|
| **Phase A** | ✅ Complete | Foundation | Chat UI, multi-provider streaming, PostgreSQL setup | 2 weeks |
| **Phase B** | ✅ Complete | Shadow Learning | Transcript extraction, knowledge store, context assembly | 1 week |
| **Phase C** | ✅ Complete | Observation + Homeostasis | OTEL pipeline, L0-L2 thinking, auto-extraction hooks | 1 week |
| **Phase D** | 📋 Planned | Formalize + Close the Loop | BDD integration tests from trace, entity retrieval, tick(), supersession | 1-2 weeks |
| **Phase E** | 💭 Concept | Homeostasis Refinement | L2 LLM assessment, L3 meta-assessment, memory lifecycle, self-model | 1 week |
| **Phase F** | 💭 Concept | Skills + Visualization | SKILL.md auto-generation, heartbeat loop, dashboard, safety | 2 weeks |

**Total estimated time:** 8-9 weeks (~2 months)

**Phase D restructure (2026-02-13):** End-to-end trace revealed the feedback loop is broken — knowledge extracted but never used (`retrievedFacts: []`). Phase D reprioritized from homeostasis refinement to closing the loop. Old Phase D content (L2/L3, decay, consolidation) moved to Phase E. See `docs/plans/2026-02-13-phase-d-revised.md`.

---

## Phase A: Foundation ✅

**Goal:** Establish core infrastructure for a functional chat agent.

### Key Deliverables
1. ✅ **TanStack Start** full-stack framework with SSR
2. ✅ **Chat UI** with message streaming and session management
3. ✅ **Multi-provider LLM support** (OpenAI, Claude, Ollama) via AI SDK v6
4. ✅ **PostgreSQL** database with Drizzle ORM
5. ✅ **Session management** (create, list, load, delete)
6. ✅ **Basic memory types** (stubs for future expansion)

### Architecture Decisions
- **UI Framework:** TanStack Start (React + TanStack Router + Server Functions)
- **LLM Abstraction:** AI SDK v6 (Vercel) for streaming and multi-provider support
- **Database:** PostgreSQL 16 with Drizzle ORM (type-safe SQL)
- **Deployment:** Docker Compose for local development

### Testing
- Unit tests for provider factories and chat logic
- Integration test with real LLM (Ollama)
- Manual testing: send messages, see responses

### Reference
- Plan: `docs/plans/2026-02-04-phase1-foundation.md`
- Progress: `docs/plans/2026-02-04-phase1-progress.md`

---

## Phase B: Shadow Learning Pipeline ✅

**Goal:** Automate knowledge extraction from Claude Code session transcripts and wire learned knowledge into the Galatea chat agent's context.

### Key Deliverables
1. ✅ **Transcript Reader** — Parse Claude Code JSONL session files
2. ✅ **Signal Classifier** — Filter noise using regex patterns (from v1 gatekeeper)
3. ✅ **Knowledge Extractor** — LLM extraction via AI SDK `generateObject` + Zod
4. ✅ **Knowledge Store** — JSONL-based storage with deduplication
5. ✅ **Context Assembler** — Read knowledge + preprompts → system prompt
6. ✅ **Extraction Pipeline** — Orchestrates read → classify → extract → store
7. ✅ **API Endpoint** — `/api/extract` to trigger extraction on demand
8. ✅ **CLI Tool** — `pnpm extract <session-id>` for manual testing

### Architecture
Six-module pipeline: Transcript Reader → Signal Classifier → Knowledge Extractor → Knowledge Store (JSONL) → Context Assembler → Chat Integration

### Quality Metrics
- **Precision:** 95% (validated in shadow learning experiment)
- **Recall:** 87%
- **Deduplication:** 3-path strategy (exact match, semantic similarity, source-level guard)

### Testing
- Unit tests for each module with fixtures
- Integration test for full pipeline (sample-session.jsonl → knowledge.jsonl)
- Quality tests: precision/recall on reference transcripts
- Manual test: Extract from real session, verify knowledge appears in chat

### Reference
- Plan: `docs/plans/2026-02-11-phase-b-shadow-learning.md`
- Experiment: `docs/plans/2026-02-11-shadow-learning-experiment.md`
- Learning Scenarios: `docs/plans/2026-02-11-learning-scenarios.md`

---

## Phase C: Observation + Homeostasis Integration ✅

**Goal:** Build OTEL observation infrastructure, implement homeostasis sensor with L0-L2 multi-level thinking, and enable automatic extraction via Claude Code hooks.

### Key Deliverables
1. ✅ **Extraction State Tracking** — Prevent re-processing of sessions
2. ✅ **SessionEnd Auto-Extraction Hook** — Trigger extraction when sessions end
3. ✅ **Homeostasis Sensor Module** — Assess 6 psychological dimensions
4. ✅ **L0-L2 Multi-Level Thinking** — Caching, heuristics, LLM placeholders
5. ✅ **Context Assembler Integration** — Inject homeostasis guidance into prompts
6. ✅ **OTEL Collector Docker Setup** — Receive and route observation events
7. ✅ **Observation Ingest API** — `/api/observation/ingest` for OTLP logs
8. ✅ **Event Store** — JSONL-based storage for observation events
9. ✅ **Claude Code OTEL Hooks** — Real-time event emission (UserPromptSubmit, PostToolUse)

### Architecture: L0-L2 Multi-Level Thinking

| Level | Description | Latency | Use Cases |
|-------|-------------|---------|-----------|
| **L0** | Cached/reflexive assessment | 0ms | Recent assessments within TTL |
| **L1** | Computed heuristics with relevance scoring | 1-5ms | knowledge_sufficiency, progress_momentum, communication_health, productive_engagement |
| **L2** | LLM semantic understanding (placeholder) | 2-5s | certainty_alignment, knowledge_application |

### Homeostasis Dimensions

| Dimension | L0 Cache TTL | L1/L2 | Triggers When... |
|-----------|--------------|-------|------------------|
| `knowledge_sufficiency` | 0ms | L1 | No relevant facts for user question |
| `progress_momentum` | 2 min | L1 | User repeating similar questions (stuck) |
| `communication_health` | 30 min | L1 | Session stale (4+ hours) |
| `productive_engagement` | 0ms | L1 | No task, empty conversation |
| `certainty_alignment` | 1 min | L2 | Agent confidence mismatch (Phase D) |
| `knowledge_application` | 5 min | L2 | Agent ignoring available facts (Phase D) |

### Evaluation Results

**Baseline (simple counting) vs L0-L2 (relevance scoring + caching):**

| Metric | Baseline | L0-L2 | Improvement |
|--------|----------|-------|-------------|
| **Failed Tests** | 6 | 4 | ✅ **-33%** |
| **Passing Tests** | 9 | 11 | ✅ **+22%** |

**Key win:** L1 relevance scoring successfully filters irrelevant facts (S1.3 test).

**Known edge cases (4 todo tests for Phase D):**
- 2× stuck detection Jaccard similarity bug
- 1× keyword matching strictness ("auth" vs "authentication")
- 1× cascading goal achievement test

### Testing
- 17 automated evaluation tests based on learning scenarios
- Unit tests for extraction state, homeostasis engine, context assembler
- Integration tests for OTEL pipeline
- Manual test guide (964 lines) covering all 7 tasks with step-by-step verification

### Reference
- Evaluation Report: `docs/plans/2026-02-12-homeostasis-l0-l2-evaluation-report.md`
- Manual Test Guide: `docs/plans/2026-02-12-phase-c-manual-testing-guide.md`
- Commits: 11 commits on `feat/phase-c` branch

---

## Phase D: Formalize + Close the Loop 📋

**Goal:** Turn the end-to-end trace into executable BDD integration tests, then close the feedback loop so extracted knowledge flows into agent behavior.

**Motivation:** End-to-end trace (2026-02-13) revealed the feedback loop is broken. Knowledge gets extracted but `retrievedFacts` is always `[]`. Closing the loop is higher priority than homeostasis refinement.

### Key Deliverables

**D.1: Formalize (Red)**
1. 🎯 **Scenario Builder** — TestWorld helper with fixture seeding (real DB + real Ollama)
2. 🎯 **Layer 1 Integration Tests** — Developer chat path (6 green, 4 todo)
3. 🎯 **Layer 2 Integration Tests** — Extraction pipeline (5 green, 4 todo)
4. 🎯 **Layer 3 Integration Tests** — tick() decisions, not Discord I/O (7 red, 2 todo)
5. 🎯 **Mermaid Diagrams** — Sequence diagrams as visual sanity check

**D.2: Close the Loop (Green)**
6. 🎯 **Entity-Based Fact Retrieval** — Query `about` field to populate `retrievedFacts`
7. 🎯 **Wire Retrieval into Chat** — Replace `retrievedFacts: []` in `chat.logic.ts`
8. 🎯 **tick() Function + Agent State** — 4-stage pipeline: self-model → homeostasis → channels → action
9. 🎯 **Supersession Logic** — Populate `supersededBy` field (exists but never written)
10. 🎯 **Clean Up Dead Artifacts** — Remove knowledge.md rendering (dead in pipeline)

### Architecture: Tests as Spec

Integration tests ARE the formalized trace. BDD-style with scenario builders using real data:

```typescript
describe("Layer 1: Developer works on Umka MQTT persistence", () => {
  beforeAll(async () => {
    world = await scenario("umka-mqtt-dev")
      .withSession("umka")
      .withKnowledgeFrom("data/memory/entries.jsonl") // real Umka data (259 entries)
      .seed()
  })

  it("retrieves MQTT facts when message mentions MQTT", ...)
  it("does NOT retrieve Alina's user model for developer chat", ...)
  it.todo("emits OTEL event after response delivered") // Phase E
})
```

### Architecture: tick() Function

```typescript
async function tick(trigger: "manual" | "heartbeat"): Promise<TickResult> {
  // Stage 1: Self-model (pure state reads)
  // Stage 2: Homeostasis assessment
  // Stage 3: Channel scan (pending messages)
  // Stage 4: LLM action (if provider available)
}
// Exposed as: POST /api/agent/tick
```

### Success Criteria

After D.1: Integration test suite exists (green + todo). `pnpm test:integration` runs.
After D.2: Feedback loop works (extract → store → retrieve → use → assess). 22 of 31 tests green.

### Reference
- Revised Plan: `docs/plans/2026-02-13-phase-d-revised.md`
- Previous Plan: `docs/archive/completed/superseded/2026-02-12-phase-d-homeostasis-refinement.md`
- End-to-End Trace: `docs/plans/2026-02-13-end-to-end-trace.md`

---

## Phase E: Homeostasis Refinement + Memory Lifecycle 💭

**Goal:** Make homeostasis smarter (L2/L3), add memory lifecycle (decay, consolidation), implement self-model for powered-down mode, and add app-level OTEL events. Content moved from old Phase D + new items from end-to-end trace.

### Planned Deliverables
1. 💭 **Fix L1 Edge Cases** — Keyword stemming + stuck detection debugging
2. 💭 **L2: certainty_alignment** — LLM assessment for confidence mismatch
3. 💭 **L2: knowledge_application** — LLM assessment for knowledge usage
4. 💭 **L3 Meta-Assessment** — Arbitrate when L1 and L2 disagree
5. 💭 **Memory Consolidation** — Extract high-confidence patterns to CLAUDE.md
6. 💭 **Memory Decay** — Confidence reduction over time, archival below threshold
7. 💭 **Self-Model + Powered-Down Mode** — Resource/capacity/constraint awareness without LLM (X6)
8. 💭 **App-Level OTEL Events** — Chat, extraction, tick events (X3)
9. 💭 **Performance Monitoring** — L0 cache hit rate, L1/L2 latency tracking

### Success Criteria
- Remaining integration test todos from Phase D become green
- L2 latency < 3s, L3 disagreement < 10%
- Memory decay running, stale entries archived
- Self-model produces template responses in powered-down mode

### Reference
- Previous Phase D plan (now Phase E content): `docs/archive/completed/superseded/2026-02-12-phase-d-homeostasis-refinement.md`
- End-to-End Trace X6 (Self-Model): `docs/plans/2026-02-13-end-to-end-trace.md`

---

## Phase F: Skills + Visualization 💭

**Goal:** Auto-generate SKILL.md from patterns, enable heartbeat loop, build visualization dashboard, implement safety system.

### Planned Deliverables
1. 💭 **Pattern Detection** — Identify 3+ occurrences of similar procedures
2. 💭 **SKILL.md Auto-Generation** — Convert patterns to executable skills
3. 💭 **Heartbeat Loop** — `setInterval(() => tick("heartbeat"), 30_000)` (tick exists from Phase D)
4. 💭 **L4 Strategic Analysis** — Cross-session pattern analysis
5. 💭 **Homeostasis Dashboard** — Real-time dimension visualization
6. 💭 **Memory Browser** — Explore knowledge store, search, edit entries
7. 💭 **Safety & Boundaries** — Knowledge store poisoning guard, pre/post filters (X2)
8. 💭 **Contradiction Resolution** — Handle conflicting knowledge (advanced supersession)

### Success Criteria
- 3+ skills auto-generated from real usage patterns
- Heartbeat loop enables idle agent behaviors
- Dashboard shows real-time dimension state
- All integration test todos from Phase D/E become green

### Estimated Timeline
**2 weeks**

---

## Deferred / Out of Scope

### Memory Tier 3 (RAG/Mem0)
**Status:** Deferred until CLAUDE.md proves insufficient

**Trigger conditions:**
- CLAUDE.md exceeds 50KB (too large for every request)
- Agent needs cross-session pattern analysis beyond L4
- Multi-agent coordination requires shared memory

**Options:**
- Mem0 (managed semantic memory)
- Graphiti + FalkorDB (graph-based)
- Custom vector store (Pinecone, Weaviate)

### Multi-Agent Coordination
**Status:** Deferred to post-MVP

**Requirements:**
- Agent registry (who's available, what skills they have)
- Shared memory tier (CLAUDE.md/SKILL.md namespace)
- Agent-to-agent messaging (MCP server?)

**Use case:** Assign tasks to specialist agents (e.g., "Ask the DevOps agent")

### HomeAssistant + Frigate Integration
**Status:** Deferred to post-MVP

**Requirements:**
- MQTT-to-OTEL bridge (convert HA events to OTEL format)
- Camera stream analysis (Frigate events → knowledge extraction)
- Privacy controls (PII filtering)

**Use case:** "The doorbell rang 3 times today" → agent learns household patterns

---

## Key Architectural Decisions

### 1. Why L0-L2 Before L3-L4?
**Reason:** Establish fast path (L0/L1) and validate improvement (33% fewer failures) before adding complexity (L3/L4).

### 2. Why JSONL Over PostgreSQL for Knowledge?
**Reason:** Simplicity for Tier 1 memory. PostgreSQL overhead not justified until Tier 3 (RAG).

### 3. Why Ollama `glm-4.7-flash` for L2?
**Reason:** Fast local inference (2-5s), free, private. Claude API too expensive for frequent assessments.

### 4. Why Skills Over Custom Code?
**Reason:** Skills (SKILL.md) are:
- Portable (copy to any Claude Code session)
- User-editable (plain markdown)
- Ecosystem-aligned (Claude's native format)

### 5. Why OTEL Over Custom Events?
**Reason:** Industry standard, rich tooling (Collector, Jaeger, Prometheus), vendor-neutral.

---

## Success Metrics

### Phase B (Shadow Learning)
- ✅ Precision: 95%
- ✅ Recall: 87%
- ✅ Deduplication: 3-path strategy prevents duplicates

### Phase C (Homeostasis L0-L2)
- ✅ Test improvement: 33% fewer failures, 22% more passing
- ✅ L1 relevance scoring: Filters irrelevant facts correctly

### Phase D (L2/L3 + Lifecycle)
- 🎯 All 17 tests pass
- 🎯 L2 latency < 3s
- 🎯 L3 disagreement < 10%
- 🎯 Memory consolidation extracts to CLAUDE.md

### Phase E (Skills + L4)
- 🎯 3+ skills auto-generated from real patterns
- 🎯 L4 provides cross-session insights

### Phase F (Production)
- 🎯 All 9 learning scenarios pass end-to-end
- 🎯 Production deployment successful

---

## Risk Management

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| L2 LLM calls too slow | Medium | High | Use fast local model, 60s cache, async calls |
| CLAUDE.md grows too large | Medium | Medium | Implement Tier 3 (RAG) if exceeds 50KB |
| Skill quality varies | High | Medium | Human review loop, skill validation tests |
| Memory decay too aggressive | Low | Low | Tune decay formula (0.95 → 0.97?) |

### Product Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Users don't trust auto-extracted knowledge | Medium | High | Show sources, confidence scores, allow editing |
| Skills don't generalize across users | High | Medium | Focus on project-specific patterns, not universal truths |
| Homeostasis guidance too frequent | Low | Low | Tune dimension thresholds, add cooldown periods |

---

## Dependencies

### External
- **Claude Code** — Session transcripts (JSONL format)
- **Ollama** — Local LLM for extraction and L2 assessment
- **Docker** — PostgreSQL, OTEL Collector
- **AI SDK v6** — LLM abstraction layer

### Internal (between phases)
- Phase C → Phase D: L0-L2 architecture, evaluation tests
- Phase D → Phase E: L2/L3 assessment, memory consolidation
- Phase E → Phase F: SKILL.md auto-generation, L4 analysis

---

## Team & Timeline

**Current velocity:** ~1 week per phase (Phases A-C completed in 4 weeks)

**Projected completion:**
- Phase D: Week 5
- Phase E: Weeks 6-7
- Phase F: Week 8

**Total:** 8 weeks (2 months) to production-ready v1

---

## Learning Scenarios Coverage

| Scenario | Phase B | Phase C | Phase D | Phase E | Phase F |
|----------|---------|---------|---------|---------|---------|
| L1: No knowledge (extract + retrieve) | ✅ | ✅ | ✅ | ✅ | ✅ |
| L2: Conflicting knowledge (dedup) | ✅ | ✅ | ✅ | ✅ | ✅ |
| L3: Pattern recognition (3+ occurrences) | ⏸️ | ⏸️ | ⏸️ | 🎯 | ✅ |
| L4: Knowledge application (use in response) | ✅ | ✅ | 🎯 | ✅ | ✅ |
| L5: Uncertainty handling (confidence) | ⏸️ | ⏸️ | 🎯 | ✅ | ✅ |
| L6: Knowledge staleness (decay) | ⏸️ | ⏸️ | 🎯 | ✅ | ✅ |
| L7: Idle agent (heartbeat) | ⏸️ | ⏸️ | ⏸️ | 🎯 | ✅ |
| L8: Cross-session patterns (L4) | ⏸️ | ⏸️ | ⏸️ | 🎯 | ✅ |
| L9: Proactive suggestions (SKILL.md) | ⏸️ | ⏸️ | ⏸️ | 🎯 | ✅ |

**Legend:**
- ✅ Fully implemented
- 🎯 Planned in this phase
- ⏸️ Deferred to later phase

---

## Recommendations

### For Phase D
1. **Start with Task 1 (L1 fixes)** — Low-hanging fruit, unblocks evaluation tests
2. **Prototype L2 with mocked LLM** — Validate prompt design before implementing real calls
3. **Set L3 disagreement alerts** — Monitor early to detect if L1/L2 thresholds need tuning
4. **Manual test consolidation** — Watch CLAUDE.md grow over time, verify quality

### For Phase E
1. **User feedback on skills** — Don't auto-generate blindly, involve users in validation
2. **Start simple with L4** — Basic pattern detection before advanced cross-session analysis
3. **Heartbeat cost analysis** — Periodic LLM calls add up, consider free local models only

### For Phase F
1. **Dogfood the dashboard** — Use it internally first, iterate on UX
2. **Load testing** — Ensure L2/L3 don't cause performance issues under load
3. **Documentation first** — Users can't benefit if they don't understand how it works

---

*Last Updated: 2026-02-12*
*Current Phase: Phase C complete, Phase D planned*
