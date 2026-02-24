# Claude Code Hooks, Subagents & Multi-Agent Patterns Research

**Date:** 2026-02-23
**Purpose:** Evaluate whether Claude Code can serve as our coding agent with homeostasis safety checks injected WITHIN the session via hooks.

## TL;DR — The Answer

**Yes.** Claude Code's hook system (especially `PreToolUse`) allows us to inject our own safety/homeostasis checks as deterministic guardrails that run on every tool call, within the session. Both the CLI-based hooks (shell commands in `settings.json`) and the Agent SDK hooks (Python/TypeScript callbacks in `query()`) support calling external APIs synchronously before allowing or blocking a tool call.

---

## 1. Subagent Architecture: Parent-Child Communication

### Does the parent agent monitor/intervene between subagent tool calls?

**No — subagents run autonomously.** The parent delegates a task, the subagent works independently in its own context window, and only the final text response returns to the parent. The parent cannot see intermediate tool calls.

However, you CAN inject checks via:
- **`SubagentStart` hook**: inject context/instructions when a subagent spawns
- **`SubagentStop` hook**: inspect final output, block completion, force continuation
- **`PreToolUse` hooks defined in subagent frontmatter**: these run before EVERY tool call the subagent makes

### Can you define custom subagents with hooks?

**Yes.** Subagent markdown files support YAML frontmatter with a `hooks` field:

```yaml
---
name: safe-coder
description: Coding agent with homeostasis checks
tools: Read, Edit, Write, Bash, Grep, Glob
hooks:
  PreToolUse:
    - matcher: "Bash|Edit|Write"
      hooks:
        - type: command
          command: "./scripts/homeostasis-check.sh"
  Stop:
    - hooks:
        - type: command
          command: "./scripts/verify-completion.sh"
---
You are a coding agent. Follow safety protocols.
```

### Is there streaming/pause/redirect from parent to subagent?

**No real-time streaming intervention.** The parent cannot pause or redirect a running subagent mid-execution. The only intervention points are:
- `SubagentStart` — inject context before it begins
- `SubagentStop` — block it from completing (exit code 2 or `decision: "block"`)
- Hooks defined in the subagent's own frontmatter — these fire on every tool call within the subagent

---

## 2. Complete Hook Lifecycle (17 Events)

| Event | Can Block? | Matcher | Key Use Case |
|-------|-----------|---------|--------------|
| `SessionStart` | No | startup/resume/clear/compact | Load context, set env vars |
| `UserPromptSubmit` | Yes | none | Validate/filter user prompts |
| **`PreToolUse`** | **Yes** | **tool name regex** | **Safety guardrails, homeostasis checks** |
| `PermissionRequest` | Yes | tool name | Auto-approve or deny permissions |
| **`PostToolUse`** | No* | tool name | Audit, lint after changes |
| `PostToolUseFailure` | No | tool name | Error handling |
| `Notification` | No | notification type | Alert forwarding |
| `SubagentStart` | No | agent type | Inject context into subagents |
| `SubagentStop` | Yes | agent type | Quality gates on subagent output |
| `Stop` | Yes | none | Force continuation if criteria unmet |
| `TeammateIdle` | Yes | none | Quality gates on team members |
| `TaskCompleted` | Yes | none | Verify task completion criteria |
| `ConfigChange` | Yes | config source | Audit/block settings changes |
| `WorktreeCreate` | Yes | none | Custom VCS isolation |
| `WorktreeRemove` | No | none | Cleanup |
| `PreCompact` | No | manual/auto | Archive before compaction |
| `SessionEnd` | No | reason | Cleanup, logging |

### Three Hook Handler Types:
1. **`command`** — shell script, receives JSON on stdin, communicates via exit codes + stdout JSON
2. **`prompt`** — single-turn LLM evaluation (Haiku by default), returns `{ok: true/false}`
3. **`agent`** — multi-turn subagent with Read/Grep/Glob tools, up to 50 turns

---

