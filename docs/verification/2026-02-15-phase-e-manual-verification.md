# Phase E: Manual Verification Guide

**Date:** 2026-02-15
**Branch:** `feature/phase-e-launch-observe` (worktree: `.worktrees/phase-e`)
**Test count:** 199 unit tests (31 files, ~8s), 6 integration tests (3 files, ~80s, require Ollama)
**Prerequisites:** Docker Compose up, Ollama running with `glm-4.7-flash`, `pnpm install` done

---

## Pre-flight

```bash
# Verify services are up
docker compose ps                          # PostgreSQL should be running
curl -s http://localhost:11434/api/tags     # Ollama should respond with model list

# Verify knowledge store has entries
wc -l data/memory/entries.jsonl            # Should be ~279 entries

# Run unit tests (fast, no Ollama needed)
pnpm vitest run --exclude='**/integration/**' --reporter=verbose 2>&1 | tail -5
# Expected: 199 tests, 0 failures, ~8s

# Run integration tests (requires Ollama, ~2 min)
pnpm vitest run server/__tests__/integration/ server/engine/__tests__/integration/ server/functions/__tests__/integration/ --reporter=verbose 2>&1 | tail -10
# Expected: 33+ tests, 0 failures (consolidation test may be flaky — see note)
```

**Note on flaky consolidation test:** The `layer2-extraction > high-confidence entries consolidated to CLAUDE.md` test depends on earlier extraction tests producing entries. If Ollama times out during extraction, the store may be empty or entries may be superseded, causing this test to fail. This is a test isolation issue, not a code bug. The unit tests (`server/memory/__tests__/consolidation.test.ts`) validate the logic independently.

---

## Part 1: Targeted Feature Verification

These verify each Phase E feature individually, progressing from simple to complex.

### 1.1 Porter Stemming in Stuck Detection

**What we're verifying:** `stemTokenize()` normalizes words so "auth" and "authentication" share overlap, and `assessProgressMomentumL1()` uses stem-frequency counting instead of pairwise Jaccard.

```bash
pnpm vitest run server/engine/__tests__/stemmer.test.ts --reporter=verbose
```

**Expected:** All stemmer tests pass:
- "stems and fix to same root" — "fix" and "fixing" share stems
- "stems authentication and auth" — "auth" appears as prefix match via short-stem heuristic
- "handles empty and short words" — no crash on edge cases

```bash
pnpm vitest run server/engine/__tests__/homeostasis-engine.test.ts --reporter=verbose
```

**Expected:** All 15 tests pass, including:
- "detects LOW progress_momentum when stuck (repeated messages)" — stems appearing in 2+ messages triggers stuck detection
- "detects HEALTHY progress_momentum when topics vary" — different topics don't false-positive

### 1.2 Knowledge Sufficiency with Stemming

**What we're verifying:** `assessKnowledgeSufficiencyL1()` uses stemmed keywords for matching message topics against retrieved facts.

```bash
pnpm vitest run server/engine/__tests__/homeostasis-evaluation.test.ts --reporter=verbose
```

**Expected:** All 11 unit tests pass (L2 async tests moved to integration), including:
- S1: "detects HEALTHY when relevant auth facts available" — "authentication" in message matches "auth" in fact content
- S2: "detects LOW when user repeats similar questions" — repeated question stems detected
- "achieves stuck detection goal" — overall stuck detection works

### 1.3 OTEL Event Emission

**What we're verifying:** `emitEvent()` helper writes structured events to JSONL observation store. Both `sendMessageLogic()` and `streamMessageLogic()` emit events after response. `runExtraction()` emits event after extraction completes.

```bash
# Unit: event store reads/writes
pnpm vitest run server/observation/__tests__/ --reporter=verbose

# Integration: chat path emits event
pnpm vitest run server/__tests__/integration/layer1-chat.test.ts --reporter=verbose
# Check: "emits OTEL event after response delivered" passes

# Integration: extraction path emits event
pnpm vitest run server/__tests__/integration/layer2-extraction.test.ts --reporter=verbose
# Check: "OTEL event emitted on extraction completion" passes
```

