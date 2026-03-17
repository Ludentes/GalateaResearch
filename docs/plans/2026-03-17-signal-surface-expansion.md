# Signal Surface Expansion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand homeostasis assessors to detect silence on active work, cross-channel activity gaps, and reactive-vs-proactive engagement — enabling PM agents like Besa to feel pressure from stale projects without adding new dimensions or scheduled polls.

**Architecture:** All 7 dimensions stay unchanged. We expand `AgentContext` with new optional fields populated by the tick loop from operational memory and external signals. Each assessor gains additional rules that fire only when the new fields are present. When fields are absent (all existing scenarios), behavior is identical to today. Guidance text is updated to suggest skill-appropriate actions.

**Tech Stack:** TypeScript, Vitest 4, YAML (guidance.yaml, config.yaml, scenarios)

**Backward Compatibility:** All new `AgentContext` fields are optional with `?`. When absent, assessors fall back to existing logic. No existing scenario needs modification. New scenarios test new signal paths.

---

### Task 1: Extend AgentContext with activity signal fields

**Files:**
- Modify: `server/engine/types.ts:59-89`
- Test: `server/engine/__tests__/homeostasis-f4.test.ts` (verify makeContext still works)

**Step 1: Write the failing test**

Add a test to `homeostasis-f4.test.ts` that creates a context with the new fields and verifies `assessDimensions` still returns all 7 dimensions:

```typescript
// ---------------------------------------------------------------------------
// BDD Scenario 8: Activity Signals — baseline (new fields don't break old behavior)
// ---------------------------------------------------------------------------
describe("activity signals — backward compatibility", () => {
  it("returns same results when new activity fields are absent", () => {
    const ctx = makeContext()
    const state = assessDimensions(ctx)
    expect(state.progress_momentum).toBe("HEALTHY")
    expect(state.communication_health).toBe("HEALTHY")
    expect(state.productive_engagement).toBe("HEALTHY")
  })

  it("accepts new activity signal fields without error", () => {
    const ctx = makeContext({
      activeWorkItems: [
        {
          id: "issue-42",
          title: "Build pricing page",
          lastActivityAt: new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString(),
          assignedTo: "beki",
          delegatedAt: new Date(Date.now() - 5 * 24 * 60 * 60_000).toISOString(),
        },
      ],
      lastExternalCheckAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
      outboundFollowUps: 0,
      inboundActivityCount: 0,
    })
    const state = assessDimensions(ctx)
    expect(state.knowledge_sufficiency).toBeDefined()
    expect(state.self_preservation).toBeDefined()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/engine/__tests__/homeostasis-f4.test.ts --reporter=verbose`
Expected: TypeScript error — `activeWorkItems` doesn't exist on `AgentContext`

**Step 3: Add new fields to AgentContext**

In `server/engine/types.ts`, add after the escalation fields (line 88):

```typescript
  // Activity signals — for time-aware silence detection (Phase I)
  // All optional: when absent, assessors use existing logic only.

  /** Active work items the agent is responsible for or tracking.
   *  Populated by tick from operational memory + external queries. */
  activeWorkItems?: Array<{
    id: string                  // e.g., "gitlab:issue:42" or "task:abc"
    title: string
    lastActivityAt: string      // ISO timestamp — last commit, comment, MR update
    assignedTo?: string         // who is doing the work
    delegatedAt?: string        // ISO timestamp — when agent delegated this
  }>

  /** When agent last checked an external system (GitLab, etc.).
   *  Used by communication_health to detect "haven't checked in." */
  lastExternalCheckAt?: string  // ISO timestamp

  /** Count of outbound follow-ups in current work cycle.
   *  Used by productive_engagement to detect reactive-only behavior. */
  outboundFollowUps?: number

  /** Count of inbound activity signals (MR updates, comments, CI results)
   *  received since last assessment. Feeds communication_health. */
  inboundActivityCount?: number
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/engine/__tests__/homeostasis-f4.test.ts --reporter=verbose`
Expected: All tests PASS (including the new ones)

**Step 5: Run full homeostasis test suite to confirm no regressions**

