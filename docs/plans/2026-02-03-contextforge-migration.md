# ContextForgeTS Migration Analysis for Galatea

**Date**: 2026-02-03
**Source**: `/home/newub/w/ContextLibrary/ContextForgeTS`
**Target**: TanStack Start-based Galatea architecture

---

## Executive Summary

ContextForgeTS is a well-architected codebase with **~70% reusable code**. The migration to TanStack Start requires:

- **Direct port** (minimal changes): ~40% of code
- **Adaptation** (pattern changes): ~30% of code
- **Rewrite** (new implementation): ~30% of code

**Estimated migration effort**: 1-2 weeks for core functionality

---

## Codebase Overview

### Current Stack

| Layer | Technology |
|-------|------------|
| Backend | Convex (serverless) |
| Database | Convex DB (proprietary) |
| Auth | @convex-dev/auth |
| Frontend | React 19 + TanStack Router |
| Styling | Tailwind CSS 4.1 + shadcn/ui |
| LLM | Ollama, **Claude Code SDK** (subscription), OpenRouter |
| Observability | LangFuse |

### Target Stack

| Layer | Technology |
|-------|------------|
| Backend | TanStack Start (server functions) |
| Database | Drizzle ORM + PostgreSQL |
| Auth | Better Auth |
| Frontend | React 19 + TanStack Router (same) |
| Styling | Tailwind CSS + shadcn/ui (same) |
| LLM | Claude Code SDK (dev) + Vercel AI SDK (Anthropic API, Ollama) |
| Observability | LangFuse (same) |

---

## Component-by-Component Analysis

### 1. Database Schema

**Source**: `convex/schema.ts`

| Table | Reuse | Notes |
|-------|-------|-------|
| `sessions` | ✅ Port | Drizzle schema, same fields |
| `blocks` | ✅ Port | Drizzle schema, same fields |
| `templates` | ✅ Port | Drizzle schema |
| `projects` | ⏸️ Defer | Not needed for Galatea MVP |
| `workflows` | ⏸️ Defer | Not needed for Galatea MVP |
| `generations` | ✅ Port | Track LLM generations |
| `snapshots` | ⏸️ Defer | Nice-to-have |

**Migration**:

```typescript
// convex/schema.ts (Convex)
sessions: defineTable({
  userId: v.optional(v.id("users")),
  name: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  budgets: v.optional(v.object({...})),
  systemPrompt: v.optional(v.string()),
})

// ↓ Becomes ↓

// server/db/schema.ts (Drizzle)
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  budgets: text('budgets', { mode: 'json' }),
  systemPrompt: text('system_prompt'),
});
```

**Effort**: Low (1-2 hours) - mechanical translation

---

### 2. Context Assembly Logic

**Source**: `convex/lib/context.ts`

| Function | Reuse | Notes |
|----------|-------|-------|
| `extractSystemPromptFromBlocks()` | ✅ 100% | Pure function, no changes |
| `assembleContext()` | ✅ 100% | Pure function, no changes |
| `assembleContextWithConversation()` | ✅ 100% | Pure function, no changes |
| `estimateTokenCount()` | ✅ 100% | Pure function |
| `getContextStats()` | ✅ 100% | Pure function |
| `NO_TOOLS_SUFFIX` | ✅ 100% | Constant |

**Migration**: Copy file directly, update type imports.

```typescript
// Just change the import
- import type { Doc } from "../_generated/dataModel"
+ import type { Block } from "../db/schema"
```

**Effort**: Trivial (15 minutes)

---

### 3. Token Counting

**Source**: `convex/lib/tokenizer.ts`

| Component | Reuse | Notes |
|-----------|-------|-------|
| `countTokens()` | ✅ 100% | Uses js-tiktoken, pure function |

**Migration**: Copy directly.

**Effort**: Trivial (5 minutes)

---

### 4. LangFuse Integration

**Source**: `convex/lib/langfuse.ts`