**Expected:** Events contain:
- `type: "log"`, `source: "galatea-api"`
- `attributes["event.name"]` is `"chat.response_delivered"` or `"extraction.complete"`
- `id` and `timestamp` auto-generated

### 1.4 Real-Time Signal Classification

**What we're verifying:** `classifyTurn()` runs on every user message during `sendMessageLogic()` and returns classification in result.

```bash
pnpm vitest run server/__tests__/integration/layer1-chat.test.ts --reporter=verbose
# Check: "runs signal classification on the user's message in real-time" passes
```

**Expected:** Sending "I prefer using pnpm over npm for all projects" returns `signalClassification.type === "preference"`.

### 1.5 Powered-Down Mode

**What we're verifying:** When no LLM providers are available, `tick()` still processes pending messages with a template response instead of silently dropping them.

```bash
pnpm vitest run server/__tests__/integration/layer3-decisions.test.ts --reporter=verbose
# Check: "powered-down mode produces template response when no LLM available" passes
```

**Expected:**
- `action: "respond"` (not idle — message was processed)
- `response.template: true`
- `response.text` contains "unable to generate"
- Message removed from pending queue

### 1.6 CLAUDE.md Consolidation

**What we're verifying:** `findConsolidationCandidates()` identifies entries seen 3+ times with avg confidence >= 0.85. `consolidateToClaudeMd()` writes them to CLAUDE.md.

```bash
pnpm vitest run server/memory/__tests__/consolidation.test.ts --reporter=verbose
```

**Expected:** All 4 tests pass:
- Groups identical entries and promotes when >= 3 occurrences with high confidence
- Writes promoted entries to CLAUDE.md file
- Skips entries below occurrence threshold (only 2 occurrences)
- Skips entries below confidence threshold (avg < 0.85)

**Verify config-driven thresholds:**
```bash
grep -A2 "consolidation:" server/engine/config.yaml
# Expected:
#   min_occurrences: 3
#   min_avg_confidence: 0.85
```

### 1.7 Consolidation Wired into Extraction Pipeline

**What we're verifying:** After extraction stores new entries, `consolidateToClaudeMd()` runs automatically if `claudeMdPath` is configured.

Check the wiring in `server/memory/extraction-pipeline.ts`:
```bash
grep -A3 "consolidateToClaudeMd" server/memory/extraction-pipeline.ts
# Expected: consolidateToClaudeMd(storePath, claudeMdPath).catch((err) => console.warn(...))
```

### 1.8 Context Compression (Sliding Window)

**What we're verifying:** Long conversation histories are compressed to fit within token budget.

```bash
pnpm vitest run server/context/ --reporter=verbose
```

**Expected:** Sliding window tests pass:
- Keeps first message + newest messages within budget
- Token estimation uses configurable chars_per_token
- Empty history returns empty

### 1.9 Memory Decay

**What we're verifying:** Knowledge entries lose confidence over time when not retrieved, following Ebbinghaus-style decay curve.

```bash
pnpm vitest run server/memory/__tests__/decay.test.ts --reporter=verbose
```

**Expected:**
- Decay starts after `decay_start_days` (30) of no retrieval
- Formula: `confidence × decay_factor ^ days_since_last_retrieval`
- "rule" type entries are exempt from decay
- Entries below `archive_threshold` (0.3) are marked as archived

### 1.10 L2 Homeostasis Assessment

**What we're verifying:** Two dimensions (`certainty_alignment`, `knowledge_application`) use LLM assessment (Ollama) for richer evaluation beyond rule-based L1.

```bash
# L2 unit behavior (fast, no Ollama)
pnpm vitest run server/engine/__tests__/homeostasis-evaluation.test.ts -t "L2 needed" --reporter=verbose

# L2 integration (requires Ollama, ~80s)
pnpm vitest run server/engine/__tests__/integration/ --reporter=verbose
```

**Expected:**
- L2 assessment calls local Ollama model (integration tests)
- Falls back to HEALTHY if Ollama unavailable (unit tests: "defaults to HEALTHY without LLM")
- Cache TTL prevents redundant calls

### 1.11 Claude Code Provider (CLI Auth)

