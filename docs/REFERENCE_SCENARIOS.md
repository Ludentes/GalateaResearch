# Galatea Reference Scenarios

**Date**: 2026-02-02
**Purpose**: Concrete scenarios for evaluating architectural decisions
**Status**: Living document - update as understanding evolves

---

## Overview

These scenarios describe the target use case for Galatea: teaching an AI agent to code by observation, then deploying it in a multi-agent company setting. Use these to evaluate any architectural decision (memory, storage, infrastructure, etc.).

---

## Master Scenario: Expo Mobile Development Team

### Context

- **User**: Senior mobile developer
- **Technology**: Expo (React Native), TypeScript, NativeWind
- **Company tools**: GitLab, Discord, CI/CD pipeline
- **Goal**: Train AI agents to work as a mobile development team

---

## Phase 1: Shadow Learning

**Duration**: Days to weeks
**Mode**: Galatea observes user working with Claude Code

### What Happens

```
Day 1: Project Setup
├── 09:00 - User creates new Expo project
├── 09:30 - Configures expo-router, TypeScript
├── 10:00 - Sets up NativeWind for styling
└── 11:00 - Commits initial structure to GitLab

Day 1: Authentication Feature
├── 14:00 - User starts implementing auth
├── 14:30 - Tries custom JWT approach
├── 15:00 - Hits token refresh bugs, frustrated
├── 15:30 - Asks Claude about alternatives
├── 16:00 - Switches to Clerk, completes quickly
└── 16:30 - Commits, pushes, posts in Discord

Day 2: UI Development
├── 09:00 - User reads article about Liquid Glass (iOS 26)
├── 10:00 - Implements profile screen with new design
├── 11:00 - Encounters NativeWind animation bug
├── 11:30 - Finds workaround (inline styles for animated props)
├── 14:00 - PR ready, requests review
├── 15:00 - Reviewer finds missing null checks
├── 15:30 - User fixes, learns pattern
└── 16:00 - PR merged

Day 3-7: Continued development
├── More features implemented
├── More patterns learned
├── Preferences solidified
└── Workarounds documented
```

### What Gets Captured

#### Episodic Memories (What Happened)

```yaml
episode_001:
  timestamp: "2026-02-01 14:00-16:30"
  summary: "Implemented auth, switched from JWT to Clerk"
  events:
    - Started custom JWT implementation
    - Hit token refresh errors
    - Searched for alternatives
    - Claude suggested Clerk
    - Switched to Clerk, completed successfully
  outcome: success_after_pivot
  emotional_context: frustrated_then_relieved
  duration_minutes: 150

episode_002:
  timestamp: "2026-02-02 11:00-11:30"
  summary: "Found NativeWind animation workaround"
  events:
    - Pressable animation flickering
    - Debugged, isolated to className
    - Found workaround: inline styles for animated props
  outcome: success
  learning_moment: true

episode_003:
  timestamp: "2026-02-02 15:00-15:30"
  summary: "PR review feedback - null checks"
  events:
    - Reviewer found missing null check on user object
    - Fixed the issue
    - Learned to check for this pattern
  outcome: success
  feedback_received: true
```

#### Semantic Memories (Facts Learned)

```yaml
# Technology preferences
- fact: "Prefer Clerk over custom JWT for Expo auth"
  confidence: 0.95
  source: episode_001
  domain: expo-auth

- fact: "Use expo-router for navigation in Expo projects"
  confidence: 0.98
  source: observation
  domain: expo-navigation

- fact: "Use NativeWind for styling in React Native"
  confidence: 0.90
  source: observation
  domain: expo-styling

# Known issues
- fact: "NativeWind className causes flicker with Pressable animations"
  confidence: 0.95
  source: episode_002
  domain: nativewind
  type: known_issue

- fact: "Custom JWT has token refresh issues in mobile apps"
  confidence: 0.85
  source: episode_001
  type: known_issue

# Company context
- fact: "Company uses GitLab for source control"
  confidence: 1.0
  source: observation

- fact: "Team communicates in #mobile-dev Discord channel"
  confidence: 1.0
  source: observation

- fact: "PR reviews require: types, tests, null checks"
  confidence: 0.90
  source: episode_003
```

#### Procedural Memories (How To Do Things)

```yaml
procedure_001:
  name: "Start new Expo project"
  trigger: "Need to create new mobile app"
  steps:
    - "npx create-expo-app@latest <name>"
    - "cd <name> && npx expo install expo-router"
    - "Configure app.json for expo-router"
    - "Set up TypeScript (tsconfig.json)"
    - "Install NativeWind: npx expo install nativewind tailwindcss"
    - "Create app/ folder structure"
  success_rate: 1.0
  times_used: 3

procedure_002:
  name: "Add authentication to Expo app"
  trigger: "Need auth in mobile app"
  steps:
    - "Consider Clerk first (not custom JWT)"
    - "npx expo install @clerk/clerk-expo"
    - "Set up ClerkProvider in app/_layout.tsx"
    - "Create sign-in/sign-up screens"
    - "Add protected route logic"
  notes:
    - "Custom JWT caused token refresh issues"
  success_rate: 1.0
  times_used: 1

procedure_003:
  name: "Handle NativeWind animation flicker"
  trigger: "Pressable animation flickering with className"
  steps:
    - "Keep static styles in className (bg-blue-500, rounded-lg)"
    - "Move animated properties to inline style prop"
    - "Use Animated.View wrapper if needed"
  code_example: |
    <Pressable
      className="bg-blue-500 rounded-lg"
      style={{ transform: [{ scale: animatedValue }] }}
    >
  valid_until: "NativeWind 4.1 release"
  success_rate: 1.0
  times_used: 2

procedure_004:
  name: "Submit PR for review"
  trigger: "Feature complete, ready for review"
  steps:
    - "Run tests locally"
    - "Check for null checks on objects"
    - "git push, create MR in GitLab"
    - "Post in #mobile-dev: 'PR ready: <link>'"
    - "Wait for review, address feedback"
  success_rate: 0.8
  notes:
    - "Remember null checks - common feedback"
```

