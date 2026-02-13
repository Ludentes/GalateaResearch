# Stage G: Reference Scenario Testing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Validate that the Homeostasis Engine, Activity Router, and full chat pipeline produce correct behavior for 5 reference scenarios from `docs/REFERENCE_SCENARIOS.md`.

**Architecture:** Two test layers. Layer 1 (Tasks 1-3): Full pipeline integration tests that send real messages through `sendMessageLogic` with Ollama, then verify stored homeostasis states and activity levels. Layer 2 (Tasks 4-5): Engine-level scenario tests with crafted `AgentContext` inputs that simulate situations the pipeline can't yet trigger (idle agent, over-research). All tests document what works and what's deficient.

**Tech Stack:** Vitest, Drizzle ORM (postgres-js), Ollama (glm-4.7-flash), Graphiti sidecar

---

## Shared Infrastructure

All scenario tests live in `tests/scenarios/` and share helpers.

**Test file convention:** `// @vitest-environment node` at top (needed for DB access).

**Shared imports:**
```typescript
import { ollama } from "ai-sdk-ollama"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { homeostasisStates, messages, sessions } from "../../server/db/schema"
import { createSessionLogic, getSessionMessagesLogic, sendMessageLogic } from "../../server/functions/chat.logic"
import { getHomeostasisStateLogic } from "../../server/functions/homeostasis.logic"
import { createHomeostasisEngine } from "../../server/engine/homeostasis-engine"
import { createActivityRouter } from "../../server/engine/activity-router"
import type { AgentContext, HomeostasisState, Procedure, Task } from "../../server/engine/types"
```

**DB connection:**
```typescript
const TEST_DB_URL = process.env.DATABASE_URL || "postgres://galatea:galatea@localhost:15432/galatea"
const client = postgres(TEST_DB_URL)
const testDb = drizzle(client)
```

**Cleanup pattern (FK order):**
```typescript
await testDb.delete(homeostasisStates).where(eq(homeostasisStates.sessionId, testSessionId))
await testDb.delete(messages).where(eq(messages.sessionId, testSessionId))
await testDb.delete(sessions).where(eq(sessions.id, testSessionId))
```

**Fire-and-forget wait:** `await new Promise(r => setTimeout(r, 500))` — homeostasis is stored async after response.

---

### Task 1: Trace 2 — Knowledge Gap (Clarifying Question)

**Reference:** Trace 2 in `docs/REFERENCE_SCENARIOS.md` — User tries JWT auth, fails, switches to Clerk. Agent should detect knowledge gap and recommend asking.

**What we're testing:** When a user asks about something the system has no knowledge about, does `knowledge_sufficiency` go LOW? Does guidance recommend asking clarifying questions? What activity level gets assigned?

**Files:**
- Create: `tests/scenarios/trace2-knowledge-gap.test.ts`

**Step 1: Write the test**

