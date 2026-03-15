# Agent Work Lifecycle Design

**Date:** 2026-03-15
**Status:** Design — approved via brainstorming session
**Problem:** Agents (Beki/Besa) have no formalized work lifecycle. They sometimes commit, sometimes don't. They don't use superpowers skills. No verification before completion. No structured reporting. No cross-agent communication pattern.
**Solution:** Formalize a 6-phase lifecycle enforced via system prompt instructions + pipeline stages.

---

## Lifecycle Overview

```
BEGIN → DO → VERIFY → PUBLISH → REPORT → FINISH
```

| Phase   | Enforced By      | Superpowers Skills Used                    |
|---------|------------------|--------------------------------------------|
| BEGIN   | Pipeline (existing) | —                                        |
| DO      | System prompt    | /brainstorming, /writing-plans, /test-driven-development, /topic-research |
| VERIFY  | Pipeline (new)   | /verification-before-completion            |
| PUBLISH | System prompt    | /finishing-a-development-branch            |
| REPORT  | System prompt    | —                                          |
| FINISH  | Pipeline (new)   | —                                          |

---

## Phase 1: BEGIN (no changes)

Existing tick pipeline handles this:
- Message arrives via inject API
- Routing classifies task type (coding/research/review/admin)
- Pipeline sets `workPhase: "active"` in operational context
- Agent spec loaded, context assembled, homeostasis assessed

---

## Phase 2: DO (system prompt instructions)

New `workflow_instructions` field in agent spec, injected at constraint priority (never truncated).

### Beki (Developer) Instructions

```yaml
workflow_instructions: |
  ## How You Work

  You have access to superpowers skills. Use them.

  ### Coding Tasks
  1. If the task involves design decisions → /brainstorming first
  2. If multi-step → /writing-plans to create a plan
  3. Write tests FIRST → /test-driven-development
  4. Implement minimal code to pass tests
  5. Commit with conventional commit message (feat:, fix:, docs:)
  6. Push your branch and create a merge request (glab mr create)
  7. Use /finishing-a-development-branch for the workflow

  ### Research Tasks
  1. Use /topic-research for multi-source research
  2. Save findings to docs/research/ or docs/plans/
  3. Commit the output

  ### When You Need Information
  - Ask via Discord — message the person directly
  - Set task status to blocked with what you're waiting for
  - When you get the answer, resume the task

  ### Always
  - Use conventional commits (feat:, fix:, docs:, etc.)
  - Always commit your work before finishing
  - Never claim completion without evidence (tests passing, lint clean)
  - If stuck, say so — don't produce partial work silently
  - Keep reports under 5 sentences

  ### Reporting
  - After completing work, report back to the assigner via Discord
  - Include: what you did, what tests pass, MR link or commit hash
```

### Besa (PM) Instructions

```yaml
workflow_instructions: |
  ## How You Work

  You have access to superpowers skills. Use them.

  ### Research Tasks
  1. Use /topic-research for multi-source research
  2. Save findings to docs/research/ or docs/plans/
  3. Commit the output

  ### Planning Tasks
  1. If the task involves design decisions → /brainstorming first
  2. Break down epics into actionable tasks
  3. Create GitLab issues via glab issue create
  4. Save plans to docs/plans/

  ### Task Assignment
  - Assign tasks to Beki via Discord with clear requirements
  - Include: what to build, acceptance criteria, priority level
  - Reference relevant docs or issues

  ### When Asked for Clarification
  - Respond promptly with specific, actionable requirements
  - If you don't have the answer, escalate to Kirill

  ### Always
  - Use conventional commits (feat:, fix:, docs:, etc.)
  - Always commit your work before finishing
  - Never claim completion without evidence
  - If stuck, say so

  ### Reporting
  - After completing work, report back to the assigner via Discord
  - Include: what you did, links to created issues/docs
  - Keep reports under 5 sentences
```

---

## Phase 3: VERIFY (pipeline-enforced)

After the first work arc completes, the pipeline automatically runs a verification arc.

### When to Run

- Only after `task_assignment` work arcs
- Only when first arc status is `completed`
- Only for `coding` task types (research/admin skip this)

### Verification Prompt

```typescript
const verifyPrompt = `
A coding task was just completed. Verify the work before it ships.

## Original Task
${originalTaskDescription}

## What Was Done
${gitDiffStat}

## Recent Commits
${recentCommits}

## Verification Checklist
1. Run tests: pnpm vitest run — do they pass?
2. Run linter: pnpm biome check — any violations?
3. Review the diff: does it match what was asked?
4. Check for uncommitted changes: stage and commit if needed
5. If any issues found, fix them and commit the fix

Use /verification-before-completion to structure your check.
Report what you found and what you fixed.
`
```

### Pipeline Integration (tick.ts)

```typescript
// After DO phase work arc
const doResult = await executeWorkArc(task, adapter, {
  ...opts,
  timeout: getAdapterTimeout(routing.taskType),
})

// VERIFY phase — pipeline-enforced for coding tasks
if (doResult.status === "completed" && routing.taskType === "coding") {
  const diffStat = await exec("git diff --stat HEAD~1")
  const recentCommits = await exec("git log --oneline -3")

  const verifyResult = await executeWorkArc(verifyTask, adapter, {
    ...opts,
    timeout: getAdapterTimeout("review"), // review-level timeout
    prompt: buildVerifyPrompt(task, diffStat, recentCommits),
  })

  // Merge verification outcome into tick record
  tickRecord.verification = {
    status: verifyResult.status,
    issuesFound: extractIssueCount(verifyResult),
    issuesFixed: extractFixCount(verifyResult),
  }
}
```

### Timeout Budget

