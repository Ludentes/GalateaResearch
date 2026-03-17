# WorldLLM Deconstruction

**Project:** https://github.com/flowersteam/WorldLLM
**Paper:** https://arxiv.org/abs/2506.06725
**Analysis Date:** 2026-02-01
**Category:** Research-oriented curiosity-driven world modeling (NO TRAINING)
**Authors:** Flowers team (INRIA/Sorbonne) - Same team as MAGELLAN

---

## Executive Summary

WorldLLM is a **training-free framework** for improving LLM world modeling through **natural language hypotheses** and **curiosity-driven exploration**. Unlike MAGELLAN (which uses RL to train the LLM), WorldLLM achieves improvement purely through **in-context learning** - adding theories to prompts and testing them. This directly addresses your requirement: **curiosity without training the main LLM**.

**Key Insight:** You can improve an LLM's predictions by **iteratively generating theories, testing them, and updating the prompt** - no gradient updates needed. The LLM becomes smarter through better prompts, not better weights.

---

## Architecture Mapping to Galatea's 3 Layers

### Layer 1: LLM Foundation ✅✅✅ Excellent (No Training!)
**WorldLLM Implementation:**
- Uses **pre-trained LLMs unchanged** (Phi-3, Llama, etc.)
- Optional 4-bit quantization for efficiency
- Separate LLMs for Theorist and Statistician (or shared)
- **Zero gradient updates** - pure in-context learning

**Galatea Fit:**
- ✅✅✅ **Perfect match** - no training required!
- ✅ Works with any Hugging Face model
- ✅ Can use same LLM for multiple roles
- ✅ Quantization for cost efficiency

### Layer 2: Context & Memory Management ⭐⭐⭐⭐ (Prompt-Based)
**WorldLLM Implementation:**
- **Theories in prompts** - natural language hypotheses
- **Trajectory memory** - collected experiences
- **Discovered transitions** - track what's been explored
- **Bayesian belief state** - probability distribution over theories

**Galatea Fit:**
- ✅✅✅ **Theories as knowledge** - store in PERMANENT/STABLE zones
- ✅ **Trajectory memory** → Episodic memory pattern
- ✅ **Belief updating** → Metacognitive confidence tracking
- ⚠️ Still need general memory architecture for conversations

**Pattern to Extract:**
- ✅ **Hypotheses in PERMANENT zone** (core beliefs about user)
- ✅ **Evidence in STABLE zone** (supporting/refuting data)
- ✅ **Current theories in working context** (active hypotheses)

### Layer 3: Psychological Subsystems ⭐⭐⭐⭐ (Scientific Method)
**WorldLLM Implementation:**
- **Scientist** - Generates hypotheses (Bayesian inference)
- **Experimenter** - Tests hypotheses (curiosity-driven exploration)
- **Statistician** - Evaluates predictions (likelihood scoring)

**Galatea Fit:**
- ✅ **Scientist** → Learning Discovery, Theory Formation
- ✅ **Experimenter** → Curiosity Engine (exploration)
- ✅ **Statistician** → Metacognitive Support (self-evaluation)
- ❌ Still missing other 59 subsystems

---

## What WorldLLM Does Well

### 1. Natural Language Hypotheses (No Training!) ⭐⭐⭐⭐⭐
**The Core Innovation:**

Instead of training the LLM, **add theories to the prompt**:

```python
# Traditional approach (requires training):
fine_tune(model, data)  # Gradient updates

# WorldLLM approach (no training):
prompt = f"""
Given these theories about the world:
1. {theory_1}
2. {theory_2}

Predict what happens next:
{state_action_pair}
"""
```

**Example:**
```
System: You are predicting outcomes in a gridworld.

Current theories:
- "Doors can only be opened if you have the matching key"
- "Keys disappear after opening a door"
- "Walking into walls has no effect"

State: Agent at (2,3), has blue key, facing blue door
Action: Move forward

Predicted outcome:
```

