# What Goes Where: CLAUDE.md, Skills, and Hooks

A practical guide to the three knowledge delivery mechanisms for AI coding agents, grounded in empirical research ([SkillsBench](https://arxiv.org/abs/2602.12670), [AGENTS.md evaluation](https://arxiv.org/abs/2602.11988)) and Galatea's architecture.

---

## The Three Mechanisms

When you want an AI coding agent to behave differently — follow a convention, avoid a mistake, use a specific pattern — you have three delivery channels. Each has different characteristics, and putting knowledge in the wrong channel either wastes tokens, gets ignored, or actively hurts performance.

| Mechanism | Enforcement | Audience | Persistence | Cost |
|-----------|------------|----------|-------------|------|
| **CLAUDE.md** | Probabilistic (agent may ignore) | The LLM's context window | Per-session (loaded at start) | Tokens (+20% inference cost) |
| **Skills** | Probabilistic (invoked on demand) | The LLM's context window | Loaded when relevant | Tokens (only when activated) |
| **Hooks** | Deterministic (code runs, blocks/allows) | The runtime, not the LLM | Always active | Near-zero (no tokens) |

---

## CLAUDE.md — Project Context File

### What It Is

A markdown file placed in the project root (or `.claude/CLAUDE.md`) that Claude Code loads into every session's context window. It's analogous to onboarding notes you'd give a new team member on their first day.

### What the Research Says

- **Curated, human-written context:** ~4% improvement on SWE benchmarks (AGENTS.md study). Sounds small, but on pass/fail tasks this is significant ROI for a text file.
- **LLM-generated context:** -3% (negative). Worse than nothing.
- **Comprehensive documentation:** -2.9pp (SkillsBench). Long files hurt performance.
- **Detailed/compact documentation:** +18.8pp (SkillsBench). Short, specific files help enormously.
- **Inference cost:** >20% increase from loading context files. Every line costs tokens.

### What Goes Here

**YES — put in CLAUDE.md:**

1. **Architecture overview (3-5 sentences).** Where is the project headed? What's the mental model? The agent compares vision against reality and pulls toward alignment. This is the GBintz "1,800 autonomous PRs" pattern.
   ```markdown
   ## Architecture
   Galatea is an autonomous AI agent that owns its own cognitive loop.
   Coding execution is delegated to pluggable adapters (currently Claude Code SDK).
   The homeostasis engine monitors 7 psychological dimensions to maintain balance.
   ```

2. **Project conventions that aren't obvious from code.** Things the agent would waste context figuring out:
   ```markdown
   ## Conventions
   - Package manager: pnpm (not npm or yarn)
   - Test framework: Vitest, test files in __tests__/ directories
   - API framework: h3/Nitro (not Express)
   - Database: PostgreSQL via Drizzle ORM
   ```

3. **Failure-driven guardrails.** Specific lessons from when the agent failed. These are the highest-value entries because they address non-obvious pitfalls the model can't infer:
   ```markdown
   ## Guardrails
   - engine/types.ts contains shared safety types used across modules. Extend, never overwrite.
   - Subagents may commit without creating files. Verify file existence after subagent runs.
   ```

**NO — do NOT put in CLAUDE.md:**

- Things the model already knows (how to write TypeScript, how git works, what REST is)
- Exhaustive lists of facts about the codebase (the model can read code)
- Preferences that can't be verified ("write clean code", "be careful")
- Rules that should be enforced deterministically (put in hooks instead)
- Long procedures (put in skills instead)

### Size Budget

**Target: under 200 lines.** The research is unambiguous: compact beats comprehensive. Every line you add dilutes the impact of every other line and costs tokens. If your CLAUDE.md is growing past 200 lines, you're putting things in the wrong channel.

### Galatea's Role

In Galatea's architecture, the **slow loop** generates CLAUDE.md from curated knowledge store entries. The knowledge store has decay, confidence scoring, and supersession — entries that don't prove useful lose confidence and fall out. Only entries that:
- Pass confidence threshold (>= 0.90)
- Are curated by a human (or originate from a verified failure)
- Don't overlap with model priors
- Aren't enforceable deterministically

...make it into the generated CLAUDE.md.

The homeostasis engine's `knowledge_sufficiency` dimension monitors whether the agent has enough context. If knowledge is low, the system can flag that CLAUDE.md may need updating.

---

## Skills — Reusable Procedural Knowledge

### What They Are

Standalone markdown files (in `.claude/skills/`) that encode step-by-step procedures for specific tasks. Unlike CLAUDE.md, skills are loaded *on demand* — only when the agent (or user) decides they're relevant. This is their key advantage: they don't burn tokens in every session.

### What the Research Says

- **Curated skills:** +16.2pp average improvement across all domains (SkillsBench).
- **2-3 focused skills:** +18.6pp. The sweet spot.
- **4+ skills:** +5.9pp. Diminishing returns — skills start conflicting.
- **Self-generated skills:** -1.3pp (negative). LLMs can't reliably write their own procedures.
- **SWE domain specifically:** +4.5pp. Lowest of all 11 domains because models already have strong coding priors.
- **Smaller model + skills > larger model without:** Haiku + skills (27.7%) outperformed Opus without skills (22.0%).

### What Goes Here

**YES — put in skills:**

1. **Project-specific multi-step procedures** that the model can't infer from code:
   ```markdown
   # Deploying to Staging
   1. Run pnpm build
   2. Run database migrations: pnpm drizzle-kit push
   3. Copy .env.staging to .env
   4. Start with: pnpm start
   5. Verify health check at /api/health
   ```

2. **Complex workflows with decision points:**
   ```markdown
   # Reviewing a Pull Request
   1. Check test coverage: all new functions must have tests
   2. Check for safety: no direct DB access outside repository layer
   3. Check conventions: pnpm, h3 routing, Drizzle queries
   4. If touching homeostasis-engine.ts: verify all 7 dimensions still assessed
   ```

3. **Domain-specific knowledge the model lacks:** This is where skills provide the most value — SkillsBench showed +51.9pp in healthcare. For SWE, this means project-specific domain knowledge, not generic coding patterns.

**NO — do NOT put in skills:**

- Generic coding procedures ("how to write a unit test", "how to make an API call")
- Single-line rules (those go in CLAUDE.md guardrails)
- Enforcement policies (those go in hooks)
- Anything the model would do correctly without guidance

### Size Budget

**Each skill: under 100 lines. Total skills: 2-3 maximum.**

The SkillsBench finding is clear: beyond 3 skills, guidance starts conflicting with itself and with the model's priors. Quality over quantity.

### Galatea's Role

The slow loop extracts procedures from successful work arcs and proposes them as skill candidates. A **ranking score** determines which make the cut:

```
Score = confidence * (1 - priorOverlap) * failureWeight
```

- **confidence** — from the knowledge store's decay/reinforcement cycle
- **priorOverlap** — estimated probability the model already knows this (high for generic SWE, low for project-specific workflows)
- **failureWeight** — 2x for entries originating from a failed-then-succeeded pattern

Only the top 2-3 by score get generated as skill files. If a skill isn't referenced in work arc transcripts after 3 sessions, it decays out and the slot opens.

The homeostasis engine's `knowledge_application` dimension monitors whether learned knowledge is being used versus sitting idle.

---

## Hooks — Deterministic Runtime Enforcement

### What They Are

Code that runs before or after agent tool calls, enforcing constraints at the runtime level. In Claude Code's architecture, these are PreToolUse and PostToolUse callbacks. In Galatea, they're wired through `checkToolCallSafety()` in the homeostasis engine.

Hooks are fundamentally different from CLAUDE.md and skills: they don't add tokens to the context window. They execute as code. The agent doesn't need to "remember" the rule — the runtime enforces it.

### What the Research Says

The HN discussion surfaced a recurring finding: **agents systematically ignore CLAUDE.md instructions.** Multiple practitioners reported explicit rules being violated:

> "Agent replaced sqlite with MariaDB despite explicit instructions against such assumptions. Three lines of cautionary instructions in AGENTS.md had no effect." — Avhception

> "Migrated rules to deterministic compiler-based checks (AST analysis, pre-commit hooks) that force agent compliance rather than relying on instruction adherence." — Tomashubelbauer

This parallels human team dynamics: guardrails and system design prevent mistakes more reliably than rules posted on the wall.

### What Goes Here

**YES — enforce with hooks:**

1. **Safety constraints — workspace boundaries:**
   ```typescript
   // PreToolUse: block writes outside working directory
   if (toolPath && !toolPath.startsWith(workingDirectory)) {
     return { decision: "deny", reason: "Path outside workspace" }
   }
   ```

2. **Protected resource rules:**
   ```typescript
   // PreToolUse: block push to protected branches
   const PROTECTED = ["main", "master", "production", "release"]
   if (isBranchPush(command) && PROTECTED.includes(branch)) {
     return { decision: "deny", reason: "Protected branch" }
   }
   ```

3. **Destructive command patterns:**
   ```typescript
   // PreToolUse: block rm -rf, force push, DROP TABLE, etc.
   if (DESTRUCTIVE_PATTERNS.some(p => p.test(command))) {
     return { decision: "deny", reason: "Destructive pattern" }
   }
   ```

4. **Any rule with binary enforcement** ("always X", "never Y") where the compliance check can be expressed in code.

**NO — do NOT put in hooks:**

- Soft preferences ("prefer functional style" — can't be detected reliably)
- Architectural guidance ("use the repository pattern" — too broad for a boolean check)
- Domain knowledge ("patients must have valid IDs" — belongs in business logic, not hooks)

### Galatea's Role

Galatea's homeostasis engine provides `checkToolCallSafety()` — a synchronous safety check that runs before every tool call during a coding session. The trust level system modulates decisions:

| Trust Level | Destructive action | Result |
|-------------|-------------------|--------|
| ABSOLUTE | rm -rf | allow (trusted fully) |
| HIGH | rm -rf | ask (escalate to human) |
| MEDIUM | rm -rf | deny (block) |
| LOW | rm -rf | deny (block) |
| NONE | rm -rf | deny (block) |

The `self_preservation` dimension of the homeostasis assessment provides the Layer 1 (message-level) version of this check, while `checkToolCallSafety()` provides the Layer 2 (tool-call-level) version.

**The rule-to-hook conversion pipeline:** When the knowledge extractor identifies a rule that matches a tool-constraint pattern ("never/don't + tool action"), it should be converted into a `checkToolCallSafety()` pattern rather than a CLAUDE.md entry. The knowledge entry gets marked `enforcedBy: "hook"` and is excluded from artifact generation.

---

## Decision Flowchart

When you have a piece of knowledge to encode, ask:

```
Can it be enforced as a boolean check on tool calls?
├── YES → Hook (deterministic, zero tokens, always active)
└── NO
    Is it a multi-step procedure (>5 steps)?
    ├── YES → Skill file (loaded on demand, saves tokens)
    └── NO
        Is it non-obvious to the model?
        ├── YES → CLAUDE.md (compact, curated, always loaded)
        └── NO → Don't encode it (the model already knows)
```

---

## Anti-Patterns

| Anti-pattern | Why it fails | What to do instead |
|-------------|-------------|-------------------|
| Dump all knowledge into CLAUDE.md | Comprehensive docs: -2.9pp (SkillsBench) | Keep under 200 lines, curate ruthlessly |
| LLM-generate the context file | Self-generated: -1.3pp to -3% | Human curation, or failure-driven extraction |
| Duplicate rules across channels | Conflicting guidance causes errors | Each rule lives in exactly one channel |
| Write skills for things models know | SWE domain only +4.5pp; priors conflict | Only encode non-obvious project-specific knowledge |
| Put "don't do X" in CLAUDE.md | Agents ignore instructions | Convert to a PreToolUse hook |
| Create 10 skill files | 4+ skills: +5.9pp vs 2-3: +18.6pp | Cap at 2-3, rank by impact |
| Write once, never validate | No feedback = no learning | Track whether entries improve outcomes |

---

## Summary

| Channel | What | When | How much | Enforcement |
|---------|------|------|----------|-------------|
| **CLAUDE.md** | Architecture, conventions, failure guardrails | Every session | < 200 lines | Probabilistic |
| **Skills** | Multi-step project-specific procedures | On demand | 2-3 files, < 100 lines each | Probabilistic |
| **Hooks** | Safety constraints, binary rules | Every tool call | Unlimited (code, not tokens) | Deterministic |

The research is clear: **less context, better curated, deterministically enforced where possible.** The value of CLAUDE.md and skills is real but narrow — it comes from non-obvious, project-specific knowledge that the model can't infer from code. Everything else is noise that costs tokens and may hurt performance.