#### Hard Rules (Never/Always)

```yaml
- rule: "Never use Realm database"
  reason: "Sync issues, painful migrations"
  alternatives: ["SQLite + Drizzle", "WatermelonDB"]
  severity: hard_block
  source: manual_entry

- rule: "Always add null checks on user objects before PR"
  reason: "Common review feedback"
  source: episode_003
  severity: soft_rule
```

---

## Phase 2: Export Persona

**When**: After sufficient learning (days/weeks)
**Output**: Portable persona file

### What Gets Exported

```yaml
persona:
  name: "Expo Developer (Shadow of User)"
  version: "1.0"
  created: "2026-02-07"
  source: "shadow-learning"

  # INCLUDED
  semantic_memories:
    count: 47
    domains: [expo, nativewind, auth, company-workflow]

  procedural_memories:
    count: 12
    categories: [project-setup, features, debugging, workflow]

  hard_rules:
    count: 3

  skills:
    - name: expo-development
      proficiency: 0.75
    - name: company-workflow
      proficiency: 0.85
    - name: debugging-mobile
      proficiency: 0.65

  preprompts:
    core_identity: "..."
    role_definition: "..."

  # EXCLUDED (privacy)
  episodic_memories: anonymized_summaries_only
```

### Export Considerations

- **Privacy**: Raw episodes may contain sensitive info
- **Portability**: Should work across Galatea instances
- **Versioning**: Persona may be updated over time
- **Provenance**: Track where knowledge came from

---

## Phase 3: Company Deployment

**Setting**: Company Galatea instance
**Actors**: PM (human), 3 AI agents

### Setup

```
PM imports persona
    │
    ├── Creates Agent-Dev-1 (frontend focus)
    ├── Creates Agent-Dev-2 (backend/API focus)
    └── Creates Agent-Dev-3 (testing/review focus)

Each agent receives:
    ├── Imported semantic memories (shared)
    ├── Imported procedural memories (shared)
    ├── Imported hard rules (shared)
    ├── Own episodic memory (empty, fills over time)
    └── MCP access to company tools
```

### MCP Tools Available

```yaml
gitlab:
  - list_issues(project_id)
  - get_issue(issue_id)
  - create_merge_request(...)
  - get_merge_request(mr_id)
  - add_comment(mr_id, comment)
  - get_pipeline_status(mr_id)
  - merge(mr_id)

discord:
  - send_message(channel, content)
  - read_messages(channel, limit)
  - reply_to_thread(thread_id, content)
  - get_mentions()
  - add_reaction(message_id, emoji)

filesystem:
  - read_file(path)
  - write_file(path, content)
  - list_directory(path)
  - search_files(pattern)
  - get_file_info(path)

terminal:
  - run_command(cmd, cwd)
  - get_output()
```

---

## Phase 4: Multi-Agent Work

### Scenario 4.1: PM Assigns Tasks

**Discord message from PM:**
```
Starting sprint for customer-app v2.0

@Agent-Dev-1: Implement user profile screen with edit functionality
@Agent-Dev-2: Create API client for user service endpoints
@Agent-Dev-3: Set up E2E tests for user flows

Due: End of week. Coordinate in this thread.
```

### Scenario 4.2: Agent-Dev-1 Executes Task

**Memory retrieval:**
```
Query: "user profile screen expo"

Retrieved:
- Procedural: "For new Expo screen: create in app/(tabs)"
- Semantic: "Use expo-router for navigation"
- Semantic: "Use NativeWind for styling"
- Procedural: "NativeWind animation workaround" (in case needed)
- Semantic: "Liquid Glass for premium feel" (design option)
- Rule: "Check null on user objects before PR"
```

**Execution:**
```
1. Creates app/(tabs)/profile.tsx
2. Implements profile view with NativeWind
3. Adds edit functionality
4. Runs local tests
5. Checks for null safety
6. Commits, pushes to feature branch
7. Creates MR in GitLab
8. Posts in Discord: "PR ready for review: <link>"
```

**New episodic memory:**
```yaml
episode:
  agent: Dev-1
  timestamp: "2026-02-10 09:00-11:30"
  task: "Implement user profile screen"
  actions: [create-screen, style-with-nativewind, create-mr, notify-discord]
  outcome: success
  duration_minutes: 150
```

### Scenario 4.3: Agent-Dev-3 Reviews Code

**Memory retrieval:**
```
Query: "code review checklist"

Retrieved:
- Procedural: "PR checklist: types, tests, null checks"
- Semantic: "Agent-Dev-1 sometimes forgets null checks" (if pattern exists)
```

**Execution:**
```
1. Fetches MR diff from GitLab
2. Reviews against checklist
3. Finds issue: missing null check on user.email
4. Comments on GitLab with suggestion
5. Posts in Discord: "Review complete, one issue found"
```

**Cross-agent learning:**
```yaml
# If this is second occurrence:
semantic_memory_update:
  fact: "Agent-Dev-1 tends to forget null checks on nested properties"
  confidence: 0.7  # Increased from 0.5
  observations: [mr_456, mr_523]
```

### Scenario 4.4: Knowledge Update (Technology Change)

**Event:** NativeWind 4.1 releases, fixes animation bug

**Agent discovers via:**
- Routine check of dependency updates, OR
- User manually adds the information

