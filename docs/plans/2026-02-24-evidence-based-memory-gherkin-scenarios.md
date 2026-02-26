# Evidence-Based Memory Lifecycle — Gherkin Scenarios & Expected Traces

**Date:** 2026-02-24
**Purpose:** Full pipeline verification scenarios grounded in real data from `data/memory/entries.jsonl`
**Design doc:** `docs/plans/2026-02-24-evidence-based-memory-lifecycle-design.md`

---

## Real Data Analysis

Before designing scenarios, we analyzed 212 real entries from 4 extraction sessions:

| Metric | Value | Implication |
|--------|-------|-------------|
| Total entries | 212 | From 4 sessions — high extraction volume |
| All confidence >= 0.9 | 100% | **No discrimination — everything treated as high-confidence** |
| Type: fact | 87 (41%) | Largest category — many are ephemeral/obvious |
| Type: procedure | 69 (33%) | Many are project-specific — skill candidates |
| Type: correction | 29 (14%) | Bug fixes — observed-failure, good signal |
| Type: preference | 19 (9%) | Most from explicit user statements |
| Type: rule | 4 (2%) | Low count but high value — hook candidates |
| Type: decision | 4 (2%) | Architectural decisions |
| Has entities | 75 (35%) | Most entries have empty entity arrays |
| Has about field | 1 (0.5%) | Almost never used |

**Problem:** Everything extracted at confidence 1.0 with no novelty or origin classification. The new pipeline must:
1. Filter general-knowledge at extraction
2. Classify novelty and origin
3. Cap inferred entries at 0.70 confidence
4. Route to appropriate channels
5. Require curation before artifact generation
6. Track outcomes and adjust

---

## Pipeline Stages Reference

```
Transcript → Signal → Extract(+novelty,origin) → NoveltyGate → AutoApproval
  → Dedup → Store → [Decay] → ChannelRouter → [CurationQueue] → Artifacts
  → ContextAssembly(+exposureTracking) → [FeedbackLoop] → back to Store
```

---

## Scenario 1: Explicit preference → auto-approved → CLAUDE.md

**Based on real entry:** `"Use pnpm as the package manager"` (entry e98831b9)

```gherkin
Feature: Explicit preference reaches CLAUDE.md via auto-approval

  Scenario: User explicitly states a package manager preference
    # --- Stage 1-2: Transcript + Signal ---
    Given a transcript turn where the user says "Let's use pnpm for this project"
    And the signal classifier classifies it as "preference"

    # --- Stage 3: Extraction ---
    When the knowledge extractor processes the turn
    Then it produces an entry with:
      | field      | value              |
      | type       | preference         |
      | content    | Use pnpm as the package manager |
      | confidence | 0.95               |
      | novelty    | project-specific   |
      | origin     | explicit-statement |
      | evidence   | User said: Let's use pnpm for this project |

    # --- Stage 3b: Novelty Gate ---
    And the novelty gate passes the entry (novelty != "general-knowledge")
    And the inferred confidence cap does not apply (origin != "inferred")

    # --- Stage 3c: Auto-Approval ---
    And the entry is auto-approved because:
      | condition                      | value |
      | origin == "explicit-statement" | true  |
      | confidence >= 0.90             | true  |
    And the entry has:
      | field           | value         |
      | curationStatus  | approved      |
      | curatedBy       | auto-approved |

    # --- Stage 4-5: Dedup + Store ---
    And deduplication finds no existing match
    And the entry is appended to the knowledge store with:
      | field            | value |
      | sessionsExposed  | 0     |
      | sessionsHelpful  | 0     |
      | sessionsHarmful  | 0     |

    # --- Stage 7: Channel Router ---
    When the channel router processes active entries
    Then the entry is routed to "claude-md" because:
      | condition                   | met  |
      | curationStatus == approved  | true |
      | confidence >= 0.90          | true |
      | type != procedure           | true |
      | no enforcedBy               | true |

    # --- Artifact Generation ---
    When CLAUDE.md is regenerated
    Then it contains "Use pnpm as the package manager" in the Preferences section
    And CLAUDE.md is under 200 lines total
```

