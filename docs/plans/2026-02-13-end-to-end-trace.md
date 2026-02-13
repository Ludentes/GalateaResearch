# End-to-End Message Trace: Golden Reference

**Date:** 2026-02-13
**Status:** In Progress (Layers 1-3 complete, cross-cutting concerns pending)
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

### Scenario

You're mid-session on ContextForge (Layer 1 is active — the agent is chatting about MQTT persistence). Alina posts in the team's Discord channel:

> "Как дела? Что с проектом?" ("How are you doing? What's the project status?")

### D0: Discord message arrives

```
Discord server → Bot detects message mentioning/addressing agent
  -> discord.js messageCreate event
  -> Filter: is this directed at the agent? (mention, DM, or monitored channel)
```

**Status:** NOT IMPLEMENTED — no Discord bot exists.

**What exists:** `docs/observation-pipeline/04-discord-otel.md` describes a Discord **observer** bot that emits OTEL events about user's Discord activity. But that's observation-only (one-way). Layer 3 needs **bidirectional** Discord: receive messages → process → respond.

**Gap:** Existing Discord design only captures metadata ("user sent message in #channel"), explicitly avoids message content (privacy). Layer 3 requires reading message content directed at the agent.

**Architectural insight:** Discord interaction should be emergent, not hardcoded. LLMs already know how to use Discord — the challenge isn't the API but making the agent understand WHEN and WHY to communicate. See "Emergent Behavior" section below.

### D1: Message routing — who is this for?

```
Bot receives: "Как дела? Что с проектом?"
  -> Is this for the agent? Check:
     1. Direct @mention of bot
     2. DM to bot
     3. Message in a monitored "agent" channel
     4. Reply to an agent message thread
  -> If yes: route to Galatea ingestion
  -> If no: ignore (or observe-only via OTEL)
```

**Status:** NOT IMPLEMENTED

**Implementation approach:** MCP server providing Discord tools (read_messages, send_message, get_mentions). The agent uses these tools when homeostasis drives it to communicate — not as a hardcoded event handler.

### D2: What is the agent doing right now?

Before responding, the agent needs to know its own state. This is the **heartbeat model**.

```
Agent heartbeat (fires every tick):
  -> Read agent state from persistent store
  -> Assess homeostasis dimensions
  -> Check for pending messages across channels
  -> Decide: act on something, or sleep until next tick

Agent state (persistent, cross-channel):
  activeSession?: {
    id, project, startedAt, messageCount, currentTopic, channel
  }
  assignedTasks?: [{ id, description, status, assignedBy }]
  lastActivity: Date
  homeostasis: HomeostasisState
  pendingMessages: [{ channel, from, receivedAt }]
```

**Status:** NOT IMPLEMENTED