**Why This Works:**
- LLM uses theories as context for predictions
- Better theories → better predictions
- No weight updates needed!

**Patterns to Adopt:**
```typescript
// Galatea: User understanding theories in prompt
interface UserTheory {
  theory: string
  evidence_count: number
  confidence: number
  last_tested: Date
}

const user_theories: UserTheory[] = [
  {
    theory: "User prefers concrete examples over abstract explanations",
    evidence_count: 12,
    confidence: 0.85,
    last_tested: new Date('2026-02-01')
  },
  {
    theory: "User loses interest in topics after 10 minutes",
    evidence_count: 5,
    confidence: 0.6,
    last_tested: new Date('2026-01-28')
  }
]

const prompt = `
System: You are Galatea, talking to a user.

Current theories about this user:
${user_theories.map(t => `- ${t.theory} (confidence: ${t.confidence})`).join('\n')}

User message: "${user_message}"

Respond based on these theories:
`
```

**Galatea Application:**
- Store theories about user in PERMANENT zone
- Update theories based on interactions (no LLM training!)
- Use theories in every prompt for personalization

### 2. Bayesian Theory Updating (Metropolis-Hastings) ⭐⭐⭐⭐⭐
**How It Works:**

1. **Start with initial theories** (random or seeded)
2. **Score theories** by likelihood on observed data
3. **Propose new theories** (LLM generates variants)
4. **Accept/reject** based on Metropolis-Hastings criterion
5. **Repeat** - converge to better theories

```python
# From metropolis_hastings.py
def metropolis_hastings(env, experimenter, theorist, statistician, cfg):
    # 1. Generate initial theories
    theories = generate_rules(theorist, trajectories, cfg["nb_rules"])

    # 2. Score theories on observed data
    likelihoods = compute_likelihood(statistician, theories, trajectories)

    best_theory = theories[np.argmax(likelihoods)]

    # 3. Iterative improvement
    for phase in range(cfg["nb_phases"]):
        # Explore environment with curiosity
        new_trajectories = experimenter.explore(env, current_theories)

        # Evolve theories (LLM proposes variants)
        new_theories = evolve_rules(theorist, theories, worst_trajectories)

        # Score new theories
        new_likelihoods = compute_likelihood(statistician, new_theories, trajectories)

        # Metropolis-Hastings acceptance
        for i, (new_theory, new_lh, old_lh) in enumerate(zip(new_theories, new_likelihoods, likelihoods)):
            acceptance_prob = min(1.0, new_lh / old_lh)
            if np.random.rand() < acceptance_prob:
                theories[i] = new_theory
                likelihoods[i] = new_lh
```

**Patterns to Adopt:**
```typescript
// Galatea: Bayesian user model updating
class BayesianUserModel {
  theories: UserTheory[]

  async proposeNewTheory(worst_predictions: Interaction[]): Promise<UserTheory> {
    // Use LLM to generate new theory based on failures
    const prompt = `
    Current theories about the user often fail on these interactions:
    ${worst_predictions.map(p => p.summary).join('\n')}

    Propose a new theory that better explains these cases:
    `

    const new_theory_text = await llm.generate(prompt)
    return { theory: new_theory_text, evidence_count: 0, confidence: 0.5, last_tested: new Date() }
  }

  async updateTheories(new_interactions: Interaction[]) {
    // Score existing theories
    const scores = await Promise.all(
      this.theories.map(t => this.scoreTheory(t, new_interactions))
    )

    // Find worst-performing theories
    const worst_indices = this.getWorstTheories(scores, 3)

    // Generate new theories for worst performers
    for (const idx of worst_indices) {
      const new_theory = await this.proposeNewTheory(
        new_interactions.filter(i => !this.theoryExplains(this.theories[idx], i))
      )

      const new_score = await this.scoreTheory(new_theory, new_interactions)

      // Metropolis-Hastings acceptance
      const acceptance_prob = Math.min(1.0, new_score / scores[idx])
      if (Math.random() < acceptance_prob) {
        this.theories[idx] = new_theory
      }
    }
  }

  async scoreTheory(theory: UserTheory, interactions: Interaction[]): Promise<number> {
    // How well does this theory predict user behavior?
    const predictions = await Promise.all(
      interactions.map(async i => {
        const prompt = `
        Given theory: "${theory.theory}"

        User context: ${i.context}
        Predict user response:
        `
        const predicted = await llm.generate(prompt)
        return this.similarity(predicted, i.actual_response)
      })
    )

    return predictions.reduce((a, b) => a + b, 0) / predictions.length
  }
}
```

