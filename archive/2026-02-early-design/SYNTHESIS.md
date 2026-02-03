# Galatea Architecture Synthesis
## Combining Six Research Projects into a Unified Design

**Created**: 2026-02-01
**Status**: Research Phase Complete → Design Phase
**Purpose**: Integrate findings from six project deconstructions into Galatea's architecture

---

## Executive Summary

After deconstructing six open-source agentic projects, we've identified complementary patterns that can be combined to build Galatea - a psychologically-grounded AI assistant with curiosity-driven learning capabilities that **requires no training of the main LLM**.

### The Six Projects

1. **OpenClaw** - Infrastructure specialist (Gateway + multi-platform)
2. **Cline** - Developer agent with MCP tools + approval gates
3. **GPT-Engineer** - Minimalist prompt-driven generator (preprompts)
4. **MAGELLAN** - Metacognitive curiosity with Learning Progress metric
5. **WorldLLM** - Training-free curiosity via natural language theories
6. **Reflexion** - Self-reflection with external grounding

### Key Discovery

**All improvements can happen without training the main LLM:**
- WorldLLM: Theories as in-context learning
- Reflexion: Verbal feedback cycles
- MAGELLAN: LP metric (portable without RL)
- GPT-Engineer: Behavior via prompts
- Cline: Tool integration via MCP
- OpenClaw: Infrastructure for deployment

---

## Critical User Constraints Met

✅ **No Training Required**: All approaches work with pre-trained LLMs
✅ **TypeScript Preferred**: All patterns implementable in TypeScript
✅ **Psychological Foundation**: Maps to 62 subsystems, 6 memory types
✅ **Curiosity-Driven**: Learning Progress + Natural Language Theories
✅ **Production-Ready**: Patterns from deployed systems

---

## Unified Architecture: The Seven Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                      1. USER INTERFACE LAYER                     │
│                  (Chat, Voice, Multi-Platform)                   │
│                     Inspired by: OpenClaw                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                   2. GATEWAY & ORCHESTRATION                     │
│            (Session Management, Request Routing)                 │
│                     Inspired by: OpenClaw                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                  3. BEHAVIORAL CONTROL LAYER                     │
│              (Preprompts, Modes, Subsystem Config)               │
│                   Inspired by: GPT-Engineer                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    4. COGNITIVE SUBSYSTEMS                       │
│   (62 Psychological Subsystems: Curiosity, Safety, Trust...)     │
│      Reflexion (metacognition) + WorldLLM (world modeling)       │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                  5. TOOL & ACTION LAYER (MCP)                    │
│        (Search, Database, Code, APIs via MCP Protocol)           │
│                      Inspired by: Cline                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                  6. CONTEXT & MEMORY LAYER                       │
│   (ContextForge: PERMANENT/STABLE/WORKING zones + 6 memory      │
│    types: Working, Episodic, Semantic, Procedural, etc.)        │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      7. LLM FOUNDATION                           │
│              (Pre-trained, No Fine-Tuning, Swappable)            │
│                   (GPT-4, Claude, Llama, Phi-3)                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: User Interface (OpenClaw Pattern)

### Purpose
Multi-platform interface supporting chat, voice, and various messaging services.

### Implementation
```typescript
// Gateway-based architecture
interface GatewayConfig {
  platforms: Platform[];  // Discord, Telegram, Web, etc.
  adapters: Map<Platform, MessageAdapter>;
  sessionManager: SessionManager;
}

class UnifiedGateway {
  async handleMessage(msg: IncomingMessage): Promise<void> {
    const session = await this.sessionManager.getOrCreate(msg.userId);
    const normalized = this.adapters.get(msg.platform).normalize(msg);
    await this.orchestrator.process(session, normalized);
  }
}
```

### Key Features
- **Platform Abstraction**: Unified message format across platforms
- **Session Isolation**: Each user gets independent state
- **WebSocket Support**: Real-time bidirectional communication
- **Rich Media**: Support for images, voice, files

### From OpenClaw
- Gateway pattern for platform independence
- Session management architecture
- Adapter pattern for normalization
- Multi-platform deployment proven at scale

---

