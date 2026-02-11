# Shadow Learning Experiment: Extraction Quality Validation

**Date**: 2026-02-11
**Purpose**: Validate whether LLM extraction from developer session transcripts produces useful knowledge
**Status**: Designed, ready to run
**Depends on**: [v2 Architecture Design](2026-02-11-galatea-v2-architecture-design.md)

---

## The Question

The entire Galatea v2 architecture rests on one hypothesis: **we can extract useful knowledge by watching someone work.** If extraction quality is poor (as Graphiti proved at 18-21%), nothing else matters.

This experiment tests extraction quality against real Claude Code session transcripts before building any infrastructure.

---

## System Architecture Decisions (from brainstorm)

### Form Factor: Hybrid (Option C)

Galatea is a **lightweight observation service** + **Claude Code agent with skills**.

- **Observation service** (runs continuously): OTEL collector, event batcher, heartbeat timer, event store
- **Claude Code agent** (runs on demand): extraction, skill generation, homeostasis evaluation — guided by skills

The service decides **when** to act (timer + dimension evaluation). The agent decides **what** to do (guided by skills).

### Heartbeat

Lives in the observation service as a **scheduler**. Fires periodically regardless of events — silence is data ("no commits for 2 hours" is a signal). Evaluates lightweight homeostasis dimensions; triggers Claude Code agent when imbalance detected.

### Shadow Learning Staging

| Stage | What | Validates |
|-------|------|-----------|
| **1 (this experiment)** | Manual: skill reads transcripts, extracts knowledge | Can we extract useful patterns at all? |
| 2 | Live: OTEL service collects events, periodic extraction (Ollama) | Can we do this continuously and cheaply? |
| 3 | Smart: service handles 80% (pattern match + local LLM), escalates 20% to Claude Code | Can we do this efficiently at scale? |

---

## Knowledge Source Analysis

### What the Reference Scenarios Require

Every piece of knowledge from `REFERENCE_SCENARIOS.md` mapped to its observation source:

#### Claude Code Transcripts (~35% of learnable knowledge)

| Knowledge | Type | Scenario | How Detected |
|-----------|------|----------|--------------|
| Prefer Clerk over JWT | Preference | Phase 1 | User tried JWT, failed, switched in same session |
| Use expo-router for navigation | Fact | Phase 1 | CLI: `npx expo install expo-router` |
| Use NativeWind for styling | Fact | Phase 1 | CLI: `npx expo install nativewind` |
| NativeWind animation workaround | Procedure | Phase 1 | Debugging session, workaround found |
| Project setup sequence | Procedure | L1 | 3 repeated CLI sequences across sessions |
| Auth implementation workflow | Procedure | Phase 1 | Observed multi-step process |
| Uses pnpm, not npm | Preference | L1/Scenario 7 | CLI commands consistently use pnpm |
| TypeScript strict mode | Fact | Phase 1 | tsconfig.json edits |
| Functional components preference | Preference | Scenario 8b | Code patterns in file writes |
| "Never use Realm" | Hard rule | Scenario 2 | User explicit statement in chat |
| Code patterns (null checks) | Procedure | Phase 1 | Patterns in code written |

#### GitLab/GitHub (~13%)

| Knowledge | Type | Scenario | How Detected |
|-----------|------|----------|--------------|
| PR review checklist | Procedure | Phase 1 | Reviewer comments on MRs |
| Cross-agent null check pattern | Pattern | Scenario 5 | 3 PRs with same feedback |
| Procedure success/failure | Feedback | Scenario 13 | MR outcomes (merged/rejected) |
| Code review standards | Procedure | Trace 5 | MR comment patterns |

#### Discord/Slack (~16%)

