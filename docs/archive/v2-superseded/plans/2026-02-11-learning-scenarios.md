# Learning Scenarios: From Observation to Skills

**Date**: 2026-02-11
**Purpose**: Trace the full lifecycle — what events come in, what gets extracted, what files are written, and how they're later used.
**Format**: Each scenario has OBSERVE → EXTRACT → WRITE → USE phases.

---

## Scenario L1: Learning a Project Setup Procedure

### OBSERVE

Events over 3 days of shadow training. User sets up 3 Expo projects.

**Day 1 events (OTEL):**
```
09:00 claude_code_tool: Bash "npx create-expo-app@latest customer-app"
09:05 claude_code_tool: Bash "cd customer-app && npx expo install expo-router"
09:10 vscode_file_save: customer-app/app.json (language: json, lines_changed: 8)
09:15 claude_code_tool: Bash "npx expo install nativewind tailwindcss"
09:20 vscode_file_save: customer-app/tailwind.config.js (new file)
09:25 claude_code_tool: Bash "mkdir -p app/(tabs)"
09:30 vscode_file_save: customer-app/app/_layout.tsx (new file)
```

**Day 4 events (second project):**
```
10:00 claude_code_tool: Bash "npx create-expo-app@latest admin-panel"
10:05 claude_code_tool: Bash "cd admin-panel && npx expo install expo-router"
10:10 claude_code_tool: Bash "npx expo install nativewind tailwindcss"
10:15 vscode_file_save: admin-panel/tailwind.config.js (new file)
10:20 claude_code_tool: Bash "mkdir -p app/(tabs)"
```

**Day 7 events (third project):**
```
14:00 claude_code_tool: Bash "npx create-expo-app@latest vendor-portal"
14:05 claude_code_tool: Bash "npx expo install expo-router nativewind tailwindcss"
14:10 claude_code_tool: Bash "mkdir -p app/(tabs)"
```

### EXTRACT

Pipeline enrichment detects repeated command sequence across 3 sessions:

```
Pattern detected: Project setup sequence (3 occurrences, 7 days)
Commands:
  1. npx create-expo-app@latest <name>
  2. npx expo install expo-router
  3. npx expo install nativewind tailwindcss
  4. mkdir -p app/(tabs)
  5. Create tailwind.config.js
  6. Create app/_layout.tsx

Confidence: 0.90 (3 repetitions, no failures, consistent order)
Trigger: "creating a new Expo project" / "starting a new mobile app"

Note: Day 7 user combined steps 2+3 into one command (optimization).
```

**Validation dialogue** (optional, confidence > 0.8 so may skip):
```
Agent: "I notice you set up Expo projects with expo-router + NativeWind +
tabs layout every time. Is this your standard stack for new mobile projects?"
User: "Yes, that's our standard. Always start with that."
```

### WRITE

**File created: `.claude/skills/expo-project-setup/SKILL.md`**

```markdown
---
name: expo-project-setup
description: Set up a new Expo project with the team's standard stack - expo-router, NativeWind, TypeScript, tabs layout. Use when creating any new mobile app.
---

# Set Up New Expo Project

## Steps

1. Create the project:
   ```bash
   npx create-expo-app@latest <project-name>
   ```

2. Install core dependencies:
   ```bash
   cd <project-name>
   npx expo install expo-router nativewind tailwindcss
   ```

3. Create the directory structure:
   ```bash
   mkdir -p app/(tabs)
   ```

4. Configure Tailwind — create `tailwind.config.js`:
   ```js
   module.exports = {
     content: ["./app/**/*.{js,jsx,ts,tsx}"],
     theme: { extend: {} },
     plugins: [],
   };
   ```

5. Create root layout at `app/_layout.tsx` with expo-router Stack navigator.

6. Configure `app.json` for expo-router (set `scheme`, add `experiments.typedRoutes`).

## Notes
- Always use TypeScript (team standard)
- Always use tabs layout as starting point
- NativeWind provides Tailwind CSS styling in React Native
```

**File updated: `CLAUDE.md`** (appended entry):

```markdown
## Team Standards
- New Expo projects always use: expo-router + NativeWind + TypeScript + tabs layout
```

### USE — Later, PM assigns a new project

```
PM: "@Agent-Dev-1: Create a new app called partner-dashboard for vendor portal"
```