```typescript
// @vitest-environment node

/**
 * Trace 2: Knowledge Gap Detection
 *
 * Scenario: User asks about implementing JWT auth in a mobile app.
 * The system has no relevant facts about JWT or mobile auth.
 * Expected: knowledge_sufficiency LOW, guidance recommends asking.
 *
 * Reference: docs/REFERENCE_SCENARIOS.md Trace 2
 */

import { ollama } from "ai-sdk-ollama"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { homeostasisStates, messages, sessions } from "../../server/db/schema"
import {
  createSessionLogic,
  getSessionMessagesLogic,
  sendMessageLogic,
} from "../../server/functions/chat.logic"
import { getHomeostasisStateLogic } from "../../server/functions/homeostasis.logic"

const TEST_DB_URL =
  process.env.DATABASE_URL || "postgres://galatea:galatea@localhost:15432/galatea"

describe("Trace 2: Knowledge Gap — Clarifying Question", () => {
  const client = postgres(TEST_DB_URL)
  const testDb = drizzle(client)
  let testSessionId: string

  beforeAll(async () => {
    const session = await createSessionLogic("Trace 2: Knowledge Gap Test")
    testSessionId = session.id
  })

  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 500))
    if (testSessionId) {
      await testDb.delete(homeostasisStates).where(eq(homeostasisStates.sessionId, testSessionId))
      await testDb.delete(messages).where(eq(messages.sessionId, testSessionId))
      await testDb.delete(sessions).where(eq(sessions.id, testSessionId))
    }
    await client.end()
  })

  it("detects knowledge gap when user asks about unfamiliar topic", async () => {
    // User asks about JWT auth — a topic with no relevant facts in memory
    const result = await sendMessageLogic(
      testSessionId,
      "I need to implement JWT authentication with token refresh in our Expo mobile app. How should I handle the refresh token flow?",
      ollama("glm-4.7-flash"),
      "glm-4.7-flash",
    )

    expect(result.text).toBeDefined()
    expect(result.text.length).toBeGreaterThan(0)

    // Wait for fire-and-forget homeostasis storage
    await new Promise((r) => setTimeout(r, 500))

    // Check stored homeostasis state
    const state = await getHomeostasisStateLogic(testSessionId)
    expect(state).not.toBeNull()

    // VERIFY: knowledge_sufficiency should be LOW because no relevant facts retrieved
    // (Graphiti has architecture/NestJS facts, not JWT/mobile auth facts)
    console.log("[trace2] Homeostasis state:", JSON.stringify(state?.dimensions, null, 2))
    console.log("[trace2] Assessment methods:", JSON.stringify(state?.assessmentMethod, null, 2))
    expect(state?.dimensions.knowledge_sufficiency).toBe("LOW")

    // VERIFY: Activity level should be L2 or L3
    const msgs = await getSessionMessagesLogic(testSessionId)
    const assistantMsg = msgs.find((m) => m.role === "assistant")
    console.log("[trace2] Activity level:", assistantMsg?.activityLevel)
    expect([2, 3]).toContain(assistantMsg?.activityLevel)

    // VERIFY: Guidance engine recommends asking clarifying questions
    const { createHomeostasisEngine } = await import("../../server/engine/homeostasis-engine")
    const engine = createHomeostasisEngine()
    const fullState: import("../../server/engine/types").HomeostasisState = {
      knowledge_sufficiency: state!.dimensions.knowledge_sufficiency as any,
      certainty_alignment: state!.dimensions.certainty_alignment as any,
      progress_momentum: state!.dimensions.progress_momentum as any,
      communication_health: state!.dimensions.communication_health as any,
      productive_engagement: state!.dimensions.productive_engagement as any,
      knowledge_application: state!.dimensions.knowledge_application as any,
      assessed_at: new Date(state!.assessedAt),
      assessment_method: Object.fromEntries(
        Object.entries(state!.dimensions).map(([k]) => [k, state!.assessmentMethod[k] ?? "computed"]),
      ) as any,
    }
    const guidance = engine.getGuidance(fullState)
    console.log("[trace2] Guidance:", JSON.stringify(guidance, null, 2))

    // Guidance should mention knowledge gap
    expect(guidance).not.toBeNull()
    expect(guidance?.dimensions).toContain("knowledge_sufficiency")
  }, 60000)

  it("contrast: knowledge sufficiency improves with relevant facts available", async () => {
    // Send a second message about something Graphiti DOES have facts about
    // (architecture/NestJS from previous user sessions)
    const result = await sendMessageLogic(
      testSessionId,
      "Should I use a monolith or microservices architecture for my backend?",
      ollama("glm-4.7-flash"),
      "glm-4.7-flash",
    )

    expect(result.text).toBeDefined()
    await new Promise((r) => setTimeout(r, 500))

    const state = await getHomeostasisStateLogic(testSessionId)
    console.log("[trace2-contrast] Homeostasis state:", JSON.stringify(state?.dimensions, null, 2))

    // If Graphiti has architecture facts, knowledge_sufficiency might improve
    // This test documents the ACTUAL behavior — it may still be LOW if
    // Graphiti facts don't match well enough
    const msgs = await getSessionMessagesLogic(testSessionId)
    const lastAssistant = msgs.filter((m) => m.role === "assistant").pop()
    console.log("[trace2-contrast] Activity level:", lastAssistant?.activityLevel)

    // Document what happens — this is exploratory
    expect(state).not.toBeNull()
  }, 60000)
})
```

