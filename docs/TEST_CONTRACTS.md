# Galatea Test Contracts

**Date**: 2026-02-03
**Purpose**: Precise, testable behavior contracts by component
**Format**: Given/When/Then with priority levels

---

## Contract Format

```yaml
contract:
  id: TC-{component}-{number}
  name: descriptive_name
  component: ComponentName
  story: US-X.X  # Links to USER_STORIES.md
  priority: P0 | P1 | P2

  given: precondition state
  when: action or trigger
  then: expected outcome (testable)

  test_type: unit | integration | e2e
  automatable: true | false
```

**Priority Levels:**
- **P0**: Must pass before any merge (blockers)
- **P1**: Must pass before phase completion
- **P2**: Should pass, can defer if needed

---

## Phase 2: Memory System

### Context Assembly

```yaml
- id: TC-CTX-001
  name: hard_rules_always_included
  component: ContextBuilder
  story: US-2.4
  priority: P0

  given: Hard rule exists with domain "expo" containing "Never use Realm"
  when: Building context for task "Choose database for Expo app"
  then: System prompt contains exact text "Never use Realm"

  test_type: unit
  automatable: true

- id: TC-CTX-002
  name: hard_rules_included_regardless_of_similarity
  component: ContextBuilder
  story: US-2.4
  priority: P0

  given: Hard rule "Never push to main" exists
  when: Building context for task "Fix typo in README"
  then: System prompt contains "Never push to main" even though semantically unrelated

  test_type: unit
  automatable: true

- id: TC-CTX-003
  name: semantic_search_returns_relevant_facts
  component: ContextBuilder
  story: US-2.5
  priority: P1

  given: Facts exist ["Prefer Clerk for auth", "Use NativeWind for styling", "Company uses GitLab"]
  when: Query "authentication in mobile app"
  then: "Prefer Clerk for auth" appears in top 3 results

  test_type: integration
  automatable: true

- id: TC-CTX-004
  name: procedure_matching_by_trigger
  component: ContextBuilder
  story: US-2.5
  priority: P1

  given: Procedure exists with trigger "Pressable animation flickering"
  when: Task contains "button animation is flickering in Expo"
  then: Procedure steps included in context

  test_type: integration
  automatable: true

- id: TC-CTX-005
  name: token_budget_respected
  component: ContextBuilder
  story: US-2.5
  priority: P1

  given: Token budget is 4000, available content is 8000 tokens
  when: Building context
  then: Total context tokens <= 4000

  test_type: unit
  automatable: true

- id: TC-CTX-006
  name: hard_rules_not_truncated
  component: ContextBuilder
  story: US-2.4
  priority: P0

  given: Token budget is 1000, hard rules are 500 tokens, other content is 2000 tokens
  when: Building context with truncation
  then: All hard rules included, other content truncated

  test_type: unit
  automatable: true
```

### Memory Storage

```yaml
- id: TC-MEM-001
  name: episodic_stores_with_timestamp
  component: MemoryStore
  story: US-2.1
  priority: P1

  given: Episode data with timestamp "2026-02-03T10:00:00Z"
  when: Storing episodic memory
  then: Can retrieve by time range including that timestamp

  test_type: unit
  automatable: true

- id: TC-MEM-002
  name: fact_confidence_persists
  component: MemoryStore
  story: US-2.2
  priority: P1

  given: Fact "Prefer Clerk" stored with confidence 0.85
  when: Retrieving fact
  then: Confidence value is 0.85

  test_type: unit
  automatable: true

- id: TC-MEM-003
  name: procedure_success_rate_updates
  component: MemoryStore
  story: US-2.3
  priority: P1

  given: Procedure with success_rate 0.8 and times_used 5
  when: Recording successful use
  then: success_rate recalculated, times_used = 6

  test_type: unit
  automatable: true

- id: TC-MEM-004
  name: fact_supersession_preserves_history
  component: MemoryStore
  story: US-8.3
  priority: P2

  given: Fact A exists
  when: Fact B supersedes Fact A
  then: Both facts exist, A has superseded_by link to B

  test_type: unit
  automatable: true

- id: TC-MEM-005
  name: temporal_validity_filters_expired
  component: MemoryStore
  story: US-8.4
  priority: P2

  given: Fact with valid_until "2026-01-01" (past)
  when: Querying active facts on "2026-02-03"
  then: Expired fact not returned in active results

  test_type: unit
  automatable: true
```

