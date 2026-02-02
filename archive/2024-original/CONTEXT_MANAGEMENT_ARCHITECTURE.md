# ContextForge: Context Management Architecture for AI Assistants

## Overview

ContextForge is a hierarchical context management system designed to optimize how AI assistants maintain and utilize working memory. It addresses the fundamental challenge of limited context windows in LLMs by implementing a three-tier caching strategy with intelligent compression and dynamic content prioritization.

### Core Problem

AI assistants face a critical constraint: **limited context windows**. Even with large context windows (128K-200K tokens), effective context management requires:
- Prioritizing relevant information over recency
- Balancing persistent knowledge with working memory
- Compressing verbose content without losing semantics
- Managing context budget across conversation turns

### Core Solution

ContextForge implements a **zone-based cache hierarchy** with **semantic compression** to maximize the utility of every token in the context window.

---

## Core Concepts

### 1. Blocks: Atomic Units of Context

**Definition**: A block is the smallest indivisible unit of contextual information.

#### Block Properties

```typescript
interface Block {
  _id: Id<"blocks">
  sessionId: Id<"sessions">
  content: string              // The actual content
  type: BlockType              // Semantic classification
  zone: Zone                   // Cache tier assignment
  position: number             // Ordering within zone
  tokens?: number              // Token count
  createdAt: number

  // Compression metadata
  isCompressed: boolean
  compressionRatio?: number
  originalContent?: string     // Backup before compression

  // Relationships
  parentId?: Id<"blocks">      // For hierarchical blocks
  projectId?: Id<"projects">   // Project grouping
}
```

#### Block Types

Blocks are semantically classified to enable intelligent filtering and prioritization:

**Documentation Types:**
- `requirement` - User requirements and specifications
- `constraint` - System constraints and limitations
- `guideline` - Best practices and style guides
- `architecture` - System design and architecture decisions

**Code Types:**
- `code` - Source code snippets
- `api` - API definitions and contracts
- `config` - Configuration files
- `schema` - Database schemas and data models

**Knowledge Types:**
- `context` - Background information and domain knowledge
- `reference` - External references and documentation links
- `example` - Examples and use cases
- `note` - General notes and observations

**Interaction Types:**
- `question` - User questions requiring answers
- `answer` - Responses to questions
- `task` - Actionable tasks and TODOs
- `decision` - Decisions made during development

**Why Block Types Matter:**
- Enable **selective compression** (compress examples more aggressively than requirements)
- Support **context filtering** (include only relevant types for specific tasks)
- Facilitate **automatic categorization** using LLM classification
- Allow **type-specific formatting** in prompts

---

### 2. Zones: Three-Tier Cache Hierarchy

**Definition**: Zones implement a CPU cache-inspired hierarchy for context prioritization.

```typescript
type Zone = "PERMANENT" | "STABLE" | "WORKING"
```

#### Zone Characteristics

| Zone | Purpose | Token Budget | Eviction Policy | Compression |
|------|---------|--------------|-----------------|-------------|
| **PERMANENT** | Core knowledge that's always relevant | 5,000-10,000 | Never evicted | Aggressive |
| **STABLE** | Reference material needed for current work | 10,000-20,000 | Rarely changed | Moderate |
| **WORKING** | Active conversation and immediate context | 15,000-30,000 | LRU / Manual | Light |

#### Zone Usage Patterns

**PERMANENT Zone:**
- System prompts and assistant personality
- Project requirements and core constraints
- API contracts and key architecture decisions
- Domain-specific knowledge that applies across all conversations

*Example: In a coding assistant, this would include language syntax rules, project coding standards, and core API documentation.*

**STABLE Zone:**
- Current task context and objectives
- Relevant code files and schemas
- Design documents for active features
- Recently accessed reference material

*Example: When working on a feature, this contains the relevant source files, database schema, and related documentation.*

**WORKING Zone:**
- Recent conversation turns
- Draft code being written
- Immediate questions and answers
- Temporary notes and intermediate results

*Example: The last 10 message exchanges, current code being edited, and active debugging output.*

#### Zone Migration Strategy

Content flows through zones based on relevance and usage:

```
WORKING → STABLE → PERMANENT
   ↓         ↓         ↓
  [LRU]   [Manual]  [Never]
```

