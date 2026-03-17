# Agent Config Isolation & Escalation Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give agents their own Claude Code config (skills/plugins) via `CLAUDE_CONFIG_DIR`, and wire an escalation mechanism so agents can signal "I need human help" from inside a Claude Code session, with the tick loop catching it and routing it through the channel layer.

**Architecture:** Two independent workstreams. (A) Set `CLAUDE_CONFIG_DIR` per-agent in the adapter's clean env, falling back to a shared agents dir for now (Option 1) with per-agent dirs later (Option 3). (B) Create an escalation skill that writes a structured JSON file; after `executeWorkArc()` returns, the tick loop checks for escalation files and dispatches them as messages to the appropriate human via the existing channel dispatcher.

**Tech Stack:** TypeScript, Claude Agent SDK, YAML agent specs, Vitest 4, existing channel dispatcher

---

## Workstream A: CLAUDE_CONFIG_DIR for Agents

### Task A1: Add `claude_config_dir` to AgentSpec

**Files:**
- Modify: `server/agent/agent-spec.ts:14-40` (AgentSpec interface)
- Modify: `data/agents/beki/spec.yaml`
- Modify: `data/agents/besa/spec.yaml`

**Step 1: Write the failing test**

Create test file `server/agent/__tests__/agent-config-dir.test.ts`:

```typescript
// @vitest-environment node
import { describe, expect, it } from "vitest"
import { loadAgentSpec } from "../agent-spec"

describe("agent config dir", () => {
  it("loads claude_config_dir from beki spec", async () => {
    const spec = await loadAgentSpec("beki")
    expect(spec.claude_config_dir).toBeDefined()
    expect(typeof spec.claude_config_dir).toBe("string")
  })

  it("loads claude_config_dir from besa spec", async () => {
    const spec = await loadAgentSpec("besa")
    expect(spec.claude_config_dir).toBeDefined()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/agent/__tests__/agent-config-dir.test.ts`
Expected: FAIL — `spec.claude_config_dir` is `undefined`

**Step 3: Add field to AgentSpec interface and agent YAML files**

In `server/agent/agent-spec.ts`, add to the `AgentSpec` interface:

```typescript
  claude_config_dir?: string
```

In `data/agents/beki/spec.yaml`, add at the top level (alongside `workspace`):

```yaml
claude_config_dir: "/home/newub/.claude-agents"
```

In `data/agents/besa/spec.yaml`, same:

```yaml
claude_config_dir: "/home/newub/.claude-agents"
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/agent/__tests__/agent-config-dir.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/agent/agent-spec.ts server/agent/__tests__/agent-config-dir.test.ts data/agents/beki/spec.yaml data/agents/besa/spec.yaml
git commit -m "feat: add claude_config_dir to agent spec"
```

---

### Task A2: Pass CLAUDE_CONFIG_DIR from spec into adapter env

**Files:**
- Modify: `server/agent/coding-adapter/claude-code-adapter.ts:29-38` (getCleanEnv)
- Modify: `server/agent/tick.ts` (where secrets are loaded, ~lines 393-400)

**Step 1: Write the failing test**

Add to `server/agent/__tests__/agent-config-dir.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

describe("CLAUDE_CONFIG_DIR env injection", () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("process.env.CLAUDE_CONFIG_DIR is set before adapter runs", () => {
    // The tick pipeline sets process.env.CLAUDE_CONFIG_DIR from spec
    // Then getCleanEnv() picks it up via INHERITED_ENV_VARS
    process.env.CLAUDE_CONFIG_DIR = "/home/newub/.claude-agents"

    // getCleanEnv is not exported, but CLAUDE_CONFIG_DIR is already in
    // INHERITED_ENV_VARS (line 23 of claude-code-adapter.ts).
    // This test verifies the tick pipeline sets it correctly.
    expect(process.env.CLAUDE_CONFIG_DIR).toBe("/home/newub/.claude-agents")
  })
})
```

**Step 2: Implement the env injection in tick.ts**

In `server/agent/tick.ts`, after the secrets loading block (around line 400, after `process.env.GIT_CONFIG_NOSYSTEM = "1"`), add:

```typescript
      // Set agent-specific Claude config directory (skills, plugins, settings)
      const prevClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR ?? null
      if (spec?.claude_config_dir) {
        process.env.CLAUDE_CONFIG_DIR = spec.claude_config_dir
      }
```

In the CLEANUP section (around line 547, after GITLAB_TOKEN restore), add:

