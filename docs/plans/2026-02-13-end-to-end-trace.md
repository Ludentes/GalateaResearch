# End-to-End Message Trace: Golden Reference

**Date:** 2026-02-13
**Status:** In Progress (Layers 1-2 complete, Layer 3 pending)
**Purpose:** Trace every byte through the Galatea system for three scenarios, exposing all gaps and creating a testable golden reference for future subsystem validation.

---

## Approach

Three layers of increasing ambition, building from what works:

1. **Layer 1: Developer Chat Session (Web UI)** — the path that partially works today
2. **Layer 2: Session-End Extraction** — the learning path (partially working)
3. **Layer 3: PM Asks Status on Discord** — aspirational, highest gap density

**Context:** Real project data from this machine:
- **Umka** (32 sessions) — content-heavy, documents, Payload CMS, some game dev
- **ContextForge** (92 sessions) — dev-heavy, context window management, Claude Code provider, zone-based caching
- **Galatea** (37 sessions) — meta (agent developing itself)
- **Expo** (planned) — will add as test data later

---

## Layer 1: Developer Chat Session (Web UI)

### Scenario

You're working on ContextForge. You open the Galatea web UI, start a session, and type:

> "The MQTT client in ContextForge needs to persist across hot reloads. I tried reconnecting on HMR but it creates duplicate subscriptions."

### T0: User types message in browser

```
Browser (React 19 + TanStack Router)
  -> app/routes/chat/$sessionId.tsx
  -> POST /api/chat {sessionId, message, provider: "ollama", model: "glm-4.7-flash"}
```

**Status:** STUB — route exists, UI component not implemented. API endpoint works if called directly (curl, API client).

### T1: Server receives request

`server/routes/api/chat.post.ts`

```
readBody(event) -> {sessionId, message, provider, model}
  -> getModel(provider, model)  // resolves to Ollama LanguageModel
  -> streamMessageLogic(sessionId, message, model, modelName)
```

**Status:** WORKING

### T2: Store user message

`chat.logic.ts:114-122`

```sql
INSERT INTO messages (session_id, role, content, created_at)
VALUES ($sessionId, 'user', 'The MQTT client...', now())
```

**Status:** WORKING

### T3: Build conversation history

`chat.logic.ts:124-126`

```sql
SELECT * FROM messages WHERE session_id = $sessionId ORDER BY created_at
```

Converts to `[{role: "user", content: "..."}, {role: "assistant", content: "..."}]`

**Status:** WORKING

**Gap:** No sliding window or token budget. History grows unbounded until it hits context window. No summarization, no warning.

### T4: Assemble context

`chat.logic.ts:128` -> `context-assembler.ts`

```typescript
assembleContext({
  storePath: "data/memory/entries.jsonl",
  tokenBudget: 4000,
  agentContext: {               // <- THIS IS THE GAP
    recentMessages: [...],
    currentTask: ???,           // Where does task assignment live?
    knowledgeFacts: ???,        // Not retrieved from store yet
    sessionMeta: { startedAt, messageCount }
  }
})
```

**What should happen:**
1. Load entries from `entries.jsonl`
2. Filter relevant entries (by entities in message: "MQTT", "ContextForge", "HMR")
3. Run homeostasis assessment on `agentContext`
4. Build system prompt: identity + rules + guidance + knowledge

**What actually happens:** `assembleContext()` exists but `agentContext` is not populated. `chat.logic.ts` line 128 has `// TODO: implement fact retrieval in Phase D`. The homeostasis engine is never called.

**Expected system prompt (golden state):**

```
## Identity
You are Galatea, a developer agent...

## Constraints
- Never push directly to main
- Use pnpm in all projects

## Self-Regulation
knowledge_sufficiency: HEALTHY (3 relevant facts about MQTT found)
progress_momentum: HEALTHY (first message, no stuck pattern)

## Relevant Knowledge
- [fact, 0.95] MQTT client in Umka uses persistent connections across page reloads
- [procedure, 0.85] When MQTT reconnects, unsubscribe all topics first, then resubscribe
- [decision, 0.90] ContextForge uses MQTT for real-time sync between nodes
```

