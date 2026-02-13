# Phase B: Shadow Learning Pipeline — Verification Guide

> **Purpose:** Validate not just that the code works, but that the *ideas* are correct. Each step tests a specific hypothesis about how shadow learning should behave with real data.

## Prerequisites

| Requirement | Check command | Needed for |
|---|---|---|
| Node.js 22+ | `node --version` | All steps |
| pnpm | `pnpm --version` | All steps |
| Ollama running | `curl http://localhost:11434/api/tags` | Steps 4-9 |
| glm-4.7-flash model | `ollama list \| grep glm-4.7-flash` | Steps 4-9 |
| PostgreSQL on :15432 | `pg_isready -p 15432` | Step 8 only |
| Real session transcripts | `ls ~/.claude/projects/-home-newub-w-galatea/*.jsonl` | Steps 4-9 |

**If Ollama isn't running:**
```bash
ollama serve &
ollama pull glm-4.7-flash:latest
```

---

## Step 1: Automated Tests (Sanity Check)

**What we're testing:** All pipeline modules work in isolation with controlled inputs.

```bash
pnpm vitest run server/memory/
```

**Expected:** 7 test files, 42 tests, all green.

| Test file | Tests | What it validates |
|---|---|---|
| `knowledge-store.test.ts` | 7 | JSONL read/write, Jaccard dedup (>0.6 = duplicate), markdown render |
| `transcript-reader.test.ts` | 8 | JSONL parsing, streaming dedup, tool_use extraction, meta/system filtering |
| `signal-classifier.test.ts` | 12 | Regex patterns for all signal types + noise detection |
| `knowledge-extractor.test.ts` | 4 | LLM extraction with mocked generateObject |
| `extraction-pipeline.test.ts` | 4 | Full pipeline orchestration, dedup across runs |
| `context-assembler.test.ts` | 3 | System prompt assembly from DB + file store |
| `extraction-quality.test.ts` | 4 | End-to-end fixture validation (reader fidelity + classifier accuracy) |

Also run:
```bash
pnpm exec tsc --noEmit
pnpm biome check .
```

**Expected:** Zero errors. If this step fails, stop — the code has a defect.

---

## Step 2: Transcript Reader — Does It Parse Real Sessions?

**Hypothesis:** The transcript reader can handle real Claude Code JSONL sessions (which are much messier than the test fixture — streaming duplicates, huge tool outputs, nested content blocks).

**Pick a small session first** (< 1MB) to keep output manageable:
```bash
ls -lhS ~/.claude/projects/-home-newub-w-galatea/*.jsonl | tail -5
```

Then run in Node REPL:
```bash
pnpm tsx -e "
import { readTranscript } from './server/memory/transcript-reader'
const turns = await readTranscript('$SESSION_PATH')
console.log('Total turns:', turns.length)
console.log('User turns:', turns.filter(t => t.role === 'user').length)
console.log('Assistant turns:', turns.filter(t => t.role === 'assistant').length)
console.log('With tool_use:', turns.filter(t => t.toolUse?.length).length)
console.log()
console.log('--- First 3 user messages ---')
turns.filter(t => t.role === 'user').slice(0, 3).forEach(t =>
  console.log('  >', t.content.slice(0, 120))
)
console.log()
console.log('--- Last 3 user messages ---')
turns.filter(t => t.role === 'user').slice(-3).forEach(t =>
  console.log('  >', t.content.slice(0, 120))
)
"
```

**What to look for:**

| Check | Good sign | Bad sign |
|---|---|---|
| Turn count | Roughly matches the session length you'd expect | 0 turns, or thousands from a small file |
| User messages | Readable, contain your actual words | Empty strings, `[object Object]`, raw JSON |
| No system/meta leaks | Only user + assistant turns shown | System prompts, progress messages, isMeta entries |
| Streaming dedup | Assistant count < raw assistant entries in JSONL | Same assistant message repeated many times |
| Tool use parsed | `With tool_use` count > 0 for coding sessions | 0 for a session where you clearly used tools |