### Graphiti Integration

```yaml
- id: TC-GRA-001
  name: node_creation_with_type
  component: GraphitiClient
  story: US-2.1
  priority: P1

  given: Valid episodic memory data
  when: Creating node in Graphiti
  then: Node created with type "episodic" and all properties

  test_type: integration
  automatable: true

- id: TC-GRA-002
  name: edge_creation_contributed_to
  component: GraphitiClient
  story: US-8.1
  priority: P2

  given: Episode node and Fact node exist
  when: Creating CONTRIBUTED_TO edge from episode to fact
  then: Edge exists with weight property

  test_type: integration
  automatable: true

- id: TC-GRA-003
  name: semantic_search_via_embedding
  component: GraphitiClient
  story: US-2.5
  priority: P1

  given: 10 facts with embeddings in graph
  when: Searching with query embedding
  then: Returns facts ordered by similarity score

  test_type: integration
  automatable: true
```

---

## Phase 3: Homeostasis Engine

### Dimension Assessment

```yaml
- id: TC-HOM-001
  name: knowledge_sufficiency_low_when_no_memories
  component: HomeostasisEngine
  story: US-3.1
  priority: P0

  given: Task "implement push notifications", no relevant memories retrieved
  when: Assessing knowledge_sufficiency
  then: State is LOW

  test_type: unit
  automatable: true

- id: TC-HOM-002
  name: knowledge_sufficiency_healthy_when_procedure_exists
  component: HomeostasisEngine
  story: US-3.1
  priority: P0

  given: Task "create new Expo screen", matching procedure retrieved
  when: Assessing knowledge_sufficiency
  then: State is HEALTHY

  test_type: unit
  automatable: true

- id: TC-HOM-003
  name: certainty_low_triggers_ask_guidance
  component: HomeostasisEngine
  story: US-3.2
  priority: P0

  given: certainty_alignment is LOW, task is non-trivial
  when: Getting guidance
  then: Guidance text includes "ask" or "clarify"

  test_type: unit
  automatable: true

- id: TC-HOM-004
  name: certainty_high_triggers_try_guidance
  component: HomeostasisEngine
  story: US-3.2
  priority: P1

  given: certainty_alignment is HIGH, agent keeps asking questions
  when: Getting guidance
  then: Guidance text includes "try" or "proceed"

  test_type: unit
  automatable: true

- id: TC-HOM-005
  name: progress_stalling_detected
  component: HomeostasisEngine
  story: US-3.3
  priority: P1

  given: No progress events in last 30 minutes
  when: Assessing progress_momentum
  then: State is LOW or STALLING

  test_type: unit
  automatable: true

- id: TC-HOM-006
  name: communication_health_low_after_silence
  component: HomeostasisEngine
  story: US-3.4
  priority: P1

  given: Persona threshold interval is 2 hours, last message was 3 hours ago
  when: Assessing communication_health
  then: State is LOW

  test_type: unit
  automatable: true

- id: TC-HOM-007
  name: communication_health_high_prevents_spam
  component: HomeostasisEngine
  story: US-3.4
  priority: P1

  given: Agent posted 3 messages in last 5 minutes
  when: Assessing communication_health
  then: State is HIGH (too much communication)

  test_type: unit
  automatable: true
```

### Guidance Generation

```yaml
- id: TC-GUI-001
  name: guidance_text_injected_in_prompt
  component: HomeostasisEngine
  story: US-3.1
  priority: P0

  given: knowledge_sufficiency is LOW
  when: Building prompt with homeostasis guidance
  then: Prompt contains guidance text for LOW knowledge_sufficiency

  test_type: integration
  automatable: true

- id: TC-GUI-002
  name: multiple_dimension_guidance_combined
  component: HomeostasisEngine
  story: US-3.1
  priority: P1

  given: knowledge_sufficiency is LOW, communication_health is LOW
  when: Building guidance
  then: Combined guidance addresses both dimensions

  test_type: unit
  automatable: true

- id: TC-GUI-003
  name: guardrail_catches_over_research
  component: HomeostasisEngine
  story: US-3.6
  priority: P1

  given: knowledge_application is HIGH (researching for 2+ hours)
  when: Getting guidance
  then: Guidance includes "time to apply" or "stop researching"

  test_type: unit
  automatable: true
```

