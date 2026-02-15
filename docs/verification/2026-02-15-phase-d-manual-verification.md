# Phase D: Manual Verification Guide

**Date:** 2026-02-15
**Branch:** `feature/phase-d-close-the-loop`
**Prerequisites:** Docker Compose up, Ollama running with `glm-4.7-flash`

## Pre-flight

```bash
# Verify services are up
docker compose ps                          # PostgreSQL should be running
curl -s http://localhost:11434/api/tags     # Ollama should respond with model list

# Verify DB has data
pnpm exec tsx -e "
  import { db } from './server/db';
  import { sessions, preprompts } from './server/db/schema';
  (async () => {
    const s = await db.select().from(sessions);
    const p = await db.select().from(preprompts);
    console.log('Sessions:', s.length, '| Preprompts:', p.length);
    process.exit(0);
  })();
"

# Verify knowledge store has entries
wc -l data/memory/entries.jsonl            # Should be ~279 entries
```

---

## 1. Fact Retrieval — Does entity matching actually work?

**What we're verifying:** `retrieveRelevantFacts()` finds the right entries from the knowledge store based on message content.

### 1a. Happy path — entity match

```bash
pnpm exec tsx -e "
  import { retrieveRelevantFacts } from './server/memory/fact-retrieval';
  (async () => {
    const result = await retrieveRelevantFacts(
      'What do we know about Alina and her preferences?'
    );
    console.log('Matched entities:', result.matchedEntities);
    console.log('Entries found:', result.entries.length);
    for (const e of result.entries) {
      console.log('  -', e.type, '|', e.content.slice(0, 80));
      console.log('    about:', JSON.stringify(e.about));
    }
    process.exit(0);
  })();
"
```

**Expected:** Entries with `about.entity === "alina"` appear. `matchedEntities` includes `"alina"`.

### 1b. Happy path — project entity match

```bash
pnpm exec tsx -e "
  import { retrieveRelevantFacts } from './server/memory/fact-retrieval';
  (async () => {
    const result = await retrieveRelevantFacts(
      'How does the MQTT client work in Umka?'
    );
    console.log('Matched entities:', result.matchedEntities);
    console.log('Entries found:', result.entries.length);
    for (const e of result.entries.slice(0, 5)) {
      console.log('  -', e.type, '|', e.content.slice(0, 80));
    }
    process.exit(0);
  })();
"
```

**Expected:** Entries about umka/mqtt appear. Check that they're sorted by confidence descending.

### 1c. Negative case — unrelated query returns nothing

```bash
pnpm exec tsx -e "
  import { retrieveRelevantFacts } from './server/memory/fact-retrieval';
  (async () => {
    const result = await retrieveRelevantFacts('Hello, how are you today?');
    console.log('Matched entities:', result.matchedEntities);
    console.log('Entries found:', result.entries.length);
    process.exit(0);
  })();
"
```

**Expected:** 0 entries, 0 matched entities. Generic greetings should not pull in random knowledge.

### 1d. Edge case — superseded entries excluded

```bash
pnpm exec tsx -e "
  import { retrieveRelevantFacts } from './server/memory/fact-retrieval';
  import { readEntries } from './server/memory/knowledge-store';
  (async () => {
    const all = await readEntries('data/memory/entries.jsonl');
    const superseded = all.filter(e => e.supersededBy);
    console.log('Total entries:', all.length);
    console.log('Superseded entries:', superseded.length);

    if (superseded.length > 0) {
      const word = superseded[0].content.split(' ').find(w => w.length > 4);
      const result = await retrieveRelevantFacts(word || 'test');
      const found = result.entries.filter(e => e.supersededBy);
      console.log('Superseded in results:', found.length, '(should be 0)');
    }
    process.exit(0);
  })();
"
```

**Expected:** No superseded entries in retrieval results.

---

## 2. Feedback Loop — Does chat now use retrieved knowledge?

**What we're verifying:** The feedback loop is closed: knowledge extracted from past sessions flows into the context of new chats.

### 2a. Round-trip: chat with knowledge vs without

```bash
pnpm exec tsx -e "
  import { assembleContext } from './server/memory/context-assembler';
  import { retrieveRelevantFacts } from './server/memory/fact-retrieval';
  (async () => {
    const message = 'Tell me about Alina and her role';
    const facts = await retrieveRelevantFacts(message);

    console.log('--- WITH retrieval ---');
    console.log('Retrieved facts:', facts.entries.length);

    const ctx = await assembleContext({
      agentContext: {
        sessionId: 'manual-test',
        currentMessage: message,
        messageHistory: [],
        retrievedFacts: facts.entries,
      },
    });

    console.log('Knowledge entries in context:', ctx.metadata.knowledgeEntries);
    console.log('Homeostasis guidance included:', ctx.metadata.homeostasisGuidanceIncluded);
    console.log('System prompt length:', ctx.systemPrompt.length);
    console.log();
    console.log('--- System prompt preview (first 500 chars) ---');
    console.log(ctx.systemPrompt.slice(0, 500));
    process.exit(0);
  })();
"
```