**Galatea Application:**
- Iteratively improve user theories based on interactions
- No training - just prompt engineering + Bayesian updating
- Converge to accurate user model over time

### 3. Curiosity-Driven Exploration ⭐⭐⭐⭐⭐
**The Experimenter Component:**

Instead of random exploration, **target low-likelihood transitions**:

```python
# From WorldLLM
def curiosity_driven_exploration(env, statistician, current_theories):
    """Explore states where current theories perform poorly"""

    # Train RL agent with intrinsic reward = -log_likelihood
    def curiosity_reward(state, action, next_state):
        # Predict outcome using current theories
        predicted_logp = statistician.score(state, action, current_theories)

        # Curiosity reward = how surprising is this outcome?
        curiosity = -predicted_logp  # Low likelihood = high curiosity
        return curiosity

    # Collect trajectories in high-curiosity regions
    trajectories = agent.collect(env, reward_fn=curiosity_reward)
    return trajectories
```

**Why This Works:**
- Low likelihood = current theories fail here
- Exploring failures → find evidence to improve theories
- More efficient than random exploration

**Patterns to Adopt:**
```typescript
// Galatea: Curiosity about user's unexpected responses
class CuriosityEngine {
  async selectExplorationTopic(user: UserModel): Promise<Topic> {
    const candidate_topics = await this.getCandidates(user)

    // Predict how well we understand each topic area
    const curiosity_scores = await Promise.all(
      candidate_topics.map(async topic => {
        // How uncertain are our theories about this topic?
        const predictions = await this.predictUserResponse(topic, user.theories)

        // Low confidence = high curiosity
        return {
          topic,
          curiosity: 1.0 - predictions.confidence,
          expected_info_gain: this.estimateInfoGain(topic, user.theories)
        }
      })
    )

    // Explore topics where theories are weakest
    curiosity_scores.sort((a, b) => b.curiosity - a.curiosity)
    return curiosity_scores[0].topic
  }

  async predictUserResponse(topic: Topic, theories: UserTheory[]): Promise<Prediction> {
    const prompt = `
    Theories about user:
    ${theories.map(t => `- ${t.theory}`).join('\n')}

    If we discuss ${topic.name}, predict:
    - Will user engage? (yes/no/unsure)
    - How long will interest last? (minutes)
    - What questions will they ask?

    Confidence in prediction (0-1):
    `

    const response = await llm.generate(prompt, { logprobs: true })

    // Use perplexity as uncertainty measure
    const confidence = 1.0 / response.perplexity

    return { prediction: response.text, confidence }
  }
}
```

**Galatea Application:**
- Explore conversation topics where theories are uncertain
- Target areas of user behavior we don't understand
- Build better user model through strategic exploration

### 4. Scientist-Experimenter-Statistician Loop ⭐⭐⭐⭐⭐
**The Scientific Method as Architecture:**

```
┌─────────────────────────────────────────────────┐
│ SCIENTIST (Theory Generation)                  │
│ - Proposes natural language hypotheses          │
│ - Uses Bayesian inference with LLM proposals    │
│ - Generates variants of existing theories       │
└─────────────────────────────────────────────────┘
              ↓ Theories
┌─────────────────────────────────────────────────┐
│ STATISTICIAN (Prediction & Evaluation)         │
│ - Scores theories on observed data              │
│ - Computes likelihood: P(data | theory)         │
│ - Identifies worst predictions                  │
└─────────────────────────────────────────────────┘
              ↓ Worst cases        ↑ Evidence
┌─────────────────────────────────────────────────┐
│ EXPERIMENTER (Curiosity-Driven Exploration)    │
│ - Explores low-likelihood transitions           │
│ - Collects data to test theories                │
│ - Targets theory failures                       │
└─────────────────────────────────────────────────┘
```

