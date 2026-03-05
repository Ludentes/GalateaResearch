# Heuristic Extraction Analysis: 4 Developers, 1843 Sessions

**Date**: 2026-02-25
**Goal**: Decide (1) are heuristics enough or should we go back to LLMs, (2) how to improve heuristics if we stick with them.

## Raw Data

| Developer | Sessions | Non-empty | Turns | Signal | Noise% | Raw entries | After gate | Yield |
|-----------|----------|-----------|-------|--------|--------|-------------|------------|-------|
| newub     | 214      | 99        | 15,513 | 1,784 | 88.5% | 300        | 300        | 1.93% |
| dem       | 1,377    | 1,352     | 2,998 | 1,390 | 53.6% | 1,003      | 451        | 15.04% |
| qp        | 215      | 204       | 737   | 244    | 66.9% | 141        | 129        | 17.50% |
| **Total** | **1,806**| **1,655** |**19,248**|**3,418**| **82.2%** | **1,444** | **880** | **4.57%** |

## Signal Classification Distribution

| Signal Type | newub | dem | qp | Total | % of signal |
|-------------|-------|-----|-----|-------|-------------|
| noise       | 13,729 | 1,608 | 493 | 15,830 | — |
| factual     | 1,484 | 387 | 103 | 1,974 | 57.8% |
| policy (we...)| 70  | 236 | 91  | 397   | 11.6% |
| imperative_rule | 38 | 586 | 13 | 637  | 18.6% |
| preference  | 63    | 81  | 4   | 148   | 4.3% |
| correction  | 44    | 100 | 29  | 173   | 5.1% |
| decision    | 57    | 0   | 1   | 58    | 1.7% |
| procedure   | 28    | 0   | 3   | 31    | 0.9% |

### Key Observation: Factual is 57.8% of all signal turns

The single biggest category of signal turns is "factual" — long substantial messages that don't match any heuristic pattern. These are the turns that would need LLM extraction. But looking at the actual factual examples:

- **IDE events**: `<ide_opened_file>`, `<ide_selection>` — system-generated, not user knowledge
- **Task descriptions**: `<task>Fix this component...</task>` — structured IDE input, not conversational
- **Error logs**: Stack traces, console output pasted for debugging
- **Debugging context**: "I tried X and got Y error"

**Verdict: Most factual turns contain NO extractable long-term knowledge.** They are task-specific context that should NOT persist across sessions.

## Entry Type Distribution (after gate)

| Type | newub | dem | qp | Total | % |
|------|-------|-----|-----|-------|---|
| rule | 108   | 316 | 92  | 516   | 58.6% |
| correction | 44 | 100 | 29 | 173 | 19.7% |
| preference | 63 | 35  | 4  | 102   | 11.6% |
| decision | 57  | 0   | 1  | 58    | 6.6% |
| procedure | 28 | 0   | 3  | 31    | 3.5% |

## Cognitive Model Distribution

| Model | newub | dem | qp | Total | % |
|-------|-------|-----|-----|-------|---|
| User  | 63    | 35  | 4   | 102   | 11.6% |
| Team  | 70    | 236 | 91  | 397   | 45.1% |
| Project | 167 | 180 | 34  | 381   | 43.3% |

## Quality Issues Identified

### Problem 1: Correction pattern is too broad (HIGH IMPACT)

The correction regex matches any message containing "wrong", "incorrect", etc. This produces false positives:

```
"Any ideas what we might be doing wrong?"          → NOT a correction, it's a question
"What am I doing wrong?"                            → NOT a correction, it's a question
"I think the way we are using X is incorrect"       → NOT a correction, it's a hypothesis
"graphql file to see what's wrong with it"          → NOT a correction, it's exploration
```

**173 corrections extracted — estimate 60%+ are false positives** (questions, debugging exploration, not actual "No, that's wrong — do X instead" corrections).

### Problem 2: DEM's imperative_rule count is suspiciously high (586)

DEM has 586 imperative_rule classifications vs 38 for newub and 13 for QP. Looking at DEM's "rule" samples:

```
"active-task directory\n</todos>\n</update_todo_list>"
```

This suggests DEM uses an IDE extension that wraps user input in XML tags, and some of these contain "must"/"always"/"never" inside structured content that isn't conversational. The imperative_rule regex is firing on structured/templated content.

