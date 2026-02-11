# Memory System Design: Graphiti-Based Implementation

**Date**: 2026-02-02
**Status**: Accepted
**Decision**: Graphiti with FalkorDB backend

---

## Executive Summary

After extensive scenario tracing, we've determined that **Graphiti is essential** for Galatea's memory system. The key differentiators that eliminate simpler alternatives (Mem0, basic RAG):

1. **Guaranteed hard rules** - Hard blocks must be injected regardless of semantic similarity
2. **Temporal validity** - "Was true then, not true now" cannot be expressed in flat vector stores
3. **Usage tracking** - Procedures need success rates updated across uses
4. **Memory promotion** - Episodes must become facts must become procedures (graph edges)
5. **Cross-agent patterns** - Multiple agents sharing knowledge requires relationship modeling

**Key insight**: Memory is infrastructure, not thesis. But this infrastructure is essential for the thesis (psychological architecture) to function.

---

## Graph Schema

### Node Types

```typescript
type NodeType =
  // Core memory types
  | 'episodic'              // What happened (events with timestamps)
  | 'observation'           // Pattern noticed from episodes
  | 'semantic:fact'         // Declarative knowledge
  | 'semantic:preference'   // User/team preferences
  | 'semantic:policy'       // Company/team policies
  | 'semantic:hard_rule'    // Absolute prohibitions (guaranteed injection)
  | 'semantic:reference'    // External knowledge (articles, docs)
  | 'procedural'            // Trigger → steps (how-to knowledge)

  // Cognitive models
  | 'model:self'            // Agent's model of itself
  | 'model:user'            // Agent's model of users
  | 'model:relationship'    // Agent's model of team dynamics
  | 'model:domain'          // Domain-specific knowledge structures

  // Entities (extracted from content)
  | 'entity:person'         // People mentioned
  | 'entity:technology'     // Technologies, tools, frameworks
  | 'entity:practice'       // Practices, patterns, approaches
```

### Edge Types

```typescript
type EdgeType =
  // Provenance edges
  | 'CONTRIBUTED_TO'        // Episode → Observation/Fact
  | 'PROMOTED_TO'           // Lower level → Higher level
  | 'SUPERSEDES'            // New → Old (temporal invalidation)
  | 'PROVES'                // Evidence supporting a fact
  | 'CONTRADICTS'           // Evidence against a fact

  // Structural edges
  | 'CONTAINS'              // Parent → Child
  | 'HAS_RULE'              // Domain → Rule
  | 'HAS_PREFERENCE'        // User → Preference
  | 'HAS_PROCEDURE'         // Practice → Procedure

  // Relationship edges
  | 'PREFERS'               // User → Technology
  | 'USES'                  // Project → Technology
  | 'EXPECTS'               // User → Practice
  | 'DOCUMENTED_AT'         // Fact → Reference

  // Self-model edges
  | 'HAS_STRENGTH'          // Self → Capability
  | 'HAS_WEAKNESS'          // Self → Limitation
  | 'MISSED'                // Self → Pattern (mistakes)
  | 'APPLIED'               // Self → Procedure (usage tracking)
  | 'REVIEWED'              // Agent → Agent (cross-agent)
```

### Node Schema

```typescript
interface MemoryNode {
  // Core identifiers
  id: string;
  type: NodeType;

  // Content
  content: string;
  summary: string;           // For search/display
  embedding: number[];       // For semantic search

  // Temporal (bi-temporal model)
  created_at: Date;          // When node was created
  valid_from: Date;          // When knowledge became true
  valid_until: Date | null;  // When knowledge stopped being true (null = current)

  // Confidence and provenance
  confidence: number;        // 0-1
  source: 'observation' | 'manual' | 'external' | 'inference' | 'cross_agent';
  source_episode_ids: string[];  // Trace back to episodes

  // Classification
  domain?: string;           // mobile, auth, ui, etc.
  technology?: string[];     // expo, clerk, nativewind
  tags: string[];

  // Usage tracking (for procedural)
  times_used?: number;
  success_rate?: number;
  last_used?: Date;

  // Agent scope
  agent_id?: string;         // null = shared
  promoted_to_shared?: boolean;
}
```

### Edge Schema

```typescript
interface MemoryEdge {
  id: string;
  type: EdgeType;

  source_id: string;
  target_id: string;

  // Temporal
  created_at: Date;
  valid_from: Date;
  valid_until: Date | null;

  // Metadata
  weight: number;            // Relationship strength
  confidence: number;
  evidence_count: number;    // How many times observed

  // For PROMOTED_TO edges
  promotion_reason?: string;
  promotion_threshold?: number;
}
```

---

## Memory Levels and Promotion

### Promotion Hierarchy

```
episode → observation → fact → rule → procedure → shared
   │           │          │       │        │          │
   │           │          │       │        │          └─ Cross-agent pattern
   │           │          │       │        └─ Trigger → steps
   │           │          │       └─ Strong fact (high confidence)
   │           │          └─ Extracted knowledge
   │           └─ Pattern noticed
   └─ Raw event
```

### Promotion Rules

```typescript
interface PromotionRule {
  from: MemoryLevel;
  to: MemoryLevel;
  threshold: number;
  conditions: PromotionCondition[];
}

const promotionRules: PromotionRule[] = [
  {
    from: 'episode',
    to: 'observation',
    threshold: 2,  // 2 similar episodes
    conditions: [
      { type: 'similarity', threshold: 0.85 },
      { type: 'time_span', min: '1h' }  // Not just repetition
    ]
  },
  {
    from: 'observation',
    to: 'fact',
    threshold: 3,  // 3 supporting observations
    conditions: [
      { type: 'no_contradictions' },
      { type: 'confidence_min', value: 0.7 }
    ]
  },
  {
    from: 'fact',
    to: 'rule',
    threshold: 0.9,  // Confidence threshold
    conditions: [
      { type: 'consequence_severity', min: 'medium' }
    ]
  },
  {
    from: 'rule',
    to: 'procedure',
    threshold: 2,  // 2 successful applications
    conditions: [
      { type: 'has_trigger_pattern' },
      { type: 'has_concrete_steps' }
    ]
  },
  {
    from: 'observation',  // Self-observation
    to: 'shared',
    threshold: 3,  // 3 agents with same pattern
    conditions: [
      { type: 'cross_agent_occurrence', min: 3 },
      { type: 'time_span', min: '24h' }
    ]
  }
];
```

