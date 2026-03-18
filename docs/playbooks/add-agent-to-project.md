# Playbook: Add a Galatea Agent to a New Project

How to deploy a Galatea agent (Beki, Besa) to work on a project outside the galatea repo.

---

## Prerequisites

- Galatea repo at `~/w/galatea` with working tick pipeline
- Agent spec exists in `data/agents/{agentId}/spec.yaml`
- Target project has a git remote on `gitlab.maugry.ru`
- `~/.claude-agents/` directory exists (shared agent config dir)

## Steps

### 1. Prepare the Agent Spec

The agent spec (`data/agents/{agentId}/spec.yaml`) defines identity, workspace, trust, and workflow. For a new project, you need a **project-specific spec** or update the existing one.

**What to change:**

| Field | Current (agenttestproject) | New project value |
|-------|--------------------------|-------------------|
| `workspace` | `/home/newub/w/agentsproject/agenttestproject` | Absolute path to new project |
| `agent.role` | "Mobile developer" | Role appropriate for project |
| `agent.domain` | "Expo / React Native" | Tech domain of new project |
| `tools_context` | glab commands with `--repo kyurkov/agenttestproject` | glab commands with `--repo {group}/{project}` |
| `trust.identities` | kirill, sasha, denis, besa | Team members of new project |
| `allowed_branches` | `["feature/*", "fix/*"]` | Branch patterns allowed in new project |

**What stays the same:**

| Field | Value | Why |
|-------|-------|-----|
| `agent.id` | `beki` / `besa` | Agent identity is global |
| `agent.email` | `betasimkirill@gmail.com` | Git author identity |
| `agent.gitlab_username` | `Beki` | GitLab identity |
| `claude_config_dir` | `/home/newub/.claude-agents` | Shared config dir for all agent sessions |
| `hard_blocks` | Same list | Safety rules are universal |
| `escalation_target` | kirill/discord | Always escalate to tech lead |
| `workflow_instructions` | Same | Coding/research workflow is generic |

**Decision: one spec per agent or one per agent-project?**

Currently the spec is a single file. To support multiple projects, either:
- **(A)** Switch workspace before each task in the tick pipeline (based on message metadata)
- **(B)** Create per-project spec files: `data/agents/beki/specs/telejobs.yaml`
- **(C)** Keep one spec, override workspace at message level

For now: **(A)** is simplest — the tick pipeline already supports `msg.metadata.workspace` override (tick.ts:539). The scenario `send` block can include workspace in metadata.

### 2. Configure GitLab Access

The agent needs push access to the target project's GitLab repo.

```bash
# Check if Beki user exists on GitLab with project access
GIT_CONFIG_NOSYSTEM=1 glab api projects/telejobs%2Ftj-processor/members \
  --hostname gitlab.maugry.ru
```

If Beki doesn't have access:
1. Add `Beki` as Developer on each relevant GitLab project
2. Ensure `GITLAB_TOKEN` in agent secrets covers the new project group

