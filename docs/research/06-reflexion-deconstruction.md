# Reflexion: Self-Reflection Agents via Verbal Feedback

**Source**: https://www.blog.langchain.com/reflection-agents/
**Reference**: Shinn, et al., 2023
**Implementation**: LangGraph (TypeScript/Python)
**Category**: Self-Improvement Pattern
**Status**: Production-Ready

---

## Overview

Reflexion is an agent architecture that enables learning through **verbal self-reflection** grounded in external evidence. Unlike traditional RL approaches that require training, Reflexion improves agent responses through iterative critique and revision cycles, making it compatible with pre-trained LLMs.

**Core Innovation**: The agent explicitly critiques its own responses using external data as evidence, generating citations and enumerating gaps to guide improvement.

---

## Key Innovation: Grounded Self-Critique

### The Problem
Agents often generate plausible but incorrect responses without self-awareness of their limitations. Traditional reflection approaches lack grounding and can hallucinate improvements.

### The Solution
Force the agent to:
1. **Ground criticism in external data** (search results, tool outputs)
2. **Generate explicit citations** for claims
3. **Enumerate specific gaps**: What's superfluous? What's missing?

This transforms vague "I should do better" into actionable "This claim lacks evidence, that section is irrelevant, and we're missing X, Y, Z."

---

## Core Architecture

### Three-Node Graph Pattern

```
┌─────────────┐
│   Draft     │ ← Initial response generation
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Execute     │ ← Run searches/tools to gather evidence
│   Tools     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Revise    │ ← Reflect + critique + incorporate evidence
└──────┬──────┘
       │
       ├─────► Iterate (up to max_iterations)
       │
       └─────► Final response
```

### State Flow
1. **Draft Node**: Generate initial answer
2. **Execute Tools Node**: Gather external evidence (search, APIs, etc.)
3. **Revise Node**:
   - Critique current draft using evidence
   - Identify superfluous content
   - Identify missing content
   - Generate improved version with citations
4. **Conditional Loop**: Continue until max iterations or quality threshold met

---

## Technical Implementation

### LangGraph Structure

```typescript
// Define state
interface ReflexionState {
  query: string;
  draft: string;
  search_results: Array<{url: string, content: string}>;
  critique: {
    superfluous: string[];
    missing: string[];
  };
  revision: string;
  iteration: number;
}

// Build graph
const workflow = new StateGraph<ReflexionState>()
  .addNode("draft", generateDraft)
  .addNode("execute_tools", executeTools)
  .addNode("revise", reviseWithReflection)
  .addEdge("draft", "execute_tools")
  .addEdge("execute_tools", "revise")
  .addConditionalEdges(
    "revise",
    shouldContinue,
    {
      continue: "execute_tools",
      end: END
    }
  );
```

### Critique Prompt Pattern

```typescript
const critiquePrompt = `
Review the current draft and search results.

Draft:
${state.draft}

Evidence:
${state.search_results.map(r => `[${r.url}] ${r.content}`).join('\n\n')}

Provide structured critique:
1. SUPERFLUOUS: What content is irrelevant or redundant?
2. MISSING: What key information is absent?
3. UNSUPPORTED: What claims lack citations?

Be specific and reference evidence.
`;
```

### Revision Prompt Pattern

```typescript
const revisionPrompt = `
Improve the draft based on this critique:

Original Draft:
${state.draft}

Critique:
- Superfluous: ${state.critique.superfluous.join(', ')}
- Missing: ${state.critique.missing.join(', ')}

Evidence Available:
${state.search_results.map(r => `[${r.url}] ${r.content}`).join('\n\n')}

Generate improved version:
1. Remove superfluous content
2. Add missing information with [citations]
3. Support all claims with evidence
`;
```

---

## Key Advantages

### 1. **No Training Required**
- Works with any pre-trained LLM
- Improvements via prompting, not weight updates
- Compatible with user constraint: "not training the main engine LLM"

### 2. **External Grounding**
- Reflections anchored in real data (search results, tool outputs)
- Reduces hallucination in self-critique
- Makes improvements verifiable

### 3. **Explicit Gap Enumeration**
- Forces agent to articulate specific deficiencies
- Provides actionable improvement targets
- Creates audit trail of reasoning

### 4. **Citation Requirements**
- Increases accuracy and verifiability
- Enables fact-checking
- Builds trust through transparency

### 5. **Simple Integration**
- Three-node pattern easy to implement
- Works with existing tool ecosystems (MCP)
- Composable with other patterns

---

## Limitations