Run: `pnpm vitest run server/engine/__tests__/ --reporter=verbose`
Expected: All existing tests PASS

**Step 6: Commit**

```bash
git add server/engine/types.ts server/engine/__tests__/homeostasis-f4.test.ts
git commit -m "feat: extend AgentContext with activity signal fields for Phase I"
```

---

### Task 2: Expand progress_momentum assessor — silence on active work

**Files:**
- Modify: `server/engine/homeostasis-engine.ts:207-236` (assessProgressMomentumL1)
- Modify: `server/engine/config.yaml` (add `stale_work_hours` threshold)
- Test: `server/engine/__tests__/homeostasis-f4.test.ts`

**Step 1: Write the failing tests**

```typescript
// ---------------------------------------------------------------------------
// BDD Scenario 9: Progress Momentum — stale work detection
// ---------------------------------------------------------------------------
describe("progress_momentum — stale work detection", () => {
  it("returns LOW when active work item has no activity for 48+ hours", () => {
    const ctx = makeContext({
      hasAssignedTask: true,
      activeWorkItems: [
        {
          id: "gitlab:issue:42",
          title: "Build pricing page",
          lastActivityAt: new Date(Date.now() - 72 * 60 * 60_000).toISOString(),
          assignedTo: "beki",
          delegatedAt: new Date(Date.now() - 96 * 60 * 60_000).toISOString(),
        },
      ],
    })
    const state = assessDimensions(ctx)
    expect(state.progress_momentum).toBe("LOW")
  })

  it("returns HEALTHY when work item has recent activity", () => {
    const ctx = makeContext({
      hasAssignedTask: true,
      activeWorkItems: [
        {
          id: "gitlab:issue:42",
          title: "Build pricing page",
          lastActivityAt: new Date(Date.now() - 6 * 60 * 60_000).toISOString(),
          assignedTo: "beki",
        },
      ],
    })
    const state = assessDimensions(ctx)
    expect(state.progress_momentum).toBe("HEALTHY")
  })

  it("returns HEALTHY when no activeWorkItems (backward compat)", () => {
    const ctx = makeContext({ hasAssignedTask: true })
    const state = assessDimensions(ctx)
    expect(state.progress_momentum).toBe("HEALTHY")
  })

  it("triggers LOW from ANY stale item, not all", () => {
    const ctx = makeContext({
      hasAssignedTask: true,
      activeWorkItems: [
        {
          id: "issue:1",
          title: "Fresh work",
          lastActivityAt: new Date(Date.now() - 1 * 60 * 60_000).toISOString(),
        },
        {
          id: "issue:2",
          title: "Stale work",
          lastActivityAt: new Date(Date.now() - 72 * 60 * 60_000).toISOString(),
          assignedTo: "beki",
        },
      ],
    })
    const state = assessDimensions(ctx)
    expect(state.progress_momentum).toBe("LOW")
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run server/engine/__tests__/homeostasis-f4.test.ts -t "stale work" --reporter=verbose`
Expected: FAIL — assessor doesn't check activeWorkItems yet

**Step 3: Add config threshold**

In `server/engine/config.yaml`, under the `homeostasis:` section (after `stuck_shared_stems_min`), add:

```yaml
  # Hours without activity on a tracked work item before progress_momentum drops.
  # Raise: more tolerance for quiet periods (weekends, async teams).
  # Lower: faster detection of stalled work.
  stale_work_hours: 48
```

**Step 4: Implement stale work detection in assessProgressMomentumL1**