**Step 2: Run test**

```bash
pnpm test -- --run tests/scenarios/trace2-knowledge-gap.test.ts
```

Expected: PASS. Console logs document actual homeostasis behavior.

**Step 3: Commit**

```bash
git add tests/scenarios/trace2-knowledge-gap.test.ts
git commit -m "test: Stage G — Trace 2 knowledge gap scenario"
```

---

### Task 2: Trace 4 — Execute Task (Sufficient Knowledge)

**Reference:** Trace 4 — Agent receives profile screen task, has relevant procedures in memory, proceeds with Level 2.

**What we're testing:** When Graphiti has relevant facts, does `knowledge_sufficiency` improve? Does the activity router choose an appropriate level?

**Files:**
- Create: `tests/scenarios/trace4-execute-task.test.ts`

**Step 1: Write the test**

```typescript
// @vitest-environment node

/**
 * Trace 4: Agent Executes Task with Sufficient Knowledge
 *
 * Scenario: Agent is asked to implement a user profile screen.
 * The system has relevant facts in Graphiti (NativeWind, expo-router, etc.)
 * Expected: knowledge_sufficiency HEALTHY (if facts match), Level 2 routing.
 *
 * Reference: docs/REFERENCE_SCENARIOS.md Trace 4
 */

import { ollama } from "ai-sdk-ollama"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { homeostasisStates, messages, sessions } from "../../server/db/schema"
import {
  createSessionLogic,
  getSessionMessagesLogic,
  sendMessageLogic,
} from "../../server/functions/chat.logic"
import { getHomeostasisStateLogic } from "../../server/functions/homeostasis.logic"
import { searchFacts } from "../../server/memory/graphiti-client"

const TEST_DB_URL =
  process.env.DATABASE_URL || "postgres://galatea:galatea@localhost:15432/galatea"

describe("Trace 4: Execute Task — Sufficient Knowledge", () => {
  const client = postgres(TEST_DB_URL)
  const testDb = drizzle(client)
  let testSessionId: string

  beforeAll(async () => {
    const session = await createSessionLogic("Trace 4: Execute Task Test")
    testSessionId = session.id
  })

  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 500))
    if (testSessionId) {
      await testDb.delete(homeostasisStates).where(eq(homeostasisStates.sessionId, testSessionId))
      await testDb.delete(messages).where(eq(messages.sessionId, testSessionId))
      await testDb.delete(sessions).where(eq(sessions.id, testSessionId))
    }
    await client.end()
  })

  it("verifies Graphiti has relevant facts for profile screen task", async () => {
    // Pre-check: search Graphiti for facts related to our task
    const facts = await searchFacts("user profile screen expo", [], 10)
    console.log("[trace4] Available Graphiti facts:", facts.length)
    for (const f of facts.slice(0, 5)) {
      console.log(`  - [${f.name}] ${f.fact.substring(0, 80)}...`)
    }

    // Document what's available — this helps diagnose knowledge_sufficiency
    // Even if empty, the test proceeds
  })

  it("proceeds with task when knowledge is available", async () => {
    const result = await sendMessageLogic(
      testSessionId,
      "Implement a user profile screen with edit functionality using NativeWind for styling",
      ollama("glm-4.7-flash"),
      "glm-4.7-flash",
    )

    expect(result.text).toBeDefined()
    await new Promise((r) => setTimeout(r, 500))

    const state = await getHomeostasisStateLogic(testSessionId)
    expect(state).not.toBeNull()
    console.log("[trace4] Homeostasis:", JSON.stringify(state?.dimensions, null, 2))

    // VERIFY: Activity level should be L2 (standard reasoning) not L3
    // L3 only triggers for knowledge gaps, high-stakes irreversible actions
    const msgs = await getSessionMessagesLogic(testSessionId)
    const assistantMsg = msgs.find((m) => m.role === "assistant")
    console.log("[trace4] Activity level:", assistantMsg?.activityLevel)
    expect(assistantMsg?.activityLevel).toBe(2)

    // VERIFY: productive_engagement should be HEALTHY (has assigned task = messages exist)
    expect(state?.dimensions.productive_engagement).toBe("HEALTHY")

    // Document knowledge_sufficiency — depends on whether Graphiti returned facts
    console.log("[trace4] knowledge_sufficiency:", state?.dimensions.knowledge_sufficiency)
  }, 60000)

  it("sends follow-up message — dimensions should update", async () => {
    const result = await sendMessageLogic(
      testSessionId,
      "Add null checks on the user object before rendering, and wire up the save button to the API",
      ollama("glm-4.7-flash"),
      "glm-4.7-flash",
    )

    expect(result.text).toBeDefined()
    await new Promise((r) => setTimeout(r, 500))

    const state = await getHomeostasisStateLogic(testSessionId)
    console.log("[trace4-followup] Homeostasis:", JSON.stringify(state?.dimensions, null, 2))

    // VERIFY: communication_health may change based on message timing
    // (HIGH if <2min since last, HEALTHY if 2-10min)
    console.log("[trace4-followup] communication_health:", state?.dimensions.communication_health)

    // Document the actual result for analysis
    expect(state).not.toBeNull()
  }, 60000)
})
```

