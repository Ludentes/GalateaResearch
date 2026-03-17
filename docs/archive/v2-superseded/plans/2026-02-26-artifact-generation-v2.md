# Artifact Generation v2 — Shadow → Audit → Export

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace auto-regeneration with manual audit + export flow: fix signal classifier bugs, tighten dedup, add schema fields for curation overrides, build audit API + web UI, build export API + web UI with diff preview.

**Architecture:** Six phases: (1) signal classifier fixes for better heuristic recall, (2) dedup threshold tightening, (3) KnowledgeEntry schema additions for content/target overrides, (4) Nitro API endpoints for audit CRUD + export, (5) command center audit UI, (6) export UI with diff preview. All changes are in the `evidence-based-memory` worktree.

**Tech Stack:** TypeScript, Vitest, h3/Nitro (API routes), TanStack Router + React Query (UI), shadcn/ui, existing pipeline infrastructure

**Key design decisions (from previous analysis):**
- Manual export only (no auto-regeneration)
- Web UI audit in command center (not chat-based)
- Content editing + target override supported
- Option C curation: auto-approve explicit statements, require curation for artifacts only
- Heuristics-only for artifact path (A+C strategy)
- Context assembly ignores curationStatus (uses all entries)

**Scenarios covered:** S1-S10 from `docs/plans/2026-02-26-shadow-audit-export-scenarios.md`

---

## Phase 1: Signal Classifier Fixes

### Task 1: Fix Bug 1 — sentence-scoped `isLikelyQuestion`

**Files:**
- Modify: `server/memory/__tests__/signal-classifier.test.ts`
- Modify: `server/memory/signal-classifier.ts`

**Step 1: Write failing test**

Add to `signal-classifier.test.ts`:

```typescript
describe("sentence-scoped question check", () => {
  it("classifies declarative statement in message ending with question", () => {
    const turn: TranscriptTurn = {
      role: "user",
      content:
        "For forseeable future the kiosks are WIndows based, but we should support Linux as well. Do we need explicit modelling like availableCommands or do we just hard code this in our software?",
    }
    const result = classifyTurn(turn)
    expect(result.type).toBe("policy")
    expect(result.match).toContain("we should")
  })

  it("still rejects pure questions with signal words", () => {
    const turn: TranscriptTurn = {
      role: "user",
      content: "Should we always use pnpm instead of npm?",
    }
    const result = classifyTurn(turn)
    expect(result.type).not.toBe("policy")
  })

  it("catches imperative rule in mixed message", () => {
    const turn: TranscriptTurn = {
      role: "user",
      content:
        "Never push directly to main. What do you think about branch protection?",
    }
    const result = classifyTurn(turn)
    expect(result.type).toBe("imperative_rule")
  })
})
```

**Step 2: Run tests to verify failure**

Run: `pnpm vitest run server/memory/__tests__/signal-classifier.test.ts -v`
Expected: First and third tests FAIL (question check rejects the whole message)

**Step 3: Implement sentence-scoped question check**

In `signal-classifier.ts`, replace the `isLikelyQuestion` check block (lines 71-75) with:

```typescript
      // Questions with signal patterns are usually asking, not stating
      // Exception: @remember and @forget are always intentional
      // Scope check to the sentence containing the match, not the full text
      if (type !== "remember" && type !== "forget") {
        const matchStart = m.index ?? 0
        const matchEnd = matchStart + m[0].length

        // Find the sentence boundary after the match
        const afterMatch = text.slice(matchEnd)
        const sentenceEndMatch = afterMatch.match(/[.!?]/)
        const sentenceEnd = sentenceEndMatch
          ? matchEnd + (sentenceEndMatch.index ?? 0) + 1
          : text.length

        // Extract the sentence containing the match
        const sentenceBeforeStart = text.lastIndexOf(".", matchStart - 1)
        const sentenceStart =
          sentenceBeforeStart >= 0 ? sentenceBeforeStart + 1 : 0
        const matchedSentence = text.slice(sentenceStart, sentenceEnd).trim()

        if (/\?\s*$/.test(matchedSentence)) {
          continue
        }
      }
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run server/memory/__tests__/signal-classifier.test.ts -v`
Expected: ALL tests pass

**Step 5: Commit**

```
git add server/memory/signal-classifier.ts server/memory/__tests__/signal-classifier.test.ts
git commit -m "fix: scope isLikelyQuestion to matched sentence, not full text"
```

---

### Task 2: Tighten cosine dedup threshold 0.85 → 0.90

**Files:**
- Modify: `server/engine/config.yaml`
- Modify: `server/memory/__tests__/signal-classifier.test.ts` (or a new dedup threshold test)

**Step 1: Write test verifying the config value**

Add to an existing or new test file (`server/memory/__tests__/knowledge-store.test.ts` if it exists, otherwise add inline):

```typescript
import { getDedupConfig } from "../../engine/config"

describe("dedup config", () => {
  it("uses tightened cosine threshold", () => {
    const cfg = getDedupConfig()
    expect(cfg.embedding_cosine_threshold).toBe(0.90)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run server/memory/__tests__/knowledge-store.test.ts -v`
Expected: FAIL (current value is 0.85)

**Step 3: Change config value**

In `server/engine/config.yaml` line 105, change:

```yaml
  embedding_cosine_threshold: 0.90
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run server/memory/__tests__/knowledge-store.test.ts -v`
Expected: PASS

**Step 5: Commit**

```
git add server/engine/config.yaml server/memory/__tests__/knowledge-store.test.ts
git commit -m "feat: tighten cosine dedup threshold from 0.85 to 0.90"
```

---

### Task 3: Fix Bug 2 — split numbered lists for per-item classification

**Files:**
- Modify: `server/memory/__tests__/heuristic-extractor.test.ts`
- Modify: `server/memory/heuristic-extractor.ts`

**Step 1: Write failing tests**

Add to `heuristic-extractor.test.ts`:

```typescript
describe("numbered list splitting", () => {
  it("splits numbered list into individual items and re-classifies each", () => {
    const turn: TranscriptTurn = {
      role: "user",
      content:
        "1) let's have both - Patreon and Nebula\n2) we no need streams, text content is required, donations later\n3) ignore all focuments from 00 i didn't mention, they can be outdated",
    }
    const classification = classifyTurn(turn)
    expect(classification.type).toBe("procedure")

    const result = extractHeuristic(turn, classification, "session:test")
    // Item 1 should be a decision ("let's have both")
    // Item 3 should be a rule ("ignore all...")
    expect(result.entries.length).toBeGreaterThanOrEqual(2)
    const types = result.entries.map((e) => e.type)
    expect(types).toContain("decision")
  })

  it("keeps genuine multi-step procedures intact", () => {
    const turn: TranscriptTurn = {
      role: "user",
      content:
        "1) Run the linter\n2) Fix any issues\n3) Run the test suite\n4) Push to feature branch",
    }
    const classification = classifyTurn(turn)
    const result = extractHeuristic(turn, classification, "session:test")
    // No sub-items match signal patterns, so stays as procedure
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].type).toBe("procedure")
  })
})
```

**Step 2: Run tests to verify failure**

