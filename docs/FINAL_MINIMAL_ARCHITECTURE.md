# Galatea: Final Minimal Architecture

**Date**: 2026-02-01
**Status**: Ready for Implementation
**Timeline**: 6 weeks to working core

---

## Foundation

### Guiding Principles ✅
1. **Pragmatical** - Practice is the criterion of truth
2. **Iterative** - Useful at every step
3. **Reuse** - Team of one leverages thousands

### End Goal ✅
**Prove: Psychological Architecture + LLM > Plain LLM**

Test via two instantiations:
- "Programmer in the box"
- "Personal assistant"

---

## What We're Building

### The Core (12 Subsystems)

**Memory Layer (3):**
1. Episodic Memory - Remembers interactions
2. Semantic Memory - Learns facts/concepts
3. Procedural Memory - Learns what works

**Learning Layer (2):**
4. Curiosity Engine - Identifies gaps, asks questions, explores
5. Metacognition - Reflects on performance

**Execution Layer (2):**
6. Tool Executor - Executes via Claude API + MCP tools
7. Context Manager - Maintains coherent context

**Identity Layer (1):**
8. Personality Core - Consistent identity via preprompts

**Autonomy Layer (4):** ← NEW
9. Motivation Engine - Why act? (completion, competence, relatedness, achievement drives)
10. Attention Manager - What to focus on? (priority, urgency, opportunity detection)
11. Initiative Engine - When to start? (confidence, permission, risk assessment)
12. Homeostasis - How to persist? (progress monitoring, stuck detection, help-seeking)

### The Observation Pipeline (4 Layers)

See [OBSERVATION_PIPELINE.md](OBSERVATION_PIPELINE.md) for full details.

```
RAW ACTIVITY → ENRICHMENT → DIALOGUE → MEMORY
(OS-level)    (guess intent) (validate) (store)
```

**Layer 1: Activity Capture**
- Browser tabs, searches (via extension or ActivityWatch)
- Terminal commands, output (via shell wrapper)
- VSCode file opens, saves (via extension)

**Layer 2: Enrichment**
- Group activities into sessions
- Guess user intent with confidence score
- Link to daily goals

**Layer 3: Dialogue**
- Morning plan: "What's our plan for today?"
- Validation: "Looks like you're working on X. Is that right?"
- Learning: "I noticed you did Y. Why that approach?"
- Evening summary: "Here's what I saw today. Anything I missed?"

**Layer 4: Memory Formation**
- Transform validated observations into memories
- Episodic: What happened
- Semantic: What we learned
- Procedural: How to do things

---

## What We're Reusing (Maximum Leverage)

### From ContextForgeTS (~75% reuse)

**Backend:**
- ✅ Convex with 8 tables (sessions, blocks, templates, projects, workflows, snapshots, generations, auth)
- ✅ Three-zone system (PERMANENT, STABLE, WORKING)
- ✅ Context assembly logic
- ✅ LLM integrations (Ollama, OpenRouter, Claude Code)
- ✅ Token tracking and budgets
- ✅ LangFuse observability

**Frontend:**
- ✅ React 19 + TypeScript
- ✅ UI components (shadcn/ui)
- ✅ Drag-and-drop
- ✅ Real-time updates
- ✅ Streaming display

**Time Saved: 6-10 weeks**

### From Ecosystem (~95% of tools)

**MCP Servers (1,000+):**
- ✅ Filesystem, GitHub, Brave Search, PostgreSQL
- ✅ Puppeteer, Slack, Google Drive
- ✅ Community servers (Docker, K8s, Notion, etc.)

**Claude Code Skills (20+):**
- ✅ Commit, review-pr, debug, docs
- ✅ Portable to preprompts

**n8n Workflows (1,000+):**
- ✅ Any integration via webhooks
- ✅ Workflow automation

**OpenClaw Patterns:**
- ✅ Gateway architecture
- ✅ Multi-platform adapters