### Circular Promotion Prevention

```typescript
interface PromotionCheck {
  source_tag: string[];  // Track where evidence came from
  self_reinforcement_discount: 0.5;  // 50% weight reduction
}

function canPromote(evidence: Evidence[], target: MemoryNode): boolean {
  // Filter out evidence that came from the target itself
  const externalEvidence = evidence.filter(e =>
    !e.source_tag.includes(target.id)
  );

  // Apply discount to self-derived evidence
  const selfEvidence = evidence.filter(e =>
    e.source_tag.includes(target.id)
  );

  const effectiveCount =
    externalEvidence.length +
    (selfEvidence.length * 0.5);  // 50% discount

  return effectiveCount >= promotionThreshold;
}
```

---

## Memory Processes

### 1. Ingestion Pipeline

```
Raw Event (from Observation Pipeline)
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Memory Gatekeeper                                   │
│  Q: "Is this team/company specific?"                │
│                                                      │
│  Filter out:                                         │
│  - General programming knowledge                     │
│  - Public API documentation                          │
│  - Common patterns LLM already knows                 │
│                                                      │
│  Keep:                                               │
│  - Team preferences ("we use Clerk")                 │
│  - Company policies ("never push to main")          │
│  - Project specifics ("user table has email col")   │
│  - Personal patterns ("I miss null checks")         │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Memory Router                                       │
│  Classify by category                                │
│                                                      │
│  → episodic: "What happened"                        │
│  → semantic:fact: "X is Y"                          │
│  → semantic:preference: "We prefer X"               │
│  → semantic:policy: "Always/Never X"                │
│  → semantic:hard_rule: "BLOCK: Never X"             │
│  → procedural: "When X, do Y"                       │
│  → model:self: "I tend to X"                        │
│  → model:user: "User expects X"                     │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Graphiti Entity/Relationship Extraction             │
│  (Built-in LLM extraction)                          │
│                                                      │
│  Extract:                                            │
│  - Entities (people, technologies, practices)       │
│  - Relationships (prefers, uses, conflicts_with)    │
│  - Temporal markers (valid_from, valid_until)       │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Deduplication / Merge                               │
│                                                      │
│  If similar node exists (similarity > 0.9):         │
│  - Merge content                                     │
│  - Update confidence                                 │
│  - Add provenance edge                               │
│                                                      │
│  If conflicting node exists:                         │
│  - Check scope (agent vs shared)                    │
│  - Use recency + confidence                         │
│  - Flag for user if unclear                         │
└─────────────────────────────────────────────────────┘
    │
    ▼
[Stored in Graphiti/FalkorDB]
```

### 2. Consolidation (Background Process)

```typescript
async function consolidateMemory(): Promise<void> {
  // Run periodically (e.g., end of session, daily)

  // 1. Find promotion candidates
  const candidates = await findPromotionCandidates();

  for (const candidate of candidates) {
    // 2. Check promotion rules
    if (await shouldPromote(candidate)) {
      // 3. Create promoted node
      const promoted = await createPromotedNode(candidate);

      // 4. Create PROMOTED_TO edge (preserves provenance)
      await createEdge({
        type: 'PROMOTED_TO',
        source: candidate.sourceNodes.map(n => n.id),
        target: promoted.id,
        reason: candidate.promotionReason
      });

      // 5. Don't delete source nodes - preserve history
    }
  }

  // 6. Decay unused memories (reduce confidence, don't delete)
  await decayUnusedMemories();
}
```

### 3. Invalidation (Non-Lossy)

```typescript
async function invalidateMemory(
  nodeId: string,
  reason: string,
  supersededBy?: string
): Promise<void> {
  // NEVER delete - always supersede

  const node = await getNode(nodeId);

  // Mark as no longer valid
  await updateNode(nodeId, {
    valid_until: new Date()
  });

  // Create supersession edge if applicable
  if (supersededBy) {
    await createEdge({
      type: 'SUPERSEDES',
      source: supersededBy,
      target: nodeId,
      metadata: { reason }
    });
  }

  // Log for provenance
  await logInvalidation(nodeId, reason);
}

// Example: NativeWind fix released
await invalidateMemory(
  'nativewind-flicker-workaround',
  'Fixed in NativeWind 4.1',
  'nativewind-4.1-release-note'
);
```

### 4. Context Assembly (Query Time)

```typescript
async function assembleContext(
  task: string,
  agent: Agent
): Promise<AssembledContext> {
  // Layer 1: GUARANTEED - Hard rules (always included)
  const hardRules = await getHardRules(agent.domain);

  // Layer 2: SEMANTIC SEARCH - Relevant knowledge
  const relevantFacts = await graphiti.search({
    query: task,
    numResults: 20,
    // Only currently valid
    validAt: new Date()
  });

  // Layer 3: PROCEDURE MATCHING - Applicable how-tos
  const procedures = await matchProcedures(task);

  // Layer 4: MODELS - Self/user/relationship context
  const selfModel = await getSelfModel(agent.id);
  const userModel = await getUserModel(agent.currentUser);

  // Assemble with priorities
  return {
    hardRules,      // Always first, never truncated
    procedures,     // Relevant how-tos
    facts: dedupe(relevantFacts),
    selfContext: summarize(selfModel),
    userContext: summarize(userModel),

    // Metadata for homeostasis
    knowledgeSufficiency: assessCoverage(relevantFacts, task)
  };
}
```