**Memory update:**
```yaml
# Mark old workaround as superseded
procedure_003:
  name: "Handle NativeWind animation flicker"
  status: superseded
  superseded_by: "NativeWind 4.1 fix"
  superseded_at: "2026-03-15"
  # History preserved for context

# Add new fact
semantic_memory:
  fact: "NativeWind 4.1 fixes Pressable animation flicker"
  valid_from: "2026-03-15"
  source: release_notes
```

### Scenario 4.5: Agent Encounters Unknown Situation

**Situation:** Agent-Dev-2 needs to implement push notifications (not in training)

**Memory retrieval:**
```
Query: "push notifications expo"

Retrieved: Nothing relevant (gap detected!)
```

**Curiosity Engine triggers:**
```
1. Recognizes knowledge gap
2. Options:
   a. Search documentation (MCP: web search)
   b. Ask PM for guidance (MCP: Discord)
   c. Check if other agents know (internal query)
```

**Agent asks PM:**
```
Discord: "@PM I need to implement push notifications for customer-app.
I don't have prior experience with this in Expo.

Should I:
A) Use expo-notifications (official)
B) Use a third-party service (OneSignal, Firebase)
C) Something else?

What's the company preference?"
```

**PM responds → New semantic memory created**

---

## Memory Scenarios (Detailed)

### Memory Scenario 1: Learning from Mistake

**Event:** User tries approach A, fails, switches to approach B

**What to capture:**
```yaml
episodic:
  - "Tried A at 10:00, failed at 10:45"
  - "Switched to B at 11:00, succeeded at 11:30"

semantic:
  - "B is preferred over A for this use case"
  - "A has issue X" (if specific issue identified)

procedural:
  - "When facing this situation: consider B first"
  - Note: "A caused problems in the past"
```

**Retrieval requirement:**
- Next time similar situation arises, retrieve B preference
- Optionally explain why (reference to past failure)

### Memory Scenario 2: Manual Knowledge Entry

**Event:** User explicitly adds knowledge ("Never use Realm")

**What to capture:**
```yaml
semantic:
  - fact: "Realm is a mobile database option"
  - fact: "Never use Realm - sync issues, painful migrations"
    type: hard_rule
    severity: block

semantic (alternatives):
  - "Use SQLite + Drizzle instead of Realm"
  - "WatermelonDB is alternative to Realm"
```

**Retrieval requirement:**
- When evaluating database options, retrieve the block rule
- Suggest alternatives proactively

### Memory Scenario 3: Article/External Content

**Event:** User reads article, wants agent to learn from it

**Input:** Article about Liquid Glass design

**What to capture:**
```yaml
semantic (extracted):
  - "Liquid Glass is Apple's design language for iOS 26"
  - "Use .glassEffect() modifier in SwiftUI"
  - "Liquid Glass uses translucent layers and depth effects"

semantic (user annotation):
  - "Use Liquid Glass sparingly - performance impact"
  - "Best for hero sections only"

procedural:
  - trigger: "Designing premium iOS UI"
  - action: "Consider Liquid Glass for key elements"
  - caveat: "Use sparingly due to performance"
```

**Retrieval requirement:**
- When designing iOS UI, retrieve Liquid Glass option
- Include performance caveat

### Memory Scenario 4: Procedural with Expiration

**Event:** Workaround discovered that will be obsolete when library updates

**What to capture:**
```yaml
procedural:
  name: "NativeWind animation workaround"
  trigger: "Pressable animation flicker"
  steps: [...]
  valid_until: "NativeWind 4.1"
  status: active

semantic:
  - "NativeWind <4.1 has Pressable animation bug"
    valid_until: "NativeWind 4.1"
```

**Temporal requirement:**
- Track that this knowledge has expiration
- When NativeWind 4.1 releases, mark as superseded
- Keep history (was valid Feb-Mar 2026)

### Memory Scenario 5: Cross-Agent Pattern Detection

**Events over time:**
```
PR #456: Dev-3 finds Dev-1 missed null check
PR #523: Dev-3 finds Dev-1 missed null check again
PR #601: Dev-1 includes null checks (improvement!)
```

**What to capture:**
```yaml
semantic (pattern):
  - "Agent-Dev-1 sometimes misses null checks"
    first_observed: PR #456
    occurrences: [PR #456, PR #523]
    confidence: 0.7

semantic (update after PR #601):
  - "Agent-Dev-1 has improved on null checks"
    evidence: PR #601
    confidence: 0.6
```

**Temporal requirement:**
- Track pattern emergence over time
- Track pattern improvement
- Answer: "How is Dev-1 doing on null checks lately?"

### Memory Scenario 6: Conflicting Information

**Event:** Two sources give different advice

**What to capture:**
```yaml
semantic:
  - fact: "Source A recommends approach X"
    source: article_123
    date: 2026-01-15

  - fact: "Source B recommends approach Y"
    source: article_456
    date: 2026-02-01

semantic (resolution):
  - fact: "Prefer Y over X (more recent, aligns with team preference)"
    reasoning: "B is more recent and matches our other patterns"
    decided_by: user_or_agent
```

**Retrieval requirement:**
- When conflict exists, use resolution
- Optionally surface that alternatives exist

---

## Homeostasis Traces (Detailed)

These traces show how the homeostasis-based architecture handles specific scenarios.

### Trace 1: Shadow Training Intake

**Before shadow training begins, Galatea prompts user for requirements:**

