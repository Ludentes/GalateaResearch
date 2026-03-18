# Multi-Project Agent Deployment

**Status**: Design
**Date**: 2026-03-17
**Scope**: Enable Galatea agents to work on arbitrary projects, starting with Beki on telejobs

---

## Problem

Agent specs are currently single-file (`data/agents/{id}/spec.yaml`) with one workspace, one trust model, one tools_context. To deploy Beki on telejobs alongside the existing agenttestproject work, we need per-project specs and data isolation.

## Design Decisions

Decided via brainstorming session:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Workspace strategy | Root project dir (`/home/newub/w/telejobs`) | Matches how the tech lead uses Claude Code on multi-repo projects |
| Spec strategy | Per-project spec files (`specs/{projectId}.yaml`) | Clean separation, project-specific trust/tools/workspace |
| Spec routing | Message metadata (`msg.metadata.project`) | Simple, explicit, no magic inference |
| Knowledge/memory | Per-project isolation | Minimize complexity for first real deployment; shared knowledge deferred |
| agenttestproject | Archive | Served its purpose as test project |

## File Structure

```
data/agents/beki/
├── spec.yaml                              → ARCHIVED
├── specs/
│   └── telejobs.yaml                      → per-project spec
├── projects/
│   └── telejobs/
│       ├── knowledge/
│       │   └── entries.jsonl              → project-specific knowledge
│       └── context.jsonl                  → project-specific operational memory
├── secrets.yaml                           → agent-global (unchanged)
└── state.json                             → agent-global (unchanged)
```

Convention: `specs/{projectId}.yaml` for specs, `projects/{projectId}/` for data.

Tick pipeline resolves via `msg.metadata.project`:
```
metadata.project: "telejobs"
  → data/agents/beki/specs/telejobs.yaml
  → data/agents/beki/projects/telejobs/knowledge/entries.jsonl
  → data/agents/beki/projects/telejobs/context.jsonl
```

## Pipeline Changes

### agent-spec.ts

```typescript
// Before
loadAgentSpec(agentId) → data/agents/{id}/spec.yaml

// After
loadAgentSpec(agentId, projectId?) →
  projectId ? data/agents/{id}/specs/{projectId}.yaml
            : data/agents/{id}/spec.yaml  // backwards compat fallback
```

### tick.ts

```typescript
// Read project from message metadata
const projectId = msg.metadata?.project as string | undefined
const spec = await loadAgentSpec(agentId, projectId)
// Everything else (workspace, knowledge path, tools_context) flows from spec
```

No other pipeline changes needed. The spec already drives workspace resolution, knowledge paths, and system prompt assembly.

## Telejobs Project Onboarding

### Project Profile

| Field | Value |
|-------|-------|
| Project ID | `telejobs` |
| Workspace | `/home/newub/w/telejobs` |
| Tech stack | Python 3.12 + FastAPI + Poetry (backend), React 19 + TypeScript + pnpm (frontend) |
| GitLab group | `telejobs` on `gitlab.maugry.ru` |
| Repos | `telejobs/project`, `telejobs/tj-frontend`, `telejobs/tj-processor`, `telejobs/tj-collector` |

### Team

| Name | GitLab username | Role | Trust | Can assign tasks |
|------|----------------|------|-------|-----------------|
| Kirill | `kyurkov` | Tech lead (Owner) | full | Yes |
| Dasha | `samodurova.d` | Dev (Maintainer) | high | Yes |
| Sonya | `kuznetsova.s` | PM (Maintainer) | high | Yes |
| Besa | `Besa` | PM agent (future) | high | Yes |
| Beki | `Beki` | Dev agent (Developer) | — | — |

### Agent Configuration

- **Role**: Full-stack developer
- **Domain**: Python FastAPI, React, Telegram integrations
- **Branches**: `feature/*`, `fix/*`
- **Communication**: Discord
- **Escalation**: kirill via Discord

### Hard Blocks (telejobs-specific additions)