## Layer 2: Gateway & Orchestration (OpenClaw + Cline)

### Purpose
Route requests, manage sessions, coordinate subsystems, enforce approval gates.

### Implementation
```typescript
interface OrchestrationState {
  sessionId: string;
  activeSubsystems: Set<SubsystemType>;
  approvalQueue: Action[];
  contextZones: ContextForge;
}

class Orchestrator {
  async process(session: Session, request: Request): Promise<Response> {
    // 1. Load context from ContextForge
    const context = await this.contextForge.load(session.id);

    // 2. Determine active subsystems
    const subsystems = this.selectSubsystems(request, context);

    // 3. Check approval requirements (Cline pattern)
    if (this.requiresApproval(request, subsystems)) {
      return await this.requestApproval(request);
    }

    // 4. Execute with subsystems
    return await this.execute(request, subsystems, context);
  }
}
```

### Key Features
- **Request Routing**: Direct to appropriate subsystems
- **Approval Gates**: Human-in-the-loop for sensitive actions (Cline)
- **Subsystem Coordination**: Multiple subsystems work together
- **State Management**: Session state persistence

### From OpenClaw + Cline
- Gateway routing logic
- Session state management
- Approval gate pattern (Cline)
- WebSocket for async approval requests

---

## Layer 3: Behavioral Control (GPT-Engineer Preprompts)

### Purpose
Define agent behavior through composable prompt templates without code changes.

### Implementation
```typescript
interface PrepromptLibrary {
  core: {
    identity: string;        // Who is Galatea
    philosophy: string;      // Core principles
    capabilities: string;    // What can she do
  };
  subsystems: Map<SubsystemType, string>;  // Per-subsystem behavior
  modes: Map<Mode, string>;               // reflective, creative, analytical
  memory_guides: string[];                // How to use each memory type
}

class BehaviorController {
  buildPrompt(
    request: Request,
    subsystems: Subsystem[],
    context: Context
  ): string {
    return `
${this.preprompts.core.identity}
${this.preprompts.core.philosophy}

Active Subsystems:
${subsystems.map(s => this.preprompts.subsystems.get(s.type)).join('\n')}

Current Mode: ${this.preprompts.modes.get(context.mode)}

Context:
${context.permanent}  // ContextForge PERMANENT zone
${context.stable}     // ContextForge STABLE zone

Working Memory:
${context.working}    // ContextForge WORKING zone

User Request:
${request.content}
`;
  }
}
```

### Key Features
- **No Code Deployment**: Change behavior by editing YAML/text files
- **Subsystem Prompts**: Each of 62 subsystems has behavior template
- **Mode Switching**: reflective, creative, analytical, exploratory
- **Composability**: Mix and match preprompts for situations

### From GPT-Engineer
- Preprompt architecture
- File-based behavior definition
- Composition pattern (identity + philosophy + task)
- Extreme simplicity (no complex prompt engineering framework)

---

## Layer 4: Cognitive Subsystems (The Heart of Galatea)

### Purpose
Implement 62 psychological subsystems with curiosity-driven learning.

### The 62 Subsystems (Categorized)

#### Core Intelligence (8)
1. **Metacognition** ← Reflexion integration
2. **Self-Awareness** ← Reflexion gap enumeration
3. **Truth-Seeking** ← Reflexion citations
4. **Curiosity** ← WorldLLM + MAGELLAN LP
5. **Pattern Recognition**
6. **Causal Reasoning**
7. **Abstract Thinking**
8. **Planning**

#### Social & Emotional (12)
9. Empathy
10. Trust (user, self, sources)
11. Emotional Intelligence
12. Social Context Awareness
13. Perspective-Taking
14. Emotional Regulation
15. Attachment
16. Authenticity
17. Boundaries
18. Rapport Building
19. Conflict Resolution
20. Collaboration

#### Safety & Ethics (8)
21. Safety Verification ← Reflexion for risk assessment
22. Ethical Reasoning
23. Harm Prevention
24. Privacy Protection
25. Consent Verification
26. Bias Detection
27. Fairness Evaluation
28. Transparency