**Expected:** `retrievedFacts` populates, `knowledgeEntries > 0`, system prompt contains LEARNED KNOWLEDGE section.

### 2b. Verify the actual chat.logic.ts path calls retrieval

```bash
# This sends a real message through the full chat path.
# Create a test session, send a message, inspect the response.
pnpm exec tsx -e "
  import { createSessionLogic, sendMessageLogic } from './server/functions/chat.logic';
  import { ollama } from 'ai-sdk-ollama';
  import { db } from './server/db';
  import { messages, sessions } from './server/db/schema';
  import { eq } from 'drizzle-orm';
  (async () => {
    const session = await createSessionLogic('Phase D verification');
    console.log('Session ID:', session.id);

    const result = await sendMessageLogic(
      session.id,
      'What do you know about stakeholder Alina and how she prefers to receive updates?',
      ollama('glm-4.7-flash'),
      'glm-4.7-flash',
    );

    console.log();
    console.log('--- LLM Response ---');
    console.log(result.text);
    console.log();
    console.log('If the response mentions Alina-specific details from the knowledge store,');
    console.log('the feedback loop is working. If it gives a generic response, it is not.');

    // Cleanup
    await db.delete(messages).where(eq(messages.sessionId, session.id));
    await db.delete(sessions).where(eq(sessions.id, session.id));
    process.exit(0);
  })();
" 2>&1
```

**Expected:** The LLM response should reference details about Alina that exist in the knowledge store (e.g., "lacks understanding of technical IoT concepts", communication preferences). If the response is generic ("I don't have information about Alina"), the retrieval is not working.

**This is the single most important test.** It validates the entire feedback loop: extract → store → retrieve → use.

---

## 3. tick() Function — Does the agent decide correctly?

**What we're verifying:** The 4-stage pipeline (self-model → homeostasis → channel scan → action) produces correct decisions.

### 3a. tick with pending message — should respond

```bash
pnpm exec tsx -e "
  import { updateAgentState } from './server/agent/agent-state';
  import { tick } from './server/agent/tick';
  import { rmSync } from 'fs';
  (async () => {
    const statePath = '/tmp/galatea-tick-test-state.json';
    const storePath = 'data/memory/entries.jsonl';

    await updateAgentState({
      lastActivity: new Date().toISOString(),
      pendingMessages: [{
        from: 'alina',
        channel: 'discord',
        content: 'Привет! Как дела с проектом? Что нового?',
        receivedAt: new Date(Date.now() - 5 * 60 * 60_000).toISOString(),
      }],
      activeTask: { project: 'umka', topic: 'MQTT persistence' },
    }, statePath);

    const result = await tick('manual', { statePath, storePath });

    console.log('=== TICK RESULT ===');
    console.log('Action:', result.action);
    console.log('Target:', JSON.stringify(result.action_target));
    console.log('Pending messages:', result.pendingMessages.length);
    console.log();
    console.log('--- Homeostasis ---');
    for (const [dim, state] of Object.entries(result.homeostasis)) {
      if (typeof state === 'string' && ['LOW','HEALTHY','HIGH'].includes(state)) {
        console.log('  ', dim, ':', state);
      }
    }
    console.log();
    console.log('--- Self Model ---');
    console.log('Available providers:', result.selfModel.availableProviders);
    console.log();
    console.log('--- Retrieved Facts ---');
    console.log('Total:', result.retrievedFacts.length);
    const alinaFacts = result.retrievedFacts.filter(f => f.about?.entity === 'alina');
    console.log('About Alina:', alinaFacts.length);
    for (const f of alinaFacts.slice(0, 3)) {
      console.log('  -', f.content.slice(0, 80));
    }
    console.log();
    console.log('--- Response ---');
    console.log(result.response?.text?.slice(0, 300));

    rmSync(statePath, { force: true });
    process.exit(0);
  })();
" 2>&1
```

**Verify all of these:**
- [ ] `action` is `"respond"`
- [ ] `action_target` is `{ channel: "discord", to: "alina" }`
- [ ] `communication_health` is `"LOW"` (message is 5 hours old, threshold is 4h)
- [ ] `selfModel.availableProviders` includes `"ollama"`
- [ ] `retrievedFacts` contains Alina-related entries
- [ ] `response.text` is non-empty and contextually relevant

### 3b. tick with no messages — should idle

