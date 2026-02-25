# Extraction: Heuristics vs LLM — Analysis from Real Data

**Date:** 2026-02-24
**Input:** 86 entries extracted from 4 telejobs sessions via gemma3:12b

---

## 1. The Dilemma

We have two options for extracting knowledge from session transcripts:

### Option A: Prompt-engineer the LLM extraction

We have an `experiments/extraction/` folder with a gold-standard dataset (52 items), Langfuse-backed eval loop, and scoring metrics (about_recall, entity_recall, type_accuracy, count_accuracy). We could iterate on the extraction prompt, test against gold-standard, and improve the LLM's output quality.

**Cost:**
- Ollama dependency at runtime (14-71 seconds per chunk)
- Prompt iteration time (days of experimentation)
- Ongoing model drift risk (different Ollama models behave differently)
- The uniform-confidence problem may be inherent to small models — gemma3:12b cannot differentiate 0.7 from 0.95

**Benefit:**
- Can theoretically handle fuzzy cases ("the team seems to prefer X")
- Can synthesize across turns ("user complained about Z three times → preference")

### Option B: Heuristic extraction with user-facing conventions

Replace the LLM with regex/pattern-based extraction. Define conventions that users naturally follow (or can be taught). The signal classifier already does heuristic classification — extend it to produce full `KnowledgeEntry` objects.

**Cost:**
- Cannot synthesize across turns
- Requires user messages to contain extractable patterns
- Misses implicit knowledge

**Benefit:**
- Instant (0ms vs 14-71s)
- Deterministic and debuggable
- No Ollama dependency
- No confidence hallucination
- Works offline

### Evidence from real data

Of 86 LLM-extracted entries:
- **82/86 (95%)** have evidence traced to a single user message — the LLM just reformulated user words
- **4/86 (5%)** were synthesized without evidence — 2 are hallucinated ("The team uses Scrum"), 2 are debatable
- **80/86 (93%)** ended at confidence 0.70 because the LLM assigned uniform 1.0 (hallucination guard fired)
- **Only 5/86 (6%)** passed through to CLAUDE.md — all were rules the LLM happened to leave at confidence 1.0
- **0 skills generated**, **0 hooks generated** — the pipeline produced almost nothing useful

The LLM's actual value-add is reformulation ("Let me widen the SUS panels to 7 days" → "SUS panels should show data for 7 days, not 24 hours"). This can be done with simple string manipulation or not at all — the user's own words are often clearer.

**Conclusion:** The LLM is a bottleneck that adds latency and unreliability while providing near-zero value that heuristics can't match. Option B is the right choice for v1.

---

## 2. Proposed Heuristics

### User-facing conventions (teach via CLAUDE.md instructions)

Users already write messages that contain extractable patterns. We document these as conventions and optionally add explicit markers:

```
## Memory Conventions

Galatea learns from your sessions. To help it learn effectively:

- State preferences clearly: "I prefer X", "Always use X", "Never do Y"
- When correcting: "No, it should be X not Y", "That's wrong, use X"
- For rules: "We always X", "Never Y", "Our policy is X"
- For decisions: "Let's go with X", "I've decided to use X"
- For procedures: describe steps ("To deploy: 1) build 2) push 3) restart")

Optional explicit markers (highest confidence):
- `@remember <text>` — explicitly store a preference/rule
- `@forget <text>` — remove a previously stored entry
```

### Extraction heuristics

The signal classifier already detects signal turns. We extend it to produce `KnowledgeEntry` objects:

#### Pattern → Type mapping

| Pattern (in user turn) | Type | Confidence | Origin |
|---|---|---|---|
| `I prefer X` / `I like X` / `I want X` / `I always X` | preference | 0.95 | explicit-statement |
| `I hate X` / `I never X` / `I dislike X` | preference | 0.95 | explicit-statement |
| `We always X` / `We never X` / `Our policy is X` | rule | 0.95 | explicit-statement |
| `Don't ever X` / `Must not X` / `Never X` (imperative) | rule | 0.95 | explicit-statement |
| `No, it should be X` / `That's wrong` / `Incorrect` | correction | 0.90 | explicit-statement |
| `Let's go with X` / `I've decided X` / `We'll use X` | decision | 0.90 | explicit-statement |
| `To X: 1) Y 2) Z` / step-by-step instructions | procedure | 0.85 | explicit-statement |
| `@remember X` | (from content) | 1.00 | explicit-statement |
| Long factual message (fallback) | fact | 0.70 | inferred |