### T5: LLM Call

`chat.logic.ts:130-140`

```typescript
streamText({
  model,                    // Ollama glm-4.7-flash via ai-sdk-ollama
  system: assembledPrompt,  // From T4
  messages: history,        // From T3
})
```

**At the provider level:**

```
ai-sdk-ollama -> POST http://localhost:11434/api/chat
{
  model: "glm-4.7-flash:latest",
  messages: [
    {role: "system", content: "...assembled prompt..."},
    ...history,
    {role: "user", content: "The MQTT client in ContextForge needs to persist..."}
  ],
  stream: true
}
```

**Failure modes at T5:**

| Failure | Current Handling | Should Be |
|---------|-----------------|-----------|
| Ollama not running | Unhandled — HTTP connection refused, 500 to client | Graceful error: "LLM provider unavailable" |
| Model not pulled | Ollama returns 404 | Detect and suggest `ollama pull` |
| Context too long | Ollama silently truncates | Track token count, warn before sending |
| Ollama OOM | Process killed mid-stream | Detect broken stream, return partial + error |
| OpenRouter rate limit (429) | AI SDK retries 2x (same params) | Our retry with temp escalation doesn't apply here (chat, not extraction) |
| OpenRouter out of credits | 402 Payment Required | Graceful fallback to Ollama? Or just error? |
| Token budget at 99% | No tracking | Track cumulative usage, warn user |

**Token accounting (not implemented):**

```
System prompt:     ~800 tokens (identity + rules)
Knowledge section: ~400 tokens (3 relevant entries)
Guidance section:  ~100 tokens (homeostasis, if imbalanced)
History:           ~2000 tokens (growing per message)
User message:      ~50 tokens
---
Total input:       ~3350 tokens
Model context:     8192 tokens (glm-4.7-flash)
Remaining:         ~4800 tokens for output
```

**Gap:** No token budget management.

### T6: Stream arrives

`chat.logic.ts:140-155`

```
Response streams back chunk by chunk:
  "The duplicate subscription issue..." -> client
  "...is a common HMR problem..." -> client
  "...you should unsubscribe in the..." -> client

onFinish callback:
  -> INSERT INTO messages (session_id, role, content, token_usage)
  -> tokenUsage: {promptTokens: 3350, completionTokens: 280, totalTokens: 3630}
```

**Status:** WORKING — token counting and storage implemented.

### T7: Response delivered to client

```
server -> text/event-stream -> browser
  -> app/routes/chat/$sessionId.tsx renders streamed chunks
```

**Status:** STUB — API returns the stream correctly, but UI component doesn't consume it. Works with curl or API client.

### T8: Post-response side effects (should happen, doesn't)

The user just told us something valuable about MQTT + HMR. Learning should kick in:

```
After response stored:
  1. OTEL event emitted: {type: "message.sent", sessionId, tokens, latency}
     Status: NOT IMPLEMENTED in chat path (only in Claude Code hooks)

  2. Signal classification (real-time):
     "MQTT client needs to persist across hot reloads" -> HIGH signal
     "duplicate subscriptions" -> HIGH signal (problem pattern)
     Status: NOT IMPLEMENTED (only runs in batch extraction)

  3. Homeostasis cache invalidation:
     knowledge_sufficiency should re-assess (new domain info arrived)
     Status: NOT IMPLEMENTED (homeostasis not in chat loop)
```

### Layer 1 Summary

