# Sprint 12: Beta Simulation Phase 2 & Knowledge Loop Integration

**Sprint Duration:** 1 week (Mar 14-21, 2026)
**Objective:** Complete Phase 2-3 of Beta Simulation implementation and integrate work-to-knowledge pipeline. Enable multi-agent support and guide-controlled kiosk setup.
**Dependency:** Trust resolution (Sprint 11 - completed), Session resume (W.9 - done)

---

## Task 1: Extend TaskState and Artifact Types (W.6)

**Priority:** P0 (blocks Phase 4)
**Complexity:** Medium
**Time Est:** 1-2 days
**Owner:** Lead developer

### Description
Extend the `TaskState` type in operational memory to support artifacts, categories, and persistence across agent delegations. Create an `Artifact` type system for tracking files, MRs, commits, and other work outputs.

### Acceptance Criteria
- [ ] TaskState includes `artifacts: Artifact[]` field
- [ ] Artifact type supports: file (path, type), mr (id, url), commit (hash, message), docs (path)
- [ ] TaskState includes `category: "development" | "research" | "review" | "admin"` field
- [ ] Artifact validation: file paths must exist, MR IDs must match GitLab format
- [ ] 5 new unit tests in `server/agent/__tests__/task-state.test.ts`
- [ ] All existing tests pass without regression

### Implementation Notes
- File: `server/agent/operational-memory.ts` (extend TaskState)
- File: Create `server/agent/artifact.ts` (new type system)
- Update: `server/agent/__tests__/task-state.test.ts`
- Reference: Beta Simulation Implementation Plan, Phase 2 (W.6)

### Validation
```bash
pnpm vitest run server/agent/__tests__/task-state.test.ts -v
```

### Related Scenario
- L26-L35: Operational memory tier (verify artifact tracking)

---

## Task 2: Agent Spec Loading and Caching (W.8)

**Priority:** P0 (blocks Phase 3, 4)
**Complexity:** Low
**Time Est:** 1 day
**Owner:** Lead developer

### Description
Implement agent spec loading from YAML with type safety and caching. Validate spec structure and populate system prompt context with agent identity, tools, and knowledge_context.

### Acceptance Criteria
- [ ] `loadAgentSpec(agentId)` function reads `data/agents/{id}/spec.yaml`
- [ ] Caching with 5-minute TTL to avoid repeated FS reads
- [ ] Spec validation: required fields (id, name, role), trust config structure
- [ ] Type-safe: strict TypeScript interface `AgentSpec`
- [ ] Error handling: missing spec returns graceful default (not throws)
- [ ] 8 unit tests in `server/agent/__tests__/agent-spec.test.ts`
- [ ] All existing tests pass

### Implementation Notes
- File: Create `server/agent/agent-spec.ts`
- File: Create `server/agent/__tests__/agent-spec.test.ts`
- Reference spec: `data/agents/beki/spec.yaml` (already exists)
- Integrate: `server/agent/tick.ts` line ~165 already calls this

### Validation
```bash
pnpm vitest run server/agent/__tests__/agent-spec.test.ts -v
```

### Related Scenario
- L43-L48: Multi-agent identity (trust resolution verified)

---

## Task 3: Team Directory and Entity Resolution (W.13)

**Priority:** P0 (blocks Phase 4)
**Complexity:** Medium
**Time Est:** 1-2 days
**Owner:** Lead developer

### Description
Build a team directory system that maps Discord/GitLab identities to agent and human entities. Enable agent-to-human communication routing and context assembly with teammate knowledge.

### Acceptance Criteria
- [ ] TeamDirectory type with: entities (id, name, type, channels), relationships
- [ ] Load from `data/team/directory.yaml`
- [ ] Functions: `resolveEntity(channel, username)`, `getTeammateKnowledge(entityId)`
- [ ] Handles aliases: discord handle → agent id → CLAUDE.md knowledge
- [ ] 10 unit tests in `server/agent/__tests__/team-directory.test.ts`
- [ ] Integration test: Discord @mention → agent entity → knowledge lookup chain
- [ ] All existing tests pass

### Implementation Notes
- File: Create `server/agent/team-directory.ts`
- File: Create `server/agent/__tests__/team-directory.test.ts`
- File: Create `data/team/directory.yaml` (fixture with beki, besa, kirill, sasha)
- Integrate: `server/agent/tick.ts` line ~210-212 (identity resolution)

