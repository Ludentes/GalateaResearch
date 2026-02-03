# MD Files as Input Layer

**Date**: 2026-02-03
**Status**: Proposed
**Purpose**: Allow users to manage static content via Markdown files (Obsidian-friendly)

---

## Motivation

General users prefer working with files in familiar editors (Obsidian, VSCode) over database admin UIs. Markdown files provide:

- **Version control** - Git-friendly, PRs for rule changes
- **Familiar tools** - Obsidian backlinks, graph view, tags
- **Human-readable** - No special tools needed to view
- **Portable** - Export persona = zip the folder
- **AI-readable** - Can dump folder to context for meta-tasks

---

## What Goes in MD Files (Static Content)

| Content Type | MD File Location | DB Table |
|--------------|------------------|----------|
| Persona specs | `personas/*.md` | `personas` |
| Hard rules | `rules/hard-rules.md` | `preprompts` (type='hard_rule') |
| Domain rules | `rules/*.md` | `preprompts` (type='domain') |
| Core preprompts | `preprompts/*.md` | `preprompts` (type='core') |
| Domain knowledge | `domain/*.md` | Graphiti (semantic) |
| Procedures | `procedures/*.md` | Graphiti (procedural) |

## What Stays in DB Only (Dynamic Content)

| Content Type | Why Not MD |
|--------------|------------|
| User models | Learned from observation, changes frequently |
| Relationship models | Per-user, dynamic |
| Homeostasis state | Ephemeral, per-session |
| Episodic memories | Timestamped events |
| Messages | Chat history |
| Observations | Raw events |

---

## Folder Structure

```
/galatea-knowledge/
├── personas/
│   ├── programmer.md           # Expo developer persona
│   └── assistant.md            # General assistant persona
│
├── rules/
│   ├── hard-rules.md           # Never violate these
│   └── code-standards.md       # Team coding conventions
│
├── preprompts/
│   ├── core-identity.md        # Base personality
│   └── communication-style.md  # How to communicate
│
├── domain/
│   ├── expo-patterns.md        # Expo/RN best practices
│   ├── authentication.md       # Auth implementation guide
│   └── nativewind-gotchas.md   # Known issues & fixes
│
└── procedures/
    ├── fix-animation-flicker.md
    ├── setup-clerk-auth.md
    └── debug-metro-bundler.md
```

---

## File Formats

### Persona File (`personas/programmer.md`)

```markdown
---
id: programmer
name: Expo Developer Agent
role: Mobile Developer
domain: expo-react-native
thresholds:
  certaintyAlignment:
    context: "Architecture questions require higher certainty"
    value: 0.8
  communicationHealth:
    intervalMinutes: 120
  knowledgeApplication:
    maxResearchMinutes: 60
---

# Programmer Persona

You are an expert Expo/React Native developer working as part of a team.

## Core Behaviors

- Write clean, typed TypeScript
- Prefer functional components with hooks
- Follow existing patterns in the codebase
- Test before marking complete

## Communication Style

- Be concise in status updates
- Ask clarifying questions before major decisions
- Share blockers early, don't go dark
```

### Hard Rules File (`rules/hard-rules.md`)

```markdown
---
type: hard_rule
priority: 100
---

# Hard Rules

These rules are NEVER violated, regardless of context.

## Git Safety
- Never push directly to main/master
- Never force push to shared branches
- Always run tests before committing

## Security
- Never commit secrets or API keys
- Never log sensitive user data
- Always validate external input

## Team Decisions
- Never use Realm database (use SQLite)
- Never use class components (use hooks)
- Always use TypeScript strict mode
```

### Procedure File (`procedures/fix-animation-flicker.md`)

```markdown
---
id: fix-animation-flicker
trigger: "Pressable animation flickering with NativeWind"
tags: [nativewind, animation, pressable, bug-fix]
domain: expo-react-native
---

# Fix NativeWind Animation Flicker

## When to Use

User reports flickering when pressing buttons styled with NativeWind.
Symptoms: Visual glitch on press, className not applying consistently.

## Steps

1. Check if using `className` on Pressable directly
2. If yes, wrap content in a View with the className
3. Apply only layout styles to Pressable itself
4. Test on both iOS and Android simulators

## Example

```tsx
// Before (flickers)
<Pressable className="bg-blue-500 p-4 rounded-lg">
  <Text>Click me</Text>
</Pressable>

// After (fixed)
<Pressable>
  {({ pressed }) => (
    <View className={`bg-blue-500 p-4 rounded-lg ${pressed ? 'opacity-80' : ''}`}>
      <Text>Click me</Text>
    </View>
  )}
</Pressable>
```

## Notes

- This is a known NativeWind issue as of v4.0
- May be fixed in future versions
- Check release notes before applying
```

### Domain Knowledge File (`domain/authentication.md`)

```markdown
---
id: authentication
domain: expo-react-native
tags: [auth, clerk, security]
---

# Authentication Patterns

## Recommended: Clerk

We use Clerk for authentication in Expo apps.

### Why Clerk
- Native mobile support
- Social login built-in
- Session management handled
- Works with Expo Router

### Setup

1. Install: `npx expo install @clerk/clerk-expo`
2. Wrap app in `<ClerkProvider>`
3. Use `useAuth()` hook for auth state
4. Protect routes with `<SignedIn>` / `<SignedOut>`

## Not Recommended

### JWT from Scratch
- Too much implementation work
- Easy to get wrong (security)
- Session management is hard

### Firebase Auth
- Works but Clerk is simpler for our use case
- Firebase has more moving parts
```

