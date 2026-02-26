# Memory Conventions: How to Talk So Claude Remembers

## Why This Matters

Every conversation with Claude disappears when the session ends. The memory system captures durable knowledge — your preferences, project rules, architectural decisions — and writes them into CLAUDE.md so future sessions start smarter.

But the system can only capture what it can detect. **How you phrase things directly affects what gets remembered.** This guide shows you the patterns that work, the ones that don't, and how to review what was captured.

## The Three Capture Paths

Knowledge gets captured through three paths, from most to least reliable:

| Path | How it works | Recall | Cost |
|---|---|---|---|
| **@remember** | You explicitly tell the system | 100% | Free |
| **Pattern matching** | Automatic detection of rules, preferences, decisions | ~55% | Free |
| **LLM extraction** | AI reads your conversation for implicit knowledge | ~85% | ~$0.03/session |

Pattern matching runs on every session automatically. LLM extraction runs if your project has it enabled (check `config.yaml`). Both benefit from clear phrasing.

## @remember — Your Most Reliable Tool

When something matters, say it explicitly. `@remember` captures with 100% confidence and auto-approves immediately.

```
@remember we use port 15432 for PostgreSQL in development
@remember PaymentEntity metadata field needs a type with per-gateway breakdown
@remember don't use forwardRef in PaymentsModule — causes circular deps
@remember tags use a separate table with one-to-many link, duplicated in simple-array for full-text search
```

Use `@forget` when knowledge becomes outdated:
```
@forget we used to use npm
@forget the old deploy process with rsync
```

**When to use @remember:** After any design discussion where you made a decision. After debugging something tricky. After establishing a project convention. If you'd want Claude to know this next week, `@remember` it now.

## Patterns That Get Captured Automatically

### What Works Well (detected instantly, no LLM needed)

**Personal preferences — start with "I"**
```
"I prefer using pnpm"
"I always use TypeScript strict mode"
"I never use default exports"
"I like Biome over ESLint"
```

**Team conventions — start with "We"**
```
"We always run tests before pushing"
"We never push to main directly"
"We should use feature branches"
"Our convention is conventional commits"
```

**Project rules — imperative commands**
```
"Never deploy on Fridays"
"Always run the linter before commit"
"Must not use the any type"
"Don't skip database migrations"
```

Works mid-sentence too:
```
"Also, never deploy on Fridays"
"One more thing: always run linting"
```

**Decisions — explicit choice language**
```
"Let's go with PostgreSQL"
"Let's use Clerk for authentication"
"We'll use pnpm workspaces"
"I've decided to use OTEL for observability"
```

**Corrections — when Claude gets it wrong**
```
"No, that's wrong — use the v2 API"
"Incorrect, the port should be 15432"
"That's not right, we use Drizzle not Prisma"
```

**Constraints — limits and thresholds with numbers**
```
"Max 50 characters for badge text, enforced at DB layer"
"Complaint threshold is 3 complaints to auto-hide"
"Limit batch size to 100 items"
```

**Option selection — answering Claude's structured questions**

When Claude presents numbered options and you pick one, the system captures your choice by resolving it against Claude's list.

### What Gets Missed (needs LLM path or @remember)

These are real examples from our evaluation of 4 developers. Each was important knowledge that pattern matching could not detect:

**Decisions phrased as questions**
```
BAD:  "Is it possible to add a type for the metadata field?"
      (Phrased as a question — the system skips questions)

GOOD: "Let's add a type for the metadata field with per-gateway breakdown"
      (Explicit decision — detected)

BEST: "@remember PaymentEntity metadata needs a typed metadata field with per-gateway breakdown"
      (Guaranteed capture)
```

**Terse confirmations after design discussions**
```
BAD:  "FIFO, let's develop"
      (Too brief — no signal pattern in 19 characters)

GOOD: "Let's go with FIFO ordering for the queue processing"
      (Full sentence with decision trigger)
```

**Architecture facts stated in context**
```
BAD:  "here's our backend summary — it's a NestJS monorepo with GraphQL + REST"
      (Embedded in a file reference — no pattern trigger)

GOOD: "@remember NestJS monorepo with GraphQL + REST"
      (Explicit capture)
```

