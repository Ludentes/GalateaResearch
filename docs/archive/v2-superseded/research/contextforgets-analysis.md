# ContextForgeTS: Project Analysis

**Date:** 2026-02-13
**Purpose:** Document ContextForgeTS architecture and features relevant to Galatea development. ContextForgeTS was the ideological foundation for Galatea — they diverged, but many implemented ideas are reusable.

---

## What It Is

Context window management application for LLM interactions. Provides a structured workspace for organizing prompts, reference materials, and generated content using a three-zone architecture optimized for prompt caching.

**Stack:** React 19 + Vite 7 + Convex (real-time DB) + TanStack Router + shadcn/ui + Tailwind v4

**Location:** `/home/newub/w/ContextLibrary/ContextForgeTS` (92 Claude Code sessions)

---

## Key Features

### 1. Claude Code as LLM Provider

Uses `@anthropic-ai/claude-agent-sdk` to spawn Claude Code as a subprocess. Streams via database-backed pattern since Convex Node actions can't return HTTP streams.

```
Backend: spawn('claude', ...) → stream chunks → write to Convex DB via mutations
Frontend: useQuery(api.generations.get) → React re-renders on each chunk write
```

**Key files:**
- `convex/claudeNode.ts` — subprocess spawning, streaming, LangFuse tracing
- `convex/generations.ts` — chunk storage, status tracking (streaming/complete/error)

**Why not Vercel AI SDK:** Claude Code uses subprocess protocol (stdin/stdout), not HTTP. SDK doesn't support this.

**Relevance to Galatea:** Galatea has `ai-sdk-provider-claude-code` in dependencies but extraction is hardcoded to Ollama. ContextForge's pattern shows how to handle the streaming difference.

### 2. Zone-Based Prompt Caching

Three-zone architecture orders context for maximum cache hits:

| Zone | Purpose | Caching |
|------|---------|---------|
| **PERMANENT** | System prompts, personas, guidelines | Best (changes rarely) |
| **STABLE** | Reference material, templates | Good (changes per session) |
| **WORKING** | Recent work, generated content | None (dynamic) |

Assembly order: PERMANENT → STABLE → WORKING → User Prompt

**Claimed savings:** 50-90% cost reduction on Anthropic (explicit `cache_control`), OpenAI (automatic prefix caching). Ollama has no prompt caching.

**Key file:** `convex/lib/context.ts` — `assembleContext()`, `extractSystemPromptFromBlocks()`

**Relevance to Galatea:** Galatea's `context-assembler.ts` builds system prompts but doesn't order sections for caching. When switching to Claude/OpenRouter as primary LLM, zone ordering would matter.

### 3. LLM-Based Compression

Compresses blocks using Claude Code with three strategies:

- **Semantic:** Preserve meaning, remove redundancy
- **Structural:** Optimize document structure
- **Statistical:** Heuristic-based text reduction

Quality controls: min 1.2x compression ratio, 60% important words preserved.

**Key file:** `convex/compression.ts`

**Relevance to Galatea:** Could apply to context window management when history grows too large (T3 gap in end-to-end trace — no sliding window/summarization).

### 4. Skill System

SKILL.md format with YAML frontmatter. Pure parser (zero deps, works client + server).

**Discovery:** Local folder scan (`~/.claude/skills/`), file upload (drag-and-drop), URL import (GitHub)
**Storage:** Blocks in Convex DB with `type: "skill"` and metadata (skillName, sourceType, sourceRef)
**Export:** ZIP with SKILL.md + references/

**Key files:**
- `src/lib/skills/parser.ts` — pure parser
- `convex/skills.ts` — import mutations
- `convex/skillsNode.ts` — local scan (Node action)

**Relevance to Galatea:** Phase D plans SKILL.md auto-generation from 3+ repeated procedures. ContextForge has the import/export infrastructure but not auto-generation.

### 5. Token Budgets

Per-zone limits with visual warnings at 80% and 95%. Uses `js-tiktoken` for counting.

**Key files:** `convex/lib/tokenizer.ts`, `convex/metrics.ts`, `src/components/metrics/`

