# Logging Architecture Design

**Date**: 2026-02-02
**Status**: Draft
**Decision**: Start with Convex, layer for future migration

---

## Decision Summary

### The Trade-off

| Factor | Convex | PostgreSQL |
|--------|--------|------------|
| **Time to prototype** | Fast (ContextForge reuse) | Slower (new backend) |
| **Local-first** | Poor | Excellent |
| **Text storage limits** | 1MB/doc | Unlimited |
| **Cron flexibility** | Limited | Full |
| **"Any user" deployment** | Cloud-dependent | Self-hostable |
| **LLM code flexibility** | Excellent (frontend/backend) | Requires clear boundary |
| **Data sync** | Built-in real-time | Manual (WebSocket/SSE) |

### Decision: Start with Convex

**Rationale:**
1. **Prototyping speed** - Convex + ContextForge gets us to working prototype fastest
2. **LLM code mobility** - With LLMs, code naturally migrates between frontend and backend. Convex makes this frictionless (same language, same environment)
3. **Data sync** - Real-time subscriptions are valuable for the dialogue system
4. **Accept future migration** - Once prototype validates the concept, we can rewrite the storage layer

**Key constraint:** Minimize integration surface so migration is tractable.

---

## Architecture: Layered for Migration

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: CAPTURE (MCP + Hooks)                                 │
│  Browser, VSCode, Terminal, Claude Code                         │
│  → Emits normalized ActivityEvent                               │
│                                                                 │
│  Migration impact: NONE (capture is external)                   │
└────────────────────────────┬────────────────────────────────────┘
                             │ ActivityEvent (defined interface)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: STORAGE ABSTRACTION                                   │
│                                                                 │
│  interface ActivityStore {                                      │
│    insert(event: ActivityEvent): Promise<Id>                    │
│    getUnprocessed(limit: number): Promise<ActivityEvent[]>      │
│    markProcessed(ids: Id[]): Promise<void>                      │
│    query(filter: ActivityFilter): Promise<ActivityEvent[]>      │
│  }                                                              │
│                                                                 │
│  Implementation: ConvexActivityStore (now)                      │
│  Future: PostgresActivityStore                                  │
│                                                                 │
│  Migration impact: SWAP IMPLEMENTATION                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3: CDC (Change Data Capture)                             │
│                                                                 │
│  Convex: Triggers via convex-helpers                            │
│  Future: pg_notify or polling                                   │
│                                                                 │
│  Output: Stream of changes to observation pipeline              │
│                                                                 │
│  Migration impact: SWAP IMPLEMENTATION                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 4: OBSERVATION PIPELINE                                  │
│  Enrichment → Dialogue → Memory Formation                       │
│                                                                 │
│  Consumes from CDC stream, doesn't know about storage impl      │
│                                                                 │
│  Migration impact: NONE (consumes abstract interface)           │
└─────────────────────────────────────────────────────────────────┘
```

---

## CDC with Convex Triggers

Convex supports database triggers via `convex-helpers`. Triggers run atomically within the mutation transaction.

### Setup

```typescript
// convex/triggers.ts
import { Triggers } from "convex-helpers/server/triggers";
import { mutation as rawMutation, internalMutation as rawInternalMutation } from "./_generated/server";
import { customMutation, customCtx } from "convex-helpers/server/customFunctions";

const triggers = new Triggers();

// CDC trigger: emit to observation pipeline on new activity
triggers.register("activities", async (ctx, change) => {
  if (change.operation === "insert") {
    // Queue for enrichment processing
    await ctx.db.insert("enrichmentQueue", {
      activityId: change.newDoc._id,
      status: "pending",
      createdAt: Date.now(),
    });
  }
});

// Export wrapped mutations that run triggers
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));
```

### Using Wrapped Mutations

```typescript
// convex/activities.ts
import { mutation } from "./triggers"; // Use wrapped version
import { v } from "convex/values";

