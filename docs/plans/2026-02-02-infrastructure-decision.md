# Infrastructure Decision: Convex vs MQTT+Postgres Stack

**Date**: 2026-02-02
**Status**: Decision Required
**Context**: Brainstorm session revealed tension between ContextForge reuse and optimal architecture

---

## The Core Tension

| Goal | Convex Path | MQTT+Postgres Path |
|------|-------------|-------------------|
| **ContextForge reuse (~75%)** | ✅ Direct fork | ❌ Rewrite backend |
| **Home Assistant/Frigate (free)** | ❌ Custom integration | ✅ Native MQTT |
| **Local-first / "any user"** | ❌ Cloud service | ✅ Self-contained |
| **Heavy content (LLM traces, images)** | ⚠️ 1MB doc limit | ✅ MinIO blobs |
| **CDC (change data capture)** | ⚠️ Triggers (bolt-on) | ✅ MQTT is the stream |
| **LLM code flexibility** | ✅ Same language everywhere | ⚠️ Need clear boundaries |
| **Time to prototype** | ✅ Fast | ⚠️ Slower |

---

## Options Matrix

### Option A: Stay with Convex (Current Plan)

**Description**: Fork ContextForge as planned. Accept limitations, migrate later if needed.

```
┌─────────────────────────────────────────────────────────────────┐
│  CONVEX (everything)                                            │
│  • Sessions, memories, activities                               │
│  • Real-time UI                                                 │
│  • LLM calls                                                    │
│  • CDC via triggers                                             │
│                                                                 │
│  + LangFuse (optional, for LLM trace UI)                        │
└─────────────────────────────────────────────────────────────────┘
```

**Ecosystem Intersection:**
| Component | Works? | Notes |
|-----------|--------|-------|
| MCP Servers (1000+) | ✅ Yes | Via Convex actions |
| Claude Code Skills | ✅ Yes | Port to preprompts |
| n8n Workflows | ✅ Yes | Webhook triggers |
| Home Assistant MCP | ⚠️ Partial | Need custom polling, no MQTT |
| Frigate | ⚠️ Partial | Need custom integration |
| LangFuse | ✅ Yes | Already integrated |

**12 Subsystems Intersection:**
| Subsystem | Convex Fit |
|-----------|-----------|
| Episodic Memory | ✅ Convex table + Mem0 |
| Semantic Memory | ✅ Convex table + Mem0 |
| Procedural Memory | ✅ Convex table + Mem0 |
| Curiosity Engine | ✅ Convex queries + LLM |
| Metacognition | ✅ Convex table |
| Tool Executor | ✅ Convex actions + MCP |
| Context Manager | ✅ Existing ContextForge |
| Personality Core | ✅ Convex preprompts table |
| Motivation Engine | ✅ Convex queries |
| Attention Manager | ✅ Convex queries |
| Initiative Engine | ✅ Convex queries |
| Homeostasis | ✅ Convex queries |

**Pros:**
- ✅ Fastest to prototype (6 weeks)
- ✅ 75% code reuse
- ✅ Same language frontend/backend
- ✅ Real-time UI built-in
- ✅ LLM code can live anywhere

**Cons:**
- ❌ 1MB document limit (large LLM traces problematic)
- ❌ Cloud-dependent (not "any user can download")
- ❌ Home Assistant/Frigate need custom work
- ❌ CDC is bolt-on (triggers)
- ❌ Cron limitations

**When to choose**: Speed to prototype matters most. Accept migration cost later.

**Timeline**: 6 weeks (as documented)

---

### Option B: MQTT + MinIO + Postgres (Clean Architecture)

**Description**: Build on robust, local-first infrastructure. Lose ContextForge backend reuse.

```
┌─────────────────────────────────────────────────────────────────┐
│  CAPTURE LAYER                                                  │
│  Digital (browser, VSCode, Claude Code) → publish to MQTT       │
│  Physical (Home Assistant, Frigate) → already on MQTT           │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  MQTT BROKER (Mosquitto)                                        │
│  • Lightweight notifications                                    │
│  • Content references (not blobs)                               │
│  • Home Assistant / Frigate native                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  STORAGE LAYER                                                  │
│                                                                 │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐           │
│  │  Postgres   │   │   MinIO     │   │  LangFuse   │           │
│  │ (metadata)  │   │  (blobs)    │   │ (LLM traces)│           │
│  └─────────────┘   └─────────────┘   └─────────────┘           │
│                                                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  APPLICATION LAYER                                              │
│  Node.js (Hono/Fastify) + React                                 │
│  Drizzle ORM                                                    │
└─────────────────────────────────────────────────────────────────┘
```

**Ecosystem Intersection:**
| Component | Works? | Notes |
|-----------|--------|-------|
| MCP Servers (1000+) | ✅ Yes | Via Node.js |
| Claude Code Skills | ✅ Yes | Port to preprompts |
| n8n Workflows | ✅ Yes | Webhook triggers |
| Home Assistant MCP | ✅ Native | Already speaks MQTT |
| Frigate | ✅ Native | Already speaks MQTT |
| LangFuse | ✅ Yes | Uses same Postgres |