#### Learning & Growth (8)
29. Learning Progress Tracking ← MAGELLAN LP metric
30. World Modeling ← WorldLLM theories
31. Theory Induction ← WorldLLM Scientist
32. Hypothesis Testing ← WorldLLM Experimenter
33. Skill Acquisition
34. Knowledge Integration
35. Error Correction ← Reflexion
36. Self-Improvement ← Reflexion

#### Communication (7)
37. Language Generation
38. Active Listening
39. Clarification Seeking
40. Explanation Generation
41. Storytelling
42. Humor
43. Tone Adaptation

#### Task Execution (9)
44. Goal Setting
45. Task Decomposition
46. Resource Management
47. Time Awareness
48. Progress Monitoring
49. Error Handling
50. Tool Selection ← MCP integration
51. Multi-step Planning
52. Checkpoint Management ← Cline snapshots

#### Memory & Context (8)
53. Working Memory Management ← ContextForge WORKING
54. Episodic Retrieval ← ContextForge + Reflexion storage
55. Semantic Knowledge ← ContextForge PERMANENT
56. Procedural Memory ← ContextForge
57. Emotional Memory
58. Meta-Memory (memory about memory)
59. Context Switching
60. Attention Allocation

#### Self-Regulation (2)
61. Energy Management
62. Attention Control

### Subsystem Implementation Pattern

```typescript
interface Subsystem {
  type: SubsystemType;
  preprompt: string;              // From Layer 3
  state: SubsystemState;          // Persistent state
  dependencies: SubsystemType[];  // Other subsystems needed

  // Core methods
  activate(context: Context): Promise<void>;
  process(input: Input): Promise<Output>;
  reflect(): Promise<Reflection>;  // Reflexion integration
}

// Example: Curiosity Subsystem
class CuriositySubsystem implements Subsystem {
  private worldModel: WorldLLMModel;     // Natural language theories
  private lpTracker: LearningProgressTracker;  // MAGELLAN metric

  async identifyGaps(context: Context): Promise<Gap[]> {
    // Use WorldLLM to find low-likelihood transitions
    const theories = this.worldModel.getCurrentTheories();
    const trajectories = context.recentInteractions;
    const likelihoods = await this.worldModel.computeLikelihoods(
      theories,
      trajectories
    );

    // Find low-likelihood = curiosity targets
    return trajectories
      .filter((t, i) => likelihoods[i] < CURIOSITY_THRESHOLD)
      .map(t => ({
        transition: t,
        likelihood: likelihoods[i],
        theory_gap: this.identifyTheoryGap(t, theories)
      }));
  }

  async trackLearningProgress(goal: Goal): Promise<number> {
    // Use MAGELLAN LP metric (no RL needed)
    const recent_sr = this.lpTracker.getRecentSuccessRate(goal);
    const delayed_sr = this.lpTracker.getDelayedSuccessRate(goal);
    return Math.abs(recent_sr - delayed_sr);  // Learning Progress
  }

  async reflect(): Promise<Reflection> {
    // Use Reflexion to critique curiosity effectiveness
    return await reflexionLoop({
      draft: "Current curiosity strategy...",
      evidence: this.lpTracker.getAllGoalStats(),
      critique_prompts: this.preprompt
    });
  }
}
```

### Integration Points

#### WorldLLM Integration (No Training)
```typescript
class WorldModelingSubsystem implements Subsystem {
  private scientist: LLM;      // Generates theories
  private experimenter: CuriositySubsystem;  // Collects evidence
  private statistician: LLM;   // Scores theories

  async updateWorldModel(context: Context): Promise<void> {
    // 1. Generate theory hypotheses (in natural language)
    const trajectories = context.recentInteractions;
    const theories = await this.scientist.generateTheories(trajectories);

    // 2. Score theories against evidence
    const likelihoods = await this.statistician.computeLikelihoods(
      theories,
      trajectories
    );

    // 3. Select best theory (Bayesian update, no training)
    const best_theory_idx = argmax(likelihoods);
    const best_theory = theories[best_theory_idx];

    // 4. Store in semantic memory
    await context.memory.semantic.update({
      theory: best_theory,
      likelihood: likelihoods[best_theory_idx],
      evidence: trajectories
    });

    // 5. Identify gaps for curiosity
    const gaps = trajectories.filter((t, i) =>
      likelihoods[i] < CURIOSITY_THRESHOLD
    );

    await this.experimenter.exploreLowLikelihoodTransitions(gaps);
  }
}
```