### 5. Pruning (Archival, Not Deletion)

```typescript
interface PruningPolicy {
  archiveAfter: Duration;      // Move to cold storage
  conditions: {
    unusedFor: Duration;       // No retrievals
    confidenceBelow: number;   // Decayed confidence
    supersededBy: boolean;     // Has replacement
  };
}

async function pruneMemory(): Promise<void> {
  const archiveCandidates = await findArchiveCandidates({
    unusedFor: '90d',
    confidenceBelow: 0.3,
    supersededBy: true
  });

  for (const node of archiveCandidates) {
    // Move to archive graph (separate FalkorDB instance)
    await archiveNode(node);

    // Keep stub in main graph for provenance
    await replaceWithStub(node.id, {
      archivedAt: new Date(),
      archiveLocation: 'cold-storage'
    });
  }
}
```

### 6. Export/Import (Persona Portability)

```typescript
interface PersonaExport {
  version: '1.0';
  exportedAt: Date;

  // What gets exported
  semanticMemory: SemanticNode[];     // Facts, preferences, policies
  proceduralMemory: ProceduralNode[]; // How-tos
  domainModel: DomainNode[];          // Domain knowledge

  // What gets EXCLUDED (privacy)
  // - Raw episodic memories
  // - User-specific models
  // - Relationship models
  // - Agent-specific self-observations (unless elevated to shared)

  // Metadata
  domain: string;
  sourceAgentType: string;
  learningPeriod: { start: Date; end: Date };
}

async function exportPersona(agentId: string): Promise<PersonaExport> {
  // Get shared + elevated knowledge only
  const semantic = await getExportableSemanticMemory(agentId);
  const procedural = await getExportableProceduralMemory(agentId);
  const domain = await getDomainModel(agentId);

  return {
    version: '1.0',
    exportedAt: new Date(),
    semanticMemory: anonymize(semantic),
    proceduralMemory: procedural,
    domainModel: domain,
    domain: 'mobile-development',
    sourceAgentType: 'shadow-learning',
    learningPeriod: await getLearningPeriod(agentId)
  };
}

async function importPersona(
  persona: PersonaExport,
  targetAgentId: string
): Promise<void> {
  // Create new nodes in target agent's graph
  for (const node of persona.semanticMemory) {
    await createNode({
      ...node,
      id: generateNewId(),
      source: 'imported',
      imported_from: persona.sourceAgentType,
      imported_at: new Date()
    });
  }

  // Mark as imported (for provenance tracking)
  await recordImport(targetAgentId, persona);
}
```

---

## Request Handling: End-to-End Flow

This section traces how a typical request flows through the memory system, from task receipt to final prompt construction.

### Overview: The Request Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│  1. TASK RECEIVED                                                        │
│     "Add user profile screen with avatar upload"                        │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  2. QUERY FORMULATION                                                    │
│     Task → Multiple search queries (parallel)                           │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  3. MEMORY RETRIEVAL (Parallel Queries)                                  │
│     ├── Hard Rules Query (guaranteed)                                   │
│     ├── Semantic Search (task relevance)                                │
│     ├── Procedure Match (trigger patterns)                              │
│     ├── Self Model Query (agent context)                                │
│     └── User Model Query (preferences)                                  │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  4. RANKING & SELECTION                                                  │
│     Score, deduplicate, budget allocation                               │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  5. PROMPT CONSTRUCTION                                                  │
│     Assemble sections with priorities                                   │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  6. HOMEOSTASIS ASSESSMENT                                               │
│     Evaluate knowledge_sufficiency for the task                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Step 1: Task Received

```typescript
interface IncomingTask {
  content: string;           // "Add user profile screen with avatar upload"
  source: 'pm' | 'user' | 'self' | 'system';
  context?: {
    project?: string;        // "mobile-app"
    technology?: string[];   // ["expo", "react-native"]
    urgency?: 'low' | 'normal' | 'high';
  };
  conversation_history?: Message[];  // Recent messages if any
}
```

### Step 2: Query Formulation

The task is decomposed into multiple search queries to maximize retrieval coverage.