**What happens:**
1. Agent receives message via MCP (Discord)
2. Skills progressive disclosure: "expo-project-setup" description matches "create a new app"
3. Skill loads → System 1 (follow procedure)
4. Agent executes steps 1-6 from the skill
5. Agent posts: "partner-dashboard created with standard stack. Ready for features."

**Without the learned skill**: Agent would use generic LLM knowledge. Might use npm instead of npx expo, might skip NativeWind, might not create tabs layout. Would need to be corrected.

**With the learned skill**: Agent follows the exact team process. First time. No corrections needed.

---

## Scenario L2: Learning a Preference from Conversation

### OBSERVE

**Events (conversation in Claude Code):**
```
14:30 claude_code_prompt: "I need to add auth to this app"
14:31 claude_code_tool: Read "package.json"
14:32 claude_code_prompt: "Let's try JWT first"
14:33 claude_code_tool: Bash "npm install jsonwebtoken"
14:45 claude_code_prompt: "this token refresh thing is a mess on mobile"
14:50 claude_code_prompt: "forget JWT, let's use Clerk instead"
14:51 claude_code_tool: Bash "npx expo install @clerk/clerk-expo"
15:20 claude_code_prompt: "much better, this works great"
```

**Browser events (correlated):**
```
14:35 browser_search: "JWT refresh token react native"
14:38 browser_tab_active: stackoverflow.com "JWT refresh token mobile app issues"
14:42 browser_tab_active: clerk.com/docs/expo
14:48 browser_tab_active: clerk.com/docs/expo/setup
```

### EXTRACT

Pipeline correlates Claude Code + browser events:

```
Session: "Implementing auth in Expo app" (14:30 - 15:20)
Intent confidence: 0.95

Pattern detected: Failed approach → Successful alternative
  Failed: JWT (jsonwebtoken) — user expressed frustration ("mess on mobile")
  Succeeded: Clerk (@clerk/clerk-expo) — user expressed satisfaction ("works great")

Cross-source correlation:
  Browser research on JWT issues confirms frustration
  Browser research on Clerk docs confirms intentional switch

Extracted facts:
  1. "User prefers Clerk over JWT for mobile auth" (confidence: 0.85)
  2. "JWT has token refresh issues on mobile" (confidence: 0.80)
  3. "User uses @clerk/clerk-expo package" (confidence: 0.95)
```

**Validation dialogue:**
```
Agent: "I noticed you switched from JWT to Clerk for auth.
What should I learn — is Clerk always preferred for mobile,
or was JWT just wrong for this case?"

User: "JWT has issues specifically in mobile/Expo. For web backend it's fine."
```

### WRITE

**File updated: `CLAUDE.md`** (appended entries):

```markdown
## Auth Preferences
- For mobile/Expo auth: use Clerk (@clerk/clerk-expo), not JWT
- JWT is fine for web backends but has token refresh issues on mobile
- Package: @clerk/clerk-expo
```

**File created: `.claude/skills/expo-auth-setup/SKILL.md`**

```markdown
---
name: expo-auth-setup
description: Add authentication to an Expo mobile app using Clerk. Use when any mobile app needs auth, login, or user accounts.
---

# Add Auth to Expo App

## Important
Use Clerk for mobile auth, NOT custom JWT. JWT has token refresh issues on mobile.

## Steps

1. Install Clerk:
   ```bash
   npx expo install @clerk/clerk-expo
   ```

2. Set up ClerkProvider in `app/_layout.tsx`:
   ```tsx
   import { ClerkProvider } from '@clerk/clerk-expo';

   export default function Layout() {
     return (
       <ClerkProvider publishableKey={process.env.EXPO_PUBLIC_CLERK_KEY}>
         <Stack />
       </ClerkProvider>
     );
   }
   ```

3. Create sign-in screen at `app/(auth)/sign-in.tsx`

4. Create sign-up screen at `app/(auth)/sign-up.tsx`

5. Add protected route logic using `useAuth()` hook

## Notes
- JWT was tried previously — token refresh is painful on mobile
- Clerk handles token management, social logins, and session persistence
- For web backends, JWT is still fine
```

### USE — Later, Agent-Dev-2 needs auth

```
Agent-Dev-2 assigned: "Add user authentication to vendor-portal"
```