### Expected Trace

```
INPUT:  "Let's use pnpm for this project"
  ↓ signal-classifier → SIGNAL (preference)
  ↓ knowledge-extractor → {type: "preference", content: "Use pnpm as the package manager",
                            confidence: 0.95, novelty: "project-specific",
                            origin: "explicit-statement"}
  ↓ novelty-gate → PASS
  ↓ inferred-cap → NO-OP (not inferred)
  ↓ auto-approval → APPROVED (explicit + 0.95 >= 0.90)
  ↓ dedup → NEW
  ↓ store → STORED {curationStatus: "approved", sessionsExposed: 0}
  ↓ channel-router → CLAUDE-MD
  ↓ artifact-gen → appears in CLAUDE.md ## Preferences
OUTPUT: CLAUDE.md updated
```

---

## Scenario 2: Explicit rule → auto-approved → hook candidate → curation required

**Based on real entry:** `"Never deploy on Fridays"` (entry 8384672d)

```gherkin
Feature: Explicit rule becomes a hook candidate requiring human approval

  Scenario: User states a deployment rule that matches hook pattern
    Given a transcript turn where the user says "Also, never deploy on Fridays"
    And the signal classifier classifies it as "rule/policy"

    When the knowledge extractor processes the turn
    Then it produces an entry with:
      | field      | value                    |
      | type       | rule                     |
      | content    | Never deploy on Fridays  |
      | confidence | 1.0                      |
      | novelty    | project-specific         |
      | origin     | explicit-statement       |

    And the entry is auto-approved (explicit-statement + confidence 1.0)

    When the channel router processes the entry
    Then the entry is routed to "hook" because:
      | condition                | met  |
      | type == rule             | true |
      | matches deploy pattern   | true |
    And a curation queue item is created with:
      | field   | value        |
      | action  | approve-hook |
      | reason  | Hook-routed entries always require human approval |

    # Hook is NOT generated until human approves
    Then no hook file is generated yet
    And the entry remains in store with targetChannel = "hook"

    When a human approves the hook curation item
    Then a hook pattern is added to learned-hook-patterns.json
    And the entry gets enforcedBy = "hook"
```

### Expected Trace

```
INPUT:  "Also, never deploy on Fridays"
  ↓ signal-classifier → SIGNAL (rule/policy)
  ↓ knowledge-extractor → {type: "rule", content: "Never deploy on Fridays",
                            confidence: 1.0, novelty: "project-specific",
                            origin: "explicit-statement"}
  ↓ novelty-gate → PASS
  ↓ auto-approval → APPROVED
  ↓ store → STORED {curationStatus: "approved"}
  ↓ channel-router → HOOK (rule + deploy pattern)
  ↓ curation-queue → PENDING {action: "approve-hook"}
  ✗ artifact-gen → BLOCKED (hook needs human approval)
  ...later...
  ↓ human approves → enforcedBy: "hook"
  ↓ hook-gen → learned-hook-patterns.json updated
OUTPUT: Hook enforces "no Friday deploys" deterministically
```

---

## Scenario 3: Observed failure → pending curation → CLAUDE.md after approval

**Based on real entry:** `"The video player back button was not working due to z-index layering issues"` (entry 7385ec8d)

```gherkin
Feature: Correction from observed failure requires curation before CLAUDE.md

  Scenario: Bug fix produces a correction that needs human review
    Given a transcript where the user reported "the back button was not pressable"
    And the assistant diagnosed and fixed a z-index layering issue

    When the knowledge extractor processes the exchange
    Then it produces an entry with:
      | field      | value                                                         |
      | type       | correction                                                    |
      | content    | Video player back button blocked by z-index of play button div |
      | confidence | 0.90                                                          |
      | novelty    | project-specific                                              |
      | origin     | observed-failure                                              |

    # NOT auto-approved (origin != explicit-statement)
    And the entry is NOT auto-approved because origin is "observed-failure"
    And the entry has curationStatus = "pending"

    When the channel router processes the entry
    Then the entry is routed to "claude-md" (candidate) but blocked by curation
    And a curation queue item is created with:
      | field   | value         |
      | action  | approve-entry |

    Then the entry does NOT appear in CLAUDE.md yet

    When a human approves the curation item
    Then curationStatus becomes "approved"
    And CLAUDE.md is regenerated with the entry in the Corrections section
```