#### Reflexion Integration (No Training)
```typescript
class MetacognitionSubsystem implements Subsystem {
  async reflectOnResponse(
    draft: string,
    context: Context
  ): Promise<string> {
    // Three-node graph: draft → tools → revise
    let current_draft = draft;
    let iteration = 0;

    while (iteration < MAX_ITERATIONS) {
      // 1. Gather evidence via MCP tools
      const evidence = await this.executeTools(current_draft, context);

      // 2. Generate structured critique
      const critique = await this.critique(current_draft, evidence);

      // 3. Check if done
      if (critique.missing.length === 0 &&
          critique.superfluous.length === 0) {
        break;
      }

      // 4. Revise with evidence
      current_draft = await this.revise(current_draft, critique, evidence);

      // 5. Store reflection in episodic memory
      await context.memory.episodic.store({
        type: 'reflection',
        iteration,
        critique,
        improvement: current_draft
      });

      iteration++;
    }

    return current_draft;
  }
}
```

#### Learning Progress Integration (No Training)
```typescript
class LearningProgressTracker {
  private goalHistory: Map<Goal, SuccessRecord[]>;

  computeLP(goal: Goal): number {
    const history = this.goalHistory.get(goal) || [];
    const midpoint = Math.floor(history.length / 2);

    // Recent competence
    const recent = history.slice(midpoint);
    const sr_recent = recent.filter(r => r.success).length / recent.length;

    // Delayed competence
    const delayed = history.slice(0, midpoint);
    const sr_delayed = delayed.filter(r => r.success).length / delayed.length;

    // Learning Progress = |change in competence|
    return Math.abs(sr_recent - sr_delayed);
  }

  selectCuriousGoal(goals: Goal[]): Goal {
    // Epsilon-greedy over LP (MAGELLAN pattern, no RL)
    if (Math.random() < EPSILON) {
      return goals[Math.floor(Math.random() * goals.length)];
    }

    const lps = goals.map(g => this.computeLP(g));
    return goals[argmax(lps)];  // Highest learning progress
  }
}
```

---

## Layer 5: Tool & Action Layer (Cline MCP)

### Purpose
Execute actions in the world via standardized MCP protocol.

### Implementation
```typescript
// MCP Server integration (from Cline)
interface MCPServer {
  name: string;
  tools: Tool[];
  connect(): Promise<void>;
}

interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute(params: any): Promise<ToolResult>;
}

class ToolOrchestrator {
  private mcpServers: Map<string, MCPServer>;

  async executeTool(
    toolName: string,
    params: any,
    context: Context
  ): Promise<ToolResult> {
    // 1. Find tool in MCP servers
    const tool = this.findTool(toolName);

    // 2. Check approval (Cline pattern)
    if (tool.requiresApproval) {
      const approved = await this.requestApproval({
        tool: toolName,
        params,
        context
      });
      if (!approved) {
        throw new Error("Tool execution rejected by user");
      }
    }

    // 3. Execute
    const result = await tool.execute(params);

    // 4. Store in episodic memory
    await context.memory.episodic.store({
      type: 'tool_execution',
      tool: toolName,
      params,
      result,
      timestamp: Date.now()
    });

    return result;
  }
}
```

### MCP Tool Categories

1. **Search Tools**: Web search, code search, documentation
2. **Database Tools**: Query, insert, update user data
3. **Code Tools**: Read files, write files, execute commands
4. **API Tools**: External service integrations
5. **Memory Tools**: Query ContextForge zones
6. **Analysis Tools**: Data analysis, visualization
7. **Communication Tools**: Send messages, create notifications

### From Cline
- MCP protocol for tool standardization
- Approval gate pattern for safety
- Cost tracking per tool
- Multi-provider support (can swap tools)

---

## Layer 6: Context & Memory (ContextForge + 6 Memory Types)