**Cycle:**
1. Scientist generates theories
2. Statistician evaluates theories on data
3. Experimenter collects more data (curiosity-driven)
4. Repeat → theories improve

**Patterns to Adopt:**
```typescript
// Galatea: User understanding loop
class UserUnderstandingLoop {
  scientist: TheoryGenerator
  experimenter: CuriosityEngine
  statistician: TheoryEvaluator

  async improveUserModel(user: UserModel): Promise<void> {
    // 1. Generate theories about user
    const theories = await this.scientist.generateTheories(user.interaction_history)

    // 2. Evaluate theories on past interactions
    const scores = await this.statistician.evaluateTheories(theories, user.interactions)

    // 3. Find worst predictions
    const worst_predictions = this.statistician.getWorstPredictions(theories, scores)

    // 4. Explore areas where theories fail (curiosity)
    const exploration_topics = await this.experimenter.selectTopicsForWorstCases(worst_predictions)

    // 5. Interact with user on exploration topics
    const new_data = await this.interactOnTopics(exploration_topics, user)

    // 6. Update theories based on new evidence
    const updated_theories = await this.scientist.updateTheories(theories, new_data, scores)

    // 7. Store in user model (PERMANENT zone)
    user.theories = updated_theories
  }
}
```

**Galatea Application:**
- Scientist → Learning Discovery (generate hypotheses about user)
- Experimenter → Curiosity Engine (explore uncertain areas)
- Statistician → Metacognitive Support (evaluate understanding)

### 5. Prompt Engineering Patterns ⭐⭐⭐⭐
**System Prompts:**

```python
# Statistician system prompt (from configs)
STAT_SYSTEM_PROMPT = """
You are predicting outcomes in an environment.
You will be given:
1. Current state
2. Action taken
3. Hypotheses about world rules

Your task: Predict the next state based on the hypotheses.
Be precise and consistent with the given rules.
"""

# Theorist system prompt
THEORIST_SYSTEM_PROMPT = """
You are a scientist generating theories about how the world works.
You will be given:
1. Observed state transitions
2. Current theories (some may be wrong)

Your task: Propose new theories that better explain the observations.
Be concise and testable.
"""
```

**Message Templates:**
```python
def stat_template(state, action, theories):
    return f"""
Current theories:
{format_theories(theories)}

Scenario:
- Current state: {state}
- Action taken: {action}

What is the next state?
"""

def theorist_template(trajectories, worst_predictions):
    return f"""
Observed transitions:
{format_trajectories(trajectories)}

These cases are poorly explained by current theories:
{format_worst(worst_predictions)}

Propose a new theory:
"""
```

**Patterns to Adopt:**
```typescript
// Galatea: Structured prompts for subsystems
const SUBSYSTEM_PROMPTS = {
  empathy: `
    You are Galatea's empathy analyzer.
    Given user message, identify:
    - Primary emotion (label + intensity 0-1)
    - Emotional needs
    - Appropriate response tone
  `,

  curiosity: `
    You are Galatea's curiosity engine.
    Given conversation context and user theories, identify:
    - Topics with high learning potential
    - Areas of user uncertainty
    - Exploration strategies
  `,

  growth: `
    You are Galatea's growth promotion system.
    Given user skill history and theories, identify:
    - Current learning progress (LP)
    - Sweet spot challenges
    - Scaffolding strategies
  `
}
```

### 6. No Training, Just Prompting ⭐⭐⭐⭐⭐
**Comparison:**

