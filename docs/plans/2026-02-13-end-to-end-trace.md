# End-to-End Message Trace: Golden Reference

**Date:** 2026-02-13
**Status:** In Progress (Layer 1 complete, Layers 2-3 pending)
**Purpose:** Trace every byte through the Galatea system for three scenarios, exposing all gaps and creating a testable golden reference for future subsystem validation.

---

## Approach

Three layers of increasing ambition, building from what works:

1. **Layer 1: Developer Chat Session (Web UI)** — the path that partially works today
2. **Layer 2: Session-End Extraction** — the learning path (partially working)
3. **Layer 3: PM Asks Status on Discord** — aspirational, highest gap density

**Context:** Real project data from this machine:
- **Umka** (32 sessions) — content-heavy, documents, Payload CMS, some game dev
- **ContextForge** (92 sessions) — dev-heavy, TypeScript, MQTT, real-time sync
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

*(Pending — next session)*

### Scenario

The chat session from Layer 1 ends. The user closes the web UI (or the Claude Code session ends via SessionEnd hook). The extraction pipeline should fire.

### Steps to trace:
- How does session end get detected?
- What triggers extraction?
- Transcript reading -> signal classification -> extraction -> dedup -> store
- Knowledge store state before and after
- CLAUDE.md regeneration
- Homeostasis implications for next session

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
