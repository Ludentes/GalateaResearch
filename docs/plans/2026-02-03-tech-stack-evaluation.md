# Tech Stack Evaluation: Convex vs TanStack Start

**Date**: 2026-02-03
**Status**: Analysis Complete, Decision Pending
**Related**: [CONTEXTFORGE_REUSE.md](../CONTEXTFORGE_REUSE.md), [OBSERVATION_PIPELINE.md](../OBSERVATION_PIPELINE.md)

---

## Context

Galatea inherits ContextForge's Convex-based stack. Now that we understand the full architecture (Activity Router, Homeostasis, Graphiti memory, Observation Pipeline), we need to validate whether Convex is still the right choice for early local-first development.

---

## Convex Analysis

### Benefits (Why We Chose It)

| Benefit | Impact |
|---------|--------|
| **Sync just works** | Major - previous Python version had endless sync bugs |
| **Client/server code mobility** | Medium - easy to move logic between layers |
| **TypeScript everywhere** | Major - type safety, single language |
| **Real-time subscriptions** | Medium - built-in reactivity |
| **Scheduled functions (crons)** | Medium - built-in, no external service |
| **Auth built-in** | Minor - Convex Auth works but not critical |

### Pain Points (From ContextForge Experience)

| Pain Point | Severity | Workaround |
|------------|----------|------------|
| **"use node" friction** | Medium | Required for any non-pure functions (HTTP, external APIs) |
| **Cloud-first orientation** | Medium | Local dev works but dashboard is limited |
| **Rudimentary dashboard** | Medium | Need custom endpoints for data management |
| **Streaming with non-pure** | Medium | Worked around for LLMs, but hacky |
| **Env variable handling** | Minor | Annoying but solvable |

### Key Question: Do We Need Sync?

Galatea's interaction patterns:

| Pattern | Sync Needed? |
|---------|--------------|
| **Chat interface** | No - request/response + streaming |
| **Memory queries** | No - request/response |
| **Homeostasis display** | Maybe - could poll or use SSE |
| **Tool execution** | No - request/response |
| **Observation ingestion** | No - fire and forget |
| **Background crons** | No - server-side only |

**Conclusion**: Galatea is mostly request/response + streaming. Real-time sync is nice-to-have, not essential.

---

## TanStack Start Analysis

### What It Is

- Full-stack React framework from TanStack (creators of React Query, Router, etc.)
- Server functions (like tRPC but simpler)
- Nitro-based deployment (Vercel, Cloudflare, self-hosted)
- TypeScript end-to-end
- Works with any database (Drizzle + SQLite for local, PostgreSQL for production)

### Benefits

| Benefit | Impact |
|---------|--------|
| **Local-first** | Major - SQLite file, no cloud dependency |
| **Direct Node.js** | Major - no "use node" friction |
| **Familiar patterns** | Medium - standard React, standard SQL |
| **Flexible deployment** | Medium - Nitro works anywhere |
| **Full database control** | Medium - Drizzle migrations, direct SQL |

### Gaps vs Convex

