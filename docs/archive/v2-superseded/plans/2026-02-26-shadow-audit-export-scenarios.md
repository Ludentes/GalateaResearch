# Shadow → Audit → Export Scenarios

**Date:** 2026-02-26
**Purpose:** Formalize the developer experience of shadow learning, knowledge audit, and artifact export
**Builds on:** `docs/plans/2026-02-24-evidence-based-memory-gherkin-scenarios.md` (pipeline internals)
**Design docs:**
- `docs/plans/2026-02-24-evidence-based-memory-lifecycle-design.md`
- `docs/research/2026-02-24-what-goes-where-claude-md-skills-hooks.md`
- `docs/research/2026-02-24-skillsbench-agents-md-research.md`

---

## Key Design Decisions

1. **Extraction trigger:** Session end (Claude Code SessionEnd hook)
2. **Knowledge store:** Entries flow in freely — usable by context assembly immediately
3. **Curation gates artifacts only:** Entries must be `approved` to appear in exported CLAUDE.md/skills/hooks
4. **Audit is manual, in command center web UI:** Dev chooses when to review
5. **Export is manual:** Dev triggers artifact generation, reviews diff, commits

---

## The Three Phases

```
SHADOW                          AUDIT                           EXPORT
─────────────────────          ─────────────────────           ─────────────────────
Dev works in Claude Code       Dev opens command center        Dev triggers export
Sessions end → extraction      Sees accumulated entries        Artifacts generated from
Entries accumulate in store    Approves / rejects / edits      approved entries only
Context assembly uses them     Entries update in store         Dev reviews file diff
immediately (no gate)                                          Dev commits to repo
```

---

## Scenario S1: Basic shadow → audit → export cycle

```gherkin
Feature: Developer shadows, audits, and exports artifacts

  Background:
    Given a developer working on project "umka"
    And an empty knowledge store
    And shadow learning is enabled with strategy "cloud"

  Scenario: Three work sessions produce knowledge that becomes CLAUDE.md
    # === SHADOW PHASE ===
    When the developer completes a coding session where they say:
      | turn                                              |
      | "Always use pnpm, not npm"                        |
      | "Let's use PostgreSQL for the database"           |
      | "Deploy to staging first, always"                 |
    And the session ends

    Then the extraction pipeline runs automatically
    And the knowledge store gains 3 entries:
      | content                    | type       | confidence | origin             | curationStatus |
      | Use pnpm, not npm          | preference | 0.95       | explicit-statement | approved       |
      | Use PostgreSQL for database| decision   | 0.90       | explicit-statement | approved       |
      | Deploy to staging first    | rule       | 0.95       | explicit-statement | approved       |
    # Note: explicit statements with conf >= 0.90 are auto-approved
    # They are usable by context assembly immediately

    When the developer completes a second session where:
      | turn                                                                    |
      | The LLM observes the developer using conventional commits               |
      | The developer debugs a z-index layering bug and fixes it                |
    And the session ends

    Then the extraction pipeline runs
    And the knowledge store gains 2 more entries:
      | content                               | type       | confidence | origin           | curationStatus |
      | Team uses conventional commits        | fact       | 0.70       | inferred         | pending        |
      | z-index layering causes click issues  | correction | 0.90       | observed-failure | pending        |
    # Inferred entry capped at 0.70. Neither is auto-approved (not explicit-statement).

    # === AUDIT PHASE ===
    When the developer opens the command center
    And navigates to the knowledge audit page

    Then they see 5 entries total:
      | content                    | curationStatus | proposedTarget |
      | Use pnpm, not npm          | approved       | claude_md      |
      | Use PostgreSQL for database| approved       | claude_md      |
      | Deploy to staging first    | approved       | claude_md      |
      | Team uses conventional commits | pending    | claude_md      |
      | z-index layering causes click issues | pending | claude_md  |

    When the developer reviews the pending entries:
      - Approves "z-index layering causes click issues"
      - Rejects "Team uses conventional commits" (too vague, not actually a team rule)

    Then the store is updated:
      | content                               | curationStatus |
      | z-index layering causes click issues  | approved       |
      | Team uses conventional commits        | rejected       |

    # === EXPORT PHASE ===
    When the developer clicks "Export Artifacts"

    Then the artifact generator reads all approved entries
    And produces a CLAUDE.md with sections:
      """
      ## Preferences
      - Use pnpm, not npm

      ## Architecture Decisions
      - Use PostgreSQL for database

      ## Guardrails
      - Deploy to staging first, always
      - z-index layering can cause click-through issues on overlapping elements
      """
    And the developer sees a file diff preview
    And no skill files are generated (no approved procedures)
    And no hook files are generated (no enforceable rule patterns)

    When the developer confirms the export
    Then .claude/CLAUDE.md is written to disk
    And the developer can commit it to the repository
```