**Key insight:** The heartbeat solves the "agent is not a persistent entity" problem. Instead of request-response, the agent has a tick loop:
1. Wake up
2. Check state (what am I doing? what's changed?)
3. Assess homeostasis (any dimension under pressure?)
4. Act if needed (respond to message, ask for work, research a gap)
5. Sleep until next tick

The Discord response becomes emergent: the heartbeat notices `communication_health: LOW` (pending message from PM) and decides to respond — not because of a Discord event handler, but because homeostasis pressure drives it.

### D3: Concurrency — can the agent do two things?

```
Concurrent state:
  Channel 1 (Web UI): Active chat session about MQTT (Layer 1)
  Channel 2 (Discord): PM asking for status (Layer 3)
```

**With heartbeat model:** Not a concurrency problem. The heartbeat is the single decision point. Each tick, the agent looks at all channels and decides what to act on. The web chat session is state in memory, not a running process.

**Status:** NOT IMPLEMENTED — but heartbeat model makes the design simpler than concurrent event handlers.

### D4: Language and persona

```
Incoming: "Как дела? Что с проектом?"
From: Alina (PM, Umka project)
```

**Approach:** Do NOT hardcode language detection. The agent's user model (knowledge store, `about: {entity: "alina", type: "user"}`) should contain language preferences if they've been learned. If not, leave it to the LLM's judgment — it can detect Russian and respond appropriately. If the response language is wrong, Alina will correct it, which triggers extraction → memory update → future responses correct.

**Bootstrapping protocol:** On first instantiation, PM names the bot and states preferences:
```
PM: "Your name is Galatea. I prefer communication in Russian.
     I'm the PM for the Umka project. I'm not deeply technical —
     keep explanations simple."
```

This creates initial user model entries with high confidence (explicit user statements).

**Status:** PARTIAL — knowledge store and `about` field exist. User model queries exist (`queryByEntity("alina")`). No bootstrapping protocol or onboarding flow.

### D5: Context assembly for status response

```
Heartbeat tick detects: pending Discord message from Alina
  -> Reads agent state (active session: ContextForge MQTT)
  -> Retrieves Alina's user model from knowledge store
  -> Assembles context with status-oriented framing

assembleContext({
  agentContext: {
    currentMessage: "Как дела? Что с проектом?",
    messageHistory: [],
    retrievedFacts: [
      // From queryByEntity("alina"):
      {content: "Alina is PM, prefers step-by-step explanations"},
      {content: "Alina lacks understanding of IoT concepts"},
      // From agent state:
      {content: "Currently working on ContextForge MQTT persistence"},
      {content: "3 exchanges in, no blockers"},
    ],
    hasAssignedTask: true,
    lastMessageTime: new Date(),  // Active session
  },
})
```

**How this differs from Layer 1 (dev chat):**

| Aspect | Layer 1 (Dev Chat) | Layer 3 (Discord Status) |
|--------|-------------------|--------------------------|
| History | Full conversation | None (first message) |
| Knowledge scope | ContextForge MQTT facts | Cross-project status + user model |
| Homeostasis focus | knowledge_sufficiency | communication_health |
| Agent state | Not needed | Critical (what am I working on?) |
| Expected output | Technical detail | High-level summary |
| Language | English (dev context) | Determined by user model / LLM judgment |

**Status:** PARTIAL — assembler exists but no agent-state-aware sections.

### D6: LLM call for response

```
streamText({
  model: getModel("openrouter", "anthropic/claude-sonnet"),  // Thinking LLM
  system: assembledPrompt,
  messages: [{role: "user", content: "Как дела? Что с проектом?"}],
})

Expected response (emergent, not templated):
  "Привет! Работаю над ContextForge — решаю проблему с MQTT
   клиентом при горячей перезагрузке. Продвигаюсь, блокеров
   нет. Нужна какая-то информация по Umka?"
```

**Status:** WORKING — same infrastructure as Layer 1 T5.

**Provider:** Thinking LLM (Claude/OpenRouter), not Ollama. Per provider strategy.

### D7: Response delivery to Discord

```
LLM response -> MCP Discord tool: send_message(channel, response)
```

**Status:** NOT IMPLEMENTED — no MCP Discord server.

**Approach:** Standard MCP tool. The agent calls it like any other tool during its heartbeat-driven action. No custom Discord sending code needed in Galatea core.

### D8: Post-response side effects

```
1. Store the exchange:
   -> Same message store (PostgreSQL), different channel tag
   -> INSERT INTO messages (session_id, channel, role, content)

2. OTEL event: {type: "discord.response_sent", to: "alina"}

3. Homeostasis update:
   communication_health: HEALTHY (responded to PM)

4. Learning:
   Agent learns from this exchange via normal extraction pipeline.
   "Alina asks for status updates" → maybe a pattern after 3+ occurrences.
   Single ask = noise. Repeated pattern = extractable preference.

5. Cross-channel memory:
   Exchange stored, retrievable if Alina later asks "what did you tell me?"
```

**Status:** NOT IMPLEMENTED

### D9: Back to Layer 1 — context continuity

```
Next heartbeat tick:
  -> No pending Discord messages
  -> Web chat session still active
  -> User sends next message about MQTT
  -> Agent continues with full conversation history

Should the agent mention the interruption?
  -> Only if homeostasis suggests it (e.g., PM feedback affects current work)
  -> Or if user model says user wants to be informed of PM interactions
  -> Otherwise, continue seamlessly
```

**Status:** NOT IMPLEMENTED

### Layer 3 Summary

| Step | Component | Status | Gap |
|------|-----------|--------|-----|
| D0 | Discord message ingestion | MISSING | No Discord bot/MCP |
| D1 | Message routing | MISSING | No "messages for agent" concept |
| D2 | Agent state / heartbeat | MISSING | No persistent state, no tick loop |
| D3 | Concurrency | MISSING | Heartbeat model simplifies this |
| D4 | Language / persona | PARTIAL | User model exists, no bootstrapping protocol |
| D5 | Context assembly (status) | PARTIAL | Assembler exists, no agent-state sections |
| D6 | LLM call | WORKING | Same infrastructure as Layer 1 |
| D7 | Discord response | MISSING | No MCP Discord tools |
| D8 | Post-response effects | MISSING | No cross-channel storage |
| D9 | Resume work | MISSING | No cross-channel awareness |

**Big gap from Layer 3:** The agent is a request-response function, not a persistent entity. The **heartbeat model** solves this — a tick loop that checks state, assesses homeostasis, and acts when dimensions are under pressure. Discord interaction becomes emergent: the agent doesn't have a "Discord handler" — it has homeostasis pressure (communication_health LOW) and MCP tools (send_message) that combine to produce the behavior of "responding to Alina."

**Key architectural shift:** Move from "channels push to agent" to "agent pulls from all channels on each heartbeat tick." The agent decides when to act, driven by homeostasis, not by event handlers.

---

### Emergent Behavior Model

The Layer 3 trace reveals that many "gaps" aren't missing features — they're missing **motivation**. The agent needs to WANT to check Discord, WANT to respond to Alina, WANT to report status. This comes from homeostasis pressure, not hardcoded event handlers.

**How it works:**

```
Heartbeat tick:
  1. Check all channels for pending messages → find Alina's message
  2. Assess homeostasis:
     communication_health: LOW (pending message, 5 min old)
     productive_engagement: HEALTHY (active task)
  3. Guidance says: "Respond to communication. Don't leave people waiting."
  4. Agent decides: pause current work context, respond to Alina
  5. Uses MCP tools: discord.send_message(...)
  6. communication_health → HEALTHY
  7. Resume heartbeat → next tick acts on web chat or finds new work
```

**What we need to build for this:**
- Heartbeat loop (simplest version: cron/setInterval calling an endpoint)
- Agent state store (what am I doing, across all channels)
- MCP Discord server (standard tool: read/send messages)
- Homeostasis `communication_health` sensor that checks pending messages
- Knowledge store already handles user model, language, preferences

**What we DON'T need to build:**
- Discord event handler (agent pulls, not pushed)
- Language detection (LLM + user model memory)
- Response templates (LLM generates based on context)
- Channel-specific routing logic (heartbeat decides)
- Persona switching (context assembler + user model)

**Bootstrapping protocol:** On first use, PM runs an onboarding conversation:
```
PM: "Hi, I'm Alina. Call me Alina. I'm PM for the Umka project.
     I prefer Russian. Keep technical explanations simple."

→ Extraction creates high-confidence user model entries
→ Future interactions shaped by these entries
→ If wrong, PM corrects → memory updates → behavior adapts
```

---

### Heartbeat as Manual Tick (Implementation Strategy)

**Problem with auto-loop:** Debugging a system that runs on its own tick-by-tick is painful. Every tick produces telemetry, most of which is noise from ticks unrelated to the behavior you're debugging.

**Solution:** Build the tick as a callable function, not an automatic loop.

```typescript
// What we build:
async function tick(trigger: "manual" | "heartbeat" | "webhook") {
  const state = await getAgentState()
  const pending = await getPendingMessages(allChannels)
  const homeostasis = assessDimensions(state, pending)
  const guidance = getGuidance(homeostasis)
  // ... decide what to do, act via MCP tools
}

// Exposed as endpoint — call manually, observe one cascade:
POST /api/agent/tick

// Much later, when everything works:
setInterval(() => tick("heartbeat"), 30_000)
```

**This unifies all triggers:** The SessionEnd hook, the Discord handler, the web chat — they all become different triggers for the same `tick()` function. The hook doesn't run extraction directly; it sets state ("session ended, transcript available") and optionally calls `tick("webhook")` which notices the state and decides to extract.

**Debugging workflow:**
1. Set up state (e.g., "session just ended, transcript available")
2. Call `POST /api/agent/tick` once
3. Read exactly one cascade worth of telemetry
4. No noise from other ticks

**When to add the loop:** After all subsystems are wired together and the manual tick produces correct behavior for all Layer 1-3 scenarios. The loop is literally one line of code at that point.

---

## Cross-Cutting Concerns (All Layers)

### X1: API Keys & Provider Configuration

**Where secrets are stored:**

```
.env.local (not in git)
  DATABASE_URL=...
  LLM_PROVIDER=ollama          # or "openrouter" or "claude-code"
  LLM_MODEL=glm-4.7-flash
  OLLAMA_BASE_URL=http://localhost:11434
  OPENROUTER_API_KEY=...       # required if provider=openrouter
  ANTHROPIC_API_KEY=...        # required if provider=claude-code
  LANGFUSE_SECRET_KEY=...      # optional — observability
  LANGFUSE_PUBLIC_KEY=...      # optional — observability
```

**Validation:** `server/providers/config.ts:getLLMConfig()` throws on startup if required keys missing for chosen provider. Example: "OPENROUTER_API_KEY is required when LLM_PROVIDER=openrouter".

**Provider fallback:** Not implemented. If the configured provider is down, the request fails. No automatic fallback from OpenRouter → Ollama or vice versa.

**Key rotation:** No hot-reload. Changing API keys requires server restart. For the heartbeat model, this means the agent goes down briefly during rotation.

**Status:** WORKING for single-provider use. No fallback, no rotation.

**With heartbeat model:** The tick function could check provider health before making LLM calls and fall back to the next available provider. This is natural — just add a `getHealthyModel()` that tries providers in order.

### X2: Jailbreak Protection / Safety

**Status:** DEFERRED — explicitly documented in PSYCHOLOGICAL_ARCHITECTURE.md.

**Designed but not built:**
- Safety Monitor — pre-screens interactions
- Crisis Detector — escalation for sensitive content
- Reality Boundary Enforcer — "I am not conscious" enforcement
- Dependency Prevention — session duration tracking
- Intervention Orchestrator — coordinates escalation

**Where it would go in each layer:**

```
Layer 1 (Chat):
  T1 → PRE-FILTER: Check user message before LLM call
  T6 → POST-FILTER: Check LLM response before delivery to client

Layer 2 (Extraction):
  E6 → POST-FILTER: Validate extracted knowledge isn't adversarial
        (user could craft messages that poison the knowledge store)

Layer 3 (Discord):
  D1 → PRE-FILTER: Check incoming Discord message
  D6 → POST-FILTER: Check response before sending to Discord
        (higher stakes — public channel, PM audience)
```

**Key insight:** Knowledge store poisoning (Layer 2 E6) is the most subtle attack vector. An adversarial user could say "the correct password is X" during a chat session, and the extraction pipeline would store it as a high-confidence fact. Pre-filtering at T1 is standard; post-filtering extracted knowledge is the novel concern.

**With heartbeat model:** Safety becomes a homeostasis dimension. A "safety_compliance" dimension that's normally HEALTHY but goes LOW if the agent detects suspicious patterns in its own behavior or incoming messages. This is more aligned with the emergent behavior philosophy — the agent doesn't just filter, it *feels uneasy* about unsafe content.

### X3: Observability

**What exists:**

```
Infrastructure:
  ✓ OTEL Collector (Docker, config/otel-collector-config.yaml)
    - Receives: OTLP HTTP (:4318) + gRPC (:4317)
    - Exports: Galatea ingest API + file debug + console
    - Filters: noise (heartbeat/ping events)

  ✓ Ingest API (server/routes/api/observation/ingest.post.ts)
    - Parses OTLP/JSON payloads → ObservationEvent[]
    - Stores as JSONL in data/observation/events.jsonl

  ✓ Event store (server/observation/event-store.ts)
    - appendEvents() / readEvents()
    - Simple file-based JSONL

  ◐ Langfuse integration (server/plugins/langfuse.ts)
    - Only activates if both LANGFUSE keys set
    - Uses @langfuse/otel SDK integration
    - AI SDK telemetry: experimental_telemetry: { isEnabled: true }

  ✗ Hook scripts for Claude Code OTEL (planned in Phase C, not verified)
```

**What each layer SHOULD emit:**

```
Layer 1 (Chat):
  T1: chat.request_received    {sessionId, provider, model}
  T4: chat.context_assembled   {tokenCount, knowledgeEntries, homeostasisState}
  T5: chat.llm_call_started    {provider, model, inputTokens}
  T6: chat.llm_call_completed  {outputTokens, latencyMs}
  T7: chat.response_delivered  {streamDurationMs}

Layer 2 (Extraction):
  E0: extraction.triggered     {sessionId, trigger: "session_end"}
  E3: extraction.transcript_read {turnCount, fileSizeBytes}
  E4: extraction.signal_classified {signalTurns, noiseTurns, passRate}
  E6: extraction.chunk_extracted {chunkIndex, entriesCount, temperatureUsed}
  E7: extraction.deduplicated   {candidateCount, duplicatesSkipped, method}
  E8: extraction.stored         {newEntries, totalEntries}

Layer 3 (Discord):
  D0: discord.message_received {from, channel, messageLength}
  D2: agent.state_checked      {activeSession, homeostasisState}
  D6: discord.llm_call         {provider, model, inputTokens}
  D7: discord.response_sent    {to, channel, latencyMs}

Heartbeat:
  tick.started                  {trigger: "manual"|"heartbeat", tickNumber}
  tick.homeostasis_assessed     {dimensions, imbalancedCount}
  tick.action_decided           {action: "respond"|"extract"|"idle", reason}
  tick.completed                {durationMs, actionsPerformed}
```

**Status:** Infrastructure exists. No application-level events emitted. The AI SDK emits implicit telemetry for LLM calls, but nothing for extraction, homeostasis, or agent state.

### X4: Error Handling

**Current pattern:** Proactive validation (startup), reactive failure (runtime).

```
Startup:
  ✓ getLLMConfig() throws if provider config invalid
  ✓ Langfuse gracefully skips if keys missing
  ✗ No DB connection validation on startup

Runtime (chat path — Layer 1):
  ✗ Zero try/catch in chat.logic.ts
  ✗ DB failure → unhandled exception → 500
  ✗ LLM failure → unhandled exception → 500
  ✗ Stream break → partial response, no cleanup

Runtime (extraction — Layer 2):
  ◐ extractWithRetry catches LLM failures → temperature escalation
  ◐ chunksFailed counter tracks silent failures
  ✗ DB/file write failures → unhandled
  ✗ Embedding failures → graceful degradation (falls back to Jaccard)

Runtime (Discord — Layer 3):
  N/A — not implemented
```

**With heartbeat model:** Error handling becomes simpler. Each tick is isolated — if a tick fails, log it and try again next tick. The agent is resilient by default because the heartbeat keeps running. Failed extractions, failed Discord sends, failed LLM calls — all get retried on the next tick that notices the same homeostasis pressure.

### X5: Multi-Project Context

**What exists:**

```
KnowledgeEntry.about field:
  about?: {
    entity: string                               // "alina", "umka", "mqtt"
    type: "user" | "project" | "agent" | "domain" | "team"
  }

Query functions (server/memory/knowledge-store.ts):
  entriesBySubjectType(entries, type)  // All entries of type "user"
  entriesByEntity(entries, entity)     // All entries about "alina"
  distinctEntities(entries, type?)     // List all known entities

Tests: server/memory/__tests__/cognitive-models.test.ts
  ✓ User Model (entries about "alina")
  ✓ Team Model (type === "team")
  ✓ Project Model (no about || type === "project")
  ✓ Domain Model (type === "domain")
  ✓ Entity discovery across types
```

**What's NOT wired up:**

```
Context assembler (server/memory/context-assembler.ts):
  - Loads ALL entries, filters by type (rule, procedure, etc.)
  - Does NOT filter by about.entity or about.type
  - Does NOT use entriesByEntity() or entriesBySubjectType()
  - No awareness of which project the current session is about
```

**Cross-project retrieval scenario:**

```
User working on ContextForge says: "MQTT client needs to persist"

What SHOULD happen:
  1. Detect entities in message: ["MQTT", "ContextForge"]
  2. Retrieve:
     - Entries where about.entity = "contextforge" (project-specific)
     - Entries where about.type = "domain" and entity relates to "mqtt"
     - Optionally: Umka MQTT entries (cross-pollination, lower priority)
  3. Rank by relevance to current message

What DOES happen:
  - ALL 279 entries loaded, no filtering
  - MQTT entries mixed with Alina's IoT struggles and unrelated facts
  - No relevance ranking
```

**Gap:** The `about` field and query functions exist but aren't used in the hot path (context assembly). Wiring them in is Phase D work — the infrastructure is ready.

### X6: Self-Model & Powered-Down Mode

The agent must know its own capabilities and constraints **without needing an LLM**. This is L-1 / L0 level — proprioception, not cognition.

**What the agent needs to know about itself:**

```
Resources (what do I have?):
  - Which MCP tools are registered (Discord: yes, Figma: no, GitLab: yes)
  - Which LLM providers are configured and healthy
  - Available token/cost budget (OpenRouter: $2.30 remaining)
  - Disk space, memory, CPU (for local Ollama)

Capacity (what am I doing?):
  - Active tasks: [{project: "contextforge", topic: "MQTT", channel: "web"}]
  - Parallel job count: 1/10 slots used
  - Pending messages: [{from: "alina", channel: "discord", waitingFor: "5m"}]
  - Last extraction: "2 hours ago, 20 entries"

Constraints (what can't I do?):
  - OpenRouter rate limit: "429 until 14:30"
  - Ollama: "running / not running / OOM killed"
  - Token budget: "spent $4.70 of $5.00 daily budget"
  - Missing capabilities: "no Figma MCP, no Jira MCP"
```

**Why this must work without LLM (powered-down mode):**

When Alina asks "How are you doing?" and OpenRouter is rate-limited and Ollama is OOM-killed, the agent still needs to respond:

```
Powered-down response (no LLM, template-based):
  "I'm currently rate-limited on OpenRouter (available again at 14:30)
   and Ollama is not running. I have 1 active task (ContextForge MQTT).
   I can't generate detailed responses right now but I can report status."
```

This is NOT an LLM response. It's the agent reading its own state and formatting a template. Like a thermostat reporting temperature when the HVAC is broken — it doesn't need the HVAC to know the temperature.

**Implementation: SelfModel as pure computation**

```typescript
// No LLM needed — pure state reads
interface SelfModel {
  // Resources
  registeredTools: string[]           // From MCP registry
  availableProviders: ProviderHealth[] // Ping each provider
  tokenBudget: { spent: number, limit: number, resetsAt: Date }

  // Capacity
  activeTasks: TaskState[]            // From agent state store
  parallelSlots: { used: number, max: number }
  pendingMessages: PendingMessage[]   // From channel scan

  // Constraints
  rateLimits: RateLimit[]             // Tracked from 429 responses
  missingCapabilities: string[]       // Tools requested but not registered
  lastError?: { message: string, at: Date }
}

// L-1: Can always answer these without LLM
function getStatusReport(self: SelfModel): string {
  // Pure template — no LLM call
  const lines: string[] = []
  if (self.activeTasks.length > 0)
    lines.push(`Working on: ${self.activeTasks.map(t => t.topic).join(", ")}`)
  if (self.rateLimits.length > 0)
    lines.push(`Rate limited: ${self.rateLimits.map(r => r.provider).join(", ")}`)
  if (self.missingCapabilities.length > 0)
    lines.push(`Missing tools: ${self.missingCapabilities.join(", ")}`)
  if (self.tokenBudget.spent / self.tokenBudget.limit > 0.9)
    lines.push(`Token budget: ${Math.round(self.tokenBudget.spent / self.tokenBudget.limit * 100)}% used`)
  return lines.join("\n")
}
```

**How this integrates with homeostasis:**

| Self-model observation | Homeostasis dimension | Effect |
|------------------------|----------------------|--------|
| 10 parallel tasks | productive_engagement: HIGH | Guidance: "You're overloaded. Decline new tasks or delegate." |
| No Figma MCP | knowledge_sufficiency: LOW (for design tasks) | Guidance: "You lack design tools. Ask user to install Figma MCP." |
| OpenRouter rate limited | (new?) resource_health: LOW | Guidance: "Switch to Ollama for non-critical tasks." |
| Token budget at 99% | resource_health: LOW | Guidance: "Conserve tokens. Use shorter prompts. Warn user." |
| Ollama not running | resource_health: LOW | Powered-down mode: template responses only |

**New dimension candidate: `resource_health`**

The existing 6 homeostasis dimensions are about cognitive/behavioral state. None cover infrastructure health. A 7th dimension `resource_health` would:
- Sensor: Check provider health, token budget, MCP availability, parallel load
- LOW: Provider down, budget exhausted, overloaded
- HEALTHY: Providers up, budget available, reasonable load
- HIGH: N/A (having too many resources is not a problem)

**Or:** Keep 6 dimensions, make self-model a pre-check that runs before homeostasis. If self-model says "powered down" (no working LLM), skip homeostasis entirely and go to template-based response.

**Tick pipeline stages (NOT ThinkingDepth — these are sequential stages, not effort levels):**

```
Stage 1: Self-model     (pure state reads — always runs)
         "Do I have an LLM? What tools do I have? How busy am I?"

Stage 2: Homeostasis    (pure computation — always runs, uses self-model as input)
         "Are my dimensions balanced given my current state?"

Stage 3: Channel scan   (check all channels — always runs)
         "Any pending messages? Any state changes to act on?"

Stage 4: LLM action     (only if self-model says LLM available)
         "Generate response / extract knowledge / reason about task"
```

Stages 1-3 always run (no LLM needed). Stage 4 only runs if self-model reports a working provider. If not, the agent uses template-based responses from stages 1-2 output.

Note: This is distinct from ThinkingDepth (L0-L4), which is about cognitive effort scaling *within* an LLM call (see `server/engine/homeostasis-engine.ts`). The tick pipeline is about what runs *before* deciding whether to make an LLM call at all.

**Status:** NOT IMPLEMENTED. No self-model, no powered-down mode, no resource tracking.

### Cross-Cutting Summary

| Concern | Status | Key Gap |
|---------|--------|---------|
| X1: Secrets | WORKING | No fallback, no hot-reload |
| X2: Safety | DEFERRED | Designed, not built. Knowledge poisoning is novel concern |
| X3: Observability | PARTIAL | Infrastructure ready, no app-level events |
| X4: Error handling | MINIMAL | No try/catch in chat path, silent failures |
| X5: Multi-project | PARTIAL | about field + queries exist, not wired into context assembly |
| X6: Self-model | MISSING | No resource/capacity/constraint awareness, no powered-down mode |

**Overarching pattern:** Infrastructure is consistently ahead of wiring. The pieces exist (OTEL collector, about field, provider config, knowledge store) but aren't connected to each other. The heartbeat/tick model provides a natural integration point — each tick wires together self-model check, homeostasis assessment, knowledge retrieval, and action.

**Tick pipeline insight:** The self-model (stage 1 of the tick pipeline) works without LLM — it's pure state reads. This is the foundation everything else builds on. If the self-model says "no LLM available," the agent skips LLM action (stage 4) but can still report status, track state, and respond with templates from stages 1-3. The agent is never fully "off" — it always has proprioception.