### Sample Fixture
```yaml
entities:
  - id: beki
    type: agent
    name: "Beta Kirill"
    channels:
      discord: kirill_dev
      gitlab: kirill
  - id: sasha
    type: human
    name: "Sasha (PM)"
    channels:
      discord: sasha_pm
      gitlab: sasha
```

### Validation
```bash
pnpm vitest run server/agent/__tests__/team-directory.test.ts -v
pnpm vitest run server/agent/__tests__/team-identity.acceptance.test.ts -v
```

### Related Scenario
- L43-L48: Team identity and trust matrix

---

## Task 4: Two-Level Routing with Context Awareness (W.5)

**Priority:** P0 (Phase 4)
**Complexity:** High
**Time Est:** 2 days
**Owner:** Lead developer

### Description
Implement routing that distinguishes between direct agent calls (@Agent-Dev-1) and delegated work via Claude Code SDK. Route messages intelligently: Discord mentions → tick loop, complex tasks → SDK delegation with full context.

### Acceptance Criteria
- [ ] Routing logic: `if (@Agent mention) → tick loop else if (heavy task) → SDK else → respond`
- [ ] SDK delegation receives full system prompt (identity + knowledge + homeostasis guidance)
- [ ] Tick loop receives lightweight context (recent history, current task only)
- [ ] Message parsing: extract @mention patterns from Discord messages
- [ ] 8 scenarios in `server/agent/__tests__/tick-routing.acceptance.test.ts`
- [ ] All existing tests pass, no regression

### Implementation Notes
- File: Modify `server/agent/tick.ts` (routing logic, ~line 250)
- File: Create `server/agent/__tests__/tick-routing.acceptance.test.ts`
- Reference: Current tick.ts has branches for `delegate` vs `respond` (line 286+)
- Ensure: Both paths populate `artifacts` correctly for work-to-knowledge (Task 6)

### Scenarios to Cover
1. @beki direct mention → tick loop
2. "Can you review this PR?" → tick loop
3. "Build a full feature from scratch" → SDK delegation
4. Unknown platform → fail gracefully
5. Trust LOW but message is direct mention → still route to tick (trust handled separately)

### Validation
```bash
pnpm vitest run server/agent/__tests__/tick-routing.acceptance.test.ts -v
```

### Related Scenario
- L36-L48: Homeostasis guidance injected into both paths

---

## Task 5: Tick Decision Record and Observability (W.12)

**Priority:** P1
**Complexity:** Medium
**Time Est:** 1-2 days
**Owner:** Observability lead

### Description
Build TickDecisionRecord system for logging every tick decision with trigger (message/heartbeat/internal), homeostasis assessment, and action taken. Enable fleet dashboard to monitor agent behavior.

### Acceptance Criteria
- [ ] TickDecisionRecord type: trigger, homeostasis (all 7 dims), action, timestamp, agentId
- [ ] Persist to JSONL: `data/agents/{agentId}/tick-records.jsonl`
- [ ] API endpoint: `GET /api/agent/{agentId}/ticks` (paginated, last 50)
- [ ] Fleet dashboard: shows all agents' latest tick (status, last action, homeostasis radar)
- [ ] 8 unit tests in `server/observation/__tests__/tick-record.test.ts`
- [ ] 4 integration tests: tick → record → API → dashboard flow
- [ ] All existing tests pass

### Implementation Notes
- File: Modify `server/observation/tick-record.ts` (trust resolution already added in Sprint 11)
- File: Modify `server/agent/tick.ts` (call `buildTickRecord` at end)
- File: Create `server/routes/agent-ticks.ts` (new endpoint)
- File: Modify dashboard `components/fleet-status.tsx` (show all agents)

