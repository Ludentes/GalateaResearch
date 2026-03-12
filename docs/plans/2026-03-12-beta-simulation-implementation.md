# Beta Simulation: Wiring End-to-End — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire Galatea's existing components into a working end-to-end system where Beki (developer agent) and Besa (PM agent) interact via Discord with a real PM.

**Architecture:** The system is ~80% built. W.1 (Discord inbound → tick queue) and W.2 (tick → Discord outbound) are already wired. This plan focuses on: fixing broken tests, adding multi-agent support (agent spec + team directory), extending the task model (types, artifacts, session resume), adding observability (TickDecisionRecord + fleet dashboard), and closing the knowledge loop (work-to-knowledge).

**Tech Stack:** TypeScript, Vitest 4, TanStack Start v1, React, Discord.js, Claude Code Agent SDK, YAML configs, JSONL stores.

**Design Doc:** `docs/plans/2026-03-11-beta-simulation-design.md`

---

## Dependency Graph

```
Phase 1: Foundation (W.3, W.4)          — fix broken things
Phase 2: Types (W.6, W.7)              — extend TaskState + Artifact
Phase 3: Agent Infra (W.8, W.13)       — agent spec + team directory
Phase 4: Behavior (W.5, W.9)           — two-level routing + session resume
Phase 5: Observability (W.12)           — TickDecisionRecord + fleet dashboard
Phase 6: Knowledge Loop (W.10, W.11)    — work-to-knowledge + glab context
Phase 7: Validation                     — deploy Beki + Besa, run traces

Parallelizable:
  Phase 1 || Phase 2 (no deps)
  Phase 3 can start after Phase 2
  Phase 4 depends on Phase 2 (TaskState type) + Phase 3 (agent spec)
  Phase 5 can start after Phase 3 (agent IDs)
  Phase 6 depends on Phase 2 (Artifact type)
```

---

## Testing Strategy

Every task has **Acceptance Criteria** written as Gherkin scenarios. These serve two purposes:
1. **Before implementation**: define done — the implementer knows what to build
2. **After implementation**: each scenario becomes a Vitest test (or is covered by one)

Acceptance tests live alongside unit tests in `__tests__/` directories. Convention:
- Unit tests: `*.test.ts` (existing pattern)
- Acceptance tests: `*.acceptance.test.ts` (new pattern for behavioral scenarios)

The acceptance test files import real modules (not mocks) wherever possible. Mock only external services (Discord, Claude Code SDK, Ollama). The goal is to verify behavior chains, not individual functions.

```
server/agent/__tests__/
  tick.test.ts                    ← existing unit tests
  tick-delegation.test.ts         ← existing delegation tests
  tick-routing.acceptance.test.ts ← NEW: W.5 two-level routing scenarios
  team-directory.test.ts          ← NEW: W.13 unit tests
  team-identity.acceptance.test.ts← NEW: W.13 identity → context chain
  agent-spec.test.ts              ← NEW: W.8 unit tests

server/observation/__tests__/
  tick-record.test.ts             ← NEW: W.12 unit tests
  tick-observability.acceptance.test.ts ← NEW: W.12 tick → record → API chain

server/memory/__tests__/
  work-to-knowledge.test.ts       ← NEW: W.10 unit tests
  work-to-knowledge.acceptance.test.ts ← NEW: W.10 task completion → knowledge chain
```

---

## Phase 1: Foundation

### Task 1: Fix Confabulation Guard (W.4 partial)

**Files:**
- Fix: `server/memory/confabulation-guard.ts`
- Test: `server/memory/__tests__/confabulation-guard.test.ts`

The test "clears about field when entity not in source text or known people" fails. The guard should clear `about` when the entity is invented but currently doesn't.

**Acceptance Criteria:**

```gherkin
Feature: Confabulation guard catches invented entities

  Scenario: Guard clears about.entity not found in source or known people
    Given an extracted entry with about.entity = "jennifer"
    And the source text does not mention "jennifer"
    And "jennifer" is not in the known people list
    When validateExtraction runs
    Then the entry's about field is cleared
    And a warning is emitted mentioning "jennifer"

  Scenario: Guard keeps about.entity found in source text
    Given an extracted entry with about.entity = "alina"
    And the source text mentions "alina"
    When validateExtraction runs
    Then the entry's about field is preserved

  Scenario: Full test suite passes with no regressions
    When all tests in server/memory/__tests__/confabulation-guard.test.ts run
    Then all 12 tests pass
```

**Step 1: Read the failing test and implementation**

Read:
- `server/memory/__tests__/confabulation-guard.test.ts:70-90` (the failing test)
- `server/memory/confabulation-guard.ts` (the function under test)

Understand what `validateExtraction()` does with `about.entity` and why it's not clearing invented entities.

**Step 2: Fix the confabulation guard logic**

The test expects: when `about.entity` is not found in source text AND not in `knownPeople`, clear the `about` field. Find the code path that handles `about.entity` validation and fix the condition.

**Step 3: Run test to verify fix**

Run: `pnpm vitest run server/memory/__tests__/confabulation-guard.test.ts -v`
Expected: All tests PASS

**Step 4: Run full test suite (excluding DB-dependent)**

Run: `pnpm vitest run --exclude='**/*integration*' -v`
Expected: 0 failures (DB integration tests excluded by glob)

**Step 5: Commit**

```bash
git add server/memory/confabulation-guard.ts
git commit -m "fix: confabulation guard clears invented about.entity"
```

---

### Task 2: Skip DB-Dependent Integration Tests (W.4 partial)

**Files:**
- Modify: `server/functions/__tests__/integration/chat.integration.test.ts`
- Modify: any other files that fail due to PostgreSQL connection refused

**Acceptance Criteria:**

```gherkin
Feature: Test suite runs cleanly without external services

  Scenario: Full test suite passes without PostgreSQL
    Given PostgreSQL is not running on port 15432
    When the full test suite runs (pnpm vitest run)
    Then 0 tests fail
    And DB-dependent tests show as "skipped"
    And all other tests pass normally

  Scenario: DB tests run when PostgreSQL is available
    Given PostgreSQL is running on port 15432
    When the full test suite runs
    Then DB-dependent tests execute and pass
    And they are not skipped
```

**Step 1: Identify all DB-dependent test files**

Run: `pnpm vitest run --reporter=verbose 2>&1 | grep "ECONNREFUSED\|15432" -B5`

List all files that fail due to PostgreSQL not running.

**Step 2: Add skip condition to DB-dependent tests**

For each DB-dependent test file, add at the top:

```typescript
import { describe } from "vitest"

const hasPostgres = await (async () => {
  try {
    const net = await import("node:net")
    return new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ port: 15432, host: "127.0.0.1" })
      socket.on("connect", () => { socket.destroy(); resolve(true) })
      socket.on("error", () => resolve(false))
    })
  } catch { return false }
})()

const describeWithDb = hasPostgres ? describe : describe.skip
```

Then replace `describe(` with `describeWithDb(` for the top-level describe block.

**Step 3: Run full test suite**

Run: `pnpm vitest run -v`
Expected: 0 failures. DB tests show as "skipped" when PostgreSQL isn't running.

**Step 4: Commit**

```bash
git add -A server/functions/__tests__/
git commit -m "fix: skip DB-dependent tests when PostgreSQL unavailable"
```

---