**12 Subsystems Intersection:**
| Subsystem | Postgres+MQTT Fit |
|-----------|-------------------|
| Episodic Memory | ✅ Postgres + Mem0 |
| Semantic Memory | ✅ Postgres + Mem0 |
| Procedural Memory | ✅ Postgres + Mem0 |
| Curiosity Engine | ✅ Postgres queries + LLM |
| Metacognition | ✅ Postgres table |
| Tool Executor | ✅ Node.js + MCP |
| Context Manager | ⚠️ Rebuild |
| Personality Core | ✅ Postgres preprompts |
| Motivation Engine | ✅ Postgres queries |
| Attention Manager | ✅ Postgres queries |
| Initiative Engine | ✅ Postgres queries |
| Homeostasis | ✅ Postgres queries |

**Pros:**
- ✅ Home Assistant / Frigate free integration
- ✅ Local-first ("any user can download")
- ✅ No document size limits
- ✅ MQTT is native CDC
- ✅ Clean separation of concerns
- ✅ Beta-level simulation (full life observation)

**Cons:**
- ❌ Lose ContextForge backend (~50% more work)
- ❌ Need to build real-time layer (WebSocket/SSE)
- ❌ More infrastructure to manage
- ❌ 10-12 weeks instead of 6

**When to choose**: Building for scale/distribution from day one.

**Timeline**: 10-12 weeks

**What's Still Reusable from ContextForge:**
| Component | Reusable? |
|-----------|-----------|
| React patterns | ✅ Yes |
| shadcn/ui components | ✅ Yes |
| TanStack Router | ✅ Yes |
| LLM call patterns | ⚠️ Adapt |
| Convex schema | ❌ Rewrite as Drizzle |
| Convex functions | ❌ Rewrite as API routes |
| Real-time subscriptions | ❌ Rewrite as WebSocket |

**Actual reuse: ~30-40%** (frontend only)

---

### Option C: Hybrid (Convex UI + Postgres Observation)

**Description**: Keep Convex for UI/chat. Add Postgres for observation pipeline.

```
┌─────────────────────────────────────────────────────────────────┐
│  CONVEX (Application Layer)                                     │
│  • Chat interface                                               │
│  • Memory display (reads from Postgres)                         │
│  • Real-time UI                                                 │
│  • Session management                                           │
└────────────────────────────┬────────────────────────────────────┘
                             │ Reads from
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  MQTT + POSTGRES (Observation Layer)                            │
│  • Activity capture                                             │
│  • Heavy content storage                                        │
│  • Enrichment pipeline                                          │
│  • Home Assistant / Frigate                                     │
└─────────────────────────────────────────────────────────────────┘
```

**Pros:**
- ✅ Keep Convex real-time UI
- ✅ Proper observation architecture
- ✅ Home Assistant / Frigate work

**Cons:**
- ❌ Two systems to maintain
- ❌ Data sync complexity
- ❌ Highest complexity

**When to choose**: Want both benefits, accept complexity.

**Timeline**: 8-10 weeks

---

### Option D: Minimal CLI First (Prove Thesis Fast)

**Description**: Skip infrastructure. Build simplest thing that proves the thesis.

```
┌─────────────────────────────────────────────────────────────────┐
│  GALATEA CLI                                                    │
│                                                                 │
│  1. Intercept Claude Code hooks                                 │
│  2. Append to JSONL file                                        │
│  3. Before each prompt, inject relevant history                 │
│  4. Measure if responses improve                                │
│                                                                 │
│  No database. No MQTT. No UI. Just: capture → file → inject     │
└─────────────────────────────────────────────────────────────────┘
```

**Ecosystem Intersection:**
| Component | Works? | Notes |
|-----------|--------|-------|
| MCP Servers | ✅ Yes | Direct CLI integration |
| Claude Code Skills | ✅ Yes | Direct injection |
| Home Assistant | ❌ No | Not in scope |
| Frigate | ❌ No | Not in scope |
| LangFuse | ⚠️ Optional | For tracing |

**12 Subsystems Intersection:**
| Subsystem | CLI Fit |
|-----------|---------|
| Episodic Memory | ⚠️ JSONL file |
| Semantic Memory | ⚠️ JSONL file |
| Procedural Memory | ⚠️ JSONL file |
| Curiosity Engine | ⚠️ Hardcoded prompts |
| Metacognition | ⚠️ Manual review |
| Tool Executor | ✅ Claude Code native |
| Context Manager | ✅ Inject from file |
| Personality Core | ✅ Preprompt file |
| Motivation/Attention/Initiative/Homeostasis | ❌ Not applicable |

**Pros:**
- ✅ Fastest to working prototype (1-2 weeks)
- ✅ Proves/disproves thesis quickly
- ✅ Zero infrastructure
- ✅ Learn what actually matters

**Cons:**
- ❌ Not a real product
- ❌ No UI
- ❌ No physical world observation
- ❌ Will need rebuild

**When to choose**: Uncertainty about thesis. Need fast validation.

**Timeline**: 1-2 weeks to prototype, then reassess

---