**What happens:**
1. "expo-auth-setup" skill description matches "authentication"
2. Skill loads → System 1
3. Agent uses Clerk directly, skips JWT entirely
4. No wasted time on JWT, no frustration, no research needed

**Additionally**, if Agent-Dev-2 somehow considers JWT:
- CLAUDE.md entry "JWT has token refresh issues on mobile" is in context
- Agent has the fact AND the reasoning (why not JWT)

---

## Scenario L3: Learning a Hard Rule

### OBSERVE

**Events (conversation):**
```
User: "By the way, never use Realm database in any of our projects"
Agent: "Understood, I'll avoid Realm. Any specific reason?"
User: "Sync issues and painful migrations. Use SQLite + Drizzle or WatermelonDB."
```

### EXTRACT

```
Hard rule detected:
  Content: "Never use Realm database"
  Reason: "Sync issues, painful migrations"
  Alternatives: ["SQLite + Drizzle", "WatermelonDB"]
  Confidence: 1.0 (explicit user statement with "never")
  Source: user_stated
```

No validation dialogue needed — user explicitly stated the rule.

### WRITE

**File updated: `CLAUDE.md`** (appended):

```markdown
## Hard Rules
- NEVER use Realm database — sync issues and painful migrations
  - Alternatives: SQLite + Drizzle, or WatermelonDB
```

### USE — Later, evaluating database options

```
Agent-Dev-1 task: "Add offline data persistence to customer-app"
```

**What happens:**
1. Agent considers database options
2. CLAUDE.md is always in context: "NEVER use Realm" is visible
3. Agent immediately narrows to SQLite + Drizzle or WatermelonDB
4. Never wastes time evaluating Realm

**Critical**: Hard rules in CLAUDE.md are always loaded (Tier 1 working memory). They don't need retrieval. They're always present.

---

## Scenario L4: Learning from Code Review Feedback

### OBSERVE

**Events across 3 PRs:**

**PR #456 (Day 5):**
```
gitlab_mr_comment: "Missing null check on user.email, line 47"
claude_code_tool: Edit "app/(tabs)/profile.tsx" (added null check)
gitlab_mr_comment: "Fixed, thanks"
```

**PR #523 (Day 8):**
```
gitlab_mr_comment: "Again missing null check — user.address this time"
claude_code_tool: Edit "app/(tabs)/settings.tsx" (added null check)
```

**PR #601 (Day 12):**
```
vscode_file_save: app/(tabs)/orders.tsx (includes optional chaining on user fields)
gitlab_mr_comment: "LGTM, nice null safety!"
```

### EXTRACT

```
Pattern detected: Recurring code review feedback → improvement
  Issue: Missing null checks on user object properties
  Occurrences: 2 misses (PR #456, #523), 1 success (PR #601)

  Timeline:
    Day 5: Missed (user.email) → feedback → fixed
    Day 8: Missed again (user.address) → feedback → fixed
    Day 12: Proactively added → positive feedback

  Learning trajectory: failing → learning → applying

Extracted procedure:
  Before submitting PR, check all user object property accesses for null safety.
  Use optional chaining (user?.email) or explicit null checks.
```

### WRITE

**File updated: `CLAUDE.md`** (appended):

```markdown
## Code Review Patterns
- Always add null checks on user object properties before submitting PRs
- Use optional chaining (user?.email) for nested property access
- Common miss: user.email, user.address, user.preferences — always check these
```

**File created: `.claude/skills/pre-pr-checklist/SKILL.md`**

```markdown
---
name: pre-pr-checklist
description: Run through the team's PR checklist before creating a merge request. Catches common review feedback items.
---

# Pre-PR Checklist

Before creating a merge request, verify:

## Null Safety
- [ ] All `user` object property accesses use optional chaining or null checks
- [ ] Particularly check: `user.email`, `user.address`, `user.preferences`
- [ ] Nested objects: `user.settings?.theme`, not `user.settings.theme`

## Types
- [ ] No `any` types — use proper TypeScript types
- [ ] Props interfaces defined for all components

## Tests
- [ ] Unit tests for new functions
- [ ] Component tests for new screens

## Style
- [ ] NativeWind classes used for styling (no inline styles except animations)
- [ ] Consistent with existing patterns in the module
```

### USE — Later, Agent-Dev-1 implements a new feature