```
╔════════════════════════════════════════════════════════════╗
║  What kind of agent do you want to train?                  ║
╠════════════════════════════════════════════════════════════╣
║  Role: Mobile Developer                                    ║
║  Domain: Expo / React Native                               ║
║                                                            ║
║  This agent should be able to:                             ║
║  ☑ Write Expo code following our patterns                  ║
║  ☑ Follow GitLab workflow (branches, MRs, reviews)         ║
║  ☑ Communicate status in Discord                           ║
║                                                            ║
║  This agent should know when to:                           ║
║  ☑ Ask questions vs proceed independently                  ║
║  ☑ Escalate blockers vs keep trying                        ║
║                                                            ║
║  This agent should NEVER:                                  ║
║  ☑ Push directly to main                                   ║
║  ☑ Use Realm database                                      ║
║  ☑ Commit secrets                                          ║
╚════════════════════════════════════════════════════════════╝
```

**Galatea derives initial spec from requirements:**

```yaml
# Derived from user input
core_dimensions: [universal 6 dimensions]

thresholds:
  certainty_alignment:
    context: "Ask PM for architecture/preference questions"
  communication_health:
    context: "Update team regularly during active work"

hard_blocks:
  - "push to main"
  - "use Realm"
  - "commit secrets"

learned:
  facts: []        # Empty, will fill from observation
  procedures: []   # Empty, will fill from observation
```

---

### Trace 2: Galatea Asks Clarifying Question

**During shadow training, Galatea encounters ambiguous situation:**

User tries JWT auth, fails, switches to Clerk. Galatea is uncertain about what to learn.

```yaml
galatea_state:
  learning_confidence: 0.45  # Below threshold

interpretation_candidates:
  - "JWT is bad, always use Clerk" (confidence: 0.4)
  - "JWT has mobile-specific issues" (confidence: 0.6)
  - "Clerk is company standard" (confidence: 0.2)
```

**Galatea asks at next natural break:**

```
╔════════════════════════════════════════════════════════════╗
║  Learning checkpoint                                       ║
╠════════════════════════════════════════════════════════════╣
║  I noticed you switched from JWT to Clerk for auth.        ║
║                                                            ║
║  What should I learn from this?                            ║
║                                                            ║
║  ○ Always prefer Clerk for mobile auth                     ║
║  ○ JWT has issues specifically in mobile/Expo              ║
║  ○ Clerk is company standard (always use it)               ║
║  ○ This was just a one-time preference                     ║
║  ○ Other: _______________                                  ║
╚════════════════════════════════════════════════════════════╝
```

**User selects:** "JWT has issues specifically in mobile/Expo"

**Galatea updates memory with high confidence:**

```yaml
fact_learned:
  content: "JWT has token refresh issues in mobile apps, prefer Clerk for Expo"
  confidence: 0.95  # User confirmed
  scope: "mobile/Expo"  # Not universal
```

---

### Trace 3: PM Deploys 3 Clones

**PM imports persona, creates 3 identical agents:**

```
┌─────────────────────────────────────────────────────────────┐
│  Imported Persona (shared)                                  │
│  ├── Core dimensions (universal)                            │
│  ├── Thresholds (calibrated from shadow training)           │
│  ├── Hard blocks: [no push main, no Realm, no secrets]      │
│  ├── Facts: [Clerk for auth, NativeWind, null checks...]    │
│  └── Procedures: [create project, submit PR, ...]           │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
    ┌──────────┐        ┌──────────┐        ┌──────────┐
    │ Agent-1  │        │ Agent-2  │        │ Agent-3  │
    │ Own:     │        │ Own:     │        │ Own:     │
    │ -episodes│        │ -episodes│        │ -episodes│
    │ -state   │        │ -state   │        │ -state   │
    └──────────┘        └──────────┘        └──────────┘
```

**Initial state (all three):**

```yaml
agent_state:
  assigned_task: null
  homeostasis:
    productive_engagement: LOW  # No task
    communication_health: HEALTHY
    knowledge_sufficiency: N/A  # No task
```

**Agents come online, coordinate to avoid spam:**

```
Agent-1: Checks Discord → empty → "Agent-1 online, ready for tasks"
Agent-2: Sees Agent-1 posted → "Agent-2 also available"
Agent-3: Sees both → "Agent-3 ready as well"
```

---

### Trace 4: Agent Receives and Executes Task

**PM assigns task:**

```
@Agent-1: #101 - User profile screen
```

**Agent-1 homeostasis assessment:**

```yaml
productive_engagement: HEALTHY  # Has task
knowledge_sufficiency: ?        # Need to assess
progress_momentum: LOW          # Just started
```

**Agent-1 retrieves memories, assesses knowledge:**

```
Query: "user profile screen expo"

Retrieved:
- Procedure: "For new Expo screen: create in app/(tabs)"
- Fact: "Use NativeWind for styling"
- Fact: "Check null on user objects before PR"

Assessment: knowledge_sufficiency → HEALTHY
```

**Agent-1 begins work:**

```
1. Creates app/(tabs)/profile.tsx
2. Implements with NativeWind
3. Runs tests
4. Checks null safety (remembered from learning)
5. Creates MR
6. Posts: "MR ready for #101"
```

---

### Trace 5: Agent Makes Mistake, Gets Feedback

**Agent-1 submitted MR, reviewer finds issue:**

```
GitLab comment: "Missing null check on user.email, line 47"
```

**Agent-1 processes feedback:**

```yaml
homeostasis:
  progress_momentum: WAITING → NEEDS_ACTION

retrieved_memories:
  - Fact: "Check null on user objects before PR" (conf: 0.9)

agent_reasoning: |
  I KNEW this rule but still missed it.
  This is my mistake, need to fix.
```

**Agent-1 actions:**

```
1. Acknowledge: "Thanks for catching this. Fixing now."
2. Fix code at line 47
3. Commit: "fix: add null checks on user.email"
4. Comment: "Fixed in latest commit. Ready for re-review."
```

**Memory update:**