---

## Scenario S2: Audit with content editing

```gherkin
Feature: Developer edits entry content during audit

  Scenario: Developer improves wording before approving
    Given the knowledge store contains a pending entry:
      | content                                                              | type       | curationStatus |
      | in case of update in typeorm for nullable field we should specify null | rule      | pending        |

    When the developer opens the audit page
    And selects the entry for editing
    And changes the content to "TypeORM: use null (not undefined) for nullable field updates"
    And approves the edited entry

    Then the store entry is updated with the new content
    And curationStatus becomes "approved"
    And curatedBy becomes the developer's identity
    And the original content is preserved in the evidence field
```

---

## Scenario S3: Audit changes artifact target

```gherkin
Feature: Developer overrides the proposed artifact target

  Scenario: Developer routes a rule to hook instead of CLAUDE.md
    Given the knowledge store contains an approved entry:
      | content                     | type | proposedTarget | curationStatus |
      | Never push directly to main | rule | claude_md      | approved       |

    When the developer opens the audit page
    And sees the entry proposed for CLAUDE.md
    And changes the target to "hook"
    And confirms

    Then the entry gets targetOverride = "hook"
    And on next export, the entry appears in hooks, not CLAUDE.md

  Scenario: Developer moves a fact to "none" (knowledge store only)
    Given an approved entry:
      | content                               | type | proposedTarget |
      | Sentinel uses 3-tier watchdog recovery | fact | claude_md      |

    When the developer changes the target to "none"
    Then the entry stays in the knowledge store (usable by context assembly)
    But it will NOT appear in any exported artifact
```

---

## Scenario S4: Export respects budgets

```gherkin
Feature: Artifact export enforces size budgets from config

  Scenario: CLAUDE.md stays under 200 lines
    Given the knowledge store contains 250 approved entries routed to claude_md
    And config has claude_md.max_lines = 200

    When the developer triggers export

    Then the artifact generator ranks entries by:
      | factor          | weight |
      | confidence      | 0.3    |
      | impactScore     | 0.4    |
      | recency         | 0.2    |
      | origin priority | 0.1    |
    And selects the top entries that fit within 200 lines
    And the developer sees which entries were included and which were cut
    And the export preview shows line count

  Scenario: Skills capped at 3 files
    Given the knowledge store contains 8 approved procedure clusters
    And config has skills.max_count = 3

    When the developer triggers export

    Then only the top 3 procedure clusters by ranking become skill files
    And each skill file is under 100 lines
    And the developer sees all 8 clusters with the top 3 marked as "will export"
```

---

## Scenario S5: Context assembly uses entries before audit

```gherkin
Feature: Knowledge store entries are usable before curation

  Scenario: Pending entry is used by context assembly during a session
    Given the knowledge store contains:
      | content                 | curationStatus | confidence |
      | Use pnpm, not npm       | approved       | 0.95       |
      | PostgreSQL for database | pending        | 0.70       |

    When a new coding session starts
    And the context assembler retrieves relevant entries

    Then both entries are eligible for inclusion in the system prompt
    And the pending entry is included if relevant (context assembly ignores curationStatus)
    And exposure tracking increments for both entries

    # The difference: only "approved" entries appear in exported artifacts
    When the developer triggers export
    Then only "Use pnpm, not npm" appears in CLAUDE.md
    And "PostgreSQL for database" does NOT appear (still pending)
```

---

## Scenario S6: Multiple audit cycles before export

```gherkin
Feature: Developer can audit incrementally over time

  Scenario: Dev audits weekly, exports monthly
    # Week 1: 15 new entries extracted
    Given 15 entries accumulated from week 1 sessions
    When the developer audits
    Then they approve 10, reject 3, leave 2 pending for later

    # Week 2: 12 more entries extracted
    Given 12 more entries accumulated from week 2 sessions
    When the developer audits
    Then they approve 8, reject 2, leave 2 pending
    And they also approve the 2 left pending from week 1

    # Week 3: 8 more entries
    Given 8 more entries accumulated
    When the developer audits
    Then they approve 5, reject 3

    # Monthly export
    When the developer triggers export
    Then artifacts are generated from all 25 approved entries (10 + 2 + 8 + 5)
    And the 8 rejected entries are excluded
    And the developer reviews the complete artifact diff
```

---

## Scenario S7: Re-export after changes

