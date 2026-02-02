# ContextForge Reuse Analysis for Galatea

**Date**: 2026-02-01
**Purpose**: Identify what can be reused from ContextForgeTS for Galatea's minimal architecture

---

## Executive Summary

ContextForgeTS provides **substantial reusable infrastructure** (~80% of what Galatea needs). It already implements:
- ✅ Three-zone context management (PERMANENT, STABLE, WORKING)
- ✅ Convex backend with real-time database
- ✅ LLM integrations (Ollama, OpenRouter, Claude Code)
- ✅ Session management
- ✅ Token tracking and budgets
- ✅ LangFuse observability
- ✅ TypeScript throughout

**Recommendation**: Fork/extend ContextForgeTS rather than building from scratch. This maximizes our REUSE principle.

---

## What Exists in ContextForgeTS

### 1. Backend Infrastructure (Convex) ✅

**Location**: `/convex/`

**What's Built:**
```typescript
// Schema with 8 tables
- sessions      // Isolated workspaces
- blocks        // Content blocks in zones
- templates     // Reusable configurations
- projects      // Groups of sessions
- workflows     // Multi-step pipelines
- snapshots     // Session state saves
- generations   // LLM interaction tracking
- users         // Auth (Convex Auth)
```

**Reusable For Galatea:**
- ✅ **Sessions** → Agent instances (programmer vs assistant)
- ✅ **Blocks** → Context storage (episodic/semantic/procedural memories)
- ✅ **Zone system** → ContextForge PERMANENT/STABLE/WORKING
- ✅ **Generations** → Track LLM interactions for learning

**What We Add:**
- Memory type metadata (episodic vs semantic vs procedural)
- Curiosity metrics (confidence scores, gaps)
- Learning progress tracking
- Reflection/improvement logs

---

### 2. Context Assembly ✅

**Location**: `/convex/lib/context.ts`

**What's Built:**
```typescript
// Assembles blocks into messages
function assembleContext(
  blocks: Block[],
  userPrompt: string
): ContextMessage[]

// Order: PERMANENT → STABLE → WORKING → User prompt
// Cache-friendly structure
```

**Reusable For Galatea:**
- ✅ Already implements zone-based context
- ✅ Optimized for LLM caching (PERMANENT cached best)
- ✅ System prompt extraction

**What We Add:**
- Memory retrieval integration (pull from Mem0)
- Preprompt injection (personality layer)
- Reflection context (recent improvements)

---

### 3. LLM Integrations ✅

**Location**: `/convex/claudeNode.ts`, `/convex/lib/ollama.ts`, `/convex/lib/openrouter.ts`

**What's Built:**
- ✅ **Ollama** - Local models
- ✅ **Claude Code** - Claude agent SDK
- ✅ **OpenRouter** - Multi-provider API
- ✅ Streaming responses
- ✅ Token tracking
- ✅ Cost tracking

**Reusable For Galatea:**
- ✅ All LLM provider integrations
- ✅ Streaming infrastructure
- ✅ Usage metrics

**What We Add:**
- Confidence score extraction
- Curiosity gap detection
- Reflection loop integration
- MCP tool execution (Vercel AI SDK)

---

### 4. Session Management ✅

**Location**: `/convex/sessions.ts`

**What's Built:**
```typescript
- create(name, userId)
- list(userId)
- update(sessionId, updates)
- delete(sessionId)
- getBlocks(sessionId)
```

**Reusable For Galatea:**
- ✅ Multi-user support (each user has sessions)
- ✅ Isolated workspaces
- ✅ Token budgets per session

**What We Add:**
- Agent personality configuration per session
- Memory accumulation over sessions
- Learning progress per agent instance

---

### 5. Frontend UI ✅

**Location**: `/src/`

**What's Built:**
- ✅ React 19 + TypeScript
- ✅ TanStack Router
- ✅ Tailwind CSS + shadcn/ui
- ✅ Drag-and-drop blocks (@dnd-kit)
- ✅ Real-time updates (Convex subscriptions)
- ✅ Streaming LLM responses