Run: `pnpm vitest run server/memory/__tests__/heuristic-extractor.test.ts -v`
Expected: First test FAILS (numbered list becomes single procedure)

**Step 3: Implement numbered list splitting**

In `heuristic-extractor.ts`, add helper function before `extractHeuristic`:

```typescript
/**
 * Split a numbered list into individual items.
 * Handles: "1) text", "1. text", "1- text"
 */
function splitNumberedItems(text: string): { index: number; content: string }[] {
  const lines = text.split("\n")
  const items: { index: number; content: string }[] = []
  let current: { index: number; lines: string[] } | null = null

  for (const line of lines) {
    const m = line.match(/^\s*(\d+)[.)]\s*(.*)/)
    if (m) {
      if (current) {
        items.push({
          index: current.index,
          content: current.lines.join("\n").trim(),
        })
      }
      current = { index: Number(m[1]), lines: [m[2]] }
    } else if (current && line.trim()) {
      current.lines.push(line.trim())
    }
  }
  if (current) {
    items.push({
      index: current.index,
      content: current.lines.join("\n").trim(),
    })
  }

  return items
}
```

Then in `extractHeuristic`, after `classification.type === "procedure"` is detected but BEFORE `extractProcedureSteps` is called, add:

```typescript
    if (classification.type === "procedure") {
      // Try splitting numbered list items and re-classifying each
      const items = splitNumberedItems(text)
      if (items.length >= 2) {
        const subEntries: KnowledgeEntry[] = []
        for (const item of items) {
          const subTurn: TranscriptTurn = {
            role: "user",
            content: item.content,
          }
          const subClass = classifyTurn(subTurn)
          if (
            subClass.type !== "noise" &&
            subClass.type !== "factual" &&
            subClass.type !== "procedure"
          ) {
            const subResult = extractHeuristic(
              subTurn,
              subClass,
              source,
              precedingTurn,
            )
            subEntries.push(...subResult.entries)
          }
        }
        if (subEntries.length > 0) {
          return { entries: subEntries, handled: true }
        }
      }
      // Fall through to normal procedure extraction
      // ... existing extractProcedureSteps logic ...
    }
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run server/memory/__tests__/heuristic-extractor.test.ts -v`
Expected: ALL tests pass

**Step 5: Commit**

```
git add server/memory/heuristic-extractor.ts server/memory/__tests__/heuristic-extractor.test.ts
git commit -m "feat: split numbered lists for per-item signal classification"
```

---

### Task 4: Add constraint answer pattern (Gap 3)

**Files:**
- Modify: `server/memory/__tests__/signal-classifier.test.ts`
- Modify: `server/memory/signal-classifier.ts`

**Step 1: Write failing test**

```typescript
describe("constraint answer detection", () => {
  it("detects lettered option selection as decision", () => {
    const turn: TranscriptTurn = {
      role: "user",
      content: "A) 50 characters max\nlimit in DB layer, no need extra check in code",
    }
    const result = classifyTurn(turn)
    expect(result.type).toBe("decision")
  })

  it("detects numeric constraint specification as decision", () => {
    const turn: TranscriptTurn = {
      role: "user",
      content: "max 100 characters for the title field",
    }
    const result = classifyTurn(turn)
    expect(result.type).toBe("decision")
  })
})
```

**Step 2: Run tests to verify failure**

Run: `pnpm vitest run server/memory/__tests__/signal-classifier.test.ts -v`
Expected: Both FAIL

**Step 3: Add patterns to SIGNAL_PATTERNS**

In `signal-classifier.ts`, add before the `procedure` pattern in `SIGNAL_PATTERNS`:

```typescript
  // Lettered option selection (answering assistant's structured question)
  option_selection: /^\s*[a-dA-D][.)]\s+\S/m,
  // Constraint specification (limits, caps, thresholds with numbers)
  constraint: /\b(max|min|limit|cap|threshold|maximum|minimum)\b.*\d+/i,
```

Both should map to `decision` type. In the classification loop, add mapping:

```typescript
      // Map option_selection and constraint to decision type
      const effectiveType =
        type === "option_selection" || type === "constraint" ? "decision" : type
```

And use `effectiveType` in the return instead of `type as SignalType`.

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run server/memory/__tests__/signal-classifier.test.ts -v`
Expected: ALL tests pass

**Step 5: Commit**

```
git add server/memory/signal-classifier.ts server/memory/__tests__/signal-classifier.test.ts
git commit -m "feat: add option selection and constraint answer patterns to signal classifier"
```

---

## Phase 2: Schema & Store Updates

### Task 5: Add content/target override fields to KnowledgeEntry

**Files:**
- Modify: `server/memory/types.ts`
- Modify: `server/memory/channel-router.ts`
- Modify: `server/memory/artifact-generator.ts`
- Create: `server/memory/__tests__/channel-router.test.ts`

**Step 1: Write failing tests for override behavior**

Create `server/memory/__tests__/channel-router.test.ts`:

```typescript
// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("../../engine/config", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/config")>()
  return {
    ...orig,
    getArtifactConfig: vi.fn(() => ({
      claude_md: {
        max_lines: 200,
        min_confidence: 0.80,
        require_curation: true,
        architecture_preamble: "# Test",
      },
      skills: {
        max_count: 3,
        max_lines_per_skill: 50,
        min_confidence: 0.85,
        require_curation: true,
        staleness_sessions: 10,
      },
      hooks: {
        auto_convert: false,
        learned_patterns_file: "learned-hooks.json",
      },
      prior_overlap: {
        common_patterns: ["write.*tests?", "git|commit|push"],
      },
    })),
  }
})

import { routeEntries } from "../channel-router"
import type { KnowledgeEntry } from "../types"

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: crypto.randomUUID(),
    type: "rule",
    content: "Never push directly to main",
    confidence: 0.95,
    entities: [],
    source: "session:test",
    extractedAt: new Date().toISOString(),
    novelty: "project-specific",
    origin: "explicit-statement",
    curationStatus: "approved",
    ...overrides,
  }
}

describe("routeEntries with overrides", () => {
  it("respects targetOverride to route rule to hook", () => {
    const entry = makeEntry({
      content: "Use pnpm, not npm",
      targetOverride: "hook",
    })
    const result = routeEntries([entry])
    expect(result.hooks.entries).toHaveLength(1)
    expect(result.claudeMd.entries).toHaveLength(0)
  })

  it("respects targetOverride to route to none (knowledge store only)", () => {
    const entry = makeEntry({
      content: "Sentinel uses 3-tier watchdog recovery",
      targetOverride: "none",
    })
    const result = routeEntries([entry])
    expect(result.claudeMd.entries).toHaveLength(0)
    expect(result.hooks.entries).toHaveLength(0)
    expect(result.skills.entries).toHaveLength(0)
    expect(result.skipped.entries).toHaveLength(1)
  })

  it("uses contentOverride in generated artifacts when present", () => {
    const entry = makeEntry({
      content: "in case of update in typeorm for nullable field we should specify null",
      contentOverride: "TypeORM: use null (not undefined) for nullable field updates",
    })
    const result = routeEntries([entry])
    // The routed entry should exist
    expect(result.claudeMd.entries).toHaveLength(1)
  })
})
```

**Step 2: Run test to verify failure**

Run: `pnpm vitest run server/memory/__tests__/channel-router.test.ts -v`
Expected: FAIL (targetOverride/contentOverride fields don't exist)

**Step 3: Add fields to types.ts**

In `server/memory/types.ts`, add to `KnowledgeEntry` interface after `targetChannel`:

```typescript
  // Developer overrides (set during audit)
  contentOverride?: string    // Developer-edited version of content
  targetOverride?: "claude-md" | "skill" | "hook" | "none"  // Override computed target
