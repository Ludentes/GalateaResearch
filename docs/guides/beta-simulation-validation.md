# Beta Simulation Validation Guide

Step-by-step guide for validating the Beki/Besa agent system end-to-end.

## Prerequisites

- Docker running (FalkorDB, Qdrant containers)
- Discord bot token configured in `.env`
- Claude Code CLI installed and authenticated
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

## Verify Fleet Dashboard

1. Open `http://localhost:13000/agent/fleet`
2. Both Beki and Besa should appear as cards
3. Health status shows "unknown" (no ticks yet)

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
# Check operational context for session clear
cat data/agents/beki/context.jsonl | jq '.tasks[] | select(.status != "done")'
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
