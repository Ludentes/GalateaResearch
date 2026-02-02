# Galatea Psychological Architecture

**Date**: 2026-02-02
**Status**: Accepted
**Thesis**: Psychological architecture (homeostasis + memory + models) + LLM > Plain LLM

---

## Deferred: Safety Systems

> **NOTE**: Safety subsystems are being researched separately by students. This architecture assumes safety systems will be integrated later. The following are deferred:
>
> - **Safety Monitor** - Pre-screens all interactions
> - **Crisis Detector** - Suicide risk, psychosis indicators
> - **Reality Boundary Enforcer** - "I am not conscious" enforcement
> - **Dependency Prevention** - Session duration, emotional reliance tracking
> - **Intervention Orchestrator** - Coordinates escalation
>
> When integrating safety, it should wrap the entire system as a pre/post filter.

---

## Core Thesis

Current AI agents are **stimulus-response machines**:
```
prompt → LLM → response
```

Galatea adds **psychological architecture** between stimulus and response:
```
prompt → [Homeostasis + Memory + Models] → LLM → response
                      ↑
              continuous learning
```

Psychology has formalized human cognition for centuries. We apply these models to create agents with:
- **Persistence** (memory across sessions)
- **Understanding** (models of self, user, domain)
- **Self-Regulation** (homeostasis - maintaining balance across dimensions)
- **Growth** (learning from observation)

**Key insight**: Instead of building 12+ discrete subsystems (Curiosity Engine, Motivation Engine, etc.), we use **homeostasis** as the unifying principle. Drives emerge from dimension imbalances.

---

## Architecture Decision

After evaluating three approaches, we selected **homeostasis-based architecture**:

| Approach | Verdict |
|----------|---------|
| 12 Subsystems | Too complex, subsystems compete for context |
| Preprompts Only | Too brittle, no emergence, no psychological grounding |
| **Homeostasis-Based** | ✓ Balance of structure and emergence |

See [homeostasis-architecture-design.md](./plans/2026-02-02-homeostasis-architecture-design.md) for full decision record.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              GALATEA AGENT                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     LAYER 1: EXPLICIT GUIDANCE                       │   │
│  │  "When X happens, do Y" - handles anticipated situations             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐  │   │
│  │  │  Persona    │  │   Domain    │  │        Hard Blocks          │  │   │
│  │  │  Preprompts │  │   Rules     │  │   (never push to main...)   │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                  LAYER 2: HOMEOSTASIS ENGINE                         │   │
│  │  6 dimensions - balance drives behavior - handles novel situations   │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐       │   │
│  │  │ Knowledge  │ │ Certainty  │ │ Progress   │ │ Communic.  │       │   │
│  │  │Sufficiency │ │ Alignment  │ │ Momentum   │ │  Health    │       │   │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘       │   │
│  │  ┌────────────┐ ┌────────────┐                                      │   │
│  │  │Productive  │ │ Knowledge  │                                      │   │
│  │  │Engagement  │ │Application │                                      │   │
│  │  └────────────┘ └────────────┘                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     MEMORY LAYER                                     │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐    │   │
│  │  │   Episodic   │ │   Semantic   │ │       Procedural         │    │   │
│  │  │   (events)   │ │   (facts)    │ │   (trigger → steps)      │    │   │
│  │  └──────────────┘ └──────────────┘ └──────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    COGNITIVE MODELS                                  │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────┐   │   │
│  │  │  Self    │ │  User    │ │  Domain  │ │    Relationship      │   │   │
│  │  │  Model   │ │  Model   │ │  Model   │ │       Model          │   │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                   EXECUTION LAYER                                    │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐    │   │
│  │  │   Context    │ │    Tool      │ │        LLM               │    │   │
│  │  │   Builder    │ │   Executor   │ │     Generation           │    │   │
│  │  └──────────────┘ └──────────────┘ └──────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core: Homeostasis Engine

### The Key Insight

Instead of separate engines for curiosity, motivation, initiative, we define **dimensions of healthy functioning**. When a dimension is out of balance, the agent is guided to restore it.

- **Homeostasis says WHAT** to do (explore, communicate, escalate)
- **Memory provides HOW** (specific facts, procedures, context)
- **LLM reasons** about the specific action

### The Six Dimensions

| # | Dimension | Question | Psychological Root |
|---|-----------|----------|-------------------|
| 1 | Knowledge Sufficiency | "Do I know enough to proceed?" | Competence need |
| 2 | Certainty Alignment | "Does my confidence match my action?" | Self-awareness |
| 3 | Progress Momentum | "Am I moving forward?" | Achievement need |
| 4 | Communication Health | "Am I appropriately connected?" | Relatedness need |
| 5 | Productive Engagement | "Am I contributing value?" | Purpose need |
| 6 | Knowledge Application | "Am I balancing learning/doing?" | Learning balance |