```typescript
async function formulateQueries(task: IncomingTask): Promise<SearchQueries> {
  // Extract key concepts from task
  const concepts = await extractConcepts(task.content);
  // → ["user profile", "screen", "avatar", "upload", "image"]

  // Identify technologies mentioned or implied
  const technologies = task.context?.technology ?? await inferTechnologies(task.content);
  // → ["expo", "react-native", "expo-image-picker"]

  // Generate query variants
  return {
    // Primary: direct task match
    primary: task.content,

    // Concept queries: individual topics
    concepts: concepts.map(c => ({
      query: c,
      weight: conceptImportance(c, task.content)
    })),
    // → [{query: "avatar upload", weight: 0.9}, {query: "user profile screen", weight: 0.8}]

    // Technology queries: tech-specific knowledge
    technology: technologies.map(t => `${t} best practices`),
    // → ["expo best practices", "expo-image-picker usage"]

    // Constraint query: what NOT to do
    constraints: `${technologies.join(' ')} avoid never don't warning`,

    // Procedure triggers: how-to patterns
    procedureTriggers: [
      "creating screen",
      "image upload",
      "avatar",
      "file upload expo"
    ]
  };
}
```

### Step 3: Memory Retrieval (Parallel Queries)

All queries execute in parallel for performance.

```typescript
async function retrieveMemories(
  queries: SearchQueries,
  agent: Agent
): Promise<RetrievedMemories> {
  // Execute all queries in parallel
  const [
    hardRules,
    semanticResults,
    procedureResults,
    selfModel,
    userModel,
    recentEpisodes
  ] = await Promise.all([
    // 3a. Hard Rules - ALWAYS retrieved, no similarity threshold
    queryHardRules(agent.domain),

    // 3b. Semantic Search - relevance-based
    querySemanticMemory(queries),

    // 3c. Procedure Match - trigger-based
    queryProcedures(queries.procedureTriggers),

    // 3d. Self Model - agent's self-knowledge
    querySelfModel(agent.id),

    // 3e. User Model - current user's preferences
    queryUserModel(agent.currentUserId),

    // 3f. Recent Episodes - short-term context
    queryRecentEpisodes(agent.id, { limit: 5, hours: 24 })
  ]);

  return {
    hardRules,
    semanticResults,
    procedureResults,
    selfModel,
    userModel,
    recentEpisodes
  };
}
```

#### 3a. Hard Rules Query (Guaranteed Injection)

```typescript
async function queryHardRules(domain: string): Promise<HardRule[]> {
  // Cypher: Get ALL hard rules for domain (no similarity threshold)
  const query = `
    MATCH (r:semantic_hard_rule)
    WHERE r.valid_until IS NULL
      AND (r.domain = $domain OR r.domain IS NULL)
    RETURN r.content, r.severity, r.reason
    ORDER BY r.severity DESC
  `;

  return await falkordb.query(query, { domain });
  // Returns:
  // [
  //   { content: "Never use Realm database", severity: "block", reason: "Sync issues" },
  //   { content: "Never push directly to main", severity: "block", reason: "Policy" },
  //   { content: "Always use TypeScript strict mode", severity: "warn", reason: "Code quality" }
  // ]
}
```

#### 3b. Semantic Search (Relevance-Based)

```typescript
async function querySemanticMemory(queries: SearchQueries): Promise<SemanticResult[]> {
  const results: SemanticResult[] = [];

  // Primary query with Graphiti hybrid search
  const primaryResults = await graphiti.search({
    query: queries.primary,
    numResults: 15,
    // Only currently valid facts
    // Graphiti filters by valid_until IS NULL internally
  });
  results.push(...primaryResults.map(r => ({ ...r, source: 'primary' })));

  // Concept queries (weighted)
  for (const concept of queries.concepts) {
    const conceptResults = await graphiti.search({
      query: concept.query,
      numResults: 5
    });
    results.push(...conceptResults.map(r => ({
      ...r,
      source: 'concept',
      weight: r.score * concept.weight
    })));
  }

  // Technology queries
  for (const techQuery of queries.technology) {
    const techResults = await graphiti.search({
      query: techQuery,
      numResults: 5
    });
    results.push(...techResults.map(r => ({ ...r, source: 'technology' })));
  }

  // Constraint query (negative knowledge)
  const constraintResults = await graphiti.search({
    query: queries.constraints,
    numResults: 10
  });
  results.push(...constraintResults.map(r => ({ ...r, source: 'constraint' })));

  return results;
}
```

#### 3c. Procedure Match (Trigger-Based)

```typescript
async function queryProcedures(triggers: string[]): Promise<Procedure[]> {
  const procedures: Procedure[] = [];

  for (const trigger of triggers) {
    // Semantic match on trigger field
    const matches = await graphiti.search({
      query: trigger,
      nodeTypes: ['procedural'],
      numResults: 3
    });

    // Also try exact pattern match
    const exactMatches = await falkordb.query(`
      MATCH (p:procedural)
      WHERE p.valid_until IS NULL
        AND p.trigger CONTAINS $pattern
      RETURN p
      ORDER BY p.success_rate DESC
      LIMIT 3
    `, { pattern: trigger });

    procedures.push(...matches, ...exactMatches);
  }

  // Deduplicate by ID
  return deduplicateById(procedures);
}
```

#### 3d. Self Model Query

```typescript
async function querySelfModel(agentId: string): Promise<SelfModel> {
  // Get agent's self-knowledge
  const query = `
    MATCH (s:model_self {agent_id: $agentId})
    OPTIONAL MATCH (s)-[:HAS_STRENGTH]->(str)
    OPTIONAL MATCH (s)-[:HAS_WEAKNESS]->(weak)
    OPTIONAL MATCH (s)-[:MISSED]->(miss)
    WHERE str.valid_until IS NULL
      AND weak.valid_until IS NULL
      AND miss.valid_until IS NULL
    RETURN s,
           collect(DISTINCT str) as strengths,
           collect(DISTINCT weak) as weaknesses,
           collect(DISTINCT miss) as recentMisses
  `;

  const result = await falkordb.query(query, { agentId });

  return {
    strengths: result.strengths,
    // → ["Good at React Native styling", "Thorough testing"]
    weaknesses: result.weaknesses,
    // → ["Sometimes misses null checks", "Tends to over-engineer"]
    recentMisses: result.recentMisses.slice(0, 3),
    // → ["Forgot error boundary in last PR"]
    confidence: result.s.overall_confidence
  };
}
```

#### 3e. User Model Query

```typescript
async function queryUserModel(userId: string): Promise<UserModel> {
  const query = `
    MATCH (u:model_user {user_id: $userId})
    OPTIONAL MATCH (u)-[:PREFERS]->(pref)
    OPTIONAL MATCH (u)-[:EXPECTS]->(exp)
    WHERE pref.valid_until IS NULL
      AND exp.valid_until IS NULL
    RETURN u,
           collect(DISTINCT pref) as preferences,
           collect(DISTINCT exp) as expectations
  `;

  const result = await falkordb.query(query, { userId });

  return {
    preferences: result.preferences,
    // → ["Prefers functional components", "Likes detailed PR descriptions"]
    expectations: result.expectations,
    // → ["Expects tests for new features", "Wants progress updates every 2 hours"]
    communicationStyle: result.u.communication_style
    // → "concise"
  };
}
```

### Step 4: Ranking & Selection

Combine all results, score, deduplicate, and fit within context budget.

```typescript
interface ContextBudget {
  total: number;           // 8000 tokens typical
  hardRules: number;       // 500 reserved (never truncated)
  procedures: number;      // 1500 max
  facts: number;           // 4000 max
  models: number;          // 1000 max
  episodes: number;        // 1000 max
}