**Reusable For Galatea:**
- ✅ Entire UI framework
- ✅ Component library (buttons, dialogs, forms)
- ✅ Streaming response display
- ✅ Session/project navigation

**What We Add:**
- Memory visualization
- Curiosity gap indicators
- Learning progress dashboard
- Reflection history viewer

---

### 6. Observability ✅

**Location**: `/convex/lib/langfuse.ts`

**What's Built:**
- ✅ LangFuse integration
- ✅ Trace generation calls
- ✅ Track token usage
- ✅ Log errors

**Reusable For Galatea:**
- ✅ All observability infrastructure
- ✅ Already configured with LangFuse

**What We Add:**
- Memory operation traces
- Curiosity exploration traces
- Reflection cycle traces
- Learning metrics

---

## What's Missing (Need to Add)

### 1. Memory System Integration

**Not in ContextForge:**
- Mem0 integration
- Episodic/semantic/procedural memory types
- Memory retrieval and storage

**Implementation:**
```typescript
// New Convex table
memories: defineTable({
  sessionId: v.id("sessions"),
  type: v.union(v.literal("episodic"), v.literal("semantic"), v.literal("procedural")),
  content: v.string(),
  metadata: v.object({
    timestamp: v.number(),
    confidence: v.optional(v.number()),
    tags: v.array(v.string()),
  }),
  mem0Id: v.optional(v.string()), // Link to Mem0 memory
})

// New Convex action
async function rememberToMem0(ctx, memory) {
  // Call Mem0 API to store
  // Store local reference
}

async function recallFromMem0(ctx, query) {
  // Query Mem0
  // Return relevant memories
}
```

---

### 2. Curiosity Engine

**Not in ContextForge:**
- Confidence scoring
- Gap identification
- Exploration tracking

**Implementation:**
```typescript
// New Convex table
curiosityGaps: defineTable({
  sessionId: v.id("sessions"),
  topic: v.string(),
  confidence: v.number(), // Low confidence = curiosity trigger
  explored: v.boolean(),
  exploredAt: v.optional(v.number()),
  findings: v.optional(v.string()),
})

// New Convex function
async function identifyGaps(ctx, sessionId, llmResponse) {
  // Extract confidence scores from LLM
  // Store low-confidence areas as gaps
  // Trigger exploration
}
```

---

### 3. Reflection Loop

**Not in ContextForge:**
- Post-task reflection
- Procedural memory updates
- Learning from mistakes

**Implementation:**
```typescript
// New Convex table
reflections: defineTable({
  sessionId: v.id("sessions"),
  taskDescription: v.string(),
  outcome: v.string(),
  whatWorked: v.string(),
  whatDidnt: v.string(),
  improvement: v.string(),
  createdAt: v.number(),
})

// New Convex function
async function reflect(ctx, sessionId, task, result) {
  // Reflexion pattern: draft → critique → revise
  // Store in procedural memory
  // Update future behavior
}
```

---

### 4. Preprompt System

**Not in ContextForge:**
- Personality configuration
- Role-based prompts (programmer vs assistant)
- Skill loading

**Implementation:**
```typescript
// New Convex table
preprompts: defineTable({
  name: v.string(), // "core_identity", "programmer", "assistant"
  content: v.string(),
  type: v.union(v.literal("core"), v.literal("role"), v.literal("skill")),
})

// New Convex table field (add to sessions)
sessions: defineTable({
  // ... existing fields
  personality: v.object({
    corePrompt: v.string(),
    rolePrompt: v.string(),
    skills: v.array(v.string()),
  }),
})
```

---

### 5. Learning Progress Tracking

**Not in ContextForge:**
- Success/failure tracking
- Learning Progress metric (MAGELLAN LP)
- Goal competence tracking