| Approach | MAGELLAN | WorldLLM | Galatea Needs |
|----------|----------|----------|---------------|
| **Main technique** | RL (train LLM) | In-context learning | **No training** ✅ |
| **Updates** | Gradient updates | Prompt updates | **Prompt updates** ✅ |
| **LoRA adapters** | Yes | **No** ✅ | **No** ✅ |
| **RL training** | Yes (SAC) | Optional (only Experimenter) | **Optional** ✅ |
| **LLM weights** | Modified | **Unchanged** ✅ | **Unchanged** ✅ |

**WorldLLM Achievement:**
- Better predictions without training
- Just by improving prompts
- Theories = compressed knowledge in natural language

**Galatea Application:**
- Use pre-trained LLMs as-is
- Improve through better context (theories in PERMANENT zone)
- No fine-tuning costs or complexity

---

## What WorldLLM Lacks (Galatea's Opportunity)

### 1. Conversational AI Features ❌
**Current:**
- Prediction tasks (state → next state)
- Not conversational dialogue

**Missing for Galatea:**
- Natural conversation flow
- Multi-turn dialogue management
- Empathy, personality, social intelligence

### 2. Production Architecture ❌
**Current:**
- Research code (Python)
- Requires custom environments
- HPC cluster scripts

**Missing for Galatea:**
- TypeScript implementation
- API/WebSocket server
- User-facing interface

### 3. Safety Systems ❌
**Current:**
- Pure research on world modeling

**Missing for Galatea:**
- Safety Monitor, Crisis Detector
- Dependency Prevention
- All 62 subsystems except curiosity/metacognition

### 4. General Memory Architecture ❌
**Current:**
- Trajectory buffers
- Theory database
- No episodic/semantic/procedural memory

**Missing for Galatea:**
- Full 6-type memory architecture
- User models, relationship models
- ContextForge integration

### 5. Multi-User Support ❌
**Current:**
- Single-user experiments

**Missing:**
- Multi-user isolation
- Per-user theory storage
- Relationship tracking

---

## Technology Stack Analysis

### What WorldLLM Uses
| Component | Technology | Galatea Relevance |
|-----------|-----------|-------------------|
| **Language** | Python | ❌ We prefer TypeScript |
| **LLM** | Hugging Face Transformers | ✅ Standard, portable |
| **Quantization** | 4-bit (BitsAndBytes) | ✅ Cost efficiency |
| **Config** | Hydra | ✅ Good pattern |
| **Monte Carlo** | Importance Sampling, Metropolis-Hastings | ⚠️ Adapt for theory updating |
| **RL** | Stable Baselines 3 (optional) | ⚠️ Only for Experimenter |
| **NO TRAINING** | ✅✅✅ | ✅✅✅ **Perfect match!** |

### Key Takeaway
- WorldLLM proves **curiosity without training** is possible
- Use prompting + Bayesian updating instead of gradients
- TypeScript port would work perfectly for Galatea

---

## Design Patterns to Extract

### ✅ **Adopt These Patterns**

1. **Theories in Prompts** ⭐⭐⭐⭐⭐
   ```
   System: [base instructions]

   Current theories:
   - Theory 1
   - Theory 2

   Task: [specific request]
   ```
   - **Galatea Use:** User theories in PERMANENT zone

2. **Bayesian Theory Updating** ⭐⭐⭐⭐⭐
   - Generate theory variants (LLM)
   - Score on evidence
   - Accept/reject (Metropolis-Hastings)
   - **Galatea Use:** Improve user model over time

3. **Curiosity = Low Likelihood** ⭐⭐⭐⭐⭐
   - Explore where theories fail
   - Target uncertainty
   - **Galatea Use:** Conversation topics with high info gain

4. **Scientist-Experimenter-Statistician** ⭐⭐⭐⭐⭐
   - Theory generation ↔ Evidence collection ↔ Evaluation
   - Scientific method as architecture
   - **Galatea Use:** Learning loop for user understanding