async function rankAndSelect(
  retrieved: RetrievedMemories,
  budget: ContextBudget
): Promise<SelectedMemories> {
  // 1. Hard rules: ALL included (guaranteed)
  const hardRules = retrieved.hardRules;
  const hardRulesTokens = estimateTokens(hardRules);

  // 2. Score and rank semantic results
  const scoredFacts = retrieved.semanticResults.map(r => ({
    ...r,
    finalScore: calculateFinalScore(r)
  }));

  // Score formula:
  // finalScore = similarity * 0.4 + recency * 0.2 + confidence * 0.3 + source_boost * 0.1
  function calculateFinalScore(result: SemanticResult): number {
    const similarity = result.score;
    const recency = recencyScore(result.valid_from);  // Newer = higher
    const confidence = result.confidence;
    const sourceBoost = result.source === 'primary' ? 0.1 :
                        result.source === 'constraint' ? 0.15 : 0;

    return similarity * 0.4 + recency * 0.2 + confidence * 0.3 + sourceBoost;
  }

  // 3. Deduplicate (same content from multiple queries)
  const deduped = deduplicateBySimilarity(scoredFacts, threshold: 0.9);

  // 4. Sort by final score
  const ranked = deduped.sort((a, b) => b.finalScore - a.finalScore);

  // 5. Select within budget
  const selectedFacts = selectWithinBudget(ranked, budget.facts);

  // 6. Procedures: rank by relevance * success_rate
  const rankedProcedures = retrieved.procedureResults
    .map(p => ({ ...p, score: p.relevance * p.success_rate }))
    .sort((a, b) => b.score - a.score);
  const selectedProcedures = selectWithinBudget(rankedProcedures, budget.procedures);

  // 7. Models: summarize to fit budget
  const selfSummary = summarizeModel(retrieved.selfModel, budget.models / 2);
  const userSummary = summarizeModel(retrieved.userModel, budget.models / 2);

  return {
    hardRules,
    facts: selectedFacts,
    procedures: selectedProcedures,
    selfModel: selfSummary,
    userModel: userSummary,
    recentEpisodes: retrieved.recentEpisodes.slice(0, 3)
  };
}
```

### Step 5: Prompt Construction

Assemble the final prompt with clear sections and priorities.

```typescript
async function constructPrompt(
  task: IncomingTask,
  selected: SelectedMemories,
  agent: Agent
): Promise<ConstructedPrompt> {
  const sections: PromptSection[] = [];

  // === SECTION 1: HARD RULES (Priority: CRITICAL - Never truncated) ===
  if (selected.hardRules.length > 0) {
    sections.push({
      name: 'CONSTRAINTS',
      priority: 1,  // Highest
      content: formatHardRules(selected.hardRules),
      truncatable: false
    });
  }

  // === SECTION 2: RELEVANT PROCEDURES (Priority: HIGH) ===
  if (selected.procedures.length > 0) {
    sections.push({
      name: 'RELEVANT_PROCEDURES',
      priority: 2,
      content: formatProcedures(selected.procedures),
      truncatable: true
    });
  }

  // === SECTION 3: KNOWLEDGE (Priority: MEDIUM) ===
  if (selected.facts.length > 0) {
    sections.push({
      name: 'RELEVANT_KNOWLEDGE',
      priority: 3,
      content: formatFacts(selected.facts),
      truncatable: true
    });
  }

  // === SECTION 4: SELF-AWARENESS (Priority: MEDIUM) ===
  if (selected.selfModel) {
    sections.push({
      name: 'SELF_AWARENESS',
      priority: 4,
      content: formatSelfModel(selected.selfModel),
      truncatable: true
    });
  }

  // === SECTION 5: USER CONTEXT (Priority: MEDIUM) ===
  if (selected.userModel) {
    sections.push({
      name: 'USER_CONTEXT',
      priority: 5,
      content: formatUserModel(selected.userModel),
      truncatable: true
    });
  }

  // === SECTION 6: RECENT CONTEXT (Priority: LOW) ===
  if (selected.recentEpisodes.length > 0) {
    sections.push({
      name: 'RECENT_CONTEXT',
      priority: 6,
      content: formatEpisodes(selected.recentEpisodes),
      truncatable: true
    });
  }

  return {
    sections,
    task: task.content,
    metadata: {
      totalTokens: estimateTotalTokens(sections),
      retrievalStats: {
        hardRulesCount: selected.hardRules.length,
        factsRetrieved: selected.facts.length,
        proceduresMatched: selected.procedures.length
      }
    }
  };
}
```

#### Prompt Template

```typescript
function formatPrompt(constructed: ConstructedPrompt): string {
  return `
## Task
${constructed.task}

${constructed.sections.find(s => s.name === 'CONSTRAINTS')?.content ? `
## Constraints (MUST FOLLOW)
${formatHardRules(constructed.hardRules)}
` : ''}

${constructed.sections.find(s => s.name === 'RELEVANT_PROCEDURES')?.content ? `
## How To (Learned Procedures)
${formatProcedures(constructed.procedures)}
` : ''}

${constructed.sections.find(s => s.name === 'RELEVANT_KNOWLEDGE')?.content ? `
## Relevant Knowledge
${formatFacts(constructed.facts)}
` : ''}

${constructed.sections.find(s => s.name === 'SELF_AWARENESS')?.content ? `
## Self-Awareness
${formatSelfModel(constructed.selfModel)}
` : ''}

${constructed.sections.find(s => s.name === 'USER_CONTEXT')?.content ? `
## User Preferences
${formatUserModel(constructed.userModel)}
` : ''}
`.trim();
}
```

### Step 6: Homeostasis Assessment

Evaluate whether retrieved knowledge is sufficient for the task.

```typescript
async function assessKnowledgeSufficiency(
  task: IncomingTask,
  selected: SelectedMemories
): Promise<HomeostasisAssessment> {
  // Check coverage
  const coverage = {
    hasRelevantProcedures: selected.procedures.length > 0,
    hasRelevantFacts: selected.facts.length > 0,
    hasConstraints: selected.hardRules.length > 0,
    highConfidenceFacts: selected.facts.filter(f => f.confidence > 0.8).length,
    lowConfidenceFacts: selected.facts.filter(f => f.confidence < 0.5).length
  };

  // Assess gaps
  const gaps = await identifyKnowledgeGaps(task.content, selected.facts);
  // → ["No knowledge about expo-image-picker S3 upload", "Avatar cropping not covered"]

  // Calculate sufficiency score
  const sufficiencyScore =
    (coverage.hasRelevantProcedures ? 0.3 : 0) +
    (coverage.highConfidenceFacts > 2 ? 0.3 : coverage.highConfidenceFacts * 0.1) +
    (gaps.length === 0 ? 0.4 : Math.max(0, 0.4 - gaps.length * 0.1));

  return {
    dimension: 'knowledge_sufficiency',
    state: sufficiencyScore > 0.7 ? 'HEALTHY' :
           sufficiencyScore > 0.4 ? 'LOW' : 'CRITICAL',
    score: sufficiencyScore,
    gaps,
    recommendation: sufficiencyScore < 0.5 ?
      'Research before proceeding' :
      sufficiencyScore < 0.7 ?
      'Proceed with caution, may need to ask' :
      'Sufficient knowledge to proceed'
  };
}
```

### Complete Example: "Add user profile screen with avatar upload"

```
┌─────────────────────────────────────────────────────────────────────────┐
│  TASK: "Add user profile screen with avatar upload"                     │
│  AGENT: Dev-1 (Expo specialist)                                         │
│  USER: Alice (PM)                                                       │
└─────────────────────────────────────────────────────────────────────────┘