**Promotion triggers:**
- Content referenced multiple times → WORKING → STABLE
- Content identified as core knowledge → STABLE → PERMANENT
- User explicitly marks content as permanent

**Demotion triggers:**
- Content unused for N turns → STABLE → WORKING
- Working memory overflow → Oldest WORKING content evicted
- Manual reorganization by user

---

### 3. Token Budget Management

**Problem**: Context windows are fixed; every token must justify its inclusion.

**Solution**: Dynamic budget allocation with overflow prevention.

#### Budget Model

```typescript
interface ZoneBudget {
  zone: Zone
  budget: number      // Maximum tokens allowed
  used: number        // Current token usage
  available: number   // Remaining capacity
  percentUsed: number // Usage percentage
}

interface SessionMetrics {
  totalBudget: number
  totalUsed: number
  zones: {
    PERMANENT: ZoneBudget
    STABLE: ZoneBudget
    WORKING: ZoneBudget
  }
}
```

#### Budget Allocation Strategy

**Total Context Budget**: 50,000 tokens (example for Claude Sonnet)

| Zone | Allocation | Reasoning |
|------|------------|-----------|
| PERMANENT | 5,000 (10%) | Small but critical foundation |
| STABLE | 15,000 (30%) | Larger pool for reference material |
| WORKING | 30,000 (60%) | Most capacity for active work |

**Budget Warnings:**
- **80-95%**: Yellow warning - suggest compression or cleanup
- **95-100%**: Red alert - automatic compression or eviction triggered

#### Token Estimation

```typescript
function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4)
}
```

*Note: This is a rough heuristic. Production systems should use proper tokenizers (e.g., tiktoken for OpenAI models, Claude tokenizer for Anthropic).*

---

### 4. Compression System

**Problem**: Verbose content wastes tokens without adding proportional value.

**Solution**: Semantic compression using LLMs to distill content while preserving information density.

#### Compression Architecture

```typescript
interface CompressionStrategy {
  name: "semantic" | "structural" | "statistical"
  targetRatio: number  // e.g., 2.0 = compress to 50% of original
  minTokens: number    // Don't compress blocks smaller than this
  qualityThreshold: number  // Minimum acceptable quality (0-1)
}
```

#### Compression Types

**1. Semantic Compression** (Primary)
- Uses LLM to rephrase content more concisely
- Preserves key information and technical accuracy
- Removes filler words, redundancy, and verbosity

**Example:**
```
Original (120 tokens):
"The user authentication system needs to support multiple authentication
methods including email/password, OAuth2 with Google and GitHub, and
eventually we want to add support for passwordless authentication using
magic links. The system should also maintain session tokens with a
configurable expiration time, defaulting to 7 days for regular users
and 1 day for admin users."

Compressed (55 tokens):
"Auth system: email/password, OAuth2 (Google/GitHub), future magic links.
Session tokens: configurable expiry (default 7d users, 1d admins)."

Compression ratio: 2.18x
```

**2. Structural Compression**
- Removes formatting and whitespace
- Converts markdown to plain text
- Strips code comments (optional)

**3. Statistical Compression**
- Traditional text compression (gzip)
- Used for archival, not in-context

#### Compression Workflow

```typescript
async function compressBlock(block: Block): Promise<CompressedBlock> {
  // 1. Validate block is compressible
  if (block.isCompressed) throw new Error("Already compressed")
  if (block.tokens < 100) throw new Error("Too small to compress")

  // 2. Build compression prompt
  const prompt = buildCompressionPrompt({
    content: block.content,
    strategy: "semantic",
    targetRatio: 2.0,
    contentType: block.type
  })

  // 3. Call LLM for compression
  const compressed = await llm.query(prompt, {
    maxTokens: Math.ceil(block.tokens / 2),
    temperature: 0.3  // Lower temperature for consistency
  })

  // 4. Validate compression quality
  const ratio = block.tokens / estimateTokens(compressed)
  const quality = estimateQuality(block.content, compressed)

  if (ratio < 1.2) throw new Error("Insufficient compression")
  if (quality < 0.6) console.warn("Low quality compression")

  // 5. Save with metadata
  return {
    ...block,
    content: compressed,
    isCompressed: true,
    compressionRatio: ratio,
    originalContent: block.content  // Backup for decompression
  }
}
```