### Task 3: Fix ARCHITECTURE.md (W.3)

**Files:**
- Modify: `docs/ARCHITECTURE.md`

**Acceptance Criteria:**

```gherkin
Feature: ARCHITECTURE.md reflects actual codebase state

  Scenario: All existing components are listed
    Given the beta simulation design "What Exists" audit
    When ARCHITECTURE.md implementation status table is checked
    Then every component from the audit appears in the table
    And no components are listed that don't exist

  Scenario: Dimension count is consistent
    When searching ARCHITECTURE.md for dimension references
    Then all references say "7 dimensions" (not 6)

  Scenario: Last updated field exists
    When reading the implementation status section
    Then a "Last updated: 2026-03-12" field is present
```

**Step 1: Read the current Implementation Status table**

Read: `docs/ARCHITECTURE.md` — find the Implementation Status section.

**Step 2: Audit against actual codebase**

Cross-reference the table against what actually exists (from the beta simulation design's "What Exists" audit). Fix:
- Wrong entries (6 identified in design doc)
- Missing entries (11 identified)
- "6 dimensions" → "7 dimensions" everywhere
- Add "Last updated: 2026-03-12" field

**Step 3: Update the document**

Use the audit in `docs/plans/2026-03-11-beta-simulation-design.md` "What Exists" section as the source of truth.

**Step 4: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: fix ARCHITECTURE.md implementation status (W.3)"
```

---

## Phase 2: Types

### Task 4: Add TaskState Type Field (W.6)

**Files:**
- Modify: `server/agent/operational-memory.ts` (TaskState interface + addTask)
- Test: `server/agent/__tests__/operational-memory.test.ts`

**Acceptance Criteria:**

```gherkin
Feature: Task type drives behavior routing

  Scenario: Task created with explicit type
    Given a new task with type "research"
    When addTask is called
    Then the task's type field is "research"

  Scenario: Task defaults to coding when type omitted
    Given a new task without a type field
    When addTask is called
    Then the task's type field is "coding"

  Scenario: All five task types are valid
    Given task types "coding", "research", "review", "admin", "communication"
    When a task is created for each type
    Then all tasks persist with their correct type

  Scenario: Existing tests don't break
    When the full operational-memory test suite runs
    Then all existing tests pass (no regressions from type addition)
```

**Step 1: Write failing test for TaskState.type**

Add test in `operational-memory.test.ts`:

```typescript
it("creates task with type field", async () => {
  const msg = makeMessage("research auth options")
  const ctx = await addTask(
    defaultCtx(),
    { description: "Research auth", source: msg, type: "research" }
  )
  expect(ctx.tasks[0].type).toBe("research")
})

it("defaults task type to coding", async () => {
  const msg = makeMessage("implement settings")
  const ctx = await addTask(
    defaultCtx(),
    { description: "Implement settings", source: msg }
  )
  expect(ctx.tasks[0].type).toBe("coding")
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/agent/__tests__/operational-memory.test.ts -t "creates task with type field"`
Expected: FAIL — `type` doesn't exist on TaskState

**Step 3: Add type field to TaskState**

In `server/agent/operational-memory.ts`:

```typescript
export interface TaskState {
  id: string
  description: string
  source: ChannelMessage
  type: "coding" | "research" | "review" | "admin" | "communication"
  status: "assigned" | "in_progress" | "blocked" | "done"
  phase: "exploring" | "deciding" | "implementing" | "verifying"
  progress: string[]
  artifacts: string[]  // Will become Artifact[] in Task 5
  phaseStartedAt: string
  toolCallCount: number
}

export type TaskType = TaskState["type"]
```

Update `addTask()` to accept optional `type` defaulting to `"coding"`.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/agent/__tests__/operational-memory.test.ts -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add server/agent/operational-memory.ts server/agent/__tests__/operational-memory.test.ts
git commit -m "feat: add type field to TaskState (W.6)"
```

---

### Task 5: Add Structured Artifact Type (W.7)

**Files:**
- Create: `server/agent/artifact.ts`
- Modify: `server/agent/operational-memory.ts` (TaskState.artifacts type change)
- Test: `server/agent/__tests__/operational-memory.test.ts`

**Acceptance Criteria:**

```gherkin
Feature: Structured artifacts replace string arrays

  Scenario: MR artifact records URL and type
    Given a completed coding task
    When an artifact of type "mr" with URL is added
    Then the artifact is stored with type "mr"
    And the artifact has a url field
    And the artifact has a description field

  Scenario: Document artifact records file path
    Given a completed research task
    When an artifact of type "document" with path is added
    Then the artifact is stored with type "document"
    And the artifact has a path field

  Scenario: Multiple artifact types on one task
    Given a coding task
    When artifacts of type "branch", "commit", and "mr" are added
    Then the task has 3 artifacts
    And each has the correct type

  Scenario: Work arc produces structured artifacts
    Given a work arc completes with branch and MR
    When the tick processes the result
    Then the task's artifacts contain structured Artifact objects (not strings)

  Scenario: All agent test suites pass after type change
    When all tests in server/agent/ run
    Then 0 tests fail
```

**Step 1: Write failing test for structured artifacts**

```typescript
it("records structured artifact on task", async () => {
  let ctx = await addTask(defaultCtx(), {
    description: "Implement settings",
    source: makeMessage("implement"),
    type: "coding",
  })
  const artifact: Artifact = {
    type: "mr",
    url: "https://gitlab.example.com/project/-/merge_requests/42",
    description: "Settings screen MR",
  }
  ctx = addArtifact(ctx, ctx.tasks[0].id, artifact)
  expect(ctx.tasks[0].artifacts).toHaveLength(1)
  expect(ctx.tasks[0].artifacts[0].type).toBe("mr")
  expect(ctx.tasks[0].artifacts[0].url).toContain("42")
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/agent/__tests__/operational-memory.test.ts -t "records structured artifact"`
Expected: FAIL

**Step 3: Create Artifact type and addArtifact function**

Create `server/agent/artifact.ts`:

```typescript
export interface Artifact {
  type: "branch" | "mr" | "document" | "issue" | "comment" | "commit"
  path?: string
  url?: string
  description: string
}
```

In `server/agent/operational-memory.ts`:
- Change `artifacts: string[]` to `artifacts: Artifact[]`
- Add `addArtifact(ctx, taskId, artifact)` function
- Ensure backward compatibility: existing `string[]` artifacts in persisted JSON should be handled (migration or ignore — they'll be overwritten on next save)

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/agent/__tests__/operational-memory.test.ts -v`
Expected: All PASS

**Step 5: Update tick.ts to use new Artifact type**

Find where `task.artifacts.push(...)` is called in `tick.ts` or `work-arc.ts` and update to use the new `Artifact` interface. Currently artifacts are pushed as strings — change to structured objects.

**Step 6: Run full agent test suite**

Run: `pnpm vitest run server/agent/ -v`
Expected: All PASS (existing tests may need string→Artifact updates)

**Step 7: Commit**

```bash
git add server/agent/artifact.ts server/agent/operational-memory.ts server/agent/__tests__/operational-memory.test.ts server/agent/tick.ts server/agent/coding-adapter/work-arc.ts
git commit -m "feat: add structured Artifact type (W.7)"
```

---

## Phase 3: Agent Infrastructure

### Task 6: Agent Spec Format (W.8)

**Files:**
- Create: `server/agent/agent-spec.ts` (loader + types)
- Create: `data/agents/beki/spec.yaml`
- Create: `data/agents/besa/spec.yaml`
- Test: `server/agent/__tests__/agent-spec.test.ts`

**Acceptance Criteria:**

```gherkin
Feature: Agent spec defines identity, workspace, and trust

  Scenario: Load Beki spec from YAML
    Given data/agents/beki/spec.yaml exists
    When loadAgentSpec("beki") is called
    Then spec.agent.id is "beki"
    And spec.agent.role is "Mobile developer"
    And spec.workspace is a valid path
    And spec.hard_blocks contains "push directly to main"

  Scenario: Load Besa spec with different role
    Given data/agents/besa/spec.yaml exists
    When loadAgentSpec("besa") is called
    Then spec.agent.role is "Project Manager"
    And spec.trust.identities includes beki with level "high"

  Scenario: Trust configuration loads correctly
    Given an agent spec with trust.identities and trust.channels
    When the spec is loaded
    Then trust.default_identity_trust is "none"
    And trust.identities contains entity "sasha" with level "full"
    And trust.channels.discord is "high"

  Scenario: Missing spec file throws
    When loadAgentSpec("nonexistent") is called
    Then an error is thrown

  Scenario: Agent ID mismatch throws
    Given a spec file where agent.id does not match the requested ID
    When loadAgentSpec is called with the wrong ID
    Then an error is thrown mentioning "mismatch"

  Scenario: All registered agents discoverable
    Given data/agents/ contains beki/ and besa/ directories
    When scanning data/agents/*/spec.yaml
    Then exactly 2 agent specs are found
```

**Step 1: Write failing test for spec loading**

```typescript
// @vitest-environment node
import { describe, expect, it } from "vitest"
import { loadAgentSpec, type AgentSpec } from "../agent-spec"

describe("Agent Spec", () => {
  it("loads agent spec from YAML", async () => {
    const spec = await loadAgentSpec("beki", "data/agents/beki/spec.yaml")
    expect(spec.agent.id).toBe("beki")
    expect(spec.agent.name).toBe("Beki")
    expect(spec.agent.role).toBe("Mobile developer")
    expect(spec.workspace).toBeDefined()
    expect(spec.thresholds).toBeDefined()
    expect(spec.hard_blocks).toBeInstanceOf(Array)
  })

  it("loads trust configuration", async () => {
    const spec = await loadAgentSpec("beki", "data/agents/beki/spec.yaml")
    expect(spec.trust.default_identity_trust).toBe("none")
    expect(spec.trust.identities).toContainEqual(
      expect.objectContaining({ entity: "sasha", level: "full" })
    )
  })

  it("throws on missing spec file", async () => {
    await expect(
      loadAgentSpec("ghost", "data/agents/ghost/spec.yaml")
    ).rejects.toThrow()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/agent/__tests__/agent-spec.test.ts -v`
Expected: FAIL — module not found

**Step 3: Create AgentSpec type and loader**

Create `server/agent/agent-spec.ts`:

```typescript
import { readFile } from "node:fs/promises"
import YAML from "yaml"

export interface AgentSpec {
  agent: {
    id: string
    name: string
    role: string
    domain: string
  }
  workspace: string
  allowed_branches: string[]
  thresholds: Record<string, { context: string }>
  hard_blocks: string[]
  trust: {
    identities: Array<{ entity: string; level: "full" | "high" | "medium" | "none" }>
    channels: Record<string, "full" | "high" | "medium" | "none">
    default_identity_trust: "full" | "high" | "medium" | "none"
  }
  knowledge_store: string
  operational_memory: string
  tools_context?: string
}

export async function loadAgentSpec(
  agentId: string,
  specPath: string,
): Promise<AgentSpec> {
  const raw = await readFile(specPath, "utf-8")
  const parsed = YAML.parse(raw) as AgentSpec
  if (parsed.agent.id !== agentId) {
    throw new Error(`Spec id mismatch: expected ${agentId}, got ${parsed.agent.id}`)
  }
  return parsed
}
```

**Step 4: Create Beki and Besa spec files**

Create `data/agents/beki/spec.yaml` and `data/agents/besa/spec.yaml` using the content from the beta simulation design doc (W.8 section).

**Step 5: Run test to verify it passes**

Run: `pnpm vitest run server/agent/__tests__/agent-spec.test.ts -v`
Expected: All PASS

**Step 6: Commit**

```bash
git add server/agent/agent-spec.ts server/agent/__tests__/agent-spec.test.ts data/agents/
git commit -m "feat: add agent spec YAML format and loader (W.8)"
```

---

### Task 7: Team Directory and Identity Resolution (W.13)

**Files:**
- Create: `server/agent/team-directory.ts` (loader + identity resolver)
- Create: `data/team/kirill.yaml`
- Create: `data/team/sasha.yaml`
- Create: `data/team/denis.yaml`
- Create: `data/team/beki.yaml`
- Create: `data/team/besa.yaml`
- Test: `server/agent/__tests__/team-directory.test.ts`
- Acceptance: `server/agent/__tests__/team-identity.acceptance.test.ts`

**Acceptance Criteria:**

```gherkin
Feature: Team directory resolves identities and injects context

  Scenario: Discord username resolves to known teammate
    Given a team directory with kirill (discord: "kirill_dev")
    When resolveIdentity is called with platform "discord", username "kirill_dev"
    Then the result is teammate "kirill" with is_human = true

  Scenario: Unknown Discord username returns undefined
    Given a team directory with 5 teammates
    When resolveIdentity is called with username "random_person_42"
    Then the result is undefined

  Scenario: GitLab identity resolves separately from Discord
    Given sasha has discord: "sasha_pm" and gitlab: "sasha"
    When resolveIdentity is called with platform "gitlab", username "sasha"
    Then the result is teammate "sasha"

  Scenario: Agents are distinguishable from humans
    Given the full team directory
    When filtering by is_human
    Then humans include kirill, sasha, denis
    And agents include beki, besa

  Scenario: Identity resolution sets trust level on AgentContext
    Given a Discord message from "kirill_dev"
    And the team directory resolves this to teammate kirill
    And the agent spec grants kirill trust level "full"
    When the tick processes this message
    Then AgentContext.sourceTrustLevel is set based on the agent spec trust config

  Scenario: Unknown sender gets trust "none"
    Given a Discord message from "stranger_42"
    And no team directory match exists
    When the tick processes this message
    Then AgentContext.sourceTrustLevel is "none"

  Scenario: Teammate description injected into context
    Given a message from teammate "sasha"
    When the context assembler runs
    Then the system prompt contains a "MESSAGE SENDER" section
    And the section includes "Project Manager"
    And the section includes "not technical"

  Scenario: All existing tick tests pass with team directory wired in
    When all tests in server/agent/__tests__/tick.test.ts run
    Then 0 tests fail (team directory mocked in existing tests)
```

**Step 1: Write failing tests for team directory**

```typescript
// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  loadTeamDirectory,
  resolveIdentity,
  type Teammate,
} from "../team-directory"

describe("Team Directory", () => {
  it("loads all teammates from directory", async () => {
    const team = await loadTeamDirectory("data/team/")
    expect(team.length).toBeGreaterThanOrEqual(5)
    expect(team.map((t) => t.id)).toContain("kirill")
    expect(team.map((t) => t.id)).toContain("beki")
  })

  it("resolves Discord identity to teammate", async () => {
    const team = await loadTeamDirectory("data/team/")
    const teammate = resolveIdentity(team, "discord", "kirill_dev")
    expect(teammate).toBeDefined()
    expect(teammate!.id).toBe("kirill")
    expect(teammate!.is_human).toBe(true)
  })

  it("returns undefined for unknown identity", async () => {
    const team = await loadTeamDirectory("data/team/")
    const teammate = resolveIdentity(team, "discord", "unknown_user_42")
    expect(teammate).toBeUndefined()
  })

  it("resolves GitLab identity", async () => {
    const team = await loadTeamDirectory("data/team/")
    const teammate = resolveIdentity(team, "gitlab", "sasha")
    expect(teammate).toBeDefined()
    expect(teammate!.id).toBe("sasha")
  })

  it("distinguishes humans from agents", async () => {
    const team = await loadTeamDirectory("data/team/")
    const humans = team.filter((t) => t.is_human)
    const agents = team.filter((t) => !t.is_human)
    expect(humans.length).toBeGreaterThanOrEqual(3)
    expect(agents.length).toBeGreaterThanOrEqual(2)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/agent/__tests__/team-directory.test.ts -v`
Expected: FAIL — module not found

**Step 3: Create Teammate type and loader**

Create `server/agent/team-directory.ts`:

```typescript
import { readFile } from "node:fs/promises"
import { glob } from "glob"
import YAML from "yaml"

export interface Teammate {
  id: string
  is_human: boolean
  identities: Record<string, string>
  description: string
}

export async function loadTeamDirectory(dirPath: string): Promise<Teammate[]> {
  const files = await glob("*.yaml", { cwd: dirPath, absolute: true })
  const teammates: Teammate[] = []
  for (const file of files) {
    const raw = await readFile(file, "utf-8")
    const parsed = YAML.parse(raw)
    teammates.push(parsed.teammate as Teammate)
  }
  return teammates
}

export function resolveIdentity(
  team: Teammate[],
  platform: string,
  username: string,
): Teammate | undefined {
  return team.find((t) => t.identities[platform] === username)
}
```

**Step 4: Create team YAML files**

Create `data/team/kirill.yaml`, `sasha.yaml`, `denis.yaml`, `beki.yaml`, `besa.yaml` using content from the teammate ontology design doc.

**Step 5: Run test to verify it passes**

Run: `pnpm vitest run server/agent/__tests__/team-directory.test.ts -v`
Expected: All PASS

**Step 6: Wire identity resolution into tick**

In `server/agent/tick.ts`, before homeostasis assessment:
- Load team directory (cache it — don't re-read YAML every tick)
- Resolve inbound message `from` field against team directory
- Set `sourceIdentity` and `sourceTrustLevel` on AgentContext from teammate profile
- If unknown sender, set trust to "none"

**Step 7: Wire teammate description into context assembler**

In `server/memory/context-assembler.ts`, add a new section (after IDENTITY, before OPERATIONAL CONTEXT):

```
=== MESSAGE SENDER ===
Teammate: {name} (id: {id}, {human|agent})
{description from YAML}
```

This section should be non-truncatable (priority 1) — the agent always needs to know who it's talking to.

**Step 8: Run tick tests**

Run: `pnpm vitest run server/agent/__tests__/tick.test.ts -v`
Expected: All PASS (may need to mock team directory in existing tests)

**Step 9: Commit**

```bash
git add server/agent/team-directory.ts server/agent/__tests__/team-directory.test.ts data/team/ server/agent/tick.ts server/memory/context-assembler.ts
git commit -m "feat: add team directory with identity resolution (W.13)"
```

---

## Phase 4: Behavior

### Task 8: Two-Level Task Routing (W.5)

**Files:**
- Modify: `server/agent/tick.ts` (routing logic)
- Test: `server/agent/__tests__/tick.test.ts`
- Acceptance: `server/agent/__tests__/tick-routing.acceptance.test.ts`

The tick already handles messages differently: `task_assignment` goes to work arc, others go to agent loop. W.5 makes this explicit — the LLM + homeostasis decides whether something is an interaction (single-tick, no TaskState) or a task (multi-tick, tracked).

**Acceptance Criteria:**

```gherkin
Feature: Two-level task model — interaction vs task

  Scenario: Quick question handled as interaction
    Given a Discord message "@Beki what auth library do we use?"
    And knowledge retrieval returns a relevant fact about Clerk
    When the tick processes this message
    Then the agent responds directly without creating a TaskState
    And homeostasis assessment shows knowledge_sufficiency: HEALTHY
    And the TickDecisionRecord routing.level is "interaction"

  Scenario: Work request creates a task
    Given a Discord message "@Beki implement user settings screen for #101"
    And the message type is "task_assignment"
    When the tick processes this message
    Then a TaskState is created with type "coding" and status "assigned"
    And the agent delegates to the coding adapter
    And the TickDecisionRecord routing.level is "task"

  Scenario: PM quick status check is an interaction
    Given a Discord message "@Besa is MR !42 merged?"
    When the tick processes this message
    Then the agent runs a tool call (glab)
    And responds with status without creating a TaskState
    And the TickDecisionRecord routing.level is "interaction"

  Scenario: PM research request creates a task
    Given a Discord message "@Besa research push notification options"
    When the tick processes this message
    Then a TaskState is created with type "research"

  Scenario: Task type inferred from message content
    Given messages with different content patterns:
      | content                              | expected_type    |
      | "implement settings screen #101"     | coding           |
      | "research auth options"              | research         |
      | "review MR !42"                      | review           |
      | "create sprint tasks"                | admin            |
      | "what's the status?"                 | (no task created) |
    When each message is processed
    Then tasks are created with the correct type (or not created for interactions)
```

**Step 1: Write failing tests for routing**

In `server/agent/__tests__/tick-routing.acceptance.test.ts`:

```typescript
it("handles quick question as interaction without TaskState", async () => {
  // Message: "what auth library do we use?"
  // knowledge_sufficiency should be HEALTHY after retrieval
  // → respond directly, no TaskState created
  const result = await tick("message", { /* quick question setup */ })
  expect(result.action).toBe("respond")
  expect(operationalCtx.tasks).toHaveLength(0)
})