```typescript
      // Restore CLAUDE_CONFIG_DIR
      if (prevClaudeConfigDir) {
        process.env.CLAUDE_CONFIG_DIR = prevClaudeConfigDir
      } else {
        delete process.env.CLAUDE_CONFIG_DIR
      }
```

**Step 3: Run tests**

Run: `pnpm vitest run server/agent/__tests__/agent-config-dir.test.ts`
Expected: PASS

**Step 4: Verify `CLAUDE_CONFIG_DIR` is already in INHERITED_ENV_VARS**

Confirm line 23 of `server/agent/coding-adapter/claude-code-adapter.ts`:
```typescript
  "CLAUDE_CONFIG_DIR",
```
This is already there — no change needed in the adapter itself.

**Step 5: Commit**

```bash
git add server/agent/tick.ts server/agent/__tests__/agent-config-dir.test.ts
git commit -m "feat: inject CLAUDE_CONFIG_DIR from agent spec into adapter env"
```

---

### Task A3: Create the ~/.claude-agents directory structure

This is a manual/scripted setup task. Create a setup script that can be run once.

**Files:**
- Create: `scripts/setup-agent-config.sh`

**Step 1: Write the script**

```bash
#!/usr/bin/env bash
# Setup agent-specific Claude Code config directory
# This installs the "agents" branch of superpowers for agent use
set -euo pipefail

AGENTS_CONFIG_DIR="${1:-$HOME/.claude-agents}"

echo "Setting up agent Claude config at: $AGENTS_CONFIG_DIR"

mkdir -p "$AGENTS_CONFIG_DIR/plugins/marketplaces"
mkdir -p "$AGENTS_CONFIG_DIR/plugins/cache"
mkdir -p "$AGENTS_CONFIG_DIR/skills"

# Create settings.json with agent plugins enabled
cat > "$AGENTS_CONFIG_DIR/settings.json" << 'SETTINGS'
{
  "enabledPlugins": {
    "superpowers@superpowers-agents": true
  }
}
SETTINGS

# Register the agents branch as a marketplace
cat > "$AGENTS_CONFIG_DIR/plugins/known_marketplaces.json" << 'MARKETPLACES'
{
  "superpowers-agents": {
    "source": "github:opcheese/superpowers#agents"
  }
}
MARKETPLACES

# Initialize empty installed plugins (claude will install on first run)
cat > "$AGENTS_CONFIG_DIR/plugins/installed_plugins.json" << 'INSTALLED'
{}
INSTALLED

echo "Done. Agent config dir created at $AGENTS_CONFIG_DIR"
echo ""
echo "Next steps:"
echo "  1. Run 'claude plugins install superpowers@superpowers-agents' with CLAUDE_CONFIG_DIR=$AGENTS_CONFIG_DIR"
echo "  2. Or manually clone the agents branch into the cache dir"
```

**Step 2: Make executable and test**

```bash
chmod +x scripts/setup-agent-config.sh
./scripts/setup-agent-config.sh
ls -la ~/.claude-agents/
```

Expected: directory structure created with settings.json, known_marketplaces.json

**Step 3: Commit**

```bash
git add scripts/setup-agent-config.sh
git commit -m "feat: add setup script for agent Claude config directory"
```

---

## Workstream B: Escalation Mechanism

### Design: How Escalation Interplays with Homeostasis

Escalation is a **cross-cutting concern** that touches multiple homeostasis dimensions:

| Dimension | Escalation trigger | What happens |
|---|---|---|
| `self_preservation` LOW | Agent detects destructive/risky action it can't authorize | Escalate for safety confirmation |
| `knowledge_sufficiency` LOW | Agent lacks knowledge to proceed | Escalate: "I don't know how to do this" |
| `progress_momentum` LOW | Agent is stuck, going in circles | Escalate: "I'm blocked on X" |
| `certainty_alignment` LOW | Agent uncertain about approach | Escalate: "I need direction" |

Escalation is NOT a new dimension — it's an **action** triggered by existing dimension states. The tick loop already has `self_preservation` LOW → guidance says "escalate to trusted authority". We're wiring the mechanism so the agent can actually do it.

**Escalation flow:**
1. Agent (inside Claude Code session) recognizes it needs help
2. Agent writes `.escalations/{taskId}.json` file with structured escalation data
3. `executeWorkArc()` completes (success, blocked, or timeout)
4. Tick loop checks `.escalations/` directory for files
5. If escalation found: dispatch message to escalation target (from spec) via channel layer
6. Mark task as `blocked` with escalation reason
7. Clean up escalation file