```
Agent-Dev-1 finishes implementing orders screen, about to create MR.
```

**What happens:**
1. "pre-pr-checklist" skill matches "creating merge request" / "ready for review"
2. Agent runs through the checklist
3. Finds `order.customer.email` without null check on line 34
4. Fixes it before submitting
5. PR passes review first time

**Self-model update** (if homeostasis tracked this):
```
Self observation: "I tend to miss null checks on nested properties.
The pre-pr-checklist skill catches this."
```

---

## Scenario L5: Learning from Cross-Source Correlation

### OBSERVE

**Events across sources:**

```
09:00 browser_search: "Liquid Glass iOS 26 react native"
09:05 browser_tab_active: apple.com/design/resources (8 min read)
09:15 browser_tab_active: medium.com "Liquid Glass in React Native" (12 min read)
09:30 claude_code_prompt: "Let's add a glass effect to the profile header"
09:35 claude_code_tool: Bash "npx expo install expo-blur"
09:40 vscode_file_save: components/GlassHeader.tsx (new file, 45 lines)
09:50 claude_code_prompt: "Actually the blur is too heavy on Android,
  let's only use it on iOS and fall back to a gradient on Android"
10:00 vscode_file_save: components/GlassHeader.tsx (modified, Platform check added)
```

### EXTRACT

```
Session: "Adding Liquid Glass design to profile" (09:00 - 10:00)
Intent confidence: 0.95

Cross-source timeline:
  09:00-09:30: Research phase (browser, 30 min)
  09:30-10:00: Implementation phase (Claude Code + VSCode, 30 min)

Extracted knowledge:
  1. "User interested in Liquid Glass design (iOS 26)" (semantic, confidence: 0.7)
  2. "expo-blur used for glass effects" (semantic, confidence: 0.9)
  3. "expo-blur is heavy on Android, need platform check" (known issue, confidence: 0.9)
  4. "Platform-specific rendering: iOS=blur, Android=gradient" (procedure, confidence: 0.85)
```

### WRITE

**File updated: `CLAUDE.md`** (appended):

```markdown
## Design
- Liquid Glass (iOS 26 style) — use sparingly, adds visual polish
- expo-blur for glass effects — BUT heavy on Android
- Platform-specific: use blur on iOS, gradient fallback on Android
```

**File created: `.claude/skills/platform-glass-effect/SKILL.md`**

```markdown
---
name: platform-glass-effect
description: Add a Liquid Glass / blur effect that works cross-platform. Uses expo-blur on iOS with gradient fallback on Android.
---

# Platform-Aware Glass Effect

## When to use
Premium UI elements — profile headers, cards, navigation bars.
Use sparingly — performance cost on lower-end devices.

## Implementation

```tsx
import { Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

function GlassContainer({ children }) {
  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={80} tint="light" style={styles.container}>
        {children}
      </BlurView>
    );
  }

  // Android fallback — blur is too heavy
  return (
    <LinearGradient
      colors={['rgba(255,255,255,0.8)', 'rgba(255,255,255,0.6)']}
      style={styles.container}
    >
      {children}
    </LinearGradient>
  );
}
```

## Notes
- expo-blur intensity 60-80 works best for glass effect
- On Android, blur causes frame drops on mid-range devices
- Gradient fallback preserves design intent without performance cost
```

### USE — Later, another agent designs a card component

```
Agent-Dev-1 task: "Design a premium-looking order summary card"
```

**What happens:**
1. "platform-glass-effect" skill matches "premium-looking"
2. Agent uses the exact platform-aware pattern
3. No discovery of the Android performance issue needed — already encoded
4. First implementation works on both platforms

---

## Scenario L6: Learning with Temporal Validity

### OBSERVE

**Day 10 events:**
```
11:00 claude_code_prompt: "The Pressable animation is flickering when I add className"
11:15 browser_search: "NativeWind Pressable animation flicker"
11:20 browser_tab_active: github.com/nativewind/nativewind/issues/XXX
11:30 claude_code_prompt: "Found the fix — use inline styles for animated props"
11:35 vscode_file_save: components/AnimatedButton.tsx (workaround applied)
```

### EXTRACT

```
Known issue detected:
  Issue: NativeWind className causes flicker with Pressable animations
  Workaround: Move animated properties to inline style prop
  Temporal: Issue exists in NativeWind < 4.1 (from GitHub issue)
  Confidence: 0.95 (user confirmed fix works)
```