it("creates TaskState for work request", async () => {
  // Message type: task_assignment, "implement settings screen #101"
  // → TaskState created, delegates to coding adapter
  const result = await tick("message", { /* task assignment setup */ })
  expect(result.action).toBe("delegate")
  expect(operationalCtx.tasks).toHaveLength(1)
  expect(operationalCtx.tasks[0].type).toBe("coding")
})
```

**Step 2: Run test to verify behavior**

Run: `pnpm vitest run server/agent/__tests__/tick.test.ts -t "handles quick question"`
Expected: verify current behavior — may already pass for the interaction case.

**Step 3: Implement explicit routing**

The current tick.ts has a hard check: `if (msg.messageType === "task_assignment" && codingAdapter)` → delegate. Refine this:

1. If `messageType === "task_assignment"` AND coding adapter available → create TaskState, delegate
2. If homeostasis `knowledge_sufficiency === "HEALTHY"` after retrieval → respond directly (interaction)
3. Otherwise → create TaskState with appropriate type, delegate

The type inference should use message content signals:
- Contains issue reference (#NNN) + action verb → `"coding"`
- Contains "research"/"compare"/"investigate" → `"research"`
- Contains "review"/"MR"/"!NNN" → `"review"`
- Contains "create issues"/"sprint"/"assign" → `"admin"`
- Default → `"communication"`

**Step 4: Run full tick tests**

Run: `pnpm vitest run server/agent/__tests__/tick.test.ts -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add server/agent/tick.ts server/agent/__tests__/tick.test.ts
git commit -m "feat: two-level task routing — interaction vs task (W.5)"
```

---

### Task 9: Session Resume Per Task (W.9)

**Files:**
- Modify: `server/agent/operational-memory.ts` (add claudeSessionId to TaskState)
- Modify: `server/agent/coding-adapter/work-arc.ts` (resume logic)
- Test: `server/agent/__tests__/operational-memory.test.ts`
- Test: `server/agent/coding-adapter/__tests__/work-arc-resume.test.ts`

**Acceptance Criteria:**

```gherkin
Feature: Session resume per task

  Scenario: Multi-tick task resumes session
    Given a TaskState in "implementing" phase with claudeSessionId "session-abc"
    When the next tick fires and delegates to coding adapter
    Then the coding adapter receives resumeSessionId "session-abc"
    And only the new prompt is sent (not full history)

  Scenario: Phase change invalidates session
    Given a TaskState transitioning from "exploring" to "implementing"
    When updateTaskPhase is called
    Then claudeSessionId is cleared (undefined)
    And the next tick starts a fresh session

  Scenario: Session resume failure falls back to fresh
    Given a TaskState with claudeSessionId "session-expired"
    When the coding adapter fails to resume (SDK error)
    Then claudeSessionId is cleared
    And a fresh session is started with full context
    And progress from carryover is included in the prompt

  Scenario: New task starts fresh session
    Given no existing TaskState
    When a new task is created and delegated
    Then the coding adapter receives no resumeSessionId
    And a fresh session is started

  Scenario: Session ID persists across tick saves
    Given a TaskState with claudeSessionId "session-abc"
    When the operational context is saved and reloaded
    Then claudeSessionId is still "session-abc"