### Purpose
Manage context zones and six memory types for coherent, personalized experience.

### ContextForge Zones

```typescript
interface ContextForge {
  permanent: PermanentZone;   // Never compressed, always available
  stable: StableZone;         // Compressed slowly, semi-permanent
  working: WorkingZone;       // Compressed aggressively, current task
}

class PermanentZone {
  // Identity, core values, user profile, key facts
  content: {
    user_identity: UserProfile;
    galatea_identity: AgentProfile;
    relationship_history: RelationshipState;
    core_knowledge: SemanticKnowledge[];
  };

  compress(): never {
    throw new Error("PERMANENT zone cannot be compressed");
  }
}

class StableZone {
  // Ongoing projects, recent conversations, active theories
  content: {
    active_projects: Project[];
    recent_conversations: Conversation[];
    world_model_theories: Theory[];  // WorldLLM integration
    learning_progress_state: LPState;  // MAGELLAN integration
  };

  async compress(threshold: number): Promise<void> {
    // Semantic compression: summarize old conversations
    // Keep theories and LP state intact
  }
}

class WorkingZone {
  // Current task context, intermediate results, tool outputs
  content: {
    current_task: Task;
    intermediate_results: any[];
    tool_outputs: ToolResult[];
    reflection_state: ReflexionState;  // Reflexion integration
  };

  async compress(threshold: number): Promise<void> {
    // Aggressive compression: only keep essential task state
    // Move completed reflections to episodic memory
  }
}
```

### Six Memory Types

```typescript
interface MemorySystem {
  working: WorkingMemory;      // Current task, short-term
  episodic: EpisodicMemory;    // Past events, experiences
  semantic: SemanticMemory;    // Facts, concepts, theories
  procedural: ProceduralMemory; // How-to knowledge, skills
  emotional: EmotionalMemory;   // Emotional associations
  meta: MetaMemory;            // Memory about memory
}

class EpisodicMemory {
  async store(episode: Episode): Promise<void> {
    // Store reflections, tool uses, conversations
    // Tag with: timestamp, participants, subsystems involved, emotions
    // Link to semantic knowledge created during episode
  }

  async retrieve(query: Query): Promise<Episode[]> {
    // Vector search over episode embeddings
    // Filter by: time range, participants, subsystems, emotions
    // Return ranked by relevance
  }
}

class SemanticMemory {
  async store(knowledge: Knowledge): Promise<void> {
    // Store: facts, theories (WorldLLM), concepts, definitions
    // Link to: source episodes, supporting evidence, confidence
  }

  async query(question: string): Promise<Knowledge[]> {
    // Semantic search over knowledge graph
    // Return: relevant facts + theories + confidence scores
  }
}

class ProceduralMemory {
  async store(procedure: Procedure): Promise<void> {
    // Store: how-to knowledge, successful action sequences
    // Learn from: Reflexion improvements, successful tool chains
    // Format: "To achieve X, do Y then Z"
  }

  async retrieve(goal: Goal): Promise<Procedure[]> {
    // Return procedures that achieved similar goals
    // Ranked by: success rate, recency, similarity
  }
}
```

### Integration with Subsystems

```typescript
// Curiosity Subsystem uses multiple memory types
class CuriositySubsystem {
  async identifyNovelSituations(context: Context): Promise<Situation[]> {
    // Check episodic memory: have we seen this before?
    const similar_episodes = await context.memory.episodic.retrieve({
      similarity: context.current_situation,
      threshold: NOVELTY_THRESHOLD
    });

    if (similar_episodes.length === 0) {
      // Novel! Check semantic memory for theories
      const theories = await context.memory.semantic.query(
        `theories about ${context.current_situation}`
      );

      // Compute likelihood under theories (WorldLLM)
      const likelihood = this.worldModel.computeLikelihood(
        theories,
        context.current_situation
      );

      if (likelihood < CURIOSITY_THRESHOLD) {
        // Low likelihood = curiosity opportunity
        return [context.current_situation];
      }
    }

    return [];
  }
}
```

---

## Layer 7: LLM Foundation (Pre-trained, No Fine-tuning)