```

**Step 4: Wire targetOverride into channel-router.ts**

In `routeEntries`, after the `active` filter (line 46) and before the routing loop, add at the top of the `for` loop:

```typescript
    // Developer override takes precedence over computed routing
    if (entry.targetOverride) {
      const override = entry.targetOverride
      if (override === "none") {
        skipped.push(
          addDecision(entry, {
            stage: "router",
            action: "skip",
            reason: "developer override → none",
            inputs: { targetOverride: override },
            pipelineRunId: runId,
          }),
        )
        skipReasons.push("developer override → none")
        continue
      }
      if (override === "hook") {
        hooks.push(
          addDecision({ ...entry, targetChannel: "hook" }, {
            stage: "router",
            action: "route",
            reason: "developer override → hook",
            inputs: { targetOverride: override },
            pipelineRunId: runId,
          }),
        )
        continue
      }
      if (override === "skill") {
        skills.push(
          addDecision({ ...entry, targetChannel: "skill" }, {
            stage: "router",
            action: "route",
            reason: "developer override → skill",
            inputs: { targetOverride: override },
            pipelineRunId: runId,
          }),
        )
        continue
      }
      if (override === "claude-md") {
        claudeMd.push(
          addDecision({ ...entry, targetChannel: "claude-md" }, {
            stage: "router",
            action: "route",
            reason: "developer override → claude-md",
            inputs: { targetOverride: override },
            pipelineRunId: runId,
          }),
        )
        continue
      }
    }
```

**Step 5: Wire contentOverride into artifact-generator.ts**

In `generateClaudeMdFromRouter`, change the content rendering line (line 90):

```typescript
      sections.push(`- ${entry.contentOverride ?? entry.content}`)
```

Similarly in `generateSkillFilesFromRouter` (line 137-140):

```typescript
    const displayContent = entry.contentOverride ?? entry.content
    const contentLines = displayContent.split("\n")
```

**Step 6: Run tests to verify they pass**

Run: `pnpm vitest run server/memory/__tests__/channel-router.test.ts -v`
Expected: ALL tests pass

Also run full test suite: `pnpm vitest run server/memory/__tests__/ -v`

**Step 7: Commit**

```
git add server/memory/types.ts server/memory/channel-router.ts server/memory/artifact-generator.ts server/memory/__tests__/channel-router.test.ts
git commit -m "feat: add contentOverride and targetOverride to KnowledgeEntry"
```

---

## Phase 3: Audit API

### Task 6: Add curation API endpoints

**Files:**
- Create: `server/routes/api/agent/knowledge.patch.ts` (update single entry)
- Create: `server/routes/api/agent/knowledge/bulk.post.ts` (bulk approve/reject)
- Create: `server/routes/api/agent/knowledge/stats.get.ts` (audit stats)

These files go in the main repo (not the worktree — the worktree doesn't have `server/routes/`). Check if the routes directory exists in the worktree; if not, create it.

**Step 1: Create PATCH endpoint for single entry curation**

Create `server/routes/api/agent/knowledge.patch.ts`:

```typescript
import { defineEventHandler, readBody } from "h3"
import { readEntries, writeEntries } from "../../../memory/knowledge-store"

/**
 * PATCH /api/agent/knowledge
 * Update a single knowledge entry (curation: approve/reject, edit content, change target).
 *
 * Body: {
 *   id: string                           // entry ID
 *   curationStatus?: "approved" | "rejected"
 *   contentOverride?: string             // developer-edited content
 *   targetOverride?: "claude-md" | "skill" | "hook" | "none"
 * }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { id, curationStatus, contentOverride, targetOverride } = body

  if (!id) {
    throw new Error("Missing required field: id")
  }

  const storePath = "data/memory/entries.jsonl"
  const entries = await readEntries(storePath)
  const index = entries.findIndex((e) => e.id === id)

  if (index === -1) {
    throw new Error(`Entry not found: ${id}`)
  }

  const entry = entries[index]
  const now = new Date().toISOString()

  if (curationStatus !== undefined) {
    entry.curationStatus = curationStatus
    entry.curatedAt = now
    entry.curatedBy = "human"
  }

  if (contentOverride !== undefined) {
    entry.contentOverride = contentOverride
  }

  if (targetOverride !== undefined) {
    entry.targetOverride = targetOverride
  }

  entries[index] = entry
  await writeEntries(entries, storePath)

  return { ok: true, entry }
})
```

**Step 2: Create bulk action endpoint**

Create `server/routes/api/agent/knowledge/bulk.post.ts`:

```typescript
import { defineEventHandler, readBody } from "h3"
import { readEntries, writeEntries } from "../../../../memory/knowledge-store"

/**
 * POST /api/agent/knowledge/bulk
 * Bulk approve or reject entries.
 *
 * Body: {
 *   ids: string[]
 *   curationStatus: "approved" | "rejected"
 * }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { ids, curationStatus } = body

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("Missing required field: ids (non-empty array)")
  }
  if (curationStatus !== "approved" && curationStatus !== "rejected") {
    throw new Error("curationStatus must be 'approved' or 'rejected'")
  }

  const storePath = "data/memory/entries.jsonl"
  const entries = await readEntries(storePath)
  const idSet = new Set(ids)
  const now = new Date().toISOString()
  let updated = 0

  for (const entry of entries) {
    if (idSet.has(entry.id)) {
      entry.curationStatus = curationStatus
      entry.curatedAt = now
      entry.curatedBy = "human"
      updated++
    }
  }

  await writeEntries(entries, storePath)
  return { ok: true, updated }
})
```

**Step 3: Extend the existing knowledge.get.ts to support curationStatus filter**

Modify `server/routes/api/agent/knowledge.get.ts` — add after the entity filter:

```typescript
  // Filter by curation status
  if (query.curationStatus) {
    filtered = filtered.filter((e) => e.curationStatus === query.curationStatus)
  }

  // Filter by target channel (computed or override)
  if (query.targetChannel) {
    filtered = filtered.filter(
      (e) =>
        e.targetOverride === query.targetChannel ||
        e.targetChannel === query.targetChannel,
    )
  }
```

Add to stats:

```typescript
    byCuration: Object.fromEntries(
      ["pending", "approved", "rejected"].map((s) => [
        s,
        entries.filter(
          (e) => e.curationStatus === s && !e.supersededBy,
        ).length,
      ]),
    ),
```

**Step 4: Commit**

```
git add server/routes/
git commit -m "feat: add audit API endpoints (PATCH single, POST bulk, GET stats)"
```

---

## Phase 4: Export API

### Task 7: Add export endpoint with diff preview

**Files:**
- Create: `server/routes/api/agent/export.post.ts`
- Create: `server/routes/api/agent/export/preview.get.ts`

**Step 1: Create export preview endpoint**

Create `server/routes/api/agent/export/preview.get.ts`:

```typescript
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { defineEventHandler } from "h3"
import { routeEntries } from "../../../../memory/channel-router"
import { readEntries } from "../../../../memory/knowledge-store"

/**
 * GET /api/agent/export/preview
 * Generate artifact previews without writing to disk.
 * Returns: what would be exported + diff against current files.
 */
