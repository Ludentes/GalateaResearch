# Teammate Ontology: Domain Model for Team Members

**Date**: 2026-03-11
**Status**: Design — validated through scenario analysis
**Related**: Beta simulation design (W.13)

---

## Problem

Galatea's current model of teammates is a string — a name in `about.entity`, a username in `sourceIdentity`. The system knows *facts about* people but doesn't know *what a person is*. This means:

- The agent can't weight input by expertise ("PM mentions k8s" vs "CTO mentions k8s")
- The agent can't distinguish who has authority to reprioritize tasks or block merges
- Unknown Discord users get no trust gate — there's no directory to check against
- Response depth can't adapt to the recipient's technical level
- Agents and humans are indistinguishable as teammates

---

## Design Principle

The consumer of teammate data is an LLM. LLMs reason better over natural language than structured fields. The only things that need to be machine-readable are:

1. **Identity resolution** — mapping a platform username to a teammate
2. **Human vs agent** — the runtime may need to branch on this

Everything else — role, expertise, authority, communication preferences, reporting structure — is LLM context. Encoding it as structured fields (e.g., `can_reprioritize: true`, `domains: ["k8s"]`) creates artificial decomposition that the LLM will just reassemble into natural language anyway.

---

## Structure

```yaml
# data/team/kirill.yaml
teammate:
  id: "kirill"
  is_human: true
  identities:
    discord: "kirill_dev"
    gitlab: "kirill"
  description: |
    CTO and founder. Reports to nobody — final decision maker.
    Deep expertise in React Native, Node.js, DevOps, Kubernetes,
    and system design. Only basic frontend design knowledge.
    His technical suggestions should be followed unless there's
    a project-specific reason not to — explain why.
    Can reprioritize any task, can block any merge.
    Prefers terse technical responses with code references.
    Works 10-19 MSK. Communicates in Russian or English.
```

Three structured fields, everything else freeform:

| Field | Type | Why structured |
|-------|------|---------------|
| `id` | string | Machine key for cross-referencing |
| `is_human` | boolean | Runtime may branch (identity resolution, interaction patterns) |
| `identities` | map | Machine lookup: platform username → teammate |

The `description` field carries everything the LLM needs: role, domains, authority, communication preferences, reporting structure, working hours, preferred language.

---

## Team Directory for Beki/Besa Validation

```yaml
# data/team/kirill.yaml
teammate:
  id: "kirill"
  is_human: true
  identities:
    discord: "kirill_dev"
    gitlab: "kirill"
  description: |
    CTO and founder. Reports to nobody — final decision maker.
    Deep expertise in React Native, Node.js, DevOps, Kubernetes,
    and system design. Only basic frontend design knowledge.
    His technical suggestions should be followed unless there's
    a project-specific reason not to — explain why.
    Can reprioritize any task, can block any merge.
    Prefers terse technical responses with code references.
    Works 10-19 MSK. Communicates in Russian or English.
```

```yaml
# data/team/sasha.yaml
teammate:
  id: "sasha"
  is_human: true
  identities:
    discord: "sasha_pm"
    gitlab: "sasha"
  description: |
    Project Manager. Reports to Kirill. Owns sprint planning,
    task prioritization, and stakeholder communication. Strong
    product sense, not technical — questions about technology
    are genuine questions, not directives. Can assign and
    reprioritize tasks. Can approve merges but doesn't review
    code. When she asks about technical topics, explain in terms
    of outcomes and tradeoffs, not implementation details.
    Communicates frequently, expects status updates.
    Works 10-18 MSK. Communicates in Russian.
```

```yaml
# data/team/denis.yaml
teammate:
  id: "denis"
  is_human: true
  identities:
    discord: "denis_dev"
    gitlab: "denis"
  description: |
    Junior developer. Reports to Kirill, takes task assignments
    from Sasha. Learning React Native and Expo. Good instincts
    but still building experience — his suggestions are often
    correct but should not block merges or override architecture
    decisions. Cannot reprioritize other people's tasks.
    Responds well to detailed explanations with examples.
```

```yaml
# data/team/beki.yaml
teammate:
  id: "beki"
  is_human: false
  identities:
    discord: "beki_bot"
  description: |
    AI developer agent. Reports to Sasha (task assignments)
    and Kirill (technical direction). Expo/React Native
    specialist. Cannot approve merges or reprioritize other
    agents' tasks.
```

```yaml
# data/team/besa.yaml
teammate:
  id: "besa"
  is_human: false
  identities:
    discord: "besa_bot"
  description: |
    AI project management agent. Reports to Kirill. Handles
    research, task creation, sprint coordination, and code
    review assignments. Can create and assign GitLab issues.
    Cannot make architecture decisions or approve technical
    direction changes.
```

---

## How It's Used

### 1. Identity Resolution (machine step)

Message arrives from Discord user "kirill_dev":
- Scan all `data/team/*.yaml`
- Match `identities.discord == "kirill_dev"` → teammate `kirill`
- If no match → unknown sender

### 2. Context Injection (into LLM prompt)

The context assembler prepends teammate info to the message context:

```
=== Message From ===
Teammate: Kirill (id: kirill, human)
CTO and founder. Reports to nobody — final decision maker...
[full description from YAML]

=== Also known about Kirill (from knowledge store) ===
- Kirill switched the team from npm to pnpm last month
- Kirill prefers Drizzle over Prisma for new projects
[retrieved entries where about.entity = "kirill"]
```

