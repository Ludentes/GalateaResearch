# ContextForge Reuse Analysis for Galatea

**Date**: 2026-02-01
**Updated**: 2026-02-03
**Purpose**: Identify what can be reused from ContextForgeTS for Galatea's architecture

---

## Executive Summary

ContextForgeTS provides **substantial reusable infrastructure** (~70% of what Galatea needs). It already implements:
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
- ✅ **Blocks** → Context storage
- ✅ **Zone system** → ContextForge PERMANENT/STABLE/WORKING
- ✅ **Generations** → Track LLM interactions

**What We Add:**
- Graphiti/FalkorDB integration for memory graph
- Homeostasis state tracking
- Activity routing metadata

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
- Graphiti memory retrieval integration
- Preprompt injection (persona layer)
- Homeostasis guidance injection

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
- Activity Router model selection (Haiku vs Sonnet)
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
- Persona configuration per session
- Homeostasis threshold configuration
- Memory accumulation tracking

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
- Memory graph visualization
- Homeostasis state panel
- Activity level indicators

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
- Homeostasis assessment traces
- Activity routing traces

---

## What's NOT in ContextForge (Need to Add)

### 1. Memory System (Graphiti + FalkorDB)

**Not in ContextForge:**
- Graph database integration
- Temporal knowledge graph
- Memory types (episodic, semantic, procedural)

**Implementation:**
- FalkorDB via Docker
- Graphiti Python wrapper (REST API)
- TypeScript client for queries

See [2026-02-02-memory-system-design.md](./plans/2026-02-02-memory-system-design.md)

---

### 2. Homeostasis Engine

**Not in ContextForge:**
- 6-dimension assessment
- Guidance generation
- Guardrail logic

**Implementation:**
- New `HomeostasisEngine` class
- Dimension state tracking
- Integration with context builder

See [PSYCHOLOGICAL_ARCHITECTURE.md](./PSYCHOLOGICAL_ARCHITECTURE.md)

---

### 3. Activity Router

**Not in ContextForge:**
- Activity classification (Level 0-3)
- Model selection logic
- Reflexion loop for Level 3

**Implementation:**
- New `ActivityRouter` class
- Model configuration
- Level-based routing

See [2026-02-03-activity-routing-design.md](./plans/2026-02-03-activity-routing-design.md)

---

### 4. Preprompt System

**Not in ContextForge:**
- Persona configuration
- Role-based prompts (programmer vs assistant)
- Hard rules injection

**Implementation:**
```typescript
// New Convex table
preprompts: defineTable({
  name: v.string(),      // "core_identity", "programmer", "assistant"
  content: v.string(),
  type: v.union(v.literal("core"), v.literal("role"), v.literal("hard_rule")),
})
```

---

### 5. MCP Tool Integration

**Not in ContextForge:**
- MCP protocol support
- Tool registry
- Tool execution tracking

**Implementation:**
- Vercel AI SDK (has native MCP support)
- Tool execution table in Convex
- Approval gates for destructive tools

---

## Code Reuse Breakdown

| Component | Existing (ContextForge) | Need to Add | Reuse % |
|-----------|------------------------|-------------|---------|
| **Backend (Convex)** | Sessions, blocks, auth | Memory/homeostasis tables | 70% |
| **Context Assembly** | Zone-based assembly | Memory + homeostasis injection | 75% |
| **LLM Integration** | 3 providers, streaming | Activity Router, MCP tools | 60% |
| **Frontend UI** | Full React app | Memory/homeostasis UI | 75% |
| **Observability** | LangFuse integration | Additional traces | 90% |
| **Auth/Users** | Convex Auth | Nothing | 100% |

**Overall Reuse: ~70%**

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (React)                            │
│              ✅ REUSE: ContextForge UI                           │
│              + Add: Memory/Homeostasis views                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                   CONVEX BACKEND                                 │
│                                                                  │
│  ✅ REUSE:                          + ADD:                       │
│  • sessions (agent instances)       • homeostasis table          │
│  • blocks (context storage)         • preprompts table           │
│  • generations (LLM tracking)       • toolExecutions table       │
│  • LLM integrations                 • Graphiti integration       │
│  • LangFuse observability           • Activity Router            │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    EXTERNAL SERVICES                             │
│                                                                  │
│  ✅ REUSE:                          + ADD:                       │
│  • Ollama (local LLM)               • FalkorDB (graph DB)        │
│  • OpenRouter (cloud LLMs)          • Graphiti (temporal graph)  │
│  • Claude Code                      • Voyage AI (embeddings)     │
│  • LangFuse (observability)         • MCP servers (tools)        │
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

### 3. **Familiar Stack**
- ✅ TypeScript throughout
- ✅ React patterns familiar
- ✅ Convex well-documented

### 4. **Extensibility**
- ✅ Modular Convex functions (easy to add)
- ✅ Component-based UI (easy to extend)
- ✅ Schema migrations supported

---

## Mapping Current Architecture to ContextForge

| Galatea Component | ContextForge Equivalent | Status |
|------------------|------------------------|--------|
| **Memory System** | | |
| - Graphiti/FalkorDB | N/A | ADD |
| - Memory types | blocks (extended) | EXTEND |
| **Activity Router** | N/A | ADD |
| **Homeostasis Engine** | N/A | ADD |
| **Tool Executor** | generations + MCP | EXTEND |
| **Context Manager** | convex/lib/context.ts | REUSE ✅ |
| **Persona/Preprompts** | preprompts table | ADD |
| **LLM Integration** | claudeNode.ts, ollama.ts, openrouter.ts | REUSE ✅ |
| **Session Management** | sessions table | REUSE ✅ |
| **Observability** | LangFuse integration | REUSE ✅ |
| **UI** | React app | REUSE ✅ + EXTEND |

---

## Related Documents

- [FINAL_MINIMAL_ARCHITECTURE.md](./FINAL_MINIMAL_ARCHITECTURE.md) - Implementation roadmap
- [2026-02-02-memory-system-design.md](./plans/2026-02-02-memory-system-design.md) - Memory system design
- [PSYCHOLOGICAL_ARCHITECTURE.md](./PSYCHOLOGICAL_ARCHITECTURE.md) - Full architecture
- [2026-02-03-activity-routing-design.md](./plans/2026-02-03-activity-routing-design.md) - Activity routing

---

*Analysis completed: 2026-02-01*
*Updated: 2026-02-03 (aligned with current architecture decisions)*
*Aligns with guiding principles: Pragmatic, Iterative, Reuse*