## 3. PreToolUse: The Key Hook for Homeostasis

### CLI-based (settings.json)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/homeostasis-check.py"
          }
        ]
      }
    ]
  }
}
```

### Hook script calling external API:

```python
#!/usr/bin/env python3
"""PreToolUse hook that calls homeostasis engine before allowing tool execution."""
import sys
import json
import requests

input_data = json.loads(sys.stdin.read())

tool_name = input_data.get("tool_name", "")
tool_input = input_data.get("tool_input", {})
session_id = input_data.get("session_id", "")

# Call our homeostasis engine
try:
    response = requests.post(
        "http://localhost:8080/api/v1/check",
        json={
            "tool_name": tool_name,
            "tool_input": tool_input,
            "session_id": session_id,
            "agent_type": "claude-code",
        },
        timeout=5,
    )
    result = response.json()

    if result.get("decision") == "deny":
        # Block the tool call
        output = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": result.get("reason", "Blocked by homeostasis engine"),
            }
        }
        json.dump(output, sys.stdout)
        sys.exit(0)

    elif result.get("decision") == "ask":
        # Escalate to user
        output = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "ask",
                "permissionDecisionReason": result.get("reason", "Homeostasis engine requests confirmation"),
            }
        }
        json.dump(output, sys.stdout)
        sys.exit(0)

    elif result.get("modified_input"):
        # Allow with modified input
        output = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
                "updatedInput": result["modified_input"],
                "additionalContext": result.get("context", ""),
            }
        }
        json.dump(output, sys.stdout)
        sys.exit(0)

except requests.exceptions.RequestException:
    # If homeostasis engine is down, fail open or fail closed (configurable)
    pass

# Default: allow
sys.exit(0)
```

### Agent SDK (Python) — Programmatic hooks:

```python
import asyncio
import aiohttp
from claude_agent_sdk import query, ClaudeAgentOptions, HookMatcher

async def homeostasis_check(input_data, tool_use_id, context):
    """PreToolUse hook that calls our homeostasis engine."""
    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})

    async with aiohttp.ClientSession() as session:
        try:
            resp = await session.post(
                "http://localhost:8080/api/v1/check",
                json={
                    "tool_name": tool_name,
                    "tool_input": tool_input,
                    "session_id": input_data.get("session_id"),
                },
                timeout=aiohttp.ClientTimeout(total=5),
            )
            result = await resp.json()

            if result["decision"] == "deny":
                return {
                    "hookSpecificOutput": {
                        "hookEventName": input_data["hook_event_name"],
                        "permissionDecision": "deny",
                        "permissionDecisionReason": result.get("reason"),
                    }
                }
        except Exception:
            pass  # fail open

    return {}

async def main():
    async for message in query(
        prompt="Implement the user authentication module",
        options=ClaudeAgentOptions(
            hooks={
                "PreToolUse": [
                    HookMatcher(
                        matcher="Bash|Edit|Write",
                        hooks=[homeostasis_check],
                        timeout=10,
                    )
                ]
            }
        ),
    ):
        print(message)

asyncio.run(main())
```

---

## 4. Agent Teams (Multi-Agent Collaboration)

**Status:** Experimental (February 2026), enabled via `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`.

### How they work:
- One session acts as **team lead**, spawning independent **teammates**
- Each teammate is a full Claude Code session with its own context window
- Communication via **task list on disk** and **SendMessage** tool — no shared memory
- All teammates load the same project context (CLAUDE.md, MCP, skills)
- Plan approval mode: teammates propose plans, lead reviews before execution

### Context isolation:
- **Subagents**: isolated context, only final response returns to parent
- **Agent teams**: fully independent sessions, communicate via tasks + messages
- **Neither shares memory** — CLAUDE.md and disk files are the shared state

### Key hooks for teams:
- `TeammateIdle` — enforce quality gates before a teammate stops
- `TaskCompleted` — verify completion criteria (run tests, etc.)

---

## 5. Subagent Context & Memory

### Are subagents isolated?
**Yes, by default.** Each subagent has:
- Its own context window
- Custom system prompt (from markdown body)
- Independent tool access
- Its own transcript file

### Persistent memory option:
Subagents support a `memory` field (`user`, `project`, `local`) that gives them a persistent directory across sessions:

```yaml
---
name: safe-coder
memory: project
---
```

This creates `.claude/agent-memory/safe-coder/MEMORY.md` that persists across conversations.

### Skills injection:
Subagents can preload skills:
```yaml
---
name: api-builder
skills:
  - api-conventions
  - error-handling