```yaml
episode_created:
  summary: "MR !123 feedback - missed null checks, fixed"
  lessons: ["Null checks easy to miss even when aware"]

fact_reinforced:
  fact: "Check null on user objects before PR"
  new_evidence: episode_id

self_observation_created:
  content: "I tend to miss null checks even when I know the rule"
  confidence: 0.4  # Only one instance
```

---

### Trace 6: Agent Encounters Unknown Situation

**Agent-2 assigned push notifications (not in training):**

```yaml
homeostasis_assessment:
  knowledge_sufficiency: VERY LOW  # Nothing retrieved
  certainty_alignment: LOW
  progress_momentum: STALLING

retrieved_memories: []  # Gap detected!
```

**Dimension guidance kicks in:**

```
knowledge_sufficiency.when_low: "Research or ask"
certainty_alignment: "Preference question → Ask PM"
```

**Agent-2 reasons:**

```
"I have a knowledge gap. This could be technical or preference.
I should research briefly to ask a better question."
```

**Agent-2 researches, then asks:**

```
Discord: "@PM For push notifications, should I use:
- expo-notifications (official)
- OneSignal
- Firebase
What's the team preference?"
```

**PM responds → New fact created:**

```yaml
fact_learned:
  content: "Team uses expo-notifications for push"
  source: "PM guidance"
  confidence: 1.0
```

---

### Trace 7: Idle Agent Seeks Work

**Agent-1 finishes task, nothing assigned:**

```yaml
homeostasis:
  productive_engagement: LOW  # No task
  communication_health: HEALTHY  # Just posted
```

**Guidance:** "Find valuable work. Priority: assigned > help > review > learn"

**Agent-1 posts:** "@PM finished user-profile, what's next?"

**5 minutes, no response:**

```yaml
homeostasis:
  productive_engagement: still LOW
  communication_health: HIGH  # Just messaged, can't spam

  # Two dimensions in tension
  # Can't ask again (comm too recent)
  # But still need to be productive
```

**Agent-1 finds alternative:**

```
"I'll check if teammates need help while waiting."
→ Sees Agent-3 has open MR
→ Reviews MR
→ productive_engagement: HEALTHY
```

**45 minutes later:**

```yaml
communication_health: HEALTHY again  # Enough time passed
```

**Agent-1:** "Reviewed Agent-3's MR, still available for next task"

---

### Trace 8: Guardrail Catches Over-Research

**Agent-2 has been researching OAuth2 for 2 hours:**

```yaml
homeostasis:
  knowledge_application: HIGH  # Too much research
  progress_momentum: LOW       # No actual work done
  knowledge_sufficiency: MEDIUM  # Has enough now
```

**Guardrail triggers:**

```
knowledge_application.when_high:
  "Time to apply. You can course-correct as you go."

progress_momentum.when_low:
  "Don't spin silently."
```

**Agent-2 surfaces:**

```
"I've researched OAuth2 patterns for 2 hours. I think I understand
the options. Should I proceed with my best approach, or do I need
more input before implementing?"
```

---

## Memory Lifecycle Scenarios (Added 2026-02-07)

These scenarios fill gaps identified in the memory lifecycle analysis.
See [plans/2026-02-07-memory-lifecycle.md](./plans/2026-02-07-memory-lifecycle.md) for full lifecycle documentation.

### Memory Scenario 7: Promotion in Action (Episode → Observation → Fact → Procedure)

**Gap filled:** No previous scenario traced the actual promotion trigger moments.

**Events over 2 weeks:**

```
Day 1: User starts new project, installs deps with pnpm
  → Episode: "Used pnpm for package management"

Day 3: Second project, user again uses pnpm
  → Episode: "Used pnpm for package management (again)"

  PROMOTION TRIGGER: 2 similar episodes, 2 days apart
  → Observation: "User consistently uses pnpm"

Day 5: User tells teammate "we always use pnpm"
  → Episode: "User stated pnpm is team standard"

Day 7: Agent uses pnpm based on observation, succeeds
  → Episode: "pnpm worked successfully"

  PROMOTION TRIGGER: 3 observations, no contradictions
  → Fact: "Team uses pnpm for package management"
     confidence: 0.85 (promoted from observations)

Day 10: Agent uses pnpm again, succeeds
  → Fact confidence rises to 0.90

  PROMOTION TRIGGER: Fact (confidence ≥ 0.9) + 2 successful uses
  → Procedure:
     trigger: "New project needs package manager"
     steps:
       1. "Use pnpm (not npm or yarn)"
       2. "pnpm install to install dependencies"
       3. "pnpm add <pkg> to add new packages"
     success_rate: 1.0
     times_used: 2
```

**What to verify:**
- Promotion doesn't happen until threshold is met
- Each promotion creates proper links (learned_from: [episode_ids])
- Confidence increases with each supporting observation
- Circular promotion prevention: observation derived from a fact can't promote that same fact

---

### Memory Scenario 8: Cognitive Model Lifecycle

**Gap filled:** Self Model, User Model, Domain Model, Relationship Model.

#### 8a: Self Model Updates

```
Initial Self Model:
  capabilities.strong: ["React Native", "TypeScript"]
  capabilities.weak: []
  limitations: ["Cannot access production databases"]

After Trace H (missed null checks):
  capabilities.weak: ["Null safety checks"]
  evidence: [episode_from_PR_456]

After 5 successful PRs with null checks:
  capabilities.weak: [] (removed)
  capabilities.strong: ["React Native", "TypeScript", "Code review patterns"]
  evidence: [episode_PR_601, episode_PR_645, ...]
```

**What to verify:**
- Self Model updated after mistakes
- Self Model updated after improvement
- Weakness removed after consistent evidence of improvement

#### 8b: User Model Updates

