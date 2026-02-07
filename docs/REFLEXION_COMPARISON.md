# Reflexion Implementation Comparison

**Date**: 2026-02-07
**Implementation**: Phase 3 Stage C
**Reference**: docs/research/06-reflexion-deconstruction.md (Shinn et al., 2023)

---

## Executive Summary

Our Stage C implementation captures the **core mechanics** of Reflexion (Draft → Critique → Revise loop) but differs in **architecture pattern** and **critique structure**. We use a **class-based approach** instead of a **graph-based approach**, and our critique is **simpler** (issues list) vs the research's **structured taxonomy** (superfluous/missing/unsupported).

**Verdict**: ✅ Core concept preserved, implementation simplified for Phase 3 scope.

---

## Architecture Comparison

### Research Pattern (LangGraph)

```typescript
// Three-node graph with state flow
const workflow = new StateGraph<ReflexionState>()
  .addNode("draft", generateDraft)
  .addNode("execute_tools", executeTools)
  .addNode("revise", reviseWithReflection)
  .addEdge("draft", "execute_tools")
  .addEdge("execute_tools", "revise")
  .addConditionalEdges("revise", shouldContinue, {
    continue: "execute_tools",
    end: END
  });
```

**Characteristics**:
- Graph-based state machine
- Explicit node separation
- Conditional routing
- Stateful edges
- Framework-dependent (LangGraph)

### Our Implementation (Class-based)

```typescript
// Single class with execute() method
class ReflexionLoop {
  async execute(task, context, maxIterations) {
    for (let i = 0; i < maxIterations; i++) {
      draft = await this._generateInitialDraft(task, context)
      evidence = await this._gatherEvidence(task, draft, context)
      critique = await this._generateCritique(task, draft, evidence)

      if (critique.passes) return { final_draft: draft, success: true }

      draft = await this._reviseDraft(task, context, draft, critique)
    }
    return { final_draft: draft, success: false }
  }
}
```

**Characteristics**:
- Class-based with private methods
- Loop-based flow control
- Imperative style
- Framework-agnostic
- Simpler to test in isolation

**Trade-offs**:
- ✅ Simpler to understand and test
- ✅ No framework dependency
- ✅ Easier to modify flow logic
- ❌ Less composable with other graphs
- ❌ No visual graph representation
- ❌ Harder to add parallel branches

---

## State Structure Comparison

### Research State

```typescript
interface ReflexionState {
  query: string;                    // User question
  draft: string;                    // Current response
  search_results: Array<{           // External evidence
    url: string;
    content: string;
  }>;
  critique: {                       // Structured critique
    superfluous: string[];          // What to remove
    missing: string[];              // What to add
  };
  revision: string;                 // Improved version
  iteration: number;                // Loop counter
}
```

**Critique Structure**: Taxonomy-based (superfluous vs missing)

### Our State

```typescript
// Stored in ReflexionIteration
interface ReflexionIteration {
  iteration_number: number;
  draft: string;
  evidence: Evidence[];             // source, content, relevance
  critique: Critique;               // issues[], confidence, passes
  revised: boolean;
}

interface Critique {
  issues: Issue[];                  // Generic issue list
  confidence: number;               // 0-1
  passes: boolean;                  // Quality gate
}

interface Issue {
  type: "missing" | "unsupported" | "incorrect";
  description: string;
  severity: "minor" | "major" | "critical";
  suggested_fix?: string;
}
```

**Critique Structure**: Issue-based (flat list with types)

**Trade-offs**:

| Aspect | Research | Our Implementation |
|--------|----------|-------------------|
| **Specificity** | High (superfluous vs missing) | Medium (generic issues) |
| **Extensibility** | Fixed categories | Flexible issue types |
| **Clarity** | Very clear what to do | Requires interpretation |
| **Citations** | Explicit tracking | Not yet implemented |
| **Complexity** | More complex prompts | Simpler prompts |

---

## Evidence Gathering Comparison

### Research Approach

