# Using the Homeostasis System

Practical guide for understanding, operating, and tuning the homeostasis engine.

## Overview

The homeostasis system measures psychological balance across 6 dimensions. It runs on every Level 2-3 message and produces an assessment that gets stored to the database.

**Where it fits in the pipeline:**

```
User Message
  -> Activity Router (classify level 0-3)
  -> Context Assembly (retrieve memory, build prompt)
  -> LLM Generation (produce response)
  -> Response sent to user
  -> [async, fire-and-forget] Homeostasis Assessment -> DB
```

The assessment is fire-and-forget: it does not block the chat response. The result is stored asynchronously and picked up by the UI on the next poll cycle.

## Understanding Homeostasis States

Each dimension has 3 possible states:

| State | Meaning | Action |
|-------|---------|--------|
| **HEALTHY** | Balanced, no intervention needed | None |
| **LOW** | Under-indexed, guidance injected into agent prompt | Address the deficit |
| **HIGH** | Over-indexed, guidance injected into agent prompt | Rebalance |

All dimensions start at HEALTHY. A new session with no prior assessment is treated as fully balanced.

### Dimension Quick Reference

| Dimension | Core Question | LOW | HIGH |
|-----------|--------------|-----|------|
| `knowledge_sufficiency` | "Do I know enough?" | Knowledge gap -- research or ask | Info overload -- focus on key facts |
| `certainty_alignment` | "Does confidence match stakes?" | Uncertain about risky action -- ask first | Overconfident on risky action -- verify |
| `progress_momentum` | "Am I moving forward?" | Stuck >30min, <3 actions -- change approach | Rushing >10 actions in <10min -- slow down |
| `communication_health` | "Am I connected?" | Silent >10min -- check in | Messaging <2min apart -- batch updates |
| `productive_engagement` | "Am I contributing?" | No assigned task -- find work | Overloaded -- prioritize/delegate |
| `knowledge_application` | "Learning vs doing?" | <20% research -- learn more | >80% research -- start building |

## How Activity Routing Works

The activity router classifies each incoming message into one of four levels:

| Level | Name | Model | Description |
|-------|------|-------|-------------|
| 0 | Direct | None | Tool calls, template messages ("done", "ok", "yes") |
| 1 | Pattern | Haiku | Procedure match with >80% success rate and >5 uses |
| 2 | Reason | Sonnet | Default for most messages |
| 3 | Reflect | Sonnet + Reflexion | Knowledge gaps, high-stakes irreversible actions |

### Decision Flow

The router evaluates in this order, returning the first match:

1. **Is it a tool call or template?** Messages like "done", "ok", "yes", or explicit tool calls route to Level 0. No LLM, no memory retrieval.
2. **Does it need deep reflection?** If any Level 3 trigger fires (see below), route to Level 3.
3. **Is there a strong procedure match?** A procedure with >80% success rate and >5 historical uses routes to Level 1 (Haiku).
4. **Otherwise** -- Level 2 (Sonnet). This is the default path for most messages.

### What Triggers Level 3

Level 3 activates when any of these conditions hold:

- **Knowledge gap markers in message**: "how do I", "how to", "not sure", "don't know", "help me", "never done", "first time", "unclear", "explain", "what is"
- **High-stakes AND irreversible action**: Message contains both a high-stakes keyword (e.g., "production", "deploy", "security") AND an irreversible keyword (e.g., "force push", "drop table", "rm -rf", "deploy to production")
- **Low `knowledge_sufficiency` + high-stakes message**: Homeostasis detected a knowledge gap and the message involves high stakes
- **Low `certainty_alignment` + irreversible action**: Homeostasis detected uncertainty and the action cannot be undone

## Reading the UI

The homeostasis state is displayed in the sidebar and on individual messages.

**Sidebar (6 dimension bars):**
- Yellow = LOW (needs attention)
- Green = HEALTHY (balanced)
- Blue = HIGH (over-indexed)
- "Last updated" timestamp shows when the most recent assessment ran
- Auto-refreshes after each new assistant message

**Activity level badges on assistant messages:**
- Gray = Level 0 (Direct)
- Blue = Level 1 (Pattern)
- Purple = Level 2 (Reason)
- Orange = Level 3 (Reflect)

## Tuning Thresholds

All thresholds are in source code, not config files. Edit the engine directly.

### Communication Health

File: `server/engine/homeostasis-engine.ts`, method `_assessCommunicationHealthComputed`

| Threshold | Current Value | Effect of Lowering | Effect of Raising |
|-----------|---------------|-------------------|-------------------|
| HIGH boundary | <2 min since last message | Allows faster communication without flagging | Flags more conversations as over-communicating |
| LOW boundary | >10 min since last message | Detects silence earlier | Tolerates longer gaps before flagging |

### Progress Momentum

File: `server/engine/homeostasis-engine.ts`, method `_assessProgressMomentumComputed`

| Threshold | Current Value | Effect of Lowering | Effect of Raising |
|-----------|---------------|-------------------|-------------------|
| LOW: time stuck | >30 min on task | Detects stuckness earlier | More patience before flagging |
| LOW: action count | <3 actions | Requires fewer actions to look stuck | Requires more inaction to trigger |
| HIGH: time window | <10 min | Shorter burst window to detect rushing | Wider window, harder to trigger |
| HIGH: action count | >10 actions | Easier to trigger rushing detection | More tolerant of rapid actions |

### Knowledge Sufficiency

File: `server/engine/homeostasis-engine.ts`, method `assessKnowledgeSufficiency`