export const insert = mutation({
  args: {
    source: v.string(),
    eventType: v.string(),
    summary: v.string(),
    details: v.optional(v.any()),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    // This insert automatically triggers CDC
    return await ctx.db.insert("activities", {
      ...args,
      processed: false,
      createdAt: Date.now(),
    });
  },
});
```

### Enrichment Queue Consumer

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Process enrichment queue every 30 seconds
crons.interval(
  "process-enrichment-queue",
  { seconds: 30 },
  internal.enrichment.processQueue
);

export default crons;
```

```typescript
// convex/enrichment.ts
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const processQueue = internalAction({
  handler: async (ctx) => {
    // Get pending items from queue
    const pending = await ctx.runQuery(internal.enrichmentQueue.getPending, {
      limit: 50,
    });

    if (pending.length === 0) return;

    // Get full activity records
    const activities = await ctx.runQuery(internal.activities.getByIds, {
      ids: pending.map(p => p.activityId),
    });

    // Run enrichment (calls LLM)
    const enrichment = await enrichActivities(activities);

    // Store results
    await ctx.runMutation(internal.activitySessions.createOrUpdate, {
      enrichment,
    });

    // Mark queue items as processed
    await ctx.runMutation(internal.enrichmentQueue.markProcessed, {
      ids: pending.map(p => p._id),
    });
  },
});
```

---

## Storage Abstraction Interface

Define clean interfaces so the observation pipeline doesn't depend on Convex directly.

```typescript
// src/lib/storage/types.ts

export interface ActivityEvent {
  id?: string;
  source: "browser" | "terminal" | "vscode" | "claude_code" | "manual";
  eventType: string;
  summary: string;
  details?: Record<string, unknown>;
  timestamp: number;
  sessionId: string;
}

export interface ActivitySession {
  id: string;
  startTime: number;
  endTime?: number;
  activityIds: string[];
  guessedIntent: string;
  confidence: number;
  validatedIntent?: string;
  status: "active" | "paused" | "completed" | "abandoned";
}

export interface ActivityStore {
  // Write
  insertActivity(event: Omit<ActivityEvent, "id">): Promise<string>;

  // Read
  getUnprocessedActivities(limit: number): Promise<ActivityEvent[]>;
  getActivitiesSince(timestamp: number): Promise<ActivityEvent[]>;
  getActivitySession(id: string): Promise<ActivitySession | null>;

  // Update
  markActivitiesProcessed(ids: string[]): Promise<void>;
  updateActivitySession(id: string, updates: Partial<ActivitySession>): Promise<void>;

  // Query
  queryActivities(filter: ActivityFilter): Promise<ActivityEvent[]>;
}

export interface ActivityFilter {
  source?: ActivityEvent["source"];
  since?: number;
  until?: number;
  sessionId?: string;
  processed?: boolean;
}
```

### Convex Implementation

```typescript
// src/lib/storage/convex-store.ts

import { ConvexClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { ActivityStore, ActivityEvent, ActivityFilter } from "./types";

export class ConvexActivityStore implements ActivityStore {
  constructor(private client: ConvexClient) {}

  async insertActivity(event: Omit<ActivityEvent, "id">): Promise<string> {
    return await this.client.mutation(api.activities.insert, event);
  }

  async getUnprocessedActivities(limit: number): Promise<ActivityEvent[]> {
    return await this.client.query(api.activities.getUnprocessed, { limit });
  }

  async markActivitiesProcessed(ids: string[]): Promise<void> {
    await this.client.mutation(api.activities.markProcessed, { ids });
  }

  // ... other methods
}
```

### Future PostgreSQL Implementation

```typescript
// src/lib/storage/postgres-store.ts (future)

import { drizzle } from "drizzle-orm/node-postgres";
import type { ActivityStore, ActivityEvent } from "./types";
import * as schema from "./schema";

export class PostgresActivityStore implements ActivityStore {
  constructor(private db: ReturnType<typeof drizzle>) {}

  async insertActivity(event: Omit<ActivityEvent, "id">): Promise<string> {
    const [result] = await this.db
      .insert(schema.activities)
      .values(event)
      .returning({ id: schema.activities.id });
    return result.id;
  }

  // ... same interface, different implementation
}
```

