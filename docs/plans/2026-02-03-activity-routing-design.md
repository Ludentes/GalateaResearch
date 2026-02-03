# Activity-Level Routing & Model Selection

**Date**: 2026-02-03
**Status**: Accepted
**Related**: System 1/System 2 (Kahneman), Reflexion pattern, Self-Knowledge

---

## Problem Statement

Agents perform many types of activities with vastly different cognitive requirements:

| Activity | Example | Cognitive Load |
|----------|---------|----------------|
| Acknowledge | "Starting task now" | Near zero |
| Tool call | git push, read file | Near zero |
| Follow procedure | Create PR with template | Low |
| Implement feature | Write new code | Medium-High |
| Resolve unknown | Debug unfamiliar issue | High |

Using the same processing pipeline (full memory retrieval, homeostasis assessment, capable model) for all activities wastes resources and adds latency for trivial operations.

### Key Insight: LLM Already Knows Most Things

The agent's knowledge is primarily in the LLM, not memories. Like a professional hire:
- LLM knows how to code, debug, write React Native, etc.
- Memory stores the **delta**: team preferences, specific issues, hard rules

This means:
- Memory retrieval is about **overrides**, not base knowledge
- But we can't skip memory entirely (might miss critical preferences)
- The real optimization is **processing depth**, not memory skipping

---

## Solution: Activity Levels

Instead of binary System 1/System 2, use a spectrum of **activity levels**:

```
Level 0: JUST DO IT
         Direct action, no LLM needed
         Examples: git status, read file, template message

Level 1: PATTERN MATCH
         Simple LLM call with procedure
         Examples: Create PR, parse input, format output

Level 2: REASON
         Full context, single LLM pass
         Examples: Implement feature, review code, answer question

Level 3: REFLECT
         Draft → Critique → Revise loop (Reflexion pattern)
         Examples: Unknown situation, architecture decision, high stakes
```

### Level Determines Everything

| Aspect | Level 0 | Level 1 | Level 2 | Level 3 |
|--------|---------|---------|---------|---------|
| LLM calls | 0 | 1 | 1 | 3-15 |
| Model | None | Haiku | Sonnet | Sonnet + iteration |
| Memory | Hard rules only | Procedure match | Full retrieval | Full + evidence |
| Homeostasis | Skip | Quick check | Full assessment | Full + re-assess |
| Cost | ~$0 | ~$0.001 | ~$0.01 | ~$0.05-0.15 |

---

## Activity Classification

### Classification Signals (No LLM Required)

| Signal | Detection Method | Cost |
|--------|-----------------|------|
| Tool/MCP call | Action type check | Free |
| Template message | Pattern match | Free |
| Procedure exists | Embedding search | Cheap |
| Homeostasis state | Already computed | Free |
| Task verb | Keyword match | Free |
| No procedure match | Absence detection | Free |
| Time elapsed | Timer | Free |
| Irreversible action | Action type check | Free |

### Classification Logic

```typescript
interface ActivityClassification {
  level: 0 | 1 | 2 | 3;
  reason: string;
  model: 'none' | 'haiku' | 'sonnet';
  skipMemory: boolean;
  skipHomeostasis: boolean;
}

function classifyActivity(
  task: Task,
  procedureMatch: Procedure | null,
  homeostasis: HomeostasisState | null
): ActivityClassification {

  // Level 0: Direct actions
  if (isDirectToolCall(task)) {
    return {
      level: 0,
      reason: 'direct_tool_call',
      model: 'none',
      skipMemory: false,  // Still inject hard rules
      skipHomeostasis: true
    };
  }

  if (isTemplateMessage(task)) {
    return {
      level: 0,
      reason: 'template_message',
      model: 'none',
      skipMemory: true,
      skipHomeostasis: true
    };
  }

  // Level 3: Knowledge gaps or high stakes
  if (homeostasis?.knowledge_sufficiency === 'LOW' ||
      homeostasis?.certainty_alignment === 'LOW') {
    return {
      level: 3,
      reason: 'knowledge_gap',
      model: 'sonnet',
      skipMemory: false,
      skipHomeostasis: false
    };
  }

  if (isIrreversibleAction(task)) {
    return {
      level: 3,
      reason: 'high_stakes',
      model: 'sonnet',
      skipMemory: false,
      skipHomeostasis: false
    };
  }

  // Level 1: Procedure exists with high success
  if (procedureMatch && procedureMatch.success_rate > 0.85) {
    return {
      level: 1,
      reason: 'procedure_match',
      model: 'haiku',
      skipMemory: false,  // Still retrieve the procedure
      skipHomeostasis: true  // Quick path
    };
  }

  // Level 2: Default for reasoning tasks
  return {
    level: 2,
    reason: 'requires_reasoning',
    model: 'sonnet',
    skipMemory: false,
    skipHomeostasis: false
  };
}
```