### Problem 3: General knowledge gate drops 55% of DEM entries

DEM: 1003 raw → 451 after gate = **552 dropped as general knowledge**. This is 55% false positive rate on extraction. The expanded common_patterns (14 patterns) are catching too much from DEM's sessions. Need to verify these aren't actually project-specific rules being incorrectly classified as general.

### Problem 4: Decisions without context are useless

From Umka and newub sessions:
```
"Let's go with 1"
"Let's go with A"
"Let's go with your suggestion"
"Let's use it I think"
```

These are meaningless without knowing what "1", "A", or "it" refers to. Heuristics extract the sentence but lose the multi-turn context. **58 decisions extracted — estimate 50%+ lack actionable context.**

### Problem 5: Preference pattern matches non-preferences

```
"If I want to test this locally what is the recommended approach?"  → question, not preference
"I always scare of ."                                                → not a preference
```

The "I want" and "I always" patterns fire on questions and incomplete sentences.

### Problem 6: Procedure extractions grab surrounding noise

Procedure detection (numbered lists) grabs everything around the list including commit messages, verification checklists, and plan headers — not just the procedural steps themselves.

### Problem 7: Duplicate entries across sessions

DEM samples show the same content extracted multiple times:
```
"Since we are tied to authors, we must pass the author's ID." (×3)
```

The dedup should be catching these but the bulk script bypasses the extraction pipeline's dedup. In production pipeline this would be handled — but it's a concern for repeated short sessions.

### Problem 8: IDE/system content leaking into extractions

QP and DEM sessions contain IDE events (`<ide_opened_file>`, `<task>`, `<feedback>`) that get partially extracted when they contain signal patterns embedded in structured XML. The transcript reader needs to strip or handle these system-generated wrappers.

## Decision: Heuristics vs LLM

### What heuristics do well:
1. **Signal/noise separation** — 82% noise filtering works across all 4 developers
2. **High-confidence patterns** — "I prefer X", "We always X", "Let's go with X" are reliable
3. **Speed** — instant extraction, no Ollama dependency
4. **Cognitive model routing** — pronoun-based about inference works correctly

### What heuristics do poorly:
1. **Corrections** — 60%+ false positive rate (questions misclassified as corrections)
2. **Context-free decisions** — "Let's go with 1" is useless without surrounding turns
3. **Structured IDE content** — XML tags leak signal patterns
4. **Procedures** — grab too much surrounding content

### What LLM adds:
1. **Multi-turn synthesis** — could resolve "Let's go with 1" by reading the previous assistant turn
2. **Intent discrimination** — "What am I doing wrong?" is a question, not a correction
3. **Content summarization** — could distill long messages to their essential knowledge

### What LLM does NOT add:
1. **Better signal/noise** — heuristic classification is already good
2. **Better preferences** — "I prefer X" is already extracted correctly
3. **Better rules** — "We always X" is already extracted correctly

### Recommendation: STICK WITH HEURISTICS, FIX THE PATTERNS

The LLM's main value-add is multi-turn synthesis and intent discrimination. But:
- Multi-turn synthesis requires sending 2-3 turns of context to the LLM per extraction — expensive
- Intent discrimination (question vs correction) can be handled by a simple regex refinement
- 57.8% of signal turns are "factual" but contain mostly task-specific debugging context, not long-term knowledge

**Cost-benefit: Improving heuristic patterns will fix 80% of quality issues at zero latency cost. LLM fallback can be reserved for explicit @remember of complex multi-turn patterns.**

## Improvement Plan

### Fix 1: Tighten correction pattern (HIGH PRIORITY)
Current: `/\b(no,?\s+(that'?s|it'?s|i meant|actually)|wrong|incorrect|not what i|i said)\b/i`
Problem: Matches questions containing "wrong" or "incorrect"
Fix: Require corrections to have correction + directive structure:
```regex
/\b(no,?\s+(that'?s|it'?s|i meant|actually))\b/i
```
Remove standalone "wrong" and "incorrect" — they're too ambiguous.

### Fix 2: Filter questions from all patterns
Add a question filter: if the message ends with `?` and doesn't contain a directive after the question, skip it.

### Fix 3: Strip IDE wrappers before classification
Pre-process turns: strip `<ide_opened_file>`, `<task>`, `<feedback>`, `<command-message>` wrappers. Extract the inner text content for classification.

