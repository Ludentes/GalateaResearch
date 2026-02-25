# Memory Conventions: How to Talk to Claude for Best Results

Galatea learns from your conversations automatically. The memory system uses **pattern matching** on your messages to extract preferences, rules, decisions, and procedures. This guide shows you how to phrase things so the system captures exactly what you mean.

## Quick Reference

| You want to record... | Say it like... | What gets stored |
|---|---|---|
| Personal preference | "**I** prefer/always/never/like X" | User model, preference |
| Team convention | "**We** always/never/should X" | Team model, rule |
| Project rule | "**Never** X" / "**Always** X" / "**Must not** X" | Project model, rule |
| Decision | "**Let's go with** X" / "**We'll use** X" | Project model, decision |
| Correction | "**No, that's wrong** — do X instead" | Project model, correction |
| Procedure | Numbered steps: "1) X  2) Y  3) Z" | Project model, procedure |
| Anything explicit | "**@remember** X" | Stored at highest confidence |
| Remove knowledge | "**@forget** X" | Flags for removal |

## Detailed Patterns

### Personal preferences ("I ...")

These build your **user profile** — your personal style, tools, and habits.

```
"I prefer using pnpm"
"I always use TypeScript strict mode"
"I never use default exports"
"I like Biome over ESLint"
"I hate semicolons"
```

All of these produce: `type: preference, confidence: 0.95, about: user`

### Team conventions ("We ...")

These build the **team model** — shared practices and policies.

```
"We always run tests before pushing"
"We never push to main directly"
"We should use feature branches"
"We must review PRs before merging"
"Our convention is conventional commits"
"Our policy is no deployments on Fridays"
```

All of these produce: `type: rule, confidence: 0.95, about: team`

### Project rules (imperative, no pronoun)

These go to the **project model** — codebase-specific constraints.

```
"Never deploy on Fridays"
"Always run the linter before commit"
"Must not use the any type"
"Don't ever skip database migrations"
```

Works after conversational connectors too:
```
"Also, never deploy on Fridays"        (comma)
"One more thing: always run linting"   (colon)
"And also; never skip code review"     (semicolon)
```

All produce: `type: rule, confidence: 0.95, about: project`

### Decisions

```
"Let's go with Clerk for authentication"
"Let's use PostgreSQL instead of MySQL"
"I've decided to use OTEL for observability"
"We'll use pnpm workspaces"
```

Produce: `type: decision, confidence: 0.90, about: project`

### Corrections

When Claude gets something wrong, correct it explicitly:

```
"No, that's wrong — use the v2 API"
"Incorrect, the port should be 15432"
"That's not right, we use Drizzle not Prisma"
"No, I meant the root tsconfig"
```

Produce: `type: correction, confidence: 0.90, about: project`

### Procedures (numbered steps)

Write procedures as numbered lists for best detection:

```
"To deploy the app:
1) Build the Docker image
2) Push to the registry
3) Run docker-compose up -d"
```

Produce: `type: procedure, confidence: 0.85, about: project`

**Note:** Prose-format procedures ("First do X, then do Y") are NOT detected by the heuristic extractor. Use numbered lists, or use `@remember` to force capture.

### @remember (explicit capture)

When you want something stored with absolute certainty:

```
"@remember we use port 15432 for PostgreSQL"
"@remember I always use conventional commits"
"@remember the deploy process uses rsync to staging first"
```

Produce: `confidence: 1.00` — highest possible. The system infers the type from the content after stripping `@remember`.

### @forget (removal)

When previously stored knowledge is no longer valid:

```
"@forget the old deploy process"
"@forget we used to use npm"
```

Flags the matching knowledge for removal.

## What Gets Filtered Out

The system automatically drops:

- **General programming knowledge**: "Always handle errors", "Write tests", "Use version control" — any competent developer already knows these.
- **Noise**: "ok", "thanks", "got it", "yes", "hi" — confirmations and greetings.
- **Short messages**: Messages under 50 characters without a signal pattern.
- **Assistant turns**: Only user messages are analyzed.

## What Needs the LLM (Slower Path)

Some knowledge can't be detected by pattern matching. These go through the slower LLM extraction path when enabled:

- **Multi-turn corrections**: You report a bug, Claude diagnoses it, you confirm the fix. The correction spans 3+ turns.
- **Long factual messages**: Substantial messages (>50 chars) without any of the patterns above. The LLM tries to identify implicit knowledge.

## Confidence and Approval

| Confidence | Auto-approved? | Reaches CLAUDE.md? |
|-----------|---------------|-------------------|
| 1.00 (@remember) | Yes | Yes |
| 0.95 (preference, rule) | Yes | Yes |
| 0.90 (decision, correction) | Yes | Yes |
| 0.85 (procedure) | No (needs manual approval) | No (goes to skills after approval) |
| 0.70 (LLM inferred) | No | No |

## Building Your Profile

The `about` field on each entry determines which cognitive model it belongs to:

| Pronoun in your message | Model | Example |
|------------------------|-------|---------|
| "I ..." | **User model** | Your preferences, habits, expertise |
| "We ..." | **Team model** | Shared conventions, policies |
| No pronoun (imperative) | **Project model** | Codebase rules, architecture decisions |

Over time, these models give Claude a richer understanding of:
- **You**: What tools you prefer, how you like code structured
- **Your team**: What conventions everyone follows
- **Your project**: Architecture decisions, deployment rules, tech stack constraints