### Expected Trace

```
INPUT:  User reports back button not pressable + assistant fixes z-index
  ↓ signal-classifier → SIGNAL (correction)
  ↓ knowledge-extractor → {type: "correction", confidence: 0.90,
                            novelty: "project-specific", origin: "observed-failure"}
  ↓ novelty-gate → PASS
  ↓ auto-approval → SKIP (origin != explicit-statement)
  ↓ store → STORED {curationStatus: "pending"}
  ↓ channel-router → CLAUDE-MD (candidate, blocked by curation)
  ↓ curation-queue → PENDING {action: "approve-entry"}
  ✗ artifact-gen → NOT INCLUDED (pending curation)
  ...later...
  ↓ human approves → curationStatus: "approved"
  ↓ artifact-gen → appears in CLAUDE.md
OUTPUT: Correction in CLAUDE.md after human review
```

---

## Scenario 4: Inferred fact → confidence capped → stays pending → eventually decays

**Synthetic scenario — common pattern in real data where LLM infers things**

```gherkin
Feature: Inferred knowledge gets capped and eventually decays without curation

  Scenario: LLM infers a team practice that nobody explicitly stated
    Given a transcript where the assistant observes some agile-like patterns
    And there is no explicit statement about methodology

    When the knowledge extractor processes the transcript
    Then it produces an entry with:
      | field      | value                 |
      | type       | fact                  |
      | content    | Team uses agile methodology |
      | confidence | 0.85                  |
      | novelty    | domain-specific       |
      | origin     | inferred              |

    # Confidence cap applies
    And the inferred confidence cap reduces confidence to 0.70
    And the entry is NOT auto-approved (origin = "inferred")
    And curationStatus = "pending"

    When the channel router processes the entry
    Then the entry is routed to "none" because:
      | condition                   | met   |
      | confidence (0.70) >= 0.90   | false |
      | Below CLAUDE.md threshold   | true  |

    # Grace period for inferred = 15 days (0.5x base)
    When 15 days pass without retrieval or curation
    Then decay begins with base factor 0.95 per day

    When 45 more days pass (60 total)
    Then confidence has decayed to approximately 0.25
    And the entry is archived (below 0.3 threshold)
```

### Expected Trace

```
INPUT:  Assistant observes agile-like patterns in transcript
  ↓ knowledge-extractor → {type: "fact", confidence: 0.85,
                            novelty: "domain-specific", origin: "inferred"}
  ↓ novelty-gate → PASS (domain-specific, not general)
  ↓ inferred-cap → CAPPED to 0.70
  ↓ auto-approval → SKIP (origin = "inferred")
  ↓ store → STORED {curationStatus: "pending", confidence: 0.70}
  ↓ channel-router → NONE (conf 0.70 < 0.90 CLAUDE.md threshold)
  ↓ curation-queue → PENDING (low priority)
  ...15 days (inferred grace)...
  ↓ decay → confidence dropping at 0.95^days
  ...60 days total...
  ↓ decay → confidence ≈ 0.25 → ARCHIVED
OUTPUT: Entry silently archived, never reached any artifact
```

---

## Scenario 5: General knowledge → dropped at extraction gate

**Based on the SkillsBench finding that SWE domain has lowest gains (+4.5pp)**

```gherkin
Feature: General programming knowledge is dropped before reaching the store

  Scenario: LLM extracts obvious programming advice
    Given a transcript where the assistant mentions error handling best practices
    And the advice is "Always handle errors in async functions"

    When the knowledge extractor processes the transcript
    Then it produces a raw entry with:
      | field      | value                              |
      | type       | rule                               |
      | content    | Always handle errors in async functions |
      | confidence | 0.60                               |
      | novelty    | general-knowledge                  |
      | origin     | inferred                           |

    # Novelty gate drops it
    And the novelty gate DROPS the entry because novelty = "general-knowledge"
    And the entry is NOT stored
    And no curation queue item is created
    And the entry never appears in any artifact

  Scenario: LLM extracts "use version control"
    Given a transcript turn about git workflow
    When the extractor produces {novelty: "general-knowledge", content: "Use version control"}
    Then the novelty gate drops it
    And extraction stats show 1 entry in "droppedByNoveltyFilter"
```