**For telejobs specifically:**
- 3 repos: `telejobs/project`, `telejobs/tj-frontend`, `telejobs/tj-processor`
- Beki needs Developer access on all three (or at least the ones they'll work on)

### 3. Set Up Project CLAUDE.md for Agents

The target project should have a `.claude/CLAUDE.md` that agents will read (via `settingSources: ["project"]` in the SDK). Telejobs already has this.

Verify it contains:
- [ ] Tech stack description
- [ ] Key commands (build, test, lint, deploy)
- [ ] Package manager (pnpm, poetry, etc.)
- [ ] Repo structure (especially if multi-repo like telejobs)
- [ ] Deployment safety rules (what NOT to do)
- [ ] Documentation pointers

### 4. Register Agent in Project's AGENTS.md

Telejobs already has this. For a new project, create `AGENTS.md` at project root:

```markdown
# AGENTS.md

## Active Agents
| Agent | Role | Focus |
|---|---|---|
| **Beki** | Dev agent | Feature work, bug fixes |

## Shared Knowledge
All agents read `.claude/CLAUDE.md` for project context.
```

### 5. Create Agent Knowledge Entries

The agent starts with zero knowledge about the new project. Seed initial knowledge:

```bash
# In galatea repo
cat >> data/agents/beki/knowledge/entries.jsonl << 'EOF'
{"type":"fact","content":"telejobs uses Python + FastAPI + Poetry for backend (processing-service, collector-service) and React + pnpm for frontend","confidence":1.0,"source":"manual","about":{"entity":"telejobs","type":"project"},"createdAt":"2026-03-17T00:00:00Z"}
{"type":"fact","content":"telejobs has 3 separate git repos: telejobs/project (main), telejobs/tj-frontend, telejobs/tj-processor on gitlab.maugry.ru","confidence":1.0,"source":"manual","about":{"entity":"telejobs","type":"project"},"createdAt":"2026-03-17T00:00:00Z"}
{"type":"rule","content":"telejobs: always use poetry for Python deps, pnpm for frontend. Never npm/yarn/pip.","confidence":1.0,"source":"manual","about":{"entity":"telejobs","type":"project"},"createdAt":"2026-03-17T00:00:00Z"}
{"type":"rule","content":"telejobs: never deploy to production without consulting runbooks. Stage IS production.","confidence":1.0,"source":"manual","about":{"entity":"telejobs","type":"project"},"createdAt":"2026-03-17T00:00:00Z"}
EOF
```

### 6. Configure Tick Pipeline to Route to New Project

The tick pipeline needs to know which workspace to use for telejobs tasks. Options:

**(A) Message-level workspace** — include workspace in the message metadata:
```yaml
# In scenario or dashboard message
send: "Fix the bug in processing-service auth endpoint"
from: { platform: dashboard, user: kirill }
metadata:
  workspace: "/home/newub/w/telejobs/services/processing-service"
```

**(B) Spec-level workspace switch** — not ideal for multi-project.

**(C) Per-project spec** — cleanest long-term:
```yaml
# data/agents/beki/specs/telejobs-processor.yaml
workspace: "/home/newub/w/telejobs/services/processing-service"
# ... rest of spec with telejobs-specific tools_context
```

### 7. Handle Multi-Repo Projects

Telejobs is special: 3 repos in one project tree. The agent needs to know:
- Which repo to work in (frontend vs processing vs collector)
- Which `glab --repo` to use for MRs
- Which branch conventions apply

The `tools_context` in the spec should reflect this:
```yaml
tools_context: |
  IMPORTANT: telejobs is a multi-repo project. Know which repo you're in:
  - Frontend (React): /home/newub/w/telejobs/frontend/ → glab --repo telejobs/tj-frontend
  - Processing (Python): /home/newub/w/telejobs/services/processing-service/ → glab --repo telejobs/tj-processor
  - Collector (Python): /home/newub/w/telejobs/services/collector-service/ → glab --repo telejobs/tj-collector
  Always prefix glab commands with GIT_CONFIG_NOSYSTEM=1.
  Read .claude/CLAUDE.md in the workspace root for project rules.
```

### 8. Update Team Trust Model

For telejobs, the trust identities should include the actual team:

```yaml
trust:
  identities:
    - entity: "kirill"
      level: "full"
    - entity: "dasha"
      level: "high"
    - entity: "sonya"
      level: "high"
    - entity: "besa"
      level: "high"
```

### 9. Verify Agent Can Access the Project

Run a minimal scenario to verify:

```yaml
scenario: "Smoke test: Beki reads telejobs processing service"
agent: beki
steps:
  - send: >
      Read the README.md in the telejobs processing service and
      summarize the tech stack in 3 sentences.
    from: { platform: dashboard, user: kirill }
    metadata:
      workspace: "/home/newub/w/telejobs/services/processing-service"
    expect:
      outcome.response: exists
```

### 10. Monitoring & Iteration

After first real tasks:
- Check tick records for workspace path correctness
- Verify commits land in the right repo
- Verify MRs are created on the right GitLab project
- Watch for path escape (agent writing to galatea instead of telejobs)
- Adjust knowledge entries based on agent mistakes

---

## Checklist: Adding Beki to Telejobs

- [ ] Decide spec strategy: single spec with workspace override, or per-project spec
- [ ] Add Beki as Developer on GitLab projects (telejobs/tj-frontend, telejobs/tj-processor, telejobs/tj-collector)
- [ ] Verify GITLAB_TOKEN covers telejobs group
- [ ] Update agent spec with telejobs-specific tools_context (multi-repo glab commands)
- [ ] Update trust identities (add dasha, sonya; remove denis if not on telejobs)
- [ ] Seed initial knowledge entries about telejobs
- [ ] Update AGENTS.md in telejobs (already done)
- [ ] Verify .claude/CLAUDE.md in telejobs covers what agent needs (already good)
- [ ] Run smoke test scenario
- [ ] Run first real task, verify output lands in correct repo/branch
- [ ] Adjust hard_blocks if needed (e.g., telejobs has deploy scripts — block those?)