5. **No Training Required** ⭐⭐⭐⭐⭐
   - Pure in-context learning
   - Prompt engineering > Fine-tuning
   - **Galatea Use:** Use pre-trained LLMs, improve via prompts

6. **Separate Theorist/Statistician LLMs** ⭐⭐⭐
   - Can use same or different models
   - Different system prompts
   - **Galatea Use:** Different prompts for different subsystems

### ⚠️ **Adapt These Patterns**

1. **Monte Carlo Methods**
   - WorldLLM: Bayesian inference for theories
   - **Galatea:** Simpler heuristics may suffice, or approximate Bayesian

2. **RL for Experimenter**
   - WorldLLM: Train RL agent for exploration
   - **Galatea:** Can use heuristic curiosity (no RL training)

3. **Environment Abstraction**
   - WorldLLM: Custom Gym environments
   - **Galatea:** Conversation as environment

### ❌ **Don't Adopt These**

1. **Python Stack**
   - We prefer TypeScript

2. **Gym Environments**
   - Not applicable for conversation

3. **Research Code Structure**
   - Need production architecture

---

## Critical Discoveries for Galatea

### 1. You Don't Need to Train for Curiosity ⭐⭐⭐⭐⭐

**WorldLLM Proof:**
- Improved predictions 40-60% without any training
- Just by iterating theories in prompts
- Bayesian updating + curiosity exploration

**Galatea Application:**
- Build curiosity purely through prompting
- No RL, no fine-tuning, no LoRA
- Just smart prompt engineering

### 2. Natural Language is a Knowledge Representation ⭐⭐⭐⭐⭐

**WorldLLM Insight:**
- Theories expressed as natural language
- LLM can reason about them directly
- More interpretable than learned weights

**Galatea Application:**
- User theories as natural language in PERMANENT zone
- Explainable, editable, debuggable
- User can even see/modify their own theories

### 3. Bayesian Updating Works with LLMs ⭐⭐⭐⭐

**WorldLLM Method:**
- LLM as proposal distribution (generate theory variants)
- Likelihood scoring (how well theory explains data)
- Metropolis-Hastings acceptance (principled updating)

**Galatea Application:**
- Iteratively improve user theories
- Principled confidence estimates
- Converge to accurate models

### 4. Curiosity = Target Uncertainty ⭐⭐⭐⭐⭐

**WorldLLM Strategy:**
- Explore states with low predicted likelihood
- Collect evidence where theories are weakest
- More efficient than random

**Galatea Application:**
- Discuss topics where user theories are uncertain
- Build understanding strategically
- Information-theoretic curiosity

---

## Integration with MAGELLAN's Learning Progress

**Synthesis:**
- **MAGELLAN:** Learning Progress (LP) = curiosity metric
- **WorldLLM:** Curiosity = low likelihood = theory uncertainty

**Combined for Galatea:**
```typescript
class CombinedCuriosity {
  // MAGELLAN: Learning Progress
  async estimateLP(skill: string, user: UserModel): Promise<number> {
    return Math.abs(user.current_competence[skill] - user.delayed_competence[skill])
  }

  // WorldLLM: Theory Uncertainty
  async estimateUncertainty(topic: string, user: UserModel): Promise<number> {
    // How well do our theories explain this topic?
    const predictions = await this.predictUserBehavior(topic, user.theories)
    return 1.0 - predictions.confidence  // Low confidence = high uncertainty
  }

  // Combined curiosity score
  async selectTopic(user: UserModel): Promise<Topic> {
    const candidates = await this.getCandidates()

    const scores = await Promise.all(
      candidates.map(async topic => ({
        topic,
        lp: await this.estimateLP(topic.skill, user),           // MAGELLAN
        uncertainty: await this.estimateUncertainty(topic.name, user),  // WorldLLM
        combined: 0.5 * lp + 0.5 * uncertainty
      }))
    )

    return scores.sort((a, b) => b.combined - a.combined)[0].topic
  }
}
```

---

## Key Takeaways