```typescript
// Execute_tools node: gather external evidence
async function executeTools(state: ReflexionState): Promise<Evidence[]> {
  const queries = extractQueriesFromCritique(state.critique);

  const results = await Promise.all(
    queries.map(q => searchTool.execute(q))  // MCP tools, web search, APIs
  );

  return results.map(r => ({
    url: r.url,
    content: r.snippet,
    relevance: scoreRelevance(r, state.critique)
  }));
}
```

**Sources**: Web search, APIs, MCP tools (external grounding)

### Our Implementation (Stage C)

```typescript
// Placeholder for Stage E integration
private async _gatherEvidence(
  _task: Task,
  _draft: string,
  _context: AgentContext,
): Promise<Evidence[]> {
  // TODO: In Stage C3, implement actual evidence gathering
  return [
    {
      source: "memory",
      content: "Placeholder evidence from memory",
      relevance: 0.8,
      supports_claim: "Retrieved from agent context",
    },
  ];
}
```

**Sources**: Memory-only placeholder (internal grounding)

**Status**: ⚠️ **Deferred to Stage E** - Current implementation returns placeholder evidence

**Trade-offs**:
- ✅ Stage C focuses on loop mechanics, not evidence quality
- ✅ Enables testing without external dependencies
- ❌ Missing external grounding (key Reflexion advantage)
- ❌ No web search, MCP tools, or API integration yet

---

## Critique Prompt Comparison

### Research Pattern

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

**Structure**: 3-part taxonomy (superfluous/missing/unsupported)
**Grounding**: Explicit evidence references with URLs
**Output**: Structured lists

### Our Implementation (Stage C)

```typescript
// Placeholder for Stage E integration
private async _generateCritique(
  _task: Task,
  _draft: string,
  _evidence: Evidence[],
): Promise<Critique> {
  // TODO: In Stage E, replace with actual LLM call
  return {
    issues: [],
    confidence: 0.9,
    passes: true,
  };
}
```

**Status**: ⚠️ **Deferred to Stage E** - Current implementation returns placeholder that always passes

**Trade-offs**:
- ✅ Type structure ready for detailed critiques
- ✅ Flexible Issue[] allows multiple critique strategies
- ❌ Missing prompt engineering for quality critiques
- ❌ No citation extraction yet
- ❌ No gap enumeration logic

---

## Revision Prompt Comparison

### Research Pattern

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

**Characteristics**:
- Clear action items (remove X, add Y)
- Citation requirements explicit
- Evidence directly provided
- Verifiable improvements

### Our Implementation (Stage C)

```typescript
// Placeholder for Stage E integration
private async _reviseDraft(
  task: Task,
  _context: AgentContext,
  _previousDraft: string,
  critique: Critique,
): Promise<string> {
  // TODO: In Stage E, replace with actual LLM call
  const issueDescriptions = critique.issues
    .map((issue) => `- ${issue.type}: ${issue.description}`)
    .join("\n");

  return `[REVISED DRAFT] Response to: ${task.message}\n\nAddressing issues:\n${issueDescriptions}\n\nPlaceholder revision...`;
}
```

**Status**: ⚠️ **Deferred to Stage E** - Placeholder shows issue list but doesn't actually revise

**Trade-offs**:
- ✅ Issue-based revision structure ready
- ✅ Can incorporate suggested_fix from Issue type
- ❌ No actual revision logic yet
- ❌ No citation generation
- ❌ No evidence incorporation

---

## Exit Conditions Comparison

### Research Pattern

```typescript
function shouldContinue(state: ReflexionState): "continue" | "end" {
  // Max iterations check
  if (state.iteration >= MAX_ITERATIONS) {
    return "end";
  }

  // Quality threshold check (both categories empty = done)
  if (state.critique.missing.length === 0 &&
      state.critique.superfluous.length === 0) {
    return "end";
  }

  // Convergence check (draft unchanged = stuck)
  if (state.revision === state.draft) {
    return "end";
  }

  return "continue";
}
```

**Exit Triggers**:
1. Max iterations reached
2. No issues found (quality pass)
3. Draft unchanged (convergence)

### Our Implementation