**Tools Available: 1,000+ immediately**

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (React)                            │
│              ✅ Reuse: ContextForge UI                           │
│              + Add: Memory/Curiosity/Reflection views           │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                   CONVEX BACKEND                                 │
│                                                                  │
│  ✅ REUSE FROM CONTEXTFORGE:    + ADD FOR GALATEA:              │
│  • sessions                     • memories table                │
│  • blocks (zone storage)        • curiosityGaps table           │
│  • templates                    • reflections table             │
│  • projects                     • learningProgress table        │
│  • workflows                    • preprompts table              │
│  • generations (LLM tracking)   • toolExecutions table          │
│  • auth                         • Mem0 integration              │
│                                 • MCP tool execution            │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    EXTERNAL SERVICES                             │
│                                                                  │
│  ✅ REUSE:                      + ADD:                           │
│  • Ollama (local LLM)           • Mem0 (memory layer)           │
│  • OpenRouter (cloud LLMs)      • Qdrant (vector DB)            │
│  • Claude Code                  • Voyage AI (embeddings)        │
│  • LangFuse (observability)     • MCP servers (1000+ tools)     │
│                                                                  │
│  ECOSYSTEM ACCESS:                                               │
│  • Claude Code skills (20+)                                      │
│  • n8n workflows (1000+)                                         │
│  • OpenClaw adapters (12+)                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Roadmap

### Week 1: Foundation Setup

**Objective:** Fork ContextForge, rename to Galatea, verify works

**Tasks:**
- [ ] Fork ContextForgeTS repository
- [ ] Rename project to Galatea
- [ ] Update branding, README
- [ ] Test existing functionality
- [ ] Set up development environment

**Deliverable:** Working ContextForge instance running as Galatea

**Success Metric:** Can create sessions, add blocks to zones, interact with LLMs

---

### Week 2: Observation Pipeline + Memory System

**Objective:** Add activity observation and persistent memory

**Tasks:**
- [ ] Add Mem0 API key to Convex env
- [ ] Create tables: `activities`, `activitySessions`, `dailyPlans`, `dialogues`, `memories`
- [ ] Implement ActivityWatch integration (or browser/VSCode extensions)
- [ ] Implement enrichment layer (group activities, guess intent)
- [ ] Implement morning/evening rituals
- [ ] Implement memory storage via Mem0
- [ ] Add dialogue widget to UI

**Deliverable:** Agent asks about your day, observes activity, summarizes evening

**Success Metric:** Agent accurately summarizes what you worked on

**New Schema:**
```typescript
memories: defineTable({
  sessionId: v.id("sessions"),
  type: v.union(
    v.literal("episodic"),
    v.literal("semantic"),
    v.literal("procedural")
  ),
  content: v.string(),
  metadata: v.object({
    timestamp: v.number(),
    confidence: v.optional(v.number()),
    tags: v.array(v.string()),
  }),
  mem0Id: v.optional(v.string()),
})
```

---

### Week 3: MCP Tool Integration

**Objective:** Add MCP tool execution

**Tasks:**
- [ ] Install Vercel AI SDK with MCP support
- [ ] Create `toolExecutions` table
- [ ] Implement MCP client initialization
- [ ] Add tool listing function
- [ ] Add tool execution action
- [ ] Add approval gates for destructive tools
- [ ] Add tool execution history to UI

**Deliverable:** Agent can execute filesystem, GitHub, search tools

**Success Metric:** Agent successfully uses tools to complete tasks

**Initial MCP Servers:**
- `@modelcontextprotocol/server-filesystem`
- `@modelcontextprotocol/server-github`
- `@modelcontextprotocol/server-brave-search`

---

### Week 4: Curiosity Engine (Dialogue-Based)

**Objective:** Agent asks questions during observation to learn

**Tasks:**
- [ ] Implement curiosity triggers (first_occurrence, pattern_deviation, decision_point, error_recovery)
- [ ] Add learning dialogue type
- [ ] Implement question generation from activity sessions
- [ ] Build answer → memory pipeline
- [ ] Add curiosity questions to dialogue widget
- [ ] Tune question frequency (max 5/hour)

**Deliverable:** Agent asks "why" questions and learns from answers