### Purpose
Swappable LLM backend that requires no training.

### Implementation
```typescript
interface LLMProvider {
  model: string;
  complete(prompt: string, config: CompletionConfig): Promise<string>;
  embed(text: string): Promise<number[]>;
}

class LLMManager {
  private providers: Map<string, LLMProvider>;
  private currentProvider: string;

  async complete(
    prompt: string,
    subsystem?: SubsystemType
  ): Promise<string> {
    // Can use different models for different subsystems
    const provider = this.selectProvider(subsystem);
    return await provider.complete(prompt, {
      temperature: this.getTemperature(subsystem),
      max_tokens: this.getMaxTokens(subsystem)
    });
  }

  private selectProvider(subsystem?: SubsystemType): LLMProvider {
    // Use smaller models for simple subsystems
    // Use larger models for complex reasoning (metacognition, curiosity)
    if (subsystem === 'MetacognitionSubsystem') {
      return this.providers.get('gpt-4');
    }
    return this.providers.get(this.currentProvider);
  }
}
```

### Supported Models (No Training)

- **GPT-4 / GPT-4 Turbo**: High capability, expensive
- **Claude Opus / Sonnet**: High capability, good reasoning
- **Llama 3**: Open source, self-hosted
- **Phi-3**: Lightweight, fast, cheap
- **Mistral**: Good balance of cost/performance

All used **as-is, no fine-tuning**, with behavior controlled via preprompts (Layer 3).

---

## Cross-Layer Integration Flows

### Flow 1: Curiosity-Driven Exploration

```
User asks question
       │
       ▼
Layer 4: Curiosity Subsystem
       │ - Check world model (WorldLLM theories)
       │ - Find low-likelihood transitions
       │ - Compute Learning Progress for related goals
       ▼
Layer 5: Execute MCP tools to explore
       │ - Search for information
       │ - Query databases
       │ - Run experiments
       ▼
Layer 4: WorldLLM Scientist
       │ - Generate new theories from evidence
       │ - Update world model (Bayesian, no training)
       │ - Store theories in semantic memory
       ▼
Layer 4: Reflexion
       │ - Reflect on theory quality
       │ - Critique gaps in evidence
       │ - Revise theories
       ▼
Layer 6: Store in memory
       │ - Episodic: the exploration episode
       │ - Semantic: updated theories
       │ - Procedural: successful exploration strategies
       ▼
Response to user with improved understanding
```

### Flow 2: Reflective Response Generation

```
User asks complex question
       │
       ▼
Layer 4: Metacognition Subsystem
       │ - Generate initial draft
       ▼
Layer 4: Reflexion Loop
       │
       ├─> Layer 5: Execute MCP tools (search, etc.)
       │   │ - Gather evidence
       │   ▼
       ├─> Layer 7: LLM generates critique
       │   │ - Identify superfluous content
       │   │ - Identify missing content
       │   │ - Check citations
       │   ▼
       ├─> Layer 7: LLM generates revision
       │   │ - Remove superfluous
       │   │ - Add missing with citations
       │   ▼
       └─> Layer 6: Store reflection in episodic memory
       │
       ▼
Layer 4: Safety Subsystem
       │ - Verify response is safe
       │ - Check for biases
       ▼
Response to user (high quality, cited)
```

### Flow 3: Learning from Failure

```
Task fails
       │
       ▼
Layer 4: Error Detection
       │ - Identify what went wrong
       ▼
Layer 4: Reflexion
       │ - Reflect on root cause
       │ - Generate critique: what was missing?
       ▼
Layer 6: Episodic Memory
       │ - Store failure episode with critique
       ▼
Layer 6: Procedural Memory
       │ - Update procedures: "Don't do X, do Y instead"
       ▼
Layer 4: Learning Progress Tracker
       │ - Update success rates for this goal
       │ - Adjust curiosity (if LP increasing, keep trying)
       ▼
Future attempts use updated knowledge (no LLM retraining!)
```

---

## Key Innovations: What Makes This Unique

### 1. **Training-Free Curiosity**
- **WorldLLM**: Natural language theories in prompts
- **MAGELLAN LP**: Success rate tracking without RL
- **Combination**: Curiosity without any model training