**Then try the large session** (the current one, ~111MB):
```bash
SESSION_LARGE=~/.claude/projects/-home-newub-w-galatea/fbe39a05-8bf5-4c36-8c77-7dfe87675418.jsonl
pnpm tsx -e "
import { readTranscript } from './server/memory/transcript-reader'
const t0 = Date.now()
const turns = await readTranscript('$SESSION_LARGE')
console.log('Parsed', turns.length, 'turns in', Date.now() - t0, 'ms')
console.log('User:', turns.filter(t => t.role === 'user').length)
console.log('Assistant:', turns.filter(t => t.role === 'assistant').length)
"
```

**What to look for:** Should complete in < 5 seconds even for 111MB. If it hangs or OOMs, the parser has a problem with large files.

---

## Step 3: Signal Classifier — Does It Separate Signal from Noise?

**Hypothesis:** The regex pre-filter correctly identifies which user messages contain learnable information and which are just chit-chat or confirmations.

```bash
pnpm tsx -e "
import { readTranscript } from './server/memory/transcript-reader'
import { classifyTurn, filterSignalTurns } from './server/memory/signal-classifier'

const turns = await readTranscript('$SESSION_PATH')
const userTurns = turns.filter(t => t.role === 'user')

// Classify every user turn
const classified = userTurns.map(t => ({
  type: classifyTurn(t).type,
  conf: classifyTurn(t).confidence,
  text: t.content.slice(0, 80)
}))

// Summary
const byType = {}
classified.forEach(c => { byType[c.type] = (byType[c.type] || 0) + 1 })
console.log('Classification summary:', byType)
console.log()

// Show some of each type
for (const type of ['preference', 'correction', 'policy', 'decision', 'factual', 'noise']) {
  const examples = classified.filter(c => c.type === type).slice(0, 3)
  if (examples.length > 0) {
    console.log('--- ' + type.toUpperCase() + ' ---')
    examples.forEach(e => console.log('  [' + e.conf + ']', e.text))
    console.log()
  }
}

const signal = filterSignalTurns(turns)
console.log('Signal ratio:', signal.length + '/' + userTurns.length,
  '(' + Math.round(signal.length / userTurns.length * 100) + '%)')
"
```

**What to look for:**

| Check | Good sign | Bad sign |
|---|---|---|
| Noise items | Short confirmations ("ok", "thanks", "yes") and greetings ("hi") | Your actual instructions classified as noise |
| Preference items | "I prefer...", "I like...", "I want..." statements | Generic statements without preference keywords |
| Correction items | "No, that's wrong...", "Not what I meant..." | No corrections found (review: did you actually correct anything?) |
| Signal ratio | 30-70% of user turns are signal (from experiment: ~60%) | <10% (too aggressive filtering) or >90% (not filtering enough) |
| Factual fallback | Long messages (>50 chars) without clear patterns → "factual" | Short noise messages classified as "factual" |

**Key scenario check (L2 — preference learning):** Find a message where you stated a preference (e.g., "I prefer pnpm"). It MUST be classified as "preference", not "noise" or "factual".

**Key scenario check (L3 — hard rule):** Find a message like "Never use X" or "We always do Y". It should be "policy", not "factual".

**Edge case:** A long message that starts with "Hi, " but contains actual instructions (e.g., "Hi, I prefer using shadcn for components"). Should be classified as "preference" (greeting threshold is 30 chars — the message is longer).

---

## Step 4: LLM Extraction — Does the Model Extract Useful Knowledge?

**Hypothesis:** Given signal turns from a real session, the LLM extracts structured knowledge that is accurate, actionable, and correctly typed.

**This is the most important step.** It tests whether the extraction prompt and schema actually work with your Ollama model.