### WRITE

**File created: `.claude/skills/nativewind-animation-fix/SKILL.md`**

```markdown
---
name: nativewind-animation-fix
description: Fix NativeWind animation flicker on Pressable components. Keep static styles in className, move animated props to inline style.
metadata:
  valid_until: "NativeWind 4.1"
  confidence: 0.95
  learned_from: "shadow-training-day-10"
---

# Fix NativeWind Animation Flicker

## The Problem
NativeWind className causes flicker when used with Pressable animations.
This is a known bug in NativeWind < 4.1.

## The Fix
Keep static styles in className. Move animated properties to inline style prop.

```tsx
// WRONG — will flicker
<Pressable className="bg-blue-500 rounded-lg scale-95">

// CORRECT — static in className, animated in style
<Pressable
  className="bg-blue-500 rounded-lg"
  style={{ transform: [{ scale: animatedValue }] }}
>
```

## Notes
- This is a workaround, not a permanent fix
- NativeWind 4.1 will fix this — check release notes
- If using Animated.View wrapper, same rule applies
```

**File updated: `CLAUDE.md`** (appended):

```markdown
## Known Issues
- NativeWind < 4.1: className causes Pressable animation flicker
  - Workaround: inline styles for animated props (see nativewind-animation-fix skill)
  - Will be fixed in NativeWind 4.1
```

### USE — Later, same issue encountered

```
Agent-Dev-2: "My button animation is flickering"
```

**What happens:**
1. "nativewind-animation-fix" skill matches "animation flickering"
2. Agent applies fix immediately — no debugging time
3. Agent also mentions: "This is a known NativeWind bug, will be fixed in 4.1"

### USE — Later, NativeWind 4.1 releases

**Events:**
```
claude_code_tool: Bash "npx expo install nativewind@4.1"
```

**Pipeline detects version change:**
```
nativewind updated to 4.1
Skills with valid_until: "NativeWind 4.1" found: nativewind-animation-fix
```

**What happens:**
1. Pipeline flags the skill for review
2. Validation dialogue: "NativeWind 4.1 released. The animation flicker fix should no longer be needed. Should I archive the workaround skill?"
3. User confirms
4. Skill archived (moved to `.claude/skills/_archived/nativewind-animation-fix/`)
5. CLAUDE.md entry updated: ~~NativeWind < 4.1 flicker~~ → "Fixed in NativeWind 4.1"

**This is memory lifecycle in action: encoding → active use → supersession → archival.**

---

## Scenario L7: Learning Daily Patterns (Homeostasis + Memory)

### OBSERVE

**Events over 5 work days (Linux + HomeAssistant):**
```
Day 1: office_door open 08:55, desk_lamp on 09:00, first_commit 09:15, lunch_break 12:00-13:00, last_commit 17:30, desk_lamp off 17:45
Day 2: office_door open 09:10, desk_lamp on 09:15, first_commit 09:30, lunch_break 12:15-13:00, last_commit 18:00, desk_lamp off 18:10
Day 3: office_door open 08:45, desk_lamp on 08:50, first_commit 09:10, lunch_break 12:00-12:45, last_commit 17:15, desk_lamp off 17:30
Day 4: office_door open 09:05, desk_lamp on 09:10, first_commit 09:20, lunch_break 12:30-13:15, last_commit 17:45, desk_lamp off 18:00
Day 5: office_door open 08:50, desk_lamp on 08:55, first_commit 09:05, lunch_break 12:00-13:00, last_commit 17:30, desk_lamp off 17:45
```

### EXTRACT

```
Daily pattern detected (5 day sample):
  Work start: ~09:00 (±15 min)
  First productive action: ~09:15 (desk lamp → first commit = 15 min warm-up)
  Lunch: ~12:00-13:00
  Work end: ~17:30-18:00

  Inferred:
  - Best time for deep work: 09:30-12:00 (morning focus block)
  - Post-lunch energy dip: 13:00-14:00 (light tasks)
  - End-of-day: 16:30+ (wrap-up, PR reviews, communication)

  Confidence: 0.75 (5 days, consistent but small sample)
```

### WRITE

**File updated: `CLAUDE.md`** (appended):