### Fix 4: Minimum content length for decisions
Decisions shorter than 20 characters after "let's go with" are likely referencing options from a previous turn and lack context. Either skip or flag as needing multi-turn resolution.

### Fix 5: Bound procedure extraction
Only extract the numbered list itself, not the surrounding content. Stop at the first non-numbered-list line after the list starts.

### Fix 6: Review general knowledge patterns
The 55% drop rate for DEM suggests the expanded pattern list (14 patterns) may be too aggressive. Audit which specific patterns are firing and consider narrowing.

## Recall Analysis (from manual review by subagents)

Three subagents independently read raw session transcripts for each developer and identified knowledge that heuristics SHOULD extract but MISS.

### Recall Estimates

| Developer | Turns analyzed | Heuristics catch | Heuristics miss | Recall |
|-----------|---------------|-----------------|-----------------|--------|
| newub     | ~530          | ~25             | ~27             | **~48%** |
| DEM       | ~40 (substantive) | ~2          | ~23             | **~8%** |
| QP        | ~50 (substantive) | ~3-4        | ~15             | **~18%** |

**DEM/QP caveat**: Most of their "user" turns are tool_result confirmations, IDE events, or skill prompts — not human text. Substantive turns are far fewer than raw counts suggest.

### Top Categories of Missed Knowledge (across all developers)

| Category | Items missed | % of all misses | Example |
|----------|-------------|-----------------|---------|
| Architectural decisions in prose | ~23 | 35% | "Not owning the loop is against the idea" |
| Debugging lessons / tech gotchas | ~12 | 18% | "TypeORM: set null explicitly, not undefined" |
| Implicit preferences (no trigger) | ~11 | 17% | "I don't think it should be in the header" |
| Business rules as clarifications | ~8 | 12% | "Single queue: no code needed. Bulk: code required." |
| Tech stack facts in context | ~7 | 11% | "Author is just a user with a specific role" |
| Workflow procedures in prose | ~5 | 8% | "documentation is fine, let's develop" (repeated 4x) |

### The LLM Recall Question

Would an LLM do better? Looking at what's missed:

1. **Prose architectural decisions** (35%): YES, an LLM would catch these. "Not owning the loop is against the idea" requires understanding intent, not pattern matching.

2. **Debugging lessons** (18%): PARTIALLY. An LLM could extract "TypeORM null vs undefined" from error-paste-then-explain patterns, but many error pastes have no extractable lesson.

3. **Implicit preferences** (17%): YES. "I don't think it should be in the header" needs semantic understanding to recognize as a preference.

4. **Business rules** (12%): PARTIALLY. "Single queue: no code. Bulk: code required" is extractable by LLM but could also be a new heuristic pattern ("X is needed for Y but not Z").

5. **Option selection** (new category): "A) Free-form text badge" — choosing from Claude-presented options. An LLM reading the preceding assistant turn would know what "A)" means. Heuristics cannot.

**Estimated LLM recall improvement: +25-35% recall on the missed items, bringing total recall from ~25% to ~50-60%.**

But: the LLM would need to process ALL factual turns (1,974 turns = 57.8% of signal), and most of those contain task-specific debugging context, not long-term knowledge. The cost per extraction at 14-71s (gemma3:12b via Ollama) would be enormous for marginal recall gains.

### Revised Decision: Hybrid with Targeted LLM

Pure heuristics: ~25% recall, instant, zero cost
Pure LLM: ~60% recall, slow (14-71s/turn), expensive
Hybrid (current): heuristics + LLM on factual → ~50% recall, moderate cost

**Revised recommendation**: Keep heuristics as primary. Add targeted LLM only for:
1. **Multi-turn decision resolution**: When heuristic catches "let's go with X" but content is a short reference (< 20 chars), send preceding 2 turns to LLM for context
2. **Option selection detection**: New pattern — user responds with "A)", "B)", "1)", "2)" to a Claude-presented list → send preceding assistant turn to LLM

Do NOT send all factual turns to LLM — the cost/benefit is terrible (~1,974 turns, most with no extractable knowledge).

## Precision + Recall Combined View