**What we're verifying:** Claude Code provider uses `claude --version` CLI check instead of requiring `ANTHROPIC_API_KEY`.

```bash
pnpm vitest run server/providers/ --exclude='**/integration/**' --reporter=verbose
```

**Expected:**
- No API key validation for Claude Code provider
- CLI health check detects installed + authenticated claude
- Error message references `claude login`
- OllamaQueue + fallback tests pass (semaphore, backpressure, circuit breaker)

### 1.12 Heartbeat Scheduler

**What we're verifying:** Periodic `tick("heartbeat")` fires at configured interval, with smart skip when idle.

```bash
pnpm vitest run server/agent/__tests__/heartbeat.test.ts --reporter=verbose
```

**Expected:**
- Heartbeat fires at `interval_ms` (30000)
- Skips when no pending messages and `skip_when_idle: true`
- Can be started and stopped cleanly

### 1.13 Agent Plumbing (Message Ingestion, Dispatcher, State)

**What we're verifying:** Messages can be queued via API, tick processes them, dispatcher routes responses by channel.

```bash
pnpm vitest run server/agent/ --reporter=verbose
```

**Expected:**
- Message ingestion adds to pending queue with metadata
- Dispatcher routes to correct channel handler (ui, discord, api)
- Activity log stores last 50 tick results
- Agent state persists across ticks

### 1.14 Discord Connector

**What we're verifying:** Discord bot listens for DMs and mentions, forwards to agent, dispatches responses back.

```bash
pnpm vitest run server/discord/ --reporter=verbose
```

**Expected:**
- Inbound: DMs and @mentions forwarded as pending messages with Discord metadata
- Outbound: Responses dispatched to correct channel
- Ignores own messages and other bots
- Graceful: no token = no bot, rest of system works

---

## Part 2: Phase D Regression (Reference Scenario Foundation)

These verify that all Phase D functionality still works correctly. Every test here maps to a capability needed by the Reference Scenarios.

### 2.1 Fact Retrieval

**Reference Scenario coverage:** Phase 1 shadow learning (semantic memories retrievable), Phase 4 Scenario 4.2 (memory retrieval for task execution), Scenario 4.5 (knowledge gap detection).

```bash
pnpm exec tsx scripts/verify/1a-entity-match.ts
```
**Expected:** Entries mentioning Alina appear. `matchedEntities` includes `"alina"`.

```bash
pnpm exec tsx scripts/verify/1b-project-match.ts
```
**Expected:** Entries about umka/mqtt appear, sorted by confidence descending.

```bash
pnpm exec tsx scripts/verify/1c-unrelated-query.ts
```
**Expected:** 0 entries, 0 matched entities. Generic greetings don't pull random knowledge.

```bash
pnpm exec tsx scripts/verify/1d-superseded-excluded.ts
```
**Expected:** No superseded entries in retrieval results.

**Scenario coverage check:**
- [x] Entity matching (Scenario 4.2: "Query: user profile screen expo" retrieves relevant facts)
- [x] Keyword matching (Scenario 4.5: "push notifications expo" → nothing → gap detected)
- [x] Superseded exclusion (Scenario 4.4: NativeWind 4.1 supersedes workaround)
- [x] Negative filtering (Scenario 14a: greetings return nothing)

### 2.2 Feedback Loop (The Critical Path)

**Reference Scenario coverage:** The entire value proposition — extracted knowledge flows into chat context.

```bash
pnpm exec tsx scripts/verify/2a-context-with-facts.ts
```
**Expected:** `retrievedFacts` populates, system prompt contains `LEARNED KNOWLEDGE` section.

```bash
pnpm exec tsx scripts/verify/2b-full-chat-path.ts
```
**Expected:** LLM response references Alina-specific details from knowledge store.

**This is the single most important test.** It validates:
- Scenario 7 (promotion): facts extracted from sessions appear in context
- Scenario 10 (token budget): LEARNED KNOWLEDGE section respects budget
- Scenario 12 (daily rituals): facts from past sessions inform responses

### 2.3 Tick Pipeline

**Reference Scenario coverage:** Trace 4 (agent receives task), Trace 5 (agent processes feedback), Trace 7 (idle agent).