### Expected Trace

```
INPUT:  "Always handle errors in async functions"
  ↓ knowledge-extractor → {novelty: "general-knowledge", origin: "inferred", conf: 0.60}
  ↓ novelty-gate → DROPPED (general-knowledge)
  ✗ Does not reach store, curation, routing, or artifacts
OUTPUT: Nothing. Entry silently discarded. Stats incremented.
```

---

## Scenario 6: Procedure cluster → skill file after curation

**Based on real data: 69 procedures extracted, many project-specific**

```gherkin
Feature: High-confidence approved procedures become skill files

  Scenario: Multiple deployment procedures cluster into a deployment skill
    Given the knowledge store contains 4 approved procedures about deployment:
      | content                                                    | confidence | origin           |
      | Copy prototype to server using rsync                       | 0.95       | explicit-statement |
      | Run setup.sh on first install                              | 0.92       | explicit-statement |
      | Build Docker images for cms, light-sim, guide-app          | 0.90       | observed-pattern   |
      | Deploy using docker-compose up -d                          | 0.93       | explicit-statement |
    And all 4 are curationStatus = "approved"

    When the channel router processes these entries
    Then 3 entries are routed to "skill" (the top 3 by ranking score)
    And the ranking considers:
      | factor         | weight |
      | confidence     | direct |
      | impactScore    | direct (default 0.5 when no data) |
      | priorOverlap   | inverse (lower is better) |
      | failureOrigin  | 2x bonus for observed-failure |

    When the skill file is generated
    Then a file "deployment.md" is created in the skills directory
    And it contains the top 3 procedures
    And it is under 100 lines
    And total skill files count <= 3
```

### Expected Trace

```
INPUT:  4 approved deployment procedures in store
  ↓ channel-router → SKILL (procedure + approved + conf >= 0.85)
  ↓ ranking → top 3 selected by score
  ↓ skill-gen → skills/deployment.md created
  ↓ budget check → total skills <= 3, each <= 100 lines
OUTPUT: skills/deployment.md with 3 focused procedures
```

---

## Scenario 7: Harmful outcome → accelerated decay → eventual archival

**Based on the feedback loop design**

```gherkin
Feature: Entry that causes problems decays faster and gets reviewed

  Scenario: A correction leads to worse outcomes in subsequent sessions
    Given a stored entry:
      | field           | value                                           |
      | type            | correction                                      |
      | content         | Always use event-based sync instead of time-based |
      | confidence      | 0.90                                            |
      | curationStatus  | approved                                        |
      | origin          | explicit-statement                              |
      | sessionsExposed | 0                                               |
      | sessionsHelpful | 0                                               |
      | sessionsHarmful | 0                                               |

    # Session 1: exposed, harmful
    When the entry is included in a work arc context
    Then sessionsExposed increments to 1
    When the work arc fails and the entry is plausibly related
    Then sessionsHarmful increments to 1

    # Sessions 2-3: more harmful outcomes
    When 2 more sessions expose and harm
    Then the entry has:
      | field           | value |
      | sessionsExposed | 3     |
      | sessionsHarmful | 3     |
      | sessionsHelpful | 0     |
    And impactScore is computed: (0 - 3) / 3 = -1.0

    # Impact triggers review
    Then a curation queue item is created with:
      | field   | value         |
      | action  | review-impact |
      | reason  | impactScore (-1.0) below auto-demote threshold (-0.3) |

    # Decay runs with outcome penalty
    When decay runs on this entry
    Then effectiveDecayFactor = baseFactor * (1 + abs(-1.0) * harm_penalty_max)
    And the entry decays approximately 2x faster than normal

    # Human reviews
    When a human reviews the impact
    Then they can:
      | option   | effect                  |
      | reject   | curationStatus=rejected, entry drops from all artifacts |
      | keep     | reset harmful count, entry stays |
      | revise   | supersede with corrected version |
```