### Option E: Convex First, Planned Migration (Recommended)

**Description**: Start with Convex. Layer abstractions for future migration. Move to Postgres when you hit limits.

```
Phase 1 (Week 1-6): Convex
┌─────────────────────────────────────────────────────────────────┐
│  CONVEX (everything)                                            │
│  But: storage abstraction interface                             │
│  But: CDC via triggers (same pattern as Postgres later)         │
│  But: document known limitations                                │
└─────────────────────────────────────────────────────────────────┘

Phase 2 (When needed): Add Postgres for observation
┌─────────────────────────────────────────────────────────────────┐
│  CONVEX (UI) ←──reads──→ POSTGRES (observation)                 │
└─────────────────────────────────────────────────────────────────┘

Phase 3 (If needed): Full migration
┌─────────────────────────────────────────────────────────────────┐
│  POSTGRES + Node.js (everything)                                │
│  React frontend preserved                                       │
└─────────────────────────────────────────────────────────────────┘
```

**Key Abstractions to Build:**

```typescript
// Storage abstraction (swap implementation later)
interface ActivityStore {
  insert(event: ActivityEvent): Promise<string>;
  getUnprocessed(limit: number): Promise<ActivityEvent[]>;
  markProcessed(ids: string[]): Promise<void>;
  query(filter: ActivityFilter): Promise<ActivityEvent[]>;
}

// Implementation: ConvexActivityStore now
// Implementation: PostgresActivityStore later
```

**Migration Triggers:**
| Trigger | Action |
|---------|--------|
| 1MB document limit hit | Move heavy content to MinIO |
| Need offline/local | Add Postgres for observation |
| Need Home Assistant | Add MQTT layer |
| Cost exceeds budget | Evaluate full migration |

**Ecosystem Intersection:**
Same as Option A initially, expands to Option B over time.

**12 Subsystems Intersection:**
All work in Convex initially. Migration doesn't change subsystem logic.

**Pros:**
- ✅ Fast start (6 weeks)
- ✅ ContextForge reuse
- ✅ Planned migration path
- ✅ Learn what actually needs scaling
- ✅ Don't over-engineer upfront

**Cons:**
- ⚠️ Some throwaway work
- ⚠️ Need discipline on abstractions
- ⚠️ Migration has cost

**When to choose**: Want speed AND future flexibility.

**Timeline**: 6 weeks + migration when needed

---

## Decision Framework

### Choose Option A (Pure Convex) if:
- You're confident you won't need Home Assistant/Frigate
- Cloud dependency is acceptable
- 1MB doc limit won't be hit often
- Speed is paramount

### Choose Option B (MQTT+Postgres) if:
- Home Assistant/Frigate is day-one requirement
- "Any user can download" is critical
- You're willing to invest 10-12 weeks
- Scale/distribution is the goal

### Choose Option C (Hybrid) if:
- You want both benefits
- You can manage complexity
- You have clear boundaries between systems

### Choose Option D (CLI First) if:
- You're not sure the thesis is valid
- You want to learn before committing
- 1-2 weeks of throwaway work is acceptable

### Choose Option E (Convex + Planned Migration) if:
- You want fast start with future flexibility
- You're disciplined about abstractions
- You accept some migration cost later
- This is the pragmatic middle ground

---

## Recommendation

**Option E: Convex First, Planned Migration**

**Rationale:**

1. **Pragmatic** - Get working prototype in 6 weeks
2. **Iterative** - Learn what actually needs scaling
3. **Reuse** - Leverage ContextForge now

**Key Disciplines:**

1. **Storage abstraction interface** - Don't couple pipeline to Convex directly
2. **CDC via triggers** - Pattern ports to Postgres later
3. **Document limitations** - Know when to migrate
4. **Keep frontend portable** - React + shadcn work anywhere

**Migration Triggers (documented):**

| Limitation | Threshold | Action |
|------------|-----------|--------|
| Document size | >500KB frequently | Add MinIO for blobs |
| Offline requirement | User requests | Add Postgres |
| Home Assistant | User requests | Add MQTT |
| Cost | >$200/month | Evaluate migration |

---

## Impact on Existing Documents

### FINAL_MINIMAL_ARCHITECTURE.md

**Changes needed:**
1. Add storage abstraction interface requirement
2. Add migration triggers section
3. Update "What We're NOT Building" to include migration plan
4. Add Convex limitations section

### ECOSYSTEM_REUSE.md

**Changes needed:**
1. Add MQTT ecosystem section (Home Assistant, Frigate)
2. Note that MCP works regardless of backend choice
3. Add MinIO for blob storage
4. Update integration methods for each backend option

### OBSERVATION_PIPELINE.md

**Changes needed:**
1. Add storage abstraction interface
2. Document CDC approach for both Convex and Postgres
3. Add MQTT variant for future
4. Note that pipeline logic is backend-agnostic

---

## Next Steps

1. **Decide**: Which option?
2. **Document**: Update architecture docs with chosen path
3. **Abstract**: Build storage interface before implementation
4. **Proceed**: Start Week 1

---

*Decision document created: 2026-02-02*
*Requires: User decision on option*