**Escalation targets** come from the agent spec — each agent defines who to escalate to:
- Beki → Kirill (developer questions)
- Besa → Kirill (PM questions) or Sasha (domain questions)

---

### Task B1: Define escalation types and spec field

**Files:**
- Create: `server/agent/escalation.ts`
- Modify: `server/agent/agent-spec.ts` (add escalation_target to AgentSpec)
- Modify: `data/agents/beki/spec.yaml`
- Modify: `data/agents/besa/spec.yaml`

**Step 1: Write the failing test**

Create `server/agent/__tests__/escalation.test.ts`:

```typescript
// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { EscalationRequest } from "../escalation"
import { parseEscalationFile, isValidEscalation } from "../escalation"

describe("escalation", () => {
  it("validates a well-formed escalation request", () => {
    const req: EscalationRequest = {
      taskId: "task-123",
      agentId: "beki",
      reason: "I need help understanding the authentication flow",
      category: "knowledge_gap",
      timestamp: new Date().toISOString(),
    }
    expect(isValidEscalation(req)).toBe(true)
  })

  it("rejects escalation without reason", () => {
    const req = {
      taskId: "task-123",
      agentId: "beki",
      category: "knowledge_gap",
      timestamp: new Date().toISOString(),
    }
    expect(isValidEscalation(req as any)).toBe(false)
  })

  it("parses a JSON escalation file", () => {
    const json = JSON.stringify({
      taskId: "task-456",
      agentId: "besa",
      reason: "Unclear requirements for the sprint planning feature",
      category: "blocked",
      timestamp: "2026-03-16T10:00:00Z",
    })
    const result = parseEscalationFile(json)
    expect(result).not.toBeNull()
    expect(result!.reason).toContain("Unclear requirements")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/agent/__tests__/escalation.test.ts`
Expected: FAIL — module not found

**Step 3: Implement escalation types**

Create `server/agent/escalation.ts`:

```typescript
export type EscalationCategory =
  | "knowledge_gap"    // Don't know how to proceed (knowledge_sufficiency LOW)
  | "blocked"          // External blocker (progress_momentum LOW)
  | "uncertain"        // Need direction (certainty_alignment LOW)
  | "safety"           // Risky action needs approval (self_preservation LOW)

export interface EscalationRequest {
  taskId: string
  agentId: string
  reason: string
  category: EscalationCategory
  timestamp: string
  /** Optional: specific dimension states that triggered escalation */
  dimensions?: Record<string, string>
}

export function isValidEscalation(req: unknown): req is EscalationRequest {
  if (typeof req !== "object" || req === null) return false
  const r = req as Record<string, unknown>
  return (
    typeof r.taskId === "string" &&
    typeof r.agentId === "string" &&
    typeof r.reason === "string" &&
    typeof r.category === "string" &&
    typeof r.timestamp === "string"
  )
}

export function parseEscalationFile(json: string): EscalationRequest | null {
  try {
    const parsed = JSON.parse(json)
    return isValidEscalation(parsed) ? parsed : null
  } catch {
    return null
  }
}
```

**Step 4: Add escalation_target to AgentSpec**

In `server/agent/agent-spec.ts`, add to `AgentSpec`:

```typescript
  escalation_target?: {
    entity: string        // who to escalate to (e.g. "kirill")
    channel: string       // preferred channel (e.g. "discord")
  }
```

In `data/agents/beki/spec.yaml`, add:

```yaml
escalation_target:
  entity: "kirill"
  channel: "discord"
```

In `data/agents/besa/spec.yaml`, add:

```yaml
escalation_target:
  entity: "kirill"
  channel: "discord"
```

**Step 5: Run tests**

Run: `pnpm vitest run server/agent/__tests__/escalation.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add server/agent/escalation.ts server/agent/__tests__/escalation.test.ts server/agent/agent-spec.ts data/agents/beki/spec.yaml data/agents/besa/spec.yaml
git commit -m "feat: define escalation types and add escalation_target to agent spec"
```

---

### Task B2: Escalation file reader for tick loop

**Files:**
- Modify: `server/agent/escalation.ts` (add file read/cleanup functions)
- Test: `server/agent/__tests__/escalation.test.ts`

**Step 1: Write the failing test**

Add to `server/agent/__tests__/escalation.test.ts`:

```typescript
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  checkForEscalation,
  cleanupEscalation,
} from "../escalation"

describe("escalation file operations", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "escalation-test-"))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("reads escalation file from .escalations dir", async () => {
    const escDir = path.join(tmpDir, ".escalations")
    const { mkdir } = await import("node:fs/promises")
    await mkdir(escDir, { recursive: true })
    await writeFile(
      path.join(escDir, "task-123.json"),
      JSON.stringify({
        taskId: "task-123",
        agentId: "beki",
        reason: "Need help",
        category: "knowledge_gap",
        timestamp: new Date().toISOString(),
      }),
    )

    const result = await checkForEscalation(tmpDir, "task-123")
    expect(result).not.toBeNull()
    expect(result!.reason).toBe("Need help")
  })

  it("returns null when no escalation file exists", async () => {
    const result = await checkForEscalation(tmpDir, "task-999")
    expect(result).toBeNull()
  })

  it("cleans up escalation file after reading", async () => {
    const escDir = path.join(tmpDir, ".escalations")
    const { mkdir } = await import("node:fs/promises")
    await mkdir(escDir, { recursive: true })
    const filePath = path.join(escDir, "task-123.json")
    await writeFile(
      filePath,
      JSON.stringify({
        taskId: "task-123",
        agentId: "beki",
        reason: "Need help",
        category: "blocked",
        timestamp: new Date().toISOString(),
      }),
    )

    await cleanupEscalation(tmpDir, "task-123")

    const { existsSync } = await import("node:fs")
    expect(existsSync(filePath)).toBe(false)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/agent/__tests__/escalation.test.ts`
Expected: FAIL — `checkForEscalation` not exported

**Step 3: Implement file operations**

Add to `server/agent/escalation.ts`:

```typescript
import { readFile, unlink } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"

const ESCALATION_DIR = ".escalations"

export async function checkForEscalation(
  workDir: string,
  taskId: string,
): Promise<EscalationRequest | null> {
  const filePath = path.join(workDir, ESCALATION_DIR, `${taskId}.json`)
  if (!existsSync(filePath)) return null

  try {
    const content = await readFile(filePath, "utf-8")
    return parseEscalationFile(content)
  } catch {
    return null
  }
}

export async function cleanupEscalation(
  workDir: string,
  taskId: string,
): Promise<void> {
  const filePath = path.join(workDir, ESCALATION_DIR, `${taskId}.json`)
  try {
    await unlink(filePath)
  } catch {
    // File already removed or never existed
  }
}
```

**Step 4: Run tests**

Run: `pnpm vitest run server/agent/__tests__/escalation.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/agent/escalation.ts server/agent/__tests__/escalation.test.ts
git commit -m "feat: add escalation file read and cleanup operations"
```

---

### Task B3: Wire escalation check into tick loop

**Files:**
- Modify: `server/agent/tick.ts` (after executeWorkArc, before response dispatch)

**Step 1: Write the failing test**

Add a scenario file `scenarios/level-98-escalation-blocked-task.yaml`:

```yaml
scenario: "L98: Agent escalation on blocked task"
description: >
  When an agent writes an escalation file during work, the tick loop
  should detect it, mark the task as blocked, and dispatch an escalation
  message to the configured escalation target.
agent: beki
setup:
  clear_ticks: true
  clear_state: true
steps:
  - send: "implement quantum entanglement protocol for our chat system"
    from: { platform: discord, user: sasha }
    messageType: task_assignment
    expect:
      outcome.action: delegate
      outcome.response: exists
```

This scenario is aspirational — the real test is a unit test. Create `server/agent/__tests__/tick-escalation.test.ts`:

```typescript
// @vitest-environment node
import { describe, expect, it } from "vitest"
import { checkForEscalation, cleanupEscalation } from "../escalation"
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

describe("tick escalation integration", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "tick-esc-"))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("detects escalation file and returns escalation data", async () => {
    const escDir = path.join(tmpDir, ".escalations")
    await mkdir(escDir, { recursive: true })
    await writeFile(
      path.join(escDir, "task-abc.json"),
      JSON.stringify({
        taskId: "task-abc",
        agentId: "beki",
        reason: "I cannot implement this without access to the authentication service docs",
        category: "knowledge_gap",
        timestamp: new Date().toISOString(),
        dimensions: { knowledge_sufficiency: "LOW" },
      }),
    )

    const escalation = await checkForEscalation(tmpDir, "task-abc")
    expect(escalation).not.toBeNull()
    expect(escalation!.category).toBe("knowledge_gap")

    // Cleanup works
    await cleanupEscalation(tmpDir, "task-abc")
    const after = await checkForEscalation(tmpDir, "task-abc")
    expect(after).toBeNull()
  })
})
```