### Tick Record Structure
```typescript
interface TickDecisionRecord {
  id: string
  agentId: string
  timestamp: string
  trigger: {
    type: "message" | "heartbeat" | "internal"
    source?: string              // "discord:sasha"
    trustLevel?: string          // "HIGH", "ABSOLUTE"
  }
  homeostasis: {
    knowledge_sufficiency: "LOW" | "HEALTHY" | "HIGH"
    certainty_alignment: "LOW" | "HEALTHY" | "HIGH"
    progress_momentum: "LOW" | "HEALTHY" | "HIGH"
    communication_health: "LOW" | "HEALTHY" | "HIGH"
    productive_engagement: "LOW" | "HEALTHY" | "HIGH"
    knowledge_application: "LOW" | "HEALTHY" | "HIGH"
    self_preservation: "LOW" | "HEALTHY" | "HIGH"
  }
  action: "delegate" | "respond" | "template" | "idle"
  guidance?: string[]           // injected guidance from LOW dimensions
}
```

### Validation
```bash
pnpm vitest run server/observation/__tests__/ -v
```

### Related Scenario
- L36-L48: Every scenario now verifies tick decision record matches expected homeostasis state

---

## Task 6: Work-to-Knowledge Pipeline (W.10 + W.11)

**Priority:** P1 (completes feedback loop)
**Complexity:** High
**Time Est:** 2-3 days
**Owner:** Memory lead

### Description
When a task completes, convert progress and artifacts into KnowledgeEntries. Extract facts ("Completed feature X"), procedures (step-by-step progress), and self-observations (mistakes, patterns).

### Acceptance Criteria
- [ ] `taskToKnowledge(task)` converts TaskState to KnowledgeEntry[]
- [ ] Handles: facts (completion), procedures (≥3 steps), self-observations
- [ ] Extracts entities from artifacts (file paths, MR authors, commit messages)
- [ ] Confidence scoring: completed facts = 1.0, procedures = 0.8, observations = 0.7
- [ ] Stores entries with source = `task:{taskId}` for traceability
- [ ] Self-observations include agent self-model updates ("I missed null checks")
- [ ] 10 unit tests in `server/memory/__tests__/work-to-knowledge.test.ts`
- [ ] 3 integration tests: task complete → knowledge → retrieval chain
- [ ] All existing tests pass

### Implementation Notes
- File: Create `server/memory/work-to-knowledge.ts`
- File: Create `server/memory/__tests__/work-to-knowledge.test.ts`
- File: Modify `server/agent/tick.ts` line ~390 (call after task status → "done")
- Ensure: Calls `knowledgeStore.appendEntry()` to persist

### Sample Output
```typescript
// Input: TaskState
{
  id: "task-123",
  description: "Implement user authentication",
  status: "done",
  progress: ["Added Clerk provider", "Created login page", "Tested sign-up flow"],
  artifacts: ["app/auth/route.ts", "components/LoginForm.tsx", "MR !45"]
}

// Output: KnowledgeEntry[]
[
  {
    type: "fact",
    content: "Completed: Implement user authentication. Artifacts: app/auth/route.ts, components/LoginForm.tsx, MR !45",
    confidence: 1.0,
    source: "task:task-123"
  },
  {
    type: "procedure",
    content: "Add Clerk provider\nCreate login page\nTest sign-up flow",
    confidence: 0.8,
    source: "task:task-123"
  }
]
```

### Validation
```bash
pnpm vitest run server/memory/__tests__/work-to-knowledge.test.ts -v
pnpm vitest run server/memory/__tests__/work-to-knowledge.acceptance.test.ts -v
```

### Related Scenario
- Memory Scenario 7: Promotion (episode counting)
- Memory Scenario 13: Procedures (success_rate tracking)

---

## Task 7: Guide-Controlled Kiosk Task Routing (NEW - Constraint)

**Priority:** P1 (required by constraints)
**Complexity:** Medium
**Time Est:** 1-2 days
**Owner:** Kiosk/guide integration lead

### Description
Wire the guide-controlled kiosk player to route messages to Galatea agents via Discord. Enable guides (PMs) to assign tasks to agents from the guide app, with real-time status updates. This closes the loop: kiosk guide → Discord message → agent work → status update → guide app UI.

### Acceptance Criteria
- [ ] Guide app sends Discord messages with format: `@agent task: description`
- [ ] Task routing recognizes guide app channel (create `discord:guide` channel)
- [ ] Agent responds with status link: `See work at: {url}`
- [ ] Guide app polls `/api/agent/{agentId}/ticks` for status (task complete, in progress, blocked)
- [ ] Status update badge on guide player UI (green=done, yellow=in_progress, red=blocked)
- [ ] 6 scenarios in `scenarios/kiosk-guide-*.yaml` (task assign, status update, completion)
- [ ] All existing tests pass