| Step | Component | Status | Gap |
|------|-----------|--------|-----|
| T0 | Web UI | STUB | No chat component |
| T1 | Route handler | WORKING | -- |
| T2 | Message storage | WORKING | -- |
| T3 | History retrieval | WORKING | No sliding window / token budget |
| T4 | Context assembly | PARTIAL | Facts not retrieved, homeostasis not called |
| T5 | LLM call | WORKING | No error handling, no token budget check |
| T6 | Stream + store | WORKING | -- |
| T7 | Client delivery | STUB | No streaming UI |
| T8 | Side effects | MISSING | No real-time OTEL, no signal detection, no cache invalidation |

**Big gap from Layer 1:** The chat path and the learning path are completely disconnected. Chat works as a dumb pipe (message -> LLM -> response). Nothing learned is used, nothing said triggers learning. The homeostasis engine and knowledge store exist but aren't plugged in.

---

## Layer 2: Session-End Extraction

### Scenario

The ContextForge session from Layer 1 ends. You close Claude Code (Ctrl+C or `/exit`). The extraction pipeline should fire and learn from the conversation.

### E0: Session end detected

```
Claude Code CLI detects session end
  -> Fires SessionEnd hook (from ~/.claude/settings.json)
  -> Passes JSON on stdin: {session_id, transcript_path, cwd}
```

Hook registration (`~/.claude/settings.json`):
```json
"SessionEnd": [{
  "hooks": [{
    "type": "command",
    "command": "pnpm tsx /home/newub/w/galatea/scripts/hooks/auto-extract.ts",
    "timeout": 120,
    "async": true
  }]
}]
```

**Status:** WORKING

**Gap:** `async: true` means Claude Code doesn't wait for extraction to finish. Good for UX, but we never know if extraction failed unless we check logs.

### E1: Hook script starts

`scripts/hooks/auto-extract.ts`

```
Read stdin → parse JSON {session_id, transcript_path, cwd}
  -> Resolve paths:
     storePath:  <cwd>/data/memory/entries.jsonl
     statePath:  <cwd>/data/memory/extraction-state.json
  -> Dynamic import: extraction-state, extraction-pipeline, ollama provider
  -> Create model: glm-4.7-flash:latest @ localhost:11434
```

**Status:** WORKING

**Gap:** Dynamic imports from `cwd` — if cwd is wrong (e.g., hook fires from a non-Galatea project), imports fail silently and `process.exit(0)` swallows the error.

**Gap:** Hardcoded to Ollama. Per provider strategy (see domain model), extraction should stay on Ollama (small task), but there's no fallback if Ollama is down.

### E2: Extraction state check

`server/memory/extraction-state.ts`

```
isSessionExtracted(session_id, statePath)
  -> Read data/memory/extraction-state.json
  -> Check if session_id key exists
  -> If yes: log "Skip", exit(0)
  -> If no: continue
```

**Status:** WORKING

**Gap:** Double-checking — the extraction pipeline (E6) also checks `source` field in existing entries. Redundant but harmless.

### E3: Transcript reading

`server/memory/transcript-reader.ts`

```
readTranscript("~/.claude/projects/-home-newub-w-galatea/<session>.jsonl")

JSONL format (actual Claude Code transcript):
  {"type":"user","message":{"role":"user","content":"The MQTT client needs to persist..."}}
  {"type":"assistant","message":{"role":"assistant","content":[
    {"type":"text","text":"..."},
    {"type":"tool_use","name":"Edit","input":{...}}
  ]}}
  {"type":"file-history-snapshot","messageId":"...","snapshot":{...}}

Processing:
  1. Parse each line as JSON, skip malformed
  2. Filter: keep type=user|assistant, skip isMeta
  3. Deduplicate streaming assistant messages by id+contentSignature
  4. Filter internal noise: "[Request interrupted", "<command-name>", etc.
  5. Parse content blocks: text → content, tool_use → toolUse[], tool_result → toolResults[]

Output: TranscriptTurn[] with {role, content, toolUse?, toolResults?}
```

**Status:** WORKING — handles real Claude Code transcripts including tool use.

**Gap:** Tool results truncated to 200 chars (may lose important context like file contents the user discussed).

### E4: Signal classification