**Success Metric:** Agent asks 3-5 learning questions per day, forms useful memories from answers

**New Schema:**
```typescript
curiosityGaps: defineTable({
  sessionId: v.id("sessions"),
  topic: v.string(),
  confidence: v.number(),
  explored: v.boolean(),
  exploredAt: v.optional(v.number()),
  findings: v.optional(v.string()),
})
```

---

### Week 5: Reflection Loop

**Objective:** Agent learns from mistakes

**Tasks:**
- [ ] Create `reflections` table
- [ ] Create `learningProgress` table
- [ ] Implement Reflexion pattern (draft → critique → revise)
- [ ] Build procedural memory update logic
- [ ] Add reflection trigger (after errors/tasks)
- [ ] Add reflection history UI
- [ ] Implement Learning Progress metric (MAGELLAN LP)

**Deliverable:** Agent reflects on mistakes, improves over time

**Success Metric:** Measurable reduction in repeated mistakes (LP metric shows positive trend)

**New Schema:**
```typescript
reflections: defineTable({
  sessionId: v.id("sessions"),
  taskDescription: v.string(),
  outcome: v.string(),
  whatWorked: v.string(),
  whatDidnt: v.string(),
  improvement: v.string(),
  createdAt: v.number(),
})

learningProgress: defineTable({
  sessionId: v.id("sessions"),
  goal: v.string(),
  attempts: v.array(v.object({
    timestamp: v.number(),
    success: v.boolean(),
    feedback: v.optional(v.string()),
  })),
  recentCompetence: v.number(),
  delayedCompetence: v.number(),
  learningProgress: v.number(),
})
```

---

### Week 6: Preprompts, Instantiation & Sharing

**Objective:** Same core, different personalities + shadow mode + sharing

**Tasks:**
- [ ] Create `preprompts` table
- [ ] Write core identity preprompt
- [ ] Write programmer role preprompt
- [ ] Write assistant role preprompt
- [ ] Port Claude Code skills to preprompts (commit, debug, explore, reflect)
- [ ] Add personality configuration to sessions
- [ ] Add personality selector UI
- [ ] Implement **shadow mode** skill (observe + ask + learn)
- [ ] Implement **export/import** persona functions
- [ ] Test both instantiations

**Deliverable:** Can instantiate as Programmer OR Personal Assistant; can shadow and learn; can share personas

**Success Metric:** Same core behaves differently based on preprompt; shadow mode learns effectively

**New Schema:**
```typescript
preprompts: defineTable({
  name: v.string(),
  type: v.union(v.literal("core"), v.literal("role"), v.literal("skill")),
  content: v.string(),
  tools: v.optional(v.array(v.string())),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_name", ["name"])

// Add to sessions table
sessions: defineTable({
  // ... existing fields
  personality: v.optional(v.object({
    corePrompt: v.id("preprompts"),
    rolePrompt: v.id("preprompts"),
    skills: v.array(v.id("preprompts")),
  })),
})
```

---

## Success Metrics (Testing the Thesis)

### Week 2 (Memory)
- ✅ Agent remembers facts from previous sessions
- ✅ Agent adapts to user preferences
- ✅ User feels agent "knows them"
- **Metric:** Memory recall accuracy > 90%

### Week 3 (Tools)
- ✅ Agent successfully executes tools
- ✅ Tool results inform responses
- ✅ Agent chains multiple tools
- **Metric:** Tool success rate > 85%

### Week 4 (Curiosity)
- ✅ Agent asks 3-5 clarifying questions per session
- ✅ Agent identifies gaps user didn't mention
- ✅ User says "good question" at least once per day
- **Metric:** Gap exploration rate > 70%

### Week 5 (Reflection)
- ✅ Measurable reduction in repeated mistakes
- ✅ Learning Progress metric shows positive trend (LP > 0.1)
- ✅ Procedural memory accumulates useful patterns
- **Metric:** Mistake repetition rate < 20%

### Week 6 (Instantiation)
- ✅ Programmer and Assistant behave distinctly
- ✅ Both share same core capabilities
- ✅ User rates both as "more helpful than ChatGPT"
- **Metric:** User satisfaction > 8/10 for both