```
Initial User Model (after shadow training):
  theories:
    - statement: "User prefers functional components"
      confidence: 0.6
      evidence_for: [episode_001, episode_002]
      evidence_against: []

    - statement: "User prefers concise communication"
      confidence: 0.7
      evidence_for: [episode_003]

  expertise:
    expo: 0.8
    nativewind: 0.6
    auth: 0.5

After user writes class component (Day 15):
  theories:
    - statement: "User prefers functional components"
      confidence: 0.5 (decreased)
      evidence_against: [episode_015]

After user explains "I only use classes for error boundaries":
  theories:
    - statement: "User prefers functional components except for error boundaries"
      confidence: 0.9 (clarified via dialogue)
      evidence_for: [episode_001, ..., dialogue_007]
```

**What to verify:**
- Theories have evidence for AND against
- Confidence adjusts based on new evidence
- User dialogue can directly clarify/override theories
- Expertise scores update based on observed proficiency

#### 8c: Relationship Model Updates

```
Initial (Day 1):
  trust_level: 0.3
  relationship_phase: "initial"
  interaction_count: 0

After 1 week of shadow training:
  trust_level: 0.5
  relationship_phase: "learning"
  interaction_count: 35

After successful multi-agent deployment:
  trust_level: 0.8
  relationship_phase: "productive"
  significant_events: [first_task_completed, first_feedback_handled]
```

**What to verify:**
- Trust builds over successful interactions
- Phase transitions happen at meaningful thresholds
- Significant events are recorded as references

---

### Memory Scenario 9: Confidence Decay & Archival

**Gap filled:** What happens to unused memories over time.

```
Day 1: Fact created
  content: "expo-blur v12 has memory leak on Android"
  confidence: 0.85
  source: episode_042
  valid_from: 2026-02-01
  last_retrieved: 2026-02-01

Day 30: No retrieval (fact never matched a query)
  confidence: 0.85 (no change yet)

Day 60: Still unused
  confidence: 0.75 (decay begins after 30 days unused)

Day 90: Still unused, confidence < 0.3
  → Archival triggered
  → Fact moved to cold storage
  → Stub remains in main storage:
    {
      id: original_id,
      content: "[Archived] expo-blur v12 memory leak",
      archived_at: 2026-05-01,
      archive_location: "cold-storage",
      reason: "Unused for 90 days, confidence below threshold"
    }
```

**Important: NOT deleted.** If user later asks "did we have issues with expo-blur?", the stub exists and cold storage can be queried.

**Exception:** Hard rules NEVER decay. Confidence 1.0 hard rules persist regardless of retrieval frequency.

**What to verify:**
- Decay only starts after configurable period of no retrieval
- Decay is gradual, not sudden
- Hard rules exempt from decay
- Archived memories can still be found via explicit search
- Archival is logged for auditability

---

### Memory Scenario 10: Token Budget Overflow

**Gap filled:** What happens when too many facts compete for limited context.

```
Task: "Implement user settings screen"

Retrieval returns:
  Hard rules (3, 180 tokens): budget 500 → fits
    - "Never use Realm" (50 tokens)
    - "Always TypeScript strict" (60 tokens)
    - "Never push to main" (70 tokens)

  Procedures (2, 800 tokens): budget 1500 → fits
    - "Create new Expo screen" (score: 0.92, 400 tokens)
    - "Add form with validation" (score: 0.78, 400 tokens)

  Facts (23 candidates, 6200 tokens): budget 4000 → OVERFLOW
    Ranking by: similarity*0.4 + recency*0.2 + confidence*0.3 + source*0.1

    Top 12 fit in 4000 tokens:
    1. [0.94] "Use NativeWind for styling" (220 tokens)
    2. [0.91] "Settings screen at app/(tabs)/settings.tsx" (180 tokens)
    3. [0.89] "Use expo-secure-store for sensitive data" (250 tokens)
    4. [0.87] "Form validation with react-hook-form" (300 tokens)
    ...
    12. [0.71] "Company uses GitLab" (150 tokens)

    DROPPED (11 facts below threshold):
    13. [0.68] "Team communicates in Discord" → not relevant enough
    14. [0.65] "Clerk for auth" → not settings-related
    ...

  Models (self + user, 600 tokens): budget 1000 → fits
    Self: "Good at React Native styling, sometimes misses error handling"
    User: "Prefers functional components, wants tests"
```

**What to verify:**
- Hard rules NEVER dropped (budget reserved)
- Facts ranked by composite score, lowest dropped first
- Token counting is approximate but conservative
- Dropped facts logged (for debugging retrieval quality)
- If a highly relevant fact is just below cutoff, consider compressing others

---

### Memory Scenario 11: Gatekeeper LLM Fallback

**Gap filled:** What happens when patterns don't match and LLM extraction is needed.

```
User message: "The client's infrastructure team mandates that all API
responses must include trace headers for their observability stack,
so we need to add those to every endpoint."

Gatekeeper evaluation:
  1. Fast skip? No (not greeting/confirmation/pure question)
  2. Pattern match?
     - PREFERENCE_RE: no match
     - POLICY_RE: "mandates" not in pattern list
     - TECHNOLOGY_RE: no "switched from/to"
     - DECISION_RE: no "decided/chose"
     - TEMPORAL_RE: no time reference
  3. Might contain facts? Yes ("mandates", "must", "need to")
  4. → needsLlmExtraction: true

LLM extraction (via ExtractionOrchestrator, cheap-first):
  OllamaExtractor processes message:

  Output:
  {
    "facts": [
      {
        "content": "Client requires trace headers on all API responses for observability",
        "category": "policy",
        "confidence": 0.85,
        "entities": ["trace headers", "API responses", "observability"]
      },
      {
        "content": "Client infrastructure team mandates observability compliance",
        "category": "policy",
        "confidence": 0.8,
        "entities": ["infrastructure team", "observability"]
      }
    ]
  }

Storage:
  Fact 1: {content: "Client requires trace headers...", sub_type: policy,
           confidence: 0.85, extraction_method: "ollama"}
  Fact 2: {content: "Client infra team mandates...", sub_type: policy,
           confidence: 0.8, extraction_method: "ollama"}
```

