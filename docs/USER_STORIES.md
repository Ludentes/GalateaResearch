# Galatea User Stories

**Date**: 2026-02-03
**Purpose**: Feature requirements from user perspective
**Source**: Extracted from REFERENCE_SCENARIOS.md

---

## Actors

| Actor | Description |
|-------|-------------|
| **User** | Developer training an agent through shadow learning |
| **PM** | Project manager deploying and coordinating agents |
| **Agent** | AI agent executing tasks |
| **Reviewer** | Human or agent reviewing work |

---

## Epic 1: Shadow Learning

Training an agent by observing user behavior.

### US-1.1: Activity Observation
**As a** User
**I want** Galatea to observe my coding sessions
**So that** it learns my patterns without manual documentation

**Acceptance Criteria:**
- Captures browser activity (tabs, searches)
- Captures terminal commands and outcomes
- Captures IDE events (file open, save, debug)
- Captures MQTT events (Home Assistant, Frigate)
- Filters noise (node_modules, .git, short visits)

### US-1.2: Intent Validation
**As a** User
**I want** Galatea to ask me what I was trying to do
**So that** it learns correct intent, not just actions

**Acceptance Criteria:**
- Groups activities into sessions
- Guesses intent with confidence score
- Asks for validation when confidence < 0.8
- Accepts corrections gracefully

### US-1.3: Learning Checkpoints
**As a** User
**I want** Galatea to ask clarifying questions at natural breaks
**So that** ambiguous situations get resolved correctly

**Acceptance Criteria:**
- Detects pivots (tried A, switched to B)
- Offers interpretation options
- Stores validated interpretation with high confidence
- Doesn't interrupt flow (waits for breaks)

### US-1.4: Daily Rituals
**As a** User
**I want** Galatea to ask about my plans and summarize my day
**So that** context is established and validated regularly

**Acceptance Criteria:**
- Morning prompt: "What's the plan for today?"
- Evening summary: "Here's what I observed..."
- Accepts corrections to summaries
- Carries over incomplete goals

### US-1.5: Manual Knowledge Entry
**As a** User
**I want** to explicitly teach Galatea facts and rules
**So that** critical knowledge doesn't depend on observation

**Acceptance Criteria:**
- Can add facts via chat ("Remember: never use Realm")
- Can add facts via MD files (Obsidian)
- Manual entries have high confidence (1.0)
- Can specify severity (hard rule vs preference)

### US-1.6: External Content Learning
**As a** User
**I want** Galatea to learn from articles and docs I share
**So that** external knowledge enters the system

**Acceptance Criteria:**
- Can paste article content or URL
- Extracts key facts automatically
- Allows user annotation ("use sparingly")
- Links facts to source

---

## Epic 2: Memory & Retrieval

Storing and retrieving learned knowledge.

### US-2.1: Episodic Memory
**As an** Agent
**I want** to remember what happened and when
**So that** I have context for patterns and decisions

**Acceptance Criteria:**
- Stores timestamp, duration, outcome
- Stores emotional context (frustrated, relieved)
- Links to related facts and procedures
- Supports temporal queries ("what happened last week?")

### US-2.2: Semantic Memory (Facts)
**As an** Agent
**I want** to remember facts with confidence levels
**So that** I can make informed decisions

**Acceptance Criteria:**
- Stores facts with confidence (0.0-1.0)
- Tracks evidence (which episodes support this)
- Supports domains and tags
- Handles conflicting facts (resolution)

### US-2.3: Procedural Memory
**As an** Agent
**I want** to remember how to do things
**So that** I can repeat successful approaches

**Acceptance Criteria:**
- Stores trigger → steps → outcome
- Tracks success rate across uses
- Supports expiration ("valid until NativeWind 4.1")
- Includes code examples where relevant

### US-2.4: Hard Rules
**As an** Agent
**I want** hard rules to ALWAYS appear in my context
**So that** I never violate critical policies

**Acceptance Criteria:**
- Hard rules injected regardless of semantic similarity
- Cannot be overridden by other memories
- Clearly marked as blocks in context
- 100% recall guarantee