**Step 2: Run test**

```bash
pnpm test -- --run tests/scenarios/trace4-execute-task.test.ts
```

**Step 3: Commit**

```bash
git add tests/scenarios/trace4-execute-task.test.ts
git commit -m "test: Stage G — Trace 4 execute task scenario"
```

---

### Task 3: Trace 6 — Unknown Situation (Escalation to Level 3)

**Reference:** Trace 6 — Agent assigned push notifications (not in training). No relevant knowledge. Should escalate.

**What we're testing:** Does the activity router escalate to Level 3 when message contains knowledge gap markers? Does homeostasis detect the gap?

**Files:**
- Create: `tests/scenarios/trace6-unknown-situation.test.ts`

**Step 1: Write the test**

```typescript
// @vitest-environment node

/**
 * Trace 6: Agent Encounters Unknown Situation
 *
 * Scenario: Agent is asked about push notifications — no prior knowledge.
 * Message contains "how do I" knowledge gap markers.
 * Expected: Activity Level 3 (Reflexion), knowledge_sufficiency LOW.
 *
 * Reference: docs/REFERENCE_SCENARIOS.md Trace 6
 */

import { ollama } from "ai-sdk-ollama"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { homeostasisStates, messages, sessions } from "../../server/db/schema"
import {
  createSessionLogic,
  getSessionMessagesLogic,
  sendMessageLogic,
} from "../../server/functions/chat.logic"
import { getHomeostasisStateLogic } from "../../server/functions/homeostasis.logic"

const TEST_DB_URL =
  process.env.DATABASE_URL || "postgres://galatea:galatea@localhost:15432/galatea"

describe("Trace 6: Unknown Situation — Escalation", () => {
  const client = postgres(TEST_DB_URL)
  const testDb = drizzle(client)
  let testSessionId: string

  beforeAll(async () => {
    const session = await createSessionLogic("Trace 6: Unknown Situation Test")
    testSessionId = session.id
  })

  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 500))
    if (testSessionId) {
      await testDb.delete(homeostasisStates).where(eq(homeostasisStates.sessionId, testSessionId))
      await testDb.delete(messages).where(eq(messages.sessionId, testSessionId))
      await testDb.delete(sessions).where(eq(sessions.id, testSessionId))
    }
    await client.end()
  })

  it("escalates to Level 3 when knowledge gap detected in message", async () => {
    // Message with explicit knowledge gap markers ("how do I", "never done")
    const result = await sendMessageLogic(
      testSessionId,
      "How do I implement push notifications in Expo? I've never done this before and I'm not sure which service to use — expo-notifications, OneSignal, or Firebase?",
      ollama("glm-4.7-flash"),
      "glm-4.7-flash",
    )

    expect(result.text).toBeDefined()
    await new Promise((r) => setTimeout(r, 500))

    // VERIFY: Activity Router should detect knowledge gap keywords
    const msgs = await getSessionMessagesLogic(testSessionId)
    const assistantMsg = msgs.find((m) => m.role === "assistant")
    console.log("[trace6] Activity level:", assistantMsg?.activityLevel)
    console.log("[trace6] Response length:", result.text.length)

    // "how do I" triggers hasKnowledgeGap in classification-helpers.ts
    // This should escalate to Level 3 (Reflexion)
    expect(assistantMsg?.activityLevel).toBe(3)

    // VERIFY: Homeostasis should show knowledge gap
    const state = await getHomeostasisStateLogic(testSessionId)
    expect(state).not.toBeNull()
    console.log("[trace6] Homeostasis:", JSON.stringify(state?.dimensions, null, 2))
    expect(state?.dimensions.knowledge_sufficiency).toBe("LOW")

    // VERIFY: Guidance should recommend research/asking
    const { createHomeostasisEngine } = await import("../../server/engine/homeostasis-engine")
    const engine = createHomeostasisEngine()
    const fullState: import("../../server/engine/types").HomeostasisState = {
      knowledge_sufficiency: state!.dimensions.knowledge_sufficiency as any,
      certainty_alignment: state!.dimensions.certainty_alignment as any,
      progress_momentum: state!.dimensions.progress_momentum as any,
      communication_health: state!.dimensions.communication_health as any,
      productive_engagement: state!.dimensions.productive_engagement as any,
      knowledge_application: state!.dimensions.knowledge_application as any,
      assessed_at: new Date(state!.assessedAt),
      assessment_method: Object.fromEntries(
        Object.entries(state!.dimensions).map(([k]) => [k, state!.assessmentMethod[k] ?? "computed"]),
      ) as any,
    }
    const guidance = engine.getGuidance(fullState)
    console.log("[trace6] Guidance:", JSON.stringify(guidance, null, 2))
    expect(guidance).not.toBeNull()
  }, 120000) // 2 min — Reflexion loop may take longer

  it("contrast: routine task stays at Level 2", async () => {
    // Same session, but now a routine message (no knowledge gap markers)
    const result = await sendMessageLogic(
      testSessionId,
      "Add a loading spinner to the notifications list screen",
      ollama("glm-4.7-flash"),
      "glm-4.7-flash",
    )

    expect(result.text).toBeDefined()
    await new Promise((r) => setTimeout(r, 500))

    const msgs = await getSessionMessagesLogic(testSessionId)
    const lastAssistant = msgs.filter((m) => m.role === "assistant").pop()
    console.log("[trace6-contrast] Activity level:", lastAssistant?.activityLevel)

    // No knowledge gap markers → should stay at Level 2
    expect(lastAssistant?.activityLevel).toBe(2)
  }, 60000)
})
```