### Dimension Detail

#### 1. Knowledge Sufficiency

**Spectrum:**
- **LOW**: Can't explain approach, guessing, memories don't match task
- **HEALTHY**: Can explain what and why, confident enough to proceed
- **HIGH**: N/A (but see Knowledge Application for over-research)

**When LOW - Guidance:**
> You need more knowledge before acting.
> Options: Retrieve memories → Research docs/codebase → Ask teammate → Ask PM
> Don't research forever - timebox then ask.

#### 2. Certainty Alignment

**Spectrum:**
- **LOW**: Uncertain but proceeding, making irreversible decisions while doubtful
- **HEALTHY**: Confidence matches stakes, ask when uncertain on important things
- **HIGH**: Certain but still asking, seeking validation not information

**When LOW - Guidance:**
> Your confidence is low but you're about to act.
> Is this reversible? If yes, try and learn.
> Could you be wrong in a costly way? Ask first.
> Preference/architecture question → Ask PM.
> Technical question → Research or ask peer.

**When HIGH - Guidance:**
> You seem confident but keep asking.
> Do you actually need input or are you seeking validation?
> Could you try it and course-correct?

#### 3. Progress Momentum

**Spectrum:**
- **LOW**: Stuck, repeating actions, spinning
- **HEALTHY**: Meaningful actions, closer to goal
- **HIGH**: Rushing, skipping steps

**When LOW - Guidance:**
> You're not making progress.
> Diagnose: Knowledge gap? Uncertain? Blocked externally? Stuck technically?
> Don't spin silently. Either unblock yourself or escalate.

**When HIGH - Guidance:**
> You're moving fast. Pause to verify quality.
> Have you tested? Did you miss edge cases?

#### 4. Communication Health

**Spectrum:**
- **LOW**: Working in isolation, others don't know status
- **HEALTHY**: Team knows what you're doing, responsive when needed
- **HIGH**: Constant messaging, interrupting others

**When LOW - Guidance:**
> You've been quiet. Consider:
> Does PM/team need a status update?
> Are you missing context others have shared?
> Don't go dark during active work.

**When HIGH - Guidance:**
> You're communicating a lot. Consider:
> Could you batch these messages?
> Could you try first, then report results?

#### 5. Productive Engagement

**Spectrum:**
- **LOW**: No task, idle, waiting without alternatives
- **HEALTHY**: Working on task OR helping OR learning
- **HIGH**: Overloaded, can't focus

**When LOW - Guidance:**
> Find valuable work.
> Priority: assigned task > help teammates > review MRs > proactive improvements > learn
> Don't be idle when you could contribute.

**When HIGH - Guidance:**
> You have too much going on.
> Prioritize, delegate, or signal overload.

#### 6. Knowledge Application

**Spectrum:**
- **LOW**: Acting without learning, trial and error without thought
- **HEALTHY**: Learn enough to act, iterate: try, learn, adjust
- **HIGH**: Researching endlessly, analysis paralysis

**When LOW - Guidance:**
> You're acting without learning.
> Pause to understand why, not just how.

**When HIGH - Guidance:**
> You've been learning a lot. Time to apply.
> You can course-correct as you go.
> Doing will teach you more than reading.

### Three-Layer Model

```
Layer 1: Explicit Guidance
├── Handles anticipated situations
├── Persona preprompts, domain rules, hard blocks
└── Precise but brittle

Layer 2: Homeostasis Emergence
├── Handles novel situations
├── "Stay in balance" across 6 dimensions
└── Behavior emerges from balance-seeking

Layer 3: Guardrails
├── Catches runaway behavior
├── Prevents extremes (over-research, over-ask, going dark)
└── Built-in to dimension spectrums
```

---

## Memory Layer

Memory stores WHAT the agent knows. Homeostasis determines WHEN to use it.

### Episodic Memory (Events)

```typescript
interface EpisodeRecord {
  id: string;
  timestamp: Date;
  summary: string;              // What happened
  participants: string[];       // user, agent, other agents
  emotional_valence: number;    // -1 to 1
  outcome: string;              // success, failure, partial
  lessons?: string[];           // What was learned

  // For retrieval
  embedding: number[];
  session_id: string;
}
```

### Semantic Memory (Facts)

```typescript
interface Fact {
  id: string;
  content: string;              // "Prefer Clerk over JWT for mobile auth"
  confidence: number;           // 0-1
  source: string;               // episode_id or "manual"
  domain?: string;              // "expo-auth"

  // Temporal validity
  valid_from: Date;
  valid_until?: Date;           // "NativeWind 4.1"
  superseded_by?: string;
}
```