### US-2.5: Context Assembly
**As an** Agent
**I want** relevant memories assembled into my prompt
**So that** I have the right knowledge for each task

**Acceptance Criteria:**
- Guaranteed: hard rules (always)
- Semantic search: relevant facts
- Procedure matching: applicable procedures
- Cognitive models: self, user, domain context
- Respects token budget

### US-2.6: Memory Gatekeeper
**As an** Agent
**I want** to skip retrieving general knowledge I already know
**So that** context space is used efficiently

**Acceptance Criteria:**
- Filters facts the LLM already knows
- Keeps domain-specific knowledge
- Keeps user preferences
- Keeps company-specific rules

---

## Epic 3: Homeostasis & Behavior

Dimension-based behavior guidance.

### US-3.1: Knowledge Sufficiency
**As an** Agent
**I want** to know when I lack knowledge for a task
**So that** I research or ask before acting blindly

**Acceptance Criteria:**
- Detects knowledge gaps (no relevant memories)
- When LOW: triggers research or question
- When HEALTHY: proceeds with task
- Provides guidance text in prompt

### US-3.2: Certainty Alignment
**As an** Agent
**I want** my confidence to match my actions
**So that** I ask when uncertain and act when confident

**Acceptance Criteria:**
- When LOW confidence + about to act: prompts to ask
- When HIGH confidence + keeps asking: prompts to try
- Distinguishes reversible vs costly decisions
- Persona-specific thresholds

### US-3.3: Progress Momentum
**As an** Agent
**I want** to detect when I'm stuck
**So that** I can escalate or change approach

**Acceptance Criteria:**
- Tracks time without progress
- When STALLING: diagnose, escalate, or pivot
- When rushing: slow down, verify
- Prevents silent spinning

### US-3.4: Communication Health
**As an** Agent
**I want** to stay connected with my team
**So that** I don't go dark or spam

**Acceptance Criteria:**
- Tracks time since last update
- When LOW: post status update
- When HIGH (just posted): batch messages, wait
- Prevents both silence and spam

### US-3.5: Productive Engagement
**As an** Agent
**I want** to always have valuable work
**So that** I contribute consistently

**Acceptance Criteria:**
- When no task: seek work (ask PM, help teammate, review)
- Prioritizes: assigned > help > review > learn
- When overloaded: prioritize or delegate
- Balances with other dimensions

### US-3.6: Knowledge Application
**As an** Agent
**I want** to balance learning and doing
**So that** I don't over-research or under-prepare

**Acceptance Criteria:**
- Tracks research time vs implementation
- When HIGH (too much research): apply now
- When LOW (diving in blind): pause to understand
- Guardrail catches 2+ hour research spirals

---

## Epic 4: Activity Routing

Selecting appropriate processing depth.

### US-4.1: Level Classification
**As an** Agent
**I want** tasks classified by complexity
**So that** simple tasks don't waste expensive processing

**Acceptance Criteria:**
- Level 0: Direct (no LLM) - tool calls, templates
- Level 1: Pattern (Haiku) - procedure exists
- Level 2: Reason (Sonnet) - implementation, review
- Level 3: Reflect (Sonnet + loop) - unknown, high-stakes

### US-4.2: Model Selection
**As an** Agent
**I want** the right model for each task
**So that** I'm fast when possible, thorough when needed

**Acceptance Criteria:**
- Level 0: No LLM call
- Level 1: Haiku (fast, cheap)
- Level 2: Sonnet (capable)
- Level 3: Sonnet with Reflexion loop

### US-4.3: Reflexion Loop
**As an** Agent
**I want** to draft, critique, and revise for complex tasks
**So that** high-stakes outputs are validated

**Acceptance Criteria:**
- Draft initial response
- Gather evidence (search, tools)
- Critique against evidence
- Revise if needed (max 5 iterations)
- Exit when good enough or max reached

---

## Epic 5: Tool Execution

Using MCP tools to interact with the world.

### US-5.1: Tool Discovery
**As an** Agent
**I want** to know what tools are available
**So that** I can choose the right tool for each action

**Acceptance Criteria:**
- Lists available MCP servers
- Shows tool descriptions and parameters
- Filters by relevance to task
- Caches tool metadata