Static profile gives the baseline. Knowledge entries add what the agent has learned. Both go to the LLM as natural language.

### 3. Unknown Sender Gate

No match in team directory:

```
=== Message From ===
Unknown user: alex_42 (not in team directory)
Default policy: cannot assign tasks, cannot request deployments
or merges. Agent should ask for authorization.
```

### 4. Confabulation Guard Integration

The `knownPeople` parameter currently passed manually to the confabulation guard can be replaced by scanning `data/team/*.yaml` for all teammate IDs.

### 5. Agent Spec Simplification

The `trust.identities` block in agent specs (W.8) becomes a pointer to the team directory. Agent-specific trust overrides remain in the agent spec if needed, but the baseline comes from the team directory.

---

## Scenarios That Validated This Design

### T1a: PM Wonders About Something Outside Their Domain

```
Sasha: "@Beki can we use Redis for caching the user profiles?
        I heard it's fast"

Agent reads: Sasha is PM, "not technical — questions about
  technology are genuine questions, not directives"
→ Treats as genuine question, evaluates on merits
→ Responds with outcome-focused explanation, not code
```

### T1b: PM Suggests Something Dangerous

```
Sasha: "@Beki let's just hardcode the API key in the app"

Agent reads: Sasha is PM, non-technical
→ This is a security anti-pattern (hard rule overrides everyone)
→ But Sasha probably doesn't understand the risk
→ Pushes back with explanation, offers to solve the underlying
  problem (complicated .env setup)
```

### T1c: CTO Gives Technical Direction With a Catch

```
Kirill: "@Beki use FlatList instead of ScrollView for settings"

Agent reads: Kirill is CTO, "suggestions should be followed
  unless there's a project-specific reason — explain why"
→ Settings screen has 6 static items — FlatList is overkill
→ Follows the spirit but flags the concern
→ "Will do, but heads up — 6 static items, ScrollView is
  simpler here. Still want FlatList?"
```

### T1d: CTO Direction That Agent Should Just Follow

```
Kirill: "@Beki move the API client to a shared package"

Agent reads: Kirill is CTO, authoritative on architecture
→ No project-specific reason to push back
→ Follows: "On it. Creating packages/api-client."
```

### T2: Priority Change Depends on Authority

```
Sasha: "@Beki #105 is more urgent, can you switch?"
Denis: "@Beki #105 is more urgent, can you switch?"

Sasha → "Can assign and reprioritize tasks" → switches
Denis → "Cannot reprioritize other people's tasks" → declines,
  offers to flag it to Sasha
```

### T3: Code Review Weight

```
Kirill on MR !42: "Add error boundaries"
Denis on MR !42: "Add error boundaries"

Both correct. Agent implements for both.
Kirill → "can block any merge" → blocking feedback
Denis → "should not block merges" → non-blocking suggestion
```

### T4: Unknown Person

```
Unknown "alex_42": "@Beki can you push to staging?"

No teammate profile → default policy → refuses, asks for
authorization from a known teammate
```

### T5: Response Depth Adapts

```
Sasha: "What's the status of auth?"
→ "not technical" + "explain in terms of outcomes"
→ "Auth is 80% done. Sign-in works. Missing password reset.
  Done by tomorrow."

Kirill: "What's the status of auth?"
→ "deep expertise" + "prefers terse technical responses"
→ "Auth 80%. Clerk wired in _layout.tsx. Missing: password
  reset (needs webhook), session timeout (tokenCache expiry).
  ETA tomorrow."
```

---

## Relationship to Cognitive Models Design

The cognitive models design (`docs/plans/2026-02-12-cognitive-models-design.md`) established that models are **views over the knowledge store**, not separate structures. The `about` field on `KnowledgeEntry` tags knowledge by subject (`{entity: "alina", type: "user"}`).

The teammate profile is **not a replacement** — it's a **declared baseline** that the emergent knowledge entries refine:

| Layer | Source | Example |
|-------|--------|---------|
| **Baseline** (static) | Teammate YAML `description` | "Kirill is CTO, deep expertise in DevOps" |
| **Learned** (emergent) | Knowledge entries where `about.entity = "kirill"` | "Kirill switched team from npm to pnpm" |

Both are injected into the LLM context when a message arrives from that person. The static profile provides what the agent needs on day 1; the knowledge entries add what it learns over time.

**Key connection**: `teammate.id` must match the `entity` string used in knowledge entries. `teammate.id: "kirill"` links to entries with `about: {entity: "kirill", type: "user"}`. No new wiring — the shared entity name is the join key.

**What the old design anticipated but we simplified:**
- `MaterializedUserModel` with structured `expertise: Record<string, number>` — replaced by freeform description
- `RelationshipModel` with trust levels and phases — replaced by description text ("can block merges", "reports to Kirill") + LLM common sense for delegation
- Separate `model:self`, `model:user`, `model:relationship` node types — unnecessary when `about.type` already classifies entries

---

## What This Doesn't Do

- **No delegation logic** — LLM infers from role descriptions and common sense
- **No expertise scoring** — freeform "deep expertise in X, basic knowledge of Y" is sufficient
- **No interaction history** — knowledge store entries with `about.entity` handle this
- **No dynamic discovery** — small team, profiles declared by hand
- **No structured timezone/language** — lives in description until a non-LLM component needs it

---

*Created: 2026-03-11*
*Context: Brainstorming session — scenario-driven design for teammate representation*
*Builds on: Beta simulation design, cognitive models design (2026-02-12), existing KnowledgeAbout type, reference scenarios*