### Procedural Memory (How-To)

```typescript
interface Procedure {
  id: string;
  name: string;                 // "Handle NativeWind animation flicker"

  trigger: {
    pattern: string;            // "Pressable animation flickering"
    context?: string[];
  };

  steps: {
    order: number;
    instruction: string;
    tool_call?: string;         // MCP tool
  }[];

  // Learning metadata
  success_rate: number;
  times_used: number;
  learned_from: string[];       // Episode IDs

  // Temporal validity
  valid_until?: string;
  superseded_by?: string;
}
```

### Memory System Decision

> **STATUS**: Decision pending - leaning Mem0 for MVP
>
> | Option | Pros | Cons |
> |--------|------|------|
> | **Mem0** | Ready SDK, $24M funding, dashboard | External dependency |
> | **Graphiti** | Temporal reasoning built-in | Smaller ecosystem |
> | **Files + Custom** | Full control | Must build everything |
>
> **Key insight**: The thesis is about psychological architecture, not memory systems. Use existing tools.

---

## Cognitive Models

Models provide context for LLM reasoning. They're data structures, not engines.

### Self Model

```typescript
interface SelfModel {
  identity: {
    name: string;                    // "Galatea"
    role: string;                    // "Mobile Developer"
    domain: string;                  // "Expo/React Native"
  };

  capabilities: {
    strong: string[];                // What I'm good at
    weak: string[];                  // What I struggle with
    tools_available: string[];       // MCP tools
  };

  limitations: string[];             // What I cannot do
}
```

### User Model

```typescript
interface UserModel {
  identity: {
    user_id: string;
    first_seen: Date;
    interaction_count: number;
  };

  // WorldLLM-style theories
  theories: {
    statement: string;               // "User prefers concrete examples"
    confidence: number;
    evidence_for: string[];          // Episode IDs
    evidence_against: string[];
  }[];

  // Learned preferences
  preferences: Record<string, string>;  // "communication": "concise"
  expertise: Record<string, number>;    // "expo": 0.8
}
```

### Domain Model

```typescript
interface DomainModel {
  domain_id: string;                 // "mobile_development"

  characteristics: {
    precision_required: number;      // 0-1
    risk_level: string;              // "low", "medium", "high"
  };

  behavior_rules: {
    exploration_encouraged: boolean;
    must_cite_sources: boolean;
  };
}
```

### Relationship Model

```typescript
interface RelationshipModel {
  user_id: string;

  history: {
    first_interaction: Date;
    total_interactions: number;
    significant_events: string[];    // Episode IDs
  };

  trust_level: number;               // 0-1
  relationship_phase: string;        // "initial", "productive", "mature"
}
```

---

## Agent Spec Format

Agents are defined by specs that configure homeostasis + memory + models.

### Spec Structure

```yaml
identity:
  name: "Expo Developer Agent"
  role: "Mobile developer"
  domain: "Expo / React Native"

# Universal dimensions (same for all agents)
core_dimensions:
  - knowledge_sufficiency
  - certainty_alignment
  - progress_momentum
  - communication_health
  - productive_engagement
  - knowledge_application

# Persona-specific tuning
thresholds:
  certainty_alignment:
    context: "Architecture questions require higher certainty"
  communication_health:
    context: "Update every ~2 hours during active work"

# Absolute prohibitions
hard_blocks:
  - "push directly to main"
  - "use Realm database"
  - "commit secrets"

# From shadow training
learned:
  facts: [...]
  procedures: [...]
```

### Derivation Chain

```
Natural Language Requirement
  "Agent should understand codebase before modifying"
    ↓
Invariant
  "Before modifying code, relevant knowledge must be retrieved"
    ↓
Dimension
  knowledge_sufficiency
    ↓
Assessment
  "Can you explain your approach?"
    ↓
Guidance
  "Research before acting, but don't over-research"
```

### Persona Universality

Same 6 dimensions work across all personas:

| Persona | Same Dimensions | Different Thresholds |
|---------|-----------------|---------------------|
| Coder | ✓ | certainty: 0.7, communicate: ~2 hours |
| Lawyer | ✓ | certainty: 0.95, communicate: ~1 day |
| Buddy | ✓ | certainty: 0.5, communicate: immediately |

---

## Learning Pipeline

### Shadow Training Flow

```
User works with Claude Code
         │
         ▼
Observation Pipeline captures events
         │
         ▼
End of period: Summary generated
         │
         ▼
User verifies/corrects summary
         │
         ▼
Memory updated (facts, procedures)
         │
         ▼
Thresholds calibrated from observation
```

### What Gets Learned