| Gap | Solution | Effort |
|-----|----------|--------|
| **No built-in crons** | External worker, BullMQ, or defer | Medium |
| **No real-time sync** | SSE, WebSockets, or polling | Low (we don't need much) |
| **No built-in auth** | Better-auth, Lucia, or Auth.js | Low |
| **Manual migrations** | Drizzle handles this | Low |

---

## Observation Pipeline Fit

How each stack handles our event patterns:

| Pattern | Convex | TanStack Start |
|---------|--------|----------------|
| **Inbound HTTP (extensions)** | ✅ HTTP actions | ✅ Server functions |
| **Background crons** | ✅ Built-in scheduled functions | ⚠️ Needs external solution |
| **Dialogue polling/SSE** | ✅ Subscriptions | ✅ SSE or polling |
| **MCP tool execution** | ⚠️ "use node" required | ✅ Direct Node.js |

### Cron Options for TanStack Start

1. **Defer for MVP** - Manual triggers only, add crons when needed
2. **Simple worker process** - Node.js setInterval, runs alongside server
3. **BullMQ + Redis** - Production-ready job queue, but adds Redis dependency
4. **External service** - Render cron jobs, GitHub Actions, etc.

---

## MQTT Consideration

For the event-based Observation Pipeline, MQTT provides an alternative to HTTP polling:

### What MQTT Offers

| Feature | Benefit for Galatea |
|---------|---------------------|
| **Pub/Sub model** | Extensions publish events, server subscribes |
| **Persistent connections** | No polling overhead |
| **QoS levels** | Guaranteed delivery for important events |
| **Topic hierarchy** | `galatea/user123/browser/navigation` |
| **Lightweight** | Designed for IoT, minimal overhead |

### MQTT Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Browser Ext     │────▶│                 │     │                 │
├─────────────────┤     │  MQTT Broker    │────▶│  Galatea Server │
│ VSCode Ext      │────▶│  (Mosquitto)    │     │  (Subscriber)   │
├─────────────────┤     │                 │     │                 │
│ Terminal Agent  │────▶│                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Topic Structure

```
galatea/
├── {user_id}/
│   ├── browser/
│   │   ├── navigation    # URL changes
│   │   ├── selection     # Text selections
│   │   └── form          # Form interactions
│   ├── editor/
│   │   ├── file_open     # File opened
│   │   ├── save          # File saved
│   │   └── error         # Diagnostics
│   └── terminal/
│       ├── command       # Commands run
│       └── output        # Command output
```

### Comparison: HTTP vs MQTT for Observations

| Aspect | HTTP Endpoints | MQTT |
|--------|---------------|------|
| **Connection model** | Request per event | Persistent |
| **Latency** | Higher (connection setup) | Lower |
| **Server complexity** | Simple (standard REST) | Needs broker |
| **Client complexity** | Simple (fetch) | Needs MQTT client |
| **Offline handling** | Client must retry | Broker queues |
| **Scalability** | Stateless, easy | Broker handles |

### Recommendation

**Include MQTT from the start for ecosystem integration.**

Key insight: MQTT isn't about efficiency - it's about **ecosystem access**. With MQTT, Galatea gets:
- Home Assistant integration (presence, sensors, lights, climate)
- Frigate integration (person/car/pet detection, camera events)
- Zigbee/Z-Wave devices via zigbee2mqtt
- Any IoT device that speaks MQTT

These systems already have MQTT configured - we just subscribe.

### Setup

| Component | Effort |
|-----------|--------|
| Mosquitto broker | Already running if HA/Frigate exist |
| MQTT.js client | ~1 hour to wire up |
| Topic routing | Map topics → observation pipeline |

### Topic Subscriptions

```typescript
client.subscribe([
  'homeassistant/#',           // All HA state changes
  'frigate/events',            // Camera detections
  'zigbee2mqtt/+',             // Zigbee devices
  'galatea/extensions/+',      // Our browser/VSCode extensions
]);
```

### Context Examples

- Frigate: "Person at front door" → episodic memory → "Someone's here, want to pause?"
- HA motion sensor: User in office → relationship model presence → OK to notify
- HA lights off: User probably away → lower communication_health threshold

---

## Decision Matrix

| Criterion | Convex | TanStack Start |
|-----------|--------|----------------|
| Local development | ⚠️ Cloud-first mindset | ✅ SQLite file |
| Non-pure functions | ⚠️ "use node" friction | ✅ Direct Node.js |
| Crons | ✅ Built-in | ⚠️ External solution |
| Real-time sync | ✅ Excellent | ⚠️ Manual (but we don't need much) |
| Learning curve | ✅ Known from ContextForge | ⚠️ New patterns |
| Migration effort | ✅ None | ⚠️ Rewrite data layer |
| MCP integration | ⚠️ Indirect | ✅ Direct |
| Graphiti integration | ⚠️ HTTP wrapper needed | ✅ Direct Python bridge |

---

## Recommended Path

### Option A: Stay with Convex (Conservative)

- Keep 70% reuse from ContextForge
- Accept "use node" friction
- HTTP wrapper for Graphiti calls
- Dashboard limitations manageable

**Best if**: Development speed matters more than local debugging experience.

### Option B: TanStack Start (Progressive)

- Local-first development
- Direct Node.js for everything
- Drizzle + SQLite (local) / PostgreSQL (production)
- Add cron solution when needed

**Best if**: Local debugging and direct integrations matter more than sync.

### Option C: Hybrid (Tactical)

- Use Convex for what it's good at (auth, real-time UI state)
- Use TanStack Start patterns for Graphiti/MCP integration
- Gradually migrate as pain points accumulate

**Best if**: Want to preserve investment while adding flexibility.

---

## Open Questions

1. **Cron decision**: Defer, worker process, or BullMQ?
2. **Migration timing**: Now or after MVP proves the architecture?
3. **Graphiti bridge**: REST wrapper vs direct Python bridge?

---

*Analysis completed: 2026-02-03*
*Decision: Pending user input on cron strategy*