### US-5.2: Tool Execution
**As an** Agent
**I want** to execute tools reliably
**So that** I can interact with GitLab, Discord, filesystem

**Acceptance Criteria:**
- Executes MCP tool calls
- Captures success/failure
- Returns results to context
- Tracks execution time

### US-5.3: Approval Gates
**As a** User/PM
**I want** destructive tools to require approval
**So that** agents can't cause damage without oversight

**Acceptance Criteria:**
- Destructive tools flagged (delete, push, merge)
- Approval prompt before execution
- Timeout handling (auto-reject after N minutes)
- Audit log of approvals

### US-5.4: Tool Usage Learning
**As an** Agent
**I want** to learn which tools work for which tasks
**So that** I improve tool selection over time

**Acceptance Criteria:**
- Records tool + task + outcome
- Updates procedure success rates
- Learns tool preferences ("use gh over curl for GitHub")
- Detects tool failures patterns

---

## Epic 6: Persona & Export

Configuring and sharing agent personalities.

### US-6.1: Persona Configuration
**As a** User/PM
**I want** to configure agent personality via preprompts
**So that** different agents have different focuses

**Acceptance Criteria:**
- Core identity preprompt (shared)
- Role preprompt (coder, reviewer, assistant)
- Domain preprompt (Expo, backend, testing)
- Threshold configuration per persona

### US-6.2: MD File Configuration
**As a** User
**I want** to configure agents via Markdown files
**So that** I can use Obsidian and version control

**Acceptance Criteria:**
- Personas in `personas/*.md`
- Rules in `rules/*.md`
- Procedures in `procedures/*.md`
- Domain knowledge in `domain/*.md`
- Syncs to DB on startup/endpoint

### US-6.3: Persona Export
**As a** User
**I want** to export a trained persona
**So that** I can share it or deploy elsewhere

**Acceptance Criteria:**
- Exports semantic + procedural memories
- Exports hard rules and preferences
- Anonymizes/excludes episodic details (privacy)
- Includes provenance metadata

### US-6.4: Persona Import
**As a** PM
**I want** to import a persona and create agents from it
**So that** I can deploy trained knowledge

**Acceptance Criteria:**
- Imports into company Galatea instance
- Creates agents with shared knowledge
- Each agent gets own episodic memory
- Tracks import provenance

---

## Epic 7: Multi-Agent Coordination

Multiple agents working together.

### US-7.1: Task Assignment
**As a** PM
**I want** to assign tasks to specific agents
**So that** work is distributed appropriately

**Acceptance Criteria:**
- @mention assigns task in Discord
- Agent acknowledges assignment
- Agent updates productive_engagement state
- Agent reports completion

### US-7.2: Agent Coordination
**As an** Agent
**I want** to see what other agents are doing
**So that** I don't duplicate work or create conflicts