```bash
pnpm exec tsx -e "
  import { updateAgentState } from './server/agent/agent-state';
  import { tick } from './server/agent/tick';
  import { rmSync } from 'fs';
  (async () => {
    const statePath = '/tmp/galatea-tick-idle-test.json';

    await updateAgentState({
      lastActivity: new Date().toISOString(),
      pendingMessages: [],
      activeTask: { project: 'umka', topic: 'MQTT' },
    }, statePath);

    const result = await tick('manual', { statePath, storePath: 'data/memory/entries.jsonl' });

    console.log('Action:', result.action, '(should be idle)');
    console.log('Pending:', result.pendingMessages.length, '(should be 0)');
    console.log('productive_engagement:', result.homeostasis.productive_engagement, '(should be HEALTHY)');

    rmSync(statePath, { force: true });
    process.exit(0);
  })();
"
```

**Expected:** `action: "idle"`, `productive_engagement: "HEALTHY"`, no response generated.

### 3c. tick API endpoint

```bash
# Start the dev server first (in another terminal): pnpm dev
# Then call the endpoint:
curl -s -X POST http://localhost:3000/api/agent/tick | python3 -m json.tool | head -30
```

**Expected:** JSON response with `action`, `homeostasis`, `selfModel`, etc. Will likely be `"idle"` unless you've set up agent state with pending messages.

---

## 4. Supersession — Does marking entries as superseded work?

### 4a. Supersede an entry and verify it's excluded

```bash
pnpm exec tsx -e "
  import { appendEntries, readEntries, supersedeEntry } from './server/memory/knowledge-store';
  import { retrieveRelevantFacts } from './server/memory/fact-retrieval';
  import { rmSync } from 'fs';
  (async () => {
    const testStore = '/tmp/galatea-supersede-test.jsonl';

    await appendEntries([
      {
        id: 'old-mqtt',
        type: 'fact',
        content: 'MQTT uses QoS 0 (fire and forget)',
        confidence: 0.8,
        entities: ['mqtt'],
        source: 'test',
        extractedAt: new Date().toISOString(),
      },
      {
        id: 'new-mqtt',
        type: 'fact',
        content: 'MQTT uses QoS 1 (at least once delivery)',
        confidence: 0.95,
        entities: ['mqtt'],
        source: 'test',
        extractedAt: new Date().toISOString(),
      },
    ], testStore);

    console.log('--- Before supersession ---');
    let entries = await readEntries(testStore);
    let active = entries.filter(e => !e.supersededBy);
    console.log('Total:', entries.length, '| Active:', active.length);

    await supersedeEntry('old-mqtt', 'new-mqtt', testStore);

    console.log();
    console.log('--- After supersession ---');
    entries = await readEntries(testStore);
    active = entries.filter(e => !e.supersededBy);
    console.log('Total:', entries.length, '| Active:', active.length);
    const old = entries.find(e => e.id === 'old-mqtt');
    console.log('old-mqtt.supersededBy:', old?.supersededBy, '(should be new-mqtt)');

    const result = await retrieveRelevantFacts('MQTT QoS', testStore);
    console.log();
    console.log('--- Retrieval after supersession ---');
    console.log('Retrieved:', result.entries.length);
    for (const e of result.entries) {
      console.log('  -', e.id, '|', e.content);
    }
    const hasOld = result.entries.some(e => e.id === 'old-mqtt');
    console.log('Old entry in results:', hasOld, '(should be false)');

    rmSync(testStore, { force: true });
    process.exit(0);
  })();
"
```

**Expected:** After supersession, `old-mqtt` has `supersededBy: "new-mqtt"`. Retrieval returns only `new-mqtt`.

---

## 5. Dead Artifact Cleanup — Is knowledge.md no longer generated?

### 5a. Run extraction and verify no knowledge.md

```bash
pnpm exec tsx -e "
  import { existsSync, rmSync, mkdirSync } from 'fs';
  import { ollama } from 'ai-sdk-ollama';
  import { runExtraction } from './server/memory/extraction-pipeline';
  (async () => {
    const testDir = '/tmp/galatea-extraction-test';
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
    mkdirSync(testDir, { recursive: true });

    const storePath = testDir + '/entries.jsonl';
    const mdPath = testDir + '/knowledge.md';

    await runExtraction({
      transcriptPath: 'server/memory/__tests__/fixtures/sample-session.jsonl',
      model: ollama('glm-4.7-flash'),
      storePath,
    });

    console.log('entries.jsonl exists:', existsSync(storePath));
    console.log('knowledge.md exists:', existsSync(mdPath), '(should be false)');

    rmSync(testDir, { recursive: true });
    process.exit(0);
  })();
" 2>&1
```

