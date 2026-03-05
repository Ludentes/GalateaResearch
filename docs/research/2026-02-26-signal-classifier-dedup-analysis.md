# Signal Classifier & Dedup Upgrade Analysis

**Date:** 2026-02-26
**Based on:** QP (244 sessions, 18 golden) and Umka (38 sessions, 13 golden) evaluation results
**Decision:** Heuristics-only for artifacts (A+C strategy) — invest in classifier and dedup, not bigger models

---

## Context

We evaluated three extraction strategies:

| Strategy | QP Recall | Umka Recall | Cost |
|---|---|---|---|
| Heuristics only | 10/18 (55.6%) | 6/13 (46.2%) | $0 |
| Cloud (Haiku) | 16/18 (88.9%) | 8/13 (61.5%) | ~$0.01/session |

The recall gap between heuristics and cloud is primarily in **facts and inferred knowledge** — entries that don't become artifacts anyway (target: `none` or knowledge store only). For artifact-relevant entries (preferences, rules, decisions, corrections, procedures), heuristics catch most of what matters.

The decision: **heuristics-only for the artifact path**. Improve recall by fixing classifier bugs and tightening dedup, not by upgrading the LLM.

---

## Signal Classifier Analysis

### Current Architecture

```
signal-classifier.ts:
  User turn → noise check (greeting/confirmation)
            → signal pattern check (first-match-wins):
                remember → forget → preference → correction → policy →
                imperative_rule → decision → procedure
            → factual fallback (length > 50 chars)
            → noise (default)
```

Heuristic extractor handles: preference, correction, policy, imperative_rule, decision, procedure, remember, forget.
Factual turns go to cloud LLM (when enabled) or are dropped (heuristics-only mode).

### Bug 1: `isLikelyQuestion` Rejects Entire Messages (HIGH IMPACT)

**Location:** `signal-classifier.ts:73`

```typescript
// Current: checks if ENTIRE text ends with ?
if (isLikelyQuestion(text) && type !== "remember" && type !== "forget") {
  continue
}
```

**Problem:** When a message contains a declarative statement followed by a question, the entire message is rejected because the last character is `?`.

**Real miss — Umka item 9:**
```
For forseeable future the kiosks are WIndows based, but we should support
Linux as well. Do we need explicit modelling like availableCommands or do
we just hard code this in our software?
```
- "we should support Linux" matches the `policy` pattern
- But message ends with `?` → `isLikelyQuestion` returns true → pattern skipped
- The policy statement is in a declarative sentence; the question is a separate sentence at the end

**Fix:** Check whether the *sentence containing the match* ends with `?`, not the full text:

```typescript
// Proposed: scope question check to the matched sentence
if (type !== "remember" && type !== "forget") {
  const matchEnd = (m.index ?? 0) + m[0].length
  const sentenceEnd = text.indexOf('.', matchEnd) !== -1
    ? text.indexOf('.', matchEnd)
    : text.indexOf('?', matchEnd) !== -1
    ? text.indexOf('?', matchEnd)
    : text.length
  const matchedSentence = text.slice(m.index ?? 0, sentenceEnd + 1)
  if (/\?\s*$/.test(matchedSentence.trim())) {
    continue
  }
}
```

**Estimated impact:** Recovers any declarative rule/preference/decision embedded in messages that end with questions. Common pattern — users often state a fact then ask a follow-up.

---

### Bug 2: Numbered Lists Classified as Single Procedure (MEDIUM IMPACT)

**Location:** `signal-classifier.ts:44` (procedure pattern) + `heuristic-extractor.ts:371` (extractProcedureSteps)

**Problem:** When a user answers multiple questions with `1) ... 2) ... 3) ...`, the procedure pattern fires first and merges everything into one blob. Individual decisions/rules within items are lost.

**Real miss — QP item 2:**
```
1) let's have both - Patreon and Nebula
2) we no need streams, text content is required, donations later
3) ignore all focuments from 00 i didn't mention, they can be outdated
```
- Item 1 is a decision ("let's have both" → decision pattern)
- Item 3 is a rule ("ignore... outdated" → could match imperative_rule)
- Both lost because procedure pattern fires first (first-match-wins at turn level)
- The entire turn becomes one "procedure" entry with all 3 items merged

**Fix:** When procedure pattern matches, split items and re-classify each independently:

```typescript
// In extractHeuristic, when classification.type === "procedure":
const items = splitNumberedItems(text)
if (items.length >= 2) {
  // Re-classify each item independently
  const subEntries: KnowledgeEntry[] = []
  for (const item of items) {
    const subTurn: TranscriptTurn = { role: "user", content: item.content }
    const subClass = classifyTurn(subTurn)
    if (subClass.type !== "noise" && subClass.type !== "factual") {
      const result = extractHeuristic(subTurn, subClass, source, precedingTurn)
      subEntries.push(...result.entries)
    }
  }
  if (subEntries.length > 0) {
    return { entries: subEntries, handled: true }
  }
  // Fall through to normal procedure extraction if no sub-items matched
}
```