### 1. **Linear Trajectory**
The article notes Reflexion "pursues one fixed trajectory" - early mistakes cascade through subsequent revisions. Unlike tree-based approaches (Tree of Thoughts, MCTS), it cannot backtrack to explore alternative paths.

### 2. **Iteration Cost**
Each reflection cycle requires multiple LLM calls:
- Draft generation
- Critique generation
- Revision generation

For 5 iterations, that's 15+ LLM calls per query.

### 3. **Search Quality Dependency**
Reflection quality depends on evidence quality. Poor search results → poor critiques → poor revisions.

### 4. **No Long-Term Memory**
Standard implementation doesn't persist learned critiques. Each query starts fresh. (Could be augmented with episodic memory.)

---

## Relevance to Galatea

### Direct Alignment with Requirements

1. **No Training**: ✅ Reflexion is prompt-based, doesn't train the LLM
2. **TypeScript**: ✅ LangGraph supports TypeScript
3. **Psychological Foundation**: ✅ Maps to metacognition subsystems
4. **Tool Integration**: ✅ Works with MCP tools from Cline

### Subsystem Mapping

| Galatea Subsystem | Reflexion Component |
|-------------------|---------------------|
| **Metacognition** | Self-critique cycle |
| **Self-Awareness** | Gap enumeration |
| **Truth-Seeking** | Citation requirements |
| **Curiosity** | Missing content identification |
| **Working Memory** | Current draft + critique state |
| **Episodic Memory** | Could store past reflections |

### Integration Opportunities

**With WorldLLM**:
- Use Reflexion to improve theory quality
- Reflect on why theories fail (low likelihood transitions)
- Ground theory revisions in experimental evidence

**With MAGELLAN Learning Progress**:
- Reflect on low-LP goals: Why aren't we improving here?
- Generate hypotheses about competence gaps
- Use reflections to guide goal selection

**With GPT-Engineer Preprompts**:
- Reflexion as behavior mode: "reflective_assistant.prompt"
- Encode critique structure in preprompt templates
- Different reflection depths for different subsystems

**With Cline MCP Tools**:
- Execute_tools node uses MCP servers
- Search, database, API calls as evidence sources
- Tool outputs become reflection grounding

---

## Critical Code Patterns

### Pattern 1: Structured Critique

```typescript
interface Critique {
  superfluous: Array<{
    content: string;
    reason: string;
  }>;
  missing: Array<{
    topic: string;
    importance: string;
  }>;
  unsupported: Array<{
    claim: string;
    suggested_source: string;
  }>;
}

async function generateCritique(
  draft: string,
  evidence: Evidence[]
): Promise<Critique> {
  const prompt = buildCritiquePrompt(draft, evidence);
  const response = await llm.complete(prompt);
  return parseStructuredCritique(response);
}
```

### Pattern 2: Evidence-Based Revision

```typescript
interface Revision {
  content: string;
  citations: Array<{
    claim: string;
    source: string;
    url: string;
  }>;
  changes_made: string[];
}

async function reviseWithEvidence(
  draft: string,
  critique: Critique,
  evidence: Evidence[]
): Promise<Revision> {
  const prompt = buildRevisionPrompt(draft, critique, evidence);
  const response = await llm.complete(prompt);
  return parseRevision(response);
}
```

### Pattern 3: Iteration Control

```typescript
function shouldContinue(state: ReflexionState): "continue" | "end" {
  // Max iterations check
  if (state.iteration >= MAX_ITERATIONS) {
    return "end";
  }

  // Quality threshold check
  if (state.critique.missing.length === 0 &&
      state.critique.superfluous.length === 0) {
    return "end";
  }

  // Convergence check
  if (state.revision === state.draft) {
    return "end";
  }

  return "continue";
}
```

### Pattern 4: Evidence Collection

```typescript
async function executeTools(state: ReflexionState): Promise<Evidence[]> {
  const queries = extractQueriesFromCritique(state.critique);

  const results = await Promise.all(
    queries.map(q => searchTool.execute(q))
  );

  return results.map(r => ({
    url: r.url,
    content: r.snippet,
    relevance: scoreRelevance(r, state.critique)
  }));
}
```

---

## Alignment with User Constraints

### ✅ No LLM Training
Reflexion is entirely prompt-based. No fine-tuning, no RL, no weight updates. Perfect alignment with: "I am less interested in training LLMs. At least not the main engine one."

### ✅ TypeScript Preferred
LangGraph (the reference implementation framework) supports TypeScript natively. Can integrate with ContextForgeTS.

### ✅ Pre-trained Model Compatible
Works with any LLM that can follow structured prompts: GPT-4, Claude, Llama, Phi-3, etc.