---
```

---

## 6. Can Hooks Call External APIs?

**Absolutely yes.** Since hooks are either:
- Shell commands (can run `curl`, Python scripts, anything)
- SDK callbacks (async Python/TypeScript functions)

They can call any external service. Examples from the ecosystem:
- [rulebricks/claude-code-guardrails](https://github.com/rulebricks/claude-code-guardrails) — real-time guardrails calling external API
- The SDK docs explicitly show `aiohttp`/`fetch` examples calling webhooks

### Timeout considerations:
- Default timeout: 600s for command hooks, 30s for prompt hooks, 60s for agent hooks
- Configurable per-hook via `timeout` field
- For external API calls, increase timeout as needed

---

## 7. Architecture Implications for Galatea

### Recommended approach:

1. **Use Claude Code as the coding agent** — it already has Read/Write/Edit/Bash/Grep/Glob tools
2. **Inject homeostasis via PreToolUse hooks** — every tool call passes through our engine
3. **Two deployment modes:**
   - **CLI mode:** hooks in `.claude/settings.json` calling shell scripts
   - **SDK mode:** hooks as Python callbacks in `query()` for programmatic control

### Hook pipeline for homeostasis:

```
Claude decides to use a tool
        |
        v
  PreToolUse fires
        |
        v
  homeostasis-check.py
        |
        v
  Calls homeostasis engine API
        |
        +-- deny  --> tool blocked, Claude sees reason
        +-- ask   --> user prompted for confirmation
        +-- allow --> tool executes
        +-- allow + updatedInput --> tool executes with modified params
        +-- allow + additionalContext --> tool gets extra context injected
```

### What we CAN do within a session:
- Block any tool call before execution
- Modify tool inputs (e.g., sanitize commands, redirect file paths)
- Inject context into Claude's reasoning
- Force Claude to continue working if it stops prematurely
- Run quality gates on subagent output
- Audit every tool call via PostToolUse

### What we CANNOT do within a session:
- See intermediate reasoning between tool calls (only tool calls are hookable)
- Pause/redirect a subagent mid-execution from the parent
- Share memory between subagents (only via disk files)
- Stream subagent progress to parent in real-time

---

## Sources

- [Hooks Reference — Claude Code Docs](https://code.claude.com/docs/en/hooks)
- [Create Custom Subagents — Claude Code Docs](https://code.claude.com/docs/en/sub-agents)
- [Intercept and Control Agent Behavior with Hooks — Agent SDK Docs](https://platform.claude.com/docs/en/agent-sdk/hooks)
- [Orchestrate Teams of Claude Code Sessions — Claude Code Docs](https://code.claude.com/docs/en/agent-teams)
- [Building Guardrails for AI Coding Assistants — DEV Community](https://dev.to/mikelane/building-guardrails-for-ai-coding-assistants-a-pretooluse-hook-system-for-claude-code-ilj)
- [Claude Code Hooks: Guardrails That Actually Work](https://paddo.dev/blog/claude-code-hooks-guardrails/)
- [rulebricks/claude-code-guardrails — GitHub](https://github.com/rulebricks/claude-code-guardrails)
- [Claude Code Agent Teams Guide 2026](https://claudefa.st/blog/guide/agents/agent-teams)
- [Addy Osmani — Claude Code Swarms](https://addyosmani.com/blog/claude-code-agent-teams/)