**Edge case:** This should NOT split genuine multi-step procedures (like deployment steps). The heuristic: if individual items match signal patterns (decision, rule, preference), treat them as separate items. If none match, keep as a procedure.

**Estimated impact:** Recovers 1-3 items per dataset from numbered response turns.

---

### Gap 3: Short Structured Answers Not Recognized (LOW IMPACT)

**Problem:** When the user answers an assistant's structured question with a specific constraint value, no pattern matches.

**Real miss — QP item 1:**
```
A) 50 characters max
limit in DB layer, no need extra check in code
```
- No decision/rule/preference pattern matches
- Text is 63 chars → classified as "factual"
- Heuristics don't handle factual turns

**Fix option A:** Add a pattern for constraint specifications:
```typescript
constraint: /\b(max|min|limit|constraint|cap|threshold)\b.*\d+/i
```
Map to type: `decision` (the user is making a design choice about limits).

**Fix option B:** Use the existing context-free decision resolution approach. The user is selecting option "A)" from the assistant's list. The `resolveContextFreeDecision` logic already handles this for explicit "let's go with" decisions — extend it to lettered-option selections.

Pattern: `/^\s*[a-z]\)\s*.+/im` → detect lettered-option answers → resolve against preceding assistant turn.

**Estimated impact:** 1 item in QP. Edge case.

---

### Gap 4: Document-Level Facts Unreachable (OUT OF SCOPE)

**Problem:** Facts like "ALROSA museum, ~15-18 kiosks" exist only in shared documents (tool_result contents) or assistant analysis, never in user turns. The classifier only processes `role: "user"`.

**Real miss — Umka item 7:**
- User shares a CSV file via tool_result
- Assistant analyzes it: "Масштаб музея: ~18 экспонатов в 5 залах"
- User never says "ALROSA" or "15-18 kiosks" in their own words

**Not fixable with signal classifier.** Would require:
1. Processing tool_result contents as a secondary signal source
2. Or recognizing implicit user confirmation (user doesn't correct assistant's analysis)

Low priority since these are facts (artifact target: `none` or knowledge store only).

---

### Gap 5: Enumeration/Taxonomy in Prose (OUT OF SCOPE FOR HEURISTICS)

**Problem:** User describes types informally ("a video player is the first main type. Second main type if signage...") but the specific enum names (video_player, video_player_touch, projector, game_kiosk) are the assistant's formalization.

**Real miss — Umka item 8:**
The user's prose could be caught by a pattern like `/\b(first.*type|second.*type|types?\s*(?:are|include|:))/i`, but the canonical names come from a later assistant turn. This requires cross-turn tracking.

**Not fixable with single-turn heuristics.** The user describes concepts; the assistant formalizes them. Extracting the formalized version requires processing assistant turns or maintaining conversation context.

---

## Dedup Analysis

### Current Architecture

```
knowledge-store.ts:
  isDuplicate():
    Path 1: content Jaccard > 0.5
    Path 2: evidence Jaccard > 0.5 AND content Jaccard > 0.2
    Path 3: embedding cosine > 0.85

  deduplicateEntries():
    For each candidate, check against existing + already-accepted
    Three-path check, first match = duplicate
```

Embeddings via Ollama `nomic-embed-text:latest`, batch API.

### Problem 1: Cosine Threshold Too Loose (0.85)

**Evidence from QP cloud analysis (213 entries):**

| Cluster | Entries | Ideal | Over-extracted |
|---|---|---|---|
| Deployment/infra | 24 | ~3 | ~21 |
| Maintenance page | 19 | ~3 | ~16 |
| FFmpeg transcoder | 15 | ~10 | ~5 |
| PostCard/routing | 14 | ~3 | ~11 |

**Root cause:** Slightly different wordings of the same knowledge bypass both Jaccard (0.5) and cosine (0.85):
- "Maintenance page uses three-block layout: icon (80×80px), title..."
- "Maintenance page requires three blocks: icon (80x80px SVG), title..."
- "Maintenance page for Антонов.Медиа platform uses three-block layout..."

These are semantically identical but have enough unique tokens/embedding variation to stay below 0.85.

**Fix:** Tighten embedding cosine threshold from 0.85 to 0.90 or 0.92.

**Validation:** Test on the maintenance page cluster — should collapse 19 → 3-5 entries. If it over-deduplicates (merging genuinely different entries), back off to 0.88.

**Config change:** `server/engine/config.yaml` → `embedding_cosine_threshold: 0.90`

**Risk:** Low. The three-path dedup means Jaccard still catches exact/near-exact duplicates. Cosine is the "semantic similarity" path — tightening it means we require higher semantic similarity before calling it a duplicate. False positives (merging different entries) would require very similar content, which is the definition of a duplicate.

---

### Problem 2: No Cross-Session Topic Clustering (DEFERRED)

**Problem:** Dedup compares each new entry against existing entries one-by-one. When 5 entries about the same topic exist, a 6th entry might be dissimilar enough to each individual one to pass, while being clearly redundant to the cluster.