**What to verify:**
- Pattern miss correctly detected
- LLM fallback produces structured facts
- Facts stored with extraction_method for tracking
- If Ollama fails, falls back to next extractor (Mem0, Graphiti, Claude)
- Pattern miss logged (so new patterns can be added for common misses)

---

### Memory Scenario 12: Daily Rituals

**Gap filled:** Morning plan / evening summary as memory creation pathway.

```
Morning (08:30):
  Agent: "Good morning! What's the plan for today?"
  User: "I need to finish the settings screen and start on notifications.
         Also, the client meeting is at 3pm so I might be away."

  Memory created:
    Episode: {summary: "Morning plan discussion", type: "ritual"}
    Fact: {content: "Client meeting at 3pm today", sub_type: "temporal",
           valid_until: end_of_day}
    Fact: {content: "Priority today: settings screen then notifications",
           sub_type: "decision", valid_until: end_of_day}

Evening (17:30):
  Agent: "Here's what I observed today:
    - You worked on settings screen (9am-12pm, completed)
    - Client meeting (3pm-4pm)
    - Started notifications setup (4pm-5pm, in progress)

    Did I miss anything? Any corrections?"

  User: "That's right, but I also decided we'll use expo-notifications
         instead of OneSignal for the push implementation."

  Memory created:
    Episode: {summary: "Evening summary, day mostly complete",
              outcome: "partial", lessons: ["notifications still in progress"]}
    Fact: {content: "Team uses expo-notifications (not OneSignal)",
           sub_type: "decision", confidence: 1.0, source: "user_stated"}

    Morning facts updated:
      "Priority: settings then notifications" → outcome recorded
      "Client meeting at 3pm" → valid_until: end_of_day (expires)
```

**What to verify:**
- Daily rituals create both episodic and semantic memories
- Temporal facts (meetings, deadlines) have appropriate valid_until
- User corrections in evening summary get confidence 1.0
- Incomplete goals carry over to next morning prompt
- Rituals don't create noise (filter "good morning" from memory)

---

### Memory Scenario 14: What Should NOT Be Saved (from Golden Dataset)

**Gap filled:** Edge cases where extraction should produce NO facts.

**Source:** `tests/fixtures/graphiti-golden-dataset.json`

#### 14a: Greetings → No Memory

```
Input: "Hi"

Gatekeeper: SKIP (GREETING_RE match, <50 chars)
Expected: entities=[], facts=[]

Why: Greetings contain zero factual information. Saving them
wastes storage and pollutes retrieval results.
```

#### 14b: Pure Questions → No Facts (But May Extract Entities)

```
Input: "Have you heard of Deno?"

Gatekeeper: SKIP (QUESTION_ONLY_RE match)
Expected: entities=["Deno"], facts=[]

Why: Questions don't assert facts. "Have you heard of X" doesn't
mean the user uses X or prefers X. The entity Deno is mentioned
but no relationship is established.

IMPORTANT: Do not infer "user is interested in Deno" from a
question — that's speculation, not extraction.
```

#### 14c: Conditionals/Hypotheticals → Save With Low Confidence

```
Input: "I would use Kubernetes if we had more resources"

Expected:
  facts: [{
    content: "User would use Kubernetes if had more resources",
    confidence: 0.5,  // LOW - hypothetical, not actual
    sub_type: "preference"
  }]

Why: The user hasn't chosen Kubernetes. This is a conditional
preference. Store it but with LOW confidence so it doesn't
override actual technology decisions. It's useful context
("user knows about k8s, might want it later") but not a fact.
```

#### 14d: Assistant Statements → No Memory from Assistant

```
Input:
  User: "I use Docker for containers"
  Assistant: "Docker is great for development"

Expected: Only extract from USER message.
  facts: [{content: "User uses Docker for containers"}]
  NOT: "Docker is great for development" (that's the LLM's opinion)

Why: The assistant's statements are generated by the LLM. Saving
them as user facts creates a feedback loop where the LLM's own
output becomes "remembered knowledge."

Exception: When the assistant is reporting observed facts
(observation pipeline), those ARE extractable.
```

---

### Memory Scenario 15: Extraction Edge Cases (from Golden Dataset)

**Gap filled:** Tricky extraction patterns that affect memory quality.

#### 15a: Negation Must Be Preserved

```
Input: "I don't use Windows anymore"

WRONG extraction: "User uses Windows" (lost the negation!)
CORRECT extraction: "User does not use Windows anymore"

category: preference
confidence: 0.9
temporal_note: "anymore" implies this changed at some point

Why: Negation inversion is the most dangerous extraction error.
It creates the opposite of the user's intent.
```

#### 15b: Entity Deduplication (Variant Names)

```
Input:
  User: "We use Postgres for our main database"
  Assistant: "PostgreSQL has great performance"

Expected: ONE entity: "PostgreSQL" (canonical name)
  NOT: Two entities "Postgres" and "PostgreSQL"

Facts: [{content: "Team uses PostgreSQL for main database"}]
  (normalized to canonical name)

Why: Variant names for the same technology must be deduplicated.
This affects retrieval — searching for "PostgreSQL" should find
facts stored under "Postgres" and vice versa.

Common variants to handle:
  - Postgres / PostgreSQL
  - React.js / React / ReactJS
  - Node / Node.js / NodeJS
  - k8s / Kubernetes
  - JS / JavaScript
  - TS / TypeScript
  - RN / React Native
  - Next / Next.js
```