```typescript
// Inside execute() loop
if (critique.passes) {
  return {
    final_draft: currentDraft,
    iterations,
    total_llm_calls: totalLlmCalls,
    success: true,
  };
}

if (i === maxIterations - 1) {
  return {
    final_draft: currentDraft,
    iterations,
    total_llm_calls: totalLlmCalls,
    success: false,
  };
}
```

**Exit Triggers**:
1. Max iterations reached
2. Critique passes (boolean flag)

**Missing**:
- ❌ No convergence detection (draft unchanged)
- ❌ No issue count threshold
- ❌ No severity-based early exit

**Trade-offs**:
- ✅ Simpler exit logic
- ✅ Clear success/failure distinction
- ❌ May waste iterations if stuck

---

## Key Differences Summary

| Feature | Research (Shinn et al.) | Our Implementation (Stage C) | Status |
|---------|------------------------|------------------------------|--------|
| **Architecture** | LangGraph state machine | Class with loop | Different but equivalent |
| **Critique Structure** | Superfluous/Missing/Unsupported | Issue[] with types | Simpler, extensible |
| **Evidence Sources** | Web search, MCP tools, APIs | Memory placeholder | ⚠️ Deferred to Stage E |
| **Citation Tracking** | Explicit URLs + citations | Not implemented | ⚠️ Deferred to Stage E |
| **Grounding** | External (search results) | Internal (memory only) | ⚠️ Deferred to Stage E |
| **Prompts** | Research-quality templates | Placeholders | ⚠️ Deferred to Stage E |
| **Exit Conditions** | 3 triggers (max/quality/converge) | 2 triggers (max/quality) | Missing convergence check |
| **Gap Enumeration** | Explicit missing[] list | Generic Issue type:missing | Similar concept |
| **Iteration Tracking** | State.iteration | ReflexionIteration[] | More detailed tracking |
| **LLM Calls** | 15+ per 5 iterations | 2 per iteration (placeholder) | Same cost model |

---

## Alignment Analysis

### ✅ Core Concepts Preserved

1. **Draft → Critique → Revise Loop**: ✅ Implemented
2. **Iterative Improvement**: ✅ Implemented
3. **Max Iterations**: ✅ Implemented (default: 3)
4. **Quality Gate**: ✅ Implemented (critique.passes)
5. **Trace Storage**: ✅ Implemented (iterations[])
6. **LLM Call Tracking**: ✅ Implemented (total_llm_calls)

### ⚠️ Deferred to Stage E

1. **External Grounding**: Evidence from web search, MCP tools, APIs
2. **Citation Generation**: Explicit [source] tracking
3. **Structured Critique**: Superfluous/Missing/Unsupported taxonomy
4. **Actual LLM Integration**: Draft, critique, and revision prompts
5. **Convergence Detection**: Draft unchanged check

### ❌ Architectural Differences (By Design)

1. **Graph vs Class**: We chose class-based for simplicity
2. **Framework Independence**: No LangGraph dependency
3. **Critique Schema**: Issue[] vs taxonomy (extensible design)

---

## Why These Differences Exist

### Design Philosophy

**Research Focus**: Production-ready Reflexion with full external grounding
**Our Focus**: Stage C = Loop mechanics + infrastructure, Stage E = LLM integration

**Reasoning**:
1. **Separation of Concerns**: Loop logic (Stage C) separate from LLM calls (Stage E)
2. **Testability**: Can test loop mechanics without LLM/search dependencies
3. **Parallel Development**: Stages D-E can proceed while C is complete
4. **Cost Control**: Placeholders avoid expensive LLM calls during development

### Technical Constraints

**Research Environment**: LangGraph framework, production LLM access
**Our Environment**: Phase 3 implementation, placeholder-first approach

**Practical Considerations**:
1. Stage C delivers loop infrastructure
2. Stage E integrates actual LLM calls (HomeostasisEngine, ActivityRouter, ReflexionLoop)
3. External tools (MCP, web search) integrated in Stage E
4. Citation tracking added when LLM prompts finalized

---

## Implementation Roadmap

### Stage C (Complete) ✅