| Component | Reuse | Notes |
|-----------|-------|-------|
| Singleton pattern | ✅ 100% | Works in any Node.js environment |
| `getLangfuse()` | ✅ 100% | Lazy initialization |
| `createGeneration()` | ✅ 100% | Trace creation |
| Resilient error handling | ✅ 100% | Silent fail if not configured |

**Migration**: Copy directly, works unchanged in TanStack Start server functions.

**Effort**: Trivial (5 minutes)

---

### 5. LLM Clients

**Source**: `src/lib/llm/ollama.ts`, `convex/claudeNode.ts`

| Component | Reuse | Adaptation |
|-----------|-------|------------|
| Ollama client | ⚠️ Replace | Use Vercel AI SDK `@ai-sdk/openai-compatible` |
| Claude Code SDK | ✅ Keep or ⚠️ Replace | See decision below |
| OpenRouter client | ⚠️ Replace | Use Vercel AI SDK with OpenRouter |
| Streaming patterns | ✅ Learn from | Apply same UX patterns |

**IMPORTANT: Claude Code SDK vs Claude API**

ContextForgeTS uses **Claude Code SDK** (`@anthropic-ai/claude-agent-sdk`), NOT the Anthropic API:

| Aspect | Claude Code SDK | Claude API (Anthropic) |
|--------|-----------------|------------------------|
| Package | `@anthropic-ai/claude-agent-sdk` | `@anthropic-ai/sdk` or `@ai-sdk/anthropic` |
| Billing | Claude Code subscription | Pay-per-token API credits |
| Interface | `query()` async generator | `messages.create()` or `streamText()` |
| Tools | Built-in (agent mode) | Manual tool definition |
| Use case | Agent tasks, tool use | Direct completions |

**Decision for Galatea**:

Option A: **Keep Claude Code SDK** (recommended for development)
- Free with Claude Code subscription
- Already works in ContextForge
- Good for local development/testing
- Port `claudeNode.ts` patterns to TanStack Start

Option B: **Use Anthropic API via Vercel AI SDK** (for production)
- Unified interface across providers
- Better for production (predictable costs)
- Simpler streaming with `streamText()`

**Recommendation**: Support BOTH
- Claude Code SDK for development (subscription-based, no API costs)
- Anthropic API for production (scalable, metered)
- Activity Router can select based on environment

**Why Vercel AI SDK for Ollama/OpenRouter**:

**Migration**:

```typescript
// Old: Custom Ollama client
export async function* streamChat(messages, options) {
  const response = await fetch(`${ollamaUrl}/api/chat`, {...});
  const reader = response.body.getReader();
  // Manual streaming...
}

// ↓ Becomes ↓

// New: Vercel AI SDK
import { streamText } from 'ai';
import { createOllama } from '@ai-sdk/openai-compatible';

const ollama = createOllama({ baseURL: 'http://localhost:11434/v1' });

export async function generateWithOllama(messages: Message[]) {
  const result = await streamText({
    model: ollama('llama3.2'),
    messages,
  });
  return result.toDataStreamResponse();
}
```

**Effort**: Medium (4-6 hours) - learn Vercel AI SDK patterns, rewrite providers

---

### 6. Convex Functions → Server Functions

**Source**: `convex/sessions.ts`, `convex/blocks.ts`, `convex/generations.ts`

| Pattern | Convex | TanStack Start |
|---------|--------|----------------|
| Query | `query({...})` | `createServerFn({ method: 'GET' })` |
| Mutation | `mutation({...})` | `createServerFn({ method: 'POST' })` |
| Action (Node.js) | `action("use node", {...})` | Server function (always Node.js) |
| Auth check | `ctx.auth.getUserIdentity()` | Better Auth session |
| DB access | `ctx.db.query(...)` | `db.select().from(...)` |

**Migration Example**:

```typescript
// convex/sessions.ts (Convex)
export const create = mutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getOptionalUserId(ctx);
    const sessionId = await ctx.db.insert("sessions", {
      userId,
      name: args.name || "Untitled",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return sessionId;
  },
});

// ↓ Becomes ↓

// server/functions/sessions.ts (TanStack Start)
import { createServerFn } from '@tanstack/react-start/server';
import { db } from '../db';
import { sessions } from '../db/schema';
import { nanoid } from 'nanoid';
import { getSession } from '../auth';

export const createSession = createServerFn({ method: 'POST' })
  .validator((input: { name?: string }) => input)
  .handler(async ({ input }) => {
    const session = await getSession();
    const userId = session?.user?.id;

    const id = nanoid();
    const now = new Date();

    await db.insert(sessions).values({
      id,
      userId,
      name: input.name || 'Untitled',
      createdAt: now,
      updatedAt: now,
    });

    return { id };
  });
```

**Effort**: Medium (1-2 days) - mechanical but tedious

---

### 7. React Hooks

**Source**: `src/hooks/`

| Hook | Reuse | Adaptation |
|------|-------|------------|
| `useClaudeGenerate` | ⚠️ Rewrite | Use `useChat` from Vercel AI SDK |
| `useGenerate` | ⚠️ Rewrite | Use `useChat` from Vercel AI SDK |
| `useBrainstorm` | ⚠️ Rewrite | Use `useChat` with conversation history |
| `useCompression` | ✅ Adapt | Change mutation calls |
| `useFileDrop` | ✅ 100% | Pure client-side logic |
| `useBudgetCheck` | ✅ Adapt | Change query calls |

**Migration**:

```typescript
// Old: useClaudeGenerate (custom streaming via Convex)
const { generate, isGenerating, streamedText } = useClaudeGenerate({
  sessionId,
  onComplete: () => setPrompt(""),
});

// ↓ Becomes ↓

// New: useChat (Vercel AI SDK)
import { useChat } from 'ai/react';

const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
  api: '/api/chat',
  body: { sessionId },
  onFinish: () => setPrompt(""),
});
```

**Effort**: Medium (4-6 hours) - learn useChat patterns

---

### 8. React Components

**Source**: `src/components/`

| Component | Reuse | Notes |
|-----------|-------|-------|
| **UI Components** (shadcn/ui) | ✅ 100% | Copy directly |
| `Button`, `Input`, `Label` | ✅ 100% | Unchanged |
| `ConfirmDialog` | ✅ 100% | Unchanged |
| `DebouncedButton` | ✅ 100% | Unchanged |
| `Toast` | ✅ 100% | Unchanged |
| **Feature Components** | | |
| `GeneratePanel` | ⚠️ Adapt | Replace hooks, same UI |
| `BrainstormPanel` | ⚠️ Adapt | Replace hooks, same UI |
| `CompressionDialog` | ⚠️ Adapt | Replace mutation calls |
| `ContextExport` | ✅ 95% | Minor query changes |
| **Metrics Components** | | |
| `SessionMetrics` | ⚠️ Adapt | Replace query calls |
| `ZoneHeader` | ⚠️ Adapt | Replace query calls |
| `BlockTokenBadge` | ✅ 100% | Pure display |
| `GenerationUsage` | ✅ 100% | Pure display |
| **DnD Components** | | |
| `DndProvider` | ✅ 100% | Uses @dnd-kit, unchanged |
| `DroppableZone` | ✅ 95% | Minor mutation changes |
| `SortableBlock` | ✅ 95% | Minor mutation changes |

**Effort**: Low-Medium (1 day) - mostly find/replace on data fetching

---

### 9. Routing

**Source**: `src/routes/`

| Route | Reuse | Notes |
|-------|-------|-------|
| `__root.tsx` | ⚠️ Adapt | Change auth provider, keep layout |
| `index.tsx` | ✅ 95% | Change query imports |
| `login.tsx` | ⚠️ Rewrite | Better Auth instead of Convex Auth |
| `settings.tsx` | ✅ 95% | Minor changes |
| `templates.tsx` | ⏸️ Defer | Not needed for Galatea MVP |
| `projects.tsx` | ⏸️ Defer | Not needed for Galatea MVP |
| `workflows.tsx` | ⏸️ Defer | Not needed for Galatea MVP |