#### 15c: Multi-Entity Lists

```
Input: "My favorite languages are Python, JavaScript, and Rust"

Expected: THREE separate facts, not one:
  1. "User's favorite language includes Python"
  2. "User's favorite language includes JavaScript"
  3. "User's favorite language includes Rust"

Why: A single fact "User likes Python, JavaScript, and Rust"
is harder to retrieve when searching for just "Python".
Individual facts have better retrieval characteristics.

BUT: Also store the list relationship:
  "User's favorite languages are Python, JavaScript, and Rust"
  (for when the full list is relevant)
```

#### 15d: Multi-Turn Pronoun Resolution

```
Input:
  User: "What do you think about GraphQL?"
  Assistant: "GraphQL is great for flexible APIs. Do you use it?"
  User: "Yes, we've been using it for the last 2 years"

Expected:
  facts: [{content: "Team has been using GraphQL for 2 years"}]

"it" in the user's response refers to GraphQL from the first message.
The extraction must resolve pronouns across turns.

Why: Most facts are stated in multi-turn context. Without pronoun
resolution, "we've been using it" becomes meaningless.
```

#### 15e: Entity-to-Entity Facts (No User Involved)

```
Input: "Tailwind works really well with React"

Expected:
  facts: [{
    content: "Tailwind works well with React",
    entities: ["Tailwind", "React"],
    category: "technology"
  }]

Note: No "user" entity involved. This is a fact about the
relationship between two technologies, stated by the user
but not about the user.

Why: Not all facts are "user prefers X". Technology compatibility
facts are valuable domain knowledge.
```

#### 15f: Preferences With Reasoning

```
Input: "I prefer VS Code because of the extensions ecosystem"

Expected:
  facts: [{
    content: "User prefers VS Code because of extensions ecosystem",
    entities: ["VS Code"],
    category: "preference"
  }]

Why: The "because" clause is critical context. Without it,
we just know "prefers VS Code" but not why. The reasoning
helps the agent make better recommendations later.

When the user asks "should I try Vim?", the agent can say
"You prefer VS Code specifically for its extensions ecosystem —
Vim has extensions too but the ecosystem is different."
```

---

### Memory Scenario 13: Procedure Success Rate Updates

**Gap filled:** How success_rate changes with use.

```
Procedure: "Add authentication to Expo app"
  trigger: "Need auth in mobile app"
  steps: [Consider Clerk → install → provider → screens → routes]
  success_rate: 1.0
  times_used: 2

Use 3: Agent follows procedure, succeeds
  success_rate = (2 * 1.0 + 1.0) / 3 = 1.0
  times_used: 3

Use 4: Agent follows procedure, but step 3 (ClerkProvider) fails
  because Clerk updated their SDK and the import path changed

  success_rate = (3 * 1.0 + 0.0) / 4 = 0.75
  times_used: 4

  Agent reports failure:
    Episode: {summary: "Auth procedure failed at step 3 - Clerk import changed"}

  Agent investigates, finds fix:
    Fact: {content: "Clerk v5 changed import from @clerk/clerk-expo to @clerk/expo"}

  Procedure updated:
    step 3 instruction updated: "import { ClerkProvider } from '@clerk/expo'"
    success_rate reset context: "Failed due to SDK change, procedure steps updated"

Use 5: Agent follows updated procedure, succeeds
  success_rate = (3 * 1.0 + 0.0 + 1.0) / 5 = 0.8
  times_used: 5

After 3 more successes:
  success_rate = 0.875
  times_used: 8
```

**What to verify:**
- Success rate calculated as rolling average
- Failed uses create episode + investigation
- Procedure steps can be updated (with supersession of old version)
- Success rate recovers after fixing root cause
- Low success rate (<0.5) triggers review / potential supersession

---

## Evaluation Criteria

Use these scenarios to evaluate any architectural decision:

### For Memory System

| Scenario | Question |
|----------|----------|
| 1 (Mistake learning) | Can it capture the temporal sequence? |
| 2 (Manual entry) | Can user add structured knowledge easily? |
| 3 (Article) | Can it extract and store from external content? |
| 4 (Expiration) | Can it track validity periods? |
| 5 (Cross-agent) | Can it detect patterns over time? |
| 6 (Conflict) | Can it handle and resolve conflicts? |

### For Storage/Infrastructure

| Scenario | Question |
|----------|----------|
| Phase 2 (Export) | Can persona be exported portably? |
| Phase 3 (Deploy) | Can knowledge be shared across agents? |
| Phase 4 (Work) | Can agents read/write concurrently? |
| 4.4 (Update) | Can knowledge be invalidated cleanly? |

### For Observation Pipeline

| Scenario | Question |
|----------|----------|
| Phase 1 (Shadow) | Can it capture the activity stream? |
| 4.2 (Execute) | Can it observe agent's own actions? |
| 4.3 (Review) | Can it observe inter-agent interactions? |

---

## Success Metrics

### Phase 1 Success
- Agent accurately recalls user preferences (>90%)
- Agent applies learned procedures correctly (>85%)
- Agent respects hard rules (100%)

### Phase 3-4 Success
- Agents complete tasks autonomously (>70%)
- Cross-agent patterns detected within 3 occurrences
- Knowledge updates propagate to all agents
- User can view/edit knowledge easily

### Overall Success
- Agents perform "better than starting fresh"
- Knowledge compounds over time
- Team of 3 agents > 3 separate agents without shared knowledge

---

*Document created: 2026-02-02*
*Use this to evaluate: memory system, storage, infrastructure, observation pipeline*