```bash
pnpm exec tsx scripts/verify/3a-tick-respond.ts
```

**Verify all of these:**
- [ ] `action` is `"respond"`
- [ ] `action_target` is `{ channel: "discord", to: "alina" }`
- [ ] `communication_health` is `"LOW"` (message 5 hours old, threshold 4h)
- [ ] `selfModel.availableProviders` includes `"ollama"`
- [ ] `retrievedFacts` contains Alina-related entries
- [ ] `response.text` is non-empty and contextually relevant

**Scenario coverage check:**
- [x] Trace 4: Agent retrieves memories for task context
- [x] Trace 6: knowledge_sufficiency assessment (LOW when no facts match)
- [x] Homeostasis drives behavior (communication_health LOW → respond urgently)

```bash
pnpm exec tsx scripts/verify/3b-tick-idle.ts
```
**Expected:** `action: "idle"`, `productive_engagement: "HEALTHY"`, no response generated.
**Scenario coverage:** Trace 7 — idle agent state when no messages pending.

### 2.4 Supersession

**Reference Scenario coverage:** Scenario 4.4 (technology change), Memory Scenario 4 (procedural expiration).

```bash
pnpm exec tsx scripts/verify/4a-supersession.ts
```
**Expected:** After supersession, old entry has `supersededBy` field. Retrieval returns only new entry.

**Scenario coverage check:**
- [x] Scenario 4.4: NativeWind 4.1 supersedes workaround → old entry filtered
- [x] Memory Scenario 4: `valid_until` expiration triggers supersession
- [x] Memory Scenario 13: Procedure steps updated via supersession

### 2.5 Dead Artifact Cleanup

```bash
pnpm exec tsx scripts/verify/5a-no-knowledge-md.ts
```
**Expected:** `entries.jsonl` exists, `knowledge.md` does NOT exist.

### 2.6 End-to-End Round Trip

**Reference Scenario coverage:** The complete Phase 1 → Phase 4 chain — extract → store → retrieve → use.

```bash
pnpm exec tsx scripts/verify/6-e2e-round-trip.ts
```

**Verify the round trip:**
- [ ] Step 1 extracts entries from transcript (e.g., "User prefers pnpm")
- [ ] Step 2 retrieves those entries when asking about pnpm
- [ ] Step 3 includes them in system prompt under LEARNED KNOWLEDGE
- [ ] The knowledge is **actually in the prompt** sent to the LLM

---

## Part 3: Reference Scenario Walkthroughs

These map Phase E capabilities to the specific reference scenarios from `docs/REFERENCE_SCENARIOS.md`. Each scenario lists what we can verify now and what remains for future phases.

### 3.1 Phase 1: Shadow Learning (Scenarios 1-6)

**What Phase E enables:** Knowledge extraction from Claude Code transcripts, signal/noise filtering, deduplication.

**Manual verification:**

```bash
# 1. Extract knowledge from a real session transcript
pnpm exec tsx -e "
import { ollama } from 'ai-sdk-ollama'
import { runExtraction } from './server/memory/extraction-pipeline'

const result = await runExtraction({
  transcriptPath: 'server/memory/__tests__/fixtures/sample-session.jsonl',
  model: ollama('glm-4.7-flash'),
  storePath: '/tmp/galatea-scenario-test/entries.jsonl',
})
console.log('Turns processed:', result.stats.turnsProcessed)
console.log('Signal turns:', result.stats.signalTurns)
console.log('Noise turns:', result.stats.noiseTurns)
console.log('Entries extracted:', result.stats.entriesExtracted)
console.log()
for (const e of result.entries.slice(0, 5)) {
  console.log(\`[\${e.type}] (conf: \${e.confidence}) \${e.content.slice(0, 80)}\`)
}
process.exit(0)
"
```

**Check against Reference Scenarios:**
- [ ] **Scenario 1 (Learning from mistake):** If transcript contains "tried X, switched to Y", extracted entry captures the preference for Y
- [ ] **Scenario 14a (Greetings):** "Hi" turns filtered as noise (not extracted)
- [ ] **Scenario 14b (Questions):** Pure questions not extracted as facts
- [ ] **Scenario 15a (Negation):** "I don't use X" correctly preserved as negative preference
- [ ] **Scenario 15f (Reasoning):** "I prefer X because Y" preserves the reasoning