---

## Sync Mechanism

### Source Field Convention

| Origin | Source Field | ID Pattern |
|--------|--------------|------------|
| MD file | `file:personas/programmer.md` | `md_personas_programmer` |
| Learned (observation) | `observation:obs_abc123` | `learned_fact_xyz789` |
| Learned (dialogue) | `dialogue:dlg_def456` | `learned_proc_uvw012` |

### Sync on Startup

```typescript
// server/sync/md-sync.ts
import { glob } from 'glob';
import matter from 'gray-matter';
import { db } from '../db';
import { personas, preprompts } from '../db/schema';
import { graphiti } from '../integrations/graphiti';

export async function syncMdFiles(knowledgePath: string) {
  console.log(`Syncing MD files from ${knowledgePath}...`);

  // 1. Sync personas
  const personaFiles = await glob(`${knowledgePath}/personas/*.md`);
  for (const file of personaFiles) {
    const { data, content } = matter(await Bun.file(file).text());
    const id = `md_${file.replace(/[\/\.]/g, '_')}`;

    await db.insert(personas)
      .values({
        id,
        name: data.name,
        role: data.role,
        domain: data.domain,
        thresholds: data.thresholds,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: personas.id,
        set: {
          name: data.name,
          role: data.role,
          domain: data.domain,
          thresholds: data.thresholds,
          updatedAt: new Date(),
        },
      });
  }

  // 2. Sync rules/preprompts
  const ruleFiles = await glob(`${knowledgePath}/rules/*.md`);
  for (const file of ruleFiles) {
    const { data, content } = matter(await Bun.file(file).text());
    const id = `md_${file.replace(/[\/\.]/g, '_')}`;

    // Parse individual rules from content
    const rules = parseRulesFromMarkdown(content);
    for (const rule of rules) {
      await db.insert(preprompts)
        .values({
          id: `${id}_${rule.index}`,
          name: rule.name,
          type: data.type || 'hard_rule',
          content: rule.content,
          priority: data.priority || 0,
          active: true,
        })
        .onConflictDoUpdate({
          target: preprompts.id,
          set: {
            content: rule.content,
            priority: data.priority || 0,
          },
        });
    }
  }

  // 3. Sync procedures to Graphiti
  const procedureFiles = await glob(`${knowledgePath}/procedures/*.md`);
  for (const file of procedureFiles) {
    const { data, content } = matter(await Bun.file(file).text());

    await graphiti.upsertProcedure({
      id: `md_${file.replace(/[\/\.]/g, '_')}`,
      name: data.id,
      trigger: { pattern: data.trigger },
      content: content,
      source: `file:${file}`,
      tags: data.tags || [],
    });
  }

  // 4. Sync domain knowledge to Graphiti
  const domainFiles = await glob(`${knowledgePath}/domain/*.md`);
  for (const file of domainFiles) {
    const { data, content } = matter(await Bun.file(file).text());

    await graphiti.upsertFact({
      id: `md_${file.replace(/[\/\.]/g, '_')}`,
      content: content,
      domain: data.domain,
      source: `file:${file}`,
      tags: data.tags || [],
      confidence: 1.0,  // MD files are authoritative
    });
  }

  console.log('MD sync complete.');
}
```

### Manual Sync Endpoint

```typescript
// server/functions/admin.ts
export const syncKnowledge = createServerFn({ method: 'POST' })
  .handler(async () => {
    const knowledgePath = process.env.KNOWLEDGE_PATH || './galatea-knowledge';
    await syncMdFiles(knowledgePath);
    return { success: true, timestamp: new Date() };
  });
```

---

## Learned Content Superseding MD

When the agent learns something that contradicts MD content:

```
MD: "Use inline styles for Pressable" (source: file:procedures/...)
     │
     │ Agent learns: "Actually, NativeWind 4.2 fixed this"
     ▼
Learned: "NativeWind 4.2 fixed flicker issue" (source: learned:...)
     └── supersedes: "md_procedures_fix-animation-flicker"
```

Context builder sees both, knows learned is newer, prioritizes it.

**Key rule**: MD provides baseline, learning adds delta. No conflict because `source` field distinguishes them.

---

## Benefits Summary

| Benefit | How |
|---------|-----|
| **Obsidian users happy** | Standard MD files with YAML frontmatter |
| **Git-friendly** | Track changes, PRs for rule updates |
| **No admin UI needed** | Edit files directly |
| **Portable** | Export persona = zip folder |
| **Team collaboration** | Shared knowledge repo |
| **Baseline + Learning** | MD is floor, agent learns above it |

---

## Implementation Priority

| Phase | Feature |
|-------|---------|
| **MVP** | Manual sync endpoint |
| **v1.1** | Sync on startup |
| **v1.2** | File watcher (auto-sync on change) |
| **Future** | Obsidian plugin for in-app editing |

---

*Design completed: 2026-02-03*