Beyond universal blocks (push to master, commit secrets, escape workspace, modify own config):
- Deploy to production or staging
- Run deploy scripts (`deploy-stage.sh`, `deploy-pipeline.sh`, etc.)
- SSH to any server (`officemoserver`, `192.168.87.126`)
- Modify `docker-compose.prod.yml` or `docker-compose.stage-dev.yml`
- Touch Telegram session files or API credentials

### Workflow Instructions

Beki uses superpowers skills proactively:

**Coding tasks:**
1. `/brainstorming` for design decisions
2. `/writing-plans` to create written plan
3. `/subagent-driven-development` or `/dispatching-parallel-agents` for execution
4. `/test-driven-development` — tests first
5. `/verification-before-completion` before claiming done
6. `/requesting-code-review` — self-review via code-reviewer agent
7. `/finishing-a-development-branch` — push + MR

**Research:** `/topic-research` → save to `docs/research/` → commit

**Multi-step:** `/executing-plans` in isolated sessions, code-reviewer agent after major steps

**End of day:** `/end-of-day-report`

**Blocked:** `/escalation` after 2 failed attempts

## Seed Knowledge

Initial knowledge entries to bootstrap the agent:

```jsonl
{"type":"fact","content":"telejobs uses Python 3.12 + FastAPI + Poetry for backend services and React 19 + TypeScript + pnpm for frontend","confidence":1.0,"source":"manual","about":{"entity":"telejobs","type":"project"}}
{"type":"fact","content":"telejobs has 4 separate git repos in one workspace: telejobs/project (root), telejobs/tj-frontend, telejobs/tj-processor, telejobs/tj-collector","confidence":1.0,"source":"manual","about":{"entity":"telejobs","type":"project"}}
{"type":"rule","content":"telejobs: use poetry for Python deps, pnpm for frontend. Never pip/npm/yarn.","confidence":1.0,"source":"manual","about":{"entity":"telejobs","type":"project"}}
{"type":"rule","content":"telejobs: never deploy, never SSH to servers, never touch prod/stage compose files or Telegram sessions","confidence":1.0,"source":"manual","about":{"entity":"telejobs","type":"project"}}
{"type":"rule","content":"telejobs: read .claude/CLAUDE.md in workspace root before starting work — it has deployment rules, environment details, and key documentation pointers","confidence":1.0,"source":"manual","about":{"entity":"telejobs","type":"project"}}
```

## Implementation Checklist

- [ ] Create `data/agents/beki/specs/` directory
- [ ] Write `data/agents/beki/specs/telejobs.yaml` (spec from this design)
- [ ] Create `data/agents/beki/projects/telejobs/knowledge/entries.jsonl` (seed knowledge)
- [ ] Create `data/agents/beki/projects/telejobs/context.jsonl` (empty `{}`)
- [ ] Archive `data/agents/beki/spec.yaml` → `data/agents/beki/specs/agenttestproject.yaml.archived`
- [ ] Archive `data/agents/besa/spec.yaml` → `data/agents/besa/specs/agenttestproject.yaml.archived`
- [ ] Update `server/agent/agent-spec.ts` — add `projectId` parameter
- [ ] Update `server/agent/tick.ts` — read `msg.metadata.project`
- [ ] Update `server/agent/__tests__/agent-spec.test.ts` — test per-project spec loading
- [ ] Run existing scenario suite to verify backwards compat (no `metadata.project` → fallback to `spec.yaml`)
- [ ] Run smoke test scenario targeting telejobs
- [ ] Verify Beki can push branch + create MR on `telejobs/tj-frontend`

## Project Onboarding Form Template

For future projects, fill out before creating a spec:

```
Project ID:           ___
Workspace path:       ___
Tech stack:           ___
Package managers:     ___
GitLab group:         ___
Repos (name → path):  ___

Team:
  Name / GitLab username / Role / Trust level / Can assign tasks?
  ___

Agent role:           ___
Agent domain:         ___
Allowed branches:     ___
Communication:        ___
Escalation target:    ___

Hard blocks (project-specific):
  ___

Seed knowledge (3-5 key facts/rules):
  ___
```
