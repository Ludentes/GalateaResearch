# Beta Simulation Validation Guide

Step-by-step guide for validating the Beki/Besa agent system end-to-end.

## Prerequisites

- Docker running (FalkorDB, Qdrant containers)
- Discord bot token configured in `.env`
- Claude Code CLI installed and authenticated
- Claude Code API key set in `.env` (`ANTHROPIC_API_KEY`)
- glab CLI authenticated with GitLab

## Environment Setup

```bash
# Start infrastructure
docker compose up -d

# Verify services
curl -s http://localhost:16333/collections | jq .  # Qdrant
redis-cli -p 16379 PING                              # FalkorDB

# Start dev server
pnpm dev
```

## Step 1: Agent Spec Loading

Verify that agent specs parse correctly and appear in the fleet API.

```bash
# Confirm spec files exist and are valid YAML
cat data/agents/beki/spec.yaml | head -5
cat data/agents/besa/spec.yaml | head -5

# Verify fleet API returns both agents with correct identity from specs
curl -s http://localhost:13000/api/agent/fleet | jq '.agents[] | {id, name, role, domain}'
```

**Expected:**
- Beki: role = "developer", domain = "frontend"
- Besa: role = "project-manager", domain = "process"
- Both agents have `tools_context` loaded (visible in spec YAML)

**Edge case — unknown agent:**
```bash
# Should return 404
curl -s -o /dev/null -w "%{http_code}" http://localhost:13000/api/agent/fleet/nonexistent
```

## Step 2: Verify Fleet Dashboard

1. Open `http://localhost:13000/agent/fleet`
2. Both Beki and Besa should appear as cards
3. Health status shows "unknown" (no ticks yet)

## Step 3: Heartbeat Tick Validation

Verify that agents produce ticks autonomously via heartbeat (no message required).

**Action:** Do NOT send any messages. Wait 60 seconds (2x heartbeat interval from `server/engine/config.yaml`).

**Verify:**
```bash
# At least one heartbeat tick should exist
cat data/observations/ticks/beki.jsonl | jq 'select(.trigger.type == "heartbeat")'
cat data/observations/ticks/besa.jsonl | jq 'select(.trigger.type == "heartbeat")'
```

**Expected:**
- At least one tick per agent with `trigger.type == "heartbeat"`
- Outcome action is `"idle"` (no pending messages)
- Homeostasis dimensions are assessed

**Edge case — idle heartbeat:**
- With no pending messages, the tick should complete without delegating to Claude Code
- `execution.adapter` should be `"none"` for idle heartbeats

## Trace 12: PM Assigns Research Task to Besa

**Action:** Send Discord message: `@Besa research auth options for the mobile app`