QUERY FORMULATION:
├── Primary: "Add user profile screen with avatar upload"
├── Concepts: ["avatar upload", "user profile screen", "image picker"]
├── Technology: ["expo best practices", "expo-image-picker"]
├── Constraints: "expo react-native avoid never warning"
└── Triggers: ["creating screen", "image upload", "avatar"]

MEMORY RETRIEVAL (parallel):

  Hard Rules Query:
  ├── "Never use Realm database" (severity: block)
  ├── "Never push directly to main" (severity: block)
  └── "Use TypeScript strict mode" (severity: warn)

  Semantic Search:
  ├── [0.92] "Use expo-image-picker for camera/gallery access"
  ├── [0.88] "Store images in S3, save URL in database"
  ├── [0.85] "User profile screen goes in app/(tabs)/profile.tsx"
  ├── [0.82] "Use expo-file-system for local caching"
  ├── [0.78] "Avatar images should be ≤500KB, resize before upload"
  └── [0.71] "Use NativeWind for styling"

  Procedure Match:
  ├── "When creating new screen → create in app/(tabs), add to layout"
  │   success_rate: 0.95, times_used: 12
  └── "When uploading images → compress first, use presigned URL"
      success_rate: 0.88, times_used: 5

  Self Model:
  ├── strengths: ["React Native styling", "Expo APIs"]
  ├── weaknesses: ["Sometimes misses error handling"]
  └── recent_misses: ["Forgot loading state in last PR"]

  User Model:
  ├── preferences: ["Prefers functional components", "Wants tests"]
  └── expectations: ["Progress update every 2 hours"]

RANKING & SELECTION:
├── Hard rules: 3 (all included, 150 tokens)
├── Facts: 6 selected from 12 retrieved (1200 tokens)
├── Procedures: 2 matched (400 tokens)
├── Self model: summarized (200 tokens)
└── User model: summarized (150 tokens)

CONSTRUCTED PROMPT:
┌─────────────────────────────────────────────────────────────────────────┐
│ ## Task                                                                 │
│ Add user profile screen with avatar upload                              │
│                                                                         │
│ ## Constraints (MUST FOLLOW)                                            │
│ - ❌ NEVER use Realm database (sync issues, painful migrations)         │
│ - ❌ NEVER push directly to main                                        │
│ - ⚠️  Use TypeScript strict mode                                        │
│                                                                         │
│ ## How To (Learned Procedures)                                          │
│ **Creating new screen:**                                                │
│ 1. Create file in app/(tabs)/profile.tsx                               │
│ 2. Add route to app/(tabs)/_layout.tsx                                  │
│ 3. Export component with proper TypeScript types                        │
│ (Success rate: 95%)                                                     │
│                                                                         │
│ **Uploading images:**                                                   │
│ 1. Use expo-image-picker to select image                                │
│ 2. Compress to ≤500KB using expo-image-manipulator                     │
│ 3. Get presigned URL from backend                                       │
│ 4. Upload directly to S3                                                │
│ 5. Save URL to user record                                              │
│ (Success rate: 88%)                                                     │
│                                                                         │
│ ## Relevant Knowledge                                                   │
│ - Use expo-image-picker for camera/gallery access                       │
│ - Store images in S3, save URL in database                              │
│ - User profile screen goes in app/(tabs)/profile.tsx                    │
│ - Avatar images should be ≤500KB, resize before upload                 │
│ - Use NativeWind for styling                                            │
│                                                                         │
│ ## Self-Awareness                                                       │
│ - Strength: Good with Expo APIs and styling                             │
│ - Watch out: Sometimes miss error handling                              │
│ - Recent miss: Forgot loading state in last PR - remember to add it    │
│                                                                         │
│ ## User Preferences                                                     │
│ - Prefers functional components                                         │
│ - Expects tests for new features                                        │
│ - Wants progress update every ~2 hours                                  │
└─────────────────────────────────────────────────────────────────────────┘