**Step 2: Run test**

```bash
pnpm test -- --run tests/scenarios/trace6-unknown-situation.test.ts
```

**Step 3: Commit**

```bash
git add tests/scenarios/trace6-unknown-situation.test.ts
git commit -m "test: Stage G — Trace 6 unknown situation escalation"
```

---

### Task 4: Trace 7 — Idle Agent (Productive Engagement LOW)

**Reference:** Trace 7 — Agent finishes task, nothing assigned. `productive_engagement: LOW`. Guidance: "Find work."

**What we're testing:** The homeostasis engine detects idle state and guidance system returns appropriate advice. Also tests the tension between `productive_engagement: LOW` and `communication_health: HIGH` (can't spam).

**Note:** This tests the engine directly with crafted contexts because `buildAgentContext()` always sets `hasAssignedTask = true` when messages exist. The pipeline can't trigger the idle state during a conversation — it would require an out-of-band check (e.g., cron/polling). This is documented as a known gap.

**Files:**
- Create: `tests/scenarios/trace7-idle-agent.test.ts`

**Step 1: Write the test**

```typescript
// @vitest-environment node

/**
 * Trace 7: Idle Agent Seeks Work
 *
 * Scenario: Agent finishes task, nothing new assigned.
 * productive_engagement: LOW, communication_health: HEALTHY.
 * Guidance: "Find valuable work. Priority: assigned > help > review > learn"
 *
 * After asking PM and getting no response for 5 minutes:
 * productive_engagement: still LOW, communication_health: HIGH (just messaged)
 * Two dimensions in tension — can't spam but needs work.
 *
 * Reference: docs/REFERENCE_SCENARIOS.md Trace 7
 *
 * NOTE: Tests engine directly because the pipeline always sets
 * hasAssignedTask=true when messages exist. The idle state would
 * require an out-of-band polling mechanism (future work).
 */

import { describe, expect, it } from "vitest"
import { createHomeostasisEngine } from "../../server/engine/homeostasis-engine"
import { createActivityRouter } from "../../server/engine/activity-router"
import type { AgentContext, HomeostasisState, Task } from "../../server/engine/types"

function createIdleAgentContext(overrides?: Partial<AgentContext>): AgentContext {
  return {
    sessionId: "trace7-test",
    currentMessage: "I've finished the profile screen. What should I work on next?",
    messageHistory: [
      { role: "user" as const, content: "Implement user profile screen" },
      { role: "assistant" as const, content: "Done. Profile screen implemented with NativeWind." },
    ],
    hasAssignedTask: false, // KEY: no new task assigned
    lastMessageTime: new Date(Date.now() - 1 * 60 * 1000), // 1 min ago
    recentActionCount: 2,
    currentTaskStartTime: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    retrievedFacts: [],
    retrievedProcedures: [],
    ...overrides,
  }
}

describe("Trace 7: Idle Agent — Seeks Work", () => {
  const engine = createHomeostasisEngine()
  const router = createActivityRouter()

  it("detects idle state: productive_engagement LOW", async () => {
    const context = createIdleAgentContext()
    const state = await engine.assessAll(context)

    console.log("[trace7] Full state:", JSON.stringify(state, null, 2))

    // VERIFY: No assigned task → productive_engagement LOW
    expect(state.productive_engagement).toBe("LOW")

    // VERIFY: Just communicated → communication_health should be HIGH (<2 min)
    expect(state.communication_health).toBe("HIGH")

    // VERIFY: Guidance should mention finding work
    const guidance = engine.getGuidance(state)
    console.log("[trace7] Guidance:", JSON.stringify(guidance, null, 2))
    expect(guidance).not.toBeNull()
    // Guidance should address the idle state
    expect(guidance?.dimensions).toContain("productive_engagement")
  })

  it("dimension tension: can't spam but needs work", async () => {
    // Scenario: Agent asked PM 1 minute ago, no response yet
    const context = createIdleAgentContext({
      lastMessageTime: new Date(Date.now() - 1 * 60 * 1000), // 1 min ago
    })

    const state = await engine.assessAll(context)

    // Two dimensions in tension:
    // productive_engagement: LOW (no task)
    // communication_health: HIGH (just messaged, can't spam)
    expect(state.productive_engagement).toBe("LOW")
    expect(state.communication_health).toBe("HIGH")

    // Guidance should prioritize by configured priority
    const guidance = engine.getGuidance(state)
    console.log("[trace7-tension] Guidance:", JSON.stringify(guidance, null, 2))
    expect(guidance).not.toBeNull()

    // Document which dimension gets priority
    console.log("[trace7-tension] Primary dimension:", guidance?.dimensions[0])
  })

  it("tension resolves: enough time passes to communicate again", async () => {
    // 5 minutes later — communication_health returns to HEALTHY
    const context = createIdleAgentContext({
      lastMessageTime: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago
    })

    const state = await engine.assessAll(context)

    // productive_engagement still LOW
    expect(state.productive_engagement).toBe("LOW")
    // communication_health back to HEALTHY (5 min > 2 min threshold)
    expect(state.communication_health).toBe("HEALTHY")

    // Now agent CAN communicate again
    const guidance = engine.getGuidance(state)
    console.log("[trace7-resolved] Guidance:", JSON.stringify(guidance, null, 2))

    // Should still recommend finding work
    expect(guidance?.dimensions).toContain("productive_engagement")
  })

  it("idle agent message classifies as Level 2", async () => {
    const task: Task = {
      message: "I've finished the profile screen. What should I work on next?",
      sessionId: "trace7-test",
    }

    const classification = await router.classify(task, null, null)
    console.log("[trace7] Classification:", JSON.stringify(classification, null, 2))

    // Standard reasoning task, not a knowledge gap
    expect(classification.level).toBe(2)
  })
})
```