Verification uses `review` task type timeout (180s from config.yaml). This is configurable — if it turns out to need more, adjust `agent.adapter_timeouts.review`.

### Cost

Doubles the LLM cost per coding task. Expected and accepted — catching bugs early saves more time than it costs.

---

## Phase 4: PUBLISH (system prompt instructions)

For coding tasks, the agent is instructed to:
1. Create a feature/fix branch (hard block prevents pushing to main)
2. Push the branch to remote
3. Create a merge request via `glab mr create`

For PM tasks (Besa):
1. Create GitLab issues via `glab issue create`
2. Update sprint board if applicable

This is guided by system prompt instructions, not pipeline-enforced. The `/finishing-a-development-branch` skill handles the workflow.

---

## Phase 5: REPORT (system prompt instructions)

After work is done, the agent reports back via Discord to the person who assigned the task.

### Developer Report (Beki)

```
Task: [what was asked]
Done: [what was implemented]
Tests: [pass/fail count]
MR: [link or "committed to branch X"]
```

### PM Report (Besa)

```
Task: [what was asked]
Done: [what was researched/planned]
Output: [link to doc or issue numbers]
```

Reports are kept under 5 sentences. The dispatcher sends them through the original channel.

---

## Phase 6: FINISH (pipeline-enforced)

After verification and reporting, the pipeline ensures cleanup:

```typescript
// Check for uncommitted changes
const status = await getGitStatus(workspace)

if (status.hasUncommittedChanges) {
  // Minimal commit arc — 30s timeout
  await executeWorkArc({
    prompt: "You have uncommitted changes. Stage relevant files and commit with a conventional commit message.",
    timeout: 30_000,
  })
}

// Update operational context
opCtx.workPhase = "idle"
await saveOperationalContext(agentId, opCtx)

// Record tick with full outcome
appendTickRecord(tickRecord)
```

---

## Cross-Agent Communication

Agents communicate via Discord, like humans would. No internal routing.

### Pattern: Beki Needs Info from Besa

1. Beki receives a task that lacks requirements
2. Beki messages Besa on Discord asking for clarification
3. Beki sets task status to `blocked` with the question
4. Besa receives the message on her next tick, responds
5. Beki receives the answer, resumes work (session resume)

### Workflow Instructions Support

```yaml
### When You Need Information
- Ask via Discord — message the person directly
- Set task status to blocked with what you're waiting for
- When you get the answer, resume the task
```

---

## Scenarios

### L94: Cross-Agent — Beki Asks Besa for Requirements

```yaml
scenario: "L94: Cross-agent — Beki asks Besa for requirements"
agent: beki
model: sonnet
setup:
  clear_ticks: true
  clear_state: true
steps:
  - send: >
      Add rate limiting to the inject API. Check with Besa
      for the requirements — she has the sprint priorities.
    from: { platform: discord, user: kirill }
    messageType: task_assignment
    expect:
      routing.level: task
      outcome.action: delegate

  - send: >
      Hey Besa, Kirill asked me to add rate limiting to the
      inject API. What are the requirements? Max requests per
      minute? Per agent or global? Should I use a library?
    from: { platform: discord, user: beki }
    agent: besa
    messageType: chat
    expect:
      routing.level: interaction
      outcome.action: respond

  - send: >
      Use a simple in-memory counter. 60 requests per minute
      per agent. No library needed — just a Map with TTL cleanup.
      This is P3, keep it minimal.
    from: { platform: discord, user: besa }
    agent: beki
    messageType: task_assignment
    expect:
      routing.level: task
      outcome.action: delegate
```

### L95: Verification Catches Bug

```yaml
scenario: "L95: Pipeline verification catches a linting error"
description: >
  Beki implements a feature but introduces a linting issue.
  The pipeline-enforced VERIFY phase should catch and fix it.
agent: beki
model: sonnet
setup:
  clear_ticks: true
  clear_state: true
steps:
  - send: >
      Add a utility function to server/agent/utils.ts that
      converts a duration in milliseconds to a human-readable
      string like "2m 30s". Include a test.
    from: { platform: discord, user: kirill }
    messageType: task_assignment
    expect:
      routing.level: task
      outcome.action: delegate
```

---

## Files to Change

| File | Change | Priority |
|------|--------|----------|
| `data/agents/beki/spec.yaml` | Add `workflow_instructions` | P1 |
| `data/agents/besa/spec.yaml` | Add `workflow_instructions` (PM variant) | P1 |
| `server/memory/context-assembler.ts` | Inject `workflow_instructions` at constraint priority | P1 |
| `server/agent/tick.ts` | Add VERIFY and FINISH stages after work arc | P1 |
| `server/agent/coding-adapter/work-arc.ts` | Extract `getDiffStat()` helper | P2 |
| `scenarios/level-94-*.yaml` | Cross-agent communication scenario | P2 |
| `scenarios/level-95-*.yaml` | Verification catches bug scenario | P2 |

---

## Implementation Order

1. Add `workflow_instructions` to both agent specs
2. Update context-assembler to inject them at constraint priority
3. Run existing dogfood scenarios to verify agents now use skills
4. Add VERIFY stage to tick.ts (second work arc)
5. Add FINISH stage (commit check)
6. Write and run L94/L95 scenarios
7. Observe and iterate

---

## Open Questions

1. **Verification timeout** — Starting with `review` timeout (180s). May need adjustment based on observed durations.
2. **PUBLISH automation** — Should the pipeline enforce branch creation and MR, or trust the system prompt? Starting with system prompt, can promote to pipeline later.
3. **Cross-agent latency** — Beki asks Besa, but Besa only ticks on heartbeat (30s) or message. Acceptable for now, but async job model (L93) would improve this.
4. **Reporting channel** — Always Discord for now. GitLab comments for MR-related work is a natural evolution.