```

**Step 1: Write failing test for session ID on TaskState**

```typescript
it("stores Claude Code session ID on task", async () => {
  let ctx = await addTask(defaultCtx(), {
    description: "Implement settings",
    source: makeMessage("implement"),
    type: "coding",
  })
  ctx = updateTaskSessionId(ctx, ctx.tasks[0].id, "session-abc-123")
  expect(ctx.tasks[0].claudeSessionId).toBe("session-abc-123")
})

it("clears session ID on phase change", async () => {
  let ctx = await addTask(defaultCtx(), {
    description: "Implement settings",
    source: makeMessage("implement"),
    type: "coding",
  })
  ctx = updateTaskSessionId(ctx, ctx.tasks[0].id, "session-abc-123")
  ctx = updateTaskPhase(ctx, ctx.tasks[0].id, "implementing")
  expect(ctx.tasks[0].claudeSessionId).toBeUndefined()
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/agent/__tests__/operational-memory.test.ts -t "stores Claude Code session"`
Expected: FAIL

**Step 3: Add claudeSessionId to TaskState**

```typescript
export interface TaskState {
  // ... existing fields
  claudeSessionId?: string
}
```

Add `updateTaskSessionId()` function. Modify `updateTaskPhase()` to clear `claudeSessionId` when phase changes.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/agent/__tests__/operational-memory.test.ts -v`
Expected: All PASS

**Step 5: Write failing test for work arc resume**

Create `server/agent/coding-adapter/__tests__/work-arc-resume.test.ts`:

```typescript
it("passes sessionId to adapter.query when resuming", async () => {
  const mockAdapter = createMockAdapter()
  const result = await executeWorkArc({
    adapter: mockAdapter,
    task: { id: "t1", description: "continue settings" },
    context: "...",
    workingDirectory: "/tmp",
    trustLevel: "high",
    resumeSessionId: "session-abc-123",
  })
  expect(mockAdapter.lastQueryOptions.sessionId).toBe("session-abc-123")
})

it("starts fresh session when no sessionId", async () => {
  const mockAdapter = createMockAdapter()
  const result = await executeWorkArc({
    adapter: mockAdapter,
    task: { id: "t1", description: "new task" },
    context: "...",
    workingDirectory: "/tmp",
    trustLevel: "high",
  })
  expect(mockAdapter.lastQueryOptions.sessionId).toBeUndefined()
})
```

**Step 6: Implement session resume in work arc**

In `server/agent/coding-adapter/work-arc.ts`, add `resumeSessionId?: string` to `WorkArcInput`. Pass it through to `adapter.query()` options. On `WorkArcResult`, return the session ID from the adapter response.

In `server/agent/coding-adapter/claude-code-adapter.ts`, pass `sessionId` to the Claude Code SDK `query()` call (the SDK supports session resume natively).

**Step 7: Wire resume in tick.ts**

In the task delegation path in `tick.ts`:
1. Check `activeTask.claudeSessionId`
2. Pass it as `resumeSessionId` to `executeWorkArc()`
3. On work arc completion, save returned session ID to TaskState

**Step 8: Run all coding adapter tests**

Run: `pnpm vitest run server/agent/coding-adapter/ -v`
Expected: All PASS

**Step 9: Commit**

```bash
git add server/agent/operational-memory.ts server/agent/__tests__/operational-memory.test.ts server/agent/coding-adapter/ server/agent/tick.ts
git commit -m "feat: session resume per task (W.9)"
```

---

## Phase 5: Observability

### Task 10: TickDecisionRecord Type and Persistence (W.12 backend)

**Files:**
- Create: `server/observation/tick-record.ts`
- Test: `server/observation/__tests__/tick-record.test.ts`

**Acceptance Criteria:**

```gherkin
Feature: TickDecisionRecord captures full causal chain

  Scenario: Record persists to JSONL
    Given a TickDecisionRecord with all fields populated
    When appendTickRecord is called
    Then the record is written as one JSON line to the file
    And readTickRecords returns the record with all fields intact

  Scenario: Multiple records append (not overwrite)
    Given 3 tick records appended sequentially
    When readTickRecords is called
    Then all 3 records are returned in order

  Scenario: Agent-specific file path
    Given agentId "beki"
    When getTickRecordPath("beki") is called
    Then the path is "data/observations/ticks/beki.jsonl"

  Scenario: Read with limit and offset
    Given 20 tick records in a file
    When readTickRecords is called with limit=5, offset=10
    Then exactly 5 records are returned starting from position 10

  Scenario: Record includes all required fields from design
    Given a TickDecisionRecord
    Then it has fields: tickId, agentId, timestamp, trigger, homeostasis,
         guidance, routing, execution, resources, outcome
    And trigger has type ("message" | "heartbeat" | "internal")
    And routing has level ("interaction" | "task")
    And execution has adapter ("claude-code" | "direct-response" | "none")
    And outcome has action ("respond" | "delegate" | "ask" | "idle" | "extract")
```

**Step 1: Write failing test for TickDecisionRecord**

```typescript
// @vitest-environment node
import { describe, expect, it, afterEach } from "vitest"
import { existsSync, rmSync } from "node:fs"
import {
  appendTickRecord,
  readTickRecords,
  type TickDecisionRecord,
} from "../tick-record"

const TEST_PATH = "/tmp/test-tick-records.jsonl"

afterEach(() => {
  if (existsSync(TEST_PATH)) rmSync(TEST_PATH)
})

describe("TickDecisionRecord", () => {
  it("appends and reads tick records", async () => {
    const record: TickDecisionRecord = {
      tickId: "tick-001",
      agentId: "beki",
      timestamp: new Date().toISOString(),
      trigger: { type: "message", source: "discord:sasha" },
      homeostasis: {
        knowledge_sufficiency: { state: "HEALTHY", method: "computed" },
      },
      guidance: [],
      routing: { level: "interaction", reasoning: "Quick question" },
      execution: {
        adapter: "direct-response",
        sessionResumed: false,
        toolCalls: 0,
        durationMs: 150,
      },
      resources: { inputTokens: 500, outputTokens: 100, subscriptionUsage5h: 12 },
      outcome: {
        action: "respond",
        response: "Yes, MR !42 was merged.",
        artifactsCreated: [],
        knowledgeEntriesCreated: 0,
      },
    }
    await appendTickRecord(record, TEST_PATH)
    const records = await readTickRecords(TEST_PATH)
    expect(records).toHaveLength(1)
    expect(records[0].tickId).toBe("tick-001")
    expect(records[0].routing.level).toBe("interaction")
  })

  it("reads records by agent ID from directory", async () => {
    // Tests the agentId-based file path pattern
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/observation/__tests__/tick-record.test.ts -v`
Expected: FAIL — module not found

**Step 3: Implement TickDecisionRecord type and persistence**

Create `server/observation/tick-record.ts` with:
- `TickDecisionRecord` interface (from the design doc)
- `appendTickRecord(record, filePath)` — JSONL append
- `readTickRecords(filePath, options?)` — read with optional limit/offset
- `getTickRecordPath(agentId)` — returns `data/observations/ticks/{agentId}.jsonl`

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/observation/__tests__/tick-record.test.ts -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add server/observation/tick-record.ts server/observation/__tests__/tick-record.test.ts
git commit -m "feat: TickDecisionRecord type and JSONL persistence (W.12)"
```

---

### Task 11: Wire TickDecisionRecord into Tick Loop (W.12)

**Files:**
- Modify: `server/agent/tick.ts`
- Test: `server/agent/__tests__/tick.test.ts`
- Acceptance: `server/observation/__tests__/tick-observability.acceptance.test.ts`

**Acceptance Criteria:**

```gherkin
Feature: Every tick produces an observable decision record

  Scenario: Message tick produces record with full chain
    Given a pending Discord message from "sasha"
    When the tick fires
    Then a TickDecisionRecord is appended to the agent's JSONL file
    And record.trigger.type is "message"
    And record.trigger.source contains "discord"
    And record.homeostasis contains all assessed dimensions
    And record.outcome.action matches the tick result action

  Scenario: Heartbeat tick produces record
    Given no pending messages
    When the heartbeat tick fires
    Then a TickDecisionRecord is appended
    And record.trigger.type is "heartbeat"
    And record.outcome.action is "idle"

  Scenario: Delegation tick captures execution details
    Given a task_assignment message that triggers coding adapter
    When the tick delegates to Claude Code
    Then record.execution.adapter is "claude-code"
    And record.execution.durationMs is > 0
    And record.routing.level is "task"
    And record.routing.taskType is "coding"

  Scenario: Record persistence never blocks tick
    Given the JSONL file is temporarily unwritable
    When a tick fires
    Then the tick completes normally
    And the response is still dispatched
    And an error is logged (not thrown)

  Scenario: tickId propagates as correlation key
    When a tick fires
    Then the TickDecisionRecord.tickId is a UUID
    And the same tickId appears in emitEvent calls during the tick
```

**Step 1: Write failing test**

```typescript
it("persists TickDecisionRecord on every tick", async () => {
  // Setup: message + homeostasis mock + agent spec
  const result = await tick("message")
  // After tick, a record should exist
  const records = await readTickRecords(getTickRecordPath("test-agent"))
  expect(records).toHaveLength(1)
  expect(records[0].trigger.type).toBe("message")
  expect(records[0].homeostasis).toBeDefined()
  expect(records[0].outcome.action).toBe(result.action)
})
```

**Step 2: Run test to verify it fails**

**Step 3: Implement — build record at tick end**

At the end of the `tick()` function, after all processing:
1. Construct `TickDecisionRecord` from:
   - `tickId`: generate UUID at tick start, propagate through
   - `trigger`: from tick source + message
   - `homeostasis`: from assessment result
   - `guidance`: from context assembly metadata
   - `routing`: from delegation decision
   - `execution`: from work arc result or agent loop result
   - `resources`: from token tracking
   - `outcome`: from tick result
2. Call `appendTickRecord(record, getTickRecordPath(agentId))`
3. This is fire-and-forget — never block tick on persistence failure

**Step 4: Run tests**

Run: `pnpm vitest run server/agent/__tests__/tick.test.ts -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add server/agent/tick.ts server/agent/__tests__/tick.test.ts
git commit -m "feat: wire TickDecisionRecord into tick loop (W.12)"
```

---

### Task 12: Fleet API Routes (W.12)

**Files:**
- Create: `server/routes/api/agent/fleet.get.ts`
- Create: `server/routes/api/agent/fleet/[agentId].get.ts`
- Create: `server/routes/api/agent/fleet/[agentId]/ticks.get.ts`

**Acceptance Criteria:**

```gherkin
Feature: Fleet API serves agent state for dashboard

  Scenario: Fleet overview returns all registered agents
    Given agents "beki" and "besa" have spec files in data/agents/
    When GET /api/agent/fleet is called
    Then response contains 2 agent summaries
    And each has id, name, role, health status

  Scenario: Agent detail returns spec + state + ticks
    Given agent "beki" has 10 tick records
    When GET /api/agent/fleet/beki is called
    Then response contains spec.agent.id = "beki"
    And response contains recentTicks with <= 50 entries
    And response contains operationalContext

  Scenario: Ticks endpoint supports pagination
    Given agent "beki" has 100 tick records
    When GET /api/agent/fleet/beki/ticks?limit=10&offset=20 is called
    Then response contains exactly 10 tick records
    And the first record is the 21st oldest

  Scenario: Unknown agent returns 404
    When GET /api/agent/fleet/nonexistent is called
    Then response status is 404

  Scenario: Fleet overview works with no tick history
    Given agent "beki" has no tick records yet
    When GET /api/agent/fleet is called
    Then response contains agent "beki" with health "unknown" and lastTick null
```

**Step 1: Create fleet overview endpoint**

`GET /api/agent/fleet` — returns list of agent summaries:
- Load all agent specs from `data/agents/*/spec.yaml`
- For each, load latest tick record + agent state
- Return: `{ agents: [{ id, name, role, health, currentActivity, lastTick, pendingMessages }] }`

**Step 2: Create agent detail endpoint**

`GET /api/agent/fleet/:agentId` — returns agent detail:
- Load agent spec + state + operational context
- Load last 50 tick records
- Return: `{ spec, state, operationalContext, recentTicks }`

**Step 3: Create ticks endpoint**

`GET /api/agent/fleet/:agentId/ticks` — returns tick records with pagination:
- Query params: `?limit=50&offset=0`
- Load from JSONL file, return slice

**Step 4: Test endpoints manually**

Run: `pnpm dev` then `curl localhost:13000/api/agent/fleet`
Expected: JSON response with agent summaries

**Step 5: Commit**

```bash
git add server/routes/api/agent/fleet*
git commit -m "feat: fleet API routes for agent overview and tick history (W.12)"
```

---

### Task 13: Fleet Dashboard UI (W.12)

**Files:**
- Create: `app/routes/agent/fleet/index.tsx` (fleet overview)
- Create: `app/routes/agent/fleet/$agentId.tsx` (agent detail with timeline)
- Create: `app/components/agent/AgentCard.tsx`
- Create: `app/components/agent/TickTimeline.tsx`
- Create: `app/components/agent/TickDetail.tsx`

**Acceptance Criteria:**

```gherkin
Feature: Fleet control dashboard

  Scenario: Fleet overview shows all agents
    Given agents "beki" and "besa" are registered
    When the operator opens /agent/fleet
    Then both agents appear as cards
    And each card shows name, role, and health traffic light
    And subscription usage bar is visible on each card

  Scenario: Agent card links to detail page
    Given agent "beki" card is visible
    When the operator clicks on Beki's card
    Then the browser navigates to /agent/fleet/beki
    And the agent detail page loads

  Scenario: Decision timeline shows recent ticks
    Given agent "beki" has processed 10 ticks
    When the operator views /agent/fleet/beki
    Then the decision timeline shows 10 entries
    And each entry shows trigger type, homeostasis dots, and action

  Scenario: Tick detail expands to show causal chain
    Given a tick where certainty_alignment was LOW and guidance fired "ask first"
    When the operator clicks to expand this tick
    Then the detail shows: trigger → homeostasis (all dims) → guidance → routing → execution → outcome
    And the causal chain explains why the agent asked instead of acting

  Scenario: Empty state renders without errors
    Given no agents have processed any ticks yet
    When the operator opens /agent/fleet
    Then each agent card shows "No activity yet"
    And no JavaScript errors occur

  Scenario: Fleet page is accessible from navigation
    When the operator is on any agent page
    Then a "Fleet" link is visible in the navigation
    And clicking it navigates to /agent/fleet
```

**Step 1: Create AgentCard component**

Shows: name, role, traffic-light health indicator, current activity, last tick time, subscription bar. Use existing homeostasis gauge pattern from `app/routes/agent/index.tsx`.

**Step 2: Create fleet overview page**

`/agent/fleet` — grid of AgentCards. Uses React Query to poll `GET /api/agent/fleet` every 5s.

**Step 3: Create TickTimeline component**

Vertical list of tick entries. Each shows: timestamp, trigger icon, homeostasis snapshot (colored dots), action taken, duration. Expandable to show full TickDetail.

**Step 4: Create TickDetail component**

Expanded view showing full causal chain: trigger → homeostasis (all 7 dims) → guidance → routing → execution → resources → outcome. Reference the design doc's "Level 3 — Tick Detail" section.

**Step 5: Create agent detail page**

`/agent/fleet/:agentId` — TickTimeline + active task panel + resources panel. Uses React Query to poll agent detail endpoint.

**Step 6: Add fleet link to navigation**

Add `/agent/fleet` to the main nav in the agent section.

**Step 7: Manual verification**

Run `pnpm dev`, navigate to `/agent/fleet`, verify layout renders. No agents will have data yet — that's OK, verify the empty state renders correctly.

**Step 8: Commit**

```bash
git add app/routes/agent/fleet/ app/components/agent/
git commit -m "feat: fleet control dashboard UI (W.12)"
```

---

## Phase 6: Knowledge Loop

### Task 14: Work-to-Knowledge Pipeline (W.10)

**Files:**
- Create: `server/memory/work-to-knowledge.ts`
- Test: `server/memory/__tests__/work-to-knowledge.test.ts`
- Acceptance: `server/memory/__tests__/work-to-knowledge.acceptance.test.ts`

**Acceptance Criteria:**

```gherkin
Feature: Work-to-knowledge pipeline

  Scenario: Completed coding task creates fact entry
    Given a TaskState with status "done" and 4 progress entries
    And artifacts include a branch and MR
    When createWorkKnowledge is called
    Then a "fact" entry is created
    And entry.content summarizes the completed work
    And entry.source is "task:{task-id}"
    And entry.about is {entity: agent-id, type: "agent"}
    And entry.confidence is 1

  Scenario: Research task creates fact with document reference
    Given a completed research task with a document artifact
    When createWorkKnowledge is called
    Then the fact entry mentions the document path

  Scenario: Task with no progress creates minimal entry
    Given a completed task with 0 progress entries
    When createWorkKnowledge is called
    Then a fact entry is still created
    And entry.content contains the task description

  Scenario: Work-to-knowledge entries are appended to store on task completion
    Given a task that transitions to status "done" during a tick
    When the tick completes
    Then new knowledge entries exist in the knowledge store
    And entries have source matching "task:{task-id}"

  Scenario: Entities extracted from task content
    Given a task with description "Implement user settings screen"
    And artifacts referencing MR !45
    When createWorkKnowledge is called
    Then entry.entities includes relevant terms (e.g., "settings", "MR !45")
```

**Step 1: Write failing test**

```typescript
// @vitest-environment node
import { describe, expect, it } from "vitest"
import { createWorkKnowledge } from "../work-to-knowledge"
import type { TaskState } from "../../agent/operational-memory"

describe("Work-to-Knowledge", () => {
  it("creates fact entry from completed task", () => {
    const task: TaskState = {
      id: "task-123",
      description: "Implement user settings screen",
      type: "coding",
      status: "done",
      phase: "verifying",
      progress: [
        "Created branch feature/user-settings",
        "Implemented settings screen with NativeWind",
        "Added unit tests",
        "Created MR !45",
      ],
      artifacts: [
        { type: "branch", description: "feature/user-settings" },
        { type: "mr", url: "https://gitlab.example.com/-/merge_requests/45", description: "Settings screen" },
      ],
      // ... other fields
    }
    const entries = createWorkKnowledge(task, "beki")
    expect(entries.length).toBeGreaterThanOrEqual(1)
    const fact = entries.find((e) => e.type === "fact")
    expect(fact).toBeDefined()
    expect(fact!.content).toContain("settings")
    expect(fact!.source).toBe("task:task-123")
    expect(fact!.about).toEqual({ entity: "beki", type: "agent" })
  })
})
```

**Step 2: Run test to verify it fails**

**Step 3: Implement createWorkKnowledge**

```typescript
import type { KnowledgeEntry } from "./types"
import type { TaskState } from "../agent/operational-memory"

export function createWorkKnowledge(
  task: TaskState,
  agentId: string,
): KnowledgeEntry[] {
  const entries: KnowledgeEntry[] = []

  // Fact: what was completed
  entries.push({
    id: `work-${task.id}-fact`,
    type: "fact",
    content: `Completed ${task.type} task: ${task.description}. ${summarizeProgress(task.progress)}`,
    confidence: 1,
    entities: extractEntities(task),
    source: `task:${task.id}`,
    extractedAt: new Date().toISOString(),
    about: { entity: agentId, type: "agent" },
  })

  return entries
}
```

**Step 4: Run test to verify it passes**

**Step 5: Wire into tick.ts task completion path**

After `completeTask()` in tick.ts, call `createWorkKnowledge()` and append entries to the knowledge store.

**Step 6: Run full test suite**

Run: `pnpm vitest run server/ -v`
Expected: All PASS

**Step 7: Commit**

```bash
git add server/memory/work-to-knowledge.ts server/memory/__tests__/work-to-knowledge.test.ts server/agent/tick.ts
git commit -m "feat: work-to-knowledge pipeline (W.10)"
```

---

### Task 15: GitLab via glab CLI Context (W.11)

**Files:**
- Modify: `data/agents/beki/spec.yaml`
- Modify: `data/agents/besa/spec.yaml`
- Modify: `server/memory/context-assembler.ts`

**Acceptance Criteria:**

```gherkin
Feature: Agent knows about glab CLI availability

  Scenario: Tools context appears in assembled system prompt
    Given agent spec has tools_context mentioning glab commands
    When the context assembler runs for this agent
    Then the system prompt contains "glab issue list"
    And the system prompt contains "glab mr create"

  Scenario: Agent without tools_context skips the section
    Given agent spec has no tools_context field
    When the context assembler runs
    Then the system prompt does not contain a tools context section

  Scenario: Both Beki and Besa specs include glab context
    When loading data/agents/beki/spec.yaml
    Then tools_context mentions glab
    When loading data/agents/besa/spec.yaml
    Then tools_context mentions glab
```

**Step 1: Add tools_context to agent specs**

Add the `tools_context` field to both Beki and Besa specs (content from the design doc W.11 section).

**Step 2: Wire tools_context into context assembler**

When assembling context, if the agent spec has `tools_context`, include it as a section (after TOOL DEFINITIONS, priority 5 — truncatable).

**Step 3: Run context assembler tests**

Run: `pnpm vitest run server/memory/__tests__/ -v`
Expected: All PASS

**Step 4: Commit**

```bash
git add data/agents/ server/memory/context-assembler.ts
git commit -m "feat: inject glab CLI context from agent spec (W.11)"
```

---

## Phase 7: Validation

### Task 16: End-to-End Validation (Traces 12-16)

**Files:**
- Create: `docs/guides/beta-simulation-validation.md`
- Create: `scripts/run-trace.ts` (optional: scriptable trace runner)

**Acceptance Criteria:**

These are the end-to-end acceptance tests for the entire beta simulation. Each maps to a reference trace from the design doc. They validate the full chain: Discord → tick → homeostasis → routing → execution → response → knowledge.

```gherkin
Feature: Beki/Besa end-to-end validation (Traces 12-16)

  Scenario: Trace 12 — PM assigns research task to Besa
    Given Besa is running and connected to Discord
    When Sasha sends "@Besa research auth options for the mobile app"
    Then Besa creates a TaskState with type "research"
    And Besa delegates to Claude Code with web search tools
    And a document artifact is created (docs/research/*.md)
    And Besa responds in Discord with a summary
    And a TickDecisionRecord shows routing.level = "task", routing.taskType = "research"
    And a work-to-knowledge entry is created with source "task:{id}"

  Scenario: Trace 13 — PM creates sprint tasks via Besa
    Given Besa is running
    When Sasha sends "@Besa create tasks for sprint 12: settings, notifications, dark mode. Assign to Beki."
    Then Besa creates a TaskState with type "admin"
    And Besa runs glab issue create commands
    And 3 issue artifacts are created with GitLab URLs
    And Besa responds with issue numbers

  Scenario: Trace 14 — Quick status check is interaction, not task
    Given Besa is running
    When Sasha sends "@Besa is MR !42 merged?"
    Then Besa responds within a single tick
    And no TaskState is created
    And the TickDecisionRecord routing.level is "interaction"

  Scenario: Trace 15 — Mid-task scope change
    Given Beki is working on task #101 with claudeSessionId "session-X"
    When Sasha sends "@Beki also needs dark mode toggle"
    Then Beki's existing TaskState is updated (scope appended)
    And claudeSessionId is cleared (requirements changed)
    And a new Claude Code session starts with carryover from previous work

  Scenario: Trace 16 — Besa reviews Beki's MR
    Given Beki has created MR !42
    When Sasha sends "@Besa review Beki's MR !42"
    Then Besa creates a TaskState with type "review"
    And Besa reads the MR diff via glab
    And Besa posts a comment on the MR
    And a comment artifact is created
    And Besa responds in Discord summarizing the review

  Scenario: Fleet dashboard shows both agents after traces
    Given Traces 12-16 have been executed
    When the operator opens /agent/fleet
    Then both Beki and Besa show recent activity
    And drilling into any tick shows the full causal chain
    And subscription usage bars reflect token consumption
```

Write a step-by-step guide for running the Beki/Besa validation:

1. **Prerequisites**: Docker running (FalkorDB), Discord bot token configured, Claude Code API key set, glab CLI authenticated
2. **Start services**: `docker compose up -d`, `pnpm dev`
3. **Verify fleet dashboard**: Navigate to `localhost:13000/agent/fleet`, confirm both agents appear
4. **Run Trace 12** (PM assigns research task to Besa): Send Discord message, verify task created, check response
5. **Run Trace 13** (PM creates sprint tasks via Besa): Send message, verify GitLab issues created
6. **Run Trace 14** (Quick status check — interaction): Send message, verify no TaskState created
7. **Run Trace 15** (Mid-task scope change): Send message, verify session resume, then scope change clears session
8. **Run Trace 16** (Besa reviews Beki's work): Send message, verify MR comment posted
9. **Check observability**: Open fleet dashboard, drill into tick timeline, verify causal chain
10. **Check knowledge loop**: After task completion, verify work-to-knowledge entries in knowledge store

**Step 1: Write the guide**

**Step 2: Commit**

```bash
git add docs/guides/beta-simulation-validation.md
git commit -m "docs: beta simulation validation guide"
```

---

## Summary

| Task | W# | Phase | Depends On | Est. Complexity |
|------|-----|-------|------------|-----------------|
| 1. Fix confabulation guard | W.4 | 1 | — | Small |
| 2. Skip DB-dependent tests | W.4 | 1 | — | Small |
| 3. Fix ARCHITECTURE.md | W.3 | 1 | — | Small |
| 4. TaskState type field | W.6 | 2 | — | Small |
| 5. Structured Artifact type | W.7 | 2 | — | Medium |
| 6. Agent spec format | W.8 | 3 | — | Medium |
| 7. Team directory + identity | W.13 | 3 | — | Medium |
| 8. Two-level task routing | W.5 | 4 | T4 | Medium |
| 9. Session resume per task | W.9 | 4 | T6 | Medium |
| 10. TickDecisionRecord type | W.12 | 5 | — | Small |
| 11. Wire record into tick | W.12 | 5 | T10 | Medium |
| 12. Fleet API routes | W.12 | 5 | T10, T6 | Medium |
| 13. Fleet dashboard UI | W.12 | 5 | T12 | Large |
| 14. Work-to-knowledge | W.10 | 6 | T5 | Medium |
| 15. glab CLI context | W.11 | 6 | T6 | Small |
| 16. Validation guide | — | 7 | All | Small |

**Total: 16 tasks across 7 phases. 76 Gherkin acceptance scenarios.**

---

*Created: 2026-03-12*
*Source: Beta simulation design doc (2026-03-11)*
*W.1 and W.2 confirmed already wired — excluded from plan*