### ✅ **WorldLLM's Strengths (Adopt for Galatea)**
1. **No training required** - pure in-context learning ⭐⭐⭐⭐⭐
2. **Natural language theories** - interpretable knowledge ⭐⭐⭐⭐⭐
3. **Bayesian updating** - principled belief revision ⭐⭐⭐⭐⭐
4. **Curiosity-driven exploration** - target uncertainty ⭐⭐⭐⭐⭐
5. **Scientific method architecture** - theory ↔ evidence loop ⭐⭐⭐⭐⭐
6. **Prompt engineering** - improvement without weights ⭐⭐⭐⭐

### ❌ **WorldLLM's Gaps (Galatea's Differentiators)**
1. Research code (not production)
2. Python (not TypeScript)
3. Prediction tasks (not conversation)
4. No safety systems
5. No psychological subsystems
6. No user-facing interface

### 🎯 **Strategic Positioning**

**WorldLLM is:** Research framework for world modeling (no training)
**Galatea is:** Production assistant with curiosity + safety + psychology (no training)

**Key Pattern to Import:**
- ✅✅✅ **Theories in prompts** for user understanding
- ✅✅✅ **Bayesian updating** for theory improvement
- ✅✅✅ **Curiosity = uncertainty** for exploration
- ✅✅✅ **No training** - pure prompting approach

---

## TypeScript Implementation Sketch

```typescript
// User Theory System (WorldLLM-inspired)
interface UserTheory {
  theory: string
  evidence_for: Interaction[]
  evidence_against: Interaction[]
  confidence: number
  created_at: Date
  last_updated: Date
}

class TheoryBasedUserModel {
  theories: UserTheory[]

  // Add theories to every prompt (WorldLLM style)
  buildPromptWithTheories(base_prompt: string): string {
    const theory_context = this.theories
      .filter(t => t.confidence > 0.5)
      .map(t => `- ${t.theory} (confidence: ${t.confidence.toFixed(2)})`)
      .join('\n')

    return `
${base_prompt}

Current understanding of this user:
${theory_context}

Use these theories to inform your response.
`
  }

  // Bayesian updating (WorldLLM style)
  async updateTheories(new_interactions: Interaction[]) {
    // Score existing theories
    const scores = await this.scoreTheories(this.theories, new_interactions)

    // Generate new theory variants
    const worst_idx = scores.indexOf(Math.min(...scores))
    const new_theory = await this.generateTheoryVariant(
      this.theories[worst_idx],
      new_interactions.filter(i => !this.theoryExplains(this.theories[worst_idx], i))
    )

    // Metropolis-Hastings acceptance
    const new_score = await this.scoreTheory(new_theory, new_interactions)
    const acceptance_prob = Math.min(1.0, new_score / scores[worst_idx])

    if (Math.random() < acceptance_prob) {
      this.theories[worst_idx] = new_theory
    }
  }

  // Curiosity-driven topic selection (WorldLLM style)
  async selectCuriousTopic(): Promise<Topic> {
    const candidates = await this.getCandidateTopics()

    // Curiosity = prediction uncertainty
    const curiosity_scores = await Promise.all(
      candidates.map(async topic => {
        const prediction = await this.predictUserResponse(topic, this.theories)
        return {
          topic,
          curiosity: 1.0 - prediction.confidence,  // Uncertainty
          expected_info_gain: this.estimateInfoGain(topic)
        }
      })
    )

    // Explore topics with highest uncertainty
    return curiosity_scores.sort((a, b) => b.curiosity - a.curiosity)[0].topic
  }
}
```

---

**Next:** Combine WorldLLM (no training), MAGELLAN (LP metric), Cline (MCP tools), GPT-Engineer (preprompts), OpenClaw (infrastructure) into unified Galatea architecture.

**Sources:**
- [WorldLLM GitHub](https://github.com/flowersteam/WorldLLM)
- [WorldLLM arXiv](https://arxiv.org/abs/2506.06725)