### Implementation Notes
- File: Create Discord guide channel adapter (modify `server/discord/message-adapter.ts`)
- File: Create `server/routes/agent-guide-status.ts` (new endpoint for guide app polling)
- File: Create `scenarios/kiosk-guide-task-assignment.yaml`, `kiosk-guide-status-update.yaml`, etc.
- Config: Add `discord.channels.guide = "guide-channel-id"` to beki spec
- Integration: Guide app uses existing `/api/agent/{agentId}/ticks` + new `/api/agent/{agentId}/guide-status`

### Scenarios to Cover
1. Guide sends "Build user profile screen"
2. Agent acknowledges task assignment
3. Agent reports "In progress (60%)"
4. Agent reports "Complete, MR ready for review"
5. Guide UI updates status badge
6. Multiple concurrent tasks from multiple guides

### Validation
```bash
pnpm tsx scripts/run-scenario.ts scenarios/kiosk-guide-*.yaml -v
```

### Related to
- Constraints: "Remember to add a task for guide-controlled kiosk functionality"
- Existing: Guide App is a PWA for tablet (from CLAUDE.md context)

---

## Task 8: Regression Testing & Sprint Completion (W.14)

**Priority:** P1
**Complexity:** Low
**Time Est:** 1 day
**Owner:** QA lead

### Description
Run full regression test suite covering all scenarios (L1-L48, Trace 1-21, Kiosk guide 1-6) and create Sprint 12 completion report.

### Acceptance Criteria
- [ ] Run: `pnpm vitest run server/ --reporter=verbose` → All pass, no failures
- [ ] Run: `pnpm tsx scripts/run-scenario.ts scenarios/*.yaml` → All scenarios pass (50+ total)
- [ ] Run: `pnpm tsx scripts/run-scenario.ts scenarios/kiosk-guide-*.yaml` → All 6 pass
- [ ] Create `docs/reports/2026-03-21-sprint-12-completion.md` with:
  - Tasks completed (8 total)
  - Scenarios passing (L-levels, Traces, Kiosk)
  - Test coverage (unit + acceptance + regression)
  - Known issues (if any)
  - Next sprint recommendations
- [ ] Commit: "docs: Sprint 12 completion report"

### Validation
```bash
pnpm vitest run server/ --reporter=verbose
pnpm tsx scripts/run-scenario.ts scenarios/*.yaml
```

---

## Sprint 12 Dependencies & Critical Path

```
Task 1 (TaskState)  ──┐
                       ├──► Task 4 (Routing)  ──┐
Task 2 (AgentSpec)  ──┤                         ├──► Task 6 (W2K)  ──► Task 8 (Regression)
                       │                         │
Task 3 (TeamDir)    ──┤                         │
                       ├──► Task 5 (TickRecord)─┘
                       │
Task 7 (Kiosk)  ────────────────────────────────┘ (independent, then integrates)
```

**Critical Path:** Task 1 + Task 2 + Task 3 → Task 4 → Task 6 → Task 8 (5-6 days)
**Parallelizable:** Task 7 can run alongside Task 1-3

---

## Metrics & Success Criteria

| Metric | Target | Status |
|--------|--------|--------|
| Unit tests passing | 100% | TBD |
| Acceptance tests | 8/8 | TBD |
| Scenarios passing (L36-L48 + Kiosk) | 14/14 | TBD |
| Code coverage (server/) | >80% | TBD |
| Sprint velocity | 8 tasks | On track |
| Kiosk integration wired | Yes | TBD |

---

## Post-Sprint 12 Roadmap (Sprint 13+)

**Sprint 13:** Multi-agent instantiation + persona export
- Task: Spawn multiple agents with different specs
- Task: Export persona to `.claude/agents/{name}.md`
- Task: Agent registry + discovery

**Sprint 14:** Discord guild integration + advanced scenarios
- Task: Support Discord guilds (not just DMs)
- Task: Run validation with real PM users (Beki + Besa + real Kirill)

**Sprint 15+:** Production hardening + cloud deployment
- Task: Persistent storage layer (cloud PostgreSQL)
- Task: Multi-region support
- Task: Cost tracking and optimization