**Implicit lessons from debugging**
```
BAD:  [After 30 minutes debugging Telegram Stars]
      (The lesson "INVOICE_PAYLOAD_INVALID means malformed payload" is never stated)

GOOD: "No, the issue was the payload format. @remember Telegram Stars invoice creation
       fails with INVOICE_PAYLOAD_INVALID if payload is malformed"
      (States the lesson explicitly)
```

**Rules in context of specific tasks**
```
BAD:  "I don't think it should be in the header, because the header can be reused"
      (Valid rule, but phrased as opinion about specific UI element)

GOOD: "We should never put bulk processing buttons in list headers — headers should be reusable"
      (General rule with "never" trigger)
```

## How Knowledge Flows to CLAUDE.md

```
You speak  →  Extraction  →  Knowledge Store  →  Audit UI  →  Export  →  CLAUDE.md
                                                  (review)     (preview)
```

1. **Extraction** — patterns and/or LLM extract entries from your conversation
2. **Knowledge Store** — entries accumulate with confidence scores and evidence
3. **Audit UI** (`/agent/audit`) — you review pending entries, approve or reject
4. **Export** (`/agent/export`) — preview what CLAUDE.md will look like, then write it

### What goes where

| Knowledge type | Destination | Example |
|---|---|---|
| Rules, preferences, facts | **CLAUDE.md** | "Never deploy on Fridays" |
| Reusable procedures | **Skills** (`.claude/skills/`) | Deploy checklist steps |
| Safety constraints | **Hooks** (`.claude/learned-hooks.json`) | "Must not force-push to main" |

The channel router decides automatically based on type and content, but you can override the target during audit.

### Approval gates

| Source | Confidence | Auto-approved? |
|---|---|---|
| `@remember` | 1.00 | Yes |
| Explicit pattern (preference, rule, decision) | 0.90-0.95 | Yes |
| Procedure | 0.85 | No — needs your approval |
| LLM-inferred | 0.70 | No — needs your approval |

Auto-approved entries are available to Claude immediately. Pending entries wait for your review in the audit UI before appearing in exported CLAUDE.md.

## What Gets Filtered Out

The system automatically drops:

- **General programming knowledge**: "Always handle errors", "Write tests" — things any developer already knows. These add noise without value.
- **Session-specific instructions**: "Read this file", "Create that component", "Commit and push" — one-time task steps, not durable knowledge.
- **Code content**: File contents, IDE selections, tool output — only your words matter, not the code you're looking at.
- **Noise**: "ok", "thanks", "got it", greetings, confirmations.
- **Very short messages**: Under 20 characters without a signal pattern.

## Tips for Best Results

1. **State decisions after discussions, not during.** When a brainstorming session reaches a conclusion, summarize: "OK so the decision is: use Gateway Strategy Pattern for payment extensibility."

2. **Use @remember for anything non-obvious.** Project facts, architecture details, integration quirks — these don't match any pattern. `@remember` is the only reliable way.

3. **Correct explicitly.** Don't just say "no" — say what's wrong and what's right: "No, that's wrong — use null for nullable fields, not undefined."

4. **Answer Claude's questions in full sentences.** When Claude asks "Should we use A or B?", don't say "A". Say "Let's go with A because it handles edge cases better." The system captures the full answer.

5. **Review the audit UI periodically.** Open `/agent/audit`, scan pending entries, approve the good ones, reject the noise. Then export to update your CLAUDE.md.

6. **Don't worry about repeating yourself.** The system deduplicates across sessions. If you say "never deploy on Fridays" in 10 different sessions, it stores one entry.

## Communication Style Matters

Our evaluation across 4 developers showed that communication style dramatically affects capture rates:

| Style | Heuristic recall | Example |
|---|---|---|
| Explicit declarative | ~60% | "We always use feature branches" |
| Terse/implicit | ~15% | "FIFO, let's develop" |

If you tend toward brief messages, lean on `@remember` more. If you naturally speak in full declarative sentences, the automatic capture works well for you.