### ✅ Tool Integration
Naturally works with MCP servers from Cline. Execute_tools node can call any MCP tool for evidence gathering.

---

## Integration Strategy for Galatea

### Phase 1: Basic Reflexion Loop
1. Implement three-node graph (draft → tools → revise)
2. Integrate with MCP tools for evidence gathering
3. Add structured critique prompts
4. Test on simple query-response tasks

### Phase 2: Subsystem Integration
1. Map Reflexion to metacognition subsystem
2. Store reflections in episodic memory
3. Use critique patterns for other subsystems (safety, trust)
4. Add reflection triggers (after errors, low confidence, user feedback)

### Phase 3: Curiosity Integration
1. Combine with WorldLLM: reflect on theory quality
2. Combine with Learning Progress: reflect on competence gaps
3. Use missing-content identification to drive exploration
4. Reflect on goal selection quality

### Phase 4: Advanced Patterns
1. Multi-depth reflection (shallow vs deep)
2. Cross-subsystem reflection coordination
3. Reflection memory (learn from past critiques)
4. Adaptive iteration limits based on task complexity

---

## Comparison with Other Approaches

| Approach | Training? | Grounding | Backtracking | Complexity |
|----------|-----------|-----------|--------------|------------|
| **Reflexion** | No | External | No | Low |
| **WorldLLM** | No | Experimental | No | Medium |
| **MAGELLAN** | Yes (RL) | Performance | No | High |
| **Tree of Thoughts** | No | Internal | Yes | Medium |
| **MCTS** | No | Rollouts | Yes | High |

**Reflexion Sweet Spot**: No training + external grounding + simple implementation. Trades off backtracking ability for straightforward integration.

---

## Recommended Use Cases in Galatea

### High-Value Applications

1. **Response Quality Improvement**
   - User query → draft → reflect → revise → deliver
   - Especially for complex, factual questions
   - Automatic citation generation

2. **Theory Refinement** (with WorldLLM)
   - Generate theory → test → reflect on failures → revise theory
   - Ground reflections in experimental outcomes
   - Iteratively improve world model

3. **Goal Quality Assurance** (with MAGELLAN)
   - Select goal → attempt → reflect on why LP is low → adjust strategy
   - Meta-learning without weight updates

4. **Safety Checking**
   - Generate action plan → reflect on risks → revise → verify → execute
   - Ground safety critique in rules and constraints
   - Audit trail for decisions

5. **Learning from Errors**
   - Error occurs → reflect on root cause → update procedural memory
   - Build episodic memory of mistakes and corrections
   - Improve without retraining

---

## Implementation Checklist

- [ ] Install LangGraph (TypeScript version)
- [ ] Implement three-node graph structure
- [ ] Create structured critique prompt templates
- [ ] Create evidence-based revision prompts
- [ ] Integrate MCP tools for evidence gathering
- [ ] Add iteration control logic
- [ ] Build state management (draft, critique, revision)
- [ ] Add citation extraction and validation
- [ ] Implement gap enumeration parser
- [ ] Connect to ContextForge zones (working memory for state)
- [ ] Add episodic memory storage for reflections
- [ ] Create metrics (iterations, improvement score, citation count)
- [ ] Build UI for reflection visualization
- [ ] Test with simple factual queries
- [ ] Extend to theory refinement (WorldLLM integration)
- [ ] Extend to goal reflection (MAGELLAN integration)

---

## Key Takeaways

1. **Simple Power**: Three nodes (draft/tools/revise) achieve significant quality gains
2. **No Training Needed**: Purely prompt-based, perfect for Galatea constraints
3. **Grounding Matters**: External evidence makes reflections constructive vs hallucinated
4. **Composable**: Works with MCP, WorldLLM, Learning Progress, preprompts
5. **TypeScript Ready**: LangGraph supports native TypeScript implementation
6. **Metacognition Core**: Natural fit for Galatea's metacognition subsystem
7. **Citation Culture**: Forces verifiability and trust-building
8. **Cost Consideration**: Multiple LLM calls per iteration - need smart iteration limits

---

## References

- **Paper**: Shinn, et al., 2023 - "Reflexion: Language Agents with Verbal Reinforcement Learning"
- **LangChain Blog**: https://www.blog.langchain.com/reflection-agents/
- **LangGraph Docs**: https://langchain-ai.github.io/langgraph/
- **Related**: Tree of Thoughts (Yao et al., 2023)
- **Related**: ReAct pattern (Yao et al., 2022)

---

*Deconstruction completed: 2026-02-01*
*Part of Galatea research series: 6/6 initial projects*