| Knowledge | Type | Scenario | How Detected |
|-----------|------|----------|--------------|
| Team channel (#mobile-dev) | Fact | Phase 1 | Message destination observation |
| PM task assignments | Task input | Scenario 4.1 | @-mentions with task descriptions |
| "Use expo-notifications" | Decision | Trace 6 | PM response to agent question |
| Status update timing | Procedure | Trace 4, 7 | Communication frequency patterns |
| Communication style | Preference | Trace 7 | Message tone/length patterns |

#### Browser (~13%)

| Knowledge | Type | Scenario | How Detected |
|-----------|------|----------|--------------|
| Liquid Glass design language | Fact | Scenario 3 | Article read before implementation |
| Performance caveats | Preference | Scenario 3 | User annotation after reading |
| Technology updates | Temporal fact | Scenario 4.4 | Release notes/changelog visits |
| Research-to-implementation correlation | Pattern | L5 | Browser search → code implementation |

#### Linux/System (~10%)

| Knowledge | Type | Scenario | How Detected |
|-----------|------|----------|--------------|
| Work hours pattern | Pattern | L7 | Login/activity timestamps |
| Focus time preferences | Pattern | L7 | No-disturb/deep-work detection |
| Application usage patterns | Pattern | Implied | Window focus tracking |

#### HomeAssistant/Frigate (~6%)

| Knowledge | Type | Scenario | How Detected |
|-----------|------|----------|--------------|
| Home routines | Pattern | L7 | Occupancy/motion sensors |
| Presence detection | Context | Implied | Away/home status |

#### Manual/Emergent (~16%, not learnable)

| Knowledge | Type | Source |
|-----------|------|--------|
| Initial persona config | Config | Setup wizard (Trace 1) |
| Hard blocks (no push main, no secrets) | Rules | Manual entry |
| Safety boundaries | Rules | Manual configuration |
| Seek work when idle | Emergent | Homeostasis dimension tension |
| Stop over-research | Emergent | Homeostasis dimension tension |

### Extensibility Insight

The extraction logic is **source-independent**. OTEL normalizes all events to the same format. If extraction works on Claude Code transcripts, the same approach adapts to GitLab webhooks, Discord messages, and browser events — the prompt changes, the pipeline doesn't.

**Claude Code alone validates the hard part** (does LLM extraction produce useful results?). Extensibility to other sources is an engineering question, not a research question.

### Coverage by stage

| Stage | Sources | Knowledge coverage |
|-------|---------|-------------------|
| 1 (experiment) | Claude Code transcripts | ~35% |
| 2 (+ GitLab + Discord) | + webhooks | ~64% |
| 3 (+ Browser + Linux) | + extensions | ~87% |
| 4 (+ HomeAssistant) | + MQTT bridge | ~94% |
| Manual/emergent | Setup wizard + homeostasis | 100% |

---

## Experiment Design

### Input

5-10 recent Claude Code session transcripts from this project (`~/.claude/projects/`). These are JSONL files with conversation turns: user messages, assistant responses, tool calls (file reads, writes, edits, bash commands), tool results.

### Extraction Pipeline

```
Step 1: GATHER    Read transcript, extract conversation turns
Step 2: FILTER    Drop noise (greetings, tool output spam, failed retries)
Step 3: EXTRACT   LLM pass: identify preferences, facts, rules, procedures
Step 4: CORRELATE Compare across sessions: one-off or pattern?
Step 5: DEDUPLICATE Check against existing CLAUDE.md and skills
Step 6: WRITE     Append to CLAUDE.md or generate SKILL.md
```

### What We're Looking For

| Signal | Example | Output |
|--------|---------|--------|
| Explicit preference | "Use pnpm, not npm" | CLAUDE.md entry |
| Implicit preference | User repeatedly chooses TypeScript | CLAUDE.md entry |
| Correction | "No, don't use default exports" | CLAUDE.md rule |
| Project fact | Tool calls show Drizzle, Clerk, Vercel | CLAUDE.md entry |
| Repeated procedure | Same CLI sequence across 3 sessions | SKILL.md file |
| Tool/tech choice | User always picks Tailwind when given options | CLAUDE.md preference |
| Failed attempt → pivot | Tried X, failed, switched to Y | CLAUDE.md preference with reasoning |

### Extraction Prompt (the hard part)

The prompt asks Claude to read a session transcript chunk and return structured output:

```
- type: preference | fact | rule | procedure | correction
- content: what was learned
- confidence: 0.0-1.0
- evidence: what in the transcript supports this
- entities: technologies/tools/patterns mentioned
```

### Evaluation Criteria

| Metric | Target | How Measured |
|--------|--------|--------------|
| Precision | >70% | Of extracted items, how many are actually correct? |
| Recall | >50% | Of things a human would notice, how many were found? |
| Usefulness | >60% | Of correct items, how many would actually help an agent? |
| Noise ratio | <30% | How many extracted items are obvious/useless? |

### Success/Failure Criteria

**Success** (proceed to build): Precision >70%, usefulness >60%. The extraction finds real, actionable knowledge that would make an agent better.

**Partial success** (iterate on prompts): Precision 50-70%. The approach works but prompts need refinement. Iterate before building infrastructure.

**Failure** (rethink approach): Precision <50%. LLM extraction from transcripts doesn't produce useful knowledge. Need to reconsider — maybe explicit user input (dialogue/rituals) is the primary learning path, not passive observation.

### Known Challenges

1. **Transcript size**: Sessions can be 100K+ tokens. Need to chunk or summarize before extraction — can't feed entire transcripts into one prompt.
2. **Noise ratio**: 90%+ of a session is code generation and tool output. Learnable moments are sparse signals in noisy data.
3. **Deduplication**: "Uses pnpm" found in 5 sessions shouldn't create 5 entries. Need to match against existing knowledge.
4. **Implicit vs explicit**: Explicit preferences ("I prefer X") are easy. Implicit patterns (user always does X but never says so) are harder.
5. **Cross-session correlation**: Detecting that the same procedure happened across 3 sessions requires either intermediate storage or feeding multiple sessions together.

### Experiment Procedure

1. List available transcripts, pick 5-10 recent ones with varied activity
2. For each transcript:
   a. Estimate size, chunk if needed
   b. Run extraction prompt
   c. Collect structured output
3. Manually evaluate each extracted item (correct? useful? noise?)
4. Calculate precision, recall, usefulness scores
5. Compare extracted items against what a human would identify
6. Document findings and decide: proceed, iterate, or rethink

---

## Open Questions Resolved by This Design

| Question | Resolution |
|----------|-----------|
| Q2: Claude Code relationship | Galatea is a training system that produces SKILL.md/CLAUDE.md for Claude Code agents |
| Q3: Emergence vs explicit | Homeostasis provides emergent behavior; extraction pipeline is explicit (both needed) |
| Q4: Multi-agent coordination | Leverage Agent Teams; Galatea trains agents, doesn't coordinate them |
| Q6: Company context scaling | Memory tiers (CLAUDE.md → files → RAG/Mem0); tier transitions by fact count |
| Gap 1: Shadow learning | Hybrid: observation service (collection) + Claude Code agent (extraction) |
| Gap 2: Heartbeat | Lives in observation service as scheduler; fires even during silence |
| Gap 5: Skill auto-generation | Part of extraction pipeline: 3+ repeated procedures → SKILL.md |

### Still Open

| Question | Status |
|----------|--------|
| Q5: Persona marketplace | Deferred — validate demand first |
| Q7: Safety & boundaries | Deferred — before production; may be homeostasis dimension |
| Gap 3: Memory overflow | Tier transitions designed but not yet tested |
| Gap 4: Temporal validity | Convention designed (`valid_until` in SKILL.md metadata) but not yet tested |

---

*Experiment designed 2026-02-11. Run against real transcripts before building any infrastructure.*