**Step 2: Run test**

```bash
pnpm test -- --run tests/scenarios/trace7-idle-agent.test.ts
```

**Step 3: Commit**

```bash
git add tests/scenarios/trace7-idle-agent.test.ts
git commit -m "test: Stage G — Trace 7 idle agent scenario"
```

---

### Task 5: Trace 8 — Over-Research Guardrail

**Reference:** Trace 8 — Agent researching OAuth2 for 2 hours. `knowledge_application: HIGH`, `progress_momentum: LOW`. Guardrail: "Time to apply."

**What we're testing:** Homeostasis detects analysis paralysis and guidance triggers the "stop researching, start building" guardrail. Also tests the contrast where balanced research produces HEALTHY state.

**Files:**
- Create: `tests/scenarios/trace8-over-research.test.ts`

**Step 1: Write the test**

```typescript
// @vitest-environment node

/**
 * Trace 8: Guardrail Catches Over-Research
 *
 * Scenario: Agent has been researching OAuth2 for 2 hours.
 * knowledge_application: HIGH (>80% time researching)
 * progress_momentum: LOW (stuck, few actions in long time)
 * Guardrail triggers: "Time to apply. You can course-correct as you go."
 *
 * Reference: docs/REFERENCE_SCENARIOS.md Trace 8
 *
 * NOTE: Tests engine directly because the pipeline doesn't yet
 * track timeSpentResearching/timeSpentBuilding. These would come
 * from the observation pipeline (Phase 4). Documented as known gap.
 */

import { describe, expect, it } from "vitest"
import { createHomeostasisEngine } from "../../server/engine/homeostasis-engine"
import type { AgentContext, HomeostasisState } from "../../server/engine/types"

function createResearchContext(
  researchMinutes: number,
  buildingMinutes: number,
  actionCount: number,
  taskMinutes: number,
): AgentContext {
  return {
    sessionId: "trace8-test",
    currentMessage: "Let me look into the PKCE flow for OAuth2...",
    messageHistory: Array.from({ length: actionCount }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `Research message ${i}`,
    })),
    hasAssignedTask: true,
    lastMessageTime: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago
    currentTaskStartTime: new Date(Date.now() - taskMinutes * 60 * 1000),
    recentActionCount: actionCount,
    retrievedFacts: [],
    retrievedProcedures: [],
    timeSpentResearching: researchMinutes * 60 * 1000, // Convert to ms
    timeSpentBuilding: buildingMinutes * 60 * 1000,
  }
}

describe("Trace 8: Over-Research Guardrail", () => {
  const engine = createHomeostasisEngine()

  it("detects analysis paralysis: 2 hours research, no building", async () => {
    // 120 min researching, 0 min building, 4 actions in 120 min
    const context = createResearchContext(120, 0, 4, 120)
    const state = await engine.assessAll(context)

    console.log("[trace8] Full state:", JSON.stringify(state, null, 2))

    // VERIFY: knowledge_application HIGH (>80% research = analysis paralysis)
    expect(state.knowledge_application).toBe("HIGH")

    // VERIFY: progress_momentum LOW (>30 min, <3 recent actions)
    // Note: recentActionCount=4 but task has been going 120 min
    // The engine checks actionCount < 3 for stuck detection
    console.log("[trace8] progress_momentum:", state.progress_momentum)

    // VERIFY: Guidance triggers guardrail
    const guidance = engine.getGuidance(state)
    console.log("[trace8] Guidance:", JSON.stringify(guidance, null, 2))
    expect(guidance).not.toBeNull()
    expect(guidance?.dimensions).toContain("knowledge_application")
  })

  it("contrast: balanced research/building is HEALTHY", async () => {
    // 40 min researching, 60 min building = 40% research (within 20-80% range)
    const context = createResearchContext(40, 60, 15, 100)
    const state = await engine.assessAll(context)

    console.log("[trace8-balanced] Full state:", JSON.stringify(state, null, 2))

    // VERIFY: knowledge_application HEALTHY (40% research is balanced)
    expect(state.knowledge_application).toBe("HEALTHY")

    // Guidance should be null or not mention knowledge_application
    const guidance = engine.getGuidance(state)
    if (guidance) {
      expect(guidance.dimensions).not.toContain("knowledge_application")
    }
  })

  it("contrast: too little research triggers LOW", async () => {
    // 5 min researching, 95 min building = 5% research (under 20%)
    const context = createResearchContext(5, 95, 20, 100)
    const state = await engine.assessAll(context)

    console.log("[trace8-no-research] Full state:", JSON.stringify(state, null, 2))

    // VERIFY: knowledge_application LOW (insufficient research)
    expect(state.knowledge_application).toBe("LOW")
  })

  it("combined guardrail: over-research + stuck + knowledge gap", async () => {
    // Worst case: researching for hours, no progress, no relevant facts
    const context = createResearchContext(180, 0, 2, 180)
    const state = await engine.assessAll(context)

    console.log("[trace8-worst] Full state:", JSON.stringify(state, null, 2))

    // Multiple dimensions should be imbalanced
    expect(state.knowledge_application).toBe("HIGH") // too much research
    expect(state.knowledge_sufficiency).toBe("LOW") // no facts found

    // Guidance should address highest priority imbalance
    const guidance = engine.getGuidance(state)
    console.log("[trace8-worst] Guidance:", JSON.stringify(guidance, null, 2))
    expect(guidance).not.toBeNull()

    // Should mention multiple dimensions
    console.log("[trace8-worst] Imbalanced dimensions:", guidance?.dimensions)
    expect(guidance!.dimensions.length).toBeGreaterThanOrEqual(2)
  })
})
```

