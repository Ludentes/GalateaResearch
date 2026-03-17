# Research: SkillsBench + AGENTS.md Effectiveness

**Date:** 2026-02-24
**Sources:**
- [SkillsBench paper (arxiv 2602.12670)](https://arxiv.org/abs/2602.12670)
- [HN discussion on AGENTS.md evaluation](https://news.ycombinator.com/item?id=47034087)
- Related: [Evaluating AGENTS.md (arxiv 2602.11988)](https://arxiv.org/abs/2602.11988)

---

## SkillsBench: Key Findings

**Setup:** 86 tasks, 11 domains, 7 agent-model configs, 7,308 execution trajectories. Tested curated skills vs. no skills vs. self-generated skills.

### Curated Skills: +16.2pp average improvement

| Domain | No Skills | With Skills | Delta |
|--------|-----------|-------------|-------|
| Healthcare | 34.2% | 86.1% | +51.9pp |
| Manufacturing | 1.0% | 42.9% | +41.9pp |
| Cybersecurity | 20.8% | 44.0% | +23.2pp |
| Natural Science | 23.1% | 44.9% | +21.9pp |
| Energy | 29.5% | 47.5% | +17.9pp |
| Office & White Collar | 24.7% | 42.5% | +17.8pp |
| Finance | 12.5% | 27.6% | +15.1pp |
| Media & Content | 23.8% | 37.6% | +13.9pp |
| Robotics | 20.0% | 27.0% | +7.0pp |
| Mathematics | 41.3% | 47.3% | +6.0pp |
| **Software Engineering** | **34.4%** | **38.9%** | **+4.5pp** |

### Self-Generated Skills: -1.3pp average (negative!)

Only Opus 4.6 showed modest improvement (+1.4pp). All others flat or negative.

### Model Comparison

| Configuration | No Skills | With Skills | Self-Generated |
|---------------|-----------|-------------|----------------|
| Gemini CLI + Gemini 3 Flash | 31.3% | 48.7% | N/A |
| Claude Code + Opus 4.5 | 22.0% | 45.3% | 21.6% |
| Codex + GPT-5.2 | 30.6% | 44.7% | 25.0% |
| Claude Code + Opus 4.6 | 30.6% | 44.5% | 32.0% |
| Gemini CLI + Gemini 3 Pro | 27.6% | 41.2% | N/A |
| Claude Code + Sonnet 4.5 | 17.3% | 31.8% | 15.2% |
| Claude Code + Haiku 4.5 | 11.0% | 27.7% | 11.0% |

### Design Factors

- **Optimal skill count:** 2-3 skills (+18.6pp); 4+ skills shows diminishing returns (+5.9pp)
- **Optimal complexity:** Detailed/compact (+18.8pp); comprehensive documentation (-2.9pp!)
- **Model scale compensation:** Haiku + Skills (27.7%) > Opus without Skills (22.0%)

### Why Skills Help (or Hurt)

- **High-benefit domains:** Specialized procedural knowledge missing from pretraining (healthcare, manufacturing)
- **Low-benefit domains:** Strong model priors already (math, SWE); skills add overhead or conflict
- **16 of 84 tasks showed negative deltas** — skills can introduce conflicting guidance
- Skills close "procedural gaps" best for tasks dependent on steps/constraints/sanity checks, NOT conceptual knowledge

---

## HN Discussion: AGENTS.md Evaluation (arxiv 2602.11988)

### The Study's Finding

Developer-written AGENTS.md files: ~4% average improvement, inconsistent across models (Sonnet 4.5 showed 2% drops).
LLM-generated AGENTS.md: ~3% decrease (negative effect).
Inference cost increase: >20% from context files.

### Key Community Insights

**"4% is actually massive" (Deaux):** A simple markdown file giving 4% on pass/fail benchmarks is huge ROI. The issue is LLM-generated files document obvious things; useful AGENTS.md captures non-obvious tribal knowledge from observing agent failures.

**Quality vs. success rate (Vidarh):** Binary task success misses the real value — preventing stupid mistakes that require expensive refactoring. Agent harnesses increase token costs but save developer time.

**Real projects benefit more (SerCe):** Large projects gain significantly because agents waste half their context navigating repo structure without guidance.

**Empirical validation method (Pamelafox):** Only add context when agents fail specific tasks, then revert and re-test. Target documentation to actual pain points.

**Post-hoc over upfront (Prodigycorp):** Don't generate instructions before learning. Solicit updates after the agent learns. Keep files short (~200 lines), focus on durable generalizable lessons.

**Instructions get ignored (Tomashubelbauer, Avhception):** Explicit AGENTS.md instructions are systematically ignored. Better to enforce via deterministic checks (AST analysis, pre-commit hooks, CI) than rely on instruction adherence.

**AGENTS.md vs CONTRIBUTING.md (Rmnclmnt, Kkapelon):** Good human-focused documentation serves agents equally well. Agents should auto-ingest standard repo files, not require specialized formats.

**Production at scale (GBintz):** 1,800+ autonomous PRs, 90% human-loop-free using AGENTS.md as architectural vision documents. Agents compare vision against reality and pull toward alignment.

---

## Synthesis: Both Papers Together

1. **Curated skills help significantly (+16pp avg) but SWE is the weakest domain (+4.5pp)** — models already know how to code, so procedural guidance competes with strong priors
2. **Self-generated skills are useless or harmful** — models can't reliably author their own procedural guidance
3. **Less is more:** 2-3 focused skills > comprehensive documentation; compact > verbose
4. **The value is in non-obvious knowledge:** Skills close procedural gaps for things the model can't infer from code alone
5. **Instruction following is unreliable:** Deterministic enforcement (hooks, CI, pre-commit) beats prompting for compliance
6. **Smaller models + good skills > larger models without** — democratizes capability