**What's NOT yet verifiable (future phases):**
- Episodic memory (we extract semantic facts, not full episodes)
- Procedural memory extraction (we extract facts/preferences/rules, not multi-step procedures)
- Clarifying questions (Trace 2: "What should I learn from this?")

### 3.2 Homeostasis Traces (Traces 1-8)

**What Phase E enables:** All 6 homeostasis dimensions assessed, with L1 rule-based and L2 LLM-based evaluation.

#### Trace 4: Agent Receives Task

```bash
# Simulate an agent with a task and pending message about it
pnpm exec tsx -e "
import { updateAgentState } from './server/agent/agent-state'
import { tick } from './server/agent/tick'
import { rmSync } from 'fs'

const statePath = '/tmp/galatea-trace4-state.json'
await updateAgentState({
  lastActivity: new Date().toISOString(),
  pendingMessages: [{
    from: 'pm',
    channel: 'discord',
    content: 'Implement user profile screen with edit functionality',
    receivedAt: new Date(Date.now() - 30_000).toISOString(),
  }],
  activeTask: { project: 'customer-app', topic: 'user profile screen' },
}, statePath)

const result = await tick('manual', { statePath })
console.log('Action:', result.action)
console.log('Homeostasis:')
for (const [dim, state] of Object.entries(result.homeostasis)) {
  if (['LOW','HEALTHY','HIGH'].includes(state as string)) {
    console.log('  ', dim, ':', state)
  }
}
console.log('Retrieved facts:', result.retrievedFacts.length)
console.log('Response preview:', result.response?.text?.slice(0, 200))
rmSync(statePath, { force: true })
process.exit(0)
"
```

**Check against Trace 4:**
- [ ] `productive_engagement: HEALTHY` (has assigned task)
- [ ] `knowledge_sufficiency` assessed (based on retrieved facts for "user profile screen")
- [ ] Retrieved facts include relevant entries from knowledge store
- [ ] Response text is contextually appropriate

#### Trace 6: Agent Encounters Unknown Situation

```bash
# Simulate a message about a topic with no knowledge in the store
pnpm exec tsx -e "
import { updateAgentState } from './server/agent/agent-state'
import { tick } from './server/agent/tick'
import { rmSync } from 'fs'

const statePath = '/tmp/galatea-trace6-state.json'
await updateAgentState({
  lastActivity: new Date().toISOString(),
  pendingMessages: [{
    from: 'dev-2',
    channel: 'discord',
    content: 'How do I implement push notifications in Expo?',
    receivedAt: new Date(Date.now() - 60_000).toISOString(),
  }],
  activeTask: { project: 'customer-app', topic: 'push notifications' },
}, statePath)

const result = await tick('manual', { statePath })
console.log('Action:', result.action)
console.log('knowledge_sufficiency:', result.homeostasis.knowledge_sufficiency)
console.log('Retrieved facts:', result.retrievedFacts.length)
console.log('Response preview:', result.response?.text?.slice(0, 200))
rmSync(statePath, { force: true })
process.exit(0)
"
```