**Expected:** `entries.jsonl` exists, `knowledge.md` does NOT exist.

### 5b. Verify ExtractionOptions no longer accepts mdPath

```bash
# This should fail TypeScript compilation:
pnpm exec tsx -e "
  import type { ExtractionOptions } from './server/memory/extraction-pipeline';
  const opts: ExtractionOptions = {
    transcriptPath: 'x',
    model: {} as any,
    storePath: 'x',
    mdPath: 'x',
  };
" 2>&1 | grep -i "mdPath\|error" || echo "No error (unexpected)"
```

**Expected:** TypeScript error about `mdPath` not existing on `ExtractionOptions`.

---

## 6. End-to-End Round Trip

The ultimate test: extract knowledge, then verify it shows up in a chat.

```bash
pnpm exec tsx -e "
  import { existsSync, rmSync, mkdirSync } from 'fs';
  import { ollama } from 'ai-sdk-ollama';
  import { runExtraction } from './server/memory/extraction-pipeline';
  import { readEntries } from './server/memory/knowledge-store';
  import { retrieveRelevantFacts } from './server/memory/fact-retrieval';
  import { assembleContext } from './server/memory/context-assembler';
  (async () => {
    const testDir = '/tmp/galatea-e2e-test';
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
    mkdirSync(testDir, { recursive: true });
    const storePath = testDir + '/entries.jsonl';

    // Step 1: Extract knowledge from a transcript
    console.log('=== Step 1: Extract ===');
    const extraction = await runExtraction({
      transcriptPath: 'server/memory/__tests__/fixtures/sample-session.jsonl',
      model: ollama('glm-4.7-flash'),
      storePath,
    });
    console.log('Extracted:', extraction.entries.length, 'entries');
    for (const e of extraction.entries.slice(0, 3)) {
      console.log('  -', e.type, ':', e.content.slice(0, 60));
    }

    // Step 2: Retrieve facts for a related query
    console.log();
    console.log('=== Step 2: Retrieve ===');
    const message = 'I want to set up pnpm for this project';
    const facts = await retrieveRelevantFacts(message, storePath);
    console.log('Query:', message);
    console.log('Retrieved:', facts.entries.length, 'facts');
    console.log('Matched entities:', facts.matchedEntities);
    for (const e of facts.entries) {
      console.log('  -', e.content.slice(0, 80));
    }

    // Step 3: Assemble context with those facts
    console.log();
    console.log('=== Step 3: Assemble Context ===');
    const ctx = await assembleContext({
      storePath,
      agentContext: {
        sessionId: 'e2e-test',
        currentMessage: message,
        messageHistory: [],
        retrievedFacts: facts.entries,
      },
    });
    console.log('System prompt length:', ctx.systemPrompt.length);
    console.log('Knowledge entries:', ctx.metadata.knowledgeEntries);
    console.log('Homeostasis guidance:', ctx.metadata.homeostasisGuidanceIncluded);

    const hasLearnedKnowledge = ctx.systemPrompt.includes('LEARNED KNOWLEDGE');
    console.log('Has LEARNED KNOWLEDGE section:', hasLearnedKnowledge);

    if (facts.entries.length > 0) {
      const firstFact = facts.entries[0].content.slice(0, 30);
      const factInPrompt = ctx.systemPrompt.includes(firstFact);
      console.log('First retrieved fact in prompt:', factInPrompt);
    }

    rmSync(testDir, { recursive: true });
    process.exit(0);
  })();
" 2>&1
```

**Verify the round trip:**
- [ ] Step 1 extracts entries from the transcript (e.g., "User prefers pnpm")
- [ ] Step 2 retrieves those same entries when asking about pnpm
- [ ] Step 3 includes them in the system prompt under LEARNED KNOWLEDGE
- [ ] The extracted knowledge is **actually in the prompt** that would be sent to the LLM

If all three steps connect, the feedback loop is proven end-to-end.

---

## Summary Checklist

| # | Test | Pass? |
|---|------|-------|
| 1a | Fact retrieval — entity match (Alina) | |
| 1b | Fact retrieval — project match (Umka/MQTT) | |
| 1c | Fact retrieval — unrelated query returns empty | |
| 1d | Fact retrieval — superseded entries excluded | |
| 2a | Context assembler uses retrieved facts | |
| 2b | **Full chat path returns knowledge-aware response** | |
| 3a | tick() responds to pending message, correct homeostasis | |
| 3b | tick() idles when no messages | |
| 3c | tick() API endpoint reachable | |
| 4a | Supersession marks entry, excludes from retrieval | |
| 5a | Extraction no longer generates knowledge.md | |
| 5b | mdPath removed from ExtractionOptions type | |
| 6 | **End-to-end: extract → retrieve → assemble** | |