**Note**: TanStack Router is already used! Only data fetching changes.

**Effort**: Low (2-4 hours)

---

### 10. Auth

**Source**: `convex/auth.ts`, `convex/lib/auth.ts`

| Component | Reuse | Notes |
|-----------|-------|-------|
| Convex Auth config | ❌ Replace | Use Better Auth |
| `canAccessSession()` | ✅ Adapt | Same logic, different API |
| `requireSessionAccess()` | ✅ Adapt | Same logic, different API |
| `getOptionalUserId()` | ✅ Adapt | `getSession()` instead |

**Migration**:

```typescript
// convex/lib/auth.ts (Convex)
export async function getOptionalUserId(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject;
}

// ↓ Becomes ↓

// server/lib/auth.ts (Better Auth)
import { auth } from '../auth';

export async function getOptionalUserId() {
  const session = await auth.api.getSession();
  return session?.user?.id;
}
```

**Effort**: Medium (4-6 hours) - Better Auth setup + patterns

---

## What's NOT Reusable

### 1. Convex-Specific Patterns

| Pattern | Why Not Reusable |
|---------|------------------|
| Reactive queries (`useQuery`) | Replace with TanStack Query |
| Real-time subscriptions | Replace with polling/SSE |
| Convex validators (`v.string()`) | Replace with Zod |
| `ctx.db` API | Replace with Drizzle |
| Scheduled functions | External cron/worker |

### 2. Features to Defer

| Feature | Reason |
|---------|--------|
| Projects | Not in Galatea scope |
| Workflows | Not in Galatea scope |
| Snapshots | Nice-to-have, add later |
| Templates | Useful but not MVP |

---

## Migration Strategy

### Phase 1: Foundation (Day 1-2)

1. **Create TanStack Start project**
   ```bash
   npx create-tanstack-app galatea-app
   ```

2. **Set up Drizzle schema**
   - Port `sessions`, `blocks`, `generations` tables
   - Add Galatea-specific tables (homeostasis, observations, preprompts)

3. **Set up Better Auth**
   - Basic password authentication
   - Session management

4. **Copy pure utilities**
   - `lib/context.ts`
   - `lib/tokenizer.ts`
   - `lib/langfuse.ts`
   - `lib/positioning.ts`
   - `lib/blockTypes.ts`

### Phase 2: Server Functions (Day 3-4)

1. **Port CRUD operations**
   - Sessions: create, list, get, update, delete
   - Blocks: create, list, move, reorder, update
   - Generations: create, update, complete

2. **Set up Vercel AI SDK**
   - Configure Anthropic provider
   - Configure Ollama (openai-compatible)
   - Implement `/api/chat` endpoint

### Phase 3: Frontend (Day 5-7)

1. **Copy UI components** (direct port)
   - All shadcn/ui components
   - DnD components

2. **Adapt feature components**
   - Replace `useQuery`/`useMutation` with server function calls
   - Replace custom LLM hooks with `useChat`

3. **Update routes**
   - Keep TanStack Router structure
   - Update data loading patterns

### Phase 4: Integration (Day 8-10)

1. **Add Galatea-specific features**
   - Activity Router
   - Homeostasis Engine
   - MQTT integration
   - Graphiti bridge

2. **Testing**
   - Port relevant E2E tests
   - Add new tests for Galatea features

---

## Code Reuse Summary