**Step 2: Run test to verify it passes** (this is an integration test for the functions already built)

Run: `pnpm vitest run server/agent/__tests__/tick-escalation.test.ts`
Expected: PASS

**Step 3: Wire into tick.ts**

In `server/agent/tick.ts`, add import at the top:

```typescript
import { checkForEscalation, cleanupEscalation } from "./escalation"
```

After the `executeWorkArc` result handling block (after line ~451, after the task status update switch), add the escalation check:

```typescript
      // ---------------------------------------------------------------
      // ESCALATION check — agent may have written an escalation file
      // ---------------------------------------------------------------
      const escalation = await checkForEscalation(workDir, task.id)
      if (escalation) {
        task.status = "blocked"
        opCtx.blockers.push(`Escalated (${escalation.category}): ${escalation.reason}`)

        // Dispatch escalation message to the configured target
        if (spec?.escalation_target) {
          const escalationMsg: ChannelMessage = {
            id: `escalate-${msg.id}`,
            channel: spec.escalation_target.channel as ChannelName,
            direction: "outbound",
            routing: { replyToId: msg.id },
            from: agentId,
            content: `**Escalation from ${spec.agent.name}** (${escalation.category}):\n\n${escalation.reason}\n\nTask: ${task.description}`,
            messageType: "status_update",
            receivedAt: new Date().toISOString(),
            metadata: { escalation: true, category: escalation.category },
          }
          try {
            await dispatchMessage(escalationMsg)
          } catch {
            console.warn("[tick] Failed to dispatch escalation message")
          }
        }

        await cleanupEscalation(workDir, task.id)
      }
```

**Step 4: Run existing tick tests to verify no regressions**

Run: `pnpm vitest run server/agent/`
Expected: all existing tests PASS

**Step 5: Commit**

```bash
git add server/agent/tick.ts server/agent/__tests__/tick-escalation.test.ts scenarios/level-98-escalation-blocked-task.yaml
git commit -m "feat: wire escalation check into tick loop after work arc execution"
```

---

### Task B4: Create the escalation skill for agents

This is the skill that agents invoke from inside a Claude Code session. It writes the `.escalations/{taskId}.json` file.

**Files:**
- Create: `~/.claude-agents/skills/escalate/SKILL.md`

Note: This skill goes in the **agent** config directory, not the human one. Humans don't need to escalate.

**Step 1: Write the skill**

Create `~/.claude-agents/skills/escalate/SKILL.md`:

```markdown
---
name: escalate
description: Signal that you need human help. Use when blocked, uncertain, lacking knowledge, or facing a safety-sensitive action you cannot authorize.
user-invokable: true
---

# Escalate

You are escalating because you need human help to proceed with your current task.

## When to Use

- You lack knowledge to proceed (you don't understand the domain, can't find docs)
- You are blocked by an external dependency (access, permissions, missing service)
- You are uncertain about the right approach and need direction
- You detect a potentially harmful or irreversible action that needs human approval

## How to Escalate

1. Determine the escalation category:
   - `knowledge_gap` — You don't know enough to proceed
   - `blocked` — External blocker prevents progress
   - `uncertain` — You need direction on approach
   - `safety` — Action requires human authorization

2. Write a JSON file to `.escalations/{taskId}.json` in your working directory:

```json
{
  "taskId": "<your current task ID — check your system prompt or context>",
  "agentId": "<your agent ID>",
  "reason": "<Clear, specific explanation of what you need help with>",
  "category": "<one of: knowledge_gap, blocked, uncertain, safety>",
  "timestamp": "<ISO 8601 timestamp>"
}
```

3. Create the `.escalations/` directory if it doesn't exist.

4. After writing the file, **stop working on the task** and report in your response that you escalated.

## Important

- Be specific in your reason. "I'm stuck" is not helpful. "I cannot find documentation for the FalkorDB graph schema and need it to implement the relationship query" is helpful.
- Include what you've already tried.
- The tick loop will pick up this file and route your escalation to the right person.
```

**Step 2: Verify the skill file is created**

```bash
ls -la ~/.claude-agents/skills/escalate/SKILL.md
```

**Step 3: Commit** (just the docs/plan, not the home directory file)

