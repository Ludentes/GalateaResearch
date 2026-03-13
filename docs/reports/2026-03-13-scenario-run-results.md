# Scenario Run Results — 2026-03-13

## Environment

- **Provider**: Claude Code (Agent SDK direct, model: sonnet)
- **Server**: localhost:13000 (Vite dev)
- **DB**: PostgreSQL 17 @ localhost:15432
- **FalkorDB**: localhost:16379

## Run 1 — OpenRouter (Haiku), Pre-Fix

Initial run with `LLM_PROVIDER=openrouter`. Identified DB was down (preprompts table missing). After `db:push`, ran L1-L15.

| Tier | Pass | Fail | Notes |
|------|------|------|-------|
| L1-L5 | 5/5 | 0 | All basic scenarios pass |
| L6-L8 | 0/3 | 3 | Routing: task → interaction misclassification |
| L9-L10 | 2/2 | 0 | Multi-step + review pass |
| L11-L15 | 5/5 | 0 | All multi-step pass |

## Run 2 — Claude Code, Pre-Fix

Switched to `LLM_PROVIDER=claude-code`. Discovered two systemic issues:

### Issue 1: Tick Record Polling Too Short
- **Symptom**: Multi-step scenarios (L9, L11-L13, L19) returned `tick: null` on step 2
- **Root cause**: `appendTickRecord` in tick.ts is fire-and-forget. Inject endpoint polled 10×50ms=500ms — too short for Claude Code
- **Fix**: Extended to 30×100ms=3s polling window

### Issue 2: Context Bleed Between Scenarios
- **Symptom**: L7 answered L5's question, L20 step 2 answered L1's question, L8 described wrong file
- **Root cause**: 3 state sources not reset by `clear_state`:
  1. `agentSessions` Map in claude-code-respond.ts (SDK conversation history)
  2. `data/agent/operational-context.json` (recentHistory, tasks, carryover)
  3. `activityLog` in agent state (only pendingMessages was cleared)
- **Fix**: Added `/api/agent/reset` endpoint that clears all 5 state sources. Updated scenario runner to call it.

### Issue 3: Claude Code Availability Flapping
- **Symptom**: L3, L15 got "powered-down" responses mid-run
- **Root cause**: `checkSelfModel()` ran `claude --version` via `execSync` on every tick — flaps under load
- **Fix**: Added 60s TTL cache for provider availability with `invalidateProviderCache()` export

### Full Results (Pre-Fix)

| Scenario | Result | Failure Category |
|----------|--------|-----------------|
| L1 | FAIL | Routing: interaction→task |
| L2 | PASS | |
| L3 | FAIL | LLM flapping (powered-down) |
| L4 | FAIL | Content: correct answer but wrong keyword |
| L5 | FAIL | No tool calls (answered from knowledge) |
| L6 | FAIL | Routing: task→interaction |
| L7 | FAIL | Context bleed (answered L5's question) |
| L8 | FAIL | Context bleed |
| L9 | PASS | |
| L10 | PASS | |
| L11-L14 | PASS | |
| L15 | FAIL | LLM flapping (step 2) |
| L16 | FAIL | Context bleed |
| L17 | PASS | |
| L18 | FAIL | GitLab MR lookup (no GitLab configured) |
| L19 | FAIL | tick null (step 2) |
| L20 | FAIL | Context bleed |
| L21-L24 | PASS | Resilience tier all green |
| L25 | FAIL | Step 2 no tool calls |

**Total: 12/25 pass (48%)**

### Trace Scenarios (Pre-Fix): 3/18 pass (17%)

Majority fail due to `outcome.action: delegate` not implemented (traces expect delegation between agents) and routing misclassification.

## Run 3 — Claude Code, Post-Fix

After context isolation + polling + cache fixes. Results pending (running now).

## Failure Categories

### Systemic (Fixed)
- **Context bleed** — FIXED via `/api/agent/reset`
- **Tick null on step 2** — FIXED via extended polling
- **LLM availability flapping** — FIXED via provider cache

### Systemic (Remaining)
- **Routing misclassification** — `inferRouting()` heuristic too strict for natural language
- **`delegate` action not implemented** — traces expect agent-to-agent delegation
- **Content assertion fragility** — correct answers fail substring checks

### Per-Scenario
- **L4**: Agent described plugins correctly but omitted "vitest" keyword
- **L5**: Agent answered from knowledge without using tools
- **L6**: "Create a new file" not recognized as task
- **L18**: Tries to look up GitLab MR that doesn't exist
- **L25**: Second user's message didn't trigger tool use

## Infrastructure Notes

- PostgreSQL container (`galatea-postgres-1`) was stopped — needed `docker start`
- FalkorDB container (`galatea-falkordb-1`) was stopped — needed `docker start`
- Schema needed `drizzle-kit push --force` to drop 4 obsolete tables (facts, procedures, gatekeeper_log, homeostasis_states)