**Implementation:**
```typescript
// New Convex table
learningProgress: defineTable({
  sessionId: v.id("sessions"),
  goal: v.string(),
  attempts: v.array(v.object({
    timestamp: v.number(),
    success: v.boolean(),
    feedback: v.optional(v.string()),
  })),
  recentCompetence: v.number(),  // Recent success rate
  delayedCompetence: v.number(), // Historical success rate
  learningProgress: v.number(),  // |recent - delayed|
})

// New Convex function
async function trackProgress(ctx, sessionId, goal, success) {
  // Store attempt
  // Compute LP metric
  // Update curiosity priorities
}
```

---

### 6. MCP Tool Integration

**Not in ContextForge:**
- MCP protocol support
- Tool registry
- Tool execution tracking

**Implementation:**
```typescript
// Use Vercel AI SDK (already has MCP support)
// Add to ContextForge as new provider

// New Convex table
toolExecutions: defineTable({
  sessionId: v.id("sessions"),
  toolName: v.string(),
  params: v.any(),
  result: v.any(),
  success: v.boolean(),
  error: v.optional(v.string()),
  timestamp: v.number(),
})
```

---

## Reuse Strategy

### Phase 1: Fork ContextForge (Week 1)

**Action Items:**
1. Fork ContextForgeTS to `Galatea` repository
2. Rename to `Galatea`
3. Update branding/README
4. Test that existing functionality works

**Result:** Working ContextForge instance with three zones

---

### Phase 2: Add Memory (Week 2)

**Action Items:**
1. Add `memories` table to schema
2. Integrate Mem0 API
3. Add memory storage/retrieval functions
4. Update UI to show memory indicators

**Result:** Agent remembers facts, preferences, patterns

---

### Phase 3: Add Curiosity (Week 3-4)

**Action Items:**
1. Add `curiosityGaps` table
2. Extract confidence scores from LLM responses
3. Build gap identification logic
4. Add exploration UI

**Result:** Agent asks questions, explores gaps

---

### Phase 4: Add Reflection (Week 5-6)

**Action Items:**
1. Add `reflections` table
2. Implement Reflexion loop (draft → critique → revise)
3. Store learnings in procedural memory
4. Add reflection history UI

**Result:** Agent learns from mistakes, improves over time

---

### Phase 5: Add Preprompts (Week 6)

**Action Items:**
1. Add `preprompts` table
2. Create core identity prompt
3. Create programmer role prompt
4. Create assistant role prompt
5. Add personality configuration UI

**Result:** Same core, instantiate as programmer OR assistant

---

## Code Reuse Breakdown

| Component | Existing (ContextForge) | Need to Add | Reuse % |
|-----------|------------------------|-------------|---------|
| **Backend (Convex)** | Sessions, blocks, auth | Memory tables, curiosity, reflection | 70% |
| **Context Assembly** | Zone-based assembly | Memory injection, preprompts | 80% |
| **LLM Integration** | 3 providers, streaming | Confidence extraction, MCP tools | 60% |
| **Frontend UI** | Full React app | Memory viz, curiosity UI, reflection UI | 75% |
| **Observability** | LangFuse integration | Memory/curiosity traces | 90% |
| **Auth/Users** | Convex Auth | Nothing | 100% |

**Overall Reuse: ~75%**

---

## Modified Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (React)                            │
│              ✅ REUSE: ContextForge UI                           │
│              + Add: Memory/Curiosity/Reflection views           │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                   CONVEX BACKEND                                 │
│                                                                  │
│  ✅ REUSE:                          + ADD:                       │
│  • sessions (agent instances)       • memories table            │
│  • blocks (context storage)         • curiosityGaps table       │
│  • generations (LLM tracking)       • reflections table         │
│  • LLM integrations                 • learningProgress table    │
│  • LangFuse observability           • preprompts table          │
│                                     • Mem0 integration           │
│                                     • MCP tools (Vercel AI SDK)  │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    EXTERNAL SERVICES                             │
│                                                                  │
│  ✅ REUSE:                          + ADD:                       │
│  • Ollama (local LLM)               • Mem0 (memory)             │
│  • OpenRouter (cloud LLMs)          • Qdrant (vectors)          │
│  • Claude Code                      • Voyage AI (embeddings)    │
│  • LangFuse (observability)         • MCP servers (tools)       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Benefits of Reusing ContextForge