HOMEOSTASIS ASSESSMENT:
├── knowledge_sufficiency: HEALTHY (0.82)
│   └── Has relevant procedures and high-confidence facts
├── certainty_alignment: HEALTHY
│   └── Can proceed with known patterns
└── Recommendation: "Proceed with implementation"
```

### Token Budget Management

```typescript
const DEFAULT_BUDGET: ContextBudget = {
  total: 8000,
  hardRules: 500,      // Reserved, never truncated
  procedures: 1500,    // High value, detailed steps
  facts: 4000,         // Bulk of knowledge
  models: 1000,        // Self + user context
  episodes: 1000       // Recent short-term context
};

// If over budget, truncate in priority order (lowest priority first)
function truncateToFitBudget(
  sections: PromptSection[],
  budget: number
): PromptSection[] {
  let currentTokens = sections.reduce((sum, s) => sum + s.tokens, 0);

  // Sort by priority descending (highest priority = keep)
  const sortedSections = [...sections].sort((a, b) => a.priority - b.priority);

  // Truncate from lowest priority until within budget
  for (const section of sortedSections) {
    if (currentTokens <= budget) break;
    if (!section.truncatable) continue;  // Skip hard rules

    const reduction = Math.min(
      section.tokens * 0.5,  // Reduce by up to 50%
      currentTokens - budget
    );

    section.content = truncateContent(section.content, section.tokens - reduction);
    section.tokens -= reduction;
    currentTokens -= reduction;
  }

  return sections;
}
```

---

## Typical Queries

### Cypher Examples (FalkorDB)

```cypher
// 1. Get all currently valid facts about a technology
MATCH (f:semantic_fact)-[:ABOUT]->(t:entity_technology {name: 'NativeWind'})
WHERE f.valid_until IS NULL
RETURN f.content, f.confidence
ORDER BY f.confidence DESC

// 2. Get procedure for a trigger pattern
MATCH (p:procedural)
WHERE p.trigger CONTAINS 'animation flicker'
AND p.valid_until IS NULL
RETURN p.trigger, p.steps, p.success_rate

// 3. Get self-model weaknesses
MATCH (s:model_self {agent_id: $agentId})-[:HAS_WEAKNESS]->(w)
WHERE w.valid_until IS NULL
RETURN w.content, w.confidence, w.evidence_count

// 4. Get what changed about a topic
MATCH (old:semantic_fact)-[:SUPERSEDES]->(new:semantic_fact)
WHERE old.content CONTAINS 'JWT' OR new.content CONTAINS 'JWT'
RETURN old.content AS was, new.content AS now, new.valid_from AS changed_at

// 5. Get cross-agent patterns
MATCH (o:observation)-[:OBSERVED_BY]->(a:agent)
WITH o.pattern AS pattern, COUNT(DISTINCT a) AS agent_count
WHERE agent_count >= 3
RETURN pattern, agent_count

// 6. Get hard rules (always inject)
MATCH (r:semantic_hard_rule)
WHERE r.domain = $domain OR r.domain IS NULL
RETURN r.content, r.severity
```

### TypeScript Query Interface

```typescript
interface MemoryQueries {
  // Semantic search
  search(query: string, options?: SearchOptions): Promise<MemoryNode[]>;

  // Hard rules (guaranteed retrieval)
  getHardRules(domain?: string): Promise<HardRule[]>;

  // Procedures
  matchProcedures(situation: string): Promise<Procedure[]>;
  getProcedure(id: string): Promise<Procedure>;
  recordProcedureOutcome(id: string, success: boolean): Promise<void>;

  // Temporal
  getValidAt(query: string, timestamp: Date): Promise<MemoryNode[]>;
  getHistory(entityOrTopic: string): Promise<MemoryNode[]>;
  getChanges(since: Date): Promise<Change[]>;

  // Models
  getSelfModel(agentId: string): Promise<SelfModel>;
  getUserModel(userId: string): Promise<UserModel>;

  // Cross-agent
  getSharedPatterns(): Promise<SharedPattern[]>;
  flagForReview(nodeId: string, reason: string): Promise<void>;
}
```

---

## Edge Case Handling

### 1. Circular Promotion Prevention

**Problem**: Fact influences behavior → creates episode → promotes back to same fact.

**Solution**: Source tagging + discount.

```typescript
// Every memory carries its source lineage
interface MemoryLineage {
  original_source_ids: string[];  // Ultimate sources
  promotion_chain: string[];       // Path taken
}