export default defineEventHandler(async () => {
  const storePath = "data/memory/entries.jsonl"
  const outputDir = ".claude"

  const entries = await readEntries(storePath)
  const routed = routeEntries(entries)

  // Build CLAUDE.md preview
  const claudeMdSections: string[] = []
  const cfg = (await import("../../../../engine/config")).getArtifactConfig()
  claudeMdSections.push(cfg.claude_md.architecture_preamble, "")

  const sectionOrder = ["rule", "preference", "correction", "decision", "fact"]
  const headings: Record<string, string> = {
    rule: "## Rules",
    preference: "## Preferences",
    correction: "## Corrections",
    decision: "## Decisions",
    fact: "## Facts",
  }

  for (const type of sectionOrder) {
    const group = routed.claudeMd.entries.filter(
      (e) => e.type === type && e.type !== "procedure",
    )
    if (group.length === 0) continue
    claudeMdSections.push(headings[type], "")
    for (const entry of group) {
      claudeMdSections.push(`- ${entry.contentOverride ?? entry.content}`)
    }
    claudeMdSections.push("")
  }

  const newClaudeMd = claudeMdSections.join("\n")

  // Read existing CLAUDE.md for diff
  const claudeMdPath = path.join(outputDir, "CLAUDE.md")
  const existingClaudeMd = existsSync(claudeMdPath)
    ? await readFile(claudeMdPath, "utf-8")
    : null

  return {
    claudeMd: {
      preview: newClaudeMd,
      existing: existingClaudeMd,
      lines: newClaudeMd.split("\n").length,
      entryCount: routed.claudeMd.entries.length,
      isNew: !existingClaudeMd,
    },
    skills: {
      entries: routed.skills.entries.map((e) => ({
        id: e.id,
        content: e.contentOverride ?? e.content,
        confidence: e.confidence,
      })),
      count: routed.skills.count,
    },
    hooks: {
      count: routed.hooks.count,
    },
    skipped: {
      count: routed.skipped.entries.length,
      entries: routed.skipped.entries.map((e) => ({
        id: e.id,
        content: (e.contentOverride ?? e.content).slice(0, 80),
        type: e.type,
        reason:
          e.decisions?.[e.decisions.length - 1]?.reason ?? "unknown",
      })),
    },
    budget: {
      claudeMdLines: routed.claudeMd.lines,
      claudeMdMax: cfg.claude_md.max_lines,
      skillCount: routed.skills.count,
      skillMax: cfg.skills.max_count,
    },
  }
})
```

**Step 2: Create export confirm endpoint**

Create `server/routes/api/agent/export.post.ts`:

```typescript
import { defineEventHandler } from "h3"
import { generateAllArtifacts } from "../../../memory/artifact-generator"

/**
 * POST /api/agent/export
 * Actually write artifacts to disk.
 * The developer should have previewed first via GET /api/agent/export/preview.
 */
export default defineEventHandler(async () => {
  const storePath = "data/memory/entries.jsonl"
  const outputDir = ".claude"

  const result = await generateAllArtifacts(storePath, outputDir)

  return {
    ok: true,
    claudeMd: {
      written: result.claudeMd.written,
      lines: result.claudeMd.lines,
      entryCount: result.claudeMd.entryCount,
    },
    skills: {
      count: result.skills.count,
      files: result.skills.files,
    },
    hooks: {
      written: result.hooks.written,
      count: result.hooks.count,
    },
  }
})
```

**Step 3: Commit**

```
git add server/routes/api/agent/export.post.ts server/routes/api/agent/export/preview.get.ts
git commit -m "feat: add export API with preview and confirm endpoints"
```

---

## Phase 5: Audit Web UI

### Task 8: Create audit page in command center

**Files:**
- Create: `app/routes/agent/audit.tsx`
- Modify: existing nav (add Audit link to the nav bar in other agent pages)

**Step 1: Create audit page component**

Create `app/routes/agent/audit.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"

export const Route = createFileRoute("/agent/audit")({
  component: AuditPage,
})

