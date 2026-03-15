# Agent Work Lifecycle — Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the 6-phase agent work lifecycle (BEGIN→DO→VERIFY→PUBLISH→REPORT→FINISH) with priority queue, reflection, and pipeline-enforced verification.

**Architecture:** Add `workflow_instructions` to agent specs, inject them + a SELF-AWARENESS section via context-assembler. Replace FIFO message queue with priority-sorted selection in tick.ts. Add VERIFY + FINISH pipeline stages after work arcs.

**Tech Stack:** TypeScript, YAML config, vitest for tests

---

### Task 1: Add `workflow_instructions` to Agent Specs

**Files:**
- Modify: `data/agents/beki/spec.yaml`
- Modify: `data/agents/besa/spec.yaml`
- Modify: `server/agent/agent-spec.ts:6-28`

**Step 1: Add `workflow_instructions` to the `AgentSpec` interface**

In `server/agent/agent-spec.ts`, add the optional field after `tools_context`:

```typescript
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
    identities: Array<{
      entity: string
      level: "full" | "high" | "medium" | "none"
    }>
    channels: Record<string, "full" | "high" | "medium" | "none">
    default_identity_trust: "full" | "high" | "medium" | "none"
  }
  knowledge_store: string
  operational_memory: string
  tools_context?: string
  workflow_instructions?: string
}
```

**Step 2: Add workflow_instructions to Beki's spec**

Append to `data/agents/beki/spec.yaml` after `tools_context`:

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

**Step 3: Add workflow_instructions to Besa's spec**

Append to `data/agents/besa/spec.yaml` after `tools_context`:

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

**Step 4: Commit**

```bash
git add server/agent/agent-spec.ts data/agents/beki/spec.yaml data/agents/besa/spec.yaml
git commit -m "feat: add workflow_instructions to agent specs"
```

---

### Task 2: Inject workflow_instructions + SELF-AWARENESS into Context Assembler

**Files:**
- Modify: `server/memory/context-assembler.ts:15-22,86-100`
- Modify: `server/agent/tick.ts:271-275`

**Step 1: Add `workflowInstructions` to AssembleOptions**

In `server/memory/context-assembler.ts`, add the new field to `AssembleOptions`:

```typescript
interface AssembleOptions {
  storePath?: string
  tokenBudget?: number
  agentContext?: AgentContext
  retrievedEntries?: KnowledgeEntry[]
  operationalSummary?: string
  conversationHistory?: Array<{ role: string; content: string }>
  toolDefinitions?: string
  workflowInstructions?: string
  homeostasisState?: Record<string, string>
}
```

**Step 2: Add WORKFLOW INSTRUCTIONS section after CONSTRAINTS**

After the CONSTRAINTS section (line 71), add:

```typescript
  // 3b. WORKFLOW INSTRUCTIONS — from agent spec (never truncated)
  if (options.workflowInstructions) {
    sections.push({
      name: "WORKFLOW",
      content: options.workflowInstructions,
      priority: 0, // Same as constraints — never truncated
      truncatable: false,
    })
  }
```

**Step 3: Add SELF-AWARENESS section**

After the homeostasis guidance block (line 100), add the always-present self-awareness section:

```typescript
  // 5b. SELF-AWARENESS — always show current homeostasis state
  if (options.homeostasisState) {
    const stateLines = Object.entries(options.homeostasisState)
      .filter(([k]) => k !== "assessed_at" && k !== "assessment_method")
      .map(([dim, state]) => {
        const label = dim.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        return `- **${label}**: ${state}`
      })
      .join("\n")

    sections.push({
      name: "SELF-AWARENESS",
      content: `Your current homeostasis state:\n${stateLines}\n\nWhen asked about your state, explain each dimension honestly. If a dimension is LOW or HIGH, explain what might be causing it and what you plan to do about it.`,
      priority: 0,
      truncatable: false,
    })
  }
```

**Step 4: Pass workflow_instructions and homeostasis state from tick.ts**

In `server/agent/tick.ts`, modify the `assembleContext` call (around line 271):

```typescript
    const homeostasis = assessDimensions(agentContext)
    const homeostasisForContext: Record<string, string> = {}
    for (const [k, v] of Object.entries(homeostasis)) {
      if (k !== "assessed_at" && k !== "assessment_method") {
        homeostasisForContext[k] = v as string
      }
    }
    const context = await assembleContext({
      storePath,
      agentContext,
      retrievedEntries: facts.entries,
      workflowInstructions: spec?.workflow_instructions,
      homeostasisState: homeostasisForContext,
    })
```