```bash
pnpm tsx -e "
import { readTranscript } from './server/memory/transcript-reader'
import { filterSignalTurns } from './server/memory/signal-classifier'
import { extractKnowledge } from './server/memory/knowledge-extractor'
import { createOllamaModel } from './server/providers/ollama'

const model = createOllamaModel('glm-4.7-flash:latest', 'http://localhost:11434')
const turns = await readTranscript('$SESSION_PATH')
const signal = filterSignalTurns(turns)

console.log('Signal turns to process:', signal.length)
console.log('Sending first 10 signal turns to LLM...')
console.log()

const entries = await extractKnowledge(signal.slice(0, 10), model, 'test')

console.log('Extracted', entries.length, 'knowledge entries:')
console.log()
for (const e of entries) {
  console.log('[' + e.type + '] (conf: ' + e.confidence + ')')
  console.log('  Content:  ' + e.content)
  console.log('  Evidence: ' + (e.evidence || 'none'))
  console.log('  Entities: ' + e.entities.join(', '))
  console.log()
}
"
```

**What to look for — Quality Checklist:**

| # | Check | Good | Bad |
|---|---|---|---|
| 1 | **Types correct?** | "User prefers pnpm" → `preference` | Preferences tagged as `fact` |
| 2 | **Content actionable?** | "Use pnpm instead of npm for package management" | "The user talked about packages" |
| 3 | **Confidence calibrated?** | Explicit "I prefer X" → 0.9-1.0; inferred from context → 0.6-0.8 | Everything at 0.5 or everything at 1.0 |
| 4 | **Evidence provided?** | Direct quote from transcript | Empty or hallucinated text |
| 5 | **Entities extracted?** | ["pnpm", "npm"] for a package manager preference | Empty entities array for technology mentions |
| 6 | **No noise?** | Only actionable knowledge | "User said hello", "User confirmed the plan" |
| 7 | **Corrections handled?** | Extract the CORRECT answer, not the wrong one | "User said X was wrong" (we need what's right) |
| 8 | **Merging works?** | One entry for "uses TypeScript strict mode" | Separate entries for "uses TypeScript" and "strict mode enabled" |

**Benchmark from experiment:** For a 10-turn signal batch, expect 3-8 entries. If you get 0, the model may have failed to follow the schema. If you get 20+, it's extracting noise.

**If extraction returns 0 entries or errors:** Try with a different model:
```bash
# Fallback: try gemma3
pnpm tsx -e "
import { extractKnowledge } from './server/memory/knowledge-extractor'
import { createOllamaModel } from './server/providers/ollama'
const model = createOllamaModel('gemma3:12b', 'http://localhost:11434')
// ... same test
"
```

---

## Step 5: Full Pipeline — End-to-End Extraction

**Hypothesis:** The complete pipeline (read → classify → extract → dedup → store → render) produces a coherent knowledge base from a real session.

**Clean slate first:**
```bash
rm -f data/memory/entries.jsonl data/memory/knowledge.md
```

**Run extraction:**
```bash
pnpm tsx scripts/extract-knowledge.ts \
  -i ~/.claude/projects/-home-newub-w-galatea/8be0af56-d09e-4821-b47e-3b475a548c72.jsonl
```

(Use the 4.2MB session from the original experiment if available. Otherwise pick any medium session.)

**Expected output pattern:**
```
Extracting knowledge from: <path>
Using model: glm-4.7-flash:latest
Store: data/memory/entries.jsonl

Processed N turns (X signal, Y noise)
Extracted Z items, W duplicates skipped
Z new entries written

  [preference] ... (confidence: 0.9)
  [fact] ... (confidence: 0.85)
  ...
```

**Now examine the artifacts:**

### 5a. Check JSONL store
```bash
wc -l data/memory/entries.jsonl
head -3 data/memory/entries.jsonl | python3 -m json.tool
```

**What to look for:**
- Each line is valid JSON with all required fields (`id`, `type`, `content`, `confidence`, `entities`, `source`, `extractedAt`)
- `source` field matches `session:<filename>`
- `confidence` values are between 0 and 1
- `type` is one of: preference, fact, rule, procedure, correction, decision

### 5b. Check rendered markdown
```bash
cat data/memory/knowledge.md
```

**What to look for:**
- Header: `# Galatea Agent Memory`
- Sections organized by type (Preferences, Facts, Rules, etc.)
- Entries sorted by confidence within each section
- Content is readable and actionable — could you hand this to a new developer and they'd understand your preferences?

### 5c. Benchmark against experiment results

From the shadow learning experiment, the 4.2MB Galatea architecture session yielded:

| Metric | Experiment result | Your result |
|---|---|---|
| Signal turns | ~60 out of ~101 user messages | _____ |
| Entries extracted | ~37 | _____ |
| Facts | ~16 | _____ |
| Preferences | ~8 | _____ |
| Decisions | ~4 | _____ |
| Procedures | ~2 | _____ |
| Corrections | ~1 | _____ |
| Rules | ~1 | _____ |

Numbers don't need to match exactly (the experiment used a different model version), but they should be in the same ballpark. If you get 5 entries from a 100-message session, something is wrong. If you get 200, the model is hallucinating.

---

## Step 6: Deduplication — Does Re-Running Stay Idempotent?

**Hypothesis:** Running extraction on the same session twice should detect duplicates and not bloat the store.

```bash
# Note the current entry count
wc -l data/memory/entries.jsonl

# Run again on the same session
pnpm tsx scripts/extract-knowledge.ts \
  -i ~/.claude/projects/-home-newub-w-galatea/8be0af56-d09e-4821-b47e-3b475a548c72.jsonl

# Check entry count again
wc -l data/memory/entries.jsonl
```

**Expected:**
- `duplicatesSkipped` should be close to `entriesExtracted`
- `new entries written` should be 0 or very small (1-3 is acceptable — the LLM may phrase things slightly differently)
- The JSONL file should NOT have doubled in size

**Why this matters:** In production, extraction runs after each session. If dedup doesn't work, the knowledge store grows unboundedly and the same facts repeat in the system prompt.

**What to check if dedup seems weak (>5 new entries on re-run):**
```bash
# Compare last N entries to earlier ones — are they rephrased duplicates?
tail -5 data/memory/entries.jsonl | python3 -m json.tool
head -5 data/memory/entries.jsonl | python3 -m json.tool
```

The Jaccard threshold is 0.6 with entity overlap required. If the LLM rephrases significantly ("User prefers pnpm" vs "Package management should use pnpm"), Jaccard may drop below 0.6 and miss the duplicate. This is a known limitation — note any such cases for tuning.

---

## Step 7: Multi-Session Extraction — Knowledge Accumulation

**Hypothesis:** Extracting from multiple sessions builds a richer knowledge base, and cross-session duplicates are caught.

```bash
# Run extraction on a second, different session
pnpm tsx scripts/extract-knowledge.ts \
  -i ~/.claude/projects/-home-newub-w-galatea/<different-session>.jsonl
```

**What to look for:**

| Check | Good sign | Bad sign |
|---|---|---|
| New entries added | New facts/prefs from the different session context | Same generic entries as session 1 |
| Cross-session dedup | If you stated "I prefer pnpm" in both sessions, it's only stored once | "User prefers pnpm" appears twice |
| Source tracking | New entries have `source: "session:<session2-id>"` | All entries have same source |
| Knowledge.md grows | New sections or entries appear in the markdown | Markdown unchanged or overwritten |

**Now check the full knowledge base:**
```bash
cat data/memory/knowledge.md
```

**Scenario validation (L2 — preference learning):** If you've stated the same preference in two sessions (e.g., pnpm, shadcn, conventional commits), it should appear exactly ONCE in the knowledge base with high confidence.

**Scenario validation (L3 — hard rule):** If you've ever said "never use X" or "we always do Y", check:
- Is it typed as `rule` (not `preference` or `fact`)?
- Is confidence at or near 1.0?
- In knowledge.md, does it appear under a Rules section?

---

## Step 8: Context Assembly — Does Knowledge Reach the Agent?

**Hypothesis:** The assembled system prompt contains learned knowledge organized by priority, with rules always present and lower-priority sections truncated if needed.

**This step can be tested without Postgres** by examining the assembler directly:

```bash
pnpm tsx -e "
import { readEntries, renderMarkdown } from './server/memory/knowledge-store'

const entries = await readEntries('data/memory/entries.jsonl')
const active = entries.filter(e => !e.supersededBy)

console.log('Total entries:', entries.length)
console.log('Active entries:', active.length)
console.log()

// Simulate what context assembler does (without DB preprompts)
const rules = active.filter(e => e.type === 'rule')
const prefs = active.filter(e => e.type === 'preference')
const facts = active.filter(e => e.type === 'fact')
const procedures = active.filter(e => e.type === 'procedure')
const decisions = active.filter(e => e.type === 'decision')
const corrections = active.filter(e => e.type === 'correction')

console.log('By type:')
console.log('  Rules:', rules.length, '(non-truncatable)')
console.log('  Preferences:', prefs.length)
console.log('  Facts:', facts.length)
console.log('  Procedures:', procedures.length)
console.log('  Decisions:', decisions.length)
console.log('  Corrections:', corrections.length)
console.log()

// Show what would go into the system prompt
console.log('=== CONSTRAINTS (always included) ===')
rules.forEach(r => console.log('  -', r.content))
console.log()

console.log('=== LEARNED KNOWLEDGE (sorted by confidence, truncatable) ===')
const knowledge = [...prefs, ...facts, ...decisions, ...corrections]
  .sort((a, b) => b.confidence - a.confidence)
  .slice(0, 15)
knowledge.forEach(k =>
  console.log('  [' + k.type + ' ' + k.confidence + ']', k.content)
)
console.log()

// Token budget check
const allContent = active.map(e => e.content).join('\n')
const estimatedTokens = Math.ceil(allContent.length / 4)
console.log('Estimated tokens for all knowledge:', estimatedTokens, '/ 4000 budget')
if (estimatedTokens > 4000) {
  console.log('WARNING: Knowledge exceeds token budget — truncation will occur')
}
"
```

**What to look for:**

| Check | Good sign | Bad sign |
|---|---|---|
| Rules in constraints | Hard rules separated from other knowledge | Rules mixed with preferences |
| Confidence ordering | High-confidence items first | Random order |
| Token budget | Under 4000 tokens for typical extraction (2-3 sessions) | Exceeds budget after one session |
| Content quality | Reading the prompt, you'd say "yes, this captures my working style" | Generic platitudes or irrelevant details |

**Scenario validation (L2):** Your preference for pnpm should appear in LEARNED KNOWLEDGE.

**Scenario validation (L3):** Any "never do X" rule should appear in CONSTRAINTS, not LEARNED KNOWLEDGE.

### Full context assembly test (requires Postgres)

If Postgres is running:

```bash
pnpm tsx -e "
import { assembleContext } from './server/memory/context-assembler'

const ctx = await assembleContext()
console.log('System prompt length:', ctx.systemPrompt.length, 'chars')
console.log('Estimated tokens:', Math.ceil(ctx.systemPrompt.length / 4))
console.log('Preprompts loaded:', ctx.metadata.prepromptsLoaded)
console.log('Knowledge entries:', ctx.metadata.knowledgeEntries)
console.log('Rules count:', ctx.metadata.rulesCount)
console.log()
console.log('Sections:')
ctx.sections.forEach(s =>
  console.log('  [' + s.priority + '] ' + s.name +
    ' (' + s.content.length + ' chars, truncatable: ' + s.truncatable + ')')
)
console.log()
console.log('--- Full system prompt ---')
console.log(ctx.systemPrompt)
"
```

**What to look for:** The system prompt should read like a coherent briefing document for a developer agent, with clear sections for constraints, identity, and learned knowledge.

---

## Step 9: The "Would a New Agent Be Useful?" Test

**Hypothesis:** If we gave the assembled knowledge to a fresh LLM with no other context, it would make better decisions about your project than a blank LLM.

This is the ultimate validation. Pick 3-5 questions that your extracted knowledge SHOULD answer:

| # | Question to ask the agent | Expected from knowledge | Without knowledge |
|---|---|---|---|
| 1 | "What package manager should I use?" | "pnpm" (from preference) | "npm is the default" |
| 2 | "How should I format commit messages?" | "Conventional commits: feat:, fix:, docs:" (if extracted) | Generic answer |
| 3 | "What UI library does this project use?" | "shadcn/ui" (if extracted) | Would need to check package.json |
| 4 | "What LLM should I use for local dev?" | "glm-4.7-flash via Ollama" (if extracted) | Generic answer |
| 5 | "Should I use npm or yarn?" | "Neither — use pnpm" (from rule/preference) | "Either works" |

**Test with the knowledge:**
```bash
pnpm tsx -e "
import { readFileSync } from 'node:fs'
import { generateText } from 'ai'
import { createOllamaModel } from './server/providers/ollama'

const model = createOllamaModel('glm-4.7-flash:latest', 'http://localhost:11434')
const knowledge = readFileSync('data/memory/knowledge.md', 'utf-8')

const question = 'What package manager should I use for this project?'

const result = await generateText({
  model,
  system: knowledge,
  messages: [{ role: 'user', content: question }],
})

console.log('Q:', question)
console.log('A:', result.text)
"
```

**Run the same question WITHOUT knowledge** (remove the `system:` line) and compare. The knowledge-informed answer should be more specific and aligned with your preferences.

---

## Step 10: Scenario Coverage Matrix

After completing Steps 1-9, fill in this matrix to assess which learning scenarios from the design doc are covered:

| Scenario | Description | Phase B Coverage | Verified? |
|---|---|---|---|
| **L1** | Learn project setup procedure | Partial — single-session extraction finds procedures but 3+ occurrences needed for SKILL.md (Phase D) | |
| **L2** | Learn preference from conversation | **Full** — "I prefer X" → preference type, high confidence | |
| **L3** | Learn hard rule | **Full** — "Never use X" → rule type, placed in CONSTRAINTS | |
| **L4** | Learn from code review feedback | Partial — corrections extracted but cross-PR correlation needs Phase C hooks | |
| **L5** | Cross-source correlation | Not covered — needs OTEL + browser observation (Phase C) | |
| **L6** | Temporal validity | Not covered — needs memory lifecycle decay (Phase D) | |
| **L7** | Daily patterns (homeostasis) | Not covered — needs homeostasis dimensions (Phase C) | |
| **L8** | Episode → procedure consolidation | Not covered — needs 3+ occurrence counting (Phase D) | |
| **L9** | Memory tier upgrade | Not covered — needs tier detection logic (Phase D) | |

**Phase B should fully cover L2 and L3. Partially cover L1, L4. The rest are future phases.**

---

## Troubleshooting

### Extraction returns 0 entries
- Check Ollama is running: `curl http://localhost:11434/api/tags`
- Try a different model: `-m gemma3:12b` or `-m gpt-oss:latest`
- Check the signal classifier isn't too aggressive: run Step 3 and verify signal ratio > 20%

### Extraction is very slow (>5 min for a session)
- Large sessions have many signal turns → more LLM calls (20-turn chunks)
- Try `--model` with a faster model
- Check Ollama GPU utilization: `nvidia-smi` or `ollama ps`

### Dedup doesn't catch obvious duplicates
- The Jaccard threshold is 0.6 — if the LLM rephrases significantly, duplicates slip through
- Check entity overlap: dedup requires at least one shared entity
- Known limitation: tuning needed based on real-world experience

### knowledge.md is empty
- Check `data/memory/entries.jsonl` exists and has content
- The `renderMarkdown` function filters out superseded entries — verify none are superseded

### Context assembler fails with DB error
- It tries to load preprompts from Postgres — if no DB, it throws
- For testing without DB, use the direct knowledge store inspection in Step 8 (first code block)