### 2. **Psychological Grounding**
- 62 subsystems based on human psychology
- Not just "ReAct with tools" - deep personality modeling
- Empathy, trust, safety, ethics as first-class subsystems

### 3. **Composable Preprompts**
- Behavior via prompt templates (GPT-Engineer)
- No code changes to modify personality
- Mix and match for situations

### 4. **External Grounding Throughout**
- Reflexion: ground reflections in tool outputs
- WorldLLM: ground theories in experiments
- MAGELLAN: ground curiosity in competence tracking

### 5. **Multi-Layer Memory**
- Not just vector DB - six memory types
- ContextForge zones for smart compression
- Episodic + Semantic + Procedural integration

### 6. **MCP Tool Ecosystem**
- Industry standard (Cline)
- Easy to add new tools
- Approval gates for safety

### 7. **Production Infrastructure**
- OpenClaw patterns for scale
- Multi-platform support
- Session management

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)
**Goal**: Basic infrastructure + simple subsystems

- [ ] Set up TypeScript project structure
- [ ] Implement ContextForge (3 zones)
- [ ] Implement 6 memory types (basic versions)
- [ ] Create preprompt system (Layer 3)
- [ ] Integrate MCP tool protocol (Layer 5)
- [ ] Build basic gateway (Layer 2)
- [ ] Implement 5 core subsystems:
  - [ ] Metacognition (with Reflexion)
  - [ ] Curiosity (with WorldLLM basics)
  - [ ] Safety
  - [ ] Truth-Seeking
  - [ ] Planning

**Validation**: Can answer questions with reflection and tool use

---

### Phase 2: Curiosity Engine (Weeks 5-8)
**Goal**: Add curiosity-driven learning

- [ ] Implement WorldLLM Scientist (theory generation)
- [ ] Implement WorldLLM Experimenter (exploration)
- [ ] Implement WorldLLM Statistician (theory scoring)
- [ ] Add Learning Progress tracker (MAGELLAN LP)
- [ ] Integrate curiosity with memory (store theories, episodes)
- [ ] Build goal selection (epsilon-greedy over LP)
- [ ] Add curiosity subsystem coordination

**Validation**: Can identify knowledge gaps and autonomously explore

---

### Phase 3: Subsystem Expansion (Weeks 9-16)
**Goal**: Add psychological depth

- [ ] Implement 20 more subsystems:
  - [ ] Social & Emotional (12): Empathy, Trust, etc.
  - [ ] Learning & Growth (8): Theory Induction, etc.
- [ ] Create preprompts for all subsystems
- [ ] Build subsystem coordination logic
- [ ] Add subsystem state persistence
- [ ] Implement subsystem reflection (each can reflect)

**Validation**: Demonstrates empathy, builds trust, learns from errors

---

### Phase 4: Full Memory System (Weeks 17-20)
**Goal**: Rich, personalized memory

- [ ] Advanced episodic memory (vector + graph)
- [ ] Semantic memory with theories (WorldLLM integration)
- [ ] Procedural memory learning (from Reflexion)
- [ ] Emotional memory (link emotions to episodes)
- [ ] Meta-memory (memory about memory)
- [ ] Cross-memory linking (episodes → knowledge → procedures)

**Validation**: Remembers past, learns procedures, personalizes

---

### Phase 5: Production Polish (Weeks 21-24)
**Goal**: Deployment-ready

- [ ] Complete OpenClaw gateway (multi-platform)
- [ ] Add all remaining subsystems (to 62 total)
- [ ] Performance optimization (caching, batching)
- [ ] Monitoring and metrics
- [ ] Cost tracking
- [ ] User approval UI (Cline pattern)
- [ ] Documentation and examples

**Validation**: Deployed, stable, cost-effective

---

## Technical Stack

### Core
- **Language**: TypeScript
- **Runtime**: Node.js
- **Framework**: Custom (inspired by LangGraph patterns)

### Infrastructure
- **Database**: Convex (as per ContextForgeTS)
- **Vectors**: Pinecone or Weaviate
- **Queue**: Redis or RabbitMQ
- **WebSocket**: Socket.io

