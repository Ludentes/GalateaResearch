# Scenario Runner: Automated Beta Simulation Testing

**Date:** 2026-03-12
**Goal:** Replace manual debug with automated acceptance testing. Run Gherkin-derived scenarios against the real tick loop, collect structured traces, produce a pass/fail report.

## Motivation

We have 76 Gherkin scenarios defining expected agent behavior. Instead of manually testing, we:
1. Convert scenarios to executable YAML format
2. Run them against the HTTP API (no Discord needed)
3. Assert TickDecisionRecords match expected outcomes
4. Print a morning report showing exactly what broke and where

## Architecture

```
scenarios/*.yaml → run-scenario.ts → POST /api/agent/tick → tick() → JSONL
                                    ↓                                  ↓
                              wait for tick                    read TickDecisionRecord
                                    ↓                                  ↓
                              assertion engine ← ─ ─ ─ ─ ─ ─ compare
                                    ↓
                              stdout report
```

### Injection Layer

HTTP (Option 2) — POST messages directly to agent API endpoints, bypassing Discord. Tests the tick loop and everything downstream. Fast, no external dependencies. Discord wiring tested separately once system stabilizes.

### Scenario File Format

```yaml
scenario: "PM assigns research task"
source_gherkin: "Trace 12"
agent: besa
setup:
  # Optional: seed agent state before running
  clear_ticks: true
  clear_state: true
steps:
  - send: "research auth options for the mobile app"
    from: { platform: discord, user: sasha }
    expect:
      routing.level: task
      routing.taskType: research
      outcome.action: delegate
      execution.adapter: "not: none"
  - send: "is MR !42 merged?"
    from: { platform: discord, user: sasha }
    expect:
      routing.level: interaction
      outcome.action: respond
      outcome.response: exists
```

### Assertion Engine

Matching rules (kept minimal — if you need richer logic, write a Vitest test):

| Pattern | Meaning | Example |
|---------|---------|---------|
| Exact value | Strict equality | `routing.level: task` |
| `"*.md"` | Glob match on strings | `outcome.artifactsCreated: ["*.md"]` |
| `"> N"` / `"< N"` / `">= N"` | Numeric comparison | `execution.durationMs: "< 30000"` |
| `exists` | Field is present and non-null | `outcome.response: exists` |
| `"not: value"` | Negation | `execution.adapter: "not: none"` |
| `{ contains: X }` | Array contains element matching X | `guidance: { contains: "stuck" }` |

### Step Verdict

```typescript
interface StepVerdict {
  step: number
  send: string
  pass: boolean
  checks: {
    field: string
    expected: string
    actual: string
    pass: boolean
  }[]
  tickId: string
}
```

### Report Format

```
=== Scenario Run: 2026-03-12 14:30 ===
Scenarios: 5 run, 3 passed, 2 failed

FAIL: Trace 12 — PM assigns research task (besa)
  Step 1: FAIL
    routing.taskType: expected "research", got "coding"
    outcome.artifactsCreated: expected ["*.md"], got []
  Step 2: PASS

PASS: Trace 13 — Sprint task creation (besa)
PASS: Trace 14 — Quick status check (besa)

FAIL: Trace 15 — Mid-task scope change (beki)
  Step 2: FAIL
    execution.sessionResumed: expected false, got true

PASS: Trace 16 — MR review (besa)
```

### Runner Flow

1. Parse scenario YAML
2. Optional setup: clear tick JSONL, reset agent state
3. For each step:
   a. POST message to `/api/agent/tick` (or inject into pending messages + trigger tick)
   b. Wait for tick to complete (poll tick JSONL for new entry with matching trigger)
   c. Read the new TickDecisionRecord
   d. Run assertion engine against `expect` block
   e. Record verdict
4. Print report

### Message Injection

The tick loop reads from `pendingMessages` in agent state. Two options:

**Option A:** POST to a new `/api/agent/inject` endpoint that adds a message to pending and triggers a tick. Cleanest but requires a new endpoint.

**Option B:** Write directly to agent state file (add pending message), then call tick via existing API or direct function call. More coupled but no new endpoint needed.

**Decision:** Option A — add a thin `/api/agent/inject` endpoint. It's 10 lines of code and gives us a clean HTTP surface for the scenario runner.

```typescript
// POST /api/agent/inject
// Body: { agentId, content, from, channel, messageType? }
// → adds to pending messages → triggers tick → returns TickDecisionRecord
```

This endpoint is the only new code. Everything else is a script.

## Fleet UI Verification

After all scenarios complete, verify the fleet dashboard renders correctly using browser automation (agent-browser skill / Playwright):

1. Navigate to `http://localhost:13000/agent/fleet`
2. Assert: both agent cards visible (Beki, Besa)
3. Assert: health indicators are not "unknown" (ticks were recorded)
4. Click agent card → agent detail page
5. Assert: tick timeline shows entries
6. Click a tick → assert: causal chain sections visible (Trigger, Homeostasis, Routing, Execution, Outcome)

This runs as a post-scenario step in the runner, using the same dev server. The assertions are visual structure checks (elements exist, text content matches), not pixel-level comparisons.

### Implementation

Add a `--verify-ui` flag to the runner script. When set, after all scenario steps complete, it launches a Playwright check against the fleet dashboard. This is optional — the core scenario runner works without it.

```typescript
// scripts/verify-fleet-ui.ts
// Uses Playwright to check fleet dashboard after scenario run
// Returns: { pass: boolean, checks: { page, selector, expected, actual, pass }[] }
```

## Phase B (Future): Generative Scenarios

Once scripted scenarios are green, add an LLM-as-PM mode:
- LLM plays Sasha, improvises requests within a bounded scope ("build a todo app")
- Gherkin scenarios define structural invariants (not exact messages)
- Invariant examples: "every task message → routing.level=task", "every completed task → knowledgeEntriesCreated > 0"
- Discovery mode: find failures that scripted scenarios don't cover

## Files

```
scripts/run-scenario.ts          — runner script
scripts/scenario-assert.ts       — assertion engine
scripts/scenario-types.ts        — TypeScript types
scenarios/trace-12-research.yaml — Trace 12 scenario
scenarios/trace-13-sprint.yaml   — Trace 13 scenario
scenarios/trace-14-status.yaml   — Trace 14 scenario
scenarios/trace-15-scope.yaml    — Trace 15 scenario
scenarios/trace-16-review.yaml   — Trace 16 scenario
server/routes/api/agent/inject.post.ts — injection endpoint
scripts/verify-fleet-ui.ts       — Playwright fleet dashboard checks
```

## Implementation Tasks

### Task 1: Injection Endpoint
Add `POST /api/agent/inject` that accepts `{ agentId, content, from, channel, messageType? }`, injects into agent state as a pending message, triggers tick, and returns the resulting TickDecisionRecord.

### Task 2: Assertion Engine
`scripts/scenario-assert.ts` — takes a TickDecisionRecord and an expect block, returns StepVerdict. Pure function, easily testable.

### Task 3: Runner Script
`scripts/run-scenario.ts` — parses YAML scenarios, calls injection endpoint per step, runs assertions, prints report. Supports `--scenario` for single file or glob for batch.

### Task 4: Scenario Files
Convert Traces 12-16 to YAML format. These are the initial scenarios derived from the validation guide Gherkin.

### Task 5: Smoke Test
Run the full suite once against the dev server, verify the runner works end-to-end even if assertions fail (the failures ARE the signal).

### Task 6: Fleet UI Verification
`scripts/verify-fleet-ui.ts` — Playwright script that navigates the fleet dashboard after scenarios, checks agent cards render, tick timeline populates, and causal chain detail expands. Invoked via `--verify-ui` flag on the runner.