---

## Phase 3: Activity Router

### Level Classification

```yaml
- id: TC-RTR-001
  name: level_0_for_simple_tool_call
  component: ActivityRouter
  story: US-4.1
  priority: P0

  given: Task is "list files in current directory"
  when: Classifying activity level
  then: Level is 0 (Direct)

  test_type: unit
  automatable: true

- id: TC-RTR-002
  name: level_1_when_procedure_exists
  component: ActivityRouter
  story: US-4.1
  priority: P0

  given: Task "create new Expo screen", procedure exists with success_rate > 0.8
  when: Classifying activity level
  then: Level is 1 (Pattern)

  test_type: unit
  automatable: true

- id: TC-RTR-003
  name: level_2_for_implementation_task
  component: ActivityRouter
  story: US-4.1
  priority: P0

  given: Task "implement user profile with edit functionality"
  when: Classifying activity level
  then: Level is 2 (Reason)

  test_type: unit
  automatable: true

- id: TC-RTR-004
  name: level_3_for_unknown_high_stakes
  component: ActivityRouter
  story: US-4.1
  priority: P0

  given: Task "design authentication architecture", no relevant procedures, homeostasis knowledge_sufficiency LOW
  when: Classifying activity level
  then: Level is 3 (Reflect)

  test_type: unit
  automatable: true

- id: TC-RTR-005
  name: level_3_triggers_reflexion_loop
  component: ActivityRouter
  story: US-4.3
  priority: P1

  given: Task classified as Level 3
  when: Routing task
  then: Reflexion loop is invoked (Draft → Critique → Revise)

  test_type: integration
  automatable: true
```

### Model Selection

```yaml
- id: TC-MOD-001
  name: level_0_no_llm_call
  component: ActivityRouter
  story: US-4.2
  priority: P0

  given: Task classified as Level 0
  when: Executing task
  then: No LLM API call made

  test_type: integration
  automatable: true

- id: TC-MOD-002
  name: level_1_uses_haiku
  component: ActivityRouter
  story: US-4.2
  priority: P0

  given: Task classified as Level 1
  when: Selecting model
  then: Model is Haiku (or equivalent fast model)

  test_type: unit
  automatable: true

- id: TC-MOD-003
  name: level_2_uses_sonnet
  component: ActivityRouter
  story: US-4.2
  priority: P0

  given: Task classified as Level 2
  when: Selecting model
  then: Model is Sonnet (or equivalent capable model)

  test_type: unit
  automatable: true

- id: TC-MOD-004
  name: level_3_uses_sonnet_with_iterations
  component: ActivityRouter
  story: US-4.2
  priority: P1

  given: Task classified as Level 3
  when: Executing reflexion loop
  then: Multiple Sonnet calls made (3-15 range)

  test_type: integration
  automatable: true
```

### Reflexion Loop

```yaml
- id: TC-REF-001
  name: reflexion_produces_draft
  component: ReflexionLoop
  story: US-4.3
  priority: P1

  given: Complex task input
  when: Starting reflexion
  then: Draft response generated

  test_type: unit
  automatable: true

- id: TC-REF-002
  name: reflexion_critiques_draft
  component: ReflexionLoop
  story: US-4.3
  priority: P1

  given: Draft response exists
  when: Critique phase
  then: Issues identified (or "no issues" explicit)

  test_type: unit
  automatable: true

- id: TC-REF-003
  name: reflexion_revises_on_issues
  component: ReflexionLoop
  story: US-4.3
  priority: P1

  given: Critique found issues
  when: Revise phase
  then: New draft addresses at least one issue

  test_type: unit
  automatable: true

- id: TC-REF-004
  name: reflexion_exits_on_good_enough
  component: ReflexionLoop
  story: US-4.3
  priority: P1

  given: Critique found no significant issues
  when: Checking exit condition
  then: Loop exits, returns current draft

  test_type: unit
  automatable: true

- id: TC-REF-005
  name: reflexion_exits_on_max_iterations
  component: ReflexionLoop
  story: US-4.3
  priority: P1

  given: Loop has run 5 iterations, still has issues
  when: Checking exit condition
  then: Loop exits with best draft, notes unresolved issues

  test_type: unit
  automatable: true
```