**Relevance to Galatea:** End-to-end trace identified "no token budget management" as a gap at T5. ContextForge's approach (per-zone limits + visual feedback) is directly applicable.

### 6. Multi-Provider Abstraction

Three providers with unified interface but different streaming patterns:

| Provider | Transport | Streaming |
|----------|-----------|-----------|
| Ollama | Client-side HTTP | ReadableStream chunks |
| Claude Code | Subprocess (Node action) | DB-backed (write chunks → reactive query) |
| OpenRouter | Client-side HTTP | SSE (Server-Sent Events) |

**Key files:** `src/lib/llm/ollama.ts`, `src/lib/llm/openrouter.ts`, `convex/claudeNode.ts`

**Relevance to Galatea:** Galatea's `server/providers/` has all three adapters via Vercel AI SDK. The abstraction is cleaner (all return `LanguageModel`), but ContextForge shows what happens when you need different streaming patterns per provider.

---

## Architecture Comparison

| Aspect | ContextForgeTS | Galatea |
|--------|---------------|---------|
| **Database** | Convex (real-time, cloud) | PostgreSQL + Drizzle (self-hosted) |
| **LLM Integration** | Custom per-provider | Vercel AI SDK (unified) |
| **State Management** | Convex reactive queries | TanStack Query + server state |
| **Streaming** | Provider-specific patterns | AI SDK `streamText()` |
| **Context Assembly** | Zone-based (caching-optimized) | Section-based (priority-ordered) |
| **Memory** | Session snapshots (point-in-time) | Knowledge store (extracted facts) |
| **Observation** | LangFuse (per-call tracing) | OTEL Collector (planned) |
| **Self-regulation** | None | Homeostasis engine (6 dimensions) |
| **Extraction** | None | Transcript → signal → extract → store |
| **Skills** | Import/export/manage | Planned auto-generation (Phase D) |

---

## Patterns Worth Borrowing

### Database-Backed Streaming
When a provider can't return HTTP streams (e.g., subprocess-based), write chunks to DB and let the client subscribe reactively. Applicable if Galatea ever needs to run Claude Code as a provider in a context where HTTP streaming isn't available.

### Pure Parser Pattern
SKILL.md parser has zero dependencies, works identically in browser and server. Good model for any parsing code that needs to run in multiple environments.

### LangFuse Resilient Pattern
Every LLM call traced, but failures never break main functionality:
```typescript
try { trace.end({...}) } catch { /* silent */ }
```
Observability is purely additive. Galatea's OTEL integration should follow this pattern.

### Anti-Agent Suffix
When using Claude in brainstorm/chat mode, append suffix preventing fake tool use:
```
IMPORTANT: In this conversation you do NOT have access to tools...
```
Relevant for Galatea's chat mode where the agent shouldn't pretend to have capabilities it doesn't.

---

## LLM Provider Strategy (Galatea Implications)

**Intended design:** Ollama for extraction/guard tasks, Claude/OpenRouter for main thinking.

**Current state in Galatea:**
- Chat: Already supports multi-provider via `getModel(provider, model)` — per-request overrides work
- Extraction: Hardcoded to Ollama in `server/routes/api/extract.post.ts`
- Fix: ~10 lines — use `getModel()` instead of `createOllamaModel()`, add `EXTRACTION_PROVIDER` env var

**ContextForge validates this split:** It uses Claude Code for thinking/compression and could use Ollama for lightweight tasks. The patterns are compatible.

---

## What ContextForge Does NOT Have (Galatea's Unique Value)

- No knowledge extraction from transcripts
- No homeostasis / self-regulation
- No OTEL observation pipeline
- No cross-session learning
- No cognitive models / entity tagging
- No signal classification
- No auto-generation of any kind (skills, summaries, etc.)
- No MQTT (uses Convex WebSocket reactivity instead)

ContextForge is a **tool for humans** to manage LLM context. Galatea is an **agent that manages its own context**. The divergence is philosophical: ContextForge optimizes human-LLM interaction, Galatea optimizes agent-self-regulation.