#### Compression Prompt Template

```typescript
const COMPRESSION_PROMPT = `You are a compression specialist. Compress the following content while preserving all essential information.

ORIGINAL CONTENT (${originalTokens} tokens):
---
${content}
---

COMPRESSION REQUIREMENTS:
- Target length: ~${targetTokens} tokens (${targetRatio}x compression)
- Preserve all key information, facts, and technical details
- Remove redundancy, filler words, and verbose explanations
- Maintain technical accuracy and specificity
- Keep the compressed version coherent and readable
- DO NOT add commentary or meta-text

COMPRESSED VERSION:`
```

#### Quality Estimation

```typescript
function estimateQuality(original: string, compressed: string): number {
  const importantWords = extractImportantWords(original)
  if (importantWords.length === 0) return 0.8

  const preserved = importantWords.filter(word =>
    compressed.toLowerCase().includes(word.toLowerCase())
  ).length

  return preserved / importantWords.length
}
```

**Limitations of Current Quality Check:**
- Only checks first 50 unique important words
- No frequency weighting
- Simple substring matching (false positives)
- Not suitable for multi-block compression with large content

**Future Improvements:**
- Semantic similarity using embeddings
- N-gram preservation metrics
- Domain-specific quality checkers

#### Merge-and-Compress

For zone compression or related block consolidation:

```typescript
async function compressAndMerge(blocks: Block[]): Promise<Block> {
  // 1. Combine content with structure
  const combined = blocks.map((block, i) =>
    `## Block ${i + 1} (${block.type})\n\n${block.content}`
  ).join("\n\n---\n\n")

  // 2. Compress the combined content
  const compressed = await compress(combined, {
    strategy: "semantic",
    targetRatio: 2.0
  })

  // 3. Create merged block
  return {
    content: compressed,
    type: "note",  // Or user-specified
    zone: blocks[0].zone,
    isCompressed: true,
    compressionRatio: calculateRatio(blocks, compressed)
  }
}
```

---

## Context Management Strategies

### 1. Cache Warming

**Problem**: Empty zones at conversation start waste potential.

**Solution**: Pre-populate zones with relevant context based on:
- Project selection
- Previous session analysis
- Detected task type

```typescript
async function warmCache(session: Session) {
  // Load project context
  if (session.projectId) {
    const project = await getProject(session.projectId)
    await addToZone("PERMANENT", project.requirements)
    await addToZone("STABLE", project.recentFiles)
  }

  // Load templates
  const template = detectTemplate(session.initialMessage)
  if (template) {
    await applyTemplate(template, session)
  }
}
```

### 2. Context Rotation

**Problem**: Conversation extends beyond context window capacity.

**Solution**: Rotate content through zones, compressing or evicting as needed.

```typescript
async function rotateContext(session: Session) {
  const metrics = await getZoneMetrics(session)

  // Check WORKING zone capacity
  if (metrics.zones.WORKING.percentUsed > 90) {
    // Option 1: Compress oldest WORKING blocks
    const oldBlocks = await getOldestBlocks("WORKING", 5)
    await compressAndMerge(oldBlocks)

    // Option 2: Demote to STABLE (if important)
    const importantBlocks = await getImportantBlocks("WORKING")
    await moveBlocks(importantBlocks, "STABLE")

    // Option 3: Evict (if not important)
    const unimportantBlocks = await getUnimportantBlocks("WORKING")
    await archiveBlocks(unimportantBlocks)
  }
}
```

### 3. Selective Recall

**Problem**: Not all context is relevant for every query.

**Solution**: Filter blocks by type and relevance before constructing prompt.

```typescript
async function buildPrompt(query: string, session: Session): Promise<string> {
  // Always include PERMANENT
  const permanent = await getZoneBlocks("PERMANENT", session)

  // Filter STABLE by relevance
  const relevantStable = await filterByRelevance(
    await getZoneBlocks("STABLE", session),
    query,
    threshold: 0.7
  )

  // Include recent WORKING
  const working = await getZoneBlocks("WORKING", session, limit: 10)

  return formatPrompt({
    system: permanent,
    context: relevantStable,
    conversation: working,
    query: query
  })
}
```

### 4. Importance Scoring

**Problem**: Not all blocks have equal value.

**Solution**: Score blocks based on multiple factors.

```typescript
interface BlockScore {
  blockId: Id<"blocks">
  score: number
  factors: {
    recency: number      // 0-1, higher for recent
    references: number   // How many times referenced
    userMarked: boolean  // User explicitly marked important
    type: number         // Type-based weight
    tokens: number       // Penalize very large blocks
  }
}