---

## Migration Checklist

When we hit Convex limits and need to migrate:

### Phase 1: Add PostgreSQL alongside Convex
- [ ] Set up PostgreSQL (local Docker or managed)
- [ ] Implement `PostgresActivityStore`
- [ ] Dual-write: activities go to both stores
- [ ] Verify data consistency

### Phase 2: Switch reads to PostgreSQL
- [ ] Update observation pipeline to read from PostgreSQL
- [ ] Keep Convex for UI real-time features
- [ ] Monitor for issues

### Phase 3: Remove Convex for logging
- [ ] Stop writing activities to Convex
- [ ] Migrate historical data if needed
- [ ] Remove Convex activity tables

### Phase 4 (optional): Full PostgreSQL
- [ ] Evaluate if Convex still provides value for UI
- [ ] If not, migrate remaining features
- [ ] Set up WebSocket/SSE for real-time if needed

---

## Known Limitations to Monitor

| Limitation | Trigger | Mitigation |
|------------|---------|------------|
| **1MB document limit** | Large Claude Code conversations | Split into chunks, or migrate early |
| **Cron minimum interval** | Need sub-30s processing | Use scheduled functions, accept latency |
| **Cloud dependency** | User wants offline | This triggers migration |
| **Cost** | Usage exceeds free tier | Evaluate migration vs paying |

---

## Event Schema (Convex)

```typescript
// convex/schema.ts

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Raw activity events
  activities: defineTable({
    sessionId: v.id("sessions"),
    source: v.union(
      v.literal("browser"),
      v.literal("terminal"),
      v.literal("vscode"),
      v.literal("claude_code"),
      v.literal("manual")
    ),
    eventType: v.string(),
    summary: v.string(),
    details: v.optional(v.any()),
    timestamp: v.number(),
    duration: v.optional(v.number()),
    processed: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_session_time", ["sessionId", "timestamp"])
    .index("by_unprocessed", ["processed", "createdAt"]),

  // CDC queue for enrichment
  enrichmentQueue: defineTable({
    activityId: v.id("activities"),
    status: v.union(v.literal("pending"), v.literal("processing"), v.literal("done")),
    createdAt: v.number(),
    processedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_status", ["status", "createdAt"]),

  // Enriched activity sessions
  activitySessions: defineTable({
    sessionId: v.id("sessions"),
    startTime: v.number(),
    endTime: v.optional(v.number()),
    activityIds: v.array(v.id("activities")),
    guessedIntent: v.string(),
    guessedIntentConfidence: v.number(),
    validatedIntent: v.optional(v.string()),
    relatedGoal: v.optional(v.string()),
    tags: v.array(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("completed"),
      v.literal("abandoned")
    ),
    needsValidation: v.boolean(),
    validatedAt: v.optional(v.number()),
  })
    .index("by_session", ["sessionId", "startTime"])
    .index("by_needs_validation", ["sessionId", "needsValidation"]),

  // ... rest of schema from OBSERVATION_PIPELINE.md
});
```

---

## Summary

**Decision**: Use Convex now, accept future migration.

**Why**:
- Prototyping speed (ContextForge reuse)
- LLM code flexibility (frontend/backend mobility)
- Real-time sync for dialogue UI

**How to make migration tractable**:
1. Storage abstraction interface
2. CDC via triggers (pattern ports to PostgreSQL)
3. Observation pipeline consumes abstract interface
4. Monitor known limitations

**Migration trigger**: 1MB doc limit, offline requirement, or cost.

---

## Future: MQTT Architecture (When Migrating)

When Home Assistant / Frigate integration is needed, or when "any user can download" becomes critical:

### Three-Layer Storage Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│  MQTT                                                           │
│  • Notifications only ("event X happened, content at Y")        │
│  • Lightweight payloads                                         │
│  • Home Assistant / Frigate native                              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  OBJECT STORAGE (MinIO / S3 / Local FS)                         │
│  • Blobs: images, large text, diffs                             │
│  • LLM request/response bodies (200k tokens = ~800KB)           │
│  • Referenced by ID                                             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  DATABASE (Postgres / SQLite)                                   │
│  • Metadata, relationships                                      │
│  • Queryable: "show me all events from yesterday"               │
│  • References blob IDs                                          │
└─────────────────────────────────────────────────────────────────┘
```

### Why MQTT?

| System | MQTT Support | Benefit |
|--------|--------------|---------|
| Home Assistant | Native | Free integration |
| Frigate | Native | Free integration |
| Zigbee2MQTT | Native | Smart home devices |
| Any IoT | Standard | Future-proof |

### MQTT Message Schema

```typescript
// Lightweight notifications only - NOT for heavy content
interface ActivityNotification {
  id: string;              // Reference to storage
  source: string;          // "browser", "home_assistant", etc.
  type: string;            // Event type
  summary: string;         // Human-readable, always small
  timestamp: number;

  // For lightweight events, include data inline
  data?: Record<string, unknown>;

  // For heavy events, reference storage
  contentRef?: {
    storage: "postgres" | "minio" | "langfuse";
    id: string;
    size?: number;
  };
}
```

### Heavy Content Handling

| Event Type | MQTT Message | Blob Storage |
|------------|--------------|--------------|
| Sensor reading | Full payload | None needed |
| Presence change | Full payload | None needed |
| Claude Code 200k | Summary + ref | Full in MinIO/LangFuse |
| Frigate image | Metadata + ref | Image via Frigate API |
| File diff | Path + summary | Full diff in MinIO |

---

## Physical World Capture (Future)

### Available MCP Servers

| System | MCP Server | Status |
|--------|------------|--------|
| Home Assistant | Official (2025.2+) | ✅ Ready |
| Frigate | Via HA integration | ✅ Ready |
| Obsidian | Community MCP | ✅ Available |

### Extended Event Types

```typescript
interface PhysicalActivity extends ActivityEvent {
  source: "home_assistant" | "frigate";
  eventType:
    | "presence_change"      // Entered/left room or home
    | "device_state_change"  // Light on, thermostat adjusted
    | "person_detected"      // Frigate saw someone
    | "routine_trigger"      // Automation fired
    | "environmental";       // Temp, humidity changed
  details: {
    entity_id?: string;      // HA entity
    zone?: string;           // Room/area
    old_state?: string;
    new_state?: string;
    person?: string;         // If identified
    confidence?: number;     // Detection confidence
  };
}
```

### Beta-Level Simulation Patterns

With physical + digital observation:

| Pattern | Source | Memory Type |
|---------|--------|-------------|
| "User wakes around 7am" | HA motion + lights | Semantic |
| "User works 9-12, then lunch" | Presence + activity | Procedural |
| "User prefers 21°C" | Thermostat patterns | Semantic |
| "User takes break when stuck" | Errors → presence change | Procedural |
| "Productivity drops after 6pm" | Code quality + time | Semantic |

---

## Related Documents

- **[Infrastructure Decision](./2026-02-02-infrastructure-decision.md)** - Full options analysis (A-E)
- **[OBSERVATION_PIPELINE.md](../OBSERVATION_PIPELINE.md)** - Pipeline architecture
- **[ECOSYSTEM_REUSE.md](../ECOSYSTEM_REUSE.md)** - MCP and tool ecosystem
- **[FINAL_MINIMAL_ARCHITECTURE.md](../FINAL_MINIMAL_ARCHITECTURE.md)** - 12 subsystems

---

*Design finalized: 2026-02-02*
*See infrastructure-decision.md for full options analysis*