### Helper Functions

```typescript
function isDirectToolCall(task: Task): boolean {
  // MCP tool invocations that don't need reasoning
  const directTools = [
    'filesystem.read', 'filesystem.write', 'filesystem.list',
    'git.status', 'git.push', 'git.pull',
    'discord.send', 'discord.read'
  ];
  return directTools.some(t => task.action?.startsWith(t));
}

function isTemplateMessage(task: Task): boolean {
  // Messages that follow known patterns
  const templates = [
    /^(Starting|Finished|Working on) .+/,
    /^PR ready.*/,
    /^Acknowledged.*/
  ];
  return templates.some(t => t.test(task.content));
}

function isIrreversibleAction(task: Task): boolean {
  // Actions that can't be easily undone
  const irreversible = [
    'git.push --force',
    'git.branch -D',
    'filesystem.delete',
    'database.drop',
    'deploy.production'
  ];
  return irreversible.some(a => task.action?.includes(a));
}
```

---

## Architecture Integration

### Where Activity Router Fits

```
Task arrives
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│  ACTIVITY ROUTER (new)                                      │
│  ├── Quick classification (no LLM)                         │
│  ├── Determines: level, model, what to skip                │
│  └── Routes to appropriate pipeline                         │
└─────────────────────────────────────────────────────────────┘
     │
     ├── Level 0 ──► Execute directly (inject hard rules only)
     │
     ├── Level 1 ──► Haiku + procedure + quick homeostasis
     │
     ├── Level 2 ──► Sonnet + full retrieval + homeostasis
     │
     └── Level 3 ──► Sonnet + Reflexion loop
                     (Draft → Evidence → Critique → Revise)
```

### Updated Architecture Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GALATEA AGENT                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                    LAYER 0: ACTIVITY ROUTER (new)                      │ │
│  │  Classifies activity → Selects level → Routes to appropriate pipeline  │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌────────────────────────────────┐  │ │
│  │  │   Level 0   │  │  Level 1-2  │  │         Level 3                │  │ │
│  │  │  (Direct)   │  │  (Standard) │  │   (Reflexion Loop)             │  │ │
│  │  └─────────────┘  └─────────────┘  └────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                   │                                          │
│                                   ▼                                          │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                    LAYER 1: EXPLICIT GUIDANCE                          │ │
│  │  (unchanged - persona, domain rules, hard blocks)                      │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                   │                                          │
│                                   ▼                                          │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                   LAYER 2: HOMEOSTASIS ENGINE                          │ │
│  │  (unchanged - 6 dimensions, but may be skipped for Level 0-1)          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                   │                                          │
│                                   ▼                                          │
│                            (rest unchanged)                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Model Changes

### Memory: Minimal Changes (Optional)

Episodes can optionally track activity metadata for learning:

```typescript
interface Episode {
  // Existing fields...

  // Optional: Activity tracking
  activity_level?: 0 | 1 | 2 | 3;
  model_used?: 'none' | 'haiku' | 'sonnet';
}
```

**Purpose**: Learn which levels/models work best for which task types.
**Status**: Optional, can add later if we want to optimize.

### Homeostasis: No Changes

Activity level is **derived from** homeostasis signals, not a new dimension:

```typescript
// Homeostasis signals influence level selection
if (homeostasis.knowledge_sufficiency === 'LOW') {
  level = Math.max(level, 3);  // Escalate
}
```