In `server/engine/homeostasis-engine.ts`, in the `assessProgressMomentumL1` function, add a check **before** the existing stuck-detection logic (so stale work is caught even when messages aren't repeating):

```typescript
// Stale work detection: if any active work item has no activity beyond threshold
if (ctx.activeWorkItems && ctx.activeWorkItems.length > 0) {
  const staleHours = cfg.homeostasis?.stale_work_hours ?? 48
  const staleThresholdMs = staleHours * 60 * 60_000
  const now = Date.now()
  const hasStaleWork = ctx.activeWorkItems.some((item) => {
    const lastActivity = new Date(item.lastActivityAt).getTime()
    return now - lastActivity > staleThresholdMs
  })
  if (hasStaleWork) return "LOW"
}
```

**Step 5: Run tests to verify they pass**

Run: `pnpm vitest run server/engine/__tests__/homeostasis-f4.test.ts --reporter=verbose`
Expected: All tests PASS

**Step 6: Run full suite**

Run: `pnpm vitest run server/engine/__tests__/ --reporter=verbose`
Expected: All existing tests still PASS (no activeWorkItems = no stale detection = same behavior)

**Step 7: Commit**

```bash
git add server/engine/homeostasis-engine.ts server/engine/config.yaml server/engine/__tests__/homeostasis-f4.test.ts
git commit -m "feat: add stale work detection to progress_momentum assessor"
```

---

### Task 3: Expand communication_health assessor — delegation follow-up pressure

**Files:**
- Modify: `server/engine/homeostasis-engine.ts:238-264` (assessCommunicationHealthL1)
- Modify: `server/engine/config.yaml` (add `delegation_followup_hours`)
- Test: `server/engine/__tests__/homeostasis-f4.test.ts`

**Step 1: Write the failing tests**

```typescript
// ---------------------------------------------------------------------------
// BDD Scenario 10: Communication Health — delegation follow-up
// ---------------------------------------------------------------------------
describe("communication_health — delegation follow-up pressure", () => {
  it("returns LOW when delegated work has no follow-up for 24+ hours", () => {
    const ctx = makeContext({
      hasAssignedTask: true,
      activeWorkItems: [
        {
          id: "issue:42",
          title: "Build pricing page",
          lastActivityAt: new Date(Date.now() - 6 * 60 * 60_000).toISOString(),
          assignedTo: "beki",
          delegatedAt: new Date(Date.now() - 30 * 60 * 60_000).toISOString(),
        },
      ],
      outboundFollowUps: 0,
    })
    const state = assessDimensions(ctx)
    expect(state.communication_health).toBe("LOW")
  })

  it("returns HEALTHY when delegated work has been followed up on", () => {
    const ctx = makeContext({
      hasAssignedTask: true,
      activeWorkItems: [
        {
          id: "issue:42",
          title: "Build pricing page",
          lastActivityAt: new Date(Date.now() - 6 * 60 * 60_000).toISOString(),
          assignedTo: "beki",
          delegatedAt: new Date(Date.now() - 30 * 60 * 60_000).toISOString(),
        },
      ],
      outboundFollowUps: 1,
    })
    const state = assessDimensions(ctx)
    expect(state.communication_health).toBe("HEALTHY")
  })

  it("returns HEALTHY when no delegated items (backward compat)", () => {
    const ctx = makeContext({ hasAssignedTask: true })
    const state = assessDimensions(ctx)
    expect(state.communication_health).toBe("HEALTHY")
  })

  it("does not override outbound cooldown HIGH", () => {
    const ctx = makeContext({
      lastOutboundAt: new Date(Date.now() - 2 * 60_000).toISOString(),
      activeWorkItems: [
        {
          id: "issue:42",
          title: "Build pricing page",
          lastActivityAt: new Date(Date.now() - 6 * 60 * 60_000).toISOString(),
          assignedTo: "beki",
          delegatedAt: new Date(Date.now() - 30 * 60 * 60_000).toISOString(),
        },
      ],
      outboundFollowUps: 0,
    })
    const state = assessDimensions(ctx)
    // Outbound cooldown HIGH takes precedence (just sent a message)
    expect(state.communication_health).toBe("HIGH")
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run server/engine/__tests__/homeostasis-f4.test.ts -t "delegation follow-up" --reporter=verbose`
Expected: FAIL

**Step 3: Add config threshold**

In `server/engine/config.yaml`, under homeostasis section:

```yaml
  # Hours after delegating work before communication_health drops if no follow-up.
  # Raise: more patience before nagging.
  # Lower: faster follow-up expectation.
  delegation_followup_hours: 24
```

**Step 4: Implement delegation follow-up in assessCommunicationHealthL1**

In the `assessCommunicationHealthL1` function, add after the existing outbound cooldown HIGH check but **before** returning HEALTHY:

```typescript
// Delegation follow-up: if agent delegated work and hasn't followed up
if (
  ctx.activeWorkItems &&
  ctx.outboundFollowUps !== undefined &&
  ctx.outboundFollowUps === 0
) {
  const followupHours = cfg.homeostasis?.delegation_followup_hours ?? 24
  const followupThresholdMs = followupHours * 60 * 60_000
  const now = Date.now()
  const hasStaleDelegation = ctx.activeWorkItems.some((item) => {
    if (!item.delegatedAt) return false
    const delegated = new Date(item.delegatedAt).getTime()
    return now - delegated > followupThresholdMs
  })
  if (hasStaleDelegation) return "LOW"
}
```

**Important:** This check must come AFTER the outbound cooldown HIGH check so that "just sent a message" still wins.

**Step 5: Run tests to verify they pass**

Run: `pnpm vitest run server/engine/__tests__/homeostasis-f4.test.ts --reporter=verbose`
Expected: All PASS

**Step 6: Full suite**

Run: `pnpm vitest run server/engine/__tests__/ --reporter=verbose`
Expected: All PASS

**Step 7: Commit**

```bash
git add server/engine/homeostasis-engine.ts server/engine/config.yaml server/engine/__tests__/homeostasis-f4.test.ts
git commit -m "feat: add delegation follow-up pressure to communication_health assessor"
```

---

### Task 4: Expand productive_engagement assessor — reactive-only detection

**Files:**
- Modify: `server/engine/homeostasis-engine.ts:266-277` (assessProductiveEngagementL1)
- Test: `server/engine/__tests__/homeostasis-f4.test.ts`

**Step 1: Write the failing tests**

```typescript
// ---------------------------------------------------------------------------
// BDD Scenario 11: Productive Engagement — reactive-only detection
// ---------------------------------------------------------------------------
describe("productive_engagement — reactive-only behavior", () => {
  it("returns LOW when agent has tasks but zero outbound follow-ups and stale work", () => {
    const ctx = makeContext({
      hasAssignedTask: true,
      taskCount: 2,
      currentMessage: "How is the pricing page going?",
      messageHistory: [{ role: "user", content: "How is the pricing page going?" }],
      activeWorkItems: [
        {
          id: "issue:42",
          title: "Build pricing page",
          lastActivityAt: new Date(Date.now() - 72 * 60 * 60_000).toISOString(),
          assignedTo: "beki",
          delegatedAt: new Date(Date.now() - 96 * 60 * 60_000).toISOString(),
        },
      ],
      outboundFollowUps: 0,
    })
    const state = assessDimensions(ctx)
    expect(state.productive_engagement).toBe("LOW")
  })

  it("returns HEALTHY when agent has tasks and is actively following up", () => {
    const ctx = makeContext({
      hasAssignedTask: true,
      taskCount: 2,
      currentMessage: "Status update?",
      messageHistory: [{ role: "user", content: "Status update?" }],
      activeWorkItems: [
        {
          id: "issue:42",
          title: "Build pricing page",
          lastActivityAt: new Date(Date.now() - 12 * 60 * 60_000).toISOString(),
          assignedTo: "beki",
        },
      ],
      outboundFollowUps: 3,
    })
    const state = assessDimensions(ctx)
    expect(state.productive_engagement).toBe("HEALTHY")
  })

  it("returns HEALTHY when no activeWorkItems (backward compat)", () => {
    const ctx = makeContext({
      hasAssignedTask: true,
      taskCount: 1,
      currentMessage: "working on it",
      messageHistory: [{ role: "user", content: "do the thing" }],
    })
    const state = assessDimensions(ctx)
    expect(state.productive_engagement).toBe("HEALTHY")
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run server/engine/__tests__/homeostasis-f4.test.ts -t "reactive-only" --reporter=verbose`
Expected: FAIL

**Step 3: Implement reactive-only detection**

In `assessProductiveEngagementL1`, add after the existing idle check:

```typescript
// Reactive-only detection: has work items but hasn't been proactive
if (
  ctx.activeWorkItems &&
  ctx.activeWorkItems.length > 0 &&
  ctx.outboundFollowUps !== undefined &&
  ctx.outboundFollowUps === 0
) {
  const staleHours = cfg.homeostasis?.stale_work_hours ?? 48
  const staleThresholdMs = staleHours * 60 * 60_000
  const now = Date.now()
  const hasStaleWork = ctx.activeWorkItems.some((item) => {
    const lastActivity = new Date(item.lastActivityAt).getTime()
    return now - lastActivity > staleThresholdMs
  })
  if (hasStaleWork) return "LOW"
}
```

**Step 4: Run tests**

Run: `pnpm vitest run server/engine/__tests__/homeostasis-f4.test.ts --reporter=verbose`
Expected: All PASS

**Step 5: Full suite**

Run: `pnpm vitest run server/engine/__tests__/ --reporter=verbose`
Expected: All PASS

**Step 6: Commit**

```bash
git add server/engine/homeostasis-engine.ts server/engine/__tests__/homeostasis-f4.test.ts
git commit -m "feat: add reactive-only detection to productive_engagement assessor"
```

---

### Task 5: Update guidance text for skill-appropriate actions

**Files:**
- Modify: `server/engine/guidance.yaml`
- Test: `server/engine/__tests__/homeostasis-f4.test.ts`

**Step 1: Write the failing test**

```typescript
// ---------------------------------------------------------------------------
// BDD Scenario 12: Guidance suggests external system checks
// ---------------------------------------------------------------------------
describe("guidance — skill-appropriate actions", () => {
  it("progress_momentum LOW guidance mentions checking external systems", () => {
    const ctx = makeContext({
      hasAssignedTask: true,
      activeWorkItems: [
        {
          id: "issue:42",
          title: "Stale task",
          lastActivityAt: new Date(Date.now() - 72 * 60 * 60_000).toISOString(),
          assignedTo: "beki",
        },
      ],
    })
    const state = assessDimensions(ctx)
    expect(state.progress_momentum).toBe("LOW")
    const guidance = getGuidance(state)
    expect(guidance).toContain("status")
  })

  it("communication_health LOW guidance mentions follow-up", () => {
    const ctx = makeContext({
      hasAssignedTask: true,
      activeWorkItems: [
        {
          id: "issue:42",
          title: "Delegated task",
          lastActivityAt: new Date(Date.now() - 6 * 60 * 60_000).toISOString(),
          assignedTo: "beki",
          delegatedAt: new Date(Date.now() - 30 * 60 * 60_000).toISOString(),
        },
      ],
      outboundFollowUps: 0,
    })
    const state = assessDimensions(ctx)
    expect(state.communication_health).toBe("LOW")
    const guidance = getGuidance(state)
    expect(guidance).toContain("status update")
  })
})
```

**Step 2: Run tests — may already pass if existing guidance text matches**

Run: `pnpm vitest run server/engine/__tests__/homeostasis-f4.test.ts -t "skill-appropriate" --reporter=verbose`

**Step 3: Update guidance.yaml**

Update the `progress_momentum` LOW guidance to include external system checking:

```yaml
progress_momentum:
  LOW:
    priority: 2
    primary: |
      **Progress stalled.** You haven't made visible progress. Consider:
      - Check external systems for status (GitLab issues, MRs, CI pipelines)
      - If you delegated work, follow up with the assignee
      - Break the problem into smaller, achievable steps
      - Ask for help or a different perspective
      - Try a different approach if current one isn't working
    secondary: |
      Silence is a signal. If work you're tracking has gone quiet, investigate before assuming it's fine.
```

Update the `communication_health` LOW guidance:

```yaml
communication_health:
  LOW:
    priority: 3
    primary: |
      **Communication gap detected.** You haven't checked in recently. Consider:
      - Provide a status update on your current work
      - Follow up on delegated tasks — check issue/MR status
      - Ask if priorities have changed
      - Share any blockers or challenges you're facing
      - Confirm you're working on the right thing
    secondary: |
      Regular communication prevents misalignment. If you delegated work, the assignee may be blocked and waiting for you.
```

Update the `productive_engagement` LOW guidance:

```yaml
productive_engagement:
  LOW:
    priority: 2
    primary: |
      **Not contributing enough.** You may be idle or only reacting. You should:
      - Ask for the next task or assignment
      - Review your backlog — check GitLab for open issues
      - Proactively follow up on delegated work
      - Offer to help with other priorities
      - Use downtime productively (documentation, refactoring, learning)
    secondary: |
      It's better to proactively seek work and drive progress than to wait passively. Take initiative.
```

**Step 4: Run tests**

Run: `pnpm vitest run server/engine/__tests__/homeostasis-f4.test.ts --reporter=verbose`
Expected: All PASS

**Step 5: Full suite**

Run: `pnpm vitest run server/engine/__tests__/ --reporter=verbose`
Expected: All PASS (existing guidance tests check for keywords like "Communication" and "Idle" which are still present)

**Step 6: Commit**

```bash
git add server/engine/guidance.yaml server/engine/__tests__/homeostasis-f4.test.ts
git commit -m "feat: update guidance text to suggest external system checks and follow-ups"
```

---

### Task 6: Write new scenarios for signal surface expansion

**Files:**
- Create: `scenarios/level-250-progress-stale-work.yaml`
- Create: `scenarios/level-251-communication-delegation-followup.yaml`
- Create: `scenarios/level-252-engagement-reactive-only.yaml`
- Create: `scenarios/level-253-silence-resolves-after-check.yaml`

These scenarios validate the new assessor behavior end-to-end via the scenario runner.

**Step 1: Write stale work scenario**

Create `scenarios/level-250-progress-stale-work.yaml`:

```yaml
scenario: "L250 — progress_momentum drops when tracked work goes stale"
description: |
  Besa has delegated an issue to Beki. 3 days pass with no activity.
  On the next tick, progress_momentum should be LOW.
agent: besa
type: regression
setup:
  clear_ticks: true
  clear_state: true
steps:
  - send: "How are things going with the pricing page?"
    from: { platform: dashboard, user: kirill }
    setup:
      createTask:
        description: "Track pricing page implementation"
        phase: implementing
        status: in_progress
      activeWorkItems:
        - id: "gitlab:issue:42"
          title: "Build pricing page"
          lastActivityAt: "-72h"
          assignedTo: "beki"
          delegatedAt: "-96h"
    expect:
      homeostasis.progress_momentum: LOW
```

**Step 2: Write delegation follow-up scenario**

Create `scenarios/level-251-communication-delegation-followup.yaml`:

```yaml
scenario: "L251 — communication_health drops when delegation has no follow-up"
description: |
  Besa delegated work 30 hours ago and hasn't followed up.
  communication_health should be LOW.
agent: besa
type: regression
setup:
  clear_ticks: true
  clear_state: true
steps:
  - send: "Any updates on the project?"
    from: { platform: dashboard, user: kirill }
    setup:
      createTask:
        description: "Manage pricing page project"
        phase: implementing
        status: in_progress
      activeWorkItems:
        - id: "gitlab:issue:42"
          title: "Build pricing page"
          lastActivityAt: "-6h"
          assignedTo: "beki"
          delegatedAt: "-30h"
      outboundFollowUps: 0
    expect:
      homeostasis.communication_health: LOW
```

**Step 3: Write reactive-only scenario**

Create `scenarios/level-252-engagement-reactive-only.yaml`:

```yaml
scenario: "L252 — productive_engagement drops for reactive-only PM with stale work"
description: |
  Besa has work items but hasn't proactively followed up.
  Stale work + zero outbound follow-ups = LOW productive_engagement.
agent: besa
type: regression
setup:
  clear_ticks: true
  clear_state: true
steps:
  - send: "What's the status?"
    from: { platform: dashboard, user: kirill }
    setup:
      createTask:
        description: "Manage sprint"
        phase: implementing
        status: in_progress
      activeWorkItems:
        - id: "gitlab:issue:42"
          title: "Stale task"
          lastActivityAt: "-72h"
          assignedTo: "beki"
          delegatedAt: "-96h"
      outboundFollowUps: 0
    expect:
      homeostasis.productive_engagement: LOW
      homeostasis.progress_momentum: LOW
```

**Step 4: Write resolution scenario**

Create `scenarios/level-253-silence-resolves-after-check.yaml`:

```yaml
scenario: "L253 — dimensions recover when work items have recent activity"
description: |
  Besa's work items show recent activity. All dimensions should be HEALTHY.
  This is the "after Besa checked GitLab and found things are fine" state.
agent: besa
type: regression
setup:
  clear_ticks: true
  clear_state: true
steps:
  - send: "How is the sprint going?"
    from: { platform: dashboard, user: kirill }
    setup:
      createTask:
        description: "Manage sprint"
        phase: implementing
        status: in_progress
      activeWorkItems:
        - id: "gitlab:issue:42"
          title: "Build pricing page"
          lastActivityAt: "-2h"
          assignedTo: "beki"
      outboundFollowUps: 2
      seedFacts:
        - content: "Beki pushed 3 commits to the pricing-page branch today"
    expect:
      homeostasis.progress_momentum: HEALTHY
      homeostasis.communication_health: HEALTHY
      homeostasis.productive_engagement: HEALTHY
```

**Step 5: Commit**

```bash
git add scenarios/level-250-progress-stale-work.yaml scenarios/level-251-communication-delegation-followup.yaml scenarios/level-252-engagement-reactive-only.yaml scenarios/level-253-silence-resolves-after-check.yaml
git commit -m "feat: add scenarios for signal surface expansion (L250-L253)"
```

---

### Task 7: Extend scenario runner to support new setup fields

**Files:**
- Modify: `scripts/scenario-types.ts` (add `activeWorkItems`, `outboundFollowUps`, `inboundActivityCount` to `ScenarioStep.setup`)
- Modify: `scripts/run-scenario.ts` (wire new setup fields into the inject API call)
- Test: run L250-L253 scenarios

The scenario runner needs to support the new setup fields so they get passed through to the tick's AgentContext construction.

**Step 1: Extend ScenarioStep.setup type**

In `scripts/scenario-types.ts`, add to the `setup` interface:

```typescript
  setup?: {
    lastOutboundMinutesAgo?: number
    createTask?: {
      description: string
      phase?: string
      phaseMinutesAgo?: number
      status?: string
    }
    addHistory?: Array<{ role: string; content: string }>
    seedFacts?: Array<{ content: string; source?: string }>
    // Phase I: activity signal fields
    activeWorkItems?: Array<{
      id: string
      title: string
      lastActivityAt: string  // relative like "-72h" or ISO timestamp
      assignedTo?: string
      delegatedAt?: string    // relative like "-96h" or ISO timestamp
    }>
    outboundFollowUps?: number
    inboundActivityCount?: number
  }
```

**Step 2: Wire setup fields through run-scenario.ts**

Find where the scenario runner builds the inject/tick API payload. Add logic to:
1. Parse relative timestamps (e.g., `"-72h"` → ISO timestamp 72 hours ago)
2. Pass `activeWorkItems`, `outboundFollowUps`, `inboundActivityCount` in the API call

Add a helper function:

```typescript
function resolveRelativeTimestamp(value: string): string {
  if (value.startsWith("-") && value.endsWith("h")) {
    const hours = Number.parseInt(value.slice(1, -1), 10)
    return new Date(Date.now() - hours * 60 * 60_000).toISOString()
  }
  return value // assume ISO timestamp
}
```

Apply it to `activeWorkItems` before sending:

```typescript
if (step.setup?.activeWorkItems) {
  payload.activeWorkItems = step.setup.activeWorkItems.map((item) => ({
    ...item,
    lastActivityAt: resolveRelativeTimestamp(item.lastActivityAt),
    delegatedAt: item.delegatedAt
      ? resolveRelativeTimestamp(item.delegatedAt)
      : undefined,
  }))
}
if (step.setup?.outboundFollowUps !== undefined) {
  payload.outboundFollowUps = step.setup.outboundFollowUps
}
if (step.setup?.inboundActivityCount !== undefined) {
  payload.inboundActivityCount = step.setup.inboundActivityCount
}
```

**Step 3: Wire in tick.ts — pass new fields to AgentContext**

In `server/agent/tick.ts`, where `agentContext` is constructed (around line 376-405), add:

```typescript
  // Phase I: activity signal fields (from inject API or operational memory)
  activeWorkItems: msg.metadata?.activeWorkItems ?? undefined,
  lastExternalCheckAt: opCtx.lastExternalCheckAt ?? undefined,
  outboundFollowUps: msg.metadata?.outboundFollowUps ?? undefined,
  inboundActivityCount: msg.metadata?.inboundActivityCount ?? undefined,
```

**Step 4: Run existing scenarios to verify no regressions**

Run: `pnpm tsx scripts/run-scenario.ts scenarios/level-45-healthy-baseline.yaml`
Run: `pnpm tsx scripts/run-scenario.ts scenarios/level-67-all-dimensions-healthy-baseline.yaml`
Expected: PASS (no activeWorkItems in these scenarios = no new logic triggers)

**Step 5: Run new scenarios**

Note: L250-L253 require the server to be running and the inject API to support the new fields. These may not pass until the server-side wiring (Step 3) is deployed.

Run: `pnpm tsx scripts/run-scenario.ts scenarios/level-250-progress-stale-work.yaml --trace`
Expected: PASS with `homeostasis.progress_momentum: LOW`

**Step 6: Commit**

```bash
git add scripts/scenario-types.ts scripts/run-scenario.ts server/agent/tick.ts
git commit -m "feat: extend scenario runner with activity signal setup fields"
```

---

### Task 8: Update ARCHITECTURE.md implementation status

**Files:**
- Modify: `docs/ARCHITECTURE.md` (Implementation Status table)

**Step 1: Move signal surface expansion from "Not Yet Built" to "Production-Ready"**

Update the Implementation Status table:

In the **Production-Ready** table, add:

```markdown
| Brain | Signal surface expansion (stale work, delegation follow-up, reactive-only) | `server/engine/homeostasis-engine.ts` |
```

In the **Not Yet Built** table, update:

```markdown
| Signal surface expansion | ~~Time-aware silence detection, cross-channel activity signals for assessors~~ | ~~Phase I~~ |
```

Change to:

```markdown
| Cross-channel activity signals | Inbound activity from GitLab webhooks/MR updates feeding into assessors | Phase I.2 |
```

Keep the other Phase I items:

```markdown
| Skill-driven action routing | Dimensions map to agent-specific skills, not hardcoded responses | Phase I.2 |
| Action feedback loop | Agent actions (e.g., GitLab query) feed results back into homeostasis assessment | Phase I.2 |
```

**Step 2: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: update implementation status for signal surface expansion"
```

---

## Execution Notes

**What changes for existing scenarios:** Nothing. All new `AgentContext` fields are optional. When absent (all 177 existing scenarios), assessors use the exact same logic paths as before.

**What changes for the engine:** Three assessors gain additional `if` blocks that only fire when the new fields are populated. The checks are O(n) over `activeWorkItems` (expected to be <20 items).

**What this does NOT build (Phase I.2, future):**
- Automatic population of `activeWorkItems` from GitLab webhooks — currently the tick must receive these via inject API or operational memory
- Skill-driven action routing — agents choose actions via LLM + guidance text, not a formal skill dispatch system
- Action feedback loop — the agent's external queries don't yet automatically update `activeWorkItems`; that requires GitLab webhook integration or a post-action context update

**Config surface:**
- `homeostasis.stale_work_hours: 48` — hours before work is "stale"
- `homeostasis.delegation_followup_hours: 24` — hours before delegation needs follow-up