---

## Phase 4: Tool Execution

### MCP Integration

```yaml
- id: TC-MCP-001
  name: tool_list_retrieval
  component: MCPClient
  story: US-5.1
  priority: P1

  given: MCP server "filesystem" is configured
  when: Listing available tools
  then: Tools include read_file, write_file, list_directory

  test_type: integration
  automatable: true

- id: TC-MCP-002
  name: tool_execution_success
  component: MCPClient
  story: US-5.2
  priority: P0

  given: Tool "read_file" available, file exists at path
  when: Executing read_file with valid path
  then: File content returned

  test_type: integration
  automatable: true

- id: TC-MCP-003
  name: tool_execution_failure_handled
  component: MCPClient
  story: US-5.2
  priority: P1

  given: Tool "read_file" available
  when: Executing read_file with non-existent path
  then: Error returned gracefully, no crash

  test_type: integration
  automatable: true

- id: TC-MCP-004
  name: tool_result_in_context
  component: MCPClient
  story: US-5.2
  priority: P1

  given: Tool execution completed
  when: Building next prompt
  then: Tool result appears in context

  test_type: integration
  automatable: true
```

### Approval Gates

```yaml
- id: TC-APR-001
  name: destructive_tool_flagged
  component: ApprovalGate
  story: US-5.3
  priority: P1

  given: Tool "delete_file" in destructive list
  when: Agent requests delete_file execution
  then: Approval prompt shown before execution

  test_type: integration
  automatable: false  # Requires UI interaction

- id: TC-APR-002
  name: approved_tool_executes
  component: ApprovalGate
  story: US-5.3
  priority: P1

  given: Destructive tool pending approval
  when: User approves
  then: Tool executes and returns result

  test_type: integration
  automatable: false

- id: TC-APR-003
  name: rejected_tool_not_executed
  component: ApprovalGate
  story: US-5.3
  priority: P1

  given: Destructive tool pending approval
  when: User rejects
  then: Tool not executed, agent notified of rejection

  test_type: integration
  automatable: false

- id: TC-APR-004
  name: timeout_auto_rejects
  component: ApprovalGate
  story: US-5.3
  priority: P2

  given: Destructive tool pending approval, timeout is 5 minutes
  when: 5 minutes pass without response
  then: Tool not executed, agent notified of timeout

  test_type: integration
  automatable: true
```

---

## Phase 5: Learning & Promotion

### Memory Promotion

```yaml
- id: TC-PRO-001
  name: two_episodes_create_candidate_fact
  component: PromotionEngine
  story: US-8.1
  priority: P2

  given: Two episodes both mention "Clerk is better than JWT for mobile"
  when: Running promotion check
  then: Candidate fact created with confidence based on episode count

  test_type: integration
  automatable: true

- id: TC-PRO-002
  name: promotion_requires_consistency
  component: PromotionEngine
  story: US-8.1
  priority: P2

  given: Two episodes with contradictory conclusions
  when: Running promotion check
  then: No fact promoted (conflict detected)

  test_type: unit
  automatable: true

- id: TC-PRO-003
  name: self_reinforcement_discounted
  component: PromotionEngine
  story: US-8.1
  priority: P2

  given: Agent's own observation supports existing fact from same agent
  when: Calculating confidence boost
  then: Boost is discounted 50%

  test_type: unit
  automatable: true
```

### MD File Sync

```yaml
- id: TC-MDS-001
  name: persona_file_syncs_to_db
  component: MDSync
  story: US-6.2
  priority: P1

  given: File personas/programmer.md with YAML frontmatter
  when: Running sync
  then: Persona record created/updated in database

  test_type: integration
  automatable: true

- id: TC-MDS-002
  name: procedure_file_syncs_to_graphiti
  component: MDSync
  story: US-6.2
  priority: P1

  given: File procedures/fix-animation.md with trigger in frontmatter
  when: Running sync
  then: Procedure node created in Graphiti

  test_type: integration
  automatable: true

- id: TC-MDS-003
  name: file_source_tracked
  component: MDSync
  story: US-6.2
  priority: P1

  given: Synced file at path "procedures/fix-animation.md"
  when: Querying memory source
  then: Source field is "file:procedures/fix-animation.md"

  test_type: unit
  automatable: true

- id: TC-MDS-004
  name: learned_supersedes_file
  component: MDSync
  story: US-6.2
  priority: P2

  given: File fact exists, agent learns contradicting fact
  when: Building context
  then: Learned fact takes precedence (more recent)

  test_type: integration
  automatable: true
```