### LLM Integration
- **Providers**: OpenAI, Anthropic, Ollama (local)
- **Embedding**: text-embedding-3-small
- **Tokenization**: tiktoken

### Tools
- **MCP Protocol**: @modelcontextprotocol/sdk
- **Search**: Tavily API
- **Code Tools**: Custom MCP servers

---

## Success Metrics

### Technical Metrics
1. **Curiosity Effectiveness**
   - % of knowledge gaps identified
   - % of gaps successfully explored
   - Learning Progress trend over time

2. **Reflection Quality**
   - Citation accuracy (% of claims with valid sources)
   - Revision improvement score (human eval)
   - Iterations to convergence

3. **Memory Efficiency**
   - Context compression ratio
   - Retrieval precision/recall
   - Memory persistence across sessions

4. **Subsystem Coordination**
   - Subsystems activated per request
   - Coordination overhead
   - Subsystem conflict rate

### User Experience Metrics
1. **Trust**: User-reported trust score (1-10)
2. **Empathy**: User-reported empathy score (1-10)
3. **Usefulness**: Task completion rate
4. **Learning**: User perception of Galatea's growth over time

### Cost Metrics
1. **Token efficiency**: Tokens per request
2. **Tool cost**: $ per tool execution
3. **Reflection overhead**: Extra cost from Reflexion iterations

---

## Open Questions for Brainstorming

### Architecture
1. Should subsystems be LLM calls or rule-based logic?
   - **Hybrid**: Simple subsystems (safety checks) → rules; Complex (empathy) → LLM
2. How to coordinate 62 subsystems without explosion?
   - **Hierarchy**: Group into 8 categories, activate category first
3. When to trigger Reflexion? Every response or selectively?
   - **Selective**: On complex questions, low confidence, or user flag

### Curiosity
1. How to balance exploration vs exploitation?
   - **Adaptive epsilon**: High epsilon early, decay over time
2. What if theories conflict?
   - **Bayesian model averaging**: Weight theories by likelihood
3. How to evaluate theory quality without ground truth?
   - **Internal consistency + prediction accuracy on held-out data**

### Memory
1. When to compress STABLE zone?
   - **Time-based**: After 7 days, compress conversations
   - **Size-based**: When zone exceeds token limit
2. How to link episodic → semantic memory?
   - **Automatic**: After each episode, extract facts → semantic
3. How to prevent memory drift?
   - **Anchors**: PERMANENT zone acts as stable reference

### Safety
1. How to ensure approval gates don't frustrate users?
   - **Learn**: Track approval patterns, auto-approve safe actions
2. How to handle subsystem conflicts (e.g., curiosity vs safety)?
   - **Priority**: Safety always wins, curiosity deferred

### Scaling
1. How to handle 62 subsystems with token limits?
   - **Selective activation**: Only activate relevant subsystems
   - **Preprompt compression**: Summarize subsystem prompts
2. Cost explosion with Reflexion iterations?
   - **Adaptive depth**: Simple questions → 1 iteration; Complex → 5
   - **Cheaper models**: Use Phi-3 for reflections, GPT-4 for final

---

## Conclusion: A Coherent Vision

We've synthesized six diverse projects into a **unified, training-free, psychologically-grounded architecture** for Galatea:

✅ **Infrastructure**: OpenClaw gateway for multi-platform deployment
✅ **Tools**: Cline MCP protocol for extensible actions
✅ **Behavior**: GPT-Engineer preprompts for flexible personality
✅ **Curiosity Metric**: MAGELLAN Learning Progress (without RL)
✅ **World Modeling**: WorldLLM natural language theories (no training)
✅ **Self-Improvement**: Reflexion verbal feedback (no training)
✅ **Memory**: ContextForge + 6 memory types for coherence
✅ **Subsystems**: 62 psychological subsystems for depth
✅ **Language**: TypeScript for maintainability
✅ **LLM**: Pre-trained only, no fine-tuning

**Next Step**: Enter implementation phase with Phase 1 (Foundation).

---

*Synthesis completed: 2026-02-01*
*Ready for implementation.*