### Expected Trace

```
INPUT:  Approved entry exposed in 3 sessions, all harmful
  ↓ feedback-loop → sessionsExposed: 3, sessionsHarmful: 3
  ↓ impact-calc → impactScore = -1.0
  ↓ curation-queue → REVIEW {action: "review-impact", impactScore: -1.0}
  ↓ decay → effectiveDecayFactor ≈ 0.95 * 3.0 = accelerated (capped)
  ...human reviews...
  ↓ rejected → curationStatus: "rejected"
  ↓ channel-router → excluded from all channels
OUTPUT: Harmful entry removed from artifacts after human review
```

---

## Scenario 8: Helpful outcome → confidence boost → stays in CLAUDE.md

**The positive feedback path**

```gherkin
Feature: Entry with consistently helpful outcomes gets boosted

  Scenario: A preference proves helpful across multiple sessions
    Given a stored entry:
      | field           | value                        |
      | type            | preference                   |
      | content         | Use NativeWind for styling   |
      | confidence      | 0.90                         |
      | curationStatus  | approved                     |
      | origin          | explicit-statement           |

    When the entry is exposed in 5 sessions
    And 4 sessions report helpful outcomes
    Then the entry has:
      | field           | value |
      | sessionsExposed | 5     |
      | sessionsHelpful | 4     |
      | sessionsHarmful | 0     |
    And impactScore = (4 - 0) / 5 = 0.8

    # Confidence boost
    When impactScore exceeds the confidence_boost_threshold (0.5)
    Then confidence gets a boost of +0.05 (confidence_boost_amount)
    And new confidence = min(1.0, 0.90 + 0.05) = 0.95

    # Decay slowed
    When decay runs on this entry
    Then effectiveDecayFactor is reduced (slower decay)
    And the entry remains in CLAUDE.md with higher ranking
```

### Expected Trace

```
INPUT:  Approved entry exposed in 5 sessions, 4 helpful
  ↓ feedback-loop → sessionsExposed: 5, sessionsHelpful: 4
  ↓ impact-calc → impactScore = 0.8
  ↓ confidence boost → 0.90 + 0.05 = 0.95
  ↓ decay → effectiveDecayFactor reduced (help bonus)
  ↓ channel-router → CLAUDE-MD (higher ranking due to impactScore)
OUTPUT: Entry strengthened, stays prominent in CLAUDE.md
```

---

## Scenario 9: Duplicate extraction → dedup catches it

**Based on real data: "Use pnpm" appears as both a preference and in procedures**

```gherkin
Feature: Duplicate knowledge is caught before storage

  Scenario: Same preference extracted from a new session
    Given the knowledge store already contains:
      | id       | type       | content                     | confidence |
      | e98831b9 | preference | Use pnpm as the package manager | 1.0    |

    When a new session produces:
      | type       | content                           | confidence |
      | preference | Always use pnpm, never npm or yarn | 0.95      |

    Then deduplication detects similarity:
      | metric            | value | threshold |
      | Jaccard overlap   | 0.6   | 0.3       |
    And the new entry is marked as duplicate
    And it is NOT stored
    And extraction stats show duplicatesSkipped: 1

  Scenario: Similar but distinct knowledge passes dedup
    Given the store contains "Use pnpm as the package manager"
    When a new entry "pnpm workspaces require a pnpm-workspace.yaml file" is extracted
    Then deduplication finds low overlap (different topic)
    And the new entry IS stored
```

### Expected Trace

```
INPUT:  New session extracts "Always use pnpm, never npm or yarn"
  ↓ knowledge-extractor → {type: "preference", content: "Always use pnpm..."}
  ↓ novelty-gate → PASS
  ↓ dedup → DUPLICATE (Jaccard 0.6 with existing "Use pnpm..." entry)
  ✗ Not stored
OUTPUT: Stats: {duplicatesSkipped: 1}
```