function calculateImportance(block: Block, session: Session): number {
  let score = 0

  // Recency: exponential decay
  const age = Date.now() - block.createdAt
  score += Math.exp(-age / (24 * 60 * 60 * 1000)) * 0.3  // 30% weight

  // References: log scale
  score += Math.log1p(block.references) * 0.3  // 30% weight

  // Type: based on current task
  score += getTypeWeight(block.type, session.taskType) * 0.2  // 20% weight

  // User marked: binary boost
  score += block.userMarked ? 0.2 : 0  // 20% weight

  return score
}
```

---

## Integration with AI Assistants

### LangChain Integration

```typescript
import { ChatAnthropic } from "@langchain/anthropic"
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages"

class ContextForgeChain {
  private llm: ChatAnthropic
  private session: Session

  async invoke(query: string): Promise<string> {
    // 1. Build context from zones
    const context = await this.buildContext(query)

    // 2. Construct messages
    const messages = [
      new SystemMessage(context.permanent),
      ...context.stable.map(block => new SystemMessage(block.content)),
      ...context.working.map(turn =>
        turn.role === "user"
          ? new HumanMessage(turn.content)
          : new AIMessage(turn.content)
      ),
      new HumanMessage(query)
    ]

    // 3. Get response
    const response = await this.llm.invoke(messages)

    // 4. Update context
    await this.updateContext(query, response)

    return response.content
  }

  private async updateContext(query: string, response: string) {
    // Add to WORKING zone
    await createBlock({
      sessionId: this.session._id,
      content: query,
      type: "question",
      zone: "WORKING"
    })

    await createBlock({
      sessionId: this.session._id,
      content: response,
      type: "answer",
      zone: "WORKING"
    })

    // Check if rotation needed
    await rotateContext(this.session)
  }
}
```

### LlamaIndex Integration

```typescript
import { OpenAI } from "llamaindex"
import { VectorStoreIndex } from "llamaindex"

class ContextForgeIndex {
  private index: VectorStoreIndex
  private session: Session

  async query(query: string): Promise<string> {
    // 1. Retrieve relevant blocks using vector search
    const relevant = await this.index.query({
      query,
      topK: 10
    })

    // 2. Combine with zone-based context
    const zoneContext = await this.buildZoneContext()

    // 3. Merge and rank
    const context = this.mergeAndRank(relevant, zoneContext)

    // 4. Query with context
    return await this.llm.complete({
      prompt: this.buildPrompt(context, query)
    })
  }

  async addToIndex(block: Block) {
    await this.index.insert({
      id: block._id,
      text: block.content,
      metadata: {
        type: block.type,
        zone: block.zone,
        createdAt: block.createdAt
      }
    })
  }
}
```

---

## Advanced Patterns

### 1. Hierarchical Blocks

For nested context (like code with documentation):

```typescript
interface HierarchicalBlock extends Block {
  parentId?: Id<"blocks">
  children?: Id<"blocks">[]
  depth: number
}

// Compress entire hierarchy together
async function compressHierarchy(rootBlock: HierarchicalBlock) {
  const tree = await buildTree(rootBlock)
  const flattened = flattenTree(tree)
  return await compressAndMerge(flattened)
}
```

### 2. Cross-Session Context

For multi-session projects:

```typescript
interface Project {
  _id: Id<"projects">
  name: string
  permanentContext: Id<"blocks">[]  // Shared across sessions
  sessions: Id<"sessions">[]
}

async function loadProjectContext(project: Project, session: Session) {
  // Copy project's permanent blocks to session's PERMANENT zone
  for (const blockId of project.permanentContext) {
    const block = await getBlock(blockId)
    await createBlock({
      ...block,
      sessionId: session._id,
      zone: "PERMANENT"
    })
  }
}
```

### 3. Differential Context

Only send changed context to LLM:

```typescript
interface ContextDiff {
  added: Block[]
  removed: Id<"blocks">[]
  modified: Block[]
}