**If all metrics met → Thesis proven! 🎉**

---

## Technical Stack Summary

| Layer | Technology | Reuse | Add |
|-------|-----------|-------|-----|
| **Frontend** | React 19 + TypeScript | 75% | Memory/curiosity/reflection UI |
| **Backend** | Convex | 70% | 6 new tables |
| **LLM** | Claude Sonnet 4 (via OpenRouter) | 100% | Confidence extraction |
| **Memory** | Mem0 + Qdrant | 0% | Full integration |
| **Tools** | MCP (1000+ servers) | 100% | Execution logic |
| **Embeddings** | Voyage AI | 0% | Integration |
| **Observability** | LangFuse | 90% | Memory/curiosity traces |
| **Skills** | Claude Code patterns | 100% | Port to preprompts |

**Overall Reuse: 75%**
**Time to Working Core: 6 weeks**

---

## Code Structure (New Files)

```
galatea/
├── convex/
│   ├── schema.ts                 # ✏️ ADD: 6 new tables
│   ├── memories.ts               # 🆕 Memory CRUD + Mem0 integration
│   ├── curiosity.ts              # 🆕 Gap detection + exploration
│   ├── reflections.ts            # 🆕 Reflexion loop
│   ├── learningProgress.ts       # 🆕 LP metric tracking
│   ├── preprompts.ts             # 🆕 Personality/skills management
│   ├── mcp.ts                    # 🆕 MCP tool execution
│   └── lib/
│       ├── mem0.ts               # 🆕 Mem0 client
│       ├── mcp-client.ts         # 🆕 MCP SDK wrapper
│       └── context.ts            # ✏️ EXTEND: Add memory injection
│
├── src/
│   ├── components/
│   │   ├── memory/
│   │   │   ├── MemoryPanel.tsx   # 🆕 Memory visualization
│   │   │   └── MemoryTimeline.tsx # 🆕 Episodic timeline
│   │   ├── curiosity/
│   │   │   ├── GapsPanel.tsx     # 🆕 Curiosity gaps display
│   │   │   └── ExplorationLog.tsx # 🆕 Exploration history
│   │   ├── reflection/
│   │   │   ├── ReflectionPanel.tsx # 🆕 Reflection history
│   │   │   └── LearningProgress.tsx # 🆕 LP metric display
│   │   └── personality/
│   │       ├── PersonalitySelector.tsx # 🆕 Choose role
│   │       └── SkillsManager.tsx  # 🆕 Manage skills
│   └── lib/
│       └── lp-metric.ts          # 🆕 Learning Progress calculation
│
└── docs/
    ├── GUIDING_PRINCIPLES.md     # ✅ Saved
    ├── CONTEXTFORGE_REUSE.md     # ✅ Saved
    ├── ECOSYSTEM_REUSE.md        # ✅ Saved
    └── FINAL_MINIMAL_ARCHITECTURE.md # ✅ This document
```

---

## Configuration Files Needed

### .env.local
```bash
# Existing from ContextForge
VITE_CONVEX_URL=<auto-generated>
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=anthropic/claude-sonnet-4
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_PUBLIC_KEY=pk-lf-...

# New for Galatea
MEM0_API_KEY=mem0-...
QDRANT_URL=https://xyz.qdrant.io
QDRANT_API_KEY=...
VOYAGE_AI_API_KEY=pa-...
```

### package.json additions
```json
{
  "dependencies": {
    "ai": "^6.0.39",                    // Vercel AI SDK (MCP support)
    "mem0": "^1.0.0",                   // Mem0 client
    "@qdrant/js-client-rest": "^1.0.0", // Qdrant
    "voyage-ai": "^1.0.0"               // Voyage embeddings
  }
}
```

---

## What We're NOT Building

❌ All 54 other subsystems (build later if needed)
❌ Custom vector DB
❌ Custom embedding model
❌ Custom LLM
❌ Complex UI from scratch
❌ Multi-agent coordination (single agent first)
❌ Graphiti temporal graphs (Mem0 sufficient for MVP)
❌ Custom observability platform
❌ Custom gateway (reuse ContextForge patterns)

