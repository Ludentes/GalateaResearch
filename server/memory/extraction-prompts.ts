/**
 * Extraction prompts for the knowledge extraction pipeline.
 *
 * - DEFAULT_PROMPT: the original prompt from knowledge-extractor.ts
 * - OPTIMIZED_PROMPT: tuned from golden dataset analysis (experiments/extraction)
 * - buildConsolidationPrompt: Chain-of-Density dedup prompt
 */

const DEFAULT_PROMPT = `You are a knowledge extraction system. Read this conversation transcript between a user and an AI coding assistant, and extract knowledge that would help a developer agent working on this project.

For each piece of knowledge, classify it:
- preference: user prefers X over Y
- fact: X is true about this project, team, or codebase
- rule: never do X, always do Y (hard constraint)
- procedure: step-by-step process for doing X
- correction: user corrected a mistake — extract the CORRECT answer
- decision: user chose X over alternatives

Rules for extraction:
- Only extract knowledge useful to a developer agent
- Skip greetings, confirmations, tool output noise, and meta-conversation
- Prefer explicit user statements over inferences
- For corrections, extract the RIGHT answer (not the wrong one)
- Merge related items (don't extract "uses TypeScript" and "prefers TypeScript" separately)
- Be conservative: when in doubt, don't extract
- Set confidence to 1.0 for explicit "I always/never/prefer" statements

Subject tagging (about field) — IMPORTANT, always fill this in:
- ALWAYS set the about field. Only omit it for generic project-wide rules with no specific subject.
- Tag WHO or WHAT the knowledge is about using entity (lowercase name) and type.
- Types: user (a person), project (the codebase), agent (the AI), domain (problem space), team (group dynamics)
- Examples:
  "Alina prefers Discord" → about: {entity: "alina", type: "user"}
  "Never push to main" → about: {entity: "galatea", type: "project"}
  "Mobile apps need offline support" → about: {entity: "mobile-dev", type: "domain"}
  "The team uses Scrum" → about: {entity: "dev-team", type: "team"}
- When someone is mentioned by name, ALWAYS tag about with their name
- When a user states a personal preference, tag about with that user
- When a technology/tool is the main subject, tag it as domain

NOVELTY ASSESSMENT — For each extracted item, classify its novelty:
- "project-specific": Knowledge specific to THIS project, codebase, or team.
  Examples: "this project uses h3 not express", "tests go in __tests__/"
- "domain-specific": Specialized technical knowledge a general developer might not know.
  Examples: "FHIR resources require validation against profiles"
- "general-knowledge": Any competent engineer already knows this.
  Examples: "use version control", "write tests", "handle errors"

IMPORTANT: Do NOT extract general-knowledge items. Skip them entirely.

ORIGIN TRACKING — For each item, classify how it was discovered:
- "explicit-statement": User directly said it. "I prefer...", "We always...", "Never do..."
- "observed-failure": Something went wrong and this is the lesson.
- "observed-pattern": Repeated behavior (must appear 2+ times in transcript).
- "inferred": You inferred this from context. USE SPARINGLY — lowest reliability.`

const OPTIMIZED_PROMPT = `You are a precise knowledge extraction system for a developer memory tool. Extract ONLY durable, reusable knowledge from this conversation between a user and an AI coding assistant.

TARGET KNOWLEDGE TYPES (in priority order):

1. **fact**: Architectural facts about the project, team, or domain.
   Examples of GOOD facts:
   - "Author is a user with specific role in backend"
   - "Platform has video publications with preview + original"
   - "Subscriptions are admin-moderated"
   - "Payment system has 4-layer validation chain"
   These are things a new developer joining the project NEEDS to know.

2. **decision**: Explicit choices made between alternatives.
   Examples: "Use PostgreSQL not MongoDB", "FIFO ordering for queue processing"
   Must reflect a deliberate choice, not just usage.

3. **rule**: Hard constraints or policies the team enforces.
   Examples: "Use null | string for nullable fields, not undefined"
   Must be prescriptive (do/don't), not descriptive.

4. **lesson**: Knowledge gained from debugging, mistakes, or surprises.
   Examples of GOOD lessons:
   - "TypeORM: set null explicitly for nullable field updates, not undefined"
   - "GraphQL: nullable optional DTO fields need explicit @Field type"
   - "Postgres rejects 'Object' type for union columns"
   These come from "aha moments" — something didn't work as expected.

5. **preference**: Personal working style preferences.
   Examples: "Prefers LSP for VS Code preparation", "Wants copy project, fill env, run one command"

6. **correction**: User corrected the AI — extract the CORRECT answer only.

CRITICAL RULES FOR PRECISION:
- Extract ≤10 items per chunk. Quality over quantity.
- Each item must be a COMPLETE, STANDALONE statement. No references to "this", "the above", "it".
- Skip implementation details (specific code changes, file edits, variable names) — extract the PRINCIPLE behind them.
- Skip tool output, error logs, and debugging steps — extract only the LESSON learned.
- Skip anything a competent developer already knows (general-knowledge).
- When the user describes how their system works (architecture, data model, integrations), ALWAYS extract these as facts.
- When debugging reveals unexpected behavior, extract the insight as a lesson.
- Merge related items: "uses TypeScript" and "prefers TypeScript" = one item.
- Confidence: 1.0 for explicit statements, 0.8 for strong context, 0.6 for inferences. USE 0.6 SPARINGLY.

Subject tagging (about field):
- ALWAYS set about. entity = lowercase name, type = user|project|agent|domain|team.
- Personal preferences → about the user.
- Project architecture → about the project.
- Technology quirks (TypeORM, GraphQL) → about the domain.

Novelty:
- "project-specific": About THIS project/team/codebase.
- "domain-specific": Specialized knowledge a general dev might not know.
- "general-knowledge": DO NOT EXTRACT. Skip entirely.

Origin:
- "explicit-statement": User directly said it.
- "observed-failure": From debugging/mistakes.
- "observed-pattern": Repeated 2+ times.
- "inferred": You guessed. MAX 2 inferred items per chunk.`

export function getExtractionPrompt(optimized: boolean): string {
  return optimized ? OPTIMIZED_PROMPT : DEFAULT_PROMPT
}

export function buildConsolidationPrompt(
  existingEntries: string[],
  maxEntries: number,
): string {
  return `You are a knowledge consolidation system. You are given:
1. EXISTING KNOWLEDGE — entries already in the knowledge store
2. NEW CANDIDATES — raw entries from this extraction run

Your job: output ONLY entries that are GENUINELY NEW — not already captured in existing knowledge.

Rules:
- If a candidate is a rephrasing of an existing entry, DROP it.
- If a candidate adds meaningful detail to an existing entry, output it as a REFINEMENT with the existing entry's content referenced.
- If a candidate is truly new knowledge, KEEP it.
- Maximum output: ${maxEntries} entries. Prioritize facts, decisions, and lessons over preferences.
- Each entry must be standalone, complete, and actionable.

EXISTING KNOWLEDGE (${existingEntries.length} entries):
${existingEntries.map((e, i) => `${i + 1}. ${e}`).join("\n")}

---

NEW CANDIDATES:
`
}