```markdown
## Work Patterns
- Work hours: approximately 09:00 - 17:30
- Best focus time: mornings (09:30-12:00) — schedule deep work here
- Lunch: ~12:00-13:00
- After lunch: lighter tasks, code reviews
- End of day: wrap-up, communication, PR reviews
```

### USE — Homeostasis dimensions informed by patterns

**The agent now has temporal awareness:**

- 08:00 message from PM: Agent knows user isn't at desk yet → don't expect immediate response (communication_health: fine)
- 09:30 agent has complex task: Optimal time for deep work → proceed without interruption
- 12:15 no response from user: Lunch break → don't flag as "going dark" (communication_health: fine)
- 16:45 agent finishes feature: End of day approaching → prioritize PR submission over starting new work

**Without learned patterns**: Agent would nag at lunch, start deep work at 16:30, or worry about silence at 12:15.

---

## Scenario L8: Consolidation — Episodes Becoming a Procedure

### OBSERVE

**Week 1, Day 2:** User submits PR manually
```
git push origin feature/user-profile
# Opens GitLab, creates MR manually
# Posts in Discord: "PR ready: <link>"
```

**Week 1, Day 4:** User submits another PR similarly
```
git push origin feature/settings-screen
# Creates MR via CLI: glab mr create
# Posts in Discord: "PR ready for settings screen"
```

**Week 2, Day 1:** User refines process
```
git push origin feature/orders-list
# Runs tests first: pnpm test
# Creates MR: glab mr create --title "feat: order list" --description "..."
# Posts in Discord with link
```

### EXTRACT

**After Day 2 (single episode, no skill yet):**
```
Episode stored: "User submitted PR for user-profile feature"
No skill generated — only 1 occurrence.
```

**After Day 4 (pattern emerges):**
```
Pattern: 2 similar episodes of PR submission
  Common steps: push, create MR, post in Discord
  Variations: GitLab UI vs CLI
  Confidence: 0.6 (2 occurrences, some variation)
```

Validation dialogue:
```
Agent: "I see you push, create MR, then post in Discord. Is that the standard workflow?"
User: "Yes, and always run tests first. I forgot on the first one."
```

**After Week 2, Day 1 (procedure solidifies):**
```
Pattern: 3 occurrences, user confirmed process, added "run tests first"
Confidence: 0.90
```

### WRITE

**Nothing written after Day 2** — too early, only 1 episode.

**After Day 4 validation, preliminary CLAUDE.md entry:**
```markdown
## Workflow
- PR process: push → create MR → post in Discord
- Always run tests before pushing
```

**After Week 2, Day 1 (procedure mature enough for skill):**

**File created: `.claude/skills/submit-pr/SKILL.md`**

```markdown
---
name: submit-pr
description: Submit a pull request following the team's workflow. Run tests, push, create MR in GitLab, notify team in Discord.
metadata:
  confidence: 0.90
  times_observed: 3
---

# Submit a Pull Request

## Pre-submission
1. Run the test suite:
   ```bash
   pnpm test
   ```
2. Fix any failures before proceeding.

## Submit
3. Push to feature branch:
   ```bash
   git push origin feature/<branch-name>
   ```

4. Create merge request in GitLab:
   ```bash
   glab mr create --title "<type>: <description>" --description "<details>"
   ```
   Types: feat, fix, refactor, docs, test

5. Notify team in Discord #mobile-dev:
   ```
   PR ready: <MR link>
   ```

## Notes
- Always run tests first — reviewer will check
- Include null checks on user objects (common feedback)
- MR description should explain the "why", not just the "what"
```

### USE — Agent submits its first PR

```
Agent-Dev-1 finishes implementing a feature.
```

**What happens:**
1. Homeostasis: progress_momentum → "task complete, ready to submit"
2. "submit-pr" skill matches
3. Agent follows steps: test → push → MR → Discord notification
4. Process matches team expectations exactly
5. PM sees PR notification in Discord — agent behaves like a trained team member

---

## Scenario L9: Memory Tier Upgrade — When CLAUDE.md Gets Too Big

### OBSERVE

After 4 weeks of shadow training + 2 weeks of deployment:
- 47 semantic facts in CLAUDE.md
- 12 skills generated
- 3 hard rules
- Cross-agent observations accumulating

### THE PROBLEM