// When checking promotion evidence
function calculateEffectiveEvidence(
  evidence: Evidence[],
  targetId: string
): number {
  let score = 0;

  for (const e of evidence) {
    if (e.lineage.original_source_ids.includes(targetId)) {
      // Self-reinforcing: 50% discount
      score += e.weight * 0.5;
    } else {
      // External: full weight
      score += e.weight;
    }
  }

  return score;
}
```

### 2. Conflicting Promotions

**Problem**: Agent-1 learns "use X", Agent-2 learns "avoid X".

**Solution**: Scope check → recency+confidence → flag for user.

```typescript
async function handleConflict(
  existing: MemoryNode,
  incoming: MemoryNode
): Promise<Resolution> {
  // 1. Check scope
  if (existing.agent_id !== incoming.agent_id) {
    // Different agents - both can be valid
    return { action: 'keep_both', flag: true };
  }

  // 2. Same agent - use recency + confidence
  const existingScore = existing.confidence * recencyWeight(existing.valid_from);
  const incomingScore = incoming.confidence * recencyWeight(incoming.valid_from);

  if (Math.abs(existingScore - incomingScore) < 0.2) {
    // Too close - flag for user
    return { action: 'flag_for_user', reason: 'conflicting_evidence' };
  }

  // 3. Clear winner - supersede loser
  const winner = existingScore > incomingScore ? existing : incoming;
  const loser = existingScore > incomingScore ? incoming : existing;

  return {
    action: 'supersede',
    keep: winner.id,
    invalidate: loser.id
  };
}
```

### 3. Cascade Demotion

**Problem**: Evidence for fact is invalidated → what happens to fact?

**Solution**: Soft invalidation (confidence reduction, not deletion).

```typescript
async function handleEvidenceInvalidation(
  invalidatedEvidence: string
): Promise<void> {
  // Find all nodes that depended on this evidence
  const dependents = await findDependents(invalidatedEvidence);

  for (const node of dependents) {
    // Recalculate confidence without invalid evidence
    const remainingEvidence = await getRemainingEvidence(node.id);
    const newConfidence = calculateConfidence(remainingEvidence);

    if (newConfidence < 0.3) {
      // Too low - soft invalidate
      await softInvalidate(node.id, {
        reason: 'evidence_invalidated',
        original_confidence: node.confidence,
        remaining_confidence: newConfidence
      });
    } else {
      // Update confidence but keep
      await updateConfidence(node.id, newConfidence);
    }
  }
}
```

### 4. Abstraction Quality

**Problem**: LLM abstracts "NativeWind Pressable flickers" to "animations are buggy".

**Solution**: Specificity scoring + keep specifics when unsure.

```typescript
interface AbstractionResult {
  abstraction: string;
  specificity_score: number;  // 0-1, higher = more specific
  keep_original: boolean;
}

async function evaluateAbstraction(
  original: string,
  proposed: string
): Promise<AbstractionResult> {
  const specificity = await scoreSpecificity(original, proposed);

  return {
    abstraction: proposed,
    specificity_score: specificity,
    keep_original: specificity < 0.7  // Keep specific if abstraction too vague
  };
}

// Result: Keep BOTH "NativeWind Pressable flickers" AND "animation issues"
// Link them with ABSTRACTED_TO edge
```

---

## Why Not Simpler Alternatives?

### vs Basic RAG (Vector Store Only)

| Need | RAG | Graphiti |
|------|-----|----------|
| Hard rules guarantee | ❌ Depends on similarity | ✅ Separate guaranteed query |
| "What was true then" | ❌ No temporal model | ✅ Native bi-temporal |
| Procedure success tracking | ❌ No state | ✅ Node metadata |
| Promotion/learning | ❌ Flat storage | ✅ Edge relationships |
| Cross-agent patterns | ❌ No structure | ✅ Graph queries |

### vs Mem0

| Need | Mem0 | Graphiti |
|------|------|----------|
| Temporal validity | ⚠️ Metadata only | ✅ Native |
| Relationship traversal | ⚠️ Mem0g limited | ✅ Full Cypher |
| Procedure modeling | ❌ As text | ✅ As nodes |
| Dashboard | ✅ OpenMemory | ⚠️ FalkorDB Insight |
| Ecosystem | ✅ Larger | ⚠️ Smaller |

**Verdict**: Mem0 could work for MVP but we'd hit walls on temporal reasoning and relationship modeling. Graphiti provides the foundation we need.

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

```
Tasks:
1. Set up FalkorDB locally (Docker)
2. Install Graphiti, configure with Claude
3. Create base TypeScript wrapper
4. Implement core ingestion pipeline
5. Test with shadow learning scenario
```

### Phase 2: Memory Types (Week 3-4)

```
Tasks:
1. Implement all node types
2. Implement edge types
3. Build Memory Router (classification)
4. Build Memory Gatekeeper (filtering)
5. Test with manual knowledge entry
```

### Phase 3: Processes (Week 5-6)

```
Tasks:
1. Implement promotion rules engine
2. Implement consolidation (background)
3. Implement invalidation (non-lossy)
4. Build context assembly
5. Test with multi-agent scenario
```

### Phase 4: Cross-Agent (Week 7-8)

```
Tasks:
1. Implement shared memory pool
2. Build pattern detection
3. Implement elevation rules
4. Test cross-agent learning
5. Build basic dashboard (or adopt FalkorDB Insight)
```

### Phase 5: Export/Import (Week 9-10)

```
Tasks:
1. Define persona export format
2. Implement export (with privacy filters)
3. Implement import (with provenance)
4. Test full lifecycle: shadow → export → company
```

---

## Open Questions for Implementation

1. **Graphiti TypeScript bindings**: REST API wrapper vs native port?
2. **Embedding model**: Voyage AI vs OpenAI vs local?
3. **Multi-tenancy**: One FalkorDB per company or namespace?
4. **Dashboard**: Build custom React UI or use FalkorDB Insight?

---

## References

- [Graphiti GitHub](https://github.com/getzep/graphiti)
- [FalkorDB Documentation](https://docs.falkordb.com/)
- [FalkorDB vs Neo4j](https://www.falkordb.com/blog/falkordb-vs-neo4j-for-ai-applications/)
- [Graphiti CRUD Operations](https://help.getzep.com/graphiti/working-with-data/crud-operations)
- Previous documents: `homeostasis-architecture-design.md`, `memory-findings.md`

---

*Document created: 2026-02-02*
*Status: Accepted - Ready for implementation*
