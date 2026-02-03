# TanStack Ecosystem Analysis for Galatea

**Date**: 2026-02-03
**Purpose**: Evaluate TanStack ecosystem capabilities and reuse potential for Galatea

---

## TanStack Ecosystem Overview

TanStack has evolved from "just React Query" into a comprehensive full-stack platform. As of early 2026, the ecosystem includes:

| Package | Version | Status | Purpose |
|---------|---------|--------|---------|
| **TanStack Start** | 1.x | Stable | Full-stack React framework |
| **TanStack Query** | v5 | Stable | Data fetching, caching, streaming |
| **TanStack Router** | v1 | Stable | Type-safe routing |
| **TanStack Form** | v1 | Stable | Cross-framework forms |
| **TanStack Table** | v8 | Stable | Headless data grids |
| **TanStack Virtual** | v3 | Stable | Virtualization (lists, grids) |
| **TanStack DB** | Beta | Beta | Reactive client store + sync |
| **TanStack AI** | Alpha | Alpha | Type-safe AI SDK |

Sources: [TanStack Start Overview](https://tanstack.com/start/latest/docs/framework/react/overview), [TanStack in 2026 Guide](https://www.codewithseb.com/blog/tanstack-ecosystem-complete-guide-2026)

---

## TanStack Start

### What It Is

Full-stack React framework built on TanStack Router and Vite. Production-ready with SSR, streaming, and server functions.

### Key Features

| Feature | Description | Galatea Use |
|---------|-------------|-------------|
| **Server Functions** | Type-safe RPCs, run on server, called from anywhere | ✅ All backend logic |
| **SSR + Streaming** | Server-side render with streaming hydration | ✅ Chat UI |
| **Middleware** | Request/response transformation | ✅ Auth, logging |
| **API Routes** | REST endpoints alongside app | ✅ Observation ingestion, webhooks |
| **Type Safety** | End-to-end TypeScript inference | ✅ Critical for DX |
| **Nitro Deployment** | Deploy anywhere (Vercel, Cloudflare, self-hosted) | ✅ Local-first |

### Server Functions Example

```typescript
// Server function - runs on server, callable from client
import { createServerFn } from '@tanstack/react-start/server';
import { db } from './db';

export const getMemories = createServerFn({ method: 'GET' })
  .validator((input: { query: string; limit?: number }) => input)
  .handler(async ({ input }) => {
    // Direct database access - no "use node" friction
    const memories = await db.query.memories.findMany({
      where: eq(memories.content, input.query),
      limit: input.limit ?? 10,
    });
    return memories;
  });

// Client usage - fully typed
const memories = await getMemories({ query: 'user preferences' });
```

### Comparison to Convex

| Aspect | Convex | TanStack Start |
|--------|--------|----------------|
| Server functions | `query`, `mutation`, `action` | `createServerFn` |
| Real-time | Built-in subscriptions | Manual (SSE, WebSockets) |
| Database | Convex DB (proprietary) | Any (Drizzle, Prisma) |
| Type safety | Good | Excellent (fully inferred) |
| "use node" | Required for non-pure | Not needed (always Node) |
| Local dev | Cloud-connected | Fully local |

Sources: [Server Functions Guide](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions), [TanStack Start InfoQ](https://www.infoq.com/news/2025/11/tanstack-start-v1/)

---

## TanStack Query v5

### What It Is

The industry-standard data fetching library. Handles caching, background updates, stale-while-revalidate, and more.

### Key Features for Galatea

| Feature | Description | Galatea Use |
|---------|-------------|-------------|
| **Suspense Support** | `useSuspenseQuery` for streaming SSR | ✅ Chat loading states |
| **Streaming Queries** | `streamedQuery` for AI responses | ✅ LLM streaming |
| **Mutations** | Optimistic updates, rollback | ✅ Memory writes |
| **Infinite Queries** | Paginated data | ✅ Chat history |
| **Prefetching** | Server-side data loading | ✅ Initial context |

### Streaming AI Responses

```typescript
import { useQuery } from '@tanstack/react-query';
import { streamedQuery } from '@tanstack/react-query/streamedQuery';

// Stream LLM response
const { data: chunks } = useQuery({
  queryKey: ['chat', messageId],
  queryFn: streamedQuery({
    queryFn: async function* () {
      const response = await fetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message }),
      });

      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield new TextDecoder().decode(value);
      }
    },
  }),
});

// chunks is an array that grows as data streams in
const fullResponse = chunks?.join('') ?? '';
```

Sources: [TanStack Query v5 Announcement](https://tanstack.com/blog/announcing-tanstack-query-v5), [streamedQuery Reference](https://tanstack.com/query/v5/docs/reference/streamedQuery)

---

## TanStack DB (Beta)

### What It Is

Reactive client store that extends TanStack Query with collections, live queries, and optimistic mutations. Designed for local-first sync.

### Core Primitives

| Primitive | Description | Galatea Use |
|-----------|-------------|-------------|
| **Collections** | Typed data containers | Memory cache, session state |
| **Live Queries** | Reactive queries with fine-grained updates | Real-time UI updates |
| **Optimistic Mutations** | Instant UI updates with sync | Memory writes |

### Collection Types

| Collection | Backend | Galatea Use |
|------------|---------|-------------|
| **ElectricCollection** | PostgreSQL via ElectricSQL | ❓ Future consideration |
| **TrailBaseCollection** | Self-hosted backend | ❓ Possible |
| **RxDBCollection** | Local-first persistence | ✅ Local memory cache |
| **PowerSyncCollection** | SQLite offline-first | ✅ Alternative |
| **Custom** | Any backend/API | ✅ Graphiti integration |

### Why This Matters for Galatea

TanStack DB could provide:
1. **Local memory cache** - Fast access to frequently-used memories
2. **Optimistic updates** - Instant UI feedback when saving memories
3. **Fine-grained reactivity** - Only re-render affected components
4. **Sync flexibility** - Works with any backend including Graphiti

### Example Integration

```typescript
import { createCollection, liveQuery } from '@tanstack/db';

// Define memory collection
const memoriesCollection = createCollection<Memory>({
  name: 'memories',
  primaryKey: 'id',
});

// Live query with fine-grained reactivity
const recentMemories = liveQuery(
  memoriesCollection,
  (memories) => memories
    .filter(m => m.type === 'episodic')
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10)
);

// Component only re-renders when these specific memories change
function RecentMemories() {
  const memories = useQuery(recentMemories);
  return <MemoryList memories={memories} />;
}
```

Sources: [TanStack DB Overview](https://tanstack.com/db/latest/docs), [Electric + TanStack DB](https://electric-sql.com/blog/2025/07/29/local-first-sync-with-tanstack-db), [Neon Blog](https://neon.com/blog/tanstack-db-and-electricsql)

---

## TanStack AI (Alpha)

### What It Is

Type-safe AI SDK announced December 2025. Framework-agnostic, works with OpenAI, Anthropic, Gemini, Ollama.

### Comparison to Vercel AI SDK

| Aspect | Vercel AI SDK | TanStack AI |
|--------|---------------|-------------|
| Maturity | Production-ready | Alpha |
| Type safety | Flexible (provider options) | Per-model strict |
| Framework | Next.js focused | Framework-agnostic |
| Isomorphic | Limited | Full (same code client/server) |
| Provider lock-in | Some | Explicitly avoided |

### Current Recommendation

**Use Vercel AI SDK for now.** It's mature, well-documented, and has official TanStack Start integration.

```bash
npm install ai @ai-sdk/react @ai-sdk/anthropic
```

TanStack AI is promising for future migration when it reaches stability.

Sources: [TanStack AI vs Vercel AI SDK](https://blog.logrocket.com/tanstack-vs-vercel-ai-library-react), [Vercel AI SDK + TanStack Start](https://ai-sdk.dev/docs/getting-started/tanstack-start), [TanStack AI Review](https://www.stork.ai/blog/tanstack-ai-the-vercel-killer-we-needed)

---

## TanStack Form v1

### What It Is

Cross-framework form library with type-safe validation. Supports React, Vue, Angular, Solid, Lit.

### Key Features

| Feature | Description | Galatea Use |
|---------|-------------|-------------|
| **Schema Validation** | Zod, Valibot, Yup support | ✅ Settings forms |
| **Dynamic Validation** | Rules change based on state | ✅ Conditional inputs |
| **Async Validation** | Debounced API validation | ✅ Username checks |
| **Cross-framework** | Same API everywhere | ✅ Consistency |

### Example

```typescript
import { useForm } from '@tanstack/react-form';
import { z } from 'zod';

const settingsSchema = z.object({
  persona: z.enum(['programmer', 'assistant']),
  knowledgeThreshold: z.number().min(0).max(1),
  hardRules: z.array(z.string()),
});

function SettingsForm() {
  const form = useForm({
    defaultValues: { persona: 'programmer', knowledgeThreshold: 0.7, hardRules: [] },
    onSubmit: async ({ value }) => {
      await updateSettings(value);
    },
    validators: {
      onChange: settingsSchema,
    },
  });

  return (
    <form onSubmit={form.handleSubmit}>
      <form.Field name="persona">
        {(field) => <Select {...field} options={['programmer', 'assistant']} />}
      </form.Field>
      {/* ... */}
    </form>
  );
}
```

Sources: [TanStack Form Validation](https://tanstack.com/form/latest/docs/framework/react/guides/validation), [TanStack Form v1 Features](https://securityboulevard.com/2025/05/introducing-tanstack-form-v1-key-features-and-insights/)

---

## TanStack Table v8

### What It Is

Headless UI library for building data grids. Framework-agnostic with React, Vue, Solid, Svelte bindings.

### Key Features

| Feature | Description | Galatea Use |
|---------|-------------|-------------|
| **Headless** | No markup, full control | ✅ Custom memory browser |
| **Virtualization** | Via TanStack Virtual | ✅ Large memory lists |
| **Sorting/Filtering** | Built-in, customizable | ✅ Memory search |
| **Row Selection** | Single/multi select | ✅ Bulk operations |
| **Column Resizing** | Drag to resize | ✅ Data exploration |

### Galatea Use Cases

- Memory browser (episodic, semantic, procedural)
- Tool execution history
- Observation timeline
- Session management

Sources: [TanStack Table Overview](https://tanstack.com/table/v8/docs/overview), [Virtualization Guide](https://tanstack.com/table/v8/docs/guide/virtualization)

---

## Drizzle ORM Integration

### Why Drizzle

| Feature | Benefit |
|---------|---------|
| **Type-safe** | Schema = TypeScript types |
| **SQL-like** | Familiar query syntax |
| **Lightweight** | No runtime overhead |
| **Migrations** | Built-in migration tools |
| **Multi-DB** | SQLite, PostgreSQL, MySQL |

### TanStack Start + Drizzle Templates

Several production-ready templates exist:
- [react-tanstarter](https://github.com/dotnize/react-tanstarter) - TanStack Start + Better Auth + Drizzle + shadcn/ui
- [tanstack-drizzle](https://github.com/lef237/tanstack-drizzle) - Full-stack TypeScript framework

### Example Schema

```typescript
// db/schema.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const memories = sqliteTable('memories', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['episodic', 'semantic', 'procedural'] }).notNull(),
  content: text('content').notNull(),
  confidence: real('confidence').default(1.0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  validUntil: integer('valid_until', { mode: 'timestamp' }),
  source: text('source'),
});

export const homeostasisState = sqliteTable('homeostasis_state', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  knowledgeSufficiency: text('knowledge_sufficiency', { enum: ['LOW', 'OK', 'HIGH'] }),
  certaintyAlignment: text('certainty_alignment', { enum: ['LOW', 'OK', 'HIGH'] }),
  progressMomentum: text('progress_momentum', { enum: ['LOW', 'OK', 'HIGH'] }),
  communicationHealth: text('communication_health', { enum: ['LOW', 'OK', 'HIGH'] }),
  productiveEngagement: text('productive_engagement', { enum: ['LOW', 'OK', 'HIGH'] }),
  knowledgeApplication: text('knowledge_application', { enum: ['LOW', 'OK', 'HIGH'] }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
```

Sources: [TanStack Start + Drizzle](https://github.com/aaronksaunders/tanstack-start-drizzle-app), [Minimal Template](https://dev.to/jqueryscript/a-minimal-tanstack-start-template-with-better-auth-drizzle-orm-4mei)

---

## Reuse Summary for Galatea

### What We Get "For Free"

| Component | TanStack Package | Effort |
|-----------|-----------------|--------|
| **Full-stack framework** | TanStack Start | Zero (use as-is) |
| **Data fetching/caching** | TanStack Query | Zero (use as-is) |
| **Routing** | TanStack Router | Zero (included in Start) |
| **Forms** | TanStack Form | Zero (use as-is) |
| **Data tables** | TanStack Table | Zero (use as-is) |
| **Virtualization** | TanStack Virtual | Zero (use as-is) |
| **AI streaming** | Vercel AI SDK | Zero (official integration) |
| **Database** | Drizzle ORM | Low (schema definition) |
| **Auth** | Better Auth | Low (configuration) |

### What We Build

| Component | Description | Effort |
|-----------|-------------|--------|
| **Graphiti Bridge** | Python subprocess or REST wrapper | Medium |
| **MQTT Client** | Subscribe to HA/Frigate topics | Low |
| **Activity Router** | Classification + model selection | Medium |
| **Homeostasis Engine** | 6-dimension assessment | Medium |
| **Memory UI** | Custom components using TanStack Table | Medium |
| **Chat Interface** | Streaming UI with Query | Low |

### Comparison: Convex vs TanStack Start

| What We Reuse | From Convex (ContextForge) | From TanStack |
|---------------|---------------------------|---------------|
| Database | Convex DB (proprietary) | Drizzle + SQLite/Postgres |
| Real-time | Built-in subscriptions | TanStack DB (optional) |
| Server logic | `query`/`mutation`/`action` | Server functions |
| Auth | Convex Auth | Better Auth |
| Crons | Built-in scheduled | External (worker process) |
| UI framework | React + Tailwind | React + Tailwind (same) |
| Components | shadcn/ui | shadcn/ui (same) |

**Net Reuse**: Similar amount, but TanStack gives us more control and local-first development.

---

## Recommended Stack for Galatea

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TanStack Start                                   │
│                    (Full-stack React framework)                          │
├─────────────────────────────────────────────────────────────────────────┤
│  TanStack Query    │  TanStack Form   │  TanStack Table                 │
│  (data + streaming)│  (settings UI)   │  (memory browser)               │
├─────────────────────────────────────────────────────────────────────────┤
│                         Drizzle ORM                                      │
│              (SQLite local / PostgreSQL production)                      │
├─────────────────────────────────────────────────────────────────────────┤
│  Vercel AI SDK     │  Better Auth     │  MQTT.js                        │
│  (LLM streaming)   │  (authentication)│  (HA/Frigate)                   │
└─────────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ Graphiti │   │ FalkorDB │   │Mosquitto │
        │ (Python) │   │ (Graph)  │   │ (MQTT)   │
        └──────────┘   └──────────┘   └──────────┘
```

---

## Next Steps

1. **Prototype**: Create minimal TanStack Start app with Drizzle
2. **Graphiti Bridge**: Test Python subprocess vs REST approach
3. **MQTT Integration**: Connect to existing HA/Frigate broker
4. **Migration Plan**: Define what to port from ContextForge

---

*Analysis completed: 2026-02-03*