CLAUDE.md is now ~3,000 tokens. Skills descriptions consume ~2,000 tokens. Total Tier 1 memory: ~5,000 tokens loaded every conversation.

That's fine for now. But at 12 weeks:
- ~150 facts
- ~30 skills
- Cross-agent patterns
- CLAUDE.md: ~10,000 tokens
- Skills descriptions: ~6,000 tokens
- Total: ~16,000 tokens → hitting context budget ceiling

### UPGRADE PATH

**Phase 1 (Week 1-6): Tier 1 — CLAUDE.md + Skills**
- Everything in files, loaded at startup
- Simple, no infrastructure needed
- Works for up to ~50 facts, ~20 skills

**Phase 2 (Week 6-12): Tier 2 — Structured files + selective loading**
- Split CLAUDE.md into sections:
  - `CLAUDE.md` — hard rules + most important facts only (~20 entries)
  - `memory/facts/auth.md` — auth-related facts
  - `memory/facts/workflow.md` — workflow facts
  - `memory/facts/team.md` — team/people facts
- Skills stay as individual SKILL.md files (progressive disclosure handles them)
- Agent loads relevant fact files on demand (like loading a skill)

**Phase 3 (Month 3+): Tier 3 — RAG / Mem0**
- Facts indexed with embeddings for semantic search
- Agent queries: "What do I know about auth?" → retrieves relevant facts
- Skills: still file-based (progressive disclosure sufficient)
- Episodes: indexed for temporal queries ("what happened last week?")

### WRITE (when upgrading to Tier 2)

Split `CLAUDE.md` into:

**`CLAUDE.md`** (stays small, ~500 tokens):
```markdown
# Project Memory

## Hard Rules (always loaded)
- NEVER use Realm database
- NEVER push to main
- NEVER commit secrets

## Core Preferences (always loaded)
- Expo + expo-router + NativeWind + TypeScript
- Clerk for mobile auth (not JWT)
- pnpm for package management

## Extended Memory
See `memory/` directory for detailed facts by topic.
Agent: load relevant memory files when working on a specific domain.
```

**`memory/facts/auth.md`**:
```markdown
# Authentication Knowledge
- Clerk for mobile auth, JWT for web backends
- @clerk/clerk-expo package
- JWT has token refresh issues on mobile
- ClerkProvider wraps the root layout
...
```

**`memory/facts/ui-design.md`**:
```markdown
# UI/Design Knowledge
- NativeWind for styling (Tailwind in React Native)
- Liquid Glass for premium UI (iOS only, gradient fallback on Android)
- expo-blur for glass effects (heavy on Android)
...
```

### USE

When agent gets a task about auth:
1. CLAUDE.md (always loaded): "Clerk for mobile auth"
2. Agent recognizes auth domain → loads `memory/facts/auth.md`
3. Full auth context available without loading UI/design facts

---

## Summary: The Learning Lifecycle

```
EVENTS (any source, OTEL)
    │
    ▼
OBSERVATION (batch processing, session detection)
    │
    ▼
EXTRACTION (pattern matching + LLM enrichment)
    │
    ├── Single occurrence → Episode log (no skill yet)
    ├── 2+ occurrences → CLAUDE.md entry (confidence 0.6-0.8)
    ├── 3+ occurrences + validation → SKILL.md (confidence 0.8+)
    └── Explicit user statement → CLAUDE.md immediately (confidence 1.0)
    │
    ▼
CONSOLIDATION (over time)
    │
    ├── Used successfully → confidence increases
    ├── Used, failed → skill updated, episode logged
    ├── Not used for 60+ days → confidence decays
    ├── Superseded by new info → archived
    └── Memory grows → tier upgrade (CLAUDE.md → structured files → RAG)
    │
    ▼
USAGE (by agent in context)
    │
    ├── Skill exists → System 1 (follow procedure)
    ├── Fact exists → informed reasoning
    ├── Hard rule exists → absolute constraint
    └── Nothing exists → System 2 (LLM reasons from scratch)
        └── Homeostasis detects gap → drives research/ask behavior
```

---

*Learning scenarios document, 2026-02-11*
*Key insight: Learning output = standard ecosystem formats (SKILL.md + CLAUDE.md), not custom database tables.*
*Memory lifecycle follows psychological model: encoding → consolidation → retrieval → reconsolidation → decay.*