**Expected:**
- Besa creates a TaskState with type "research"
- Besa delegates to Claude Code with web search tools
- A document artifact is created (docs/research/*.md)
- Besa responds in Discord with a summary
- Fleet dashboard shows:
  - TickDecisionRecord with routing.level = "task", routing.taskType = "research"
  - Work-to-knowledge entry with source "task:{id}"

**Verify:**
```bash
# Check tick records
cat data/observations/ticks/besa.jsonl | jq '.routing'

# Check knowledge entries
grep "task:" data/agents/besa/knowledge/entries.jsonl
```

## Trace 13: PM Creates Sprint Tasks via Besa

**Action:** Send: `@Besa create tasks for sprint 12: settings, notifications, dark mode. Assign to Beki.`

**Expected:**
- Besa creates a TaskState with type "admin"
- Besa runs glab issue create commands
- 3 issue artifacts created with GitLab URLs
- Besa responds with issue numbers

**Verify:**
```bash
glab issue list --assignee beki
cat data/observations/ticks/besa.jsonl | jq 'select(.routing.taskType == "admin")'
```

## Trace 14: Quick Status Check (Interaction, Not Task)

**Action:** Send: `@Besa is MR !42 merged?`

**Expected:**
- Besa responds within a single tick
- No TaskState created
- TickDecisionRecord routing.level is "interaction"

**Verify:**
```bash
cat data/observations/ticks/besa.jsonl | jq 'select(.routing.level == "interaction")'
```

## Trace 15: Mid-Task Scope Change

**Action:**
1. First: `@Beki implement user settings screen for #101`
2. Wait for Beki to start working
3. Then: `@Beki also needs dark mode toggle`

**Expected:**
- Beki's existing TaskState is updated (scope appended)
- claudeSessionId is cleared (requirements changed)
- A new Claude Code session starts with carryover from previous work

**Verify:**
```bash
# Check that session resume worked during initial implementation
cat data/observations/ticks/beki.jsonl | jq 'select(.execution.sessionResumed == true)'

# Check that session was cleared after scope change
cat data/agents/beki/context.jsonl | jq '.tasks[] | select(.status != "done")'

# Verify new session started (sessionResumed should be false on next tick after scope change)
cat data/observations/ticks/beki.jsonl | jq -s 'last | .execution.sessionResumed'
```

## Trace 16: Besa Reviews Beki's MR

**Action:** Send: `@Besa review Beki's MR !42`

**Expected:**
- Besa creates a TaskState with type "review"
- Besa reads the MR diff via glab
- Besa posts a comment on the MR
- A comment artifact is created
- Besa responds in Discord summarizing the review

**Verify:**
```bash
glab mr view 42 --comments
cat data/observations/ticks/besa.jsonl | jq 'select(.routing.taskType == "review")'
```

## Work-to-Knowledge Verification

After at least one task completes (Trace 12 or later):

```bash
# Check that completed tasks generated knowledge entries
cat data/observations/ticks/besa.jsonl | jq 'select(.outcome.knowledgeEntriesCreated > 0)'

# Verify knowledge entries exist with task source
ls data/agents/besa/knowledge/ 2>/dev/null
```

**Expected:**
- At least one tick shows `outcome.knowledgeEntriesCreated > 0`
- Knowledge entries reference the completed task

## Fleet Dashboard Verification

After running all traces:

1. Open `http://localhost:13000/agent/fleet`
2. Both Beki and Besa show recent activity
3. Click on any agent → agent detail page
4. Decision timeline shows all ticks
5. Click to expand any tick → see full causal chain:
   - Trigger → Homeostasis (7 dims) → Guidance → Routing → Execution → Outcome
6. Verify subscription usage bars reflect token consumption

## Troubleshooting

### Agent not responding
- Check Discord bot token in `.env`
- Check `pnpm dev` terminal for errors
- Verify heartbeat is enabled in `server/engine/config.yaml`

### No tick records
- Check `data/observations/ticks/` directory exists
- Check agent state: `cat data/agent/state.json`

### glab commands failing
- Run `glab auth status` to verify authentication
- Check GitLab project access permissions

### Fleet dashboard empty
- Verify `data/agents/beki/spec.yaml` and `data/agents/besa/spec.yaml` exist
- Check browser console for API errors
- Try `curl http://localhost:13000/api/agent/fleet` directly

## Validation Passed If

- [ ] Agent specs load correctly and appear in fleet API with correct role/domain
- [ ] Heartbeat produces at least one idle tick per agent (no message required)
- [ ] Trace 12: Research task routed as `task` with type `research`
- [ ] Trace 13: Admin task creates GitLab issues via glab
- [ ] Trace 14: Quick question routed as `interaction` (no TaskState)
- [ ] Trace 15: Session resume observed (`sessionResumed: true`), then cleared on scope change
- [ ] Trace 16: Review task reads MR diff and posts comment
- [ ] Work-to-knowledge entries created for at least one completed task
- [ ] Fleet dashboard shows both agents with recent ticks and correct health
- [ ] Tick detail view shows full causal chain (trigger → homeostasis → routing → outcome)