This requires the `spec` variable to be available at this point. Currently the spec is loaded but only `toolsContext` and `specTrust` are extracted. Change the spec loading block (lines 213-222) to keep the full spec:

```typescript
  // Load agent spec for tools_context + trust config + workflow
  let spec: AgentSpec | undefined
  let toolsContext: string | undefined
  let specTrust: AgentSpec["trust"] | undefined
  try {
    spec = await loadAgentSpec(agentId)
    toolsContext = spec.tools_context
    specTrust = spec.trust
  } catch {
    // Agent spec not found — not critical
  }
```

**Step 5: Commit**

```bash
git add server/memory/context-assembler.ts server/agent/tick.ts
git commit -m "feat: inject workflow_instructions and SELF-AWARENESS into agent context"
```

---

### Task 3: Implement Priority Queue

**Files:**
- Modify: `server/agent/tick.ts:226-230`
- Test: `server/agent/__tests__/priority-queue.test.ts`

**Step 1: Write the failing test**

Create `server/agent/__tests__/priority-queue.test.ts`:

```typescript
// @vitest-environment node
import { describe, expect, it } from "vitest"
import { pickNextMessage } from "../tick"
import type { ChannelMessage } from "../types"

function makeMsg(
  messageType: ChannelMessage["messageType"],
  content = "test",
  receivedAt = new Date().toISOString(),
): ChannelMessage {
  return {
    id: `msg-${Math.random()}`,
    channel: "discord",
    direction: "inbound",
    from: "kirill",
    content,
    messageType,
    receivedAt,
    metadata: {},
  }
}

describe("pickNextMessage", () => {
  it("picks chat before task_assignment", () => {
    const task = makeMsg("task_assignment", "implement X")
    const chat = makeMsg("chat", "quick question")
    expect(pickNextMessage([task, chat])).toBe(chat)
  })

  it("picks greeting before task_assignment", () => {
    const task = makeMsg("task_assignment", "implement X")
    const greeting = makeMsg("greeting", "hello")
    expect(pickNextMessage([task, greeting])).toBe(greeting)
  })

  it("picks task_assignment before status_update", () => {
    const status = makeMsg("status_update", "done")
    const task = makeMsg("task_assignment", "implement X")
    expect(pickNextMessage([status, task])).toBe(task)
  })

  it("preserves FIFO within same priority", () => {
    const first = makeMsg("chat", "first")
    const second = makeMsg("chat", "second")
    expect(pickNextMessage([first, second])).toBe(first)
  })

  it("returns the only message when queue has one item", () => {
    const msg = makeMsg("chat", "only one")
    expect(pickNextMessage([msg])).toBe(msg)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run server/agent/__tests__/priority-queue.test.ts
```

Expected: FAIL — `pickNextMessage` is not exported from `../tick`

**Step 3: Add `pickNextMessage` to tick.ts**

After the `getAdapterTimeout` function (around line 61), add:

```typescript
// ---------------------------------------------------------------------------
// Priority queue — process higher-priority messages first
// ---------------------------------------------------------------------------

const MESSAGE_PRIORITY: Record<string, number> = {
  admin: 0,
  chat: 1,
  greeting: 1,
  task_assignment: 2,
  review_comment: 2,
  status_update: 3,
}

export function pickNextMessage(pending: ChannelMessage[]): ChannelMessage {
  return pending.reduce((best, msg) => {
    const bestPri = MESSAGE_PRIORITY[best.messageType] ?? 1
    const msgPri = MESSAGE_PRIORITY[msg.messageType] ?? 1
    return msgPri < bestPri ? msg : best
  })
}
```

**Step 4: Replace `pending[0]` with `pickNextMessage(pending)`**

In tick.ts, change the message selection (around line 230):

```typescript
  // Stage 3: Decide what to act on
  if (pending.length > 0) {
    const msg = pickNextMessage(pending) // priority-sorted
```

**Step 5: Run test to verify it passes**

```bash
pnpm vitest run server/agent/__tests__/priority-queue.test.ts
```

Expected: PASS — all 5 tests green

**Step 6: Commit**