### Self Model: Add Model Awareness

```typescript
interface SelfModel {
  // Existing fields...
  identity: { name, role, domain };
  capabilities: { strong, weak, tools_available };
  limitations: string[];

  // NEW: Available models (from config, not learned)
  available_models: ModelSpec[];

  // NEW: Current operational state (ephemeral, not stored)
  current_state?: {
    activity_level: 0 | 1 | 2 | 3;
    model_in_use: string;
    reason: string;
  };
}

interface ModelSpec {
  id: string;           // 'haiku', 'sonnet', 'opus'
  provider: string;     // 'anthropic', 'openrouter'
  characteristics: string[];  // ['fast', 'cheap'], ['capable', 'reasoning']
  suitable_for: number[];     // Activity levels: [0, 1] or [2] or [3]
  cost_per_1k_tokens: number;
}
```

**Key insight**: `available_models` comes from **config**, not learning. The agent knows what models exist because we tell it. The `current_state` is ephemeral and provides self-knowledge during execution.

---

## Level 3: Reflexion Integration

When Level 3 is triggered, use the Reflexion pattern:

```typescript
async function executeLevel3(task: Task, context: Context): Promise<Result> {
  const MAX_ITERATIONS = 3;

  // Initial draft
  let draft = await generateDraft(task, context, 'sonnet');

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // Gather evidence
    const evidence = await gatherEvidence(draft, task);

    // Critique
    const critique = await generateCritique(draft, evidence, 'sonnet');

    // Check if good enough
    if (critique.issues.length === 0) {
      break;
    }

    // Revise
    draft = await reviseWithEvidence(draft, critique, evidence, 'sonnet');
  }

  return draft;
}

interface Critique {
  issues: Array<{
    type: 'missing' | 'unsupported' | 'incorrect';
    description: string;
    suggested_fix?: string;
  }>;
  confidence: number;
}
```

---

## Scenario Validation

### Scenario 4.1: PM Assigns Task

| Activity | Classification | Level | Model |
|----------|---------------|-------|-------|
| Read Discord message | `isDirectToolCall` | 0 | None |
| Parse "@Agent-1 #101" | `isTemplateMessage` | 0 | None |
| Acknowledge "Starting #101" | `isTemplateMessage` | 0 | None |

**Result**: 3 activities, 0 LLM calls.

### Scenario 4.2: Implement Profile Screen

| Activity | Classification | Level | Model |
|----------|---------------|-------|-------|
| Retrieve memories | Tool call | 0 | None |
| Check procedure match | Found, success_rate: 1.0 | - | - |
| Homeostasis quick check | All HEALTHY | - | - |
| Write code | `procedure_match` | 1→2 | Sonnet |
| Run tests | `isDirectToolCall` | 0 | None |
| Create MR | `isDirectToolCall` | 0 | None |
| Post "PR ready" | `isTemplateMessage` | 0 | None |

**Note**: Even with procedure match, "Implement" might warrant Level 2 for quality. This is a tuning decision.

### Scenario 4.5: Unknown (Push Notifications)

| Activity | Classification | Level | Model |
|----------|---------------|-------|-------|
| Retrieve memories | Tool call | 0 | None |
| No procedure match | - | - | - |
| Homeostasis: knowledge LOW | `knowledge_gap` | 3 | Sonnet |
| Draft approach | Level 3 | 3 | Sonnet |
| Gather evidence (search) | Level 3 | 3 | - |
| Critique | Level 3 | 3 | Sonnet |
| Realize gap → Ask PM | Level 3 | 3 | Sonnet |

**Result**: Escalated to Level 3, uses Reflexion loop.

### Scenario: Simple Fix (Null Check)

| Activity | Classification | Level | Model |
|----------|---------------|-------|-------|
| Parse review comment | Pattern match | 1 | Haiku |
| Assess: clear fix | All HEALTHY | - | - |
| Apply fix | Procedure-like | 1 | Haiku |
| Commit + respond | Tool + template | 0 | None |

**Result**: Simple fix stays at Level 1, uses Haiku.

---

## Self-Knowledge Falls Out Free

The routing logic **is** the self-knowledge:

```typescript
// During execution, agent knows:
const selfKnowledge = {
  current_activity: "implementing profile screen",
  activity_level: 2,
  model_in_use: "sonnet",
  why: "Implement verb, no strong procedure match → Level 2 → Sonnet",

  // Can introspect
  could_use_haiku: false,  // "Implement" needs reasoning
  could_escalate: true,    // Could go to Level 3 if stuck
};
```

This enables honest statements like:
- "I'm using Sonnet for this because it requires reasoning"
- "For simple acknowledgments, I don't need a full model"
- "I'm escalating to deeper analysis because I'm uncertain"

---

## Implementation Plan

### New Components

| Component | Location | Complexity |
|-----------|----------|------------|
| `ActivityRouter` | `src/lib/routing/router.ts` | ~100 lines |
| `classifyActivity` | `src/lib/routing/classifier.ts` | ~50 lines |
| `ModelSelector` | `src/lib/routing/models.ts` | ~30 lines |
| `ReflexionLoop` | `src/lib/routing/reflexion.ts` | ~100 lines |
| Model config | `config/models.yaml` | ~20 lines |

**Total**: ~300 lines of new code.

### Changes to Existing Code

| Component | Change | Complexity |
|-----------|--------|------------|
| `SelfModel` type | Add `available_models`, `current_state` | Trivial |
| `Episode` type | Optional `activity_level`, `model_used` | Trivial |
| `ContextBuilder` | Check activity level, skip if Level 0-1 | Low |
| `HomeostasisEngine` | Add `quickCheck()` for Level 1 | Low |

### Config File

```yaml
# config/models.yaml
models:
  - id: haiku
    provider: anthropic
    model_id: claude-3-haiku-20240307
    characteristics: [fast, cheap, good_for_simple]
    suitable_for: [0, 1]
    cost_per_1k_tokens: 0.00025

  - id: sonnet
    provider: openrouter
    model_id: anthropic/claude-sonnet-4
    characteristics: [capable, reasoning, balanced]
    suitable_for: [2]
    cost_per_1k_tokens: 0.003

  - id: opus
    provider: anthropic
    model_id: claude-opus-4
    characteristics: [most_capable, expensive, deep_reasoning]
    suitable_for: [3]
    cost_per_1k_tokens: 0.015

level_defaults:
  0: none
  1: haiku
  2: sonnet
  3: sonnet  # With reflexion loop
```

---

## Open Questions

### 1. Procedure Match Threshold

When does procedure match warrant Level 1 vs Level 2?
- Current: `success_rate > 0.85`
- Consider: Task complexity, procedure specificity

### 2. Level 1 → Level 2 Escalation

If Haiku produces poor result at Level 1, should we auto-retry at Level 2?
- Pro: Self-healing
- Con: Adds complexity, may hide procedure quality issues

### 3. Reflexion Iteration Limits

How many iterations for Level 3?
- Current: MAX_ITERATIONS = 3
- Could be: Task-dependent, or confidence-based exit

### 4. Cost Tracking

Should we track cost per activity level for optimization?
- Would help tune level thresholds
- Adds observability requirements

---

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Level 0 activities | >40% of all activities | Activity log |
| Level 1 activities | ~30% | Activity log |
| Level 2 activities | ~25% | Activity log |
| Level 3 activities | <5% | Activity log |
| Cost reduction vs always-Sonnet | >50% | Token tracking |
| Quality regression | <5% | User feedback |

---

## Conclusion

Activity-Level Routing provides:

1. **Cost efficiency**: Level 0-1 activities (70%+) use no/cheap model
2. **Appropriate depth**: Complex tasks get full reasoning
3. **Self-knowledge**: Agent knows what model it's using and why
4. **Clean integration**: Slots above existing architecture
5. **Low complexity**: ~300 lines of new code

**Ties to psychology**: This is our implementation of System 1/System 2 (Kahneman), grounded in practical activity classification rather than abstract cognitive modes.

---

*Design completed: 2026-02-03*
*Builds on: Reflexion pattern, Homeostasis architecture*
*Resolves: BRAINSTORM_QUEUE #3 (Adaptive Model Selection)*