function AuditPage() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState("pending")
  const [typeFilter, setTypeFilter] = useState("")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState("")
  const [editTarget, setEditTarget] = useState("")

  const params = new URLSearchParams()
  if (statusFilter) params.set("curationStatus", statusFilter)
  if (typeFilter) params.set("type", typeFilter)
  if (search) params.set("search", search)

  const { data, isLoading } = useQuery({
    queryKey: ["audit", statusFilter, typeFilter, search],
    queryFn: () =>
      fetch(`/api/agent/knowledge?${params}`).then((r) => r.json()),
  })

  const curateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch("/api/agent/knowledge", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["audit"] }),
  })

  const bulkMutation = useMutation({
    mutationFn: (body: { ids: string[]; curationStatus: string }) =>
      fetch("/api/agent/knowledge/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      setSelected(new Set())
      queryClient.invalidateQueries({ queryKey: ["audit"] })
    },
  })

  const entries = data?.entries ?? []
  const stats = data?.stats

  const toggleSelect = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const toggleSelectAll = () => {
    if (selected.size === entries.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(entries.map((e: any) => e.id)))
    }
  }

  const startEdit = (entry: any) => {
    setEditingId(entry.id)
    setEditContent(entry.contentOverride ?? entry.content)
    setEditTarget(entry.targetOverride ?? entry.targetChannel ?? "")
  }

  const saveEdit = () => {
    if (!editingId) return
    curateMutation.mutate({
      id: editingId,
      contentOverride: editContent,
      targetOverride: editTarget || undefined,
    })
    setEditingId(null)
  }

  const types = ["fact", "preference", "rule", "procedure", "correction", "decision"]
  const targets = ["claude-md", "skill", "hook", "none"]

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header + Nav */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Knowledge Audit</h1>
          <nav className="flex gap-4 text-sm">
            <Link to="/agent" className="text-muted-foreground hover:text-foreground">Status</Link>
            <Link to="/agent/knowledge" className="text-muted-foreground hover:text-foreground">Knowledge</Link>
            <Link to="/agent/audit" className="font-medium underline">Audit</Link>
            <Link to="/agent/export" className="text-muted-foreground hover:text-foreground">Export</Link>
          </nav>
        </div>

        {/* Stats */}
        {stats && (
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>Pending: {stats.byCuration?.pending ?? 0}</span>
            <span>Approved: {stats.byCuration?.approved ?? 0}</span>
            <span>Rejected: {stats.byCuration?.rejected ?? 0}</span>
            <span>Total: {stats.total}</span>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-4 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm bg-background"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm bg-background"
          >
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search content..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm bg-background"
          />
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div className="flex gap-2 items-center bg-muted/50 p-3 rounded">
            <span className="text-sm">{selected.size} selected</span>
            <button
              type="button"
              className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
              onClick={() =>
                bulkMutation.mutate({
                  ids: [...selected],
                  curationStatus: "approved",
                })
              }
            >
              Approve Selected
            </button>
            <button
              type="button"
              className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              onClick={() =>
                bulkMutation.mutate({
                  ids: [...selected],
                  curationStatus: "rejected",
                })
              }
            >
              Reject Selected
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && entries.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {statusFilter === "pending"
              ? "No pending entries. Start a coding session to begin learning."
              : "No entries match the current filters."}
          </div>
        )}

        {/* Entry list */}
        {isLoading ? (
          <div>Loading...</div>
        ) : (
          <div className="space-y-3">
            {entries.length > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.size === entries.length}
                  onChange={toggleSelectAll}
                />
                Select all
              </label>
            )}
            {entries.map((entry: any) => (
              <div
                key={entry.id}
                className="border rounded-lg p-4 space-y-2"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(entry.id)}
                    onChange={() => toggleSelect(entry.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted">
                        {entry.type}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        entry.curationStatus === "approved"
                          ? "bg-green-100 text-green-800"
                          : entry.curationStatus === "rejected"
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                      }`}>
                        {entry.curationStatus ?? "pending"}
                      </span>
                      {entry.targetChannel && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                          → {entry.targetOverride ?? entry.targetChannel}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {(entry.confidence * 100).toFixed(0)}% confidence
                      </span>
                    </div>

                    {editingId === entry.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full border rounded p-2 text-sm bg-background"
                          rows={3}
                        />
                        <div className="flex gap-2 items-center">
                          <label className="text-xs">Target:</label>
                          <select
                            value={editTarget}
                            onChange={(e) => setEditTarget(e.target.value)}
                            className="border rounded px-2 py-1 text-xs bg-background"
                          >
                            <option value="">Auto</option>
                            {targets.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="px-2 py-1 text-xs bg-blue-600 text-white rounded"
                            onClick={saveEdit}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 text-xs border rounded"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm">{entry.contentOverride ?? entry.content}</p>
                    )}

                    {entry.evidence && entry.evidence !== entry.content && (
                      <details className="text-xs text-muted-foreground">
                        <summary>Evidence</summary>
                        <p className="mt-1 italic">{entry.evidence}</p>
                      </details>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      className="px-2 py-1 text-xs border rounded hover:bg-muted"
                      onClick={() => startEdit(entry)}
                      title="Edit"
                    >
                      Edit
                    </button>
                    {entry.curationStatus !== "approved" && (
                      <button
                        type="button"
                        className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                        onClick={() =>
                          curateMutation.mutate({
                            id: entry.id,
                            curationStatus: "approved",
                          })
                        }
                      >
                        Approve
                      </button>
                    )}
                    {entry.curationStatus !== "rejected" && (
                      <button
                        type="button"
                        className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                        onClick={() =>
                          curateMutation.mutate({
                            id: entry.id,
                            curationStatus: "rejected",
                          })
                        }
                      >
                        Reject
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```
git add app/routes/agent/audit.tsx
git commit -m "feat: add knowledge audit page to command center"
```

---

### Task 9: Create export page in command center

**Files:**
- Create: `app/routes/agent/export.tsx`

**Step 1: Create export page component**

Create `app/routes/agent/export.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"

export const Route = createFileRoute("/agent/export")({
  component: ExportPage,
})

function ExportPage() {
  const queryClient = useQueryClient()
  const [exported, setExported] = useState(false)

  const { data: preview, isLoading } = useQuery({
    queryKey: ["export-preview"],
    queryFn: () =>
      fetch("/api/agent/export/preview").then((r) => r.json()),
  })

  const exportMutation = useMutation({
    mutationFn: () =>
      fetch("/api/agent/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).then((r) => r.json()),
    onSuccess: () => {
      setExported(true)
      queryClient.invalidateQueries({ queryKey: ["export-preview"] })
    },
  })

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header + Nav */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Export Artifacts</h1>
          <nav className="flex gap-4 text-sm">
            <Link to="/agent" className="text-muted-foreground hover:text-foreground">Status</Link>
            <Link to="/agent/audit" className="text-muted-foreground hover:text-foreground">Audit</Link>
            <Link to="/agent/export" className="font-medium underline">Export</Link>
          </nav>
        </div>

        {isLoading ? (
          <div>Generating preview...</div>
        ) : !preview ? (
          <div className="text-muted-foreground">Failed to load preview.</div>
        ) : (
          <>
            {/* Budget summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="border rounded p-4">
                <div className="text-sm text-muted-foreground">CLAUDE.md</div>
                <div className="text-2xl font-bold">
                  {preview.budget.claudeMdLines}/{preview.budget.claudeMdMax} lines
                </div>
                <div className="text-sm">{preview.claudeMd.entryCount} entries</div>
                {preview.claudeMd.isNew && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-1 rounded">New file</span>
                )}
              </div>
              <div className="border rounded p-4">
                <div className="text-sm text-muted-foreground">Skills</div>
                <div className="text-2xl font-bold">
                  {preview.budget.skillCount}/{preview.budget.skillMax} files
                </div>
              </div>
              <div className="border rounded p-4">
                <div className="text-sm text-muted-foreground">Hooks</div>
                <div className="text-2xl font-bold">{preview.hooks.count} patterns</div>
              </div>
            </div>

            {/* Skipped entries */}
            {preview.skipped.count > 0 && (
              <details className="border rounded p-4">
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  {preview.skipped.count} entries not exported (click to see)
                </summary>
                <div className="mt-2 space-y-1">
                  {preview.skipped.entries.map((e: any) => (
                    <div key={e.id} className="text-xs flex gap-2">
                      <span className="font-mono bg-muted px-1 rounded">{e.type}</span>
                      <span className="text-muted-foreground">{e.reason}</span>
                      <span className="truncate">{e.content}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* CLAUDE.md preview */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 text-sm font-medium flex justify-between">
                <span>.claude/CLAUDE.md Preview</span>
                <span className="text-muted-foreground">
                  {preview.claudeMd.lines} lines
                </span>
              </div>
              <pre className="p-4 text-sm overflow-auto max-h-96 bg-background">
                {preview.claudeMd.preview}
              </pre>
            </div>

            {/* Existing vs new diff indicator */}
            {preview.claudeMd.existing && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 text-sm font-medium">
                  Current .claude/CLAUDE.md
                </div>
                <pre className="p-4 text-sm overflow-auto max-h-48 bg-background text-muted-foreground">
                  {preview.claudeMd.existing}
                </pre>
              </div>
            )}

            {/* No approved entries state */}
            {preview.claudeMd.entryCount === 0 &&
              preview.skills.count === 0 &&
              preview.hooks.count === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No approved entries to export. Review pending entries in the Audit page first.
                </div>
              )}

            {/* Export button */}
            {(preview.claudeMd.entryCount > 0 ||
              preview.skills.count > 0 ||
              preview.hooks.count > 0) && (
              <div className="flex gap-4 items-center">
                <button
                  type="button"
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  onClick={() => exportMutation.mutate()}
                  disabled={exportMutation.isPending || exported}
                >
                  {exportMutation.isPending
                    ? "Exporting..."
                    : exported
                      ? "Exported! Commit to repo."
                      : "Export Artifacts"}
                </button>
                {exported && (
                  <span className="text-sm text-green-600">
                    Files written to .claude/. Review and commit to your repository.
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```
git add app/routes/agent/export.tsx
git commit -m "feat: add export page with preview, budget, and diff to command center"
```

---

## Phase 6: Gherkin Integration Tests

### Task 10: Add signal classifier Gherkin scenarios (S20-S21)

**Files:**
- Create: `server/__tests__/integration/signal-classifier-scenarios.test.ts`

These scenarios test the classifier fixes from Phase 1 through the full extraction pipeline.

**Step 1: Write Gherkin scenario tests**

Create `server/__tests__/integration/signal-classifier-scenarios.test.ts`:

```typescript
// @vitest-environment node
/**
 * Signal Classifier Improvement Scenarios
 *
 * Tests for fixes from docs/research/2026-02-26-signal-classifier-dedup-analysis.md
 * Covers Bug 1 (sentence-scoped isLikelyQuestion), Bug 2 (numbered list splitting),
 * and Gap 3 (constraint answer pattern).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"

vi.mock("../../engine/config", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/config")>()
  return {
    ...orig,
    getSignalConfig: () => ({
      greeting_max_length: 30,
      signal_confidence: 0.8,
      noise_confidence: 0.95,
      factual_min_length: 50,
      factual_confidence: 0.5,
      default_noise_confidence: 0.6,
    }),
    getArtifactConfig: () => ({
      claude_md: { max_lines: 200, min_confidence: 0.80, require_curation: true, architecture_preamble: "# Test" },
      skills: { max_count: 3, max_lines_per_skill: 50, min_confidence: 0.85, require_curation: true, staleness_sessions: 10 },
      hooks: { auto_convert: false, learned_patterns_file: "learned-hooks.json" },
      prior_overlap: { common_patterns: ["write.*tests?", "git|commit|push"] },
    }),
  }
})

import { classifyTurn } from "../../memory/signal-classifier"
import { extractHeuristic } from "../../memory/heuristic-extractor"
import type { TranscriptTurn } from "../../memory/types"

// ── S20: Declarative statement in message ending with question ──────
describe("S20: Sentence-scoped isLikelyQuestion (Bug 1 fix)", () => {
  it("recovers policy from mixed declarative+question message", () => {
    // Real miss — Umka item 9
    const turn: TranscriptTurn = {
      role: "user",
      content:
        "For forseeable future the kiosks are WIndows based, but we should support Linux as well. Do we need explicit modelling like availableCommands or do we just hard code this in our software?",
    }

    // Signal classifier should detect "we should" as policy
    const classification = classifyTurn(turn)
    expect(classification.type).toBe("policy")

    // Heuristic extractor should produce a rule entry
    const result = extractHeuristic(turn, classification, "session:umka")
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].type).toBe("rule")
    expect(result.entries[0].content).toContain("should support Linux")
  })

  it("still rejects when the matched sentence itself is a question", () => {
    const turn: TranscriptTurn = {
      role: "user",
      content: "Should we always deploy to staging first?",
    }
    const classification = classifyTurn(turn)
    // "we ... should" is in a question sentence, so it should not match policy
    expect(classification.type).not.toBe("policy")
  })

  it("recovers imperative rule followed by question", () => {
    const turn: TranscriptTurn = {
      role: "user",
      content: "Never push directly to main. What about branch protection rules?",
    }
    const classification = classifyTurn(turn)
    expect(classification.type).toBe("imperative_rule")

    const result = extractHeuristic(turn, classification, "session:test")
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].type).toBe("rule")
  })
})

// ── S21: Numbered list splitting for per-item classification ────────
describe("S21: Numbered list per-item re-classification (Bug 2 fix)", () => {
  it("splits numbered response into individual decisions/rules", () => {
    // Real miss — QP item 2
    const turn: TranscriptTurn = {
      role: "user",
      content:
        "1) let's have both - Patreon and Nebula\n2) we no need streams, text content is required, donations later\n3) ignore all focuments from 00 i didn't mention, they can be outdated",
    }

    const classification = classifyTurn(turn)
    expect(classification.type).toBe("procedure") // Still classified as procedure initially

    const result = extractHeuristic(turn, classification, "session:qp")
    // Item 1: "let's have both" → decision pattern
    // Item 3: "ignore all..." → imperative rule pattern
    // Should produce at least 2 entries, NOT a single procedure
    expect(result.entries.length).toBeGreaterThanOrEqual(2)

    const types = new Set(result.entries.map((e) => e.type))
    expect(types.has("decision")).toBe(true) // "let's have both"
  })

  it("keeps genuine multi-step procedures as single entry", () => {
    const turn: TranscriptTurn = {
      role: "user",
      content:
        "1) Run the linter to check formatting\n2) Fix any issues found\n3) Run the test suite\n4) Push to feature branch",
    }

    const classification = classifyTurn(turn)
    const result = extractHeuristic(turn, classification, "session:test")
    // No sub-items match signal patterns → stays as a single procedure
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].type).toBe("procedure")
  })
})

// ── S22: Constraint answer pattern (Gap 3 fix) ─────────────────────
describe("S22: Constraint answer and option selection patterns (Gap 3)", () => {
  it("detects lettered option answer as decision", () => {
    // Real miss — QP item 1
    const turn: TranscriptTurn = {
      role: "user",
      content: "A) 50 characters max\nlimit in DB layer, no need extra check in code",
    }

    const classification = classifyTurn(turn)
    expect(classification.type).toBe("decision")

    const result = extractHeuristic(turn, classification, "session:qp")
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].type).toBe("decision")
    expect(result.entries[0].content).toContain("50 characters")
  })
})
```

**Step 2: Run tests to verify they pass (after Phase 1 tasks)**

Run: `pnpm vitest run server/__tests__/integration/signal-classifier-scenarios.test.ts -v`
Expected: ALL pass (tests verify the Phase 1 fixes work end-to-end)

**Step 3: Commit**

```
git add server/__tests__/integration/signal-classifier-scenarios.test.ts
git commit -m "test: add Gherkin scenarios S20-S22 for signal classifier fixes"
```

---

### Task 11: Add audit → export Gherkin scenarios (S16-S19)

**Files:**
- Modify: `server/__tests__/integration/memory-lifecycle-scenarios.test.ts`

These scenarios test the new audit/export features from Phases 2-4.

**Step 1: Add scenario tests to existing lifecycle test file**

Append to `server/__tests__/integration/memory-lifecycle-scenarios.test.ts`:

```typescript
// ── S16: Developer overrides target channel (Scenario S3) ────────────
describe("S16: targetOverride routes entry to developer-chosen channel", () => {
  it("routes approved rule to hook when dev sets targetOverride", async () => {
    const entry = makeEntry({
      type: "rule",
      content: "Use pnpm, not npm",
      confidence: 0.95,
      origin: "explicit-statement",
      curationStatus: "approved",
      targetOverride: "hook",
    })

    const result = routeEntries([entry])
    expect(result.hooks.entries).toHaveLength(1)
    expect(result.claudeMd.entries).toHaveLength(0)
    expect(result.hooks.entries[0].targetChannel).toBe("hook")

    // Decision trace records the override
    const routerDecision = result.hooks.entries[0].decisions?.find(
      (d) => d.stage === "router",
    )
    expect(routerDecision?.reason).toContain("developer override")
  })

  it("routes to none when dev sets targetOverride to none", async () => {
    const entry = makeEntry({
      type: "fact",
      content: "Sentinel uses 3-tier watchdog recovery",
      confidence: 0.95,
      origin: "explicit-statement",
      curationStatus: "approved",
      targetOverride: "none",
    })

    const result = routeEntries([entry])
    expect(result.claudeMd.entries).toHaveLength(0)
    expect(result.hooks.entries).toHaveLength(0)
    expect(result.skills.entries).toHaveLength(0)
    expect(result.skipped.entries).toHaveLength(1)
  })
})

// ── S17: Developer edits content during audit (Scenario S2) ─────────
describe("S17: contentOverride used in artifact generation", () => {
  it("generated CLAUDE.md uses contentOverride when present", async () => {
    const entry = makeEntry({
      type: "rule",
      content: "in case of update in typeorm for nullable field we should specify null",
      confidence: 0.95,
      origin: "explicit-statement",
      curationStatus: "approved",
      contentOverride:
        "TypeORM: use null (not undefined) for nullable field updates",
    })

    await appendEntries([entry], STORE_PATH)

    const { generateClaudeMdFromRouter } = await import(
      "../../memory/artifact-generator"
    )
    const result = await generateClaudeMdFromRouter([entry], TEST_DIR)

    // Should use the developer-edited version, not the raw extraction
    expect(result.markdown).toContain("TypeORM: use null (not undefined)")
    expect(result.markdown).not.toContain(
      "in case of update in typeorm",
    )
  })

  it("falls back to original content when no contentOverride", async () => {
    const entry = makeEntry({
      type: "preference",
      content: "Use pnpm as the package manager",
      confidence: 0.95,
      origin: "explicit-statement",
      curationStatus: "approved",
    })

    const { generateClaudeMdFromRouter } = await import(
      "../../memory/artifact-generator"
    )
    const result = await generateClaudeMdFromRouter([entry], TEST_DIR)
    expect(result.markdown).toContain("Use pnpm as the package manager")
  })
})

// ── S18: Bulk curation updates (Scenario S10) ───────────────────────
describe("S18: Bulk approve/reject updates store entries", () => {
  it("bulk approve sets curationStatus on multiple entries", async () => {
    const entries = [
      makeEntry({
        content: "Use PostgreSQL for database",
        confidence: 0.95,
        origin: "explicit-statement",
        curationStatus: "pending",
      }),
      makeEntry({
        content: "Deploy to staging first",
        confidence: 0.95,
        origin: "explicit-statement",
        curationStatus: "pending",
      }),
      makeEntry({
        content: "Team uses conventional commits",
        confidence: 0.70,
        origin: "inferred",
        curationStatus: "pending",
      }),
    ]
    await appendEntries(entries, STORE_PATH)

    // Simulate bulk approve of first two
    const { readEntries, writeEntries } = await import(
      "../../memory/knowledge-store"
    )
    const stored = await readEntries(STORE_PATH)
    const idsToApprove = new Set([entries[0].id, entries[1].id])
    const now = new Date().toISOString()

    for (const e of stored) {
      if (idsToApprove.has(e.id)) {
        e.curationStatus = "approved"
        e.curatedAt = now
        e.curatedBy = "human"
      }
    }
    await writeEntries(stored, STORE_PATH)

    const after = await readEntries(STORE_PATH)
    const approved = after.filter((e) => e.curationStatus === "approved")
    const pending = after.filter((e) => e.curationStatus === "pending")

    expect(approved).toHaveLength(2)
    expect(pending).toHaveLength(1)
    expect(pending[0].content).toContain("conventional commits")
  })
})

// ── S19: Export generates artifacts from approved only (Scenario S1) ──
describe("S19: Export respects curation — only approved entries in artifacts", () => {
  it("generates CLAUDE.md with approved entries, excludes pending and rejected", async () => {
    const approved = makeEntry({
      type: "preference",
      content: "Use pnpm, not npm",
      confidence: 0.95,
      origin: "explicit-statement",
      curationStatus: "approved",
    })
    const pending = makeEntry({
      type: "fact",
      content: "Team uses conventional commits",
      confidence: 0.70,
      origin: "inferred",
      curationStatus: "pending",
    })
    const rejected = makeEntry({
      type: "rule",
      content: "Always use event-based sync",
      confidence: 0.90,
      origin: "explicit-statement",
      curationStatus: "rejected",
    })

    await appendEntries([approved, pending, rejected], STORE_PATH)

    const { generateAllArtifacts } = await import(
      "../../memory/artifact-generator"
    )
    const result = await generateAllArtifacts(STORE_PATH, TEST_DIR)

    expect(result.claudeMd.entryCount).toBe(1)
    expect(result.claudeMd.tracedEntries[0].content).toContain("pnpm")
    expect(result.skipped.count).toBe(2)
  })
})

// ── S23: Re-export after rejecting previously approved entry ────────
describe("S23: Re-export removes rejected entry from artifacts (Scenario S7)", () => {
  it("re-generates CLAUDE.md without a newly rejected entry", async () => {
    const { generateAllArtifacts } = await import(
      "../../memory/artifact-generator"
    )

    // First export: 2 approved entries
    const entry1 = makeEntry({
      type: "preference",
      content: "Use pnpm, not npm",
      confidence: 0.95,
      origin: "explicit-statement",
      curationStatus: "approved",
    })
    const entry2 = makeEntry({
      type: "decision",
      content: "Use PostgreSQL for database",
      confidence: 0.90,
      origin: "explicit-statement",
      curationStatus: "approved",
    })
    await appendEntries([entry1, entry2], STORE_PATH)

    const firstExport = await generateAllArtifacts(STORE_PATH, TEST_DIR)
    expect(firstExport.claudeMd.entryCount).toBe(2)

    // Developer rejects entry2
    const { readEntries, writeEntries } = await import(
      "../../memory/knowledge-store"
    )
    const entries = await readEntries(STORE_PATH)
    const toReject = entries.find((e) => e.id === entry2.id)!
    toReject.curationStatus = "rejected"
    toReject.curatedAt = new Date().toISOString()
    toReject.curatedBy = "human"
    await writeEntries(entries, STORE_PATH)

    // Re-export
    const secondExport = await generateAllArtifacts(STORE_PATH, TEST_DIR)
    expect(secondExport.claudeMd.entryCount).toBe(1)
    expect(secondExport.claudeMd.tracedEntries[0].content).toContain("pnpm")
  })
})

// ── S24: Empty store produces no artifacts (Scenario S9) ────────────
describe("S24: Empty state — no approved entries means no artifacts", () => {
  it("produces empty CLAUDE.md when store has only pending entries", async () => {
    const pending = makeEntry({
      type: "preference",
      content: "Use pnpm",
      confidence: 0.95,
      curationStatus: "pending",
    })
    await appendEntries([pending], STORE_PATH)

    const result = routeEntries([pending])
    expect(result.claudeMd.entries).toHaveLength(0)
    expect(result.skills.entries).toHaveLength(0)
    expect(result.hooks.entries).toHaveLength(0)
  })

  it("produces empty result when store is completely empty", async () => {
    const entries = await readEntries(STORE_PATH)
    expect(entries).toHaveLength(0)

    const result = routeEntries(entries)
    expect(result.claudeMd.entries).toHaveLength(0)
    expect(result.skills.entries).toHaveLength(0)
    expect(result.hooks.entries).toHaveLength(0)
  })
})
```

**Step 2: Run tests to verify they pass (after Phase 2 tasks)**

Run: `pnpm vitest run server/__tests__/integration/memory-lifecycle-scenarios.test.ts -v`
Expected: ALL pass (15 existing + 8 new = 23 scenarios)

**Step 3: Commit**

```
git add server/__tests__/integration/memory-lifecycle-scenarios.test.ts
git commit -m "test: add Gherkin scenarios S16-S24 for audit, export, and overrides"
```

---

### Task 12: Update Gherkin scenarios doc with new coverage

**Files:**
- Modify: `docs/plans/2026-02-24-evidence-based-memory-gherkin-scenarios.md`

Append a new section documenting scenarios S16-S24 and their coverage matrix:

```markdown
---

## Scenarios 16-24: Audit → Export Lifecycle (added 2026-02-26)

**Covers:** `docs/plans/2026-02-26-shadow-audit-export-scenarios.md`

| Scenario | Feature | Maps to Shadow/Audit/Export |
|----------|---------|---------------------------|
| S16 | targetOverride routes to dev-chosen channel | S3: Target override |
| S17 | contentOverride appears in generated artifacts | S2: Content editing |
| S18 | Bulk approve/reject updates store | S10: Bulk actions |
| S19 | Export only includes approved entries | S1: Basic cycle |
| S20 | Sentence-scoped isLikelyQuestion | Signal classifier fix |
| S21 | Numbered list per-item re-classification | Signal classifier fix |
| S22 | Constraint/option answer detection | Signal classifier fix |
| S23 | Re-export removes rejected entry | S7: Re-export |
| S24 | Empty store produces no artifacts | S9: Empty states |

### Coverage of Shadow/Audit/Export Scenarios

| Shadow/Audit/Export Scenario | Covered By |
|------------------------------|-----------|
| S1: Basic shadow → audit → export | S19 (export), S1 (pipeline) |
| S2: Content editing | S17 |
| S3: Target override | S16 |
| S4: Budget enforcement | S12 (existing) |
| S5: Context assembly before curation | S10 (existing, implicit) |
| S6: Incremental audit | S18 (bulk actions) |
| S7: Re-export after changes | S23 |
| S8: Non-blocking extraction | Architectural (SessionEnd hook) |
| S9: Empty states | S24 |
| S10: Filtering and bulk actions | S18, S16 |
```

**Commit:**

```
git add docs/plans/2026-02-24-evidence-based-memory-gherkin-scenarios.md
git commit -m "docs: add Gherkin scenarios S16-S24 covering audit/export lifecycle"
```

---

## Phase 7: Validation

### Task 13: Run heuristic eval to validate signal classifier fixes

(Previously Task 10)

**Step 1: Run heuristics-only eval on QP**

```bash
QP_FILES=$(find ~/w/galatea/data/otherdevs/qp -name "*.jsonl" -type f ! -name "history.jsonl" | sort)
pnpm tsx experiments/extraction/run-strategy-eval.ts qp heuristics-only $QP_FILES
```

**Step 2: Run heuristics-only eval on Umka**

```bash
UMKA_FILES=$(find ~/w/galatea/data/otherdevs/umka -name "*.jsonl" -type f ! -name "history.jsonl" | sort)
pnpm tsx experiments/extraction/run-strategy-eval.ts umka heuristics-only $UMKA_FILES
```

**Step 3: Verify improvements**

Expected:
- QP recall should improve from 10/18 to 12-13/18 (items 1 and 2 recovered by Tasks 3 and 4)
- Umka recall should improve from 6/13 to 7-8/13 (item 9 recovered by Task 1)
- Entry counts should stay similar or decrease (tighter dedup)

**Step 4: Run full test suite**

```bash
pnpm vitest run server/memory/__tests__/ -v
```

Expected: ALL tests pass

**Step 5: Commit any adjustments**

---

### Task 14: Update lifecycle design doc with new decisions

**Files:**
- Modify: `docs/plans/2026-02-24-evidence-based-memory-lifecycle-design.md`

Update the doc to reflect:
1. Replace Stage 8 (Curation Queue) description with Audit API + Web UI
2. Replace auto-regeneration with manual Export API
3. Add `contentOverride` and `targetOverride` to KnowledgeEntry description
4. Add S1-S10 as acceptance criteria reference
5. Explicitly state: "Context assembly ignores curationStatus — all entries are eligible"
6. Note the A+C strategy decision (heuristics-only for artifacts)

**Commit:**

```
git commit -m "docs: update lifecycle design with audit UI, manual export, and A+C strategy decisions"
```

---

## Verification Checklist

After all tasks complete, verify:

1. **Signal classifier tests**: `pnpm vitest run server/memory/__tests__/signal-classifier.test.ts -v` — all pass
2. **Heuristic extractor tests**: `pnpm vitest run server/memory/__tests__/heuristic-extractor.test.ts -v` — all pass
3. **Channel router tests**: `pnpm vitest run server/memory/__tests__/channel-router.test.ts -v` — all pass
4. **Post-extraction tests**: `pnpm vitest run server/memory/__tests__/post-extraction.test.ts -v` — all pass
5. **Signal classifier Gherkin**: `pnpm vitest run server/__tests__/integration/signal-classifier-scenarios.test.ts -v` — all S20-S22 pass
6. **Lifecycle Gherkin**: `pnpm vitest run server/__tests__/integration/memory-lifecycle-scenarios.test.ts -v` — all 23 scenarios pass (S1-S15 existing + S16-S24 new)
7. **Full suite**: `pnpm vitest run server/ -v` — no regressions
8. **Eval improvement**: QP heuristic recall ≥ 12/18, Umka ≥ 7/13
9. **Config**: cosine threshold = 0.90 in config.yaml
10. **Scenario coverage**:
   - S1 (shadow→audit→export): Extraction pipeline + audit API + export API ✓
   - S2 (content editing): PATCH endpoint + contentOverride field ✓
   - S3 (target override): targetOverride field + router respects it ✓
   - S4 (budget enforcement): channel-router already enforces ✓
   - S5 (context assembly before curation): explicitly documented ✓
   - S6 (incremental audit): audit page with filters ✓
   - S7 (re-export): export endpoint regenerates from current store ✓
   - S8 (non-blocking extraction): existing SessionEnd hook + async ✓
   - S9 (empty states): handled in audit + export pages ✓
   - S10 (filtering + bulk): curationStatus filter + bulk endpoint ✓