The skill file lives outside the repo. Document its expected location.

```bash
# No git commit needed — skill is in ~/.claude-agents/ (outside repo)
```

---

### Task B5: Add escalation instructions to agent workflow specs

**Files:**
- Modify: `data/agents/beki/spec.yaml` (workflow_instructions)
- Modify: `data/agents/besa/spec.yaml` (workflow_instructions)

**Step 1: Update Beki's spec**

Add to Beki's `workflow_instructions`:

```yaml
  - "If you are blocked, lack knowledge, or uncertain about approach, use /escalate to signal that you need human help. Never spin on a problem for more than 2 failed attempts — escalate."
```

**Step 2: Update Besa's spec**

Replace the existing "If you don't have the answer, escalate to Kirill" with:

```yaml
  - "If you don't have the answer or are blocked, use /escalate. Never guess when uncertain about requirements or priorities — escalate."
```

**Step 3: Run spec loading tests**

Run: `pnpm vitest run server/agent/__tests__/agent-config-dir.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add data/agents/beki/spec.yaml data/agents/besa/spec.yaml
git commit -m "feat: add escalation instructions to agent workflow specs"
```

---

### Task B6: Add escalation to TickResult for observability

**Files:**
- Modify: `server/agent/types.ts` (TickResult.delegation)

**Step 1: Add escalation field**

In `server/agent/types.ts`, update the `delegation` type in `TickResult`:

```typescript
  delegation?: {
    adapter: string
    taskId: string
    status: "started" | "completed" | "failed" | "timeout"
    transcript?: import("./coding-adapter/types").CodingTranscriptEntry[]
    costUsd?: number
    escalation?: {
      category: string
      reason: string
      target?: string
    }
  }
```

**Step 2: Update tick.ts to populate escalation in tick result**

In the tick result construction (around line 599-625), when escalation is detected, add to the delegation object:

```typescript
        delegation: {
          adapter: adapter.name,
          taskId: task.id,
          status: escalation ? "failed" : (arcResult.status === "completed" ? "completed" : ...),
          transcript: arcResult.transcript,
          costUsd: arcResult.costUsd,
          escalation: escalation ? {
            category: escalation.category,
            reason: escalation.reason,
            target: spec?.escalation_target?.entity,
          } : undefined,
        },
```

**Step 3: Run tests**

Run: `pnpm vitest run server/agent/`
Expected: PASS

**Step 4: Commit**

```bash
git add server/agent/types.ts server/agent/tick.ts
git commit -m "feat: add escalation data to TickResult for observability"
```

---

### Task B7: Escalation-aware guidance to prevent re-escalation spin

**Problem:** After an agent escalates, the next heartbeat tick sees `progress_momentum` LOW (blocked task, no progress). The guidance says "ask for help" — but the agent already did. Without awareness of the pending escalation, the agent will re-escalate on every tick, spamming the human.

**Solution:** Store escalation state on the task. When `progress_momentum` is LOW and the blocked task has an escalation blocker, override guidance to "wait for response".

**Files:**
- Modify: `server/agent/operational-memory.ts` (add `escalatedAt` to TaskState)
- Modify: `server/engine/homeostasis-engine.ts` (add `pendingEscalation` to AgentContext check)
- Modify: `server/engine/types.ts` (add `pendingEscalation` to AgentContext)
- Modify: `server/engine/guidance.yaml` (add escalation-aware progress_momentum guidance)
- Modify: `server/agent/tick.ts` (populate pendingEscalation in AgentContext, set escalatedAt on task)
- Test: `server/engine/__tests__/escalation-guidance.test.ts`

**Step 1: Write the failing test**

Create `server/engine/__tests__/escalation-guidance.test.ts`:

```typescript
// @vitest-environment node
import { describe, expect, it } from "vitest"
import { assessDimensions, getGuidance } from "../homeostasis-engine"
import type { AgentContext } from "../types"

describe("escalation-aware guidance", () => {
  it("progress_momentum LOW with pending escalation gives wait guidance", () => {
    const ctx: AgentContext = {
      sessionId: "test-esc",
      currentMessage: "check status",
      messageHistory: [
        { role: "user", content: "check status" },
        { role: "user", content: "check status" },
        { role: "user", content: "check status" },
      ],
      retrievedFacts: [],
      hasAssignedTask: true,
      pendingEscalation: {
        category: "knowledge_gap",
        escalatedAt: new Date().toISOString(),
      },
    }

    const state = assessDimensions(ctx)
    expect(state.progress_momentum).toBe("LOW")

    const guidance = getGuidance(state, ctx)
    expect(guidance).toContain("escalat")
    expect(guidance).not.toContain("Ask for help") // should NOT say generic "ask for help"
  })

  it("progress_momentum LOW without escalation gives normal guidance", () => {
    const ctx: AgentContext = {
      sessionId: "test-no-esc",
      currentMessage: "check status",
      messageHistory: [
        { role: "user", content: "check status" },
        { role: "user", content: "check status" },
        { role: "user", content: "check status" },
      ],
      retrievedFacts: [],
      hasAssignedTask: true,
    }

    const state = assessDimensions(ctx)
    const guidance = getGuidance(state, ctx)
    // Normal guidance — no escalation override
    expect(guidance).not.toContain("waiting for a response")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/engine/__tests__/escalation-guidance.test.ts`
Expected: FAIL — `pendingEscalation` not in AgentContext type, `getGuidance` doesn't accept ctx

**Step 3: Add `pendingEscalation` to AgentContext**

In `server/engine/types.ts`, add to `AgentContext`:

```typescript
  // Escalation state — set when agent has a pending escalation
  pendingEscalation?: {
    category: string
    escalatedAt: string  // ISO timestamp
  }
```

**Step 4: Add `escalatedAt` to TaskState**

In `server/agent/operational-memory.ts`, add to `TaskState`:

```typescript
  escalatedAt?: string    // ISO timestamp of escalation
  escalationCategory?: string
```

**Step 5: Update `getGuidance` to accept optional context**

In `server/engine/homeostasis-engine.ts`, change `getGuidance` signature:

```typescript
export function getGuidance(
  state: HomeostasisState,
  ctx?: AgentContext,
): string {
```

Add escalation-aware override inside the function, after building `imbalanced` array but before the final return:

```typescript
  // Escalation-aware override: if progress is LOW but agent has a pending
  // escalation, replace generic "ask for help" with "wait for response"
  if (ctx?.pendingEscalation) {
    const progressIdx = imbalanced.findIndex(
      (g) => g.dimension === "progress_momentum" && g.state === "LOW",
    )
    if (progressIdx !== -1) {
      imbalanced[progressIdx].entry = {
        ...imbalanced[progressIdx].entry,
        primary: `**Escalation pending (${ctx.pendingEscalation.category}).** You've already escalated this to a human. Do not re-escalate or retry the same approach.\n- Wait for a response before resuming this task\n- If you have other assigned tasks, work on those instead\n- If idle, report your status and wait`,
      }
    }
  }
```

**Step 6: Wire `pendingEscalation` into tick.ts AgentContext**

In `server/agent/tick.ts`, when building `agentContext` (around line 264), add:

```typescript
      // Check if active task has a pending escalation
      const escalationTask = opCtx.tasks.find(
        (t) => t.status === "blocked" && t.escalatedAt,
      )
      // ... then in AgentContext construction:
      pendingEscalation: escalationTask
        ? {
            category: escalationTask.escalationCategory ?? "blocked",
            escalatedAt: escalationTask.escalatedAt!,
          }
        : undefined,
```

Also, in the escalation check block (Task B3), when marking task as blocked, set the escalation fields:

```typescript
      if (escalation) {
        task.status = "blocked"
        task.escalatedAt = new Date().toISOString()
        task.escalationCategory = escalation.category
        // ... rest of existing escalation handling
      }