- [x] Loop structure (for loop with max iterations)
- [x] Draft generation method stub
- [x] Evidence gathering method stub
- [x] Critique generation method stub
- [x] Revision method stub
- [x] Exit conditions (max iterations, critique passes)
- [x] Iteration tracking
- [x] LLM call counting
- [x] Type definitions (ReflexionResult, ReflexionIteration, Critique, Evidence, Issue)
- [x] 24 comprehensive tests

### Stage E (Planned) 🔜

- [ ] Replace _generateInitialDraft() with actual LLM call
- [ ] Implement evidence gathering from memory + optional web search
- [ ] Replace _generateCritique() with structured LLM prompt
- [ ] Implement superfluous/missing/unsupported detection
- [ ] Replace _reviseDraft() with evidence-based revision prompt
- [ ] Add citation extraction and tracking
- [ ] Add convergence detection (draft unchanged)
- [ ] Integrate with MCP tools for evidence gathering
- [ ] Add severity-based early exit
- [ ] Implement citation validation

### Future Enhancements (Phase 4+) 📅

- [ ] Multi-depth reflection (shallow vs deep)
- [ ] Episodic memory storage for reflections
- [ ] Cross-subsystem reflection coordination
- [ ] Adaptive iteration limits based on task complexity
- [ ] Reflection quality metrics (improvement score, citation count)
- [ ] UI visualization of reflection trace

---

## Recommendations

### Keep Current Approach ✅

1. **Class-based architecture**: Simpler, testable, framework-agnostic
2. **Issue[] critique model**: Extensible for future critique types
3. **Placeholder pattern**: Enables staged implementation
4. **Comprehensive tests**: 24 tests cover all edge cases

### Enhancements for Stage E 🔧

1. **Add Structured Critique**: Implement superfluous/missing/unsupported as Issue subtypes
   ```typescript
   type IssueType = "missing" | "unsupported" | "incorrect" | "superfluous"
   ```

2. **Implement Citation Tracking**: Add citation field to revised drafts
   ```typescript
   interface RevisedDraft {
     content: string
     citations: Array<{ claim: string; source: string; url: string }>
   }
   ```

3. **Add Convergence Detection**: Check if revision === previousDraft
   ```typescript
   if (currentDraft === iterations[i-1]?.draft) {
     return { final_draft: currentDraft, success: false, reason: "converged" }
   }
   ```

4. **External Evidence**: Integrate searchFacts() from Graphiti, MCP tools
   ```typescript
   private async _gatherEvidence(task, draft, context) {
     const memoryEvidence = await graphitiClient.searchFacts(draft)
     const toolEvidence = await mcpTools.search(extractQueries(draft))
     return [...memoryEvidence, ...toolEvidence]
   }
   ```

5. **Prompt Engineering**: Use research prompts for critique and revision
   - See lines 109-148 in 06-reflexion-deconstruction.md

---

## Conclusion

### Verdict: ✅ Solid Foundation, Ready for Stage E Integration

**What We Have**:
- ✅ Core loop mechanics working
- ✅ Proper exit conditions
- ✅ Comprehensive iteration tracking
- ✅ Extensible type system
- ✅ 24 passing tests
- ✅ Framework-agnostic design

**What We're Missing (By Design)**:
- External evidence gathering (deferred to Stage E)
- Citation tracking (deferred to Stage E)
- Actual LLM integration (deferred to Stage E)
- Structured critique prompts (deferred to Stage E)

**Alignment Score**: **8/10**
- Loop concept: 10/10 ✅
- Exit conditions: 7/10 (missing convergence)
- Critique structure: 7/10 (simpler than research)
- Evidence grounding: 5/10 (placeholder only)
- Architecture: 9/10 (different but better for our needs)

**Overall Assessment**: Our Stage C implementation captures the **essence of Reflexion** (iterative self-improvement through critique) while making practical trade-offs for our development approach. The placeholder pattern enables us to test loop mechanics now and add LLM integration in Stage E without refactoring the core structure.

**Next Steps**: Complete Stages D-E, then enhance with research patterns (citations, external evidence, structured critiques).

---

**Comparison completed**: 2026-02-07
**Reviewer**: Based on Shinn et al., 2023 + LangChain implementation
**Implementation**: Phase 3 Stage C (reflexion-loop.ts)
