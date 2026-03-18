# Agent Workspace Isolation Design

**Status**: Design (v1.1)
**Date**: 2026-03-17
**Scope**: Replace `bypassPermissions` with `dontAsk` + `canUseTool` in Claude Code SDK adapter

---

## Problem

Agents (Beki, Besa) run as Claude Code subprocesses with `permissionMode: "bypassPermissions"`. This gives them unrestricted filesystem access. In practice, agents have:
- Written sprint planning docs into galatea's `docs/plans/` instead of their workspace
- Created auth research artifacts in galatea's `docs/research/`
- Full read access to galatea source, secrets, and config

The workspace boundary in `spec.yaml` is advisory — the LLM sees "don't execute commands outside workspace" in hard_blocks, but nothing enforces it at runtime.

## Proposed Solution

Switch from `bypassPermissions` to `dontAsk` + `canUseTool` callback. In `dontAsk` mode, any tool call not explicitly allowed by the callback is denied. This gives us a programmatic whitelist.

```
Current:  bypassPermissions → everything allowed
Proposed: dontAsk + canUseTool → allow/deny per tool call
```

## What Agents Actually Need

Based on analysis of 181 scenarios, agent specs, and the tick pipeline:

### Tool Requirements

| Tool | Beki (Dev) | Besa (PM) | Path Scope |
|------|-----------|-----------|------------|
| **Read** | Yes | Yes | Workspace + worktrees |
| **Write** | Yes | Yes (docs) | Workspace + worktrees |
| **Edit** | Yes | Rare | Workspace + worktrees |
| **Bash** | Yes | Yes | Workspace cwd, see command list below |
| **Glob** | Yes | Yes | Workspace + worktrees |
| **Grep** | Yes | Yes | Workspace + worktrees |
| **Agent** | Yes (subagents) | Yes (subagents) | Inherits parent scope |
| **Skill** | Yes | Yes | N/A (in-process) |
| **WebSearch** | No | Yes (research) | N/A |
| **WebFetch** | No | Yes (research) | N/A |
| **NotebookEdit** | No | No | — |

### Bash Command Categories

**Must allow:**
- `git` — status, add, commit, push, branch, checkout, diff, log, worktree
- `pnpm` — install, build, test, dev, vitest, biome
- `glab` — issue create/list/view, mr create/list/view/approve (always with `--repo`)
- `curl` — localhost only (dev server at :4321)
- `ls`, `cat`, `head`, `mkdir` — basic filesystem within workspace
- `node`, `npx` — running scripts

**Must block:**
- Any command targeting paths outside workspace (absolute paths not under workspace root)
- `sudo`, `chmod 777`, `rm -rf /`
- `docker`, `systemctl`, `kill` (infrastructure operations)
- `ssh`, `scp` (except git over SSH to gitlab.maugry.ru)
- Writing to `~/.claude/`, `~/.claude-agents/settings.json`, `~/.bashrc`, etc.

**Gray area (allow with caution):**
- `git push --force` — blocked by existing regex, keep blocked
- `git reset --hard` — blocked by existing regex, keep blocked
- `curl` to external URLs — Besa may need for research, Beki shouldn't

### Path Scope

Agents should only access paths within:

```
Primary:    /home/newub/w/agentsproject/agenttestproject/
Worktrees:  /home/newub/w/agentsproject/agenttestproject/.worktrees/task-*/
Temp:       /tmp/galatea-*  (test artifacts)
```

Agents must NOT access:
```
Galatea:    /home/newub/w/galatea/          (our codebase)
Home:       /home/newub/.claude/            (user's Claude config)
Agent cfg:  /home/newub/.claude-agents/     (read by SDK, not by agent)
System:     /etc/, /usr/, /var/
Other:      /home/newub/w/*/                (other projects)
```

### Skills Used

From agent spec `workflow_instructions`:

**Beki:**
- `/brainstorming` — before design decisions
- `/writing-plans` — multi-step task planning
- `/test-driven-development` — write tests first
- `/topic-research` — delegated research
- `/finishing-a-development-branch` — push + MR workflow
- `/escalation` — when stuck after 2 attempts

**Besa:**
- `/brainstorming` — before design decisions
- `/topic-research` — multi-source research
- `/escalation` — when blocked on requirements

Skills execute within the Claude Code process and inherit its permissions, so the `canUseTool` callback covers their tool calls too.

### External Services

| Service | Access Method | Agent |
|---------|--------------|-------|
| GitLab (gitlab.maugry.ru) | `glab` CLI with `GITLAB_TOKEN` | Both |
| Git remote (gitlab.maugry.ru:2224) | SSH via git push/pull | Both |
| Dev server (localhost:4321) | `curl` for verification | Both |
| Web (research) | WebSearch/WebFetch tools | Besa only |

### What the Tick Pipeline Handles (NOT the agent)

These operations are performed by galatea's server code, not by the Claude Code subprocess:

- Reading/writing knowledge store (`data/agents/*/knowledge/entries.jsonl`)
- Reading/writing operational context (`data/agents/*/context.jsonl`)
- Reading agent spec (`data/agents/*/spec.yaml`)
- Writing tick records (`data/observations/ticks/*.jsonl`)
- Dispatching Discord/dashboard messages
- Homeostasis assessment
- Work-to-knowledge extraction

This means the agent's Claude Code session does NOT need access to any `data/` paths in galatea.

## Implementation Design

### Option: `canUseTool` Callback

```typescript
// In claude-code-adapter.ts or a new workspace-guard.ts

function createWorkspaceGuard(
  workspacePath: string,
  agentId: string,
): CanUseTool {
  const resolved = path.resolve(workspacePath)
  const allowedRoots = [
    resolved,                              // workspace
    path.join(resolved, ".worktrees"),      // task worktrees
    "/tmp",                                // temp files
  ]

  function isAllowedPath(filePath: string): boolean {
    const abs = path.resolve(resolved, filePath)
    return allowedRoots.some((root) => abs.startsWith(root))
  }

  return async (toolName, input, options) => {
    // File tools — validate path
    if (["Read", "Write", "Edit"].includes(toolName)) {
      const filePath = (input.file_path ?? input.path) as string
      if (filePath && !isAllowedPath(filePath)) {
        return {
          behavior: "deny",
          message: `Path outside workspace: ${filePath}`,
        }
      }
      return { behavior: "allow" }
    }

    // Glob/Grep — validate search path
    if (["Glob", "Grep"].includes(toolName)) {
      const searchPath = (input.path ?? ".") as string
      if (searchPath && !isAllowedPath(searchPath)) {
        return {
          behavior: "deny",
          message: `Search path outside workspace: ${searchPath}`,
        }
      }
      return { behavior: "allow" }
    }

    // Bash — validate command doesn't escape
    if (toolName === "Bash") {
      const cmd = input.command as string
      const denied = validateBashCommand(cmd, resolved)
      if (denied) {
        return { behavior: "deny", message: denied }
      }
      return { behavior: "allow" }
    }

    // Skill — always allow (runs within same Claude Code process)
    if (toolName === "Skill") {
      return { behavior: "allow" }
    }

    // Agent (subagent) — allow, inherits parent permissions
    if (toolName === "Agent") {
      return { behavior: "allow" }
    }

    // WebSearch/WebFetch — allow for PM agents only
    if (["WebSearch", "WebFetch"].includes(toolName)) {
      if (agentId === "besa") {
        return { behavior: "allow" }
      }
      return {
        behavior: "deny",
        message: "Web access not allowed for this agent",
      }
    }

    // Default deny for unknown tools
    return {
      behavior: "deny",
      message: `Tool ${toolName} not in allowlist`,
    }
  }
}
```

### Bash Command Validation

```typescript
function validateBashCommand(
  cmd: string,
  workspacePath: string,
): string | null {
  // Existing blocklist (keep from current implementation)
  const blocked = [
    /rm\s+-rf\s+[/~]/,
    /git\s+push\s+.*--force/,
    /git\s+reset\s+--hard/,
    /sudo\s+/,
    /chmod\s+777/,
    /:\s*>\s*\//,
  ]
  for (const pattern of blocked) {
    if (pattern.test(cmd)) return "Command blocked by safety policy"
  }

  // Block infrastructure commands
  const infraBlocked = /^(docker|systemctl|kill|pkill|killall|mount|umount)\b/
  if (infraBlocked.test(cmd.trim())) {
    return "Infrastructure commands not allowed"
  }

  // Detect absolute paths outside workspace
  // Match /home/..., /etc/..., /var/... etc. but allow:
  //   - paths within workspace
  //   - /tmp
  //   - /dev/null, /dev/stderr (common bash idioms)
  //   - git@gitlab.maugry.ru (SSH URLs)
  const absolutePaths = cmd.match(/(?:^|\s|=|")(\/(home|etc|var|usr|opt|root)\S*)/g)
  if (absolutePaths) {
    for (const match of absolutePaths) {
      const p = match.trim().replace(/^["=]/, "")
      if (
        !p.startsWith(workspacePath) &&
        !p.startsWith("/tmp") &&
        !p.startsWith("/dev/")
      ) {
        return `Command references path outside workspace: ${p}`
      }
    }
  }

  return null // allowed
}
```

### SDK Options Change

```typescript
// Before (current)
const sdkOptions = {
  permissionMode: "bypassPermissions",
  allowDangerouslySkipPermissions: true,
  // ...
}

// After
const sdkOptions = {
  permissionMode: "dontAsk",
  canUseTool: createWorkspaceGuard(workingDirectory, agentId),
  // Remove allowDangerouslySkipPermissions
  // ...
}
```

## Known Limitations & Edge Cases