---

## Phase 6: Personas

### Configuration

```yaml
- id: TC-PER-001
  name: persona_preprompt_in_context
  component: PersonaManager
  story: US-6.1
  priority: P1

  given: Persona "programmer" with core identity text
  when: Building context for agent with that persona
  then: Core identity text appears in system prompt

  test_type: unit
  automatable: true

- id: TC-PER-002
  name: persona_thresholds_applied
  component: PersonaManager
  story: US-6.1
  priority: P1

  given: Persona with certainty_alignment threshold "ask for architecture questions"
  when: Assessing homeostasis for architecture question
  then: Threshold context influences assessment

  test_type: integration
  automatable: true

- id: TC-PER-003
  name: hard_blocks_from_persona
  component: PersonaManager
  story: US-6.1
  priority: P0

  given: Persona has hard_blocks ["push to main", "use Realm"]
  when: Building context
  then: Both blocks appear as hard rules

  test_type: unit
  automatable: true
```

### Export/Import

```yaml
- id: TC-EXP-001
  name: export_includes_semantic_memories
  component: PersonaExport
  story: US-6.3
  priority: P2

  given: Agent with 10 semantic memories
  when: Exporting persona
  then: Export file contains all 10 semantic memories

  test_type: integration
  automatable: true

- id: TC-EXP-002
  name: export_excludes_raw_episodes
  component: PersonaExport
  story: US-6.3
  priority: P2

  given: Agent with 50 episodic memories
  when: Exporting persona
  then: Export file contains anonymized summaries, not raw episodes

  test_type: integration
  automatable: true

- id: TC-IMP-001
  name: import_creates_shared_knowledge
  component: PersonaImport
  story: US-6.4
  priority: P2

  given: Exported persona file
  when: Importing and creating 3 agents
  then: All 3 agents have access to imported semantic/procedural memories

  test_type: integration
  automatable: true

- id: TC-IMP-002
  name: import_tracks_provenance
  component: PersonaImport
  story: US-6.4
  priority: P2

  given: Imported memory
  When: Querying memory source
  Then: Source indicates import origin

  test_type: unit
  automatable: true
```

---

## Test Execution Checklist

### Before Phase 2 Merge
- [ ] TC-CTX-001: hard_rules_always_included
- [ ] TC-CTX-002: hard_rules_included_regardless_of_similarity
- [ ] TC-CTX-006: hard_rules_not_truncated

### Before Phase 3 Merge
- [ ] TC-HOM-001: knowledge_sufficiency_low_when_no_memories
- [ ] TC-HOM-002: knowledge_sufficiency_healthy_when_procedure_exists
- [ ] TC-HOM-003: certainty_low_triggers_ask_guidance
- [ ] TC-GUI-001: guidance_text_injected_in_prompt
- [ ] TC-RTR-001: level_0_for_simple_tool_call
- [ ] TC-RTR-002: level_1_when_procedure_exists
- [ ] TC-RTR-003: level_2_for_implementation_task
- [ ] TC-RTR-004: level_3_for_unknown_high_stakes
- [ ] TC-MOD-001: level_0_no_llm_call
- [ ] TC-MOD-002: level_1_uses_haiku
- [ ] TC-MOD-003: level_2_uses_sonnet

### Before Phase 4 Merge
- [ ] TC-MCP-002: tool_execution_success

### Before Phase 5 Merge
- [ ] TC-MDS-001: persona_file_syncs_to_db
- [ ] TC-MDS-002: procedure_file_syncs_to_graphiti

### Before Phase 6 Merge
- [ ] TC-PER-001: persona_preprompt_in_context
- [ ] TC-PER-003: hard_blocks_from_persona

---

## Summary Statistics

| Priority | Count | Automatable |
|----------|-------|-------------|
| P0 | 15 | 15 (100%) |
| P1 | 32 | 29 (91%) |
| P2 | 14 | 13 (93%) |
| **Total** | **61** | **57 (93%)** |

---

*Created: 2026-02-03*
*Maps to: USER_STORIES.md, FINAL_MINIMAL_ARCHITECTURE.md*