---

## Scenario 10: Full lifecycle — extraction through feedback over multiple sessions

**End-to-end integration scenario**

```gherkin
Feature: Complete evidence-based memory lifecycle across multiple sessions

  Background:
    Given an empty knowledge store
    And default lifecycle configuration

  Scenario: Entry lifecycle from first extraction to validated artifact
    # === SESSION 1: Extraction ===
    Given a coding session transcript where:
      - User says "I always use conventional commits: feat:, fix:, docs:"
      - User says "Variables should have meaningful names"
      - Assistant infers the team probably does code reviews

    When the extraction pipeline runs
    Then 3 raw entries are produced:
      | content                        | novelty          | origin             | confidence |
      | Use conventional commits       | project-specific | explicit-statement | 0.95       |
      | Meaningful variable names      | general-knowledge| inferred           | 0.60       |
      | Team does code reviews         | domain-specific  | inferred           | 0.80       |

    And after the novelty gate:
      | entry                     | action  | reason                |
      | Use conventional commits  | PASS    | project-specific      |
      | Meaningful variable names | DROP    | general-knowledge     |
      | Team does code reviews    | PASS    | domain-specific       |

    And after the inferred cap:
      | entry                    | confidence |
      | Use conventional commits | 0.95       |
      | Team does code reviews   | 0.70       |

    And after auto-approval:
      | entry                    | curationStatus | curatedBy     |
      | Use conventional commits | approved       | auto-approved |
      | Team does code reviews   | pending        | -             |

    And the store now has 2 entries (1 was dropped)

    # === CHANNEL ROUTING ===
    When the channel router runs
    Then:
      | entry                    | channel   | reason                           |
      | Use conventional commits | claude-md | approved, conf 0.95, preference  |
      | Team does code reviews   | none      | pending curation, conf 0.70      |

    And CLAUDE.md is regenerated with "Use conventional commits"
    And "Team does code reviews" is in the curation queue

    # === SESSION 2: Context Assembly + Exposure ===
    When a new work arc starts
    And context is assembled for the coding adapter
    Then "Use conventional commits" is included in the system prompt
    And exposedEntryIds includes the conventional commits entry ID
    And "Team does code reviews" is NOT included (not approved)

    When the work arc succeeds
    Then the feedback loop records:
      | entry                    | sessionsExposed | sessionsHelpful |
      | Use conventional commits | 1               | 1               |

    # === SESSION 3: More exposure ===
    When 2 more successful work arcs include the conventional commits entry
    Then the entry has sessionsExposed: 3, sessionsHelpful: 3
    And impactScore = (3 - 0) / 3 = 1.0
    And a confidence boost is applied: 0.95 + 0.05 = 1.0

    # === MEANWHILE: Inferred entry decays ===
    When 20 days pass with no curation of "Team does code reviews"
    Then its confidence has started decaying (inferred grace = 15 days)
    And after 30 more days without curation it is auto-rejected (stale)

    # === FINAL STATE ===
    Then the store contains:
      | entry                    | confidence | curationStatus | impactScore | channel   |
      | Use conventional commits | 1.0        | approved       | 1.0         | claude-md |
      | Team does code reviews   | ~0.40      | rejected       | -           | none      |
    And CLAUDE.md contains exactly 1 preference entry
    And no skill files exist (no approved procedures)
    And no hook patterns exist (no approved hook candidates)
```

### Expected Trace (Session-by-Session)