### 1. Bash is hard to sandbox fully
Regex-based path detection is bypassable (`$(echo /home)/newub/...`, backtick substitution, symlinks). This is defense against accidental leaks, not adversarial escape. The LLM is cooperative — the goal is catching "habit" violations where Claude writes to familiar paths.

### 2. Subagent inheritance
When the agent spawns subagents via the `Agent` tool, those subagents inherit the parent's `canUseTool` callback. Need to verify this is true in SDK behavior. If not, subagents run with `dontAsk` defaults (deny-all), which is safe but may break functionality.

### 3. Skills access
Skills like `/topic-research` may trigger WebSearch/WebFetch internally. If we deny WebFetch for Beki, a skill that uses it will fail. Need to audit which skills use which tools, or allow web tools for all agents during skill execution.

### 4. Git operations reference remote paths
`git push -u origin feature/...` sends data to `gitlab.maugry.ru:2224`. The bash validator must not block git+SSH URLs. Similarly, `glab --repo gitlab.maugry.ru/...` contains external hostnames.

### 5. Worktree paths are dynamic
Worktrees are created at `.worktrees/task-{taskId}` within the workspace. The guard must allow the entire `.worktrees/` subtree, not just the workspace root.

### 6. Per-agent differentiation
Beki (developer) and Besa (PM) have different needs:
- Besa needs WebSearch/WebFetch for research tasks
- Beki needs broader Bash access (pnpm test, biome lint)
- Both need glab, but with potentially different operation scopes

The `canUseTool` callback receives `agentId` and can branch per agent.

### 7. Claude Code config dir
The SDK reads `CLAUDE_CONFIG_DIR` for settings, skills, and session data. This is handled by the SDK process itself, not by tool calls. The agent's tools don't need filesystem access to `~/.claude-agents/` — the SDK handles it transparently.

### 8. `dontAsk` mode and `allowedTools`
If we use `dontAsk` without `canUseTool`, everything is denied. With `canUseTool`, it acts as the sole permission authority — no prompting, no fallback. This is exactly what we want: deterministic, code-controlled permissions.

## Testing Plan

### Unit tests
- `canUseTool` callback returns `allow` for workspace paths
- `canUseTool` callback returns `deny` for galatea paths
- `canUseTool` callback returns `deny` for home directory paths
- Bash validator catches absolute paths outside workspace
- Bash validator allows git/pnpm/glab commands
- Bash validator blocks infrastructure commands
- Per-agent WebSearch/WebFetch differentiation

### Scenario tests
Run these existing scenarios with the new permission mode:
- **L5** (run command) — basic Bash in workspace
- **L6** (write file) — Write within workspace
- **L7** (read + edit) — Read/Edit within workspace
- **L26** (git commit) — git operations in workspace
- **L88** (doc cleanup) — file operations, should stay in workspace
- **L100** (unit tests) — pnpm vitest in workspace
- **L231** (fix build) — full coding workflow
- **L240** (PM reviews) — glab operations + research

### Negative tests (new scenarios needed)
- Agent asked to "check galatea's ARCHITECTURE.md" → should be denied
- Agent asked to "write research to docs/research/" → should write to workspace docs/, not galatea
- Agent runs `cat /home/newub/.env` → should be denied

## Migration Path

1. **Implement `createWorkspaceGuard`** in `server/agent/workspace-guard.ts`
2. **Add unit tests** for the guard function
3. **Test with `bypassPermissions` still on** — log what `canUseTool` would deny (shadow mode)
4. **Switch to `dontAsk` + `canUseTool`** for scenario runs
5. **Run full scenario suite** — expect failures, iterate on allowlist
6. **Per-agent tuning** — adjust Beki vs Besa permissions based on failures
7. **Clean up** — remove `allowDangerouslySkipPermissions`, remove old bash blocklist (subsumed by guard)

## Open Questions

1. **Should we log all denials to a file?** Useful for debugging but adds I/O per tool call.
2. **Should denied tool calls count toward the agent's budget?** The LLM still used tokens to generate the call.
3. **Can we use `settingSources` to inject permissions via a project settings.json?** The SDK supports `settingSources: ["project"]` which loads `.claude/settings.json` from the workspace. We could pre-populate allowed tools there instead of using `canUseTool`.
4. **Should the guard be configurable per-task-type?** Research tasks may need broader access than coding tasks.
5. **Subagent tool inheritance** — need to test SDK behavior. Does `canUseTool` propagate to spawned agents?

## Important: Tool List Needs Real-World Validation

The tool requirements table and bash allowlist in this document are derived from scenario analysis and agent specs, NOT from observed production behavior. The actual tool usage will likely differ — agents may need tools or paths not anticipated here, and some listed tools may be unnecessary.

**Before implementing, run agents on the real project with `bypassPermissions` + audit logging to capture actual tool call patterns.** Use that data to build the allowlist, not this document's estimates. This plan is a starting framework, not a specification.