| Category | Files | Reuse Level | Effort |
|----------|-------|-------------|--------|
| **Pure Logic** | | | |
| Context assembly | 1 | ✅ 100% | Copy |
| Tokenizer | 1 | ✅ 100% | Copy |
| LangFuse | 1 | ✅ 100% | Copy |
| Positioning | 1 | ✅ 100% | Copy |
| Block types | 1 | ✅ 100% | Copy |
| **UI Components** | | | |
| shadcn/ui | 10+ | ✅ 100% | Copy |
| DnD components | 4 | ✅ 95% | Minor fixes |
| Metrics display | 3 | ✅ 100% | Copy |
| **Adapted Logic** | | | |
| Schema | 1 | ⚠️ Translate | 2 hours |
| Server functions | 6 | ⚠️ Rewrite pattern | 1-2 days |
| Auth helpers | 2 | ⚠️ Adapt API | 4 hours |
| Feature components | 5 | ⚠️ Update hooks | 1 day |
| **Replaced/Adapted** | | | |
| Ollama/OpenRouter | 2 | ❌ Vercel AI SDK | 2-3 hours |
| Claude Code SDK | 1 | ✅ Port to Start | 2-3 hours |
| React hooks | 4 | ❌ useChat | 4-6 hours |
| Auth system | 2 | ❌ Better Auth | 4-6 hours |

**Total Reusable**: ~40% direct copy, ~30% adapt, ~30% rewrite

**Total Effort**: ~7-10 working days

---

## Files to Copy Directly

```bash
# Pure utilities (copy to server/lib/)
convex/lib/context.ts      → server/lib/context.ts
convex/lib/tokenizer.ts    → server/lib/tokenizer.ts
convex/lib/langfuse.ts     → server/lib/langfuse.ts

# Client utilities (copy to src/lib/)
src/lib/positioning.ts     → app/lib/positioning.ts
src/lib/blockTypes.ts      → app/lib/blockTypes.ts

# UI components (copy to src/components/ui/)
src/components/ui/*        → app/components/ui/*

# DnD components (copy, minor edits)
src/components/dnd/*       → app/components/dnd/*

# Metrics components (copy)
src/components/metrics/*   → app/components/metrics/*
```

---

## Key Patterns to Preserve

### 1. Zone-Based Context Assembly

The PERMANENT → STABLE → WORKING ordering is excellent for LLM caching. Keep it.

### 2. Database-Driven Streaming (Claude Code SDK)

ContextForge uses database writes for streaming with **Claude Code SDK** specifically. This pattern:
- Action calls `query()` async generator from `@anthropic-ai/claude-agent-sdk`
- Writes chunks to DB via `internal.generations.appendChunk`
- Client subscribes via reactive query
- Necessary because Claude Code SDK runs server-side only

For Vercel AI SDK (Anthropic API), we get native HTTP streaming which is simpler. But the DB tracking pattern is still valuable for:
- Usage statistics
- Audit trail
- Resume on disconnect

### 3. Claude Code NO_TOOLS_SUFFIX

The `NO_TOOLS_SUFFIX` constant prevents Claude Code from pretending to have tool access:
```typescript
export const NO_TOOLS_SUFFIX = `
IMPORTANT: In this conversation you do NOT have access to tools, files, or code execution...`
```
This is **Claude Code SDK specific** - the agent mode has built-in tools that we disable for pure generation.

### 4. Provider Health Checks

The periodic health check pattern (`useProviderHealth`) is good UX. Port it.

### 5. Token Budget System

The zone-based token budgets with warning/danger thresholds is useful. Port it.

### 6. Fractional Positioning

The positioning system for block ordering within zones is elegant. Port it directly.

---

## What Galatea Adds (Beyond ContextForge)

| Feature | ContextForge | Galatea |
|---------|--------------|---------|
| Memory system | Blocks only | Graphiti temporal graph |
| Self-regulation | None | Homeostasis (6 dimensions) |
| Activity routing | None | 4-level router |
| Home automation | None | MQTT (HA/Frigate) |
| Observations | None | Pipeline with validation |
| Preprompts | System prompt block | Full persona system |
| Tool execution | None | MCP integration |

---

*Analysis completed: 2026-02-03*