| Threshold | Current Value | Effect of Lowering | Effect of Raising |
|-----------|---------------|-------------------|-------------------|
| HEALTHY: minimum facts | >=5 facts | Easier to satisfy | Requires more retrieved knowledge |
| HEALTHY: confidence bar | >0.7 avg confidence | Accepts lower-quality facts | Demands higher-quality retrieval |
| HIGH: fact count | >20 facts | Triggers overload at fewer facts | Tolerates more facts before overload |
| HIGH: confidence floor | <0.5 avg confidence | Triggers on higher-confidence sets | Only triggers on very low confidence |

### Knowledge Application

File: `server/engine/homeostasis-engine.ts`, method `assessKnowledgeApplication`

| Threshold | Current Value | Note |
|-----------|---------------|------|
| LOW: research ratio | <20% | Only works when `timeSpentResearching`/`timeSpentBuilding` data is available |
| HIGH: research ratio | >80% | Phase 4 dependency -- defaults to HEALTHY (confidence 0.4) until time tracking is wired |

### Guidance Text

File: `server/engine/guidance.yaml`

Each dimension has a `LOW` and `HIGH` entry with:
- `priority` (integer): Determines which guidance shows first when multiple dimensions are imbalanced. Lower number = higher priority.
- `primary` (string): Main guidance text injected into the agent's system prompt.
- `secondary` (string): Additional context, shown alongside primary guidance.

Edit `primary` to change what the agent sees. Edit `secondary` for supplementary context. Adjust `priority` to reorder which imbalance gets addressed first.

## How Guidance Works

When any dimension is LOW or HIGH, the engine assembles guidance text:

1. Collect all imbalanced dimensions (state != HEALTHY).
2. Sort by priority (lowest number first).
3. Return the highest-priority dimension's guidance as `primary`.
4. `secondary` includes either the YAML secondary text or a count of other imbalanced dimensions (e.g., "Note: 2 other dimension(s) also need attention.").
5. The assembled guidance is included in the LLM system prompt for the next message.

If all dimensions are HEALTHY, `getGuidance()` returns `null` and no guidance is injected.

### Priority Order

From highest to lowest priority:

| Priority | Dimensions at this level |
|----------|--------------------------|
| 1 (highest) | `knowledge_sufficiency` LOW, `certainty_alignment` LOW |
| 2 | `progress_momentum` LOW, `productive_engagement` LOW, `knowledge_application` HIGH |
| 3 | `certainty_alignment` HIGH, `communication_health` LOW |
| 4 | `progress_momentum` HIGH, `productive_engagement` HIGH |
| 5 | `knowledge_sufficiency` HIGH, `knowledge_application` LOW |
| 6 (lowest) | `communication_health` HIGH |

The logic: safety concerns and forward progress rank highest. Refinements like "you're over-communicating" rank lowest.

## Known Limitations

**Knowledge sufficiency inflation.** Graphiti returns up to 20 tangential facts for any query. The dimension often shows HEALTHY even when the retrieved facts are irrelevant to the actual topic. Fix: add a relevance threshold to the memory search before counting facts.

**Reflexion loop JSON parsing.** The LLM wraps its critique response in markdown code fences, which causes JSON parse failure. Level 3 critique is effectively bypassed (treated as "pass"). Fix: strip code fences before parsing the critique JSON.

**isIrreversible exact matching.** Irreversible action detection uses `String.includes()` for exact substrings. "deploy to production" matches, but "Deploy the profile service to production" does not match "deploy to production" because the check is case-insensitive but "deploy to production" must appear as a contiguous substring. Partial insertions like "deploy X to production" won't match "deploy to production". Fix: switch to word-boundary or fuzzy matching.

**Time tracking not available.** `knowledge_application` defaults to HEALTHY with confidence 0.4 because `timeSpentResearching` and `timeSpentBuilding` are not populated from any source. This is a Phase 4 dependency.

**Idle detection invisible.** `hasAssignedTask` is always `true` during active conversations (having messages = having a task). The idle state (`productive_engagement` LOW) can only be observed with crafted engine-level test contexts.

**All assessments are heuristic.** No LLM-based assessments exist yet. Every dimension uses rule-based "computed" methods. The `assessment_method` field will show "computed" for all dimensions.

## Troubleshooting

**All dimensions show HEALTHY.**
Likely a new session or Graphiti inflation masking real state. Check if the facts returned from memory search are actually relevant to the current topic. Also verify the assessment ran at all (see below).

**Level 3 takes too long.**
The Reflexion loop is 3-4x slower than Level 2 (110-145s vs 15-65s with Ollama). This is expected behavior. If latency is unacceptable, check whether the task truly needs Level 3 by reviewing the routing reason in the classification output.

**Activity level not showing on messages.**
Verify that the `activityLevel` column is being populated in `chat.logic.ts`. The `storeMessageLogic` function must receive the activity level from the router. Check for null/undefined values in the message store path.

**Homeostasis sidebar says "No assessment yet".**
Assessment is fire-and-forget, running asynchronously after the response is sent. Wait approximately 500ms after the response arrives. The sidebar auto-refetches on a timer. If it persists, check server logs for errors in the homeostasis assessment path.

**Guidance not appearing in prompts.**
1. Verify the homeostasis assessment ran: check server logs for `[homeostasis]` entries.
2. Verify at least one dimension is non-HEALTHY: `getGuidance()` returns `null` when all dimensions are balanced.
3. Verify context assembly includes the guidance section: check `AssembledContext.metadata.homeostasis_guidance_included`.
