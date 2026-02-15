# Phase D: Manual Verification Guide

**Date:** 2026-02-15
**Branch:** `feature/phase-d-close-the-loop`
**Prerequisites:** Docker Compose up, Ollama running with `glm-4.7-flash`

## Pre-flight

```bash
# Verify services are up
docker compose ps                          # PostgreSQL should be running
curl -s http://localhost:11434/api/tags     # Ollama should respond with model list

# Verify knowledge store has entries
wc -l data/memory/entries.jsonl            # Should be ~279 entries
```

---

## 1. Fact Retrieval — Does entity matching actually work?

**What we're verifying:** `retrieveRelevantFacts()` finds the right entries from the knowledge store based on message content.

### 1a. Happy path — entity match

```bash
pnpm exec tsx scripts/verify/1a-entity-match.ts
```

**Expected:** Entries mentioning Alina appear. `matchedEntities` includes `"alina"`.

### 1b. Happy path — project entity match

```bash
pnpm exec tsx scripts/verify/1b-project-match.ts
```

**Expected:** Entries about umka/mqtt appear. Check that they're sorted by confidence descending.

### 1c. Negative case — unrelated query returns nothing

```bash
pnpm exec tsx scripts/verify/1c-unrelated-query.ts
```

**Expected:** 0 entries, 0 matched entities. Generic greetings should not pull in random knowledge.

### 1d. Edge case — superseded entries excluded

```bash
pnpm exec tsx scripts/verify/1d-superseded-excluded.ts
```

**Expected:** No superseded entries in retrieval results.

---

## 2. Feedback Loop — Does chat now use retrieved knowledge?

**What we're verifying:** The feedback loop is closed: knowledge extracted from past sessions flows into the context of new chats.

### 2a. Round-trip: chat with knowledge vs without

```bash
pnpm exec tsx scripts/verify/2a-context-with-facts.ts
```

**Expected:** `retrievedFacts` populates, `knowledgeEntries > 0`, system prompt contains LEARNED KNOWLEDGE section.

### 2b. Verify the actual chat.logic.ts path calls retrieval

```bash
pnpm exec tsx scripts/verify/2b-full-chat-path.ts
```

**Expected:** The LLM response should reference details about Alina that exist in the knowledge store (e.g., "lacks understanding of technical IoT concepts", communication preferences). If the response is generic ("I don't have information about Alina"), the retrieval is not working.

**This is the single most important test.** It validates the entire feedback loop: extract → store → retrieve → use.

---

## 3. tick() Function — Does the agent decide correctly?

**What we're verifying:** The 4-stage pipeline (self-model → homeostasis → channel scan → action) produces correct decisions.

### 3a. tick with pending message — should respond

```bash
pnpm exec tsx scripts/verify/3a-tick-respond.ts
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
pnpm exec tsx scripts/verify/3b-tick-idle.ts
```

**Expected:** `action: "idle"`, `productive_engagement: "HEALTHY"`, no response generated.

### 3c. tick API endpoint

```bash
# Start the dev server first (in another terminal): pnpm dev
# Then call the endpoint:
curl -s -X POST http://localhost:13000/api/agent/tick | python3 -m json.tool | head -30
```

**Expected:** JSON response with `action`, `homeostasis`, `selfModel`, etc. Will likely be `"idle"` unless you've set up agent state with pending messages.

---

## 4. Supersession — Does marking entries as superseded work?

### 4a. Supersede an entry and verify it's excluded

```bash
pnpm exec tsx scripts/verify/4a-supersession.ts
```

**Expected:** After supersession, `old-mqtt` has `supersededBy: "new-mqtt"`. Retrieval returns only `new-mqtt`.

---

## 5. Dead Artifact Cleanup — Is knowledge.md no longer generated?

### 5a. Run extraction and verify no knowledge.md

```bash
pnpm exec tsx scripts/verify/5a-no-knowledge-md.ts
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
pnpm exec tsx scripts/verify/6-e2e-round-trip.ts
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