---

## Risk Mitigation

### Risk 1: Mem0 integration complexity
**Mitigation:** Start with simple key-value storage, add sophistication iteratively

### Risk 2: MCP tool reliability
**Mitigation:** Add error handling, retry logic, approval gates for destructive operations

### Risk 3: Curiosity might be noisy
**Mitigation:** Tune confidence thresholds, limit exploration per session

### Risk 4: Reflection overhead
**Mitigation:** Make reflection opt-in, async (don't block main flow)

### Risk 5: ContextForge limitations
**Mitigation:** Keep fork clean, option to pivot if needed

---

## Cost Estimates

### Development Time
- Week 1: Foundation (10 hours)
- Week 2: Memory (15 hours)
- Week 3: Tools (15 hours)
- Week 4: Curiosity (15 hours)
- Week 5: Reflection (20 hours)
- Week 6: Preprompts (15 hours)
**Total: ~90 hours over 6 weeks**

### Infrastructure Costs (Monthly)
- Convex: $0 (free tier sufficient for MVP)
- OpenRouter: ~$50-100 (usage-based)
- Mem0: $0-50 (depends on usage)
- Qdrant: $0 (1GB free tier)
- Voyage AI: ~$10-20 (embedding costs)
- LangFuse: $0 (self-hosted or free tier)
**Total: ~$60-170/month**

---

## Next Steps

### Immediate (This Week)
1. ✅ Review this document
2. ✅ Approve architecture
3. 🔲 Fork ContextForgeTS
4. 🔲 Rename to Galatea
5. 🔲 Set up development environment

### Week 1
1. 🔲 Get ContextForge running
2. 🔲 Update branding
3. 🔲 Test existing features
4. 🔲 Document current state

### Week 2
1. 🔲 Sign up for Mem0
2. 🔲 Add memory tables to schema
3. 🔲 Implement memory storage
4. 🔲 Test memory recall

---

## Questions to Answer Before Starting

1. **Which instantiation to build first?**
   - Programmer (immediate work use)
   - Assistant (personal use)
   - Both in parallel

2. **Development environment preferences?**
   - Local Convex dev
   - Cloud Convex deployment
   - Both

3. **LLM provider priority?**
   - OpenRouter (multi-model)
   - Claude Code (direct)
   - Ollama (local)

4. **Memory privacy preferences?**
   - Mem0 cloud (easier)
   - Self-hosted (more control)

5. **Timeline flexibility?**
   - Strict 6 weeks
   - Flexible (10-12 weeks)

---

## Success Definition

**Galatea succeeds if:**

1. ✅ **Memory Works**: Agent remembers across sessions (> 90% accuracy)
2. ✅ **Curiosity Works**: Agent explores gaps proactively (3-5 questions/session)
3. ✅ **Learning Works**: Agent improves over time (LP > 0.1, mistakes < 20%)
4. ✅ **Tools Work**: Agent executes MCP tools reliably (> 85% success)
5. ✅ **Personality Works**: Same core, different instantiations behave distinctly
6. ✅ **Better Than Plain LLM**: Users rate Galatea > ChatGPT (8+/10)

**If all 6 → Thesis proven! Psychological architecture > Plain LLM** 🎉

---

## Conclusion

We have:
- ✅ Clear architecture (8 subsystems)
- ✅ Maximum reuse (75% from ContextForge, 95% tools from ecosystem)
- ✅ 6-week timeline (pragmatic, iterative)
- ✅ Success metrics (practice is the criterion)
- ✅ Risk mitigation (stay lean, pivot if needed)

**This aligns perfectly with our guiding principles:**
1. **Pragmatical** ✅ - Solves real problem (better than ChatGPT)
2. **Iterative** ✅ - Useful at every week
3. **Reuse** ✅ - Leverages ContextForge + ecosystem

**Ready to start building?** 🚀

---

*Final architecture completed: 2026-02-01*
*Status: Ready for implementation*
*Next: Fork ContextForgeTS and begin Week 1*