**Check against Trace 6:**
- [ ] `knowledge_sufficiency: LOW` (no facts match "push notifications")
- [ ] Retrieved facts is 0 or very few
- [ ] Agent still responds (doesn't crash on knowledge gap)

#### Trace 7: Idle Agent

```bash
pnpm exec tsx scripts/verify/3b-tick-idle.ts
```

**Check against Trace 7:**
- [ ] `action: "idle"` — no messages to process
- [ ] `productive_engagement: HEALTHY` or `LOW` depending on active task state

#### Trace 8: Guardrail (Stuck Detection)

```bash
# Verify stuck detection works with repeated messages
pnpm vitest run server/engine/__tests__/homeostasis-engine.test.ts -t "stuck" --reporter=verbose
```

**Check against Trace 8:**
- [ ] Repeated messages about same topic trigger `progress_momentum: LOW`
- [ ] Different topics keep `progress_momentum: HEALTHY`
- [ ] Guidance: "Don't spin silently" included in context when stuck

### 3.3 Memory Lifecycle (Scenarios 7-15)

#### Scenario 7: Promotion (Episode → Fact)

**What Phase E covers:** Extraction creates facts with confidence scores. Consolidation promotes high-confidence repeated entries to CLAUDE.md (the stable knowledge layer).

```bash
# Verify promotion via consolidation
pnpm exec tsx -e "
import { appendEntries, readEntries } from './server/memory/knowledge-store'
import { findConsolidationCandidates, consolidateToClaudeMd } from './server/memory/consolidation'
import { readFileSync, rmSync, existsSync } from 'fs'

const storePath = '/tmp/galatea-scenario7/entries.jsonl'
const mdPath = '/tmp/galatea-scenario7/CLAUDE.md'

// Simulate 3 sessions observing same preference
await appendEntries([
  { id: crypto.randomUUID(), type: 'preference', content: 'Use pnpm for package management', confidence: 0.9, entities: [], source: 'session:day1', extractedAt: new Date().toISOString() },
  { id: crypto.randomUUID(), type: 'preference', content: 'Use pnpm for package management', confidence: 0.95, entities: [], source: 'session:day3', extractedAt: new Date().toISOString() },
  { id: crypto.randomUUID(), type: 'preference', content: 'Use pnpm for package management', confidence: 0.88, entities: [], source: 'session:day5', extractedAt: new Date().toISOString() },
  { id: crypto.randomUUID(), type: 'fact', content: 'One-off observation about debugging', confidence: 0.5, entities: [], source: 'session:day2', extractedAt: new Date().toISOString() },
], storePath)

const candidates = await findConsolidationCandidates(storePath)
console.log('Promotion candidates:', candidates.length)
console.log('Promoted content:', candidates.map(c => c.content))

const result = await consolidateToClaudeMd(storePath, mdPath)
console.log('Consolidated to CLAUDE.md:', result.consolidated, 'entries')

if (existsSync(mdPath)) {
  const md = readFileSync(mdPath, 'utf-8')
  console.log('CLAUDE.md contains pnpm:', md.includes('pnpm'))
  console.log('CLAUDE.md does NOT contain one-off:', !md.includes('debugging'))
}

rmSync('/tmp/galatea-scenario7', { recursive: true })
process.exit(0)
"
```

**Check against Scenario 7:**
- [ ] 3 observations of "pnpm" → promoted (candidate found)
- [ ] 1 observation of "debugging" → NOT promoted (below threshold)
- [ ] CLAUDE.md contains promoted content
- [ ] One-off fact excluded from CLAUDE.md

#### Scenario 9: Confidence Decay & Archival

```bash
pnpm vitest run server/memory/__tests__/decay.test.ts --reporter=verbose
```

**Check against Scenario 9:**
- [ ] Decay starts after 30 days of no retrieval
- [ ] Confidence decreases gradually (not suddenly)
- [ ] Hard rules (`type: "rule"`) never decay
- [ ] Entries below 0.3 confidence get archived

#### Scenario 10: Token Budget Overflow

```bash
# Verify context assembly respects token budget
pnpm exec tsx -e "
import { assembleContext } from './server/memory/context-assembler'
import { appendEntries } from './server/memory/knowledge-store'
import { rmSync } from 'fs'

const storePath = '/tmp/galatea-scenario10/entries.jsonl'

// Create 30 entries to force budget overflow
const entries = Array.from({ length: 30 }, (_, i) => ({
  id: crypto.randomUUID(),
  type: 'fact' as const,
  content: 'This is fact number ' + i + ' with enough content to consume tokens in the context window budget allocation system',
  confidence: 0.9 - (i * 0.01),
  entities: ['expo'],
  source: 'session:test',
  extractedAt: new Date().toISOString(),
}))
await appendEntries(entries, storePath)

const ctx = await assembleContext({
  storePath,
  agentContext: {
    sessionId: 'test',
    currentMessage: 'Tell me about expo',
    messageHistory: [],
    retrievedFacts: entries,
  },
})
console.log('System prompt length:', ctx.systemPrompt.length)
console.log('Knowledge entries included:', ctx.metadata.knowledgeEntries)
console.log('All 30 included?', ctx.metadata.knowledgeEntries === 30 ? 'YES (budget large enough)' : 'NO (budget enforced, only ' + ctx.metadata.knowledgeEntries + ' fit)')

rmSync('/tmp/galatea-scenario10', { recursive: true })
process.exit(0)
"
```

**Check against Scenario 10:**
- [ ] Not all 30 entries fit (budget enforced)
- [ ] Higher-confidence entries prioritized
- [ ] System prompt stays within configured budget

#### Scenario 14: What Should NOT Be Saved

```bash
pnpm vitest run server/memory/__tests__/signal-classifier.test.ts --reporter=verbose
```

**Check against Scenario 14:**
- [ ] **14a:** Greetings ("Hi", "Hello") classified as noise
- [ ] **14b:** Pure questions classified as noise (no facts to extract)
- [ ] **14d:** Assistant messages not used for extraction (only user turns)

#### Scenario 15: Extraction Edge Cases

```bash
pnpm vitest run server/memory/__tests__/knowledge-extractor.test.ts --reporter=verbose
```

**Check against Scenario 15:**
- [ ] **15a:** Negation preserved ("I don't use X" → negative preference)
- [ ] **15c:** Multi-entity lists handled
- [ ] **15f:** "Because" reasoning preserved in extracted content

### 3.4 OTEL Observability (Cross-Cutting)

**What Phase E enables:** Fire-and-forget event emission from chat and extraction pipelines.

```bash
# Verify events are written after a chat round-trip
pnpm exec tsx -e "
import { emitEvent } from './server/observation/emit'
import { readEvents } from './server/observation/event-store'
import { rmSync } from 'fs'

const storePath = '/tmp/galatea-otel-test/events.jsonl'

await emitEvent({
  type: 'log',
  source: 'galatea-api',
  body: 'chat.response_delivered',
  attributes: { 'event.name': 'chat.response_delivered', 'session.id': 'test-123', model: 'test' },
}, storePath)

await emitEvent({
  type: 'log',
  source: 'galatea-api',
  body: 'extraction.complete',
  attributes: { 'event.name': 'extraction.complete', 'entries.count': 5 },
}, storePath)

const events = await readEvents(storePath)
console.log('Events written:', events.length)
for (const e of events) {
  console.log('  -', e.attributes['event.name'], '| id:', e.id?.slice(0, 8), '| timestamp:', e.timestamp)
}

rmSync('/tmp/galatea-otel-test', { recursive: true })
process.exit(0)
"
```

**Expected:**
- [ ] 2 events written to JSONL store
- [ ] Each has auto-generated `id` (UUID) and `timestamp` (ISO)
- [ ] Attributes contain `event.name` for filtering

---

## Part 4: Full Scenario Walkthroughs

These are end-to-end walkthroughs that simulate real reference scenario sequences.

### 4.1 Complete Shadow Learning → Chat Loop

This simulates the complete Phase 1 → Phase 4 flow: a user works with Claude Code, knowledge is extracted, then a future chat benefits from it.

```bash
pnpm exec tsx scripts/verify/6-e2e-round-trip.ts
```

**Step-by-step verification:**
1. **Extract:** Session transcript processed, signal filtered, entries stored
2. **Retrieve:** Query about session topic finds relevant entries
3. **Assemble:** System prompt includes LEARNED KNOWLEDGE with those entries
4. **Use:** LLM would receive this enriched context (verified by prompt inspection)

### 4.2 Agent Tick → Respond → Emit Event

This simulates Trace 4 (agent receives task) + OTEL emission.

```bash
pnpm exec tsx scripts/verify/3a-tick-respond.ts
```

After running, verify:
- [ ] Agent responded to pending message
- [ ] Homeostasis assessed all 6 dimensions
- [ ] Facts relevant to sender retrieved
- [ ] Response is contextually appropriate

### 4.3 Powered-Down → Restore → Respond

This simulates the agent losing and regaining LLM connectivity.

```bash
pnpm vitest run server/__tests__/integration/layer3-decisions.test.ts -t "powered-down" --reporter=verbose
```

**Scenario flow:**
1. Message arrives, no LLM available → template response
2. LLM becomes available → normal response on next tick

### 4.4 Knowledge Decay Over Time

```bash
pnpm vitest run server/memory/__tests__/decay.test.ts --reporter=verbose
```

**Scenario flow (Scenario 9):**
1. Fact created with confidence 0.85
2. 30 days pass without retrieval → decay starts
3. 60 days → confidence drops to ~0.75
4. 90 days → confidence < 0.3 → archived
5. Hard rules unaffected throughout

---

## Summary Checklist

### Phase E New Features

| # | Test | Pass? |
|---|------|-------|
| 1.1 | Porter stemming in stuck detection | |
| 1.2 | Knowledge sufficiency with stemming | |
| 1.3 | OTEL event emission (chat + extraction) | |
| 1.4 | Real-time signal classification in chat | |
| 1.5 | Powered-down mode template response | |
| 1.6 | CLAUDE.md consolidation (unit tests) | |
| 1.7 | Consolidation wired into extraction pipeline | |
| 1.8 | Context compression (sliding window) | |
| 1.9 | Memory decay (Ebbinghaus-style) | |
| 1.10 | L2 homeostasis assessment (LLM-based) | |
| 1.11 | Claude Code provider (CLI auth) | |
| 1.12 | Heartbeat scheduler | |
| 1.13 | Agent plumbing (ingestion, dispatcher, state) | |
| 1.14 | Discord connector | |

### Phase D Regression

| # | Test | Pass? |
|---|------|-------|
| 2.1a | Fact retrieval — entity match (Alina) | |
| 2.1b | Fact retrieval — project match (Umka/MQTT) | |
| 2.1c | Fact retrieval — unrelated query returns empty | |
| 2.1d | Fact retrieval — superseded entries excluded | |
| 2.2a | Context assembler uses retrieved facts | |
| 2.2b | **Full chat path returns knowledge-aware response** | |
| 2.3a | tick() responds to pending message, correct homeostasis | |
| 2.3b | tick() idles when no messages | |
| 2.4 | Supersession marks entry, excludes from retrieval | |
| 2.5 | Extraction no longer generates knowledge.md | |
| 2.6 | **End-to-end: extract → retrieve → assemble** | |

### Reference Scenario Coverage

| Scenario | Covered? | Notes |
|----------|----------|-------|
| Phase 1: Shadow Learning | Partial | Semantic extraction works; episodic/procedural future phases |
| Trace 4: Agent receives task | Yes | Tick pipeline with fact retrieval + homeostasis |
| Trace 6: Unknown situation | Yes | knowledge_sufficiency LOW when no facts match |
| Trace 7: Idle agent | Yes | Idle tick with proper homeostasis |
| Trace 8: Stuck detection | Yes | Stem-frequency counting detects repetition |
| Scenario 7: Promotion | Partial | Consolidation to CLAUDE.md; full episode→fact chain future |
| Scenario 9: Confidence decay | Yes | Ebbinghaus-style with rule exemption |
| Scenario 10: Token budget | Yes | Context assembly respects budget, prioritizes by score |
| Scenario 14: What NOT to save | Yes | Signal classifier filters greetings/questions |
| Scenario 15: Edge cases | Partial | Negation, reasoning preserved; entity dedup future |
| Cross-cutting: OTEL | Yes | Events emitted from chat + extraction pipelines |
| Cross-cutting: Powered-down | Yes | Template response when no LLM available |

### What Remains for Phase F

- Full episodic memory (temporal sequences, not just facts)
- Procedural memory extraction (multi-step procedures)
- Clarifying questions (Trace 2: "What should I learn?")
- L3 meta-assessment (cross-dimension analysis)
- L4 strategic analysis
- LLM-based context summarization (beyond sliding window)
- Config editing in dashboard (currently read-only)
- Contradiction resolution (Scenario 6)
- Entity variant deduplication (Scenario 15b: Postgres/PostgreSQL)
- Cross-agent pattern detection (Scenario 5)