**Acceptance Criteria:**
- Reads team channel for context
- Avoids conflicting actions (same file, same MR)
- Coordinates timing (don't all post at once)
- Can offer help to busy agents

### US-7.3: Cross-Agent Review
**As an** Agent
**I want** to review other agents' work
**So that** quality is maintained without human bottleneck

**Acceptance Criteria:**
- Can fetch MR diff from GitLab
- Reviews against learned checklist
- Posts specific feedback with suggestions
- Approves or requests changes

### US-7.4: Cross-Agent Learning
**As an** Agent
**I want** to learn from patterns across all agents
**So that** repeated mistakes become shared knowledge

**Acceptance Criteria:**
- Detects: Agent-1 missed null check, Agent-2 missed null check
- Elevates to shared fact: "Null checks commonly missed"
- Threshold: 2-3 occurrences before elevation
- Tracks improvement over time

---

## Epic 8: Learning & Promotion

Knowledge evolving over time.

### US-8.1: Episode to Fact Promotion
**As an** Agent
**I want** repeated episodes to become facts
**So that** patterns are recognized automatically

**Acceptance Criteria:**
- 2+ similar episodes → candidate fact
- Confidence based on consistency
- Links fact to source episodes
- User can confirm/reject promotion

### US-8.2: Fact to Procedure Promotion
**As an** Agent
**I want** reliable facts to become procedures
**So that** I have actionable steps, not just knowledge

**Acceptance Criteria:**
- Facts with consistent action patterns
- Extracts trigger → steps structure
- Initial success_rate from training data
- Updates success_rate on each use

### US-8.3: Knowledge Supersession
**As an** Agent
**I want** outdated knowledge to be marked, not deleted
**So that** history is preserved and changes are traceable

**Acceptance Criteria:**
- Supersede edge: new → old
- Old knowledge marked as superseded
- Query returns new by default
- Can query history ("what did we believe before?")

### US-8.4: Temporal Validity
**As an** Agent
**I want** knowledge to have time bounds
**So that** outdated workarounds don't persist forever

**Acceptance Criteria:**
- valid_from, valid_until fields
- Automatic check against current date
- Prompts review when approaching expiration
- Links to release notes or sources

### US-8.5: Threshold Calibration
**As a** User
**I want** homeostasis thresholds to calibrate from my behavior
**So that** the agent matches my working style

**Acceptance Criteria:**
- Observes: user asks for help after ~30min stuck
- Derives: certainty_alignment.ask_threshold ≈ 30min
- Observes: user posts updates every ~2 hours
- Derives: communication_health.interval ≈ 2 hours
- User can confirm or adjust

---

## Priority Matrix

### P0 - Must Have (MVP)

| ID | Story | Phase |
|----|-------|-------|
| US-2.4 | Hard Rules Always Included | Phase 2 |
| US-2.5 | Context Assembly | Phase 2 |
| US-3.1 | Knowledge Sufficiency | Phase 3 |
| US-3.2 | Certainty Alignment | Phase 3 |
| US-4.1 | Level Classification | Phase 3 |
| US-4.2 | Model Selection | Phase 3 |
| US-5.2 | Tool Execution | Phase 4 |

### P1 - Should Have

| ID | Story | Phase |
|----|-------|-------|
| US-1.1 | Activity Observation | Phase 1 |
| US-1.2 | Intent Validation | Phase 1 |
| US-2.1 | Episodic Memory | Phase 2 |
| US-2.2 | Semantic Memory | Phase 2 |
| US-2.3 | Procedural Memory | Phase 2 |
| US-3.3 | Progress Momentum | Phase 3 |
| US-3.4 | Communication Health | Phase 3 |
| US-5.3 | Approval Gates | Phase 4 |
| US-6.1 | Persona Configuration | Phase 6 |
| US-6.2 | MD File Configuration | Phase 5 |

### P2 - Nice to Have

| ID | Story | Phase |
|----|-------|-------|
| US-1.3 | Learning Checkpoints | Phase 5 |
| US-1.4 | Daily Rituals | Phase 5 |
| US-1.5 | Manual Knowledge Entry | Phase 2 |
| US-2.6 | Memory Gatekeeper | Phase 2 |
| US-3.5 | Productive Engagement | Phase 3 |
| US-3.6 | Knowledge Application | Phase 3 |
| US-4.3 | Reflexion Loop | Phase 3 |
| US-6.3 | Persona Export | Phase 6 |
| US-6.4 | Persona Import | Phase 6 |
| US-7.1-4 | Multi-Agent Coordination | Future |
| US-8.1-5 | Learning & Promotion | Phase 5 |

---

## Mapping to Implementation Phases

| Phase | User Stories |
|-------|-------------|
| **Phase 1: Foundation** | (Infrastructure only) |
| **Phase 2: Memory** | US-2.1 through US-2.6, US-1.5 |
| **Phase 3: Homeostasis + Router** | US-3.1 through US-3.6, US-4.1 through US-4.3 |
| **Phase 4: Tools** | US-5.1 through US-5.4 |
| **Phase 5: Learning** | US-1.1 through US-1.4, US-6.2, US-8.1 through US-8.5 |
| **Phase 6: Personas** | US-6.1, US-6.3, US-6.4 |
| **Future: Multi-Agent** | US-7.1 through US-7.4 |

---

*Extracted from REFERENCE_SCENARIOS.md: 2026-02-03*
*Use TEST_CONTRACTS.md for precise acceptance testing*