```bash
git add server/agent/tick.ts server/agent/__tests__/priority-queue.test.ts
git commit -m "feat: priority queue for agent message processing"
```

---

### Task 4: Add `formatHomeostasisState` to Homeostasis Engine

**Files:**
- Modify: `server/engine/homeostasis-engine.ts`
- Test: `server/engine/__tests__/homeostasis-format.test.ts`

**Step 1: Write the failing test**

Create `server/engine/__tests__/homeostasis-format.test.ts`:

```typescript
// @vitest-environment node
import { describe, expect, it } from "vitest"
import { formatHomeostasisState } from "../homeostasis-engine"
import type { HomeostasisState } from "../types"

const healthyState: HomeostasisState = {
  knowledge_sufficiency: "HEALTHY",
  certainty_alignment: "HEALTHY",
  progress_momentum: "HEALTHY",
  communication_health: "HEALTHY",
  productive_engagement: "HEALTHY",
  knowledge_application: "HEALTHY",
  self_preservation: "HEALTHY",
  assessed_at: new Date(),
  assessment_method: {
    knowledge_sufficiency: "computed",
    certainty_alignment: "computed",
    progress_momentum: "computed",
    communication_health: "computed",
    productive_engagement: "computed",
    knowledge_application: "computed",
    self_preservation: "computed",
  },
}

describe("formatHomeostasisState", () => {
  it("formats all-healthy state", () => {
    const result = formatHomeostasisState(healthyState)
    expect(result).toContain("Knowledge Sufficiency")
    expect(result).toContain("HEALTHY")
    expect(result).not.toContain("assessed_at")
    expect(result).not.toContain("assessment_method")
  })

  it("includes imbalanced dimensions", () => {
    const state = { ...healthyState, knowledge_sufficiency: "LOW" as const }
    const result = formatHomeostasisState(state)
    expect(result).toContain("LOW")
    expect(result).toContain("Knowledge Sufficiency")
  })

  it("returns 7 dimension lines", () => {
    const result = formatHomeostasisState(healthyState)
    const dimensionLines = result
      .split("\n")
      .filter((l) => l.startsWith("- **"))
    expect(dimensionLines).toHaveLength(7)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run server/engine/__tests__/homeostasis-format.test.ts
```

Expected: FAIL — `formatHomeostasisState` is not exported

**Step 3: Add `formatHomeostasisState` to homeostasis-engine.ts**

Add before the `getGuidance` function (around line 560):

```typescript
// ---------------------------------------------------------------------------
// Format homeostasis state for agent self-awareness
// ---------------------------------------------------------------------------

const DIMENSION_LABELS: Record<string, string> = {
  knowledge_sufficiency: "Knowledge Sufficiency",
  certainty_alignment: "Certainty Alignment",
  progress_momentum: "Progress Momentum",
  communication_health: "Communication Health",
  productive_engagement: "Productive Engagement",
  knowledge_application: "Knowledge Application",
  self_preservation: "Self Preservation",
}

export function formatHomeostasisState(state: HomeostasisState): string {
  return Object.entries(state)
    .filter(([k]) => k !== "assessed_at" && k !== "assessment_method")
    .map(([dim, val]) => {
      const label = DIMENSION_LABELS[dim] ?? dim
      return `- **${label}**: ${val}`
    })
    .join("\n")
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm vitest run server/engine/__tests__/homeostasis-format.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add server/engine/homeostasis-engine.ts server/engine/__tests__/homeostasis-format.test.ts
git commit -m "feat: add formatHomeostasisState for agent self-awareness"
```

---

### Task 5: Add VERIFY Stage to Tick Pipeline

**Files:**
- Modify: `server/agent/tick.ts:310-434` (after work arc, before return)

**Step 1: Add verification work arc after DO phase**

In `server/agent/tick.ts`, after the existing `executeWorkArc` call and task status update block (after line 348, before the status text construction at line 350), add the VERIFY stage:

```typescript
      // ---------------------------------------------------------------
      // VERIFY phase — pipeline-enforced verification for coding tasks
      // ---------------------------------------------------------------
      if (arcResult.status === "completed" && routing.taskType === "coding") {
        try {
          const { execSync } = await import("node:child_process")
          const diffStat = (() => {
            try {
              return execSync("git diff --stat HEAD~1", {
                cwd: workDir,
                encoding: "utf-8",
                timeout: 5000,
              }).trim()
            } catch {
              return "(no recent commits to diff)"
            }
          })()
          const recentCommits = (() => {
            try {
              return execSync("git log --oneline -3", {
                cwd: workDir,
                encoding: "utf-8",
                timeout: 5000,
              }).trim()
            } catch {
              return "(no commits)"
            }
          })()

          const verifyPrompt = [
            "A coding task was just completed. Verify the work before it ships.",
            "",
            "## Original Task",
            taskDescription,
            "",
            "## What Was Done",
            diffStat,
            "",
            "## Recent Commits",
            recentCommits,
            "",
            "## Verification Checklist",
            "1. Run tests: pnpm vitest run — do they pass?",
            "2. Run linter: pnpm biome check — any violations?",
            "3. Review the diff: does it match what was asked?",
            "4. Check for uncommitted changes: stage and commit if needed",
            "5. If any issues found, fix them and commit the fix",
            "",
            "Use /verification-before-completion to structure your check.",
            "Report what you found and what you fixed.",
          ].join("\n")

          const verifyResult = await executeWorkArc({
            adapter,
            task: { id: `verify-${task.id}`, description: verifyPrompt },
            context: workContext,
            workingDirectory: workDir,
            trustLevel: (agentContext.sourceTrustLevel ?? "MEDIUM") as TrustLevel,
            model: (msg.metadata?.modelOverride as string) || config.model,
            timeout: getAdapterTimeout("review"),
          })

          console.log(
            `[tick] VERIFY phase: ${verifyResult.status} (${verifyResult.durationMs}ms)`,
          )
        } catch (err) {
          console.warn("[tick] VERIFY phase failed:", (err as Error).message)
        }
      }
```

**Step 2: Commit**

```bash
git add server/agent/tick.ts
git commit -m "feat: add pipeline-enforced VERIFY stage after coding work arcs"
```

---

### Task 6: Add FINISH Stage (Commit Guarantee)

**Files:**
- Modify: `server/agent/tick.ts` (after VERIFY, before tick record)

**Step 1: Add FINISH stage after VERIFY**

After the VERIFY block and before the status text construction, add:

```typescript
      // ---------------------------------------------------------------
      // FINISH phase — ensure all changes are committed
      // ---------------------------------------------------------------
      if (arcResult.status === "completed") {
        try {
          const { execSync } = await import("node:child_process")
          const gitStatus = execSync("git status --porcelain", {
            cwd: workDir,
            encoding: "utf-8",
            timeout: 5000,
          }).trim()

          if (gitStatus.length > 0) {
            console.log("[tick] FINISH phase: uncommitted changes detected, running commit arc")
            await executeWorkArc({
              adapter,
              task: {
                id: `finish-${task.id}`,
                description:
                  "You have uncommitted changes. Stage relevant files and commit with a conventional commit message (feat:, fix:, docs:, etc.).",
              },
              context: workContext,
              workingDirectory: workDir,
              trustLevel: (agentContext.sourceTrustLevel ?? "MEDIUM") as TrustLevel,
              model: (msg.metadata?.modelOverride as string) || config.model,
              timeout: 30_000,
            })
          }
        } catch (err) {
          console.warn("[tick] FINISH phase failed:", (err as Error).message)
        }
      }
```

**Step 2: Commit**

```bash
git add server/agent/tick.ts
git commit -m "feat: add FINISH stage — guaranteed commit after work arcs"
```

---

### Task 7: Integration Smoke Test

**Files:**
- No new files — run existing scenarios to verify nothing is broken

**Step 1: Run a fast scenario to verify the pipeline works**

```bash
pnpm vitest run server/agent/__tests__/priority-queue.test.ts server/engine/__tests__/homeostasis-format.test.ts
```

Expected: All unit tests pass

**Step 2: Run L96 reflection scenario**

```bash
pnpm tsx scripts/run-scenario.ts scenarios/level-96-reflection-homeostasis.yaml
```

Expected: PASS — Beki responds with dimension-aware state

**Step 3: Run a dogfood scenario to test VERIFY + FINISH**

```bash
pnpm tsx scripts/run-scenario.ts scenarios/level-95-verification-catches-bug.yaml
```

Expected: PASS — Beki implements + verification runs + commit guaranteed

**Step 4: Final commit**

```bash
git push
```