**Step 2: Run test**

```bash
pnpm test -- --run tests/scenarios/trace8-over-research.test.ts
```

**Step 3: Commit**

```bash
git add tests/scenarios/trace8-over-research.test.ts
git commit -m "test: Stage G — Trace 8 over-research guardrail"
```

---

### Task 6: Run All Scenario Tests + Write Summary

**What we're doing:** Run all 5 scenario tests together, analyze console output, and write a findings document that captures what works, what's deficient, and what needs future work.

**Files:**
- Create: `docs/STAGE_G_FINDINGS.md`

**Step 1: Run all scenario tests**

```bash
pnpm test -- --run tests/scenarios/ 2>&1 | tee /tmp/stage-g-results.txt
```

**Step 2: Write findings document**

Create `docs/STAGE_G_FINDINGS.md` summarizing:
- Each scenario: expected vs actual behavior
- Which dimensions vary correctly
- Which are always stuck (and why)
- Known gaps and deficiencies
- Recommendations for future phases

**Step 3: Run full test suite to confirm no regressions**

```bash
pnpm test -- --run
```

Expected: All tests pass (305 + new scenario tests).

**Step 4: Commit**

```bash
git add tests/scenarios/ docs/STAGE_G_FINDINGS.md
git commit -m "docs: Stage G complete — reference scenario testing with findings"
```

---

## Dependency Graph

```
Task 1 (Trace 2)  ─┐
Task 2 (Trace 4)  ─┤  All independent, can run in parallel
Task 3 (Trace 6)  ─┤
Task 4 (Trace 7)  ─┤
Task 5 (Trace 8)  ─┘
                    │
                    ▼
              Task 6 (Summary)
```

Tasks 1-5 are independent. Task 6 depends on all of them.

---

## Known Limitations (Document in Tests)

| Gap | Cause | Future Fix |
|-----|-------|-----------|
| `hasAssignedTask` always true during conversation | Derived from message count | Needs external task tracking system |
| `timeSpentResearching`/`timeSpentBuilding` always 0 in pipeline | No observation pipeline yet | Phase 4: Observation Pipeline |
| All assessments are "computed" (no LLM) | Heuristic-only engine | Future: LLM upgrade for ambiguous cases |
| `knowledge_sufficiency` depends on Graphiti availability | Graphiti sidecar must be running | Fallback to local facts table (Phase 2 Stage 5) |
| Activity Router doesn't receive homeostasis state | Called with `router.classify(task, null, null)` | Wire homeostasis into classification |