### 1. **Time Savings**
- ✅ Backend infrastructure: 2-3 weeks saved
- ✅ Frontend UI: 2-3 weeks saved
- ✅ LLM integrations: 1 week saved
- ✅ Auth/users: 1 week saved
- **Total: 6-10 weeks saved**

### 2. **Battle-Tested Code**
- ✅ Production-ready Convex schema
- ✅ Working LLM streaming
- ✅ Real-time updates tested
- ✅ E2E tests exist

### 3. **Familiar Stack**
- ✅ You already know Convex
- ✅ TypeScript throughout
- ✅ React patterns familiar

### 4. **Extensibility**
- ✅ Modular Convex functions (easy to add)
- ✅ Component-based UI (easy to extend)
- ✅ Schema migrations supported

---

## Risks & Mitigations

### Risk 1: ContextForge is UI-focused, Galatea is agent-focused

**Mitigation:**
- Keep ContextForge UI as "workspace view"
- Add agent-focused views (memory, curiosity, reflections)
- UI becomes control panel for psychological agent

### Risk 2: Schema changes might break existing ContextForge usage

**Mitigation:**
- Fork cleanly, don't modify in-place
- Add new tables (don't change existing)
- Backward compatible schema additions

### Risk 3: ContextForge might have limitations we don't know yet

**Mitigation:**
- Start with fork, not wholesale copy
- Keep option to pivot if needed
- Document assumptions as we go

---

## Decision Matrix

| Criterion | Build from Scratch | Extend ContextForge | Winner |
|-----------|-------------------|---------------------|--------|
| **Time to MVP** | 8-12 weeks | 2-4 weeks | ✅ Extend |
| **Reuse principle** | 0% reuse | ~75% reuse | ✅ Extend |
| **Iterative approach** | Long initial build | Working at each step | ✅ Extend |
| **Pragmatic** | Reinventing wheel | Leverage existing | ✅ Extend |
| **Flexibility** | Full control | Good extensibility | ✅ Extend |
| **Risk** | Lower (greenfield) | Higher (dependencies) | Scratch |

**Score: 5-1 in favor of extending ContextForge**

---

## Recommendation

**✅ EXTEND ContextForgeTS rather than building from scratch**

This maximizes our REUSE principle while staying pragmatic and iterative.

**Next Steps:**
1. Fork ContextForgeTS to Galatea
2. Add memory integration (Mem0)
3. Add curiosity engine
4. Add reflection loop
5. Add preprompts for personality

**Timeline:** 6 weeks to working Galatea core (vs 12+ weeks from scratch)

---

## Appendix: Mapping Minimal Architecture to ContextForge

| Galatea Component | ContextForge Equivalent | Status |
|------------------|------------------------|--------|
| **Memory System** | | |
| - Episodic Memory | blocks (type: episodic) + Mem0 | ADD |
| - Semantic Memory | blocks (type: semantic) + Mem0 | ADD |
| - Procedural Memory | blocks (type: procedural) + reflections | ADD |
| **Curiosity Engine** | N/A | ADD |
| **Tool Executor** | generations + MCP integration | EXTEND |
| **Context Manager** | convex/lib/context.ts | REUSE ✅ |
| **Personality Core** | preprompts table | ADD |
| **Metacognition** | reflections table | ADD |
| **LLM Integration** | claudeNode.ts, ollama.ts, openrouter.ts | REUSE ✅ |
| **Session Management** | sessions table | REUSE ✅ |
| **Observability** | LangFuse integration | REUSE ✅ |
| **UI** | React app | REUSE ✅ + EXTEND |

---

*Analysis completed: 2026-02-01*
*Aligns with guiding principles: Pragmatic, Iterative, Reuse*