```

**Step 7: Update `getGuidance` call sites**

There are two call sites for `getGuidance`:

1. `tick.ts` line ~155 in `buildTickRecord` — pass `undefined` (no ctx needed for records)
2. `tick.ts` line ~295+ where context is assembled — this is where it matters

In the context assembly area, `getGuidance` is called indirectly via `assembleContext`. Check if `assembleContext` calls `getGuidance` directly or if the tick does.

Looking at tick.ts line 155: `getGuidance(params.homeostasis as HomeostasisState)` — this is for tick records, cosmetic. Add optional ctx:
```typescript
getGuidance(params.homeostasis as HomeostasisState)  // no change needed, ctx is optional
```

The main guidance injection happens in `assembleContext`. Read that file to see if it calls `getGuidance` and if we need to thread ctx through. If `assembleContext` calls `getGuidance`, we need to pass `agentContext` into `assembleContext` (it may already receive it via `agentContext` param).

**Step 8: Run tests**

Run: `pnpm vitest run server/engine/__tests__/escalation-guidance.test.ts`
Expected: PASS

**Step 9: Run all homeostasis tests for regressions**

Run: `pnpm vitest run server/engine/`
Expected: all PASS

**Step 10: Commit**

```bash
git add server/engine/types.ts server/engine/homeostasis-engine.ts server/agent/operational-memory.ts server/agent/tick.ts server/engine/__tests__/escalation-guidance.test.ts
git commit -m "feat: escalation-aware guidance prevents re-escalation spin"
```

---

## Workstream C: Scenario Validation

### Task C1: Write escalation scenario

**Files:**
- Create: `scenarios/level-98-escalation-blocked-task.yaml` (already drafted in B3)

This scenario tests the full flow end-to-end. It requires a running server and real adapter. It's a "dogfood" level scenario that validates:

1. Agent receives impossible task
2. Agent uses /escalate skill
3. Tick loop detects escalation file
4. Escalation message dispatched
5. Task marked as blocked

Run: `pnpm scenario scenarios/level-98-escalation-blocked-task.yaml`

This is a manual validation step — the scenario may need tuning based on how the agent actually behaves with the escalation skill installed.

---

## Summary of Changes

| File | Change |
|------|--------|
| `server/agent/agent-spec.ts` | Add `claude_config_dir` and `escalation_target` to AgentSpec |
| `server/agent/escalation.ts` | New: escalation types, file read/write, validation |
| `server/agent/tick.ts` | Inject CLAUDE_CONFIG_DIR, check escalation files, populate pendingEscalation |
| `server/agent/types.ts` | Add escalation to TickResult delegation |
| `server/agent/operational-memory.ts` | Add `escalatedAt`, `escalationCategory` to TaskState |
| `server/engine/types.ts` | Add `pendingEscalation` to AgentContext |
| `server/engine/homeostasis-engine.ts` | Escalation-aware `getGuidance` override |
| `data/agents/beki/spec.yaml` | Add claude_config_dir, escalation_target, workflow update |
| `data/agents/besa/spec.yaml` | Add claude_config_dir, escalation_target, workflow update |
| `scripts/setup-agent-config.sh` | New: setup script for ~/.claude-agents/ |
| `~/.claude-agents/skills/escalate/SKILL.md` | New: escalation skill (outside repo) |
| `scenarios/level-98-escalation-blocked-task.yaml` | New: escalation scenario |

## Homeostasis Integration Notes

Escalation is an **action**, not a dimension. No new dimension needed. Here's how it interacts with existing dimensions:

### After an agent escalates

| Dimension | State | Why |
|---|---|---|
| `progress_momentum` | LOW | Task is blocked, no forward progress |
| `communication_health` | HIGH | Agent just sent outbound (the escalation message) |
| `productive_engagement` | HEALTHY | Agent has assigned task (blocked but exists) |
| `self_preservation` | HEALTHY | Agent protected itself by escalating — correct behavior |
| `knowledge_sufficiency` | depends | LOW if `knowledge_gap`, unchanged otherwise |

### Escalation-aware guidance (Task B7)

The critical addition: when `progress_momentum` is LOW **and** the agent has a `pendingEscalation`, the guidance text is overridden from generic "ask for help / try different approach" to:

> **Escalation pending.** You've already escalated. Do not re-escalate. Wait for response, or work on other tasks if available.

This prevents the agent from:
- Re-escalating on every heartbeat tick (spam)
- Trying the same failed approach again
- Generating busywork while waiting

### How escalation state flows through the system

```
Agent writes .escalations/{taskId}.json during Claude Code session
  ↓
tick loop detects file after executeWorkArc()
  ↓
task.status = "blocked", task.escalatedAt = now, task.escalationCategory = category
  ↓
escalation message dispatched to escalation_target via channel layer
  ↓
next tick: AgentContext.pendingEscalation populated from blocked task
  ↓
assessDimensions() → progress_momentum = LOW (normal)
  ↓
getGuidance(state, ctx) → sees pendingEscalation → overrides progress_momentum guidance
  ↓
agent system prompt says "wait, don't re-escalate"
```

### Future (not in scope)

- **Auto-escalation**: tick loop could auto-escalate when homeostasis detects sustained LOW on `progress_momentum` + `knowledge_sufficiency` (agent stuck AND lacking knowledge) without agent initiative
- **Escalation resolution**: when human responds to escalation, clear `pendingEscalation` and unblock task. Currently requires manual task unblocking via dashboard or new message.