`server/memory/signal-classifier.ts`

```
filterSignalTurns(allTurns)

Rules (all regex-based, user turns only):
  NOISE:
    - All assistant turns (always noise)
    - Empty content
    - Greetings (< 30 chars): /^(hi|hello|hey|...)/i
    - Confirmations: /^(ok|okay|got it|...)\s*[.!?]?$/i

  SIGNAL (in order):
    - Preference: /\b(i (prefer|like|want|...))\b/i → 0.8
    - Correction: /\b(no,?\s+(that's|it's|...))\b/i → 0.8
    - Policy: /\b(we (always|never|...))\b/i → 0.8
    - Decision: /\b(let's (go with|use|...))\b/i → 0.8
    - Long message (> 50 chars): "factual" → 0.5

Typical: 205 turns → ~100 signal (~49% pass rate)
```

**Status:** WORKING — but coarse.

**Gap:** English-only patterns. Some sessions have Russian content (Alina's Umka feedback).

**Gap:** Assistant turns always classified as noise — but assistant responses contain decisions, explanations, procedures that should be extracted.

**Gap:** No tool-use awareness. A user saying "yes" after a tool result is confirmation (noise), but "no, use the other file" is a correction (signal). Current classifier can't distinguish.

### E5: Chunking + context windowing

`server/memory/extraction-pipeline.ts`

```
For the ~100 signal turns:

1. Chunk into groups of 20 signal turns
2. For each chunk, addSurroundingContext():
   - For each signal turn, include:
     - Previous assistant turn (if assistant role)
     - The signal turn itself
     - Next assistant turn (if assistant role)
   - Deduplicate (turns may overlap between chunks)

Result: ~5 chunks of ~40-60 turns each (signal + context)
```

**Status:** WORKING

**Gap:** No overlap between chunks. If user says "as I mentioned earlier..." in chunk 3, the LLM has no context from chunks 1-2.

**Gap:** Fixed chunk size. A chunk of 20 short turns and 20 long tool-use turns have very different token counts.

### E6: LLM extraction (per chunk)

`server/memory/knowledge-extractor.ts`

```
For each chunk:

extractWithRetry(turns, model, source, temperatures=[0, 0.3, 0.7])

  Attempt 1 (temp=0):
    formatTranscript(turns):
      [USER]: The MQTT client in ContextForge needs to persist...
        [TOOL: Edit — {"file_path":"src/mqtt.ts"...}]
      [ASSISTANT]: I've updated the MQTT client to persist...

    generateObject({
      model: ollama/glm-4.7-flash,
      schema: ExtractionSchema,   // Zod → JSON schema
      prompt: EXTRACTION_PROMPT + transcript,
      temperature: 0,
      maxRetries: 0,              // No AI SDK retries
    })

    -> Ollama converts schema to EBNF grammar internally
    -> POST http://localhost:11434/api/chat {model, messages, format: "json"}

  On failure → Attempt 2 (temp=0.3) → Attempt 3 (temp=0.7)
  All fail → return [] (chunk skipped, logged as chunksFailed)

Output per chunk: KnowledgeEntry[]
  {id, type, content, confidence, evidence, entities, about?, source, extractedAt}
```

**Status:** WORKING — temperature escalation handles flaky Ollama responses.

**Failure modes at E6:**

| Failure | Current Handling | Should Be |
|---------|-----------------|-----------|
| Ollama not running | 3 retries fail, chunk skipped | Log + alert, queue for later |
| Schema validation fails | Temperature escalation may fix | Good enough |
| Model context exceeded | Ollama silently truncates | Track token count per chunk |
| OOM on large chunk | Process killed | Catch, reduce chunk size, retry |
| All chunks fail | `chunksFailed` counter in stats | Alert, don't mark session as extracted |

**Actual performance:** ~18s per chunk × 5 chunks = ~90s for extraction LLM calls.

### E7: Deduplication

`server/memory/knowledge-store.ts`

```
deduplicateEntries(allExtracted, existingEntries, ollamaBaseUrl)

Three-path strategy:

Path 1: Jaccard text similarity
  tokenize: lowercase, split on \W+, filter words < 3 chars, remove 62 stop words
  isDuplicate if:
    - contentSim >= 0.5, OR
    - evidenceSim >= 0.5 AND contentSim >= 0.2

Path 2: Evidence match (part of Path 1)
  Same evidence quote → likely same knowledge

Path 3: Embedding cosine similarity
  batchEmbed(allTexts, ollamaBaseUrl)
    -> POST http://localhost:11434/api/embed
       {model: "nomic-embed-text:latest", input: [...]}
    -> Returns number[][] embeddings
  cosineSimilarity > 0.85 → duplicate

Graceful degradation: If Ollama unavailable for embeddings → skip Path 3, use only Jaccard.

Result: {unique: KnowledgeEntry[], duplicatesSkipped: number}
```

**Status:** WORKING

**Gap:** Recomputes ALL embeddings on every extraction. With 279 entries, this is 279+N embedding calls per extraction. Will degrade as store grows.

**Gap:** Threshold 0.85 not empirically tuned. May be too aggressive (merging distinct knowledge) or too lax (keeping near-duplicates).

### E8: Storage

`server/memory/knowledge-store.ts`

```
appendEntries(newEntries, "data/memory/entries.jsonl")
  -> mkdir -p data/memory/
  -> appendFile: one JSON line per entry

Example entry stored:
{
  "id": "27fe2ea4-...",
  "type": "fact",
  "content": "MQTT client in ContextForge uses persistent connections",
  "confidence": 0.95,
  "evidence": "User said: The MQTT client needs to persist across hot reloads",
  "entities": ["MQTT", "ContextForge", "HMR"],
  "about": {"entity": "contextforge", "type": "project"},
  "source": "session:17b9e56e-...",
  "extractedAt": "2026-02-13T09:00:00.000Z"
}
```

**Status:** WORKING

**Current state:** 279 entries, 129 KB

**Gap:** No file locking. If two sessions end simultaneously, concurrent `appendFile` calls may interleave JSON lines.

### E9: Markdown rendering

`server/memory/knowledge-store.ts`

```
renderMarkdown([...existing, ...newEntries], "data/memory/knowledge.md")

Groups by type → sections:
  preference → "Preferences"
  fact → "Facts"
  rule → "Rules"
  procedure → "Procedures"
  correction → "Corrections"
  decision → "Decisions"

Sorts by confidence (descending) within each section.
Filters out superseded entries.

Output:
  # Galatea Agent Memory
  ## Facts
  - MQTT client in ContextForge uses persistent connections
  - Stakeholder (Alina) lacks understanding of IoT concepts
  ...
  ## Preferences
  - User prefers pnpm over npm
  ...
```

**Status:** WORKING but lossy.

**Gap:** Only renders `content` — drops `confidence`, `evidence`, `entities`, `about`, `source`. Human-readable but loses all metadata needed for smart retrieval.

### E10: Extraction state update

`server/memory/extraction-state.ts`

```
markSessionExtracted(session_id, {
  entriesCount: result.entries.length,
  transcriptPath,
  statePath,
})

Writes to data/memory/extraction-state.json:
{
  "sessions": {
    "17b9e56e-...": {
      "extractedAt": "2026-02-13T08:56:29.220Z",
      "entriesCount": 20,
      "transcriptPath": "~/.claude/projects/.../<session>.jsonl"
    }
  }
}
```

**Status:** WORKING

### E11: Post-extraction effects (should happen, doesn't)

After extraction completes, the knowledge store has grown. What should happen:

```
1. CLAUDE.md regeneration:
   Knowledge.md updated (E9), but it's not referenced from CLAUDE.md.
   The agent's project-level CLAUDE.md should include learned knowledge.
   Status: NOT IMPLEMENTED

2. Context assembler cache invalidation:
   Next chat session should see new entries.
   assembleContext() reads entries.jsonl fresh each call → no caching issue.
   Status: WORKS BY ACCIDENT (no caching = always fresh, but also always slow)

3. Homeostasis state update:
   knowledge_sufficiency should improve (more facts available).
   Next assessDimensions() call will see new entries if retrievedFacts is populated.
   Status: PARTIALLY WORKS (depends on chat.logic.ts passing retrievedFacts,
   which it doesn't yet)

4. OTEL event:
   Should emit: {type: "extraction.complete", entriesCount: 20, sessionId}
   Status: NOT IMPLEMENTED (extraction is pre-OTEL)

5. Cross-project knowledge propagation:
   If ContextForge session extracted MQTT knowledge with about.entity="contextforge",
   next Umka session should be able to retrieve it via domain-tagged queries.
   Status: NOT IMPLEMENTED (no cross-project retrieval)
```

### Layer 2 Summary

| Step | Component | Status | Gap |
|------|-----------|--------|-----|
| E0 | Session end detection | WORKING | async — no failure feedback |
| E1 | Hook script | WORKING | Hardcoded Ollama, no fallback |
| E2 | State check | WORKING | Redundant double-check |
| E3 | Transcript reading | WORKING | Tool results truncated to 200 chars |
| E4 | Signal classification | WORKING | English-only, ignores assistant turns |
| E5 | Chunking | WORKING | No overlap, fixed size |
| E6 | LLM extraction | WORKING | No token budget, chunk failure silenced |
| E7 | Deduplication | WORKING | Embedding recompute every time, untuned threshold |
| E8 | Storage | WORKING | No file locking |
| E9 | Markdown rendering | WORKING | Lossy — drops metadata |
| E10 | State tracking | WORKING | -- |
| E11 | Post-extraction effects | MISSING | No CLAUDE.md regen, no OTEL, no cross-project |

**Big gap from Layer 2:** The pipeline works end-to-end mechanically (session ends → knowledge stored), but the **feedback loop is broken**. Extracted knowledge goes into `entries.jsonl` and `knowledge.md` but doesn't flow back into the agent's behavior. The context assembler reads entries but `chat.logic.ts` doesn't pass `retrievedFacts` to homeostasis, so `knowledge_sufficiency` can never improve. CLAUDE.md doesn't reference the knowledge store. The learning happens but nothing changes.

**Timing:** Full extraction takes ~102 seconds (1m 42s) for a 205-turn session. Bottleneck is LLM calls (~90s). Signal classification and storage are negligible.

---

## Layer 3: PM Asks Status on Discord

*(Pending — future session)*

### Scenario

While the agent is in the middle of a ContextForge task (from Layer 1), PM posts in Discord: "How are you doing?"

### Steps to trace:
- Discord message ingestion (webhook? bot? MCP?)
- Interruption model (agent is already "doing something" — what does that mean?)
- Thread/concurrency model
- Context assembly for a status response (different from dev chat)
- Memory state lookup (what is agent working on?)
- Response generation + delivery back to Discord
- What "agent is busy" means architecturally

---

## Cross-Cutting Concerns (All Layers)

*(To be filled as we trace each layer)*

### API Keys & Provider Configuration
- Where are secrets stored?
- How does provider fallback work?
- What happens on key rotation?

### Jailbreak Protection
- Where in the pipeline would safety filters go?
- Pre-LLM? Post-LLM? Both?
- Reference: PSYCHOLOGICAL_ARCHITECTURE.md "Deferred: Safety Systems"

### Observability
- What OTEL events should each step emit?
- What Langfuse traces should we see?
- How do we know if something failed silently?

### Multi-Project Context
- Agent works across Umka, ContextForge, Galatea
- How does `about` field + entity tagging handle cross-project knowledge?
- When user says "MQTT" — which project's MQTT knowledge is relevant?