```
=== SESSION 1 ===
INPUT:  3 transcript turns with preferences and inferences
  ↓ signal-classifier → 3 SIGNAL turns
  ↓ knowledge-extractor → 3 raw entries
  ↓ novelty-gate → 1 DROPPED (general-knowledge), 2 PASS
  ↓ inferred-cap → 1 capped (0.80 → 0.70)
  ↓ auto-approval → 1 approved, 1 pending
  ↓ store → 2 entries stored
  ↓ channel-router → 1 claude-md, 1 none
  ↓ curation-queue → 1 pending item
  ↓ artifact-gen → CLAUDE.md with 1 entry

=== SESSION 2 ===
  ↓ context-assembly → "conventional commits" included, tracked as exposed
  ↓ work-arc → SUCCESS
  ↓ feedback-loop → sessionsExposed: 1, sessionsHelpful: 1

=== SESSION 3 ===
  ↓ context-assembly → same entry exposed again
  ↓ work-arc → SUCCESS
  ↓ feedback-loop → sessionsExposed: 3, sessionsHelpful: 3
  ↓ impact-calc → impactScore = 1.0
  ↓ confidence-boost → 0.95 → 1.0

=== DAY 45 ===
  ↓ decay → "Team does code reviews" confidence ~0.40
  ↓ curation auto-reject → rejected (stale, 30+ days pending)

FINAL: CLAUDE.md has 1 validated entry. Inferred junk auto-rejected.
```

---

## Summary: Path Coverage Matrix

| Scenario | Novelty | Origin | Auto-Approve? | Channel | Curation | Feedback | Decay |
|----------|---------|--------|---------------|---------|----------|----------|-------|
| 1. Explicit preference | project | explicit | YES | claude-md | skip | - | - |
| 2. Explicit rule → hook | project | explicit | YES | hook | required | - | - |
| 3. Observed failure | project | obs-failure | NO | claude-md (pending) | required | - | - |
| 4. Inferred fact | domain | inferred | NO | none | pending | - | decays |
| 5. General knowledge | general | inferred | - | DROPPED | - | - | - |
| 6. Procedure cluster | project | mixed | YES(3) | skill | pre-approved | - | - |
| 7. Harmful outcome | project | explicit | YES | claude-md | review | harmful | accelerated |
| 8. Helpful outcome | project | explicit | YES | claude-md | skip | helpful | slowed |
| 9. Duplicate | project | explicit | - | DEDUP | - | - | - |
| 10. Full lifecycle | mixed | mixed | mixed | mixed | mixed | mixed | mixed |

**Coverage:**
- All 3 novelty values: project-specific, domain-specific, general-knowledge
- All 4 origin values: explicit-statement, observed-failure, observed-pattern, inferred
- All 3 channels: claude-md, skill, hook + none/dropped
- All curation paths: auto-approved, pending, rejected, approve-hook
- All feedback outcomes: helpful, harmful, neutral (no exposure)
- All decay paths: normal, accelerated (harmful), slowed (helpful), exempt (hook)
- Edge cases: dedup, confidence cap, stale auto-reject

---

## Scenarios 16-24: Audit → Export Lifecycle (added 2026-02-26)

**Covers:** `docs/plans/2026-02-26-shadow-audit-export-scenarios.md`

| Scenario | Feature | Maps to Shadow/Audit/Export |
|----------|---------|---------------------------|
| S16 | targetOverride routes to dev-chosen channel | S3: Target override |
| S17 | contentOverride appears in generated artifacts | S2: Content editing |
| S18 | Bulk approve/reject updates store | S10: Bulk actions |
| S19 | Export only includes approved entries | S1: Basic cycle |
| S20 | Sentence-scoped isLikelyQuestion | Signal classifier fix |
| S21 | Numbered list per-item re-classification | Signal classifier fix |
| S22 | Constraint/option answer detection | Signal classifier fix |
| S23 | Re-export removes rejected entry | S7: Re-export |
| S24 | Empty store produces no artifacts | S9: Empty states |

### Coverage of Shadow/Audit/Export Scenarios

| Shadow/Audit/Export Scenario | Covered By |
|------------------------------|-----------|
| S1: Basic shadow → audit → export | S19 (export), S1 (pipeline) |
| S2: Content editing | S17 |
| S3: Target override | S16 |
| S4: Budget enforcement | S12 (existing) |
| S5: Context assembly before curation | S10 (existing, implicit) |
| S6: Incremental audit | S18 (bulk actions) |
| S7: Re-export after changes | S23 |
| S8: Non-blocking extraction | Architectural (SessionEnd hook) |
| S9: Empty states | S24 |
| S10: Filtering and bulk actions | S18, S16 |