**Example:** 5 entries about "maintenance page layout" each describe a slightly different aspect:
1. "Three-block layout" (Jaccard: 0.45 with entry 4 — just below threshold)
2. "Icon styling 80x80px" (Jaccard: 0.3 with entry 1 — passes)
3. "Typography 32px desktop" (Jaccard: 0.2 with all — passes)
4. "Three blocks with icon, title, description" (Jaccard: 0.45 with entry 1)
5. "Auto-reload on maintenance page" (genuinely different — should pass)

No individual pair exceeds the threshold, but the cluster is clearly redundant.

**Fix:** After all sessions processed, run a post-hoc clustering pass:
1. Group all entries by embedding similarity (e.g., DBSCAN or agglomerative clustering with cosine distance)
2. For each cluster with >3 entries, keep the most confident/detailed and archive the rest
3. Present clusters to the dev in the audit UI for review

**Deferred:** This is a larger architectural addition (new pipeline stage). The cosine threshold tightening (Problem 1) addresses the most egregious cases. Topic clustering can be added when we build the audit UI.

---

## Summary: Priority-Ordered Fixes

| # | Fix | Impact | Effort | Priority |
|---|---|---|---|---|
| 1 | Bug: Sentence-scoped `isLikelyQuestion` | High — recovers declarative statements in mixed messages | Small — change one condition in classifier | **Do first** |
| 2 | Config: Tighten cosine threshold 0.85 → 0.90 | Medium — reduces semantic redundancy ~30% | Tiny — one config value | **Do with #1** |
| 3 | Bug: Split numbered lists for per-item classification | Medium — recovers multi-item answers | Medium — new logic in extractor | **Do second** |
| 4 | Gap: Constraint answer pattern | Low — catches edge cases | Small — add one regex + mapping | **Do with #3** |
| 5 | Enhancement: Topic clustering in dedup | Medium — addresses remaining redundancy | Large — new pipeline stage | **Later (with audit UI)** |
| 6 | Gap: Document-level extraction | Low for artifacts | Large — architecture change | **Out of scope** |
| 7 | Gap: Cross-turn formalization tracking | Low for artifacts | Large — conversation context | **Out of scope** |

**Expected improvement from fixes 1-4:**
- Heuristic recall: +2-4 items per dataset (estimated)
- Dedup noise: -30% redundant entries
- Cost: $0 (all heuristic/config changes)
- Latency: negligible

---

## Appendix: Missed Golden Items Transcript Analysis

### QP Item 1: "50 char max, limit in DB layer"

**Source:** `claude-qp.25-02/.../76685702-...jsonl`, line 20
```
A) 50 characters max
limit in DB layer, no need extra check in code
```
**Classifier result:** factual (63 chars > 50)
**Root cause:** No decision/rule pattern matches. Answering structured question.
**Applicable fix:** #4 (constraint pattern) or extend context-free decision resolution

### QP Item 2: "Old docs in 00-initial-docs may be outdated"

**Source:** `claude-qp.25-02/.../885f0614-...jsonl`, line 26
```
1) let's have both - Patreon and Nebula
2) we no need streams, text content is required, donations later
3) ignore all focuments from 00 i didn't mention, they can be outdated
```
**Classifier result:** procedure (numbered list pattern)
**Root cause:** Procedure pattern fires first, merges all items
**Applicable fix:** #3 (split numbered lists)

### Umka Item 6: "Do not rush with estimates"

**Source:** `.../-home-newub-w-Umka/64d737f3-...jsonl`, line 8278
```
Do not rush with estimates. Let's me set estimates. Let's go item by item.
```
**Classifier result:** Should match imperative_rule ("Do not" at start)
**Status:** Likely caught by heuristics. If missed in eval, may be a sentence extraction boundary issue or eval matching strictness. Needs verification.

### Umka Item 7: "First client is ALROSA museum, ~15-18 kiosks"

**Source:** tool_result reading `museum1.csv` + assistant analysis
**Classifier result:** N/A — never in a user turn
**Root cause:** Fact exists only in shared documents and assistant analysis
**Applicable fix:** #6 (out of scope)

### Umka Item 8: "Four kiosk types: video_player, video_player_touch, projector, game_kiosk"

**Source:** `64d737f3-...jsonl`, line 187 (867-char user turn describing types in prose)
**Classifier result:** factual (length-based)
**Root cause:** User describes types informally; specific enum names are assistant's formalization
**Applicable fix:** #7 (out of scope)

### Umka Item 9: "Kiosks are Windows-based, must support Linux"

**Source:** `64d737f3-...jsonl`, line 1121
```
For forseeable future the kiosks are WIndows based, but we should support
Linux as well. Do we need explicit modelling like availableCommands or do
we just hard code this in our software?
```
**Classifier result:** Skipped — "we should" matches policy, but `isLikelyQuestion` rejects entire message
**Root cause:** Bug 1 — `isLikelyQuestion` checks full text, not matched sentence
**Applicable fix:** #1 (sentence-scoped question check)