async function getContextDiff(
  previousContext: Block[],
  currentContext: Block[]
): Promise<ContextDiff> {
  // Calculate diff
  const diff = calculateDiff(previousContext, currentContext)

  // Return only changes
  return diff
}
```

### 4. Context Snapshots

Save and restore entire context state:

```typescript
interface ContextSnapshot {
  sessionId: Id<"sessions">
  timestamp: number
  zones: {
    PERMANENT: Block[]
    STABLE: Block[]
    WORKING: Block[]
  }
  metrics: SessionMetrics
}

async function saveSnapshot(session: Session): Promise<ContextSnapshot> {
  return {
    sessionId: session._id,
    timestamp: Date.now(),
    zones: {
      PERMANENT: await getZoneBlocks("PERMANENT", session),
      STABLE: await getZoneBlocks("STABLE", session),
      WORKING: await getZoneBlocks("WORKING", session)
    },
    metrics: await getZoneMetrics(session)
  }
}

async function restoreSnapshot(snapshot: ContextSnapshot) {
  // Clear current context
  await clearSession(snapshot.sessionId)

  // Restore blocks
  for (const zone of Object.keys(snapshot.zones)) {
    for (const block of snapshot.zones[zone]) {
      await createBlock(block)
    }
  }
}
```

---

## Performance Considerations

### 1. Token Counting

**Fast Estimation** (Development):
```typescript
estimatedTokens = Math.ceil(text.length / 4)
```

**Accurate Counting** (Production):
```typescript
import { encodingForModel } from "js-tiktoken"

const encoding = encodingForModel("gpt-4")
const tokens = encoding.encode(text).length
```

### 2. Compression Costs

Compression has latency and API cost:

| Strategy | Latency | API Cost | Compression Ratio |
|----------|---------|----------|-------------------|
| Semantic (LLM) | 2-10s | $0.001-0.01 | 1.5x - 3.0x |
| Structural | <100ms | Free | 1.1x - 1.3x |
| Hybrid | 2-10s | $0.001-0.01 | 2.0x - 4.0x |

**Optimization**: Only compress when savings justify cost.

```typescript
const tokensSaved = originalTokens - compressedTokens
const compressionCost = 0.005  // $0.005 per compression
const tokenCost = 0.000001  // $0.000001 per token

if (tokensSaved * tokenCost > compressionCost) {
  // Compression is cost-effective
  await compress(block)
}
```

### 3. Caching

Cache compressed results:

```typescript
interface CompressionCache {
  contentHash: string
  compressed: string
  ratio: number
  timestamp: number
}

const cache = new Map<string, CompressionCache>()

async function compressWithCache(content: string): Promise<string> {
  const hash = hashContent(content)

  if (cache.has(hash)) {
    return cache.get(hash).compressed
  }

  const compressed = await compress(content)
  cache.set(hash, {
    contentHash: hash,
    compressed,
    ratio: content.length / compressed.length,
    timestamp: Date.now()
  })

  return compressed
}
```

---

## Observability

### Metrics to Track

```typescript
interface ContextMetrics {
  // Zone utilization
  zoneUtilization: {
    PERMANENT: number  // 0-100%
    STABLE: number
    WORKING: number
  }

  // Compression stats
  compressionStats: {
    blocksCompressed: number
    avgCompressionRatio: number
    totalTokensSaved: number
    compressionCost: number
  }

  // Context efficiency
  efficiency: {
    relevantTokens: number      // Tokens actually used by LLM
    totalTokens: number          // Total tokens sent
    relevanceRatio: number       // relevant / total
  }

  // Performance
  performance: {
    avgPromptBuildTime: number   // ms
    avgCompressionTime: number   // ms
    cacheHitRate: number         // 0-1
  }
}
```

### LangFuse Integration

Track compression and context usage:

```typescript
import { Langfuse } from "langfuse"

const langfuse = new Langfuse()