| Pattern type | Precision | Recall | F1 | Priority |
|-------------|-----------|--------|-----|----------|
| Preference ("I prefer/always/like") | ~85% | ~60% | 0.71 | Medium |
| Rule ("We always/never") | ~80% | ~50% | 0.62 | Medium |
| Imperative rule ("Never X") | ~70% | ~40% | 0.51 | High (IDE noise) |
| Decision ("Let's go with") | ~50% | ~30% | 0.37 | High (context-free) |
| Correction ("No, that's wrong") | ~40% | ~15% | 0.21 | Critical |
| Procedure (numbered list) | ~30% | ~25% | 0.27 | High |
| **Overall** | **~60%** | **~25%** | **~0.36** | — |

## Improvement Plan

### Fix 1: Tighten correction pattern (CRITICAL — F1 0.21)
Current: `/\b(no,?\s+(that'?s|it'?s|i meant|actually)|wrong|incorrect|not what i|i said)\b/i`
Problem: Matches questions containing "wrong" or "incorrect"
Fix: Remove standalone "wrong" and "incorrect". Keep only strong correction indicators:
```regex
/\b(no,?\s+(that'?s|it'?s|i meant|actually))\b/i
```
Expected improvement: precision 40%→80%, recall stays ~15%, F1 0.21→0.26

### Fix 2: Filter questions from all patterns
Add a question filter: if the message ends with `?` and doesn't contain a directive after the question, skip it. This fixes "What am I doing wrong?" and "If I want to test this...?"
Expected: +5% precision across all types

### Fix 3: Strip IDE wrappers before classification
Pre-process turns: strip `<ide_opened_file>`, `<task>`, `<feedback>`, `<command-message>` wrappers. Extract the inner text content for classification. This fixes DEM's 586 false imperative_rules.
Expected: DEM imperative_rule drops from 586 to ~50 (realistic level)

### Fix 4: Multi-turn context for short decisions (NEW — recall improvement)
When "let's go with" is followed by <20 chars of content (e.g., "1", "A", "your suggestion"), look at the preceding assistant turn for the option list and extract the resolved decision.
This is the ONE place where LLM adds clear value — resolving anaphoric references.
Expected: decision recall 30%→55%, decision precision 50%→80%

### Fix 5: Option selection pattern (NEW — recall improvement)
Add new heuristic: user responds with just "A)", "B)", "1)", "2)" or "A" alone — this is an option selection from the previous turn. Same multi-turn resolution as Fix 4.
Expected: catches ~4 items per developer that currently fall through as noise

### Fix 6: Bound procedure extraction
Only extract the numbered list itself, not the surrounding content. Stop at the first non-numbered-list line after the list starts.
Expected: procedure precision 30%→70%

### Fix 7: "I don't think" as soft preference trigger (NEW — recall improvement)
Add pattern: `/\b(i don'?t think)\b/i` → maps to preference with 0.80 confidence (lower than "I prefer").
Expected: catches ~5% more implicit preferences

### Fix 8: Review general knowledge patterns
The 55% drop rate for DEM suggests the expanded pattern list (14 patterns) may be too aggressive. Audit which specific patterns are firing and consider narrowing.

## Summary Table

| Metric | Current | After fixes (estimate) |
|--------|---------|----------------------|
| Correction precision | ~40% | ~80% |
| Decision precision | ~50% | ~80% |
| Decision recall | ~30% | ~55% |
| Procedure precision | ~30% | ~70% |
| Preference precision | ~85% | ~95% |
| Rule precision | ~80% | ~90% |
| Overall precision | ~60% | ~85% |
| Overall recall | ~25% | ~35% |
| Overall F1 | ~0.36 | ~0.50 |
| LLM required | No | Targeted only (short decisions) |

### Open Question: Is 35% Recall Acceptable?

With all heuristic fixes, we estimate ~35% recall and ~85% precision. This means:
- **We catch 1 in 3 extractable knowledge items** — but the ones we catch are reliable
- **65% of knowledge is invisible** to heuristics — prose decisions, debugging lessons, implicit preferences

For a memory system that builds up over many sessions, 35% recall may be acceptable if:
1. Important knowledge tends to be repeated (recall improves with session count)
2. Users can use `@remember` for critical items they want captured
3. The precision is high enough that the captured items are trusted

If 35% recall is NOT acceptable, the clear path is: targeted LLM on the preceding assistant turn when users make short option-selection responses. This would bring recall to ~45-50% at modest cost.