| Type | Example | Storage |
|------|---------|---------|
| Fact | "Prefer Clerk over JWT" | Semantic memory |
| Procedure | "How to fix NativeWind flicker" | Procedural memory |
| Episode | "Spent 45min debugging auth" | Episodic memory |
| Calibration | "User asks for help after ~30min stuck" | Threshold config |

### What Doesn't Change

Homeostasis dimensions are universal. They don't change from learning.
Only the thresholds and guidance context adapt.

---

## Implementation Components

### Homeostasis Engine

```python
class HomeostasisEngine:
    dimensions = [
        "knowledge_sufficiency",
        "certainty_alignment",
        "progress_momentum",
        "communication_health",
        "productive_engagement",
        "knowledge_application"
    ]

    def assess(self, context: AgentContext) -> dict[str, str]:
        """Assess each dimension: LOW / HEALTHY / HIGH"""
        # Hybrid: some computed, some LLM-assessed
        pass

    def get_guidance(self, states: dict) -> str:
        """Get guidance for imbalanced dimensions"""
        pass

    def build_prompt(self, context: AgentContext) -> str:
        """Assemble: state + guidance + memories + task"""
        pass
```

### Context Builder

```python
class ContextBuilder:
    def build(self, request: Request) -> Context:
        # Retrieve relevant memories
        episodes = episodic_memory.recall(request.query, k=5)
        facts = semantic_memory.query(request.entities)
        procedures = procedural_memory.match(request.situation)

        # Get homeostasis state
        states = homeostasis.assess(current_context)
        guidance = homeostasis.get_guidance(states)

        # Assemble prompt
        return Context(
            persona=self.persona_preprompt,
            user_model=format_theories(user_model.theories),
            memories=format_memories(episodes, facts, procedures),
            homeostasis_state=format_states(states),
            guidance=guidance,
            task=request.task
        )
```

### Tool Executor

```python
class ToolExecutor:
    def __init__(self, mcp_tools: list[MCPTool]):
        self.tools = {t.name: t for t in mcp_tools}

    def execute(self, tool: str, params: dict) -> ToolResult:
        return self.tools[tool].invoke(params)
```

---

## Example Traces

### Novel Situation (No Guidance Exists)

```
Agent encounters OAuth2 pattern never seen before.

Homeostasis assessment:
├── knowledge_sufficiency: LOW (no relevant memories)
├── certainty_alignment: LOW (not confident)
├── progress_momentum: STALLING (no progress in 20 min)

Multiple dimensions LOW. LLM receives:
├── State: "knowledge gap, low confidence, stalling"
├── Guidance: "Learn before acting" + "Ask for architecture questions"
├── No specific guidance for OAuth2

LLM reasons: "Root cause is knowledge gap. This seems like
architecture question (preference). I'll research briefly,
then ask if still stuck."

Emergent behavior - not pre-programmed.
```

### Guardrail Activation

```
Agent has been researching for 2 hours without building.

Homeostasis assessment:
├── knowledge_application: HIGH (too much research)
├── progress_momentum: LOW (no actual work done)

Guardrail triggers. LLM receives:
├── State: "over-researching, not progressing"
├── Guidance: "Time to apply. You can course-correct."

Agent: "I've researched OAuth2 patterns extensively. Time to
implement and adjust as I learn."
```

### Idle Agent Seeks Work

```
Agent finishes task. Nothing assigned.

Homeostasis assessment:
├── productive_engagement: LOW (no task)

LLM receives guidance:
"Find valuable work. Priority: assigned > help > review > improve > learn"

Agent posts: "@PM finished user-profile, what's next?"
[5 min, no response]

communication_health: recently messaged (blocks re-asking)
productive_engagement: still LOW

Agent: "I'll review open MRs while waiting."
```

---

## Open Questions

1. **Assessment reliability** - How consistent is LLM self-assessment of dimensions?
2. **Threshold calibration** - How do we tune thresholds from observation?
3. **Cross-agent learning** - How do agents learn from each other's mistakes?
4. **Dimension completeness** - Are 6 dimensions enough for all situations?

---

## Related Documents

- **[plans/2026-02-02-homeostasis-architecture-design.md](./plans/2026-02-02-homeostasis-architecture-design.md)** - Full decision record
- **[REFERENCE_SCENARIOS.md](./REFERENCE_SCENARIOS.md)** - Detailed scenarios for evaluation
- **[plans/2026-02-02-memory-system-design.md](./plans/2026-02-02-memory-system-design.md)** - Memory system options
- **[plans/BRAINSTORM_QUEUE.md](./plans/BRAINSTORM_QUEUE.md)** - Open questions

---

*Architecture document updated: 2026-02-02*
*Decision: Homeostasis-based architecture with 6 universal dimensions*
*Based on research: OpenClaw, Cline, GPT-Engineer, MAGELLAN, WorldLLM, Reflexion*