```gherkin
Feature: Developer can re-export artifacts after knowledge store changes

  Scenario: New entries added since last export
    Given the developer exported artifacts last week with 20 approved entries
    And since then, 5 new entries have been approved

    When the developer triggers export again

    Then the artifact generator produces updated files
    And the diff shows only the additions from the 5 new entries
    And previously exported entries are still present

  Scenario: Developer rejects a previously approved entry
    Given CLAUDE.md contains "Use event-based sync" from a previous export
    And the developer now rejects that entry in the audit UI

    When the developer triggers export

    Then CLAUDE.md is regenerated WITHOUT "Use event-based sync"
    And the diff shows the removal
```

---

## Scenario S8: Extraction during active work (non-blocking)

```gherkin
Feature: Extraction does not block the developer's work

  Scenario: Session ends, extraction runs in background
    When the developer finishes a Claude Code session

    Then the SessionEnd hook fires
    And extraction runs asynchronously (does not block the next session)
    And if extraction fails, it logs an error but does not affect the developer
    And the developer can start a new session immediately

  Scenario: Developer starts new session before extraction completes
    When the developer ends session A
    And starts session B within 5 seconds

    Then session A's extraction runs in the background
    And session B's context assembly uses whatever is in the store at that moment
    And when session A's extraction completes, new entries appear in the store
    And they become available to session B's context assembly on next retrieval
```

---

## Scenario S9: Empty states and first-time experience

```gherkin
Feature: Clean experience when knowledge store is empty

  Scenario: First visit to audit page with no entries
    Given an empty knowledge store
    When the developer opens the audit page
    Then they see a message: "No knowledge entries yet. Start a coding session to begin learning."

  Scenario: First export with no approved entries
    Given knowledge store has only pending entries
    When the developer tries to export
    Then they see: "No approved entries to export. Review pending entries first."

  Scenario: First export after approving entries
    Given the developer just approved their first 3 entries
    When they export
    Then they see a CLAUDE.md preview with those 3 entries
    And a note: "This will create .claude/CLAUDE.md (new file)"
```

---

## Scenario S10: Audit UI filtering and bulk actions

```gherkin
Feature: Audit UI supports efficient review workflows

  Scenario: Filter by curation status
    Given 50 entries in the store (30 approved, 15 pending, 5 rejected)
    When the developer filters by "pending"
    Then they see only the 15 pending entries

  Scenario: Filter by entry type
    When the developer filters by type = "procedure"
    Then they see only procedure entries
    And each shows where it would be exported (skill file name)

  Scenario: Filter by proposed target
    When the developer filters by target = "hook"
    Then they see only entries that would become hooks

  Scenario: Bulk approve
    When the developer selects 10 pending entries
    And clicks "Approve Selected"
    Then all 10 entries get curationStatus = "approved"

  Scenario: Bulk reject
    When the developer selects 5 entries
    And clicks "Reject Selected"
    Then all 5 entries get curationStatus = "rejected"
```

---

## Summary: What These Scenarios Require

### Command Center Features
1. **Audit page** — list entries with filters (status, type, target), bulk actions
2. **Entry detail view** — content editing, target override, evidence display
3. **Export page** — preview artifacts, show diff, line count budgets, confirm button
4. **Dashboard widget** — "12 pending entries awaiting review"

### Pipeline Features (beyond existing)
1. **Artifact generator** — reads approved entries, applies routing + budgets, outputs files
2. **Target routing** — computes proposedTarget for each entry (claude_md, skill, hook, none)
3. **Target override** — dev can change the proposed target
4. **Export diffing** — compare current artifacts on disk vs. generated output
5. **Ranking** — when budget is exceeded, rank entries by confidence × impact × recency

### Knowledge Store Fields (new or clarified)
1. `curationStatus`: "pending" | "approved" | "rejected" (existing)
2. `curatedBy`: who approved/rejected (existing)
3. `curatedAt`: when (existing)
4. `proposedTarget`: "claude_md" | "skill" | "hook" | "none" (new — computed by router)
5. `targetOverride`: optional dev override of proposedTarget (new)
6. `evidence`: original transcript text (existing)

---

## Evaluation Criteria

These scenarios should be used to evaluate any implementation plan. A plan is complete if it supports:

- [ ] S1: Basic shadow → audit → export cycle
- [ ] S2: Content editing during audit
- [ ] S3: Target override during audit
- [ ] S4: Budget enforcement on export
- [ ] S5: Context assembly before curation
- [ ] S6: Incremental audit over time
- [ ] S7: Re-export and removal
- [ ] S8: Non-blocking extraction
- [ ] S9: Empty states
- [ ] S10: Filtering and bulk actions