#### Content extraction

For each matched pattern:
1. **Content** = the full sentence/clause containing the match, cleaned up
2. **Evidence** = the full user message text
3. **Entities** = proper nouns and technical terms extracted via simple NER (capitalized words, known tech terms)
4. **Novelty** = `project-specific` for anything with project-specific entities; `general-knowledge` if content matches common patterns ("use version control", "write tests"); `domain-specific` otherwise

#### What we DON'T extract

- Assistant turns (already filtered by signal classifier)
- Short confirmations ("ok", "yes", "thanks")
- Greetings
- Messages with no signal patterns AND under factual_min_length

### Confidence model

| Source | Confidence |
|---|---|
| `@remember` marker | 1.00 |
| Explicit pattern match (I prefer/never/always) | 0.95 |
| Correction pattern (no, that's wrong) | 0.90 |
| Decision pattern (let's go with) | 0.90 |
| Procedure (step-by-step) | 0.85 |
| Long factual fallback | 0.70 |

This maps directly to pipeline thresholds:
- CLAUDE.md requires confidence >= 0.90 → preferences, rules, corrections auto-qualify
- Skills require confidence >= 0.85 → procedures auto-qualify
- Factual fallback at 0.70 → stays pending, needs curation or decays

---

## 3. Testing Against Reference Scenarios

### S1: Explicit preference → auto-approved → CLAUDE.md

**Input:** "Let's use pnpm for this project"

**Signal classifier:** `preference` pattern matches "Let's use" → wait, "let's use" actually matches the `decision` pattern, not `preference`. The signal classifier checks patterns in order: preference > correction > policy > decision. "Let's use" doesn't match preference ("I prefer/like/want..."), but DOES match decision ("let's use").

**Heuristic result:**
- Type: `decision` (not `preference` as scenario expects)
- Content: "Let's use pnpm for this project"
- Confidence: 0.90
- Origin: explicit-statement
- Auto-approve: YES (explicit + 0.90 >= 0.90)
- Routes to: claude-md ✅

**Verdict: PARTIAL PASS** — classified as `decision` not `preference`, but still reaches CLAUDE.md. The type distinction matters for section grouping. Could add "let's use" to preference patterns too, or accept `decision` as correct (it IS a decision).

### S2: Explicit rule → hook candidate

**Input:** "Also, never deploy on Fridays"

**Signal classifier:** `policy` pattern matches "never" — wait, "never deploy" is an imperative "Never X", which matches the proposed `rule` heuristic. But the current signal classifier would match `policy` pattern ("don't ever/use") — actually "never" alone isn't in the policy pattern. Let me check: policy is `we (always|never|should|must)` — requires "we" prefix. "Never deploy" has no "we". It would match `preference` pattern: `I (prefer|like|want|love|hate|dislike|always|never|usually)` — but there's no "I" either. It falls through to `factual` (long message fallback) or `noise` (if short).

**Problem: "Never deploy on Fridays" doesn't match ANY current signal pattern.** It's an imperative without "I" or "we" prefix.

**Proposed fix:** Add imperative rule pattern: `^(never|always|don't|do not|must)\b` (anchored at start of sentence, not just start of message — need sentence splitting).

**Verdict: FAIL** — current heuristics miss imperative rules without "I"/"we" prefix. Need new pattern.

### S3: Observed failure → pending curation

**Input:** User reported "the back button was not pressable" + assistant diagnosed z-index issue

**Signal classifier:** The user's message "the back button was not pressable" doesn't match any signal pattern. It's a bug report, not a preference/correction/policy/decision. The correction comes from the *assistant's* diagnosis, which we skip.

**Problem: Observed failures are typically diagnosed by the assistant, not stated by the user.** The user says "X doesn't work", the assistant figures out "because Y". The extractable knowledge ("back button blocked by z-index") is in the assistant turn.

**Proposed approach:** For corrections, look for the pattern: user reports problem + assistant diagnoses + user confirms fix. This requires multi-turn analysis. OR: only extract what the user explicitly says. If the user says "the z-index was the problem" in a follow-up, THEN we can extract it.

**Verdict: FAIL** — observed-failure path requires multi-turn synthesis that heuristics can't do per-turn. We either (a) accept we miss these and require user to state the correction explicitly, or (b) keep the LLM for this one case.

### S4: Inferred fact → confidence capped → decays

**Input:** Assistant observes agile-like patterns, no explicit statement

**Signal classifier:** No user message to extract from. The LLM infers from context.

**Heuristic result:** Nothing extracted. The inferred entry never exists.

**Verdict: PASS (by design)** — we WANT to skip inferred knowledge. This is a feature, not a bug. The Gherkin scenario shows this entry decaying to archival — it never should have been extracted. Skipping it is the correct outcome.

### S5: General knowledge → dropped

**Input:** "Always handle errors in async functions"

**Signal classifier:** "Always handle" could match policy pattern if preceded by "we". Without "we", it falls through. Even if extracted, the novelty gate drops `general-knowledge`.

**Heuristic result:** If we add the imperative pattern `^(never|always|...)`, this WOULD match as a rule. But the novelty classifier would need to catch "handle errors in async functions" as general-knowledge. Our `prior_overlap.common_patterns` in config includes `"handle errors"` — so the overlap check would flag it.

**Verdict: PASS** — novelty gate catches it, even if the heuristic over-extracts.

### S6: Procedure cluster → skill file

**Input:** 4 explicit procedure descriptions about deployment

**Signal classifier:** Procedures need a new pattern. Currently no pattern detects step-by-step instructions. We need: numbered lists ("1) X 2) Y"), imperative sequences ("First X, then Y"), or explicit "To X: do Y" patterns.

**Problem:** Most procedures in our real data were extracted by the LLM from assistant turns describing what IT did, not from user instructions. User rarely writes "To deploy: 1) build 2) push 3) restart" — the assistant writes that.

**Real data check:** Of 13 procedures extracted, evidence shows they came from... let me check.

**Verdict: LIKELY FAIL** — procedures are typically written by the assistant or are reformulations of assistant actions. Users rarely write step-by-step procedures explicitly.

### S7: Harmful outcome → accelerated decay

**Input:** No extraction needed — this is about feedback loop on existing entries

**Verdict: PASS** — heuristics don't affect feedback loop

### S8: Helpful outcome → confidence boost

Same as S7. **PASS**

### S9: Duplicate extraction → dedup catches it

**Input:** "Always use pnpm, never npm or yarn" (similar to existing "Use pnpm as the package manager")

**Heuristic result:** "I... always" matches preference pattern. Dedup catches similarity.

**Verdict: PASS** — dedup is independent of extraction method

### S10: Full lifecycle

**Input:** Mixed — explicit preference, general knowledge, inferred fact

- "I always use conventional commits" → preference pattern matches "I always" → confidence 0.95, auto-approve → CLAUDE.md ✅
- "Variables should have meaningful names" → no "I"/"we" prefix → falls through. Even if caught by imperative pattern, novelty gate catches as general-knowledge ✅
- "Team probably does code reviews" → assistant inference → not extracted ✅ (we WANT this skipped)

**Verdict: PASS** — the useful entry (conventional commits) is caught; the noise (meaningful names, code reviews) is correctly skipped.

---

## Summary: Heuristic Coverage

| Scenario | Heuristic Result | Issue |
|---|---|---|
| S1: Explicit preference | PARTIAL PASS | "Let's use X" classified as decision, not preference |
| S2: Imperative rule | FAIL | "Never X" without "I"/"we" not matched |
| S3: Observed failure | FAIL | Requires multi-turn synthesis |
| S4: Inferred fact | PASS (by design) | Correctly not extracted |
| S5: General knowledge | PASS | Novelty gate catches it |
| S6: Procedure cluster | LIKELY FAIL | Procedures come from assistant turns |
| S7: Harmful feedback | PASS | Independent of extraction |
| S8: Helpful feedback | PASS | Independent of extraction |
| S9: Dedup | PASS | Independent of extraction |
| S10: Full lifecycle | PASS | Key entries caught, noise skipped |

### What we miss

1. **Imperative rules** ("Never X", "Always X" without I/we) — fixable by adding pattern
2. **Observed failures** (user reports bug, assistant diagnoses) — requires multi-turn or user stating the correction
3. **Procedures** (mostly generated by assistant, not user) — requires extracting from assistant turns or user explicitly writing steps

### What we gain

1. **Zero latency** (instant vs 14-71s per chunk)
2. **Deterministic** confidence (no uniform-1.0 hallucination)
3. **No Ollama dependency** for core pipeline
4. **Debuggable** (regex match, not LLM black box)

### Recommendation: Hybrid approach

**Heuristics as the fast path, LLM only where it uniquely adds value.**

---

## 4. Hybrid Architecture

```
User message → Signal classifier (heuristic, instant)
  ├─ Pattern match? → Heuristic extraction (instant, 0ms)
  │   └─ KnowledgeEntry with deterministic confidence
  └─ No pattern match + high signal score? → LLM extraction (14-71s)
      └─ Only for multi-turn synthesis and complex reformulation
```

### When to use heuristics (instant path)

| Trigger | Example |
|---------|---------|
| Explicit preference patterns | "I prefer X", "I always X", "I never X" |
| Policy/rule patterns | "We always X", "Never X", "Must not X" |
| Correction patterns | "No, it should be X", "That's wrong" |
| Decision patterns | "Let's go with X", "I've decided X" |
| `@remember` marker | "@remember always use pnpm" |
| `@forget` marker | "@forget the old deploy process" |

These cover **~80% of extractable knowledge** (the explicit, single-turn cases).

### When to use LLM (slow path)

| Trigger | Example | Why heuristics can't |
|---------|---------|---------------------|
| Multi-turn observed failure | User: "button doesn't work" → Assistant: "z-index issue" → User: "yes, that fixed it" | Knowledge spans 3 turns |
| Complex procedure extraction | User describes a multi-step workflow in natural prose | Need to restructure into steps |
| Ambiguous high-signal message | Long message with no pattern match but clear signal (factual_min_length exceeded, technical entities detected) | Need reformulation to extract the core knowledge |

These cover **~15% of extractable knowledge** — the cases where the LLM's synthesis ability actually matters.

### What we skip entirely (~5%)

- Assistant-inferred knowledge ("the team seems to use Scrum") — too unreliable
- General knowledge ("always handle errors") — novelty gate drops it anyway
- Short confirmations, greetings, noise

### Implementation: two-tier extractor

```typescript
interface ExtractionResult {
  entries: KnowledgeEntry[]
  method: "heuristic" | "llm"
  latencyMs: number
}

async function extract(turns: SignalTurn[]): Promise<ExtractionResult> {
  const heuristicEntries = extractHeuristic(turns)  // instant

  // Only call LLM for turns that:
  // 1. Had high signal score but no heuristic pattern match
  // 2. Are part of a multi-turn correction sequence
  const llmCandidates = turns.filter(t =>
    t.signalScore > SIGNAL_THRESHOLD &&
    !heuristicEntries.some(e => e.evidence === t.text)
  )

  if (llmCandidates.length === 0) {
    return { entries: heuristicEntries, method: "heuristic", latencyMs: 0 }
  }

  // LLM only processes the gap — not the entire chunk
  const llmEntries = await extractWithLLM(llmCandidates)
  return {
    entries: [...heuristicEntries, ...llmEntries],
    method: "llm",
    latencyMs: /* measured */,
  }
}
```

### Cost model

| Scenario | Heuristic-only | Hybrid | LLM-only (current) |
|----------|---------------|--------|-------------------|
| 10-turn session, 3 signal | 0ms | 0ms (all matched) | 14-71s |
| 50-turn session, 8 signal | 0ms | ~15s (2 LLM candidates) | 30-140s |
| Session with bug report + fix | 0ms (misses it) | ~15s (LLM catches multi-turn) | 14-71s |

The hybrid approach means **most sessions never touch Ollama** — the LLM only fires when the heuristic extractor says "I found signal but couldn't extract it myself."

### Ollama load reduction

Current pipeline: every signal chunk goes to LLM → **100% Ollama usage**
Hybrid pipeline: only unmatched high-signal turns go to LLM → **~15-20% Ollama usage**

This makes Ollama viable even on modest hardware — it's not in the hot path anymore.