async function trackCompression(block: Block, result: CompressionResult) {
  const trace = langfuse.trace({
    name: "compression",
    sessionId: block.sessionId,
    userId: session.userId,
    metadata: {
      provider: "claude-code",
      blockType: block.type,
      zone: block.zone
    }
  })

  trace.generation({
    name: "compress-block",
    model: "claude-sonnet-4",
    input: {
      content: block.content.slice(0, 1000),  // Truncate for display
      originalTokens: block.tokens
    },
    output: result.compressedContent.slice(0, 1000),
    usage: {
      input: result.inputTokens,
      output: result.outputTokens,
      total: result.inputTokens + result.outputTokens
    },
    metadata: {
      compressionRatio: result.compressionRatio,
      tokensSaved: result.tokensSaved,
      quality: result.quality
    }
  })

  await langfuse.flushAsync()
}
```

---

## Deployment Considerations

### 1. Database Schema

For production, use proper database constraints and indexes:

```sql
CREATE TABLE blocks (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id),
  content TEXT NOT NULL,
  type VARCHAR(50) NOT NULL,
  zone VARCHAR(20) NOT NULL,
  position INTEGER NOT NULL,
  tokens INTEGER,
  is_compressed BOOLEAN DEFAULT FALSE,
  compression_ratio FLOAT,
  original_content TEXT,
  created_at TIMESTAMP DEFAULT NOW(),

  -- Indexes for common queries
  INDEX idx_session_zone (session_id, zone),
  INDEX idx_session_type (session_id, type),
  INDEX idx_created_at (created_at DESC)
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  project_id UUID REFERENCES projects(id),
  created_at TIMESTAMP DEFAULT NOW(),
  last_active_at TIMESTAMP DEFAULT NOW()
);
```

### 2. Migration Strategy

For existing assistants:

1. **Analyze current context usage**
   - Measure token distribution across conversation
   - Identify frequently referenced content
   - Calculate potential compression savings

2. **Start with WORKING zone**
   - Migrate recent conversation to WORKING
   - Set initial budget (30K tokens)
   - Monitor utilization

3. **Gradually populate STABLE**
   - Move important reference material to STABLE
   - Compress verbose documentation
   - Adjust budget based on usage

4. **Curate PERMANENT**
   - Identify truly permanent context
   - Aggressively compress
   - Keep lean (<10K tokens)

### 3. Multi-Provider Support

Support different LLM providers:

```typescript
interface LLMProvider {
  name: "anthropic" | "openai" | "ollama"
  maxContextTokens: number
  costPerInputToken: number
  costPerOutputToken: number
}

const PROVIDERS: Record<string, LLMProvider> = {
  "claude-sonnet-4": {
    name: "anthropic",
    maxContextTokens: 200000,
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015
  },
  "gpt-4-turbo": {
    name: "openai",
    maxContextTokens: 128000,
    costPerInputToken: 0.00001,
    costPerOutputToken: 0.00003
  },
  "llama3.2": {
    name: "ollama",
    maxContextTokens: 128000,
    costPerInputToken: 0,
    costPerOutputToken: 0
  }
}

function calculateBudgets(provider: LLMProvider) {
  const total = provider.maxContextTokens * 0.5  // Use 50% of max

  return {
    PERMANENT: total * 0.1,
    STABLE: total * 0.3,
    WORKING: total * 0.6
  }
}
```

---

## Conclusion

ContextForge provides a comprehensive framework for managing AI assistant context through:

1. **Block-based organization** - Atomic, typed units of information
2. **Zone hierarchy** - Cache-inspired three-tier system (PERMANENT, STABLE, WORKING)
3. **Token budget management** - Explicit limits with overflow handling
4. **Semantic compression** - LLM-powered content condensation
5. **Dynamic rotation** - Automatic context lifecycle management

This architecture enables AI assistants to:
- Maintain more relevant context within fixed token budgets
- Balance persistent knowledge with working memory
- Compress verbose content without losing semantics
- Scale to long-running conversations and projects
- Optimize cost and latency through intelligent caching

The system is **provider-agnostic**, **observable**, and **extensible**, making it suitable for integration with any LLM-based application requiring sophisticated context management.

---

## Next Steps

For implementing this in a new AI assistant:

1. **Start simple**: Implement basic block storage with zones
2. **Add budgets**: Track token usage per zone
3. **Implement rotation**: Basic LRU eviction for WORKING zone
4. **Add compression**: Start with structural, then semantic
5. **Optimize**: Add caching, observability, and advanced features

The complete implementation is available in the ContextForge repository, including:
- Convex backend with real-time sync
- React frontend with drag-and-drop UI
- Claude Code integration for compression
- LangFuse observability
- Template system for quick starts
