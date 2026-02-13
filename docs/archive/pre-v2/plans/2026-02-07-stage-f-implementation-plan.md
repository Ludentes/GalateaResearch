# Stage F: UI Visualization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add homeostasis visualization sidebar and activity level badges to chat UI, making Phase 3 psychological state visible to users.

**Architecture:** Build 3 new React components (DimensionBar, HomeostasisSidebar, ActivityLevelBadge), create homeostasis API endpoint using TanStack Server Functions, integrate into existing chat page with TanStack Query for data fetching.

**Tech Stack:** Remix, TanStack Query, TanStack Router, shadcn/ui, Tailwind CSS, Vitest

---

## Task 1: API Endpoint for Homeostasis State

**Files:**
- Create: `server/functions/homeostasis.ts`
- Create: `server/functions/__tests__/homeostasis.test.ts`
- Modify: `app/routes/chat/$sessionId.tsx` (later task)

**Step 1: Write failing test for getHomeostasisState**

Create `server/functions/__tests__/homeostasis.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest"
import { getHomeostasisState } from "../homeostasis"
import { db } from "../../db"

// Mock database
vi.mock("../../db", () => ({
  db: {
    select: vi.fn(),
  },
}))

describe("getHomeostasisState", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns latest homeostasis state for session", async () => {
    const mockState = {
      id: "test-id",
      sessionId: "session-123",
      messageId: "msg-123",
      knowledgeSufficiency: "HEALTHY",
      certaintyAlignment: "HIGH",
      progressMomentum: "LOW",
      communicationHealth: "HEALTHY",
      productiveEngagement: "HEALTHY",
      knowledgeApplication: "LOW",
      assessmentMethod: {
        knowledge_sufficiency: "computed",
        certainty_alignment: "computed",
      },
      assessedAt: new Date("2026-02-07T12:00:00Z"),
      createdAt: new Date("2026-02-07T12:00:00Z"),
    }

    const mockQuery = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockState]),
    }

    vi.mocked(db.select).mockReturnValue(mockQuery as any)

    const result = await getHomeostasisState({ data: { sessionId: "session-123" } })

    expect(result).toEqual({
      id: "test-id",
      sessionId: "session-123",
      messageId: "msg-123",
      dimensions: {
        knowledge_sufficiency: "HEALTHY",
        certainty_alignment: "HIGH",
        progress_momentum: "LOW",
        communication_health: "HEALTHY",
        productive_engagement: "HEALTHY",
        knowledge_application: "LOW",
      },
      assessmentMethod: {
        knowledge_sufficiency: "computed",
        certainty_alignment: "computed",
      },
      assessedAt: "2026-02-07T12:00:00.000Z",
    })
  })

  it("returns null when no homeostasis state exists", async () => {
    const mockQuery = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    }

    vi.mocked(db.select).mockReturnValue(mockQuery as any)

    const result = await getHomeostasisState({ data: { sessionId: "session-123" } })

    expect(result).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test server/functions/__tests__/homeostasis.test.ts`

Expected: FAIL with "Cannot find module '../homeostasis'"

**Step 3: Implement getHomeostasisState server function**

Create `server/functions/homeostasis.ts`:

```typescript
import { createServerFn } from "@tanstack/react-start"
import { desc, eq } from "drizzle-orm"
import { db } from "../db"
import { homeostasisStates } from "../db/schema"

/**
 * Get latest homeostasis state for a session.
 * Returns null if no state exists (404 equivalent).
 */
export const getHomeostasisState = createServerFn({ method: "GET" })
  .inputValidator((input: { sessionId: string }) => input)
  .handler(async ({ data }) => {
    const [state] = await db
      .select()
      .from(homeostasisStates)
      .where(eq(homeostasisStates.sessionId, data.sessionId))
      .orderBy(desc(homeostasisStates.assessedAt))
      .limit(1)

    if (!state) {
      return null
    }

    return {
      id: state.id,
      sessionId: state.sessionId,
      messageId: state.messageId,
      dimensions: {
        knowledge_sufficiency: state.knowledgeSufficiency,
        certainty_alignment: state.certaintyAlignment,
        progress_momentum: state.progressMomentum,
        communication_health: state.communicationHealth,
        productive_engagement: state.productiveEngagement,
        knowledge_application: state.knowledgeApplication,
      },
      assessmentMethod: state.assessmentMethod as Record<string, "computed" | "llm">,
      assessedAt: state.assessedAt.toISOString(),
    }
  })
```

**Step 4: Run test to verify it passes**

Run: `pnpm test server/functions/__tests__/homeostasis.test.ts`

Expected: PASS (2 tests)

**Step 5: Run all server tests**

Run: `pnpm test server/`

Expected: All existing tests still passing

**Step 6: Commit**

```bash
git add server/functions/homeostasis.ts server/functions/__tests__/homeostasis.test.ts
git commit -m "feat(api): add homeostasis state endpoint

- Create getHomeostasisState server function
- Returns latest state for session or null if none exists
- Maps DB columns to clean API response format
- Add tests for happy path and empty state

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: DimensionBar Component

**Files:**
- Create: `app/components/homeostasis/DimensionBar.tsx`
- Create: `app/components/homeostasis/__tests__/DimensionBar.test.tsx`

**Step 1: Write failing tests for DimensionBar**

Create `app/components/homeostasis/__tests__/DimensionBar.test.tsx`:

```typescript
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { DimensionBar } from "../DimensionBar"

describe("DimensionBar", () => {
  it("renders dimension label", () => {
    render(<DimensionBar label="Knowledge Sufficiency" state="HEALTHY" method="computed" />)
    expect(screen.getByText("Knowledge Sufficiency")).toBeInTheDocument()
  })

  it("shows LOW state with yellow indicator", () => {
    render(<DimensionBar label="Test Dimension" state="LOW" method="computed" />)
    const bar = screen.getByTestId("dimension-bar")
    expect(bar).toHaveClass("bg-yellow-100")
    const indicator = screen.getByTestId("dimension-indicator")
    expect(indicator).toHaveStyle({ left: "16%" })
  })

  it("shows HEALTHY state with green indicator", () => {
    render(<DimensionBar label="Test Dimension" state="HEALTHY" method="computed" />)
    const bar = screen.getByTestId("dimension-bar")
    expect(bar).toHaveClass("bg-green-100")
    const indicator = screen.getByTestId("dimension-indicator")
    expect(indicator).toHaveStyle({ left: "50%" })
  })

  it("shows HIGH state with blue indicator", () => {
    render(<DimensionBar label="Test Dimension" state="HIGH" method="llm" />)
    const bar = screen.getByTestId("dimension-bar")
    expect(bar).toHaveClass("bg-blue-100")
    const indicator = screen.getByTestId("dimension-indicator")
    expect(indicator).toHaveStyle({ left: "83%" })
  })

  it("displays computed method badge", () => {
    render(<DimensionBar label="Test" state="HEALTHY" method="computed" />)
    expect(screen.getByText("C")).toBeInTheDocument()
  })

  it("displays LLM method badge", () => {
    render(<DimensionBar label="Test" state="HEALTHY" method="llm" />)
    expect(screen.getByText("LLM")).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test app/components/homeostasis/__tests__/DimensionBar.test.tsx`

Expected: FAIL with "Cannot find module '../DimensionBar'"

**Step 3: Implement DimensionBar component**

Create `app/components/homeostasis/DimensionBar.tsx`:

```typescript
import { cn } from "@/lib/utils"

interface DimensionBarProps {
  label: string
  state: "LOW" | "HEALTHY" | "HIGH"
  method: "computed" | "llm"
}

const STATE_CONFIG = {
  LOW: {
    color: "bg-yellow-100 border-yellow-500",
    position: "16%",
  },
  HEALTHY: {
    color: "bg-green-100 border-green-500",
    position: "50%",
  },
  HIGH: {
    color: "bg-blue-100 border-blue-500",
    position: "83%",
  },
}

export function DimensionBar({ label, state, method }: DimensionBarProps) {
  const config = STATE_CONFIG[state]

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
          {method === "computed" ? "C" : "LLM"}
        </span>
      </div>
      <div
        data-testid="dimension-bar"
        className={cn("relative h-6 rounded-md", config.color)}
      >
        <div
          data-testid="dimension-indicator"
          className={cn(
            "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2",
            config.color.split(" ")[1], // Extract border color
          )}
          style={{ left: config.position }}
        />
      </div>
    </div>
  )
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test app/components/homeostasis/__tests__/DimensionBar.test.tsx`

Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add app/components/homeostasis/
git commit -m "feat(ui): add DimensionBar component for homeostasis display

- Three-zone progress bar (LOW/HEALTHY/HIGH)
- Color-coded indicators (yellow/green/blue)
- Assessment method badge (C for computed, LLM)
- Full test coverage for all states

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: HomeostasisSidebar Component

**Files:**
- Create: `app/components/homeostasis/HomeostasisSidebar.tsx`
- Create: `app/components/homeostasis/__tests__/HomeostasisSidebar.test.tsx`
- Modify: `app/components/homeostasis/DimensionBar.tsx` (already created)

**Step 1: Write failing tests for HomeostasisSidebar**

Create `app/components/homeostasis/__tests__/HomeostasisSidebar.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HomeostasisSidebar } from "../HomeostasisSidebar"
import * as homeostasisFn from "../../../server/functions/homeostasis"

// Mock server function
vi.mock("../../../server/functions/homeostasis", () => ({
  getHomeostasisState: vi.fn(),
}))

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

describe("HomeostasisSidebar", () => {
  it("shows loading state initially", () => {
    vi.mocked(homeostasisFn.getHomeostasisState).mockReturnValue(
      new Promise(() => {}) // Never resolves
    )
    renderWithQuery(<HomeostasisSidebar sessionId="test-session" />)
    expect(screen.getByText("Homeostasis State")).toBeInTheDocument()
    // Skeleton loader present
    expect(screen.getAllByTestId("skeleton-bar")).toHaveLength(6)
  })

  it("displays all 6 dimensions when data loads", async () => {
    const mockState = {
      id: "state-1",
      sessionId: "test-session",
      messageId: "msg-1",
      dimensions: {
        knowledge_sufficiency: "HEALTHY",
        certainty_alignment: "HIGH",
        progress_momentum: "LOW",
        communication_health: "HEALTHY",
        productive_engagement: "HEALTHY",
        knowledge_application: "LOW",
      },
      assessmentMethod: {
        knowledge_sufficiency: "computed",
        certainty_alignment: "llm",
      },
      assessedAt: "2026-02-07T12:00:00.000Z",
    }

    vi.mocked(homeostasisFn.getHomeostasisState).mockResolvedValue(mockState)

    renderWithQuery(<HomeostasisSidebar sessionId="test-session" />)

    await waitFor(() => {
      expect(screen.getByText("Knowledge Sufficiency")).toBeInTheDocument()
    })

    expect(screen.getByText("Certainty Alignment")).toBeInTheDocument()
    expect(screen.getByText("Progress Momentum")).toBeInTheDocument()
    expect(screen.getByText("Communication Health")).toBeInTheDocument()
    expect(screen.getByText("Productive Engagement")).toBeInTheDocument()
    expect(screen.getByText("Knowledge Application")).toBeInTheDocument()
  })

  it("shows empty state when no assessment exists", async () => {
    vi.mocked(homeostasisFn.getHomeostasisState).mockResolvedValue(null)

    renderWithQuery(<HomeostasisSidebar sessionId="test-session" />)

    await waitFor(() => {
      expect(
        screen.getByText("No assessment yet. Send a message to begin.")
      ).toBeInTheDocument()
    })
  })

  it("shows error state with retry button", async () => {
    vi.mocked(homeostasisFn.getHomeostasisState).mockRejectedValue(
      new Error("Network error")
    )

    renderWithQuery(<HomeostasisSidebar sessionId="test-session" />)

    await waitFor(() => {
      expect(
        screen.getByText("Unable to load homeostasis state")
      ).toBeInTheDocument()
    })
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
  })

  it("displays timestamp from assessment", async () => {
    const mockState = {
      id: "state-1",
      sessionId: "test-session",
      messageId: "msg-1",
      dimensions: {
        knowledge_sufficiency: "HEALTHY",
        certainty_alignment: "HEALTHY",
        progress_momentum: "HEALTHY",
        communication_health: "HEALTHY",
        productive_engagement: "HEALTHY",
        knowledge_application: "HEALTHY",
      },
      assessmentMethod: {},
      assessedAt: "2026-02-07T12:34:56.000Z",
    }

    vi.mocked(homeostasisFn.getHomeostasisState).mockResolvedValue(mockState)

    renderWithQuery(<HomeostasisSidebar sessionId="test-session" />)

    await waitFor(() => {
      expect(screen.getByText(/12:34/)).toBeInTheDocument()
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test app/components/homeostasis/__tests__/HomeostasisSidebar.test.tsx`

Expected: FAIL with "Cannot find module '../HomeostasisSidebar'"

**Step 3: Implement HomeostasisSidebar component**

Create `app/components/homeostasis/HomeostasisSidebar.tsx`:

```typescript
import { useQuery } from "@tanstack/react-query"
import { getHomeostasisState } from "../../server/functions/homeostasis"
import { DimensionBar } from "./DimensionBar"

interface HomeostasisSidebarProps {
  sessionId: string
}

const DIMENSION_LABELS: Record<string, string> = {
  knowledge_sufficiency: "Knowledge Sufficiency",
  certainty_alignment: "Certainty Alignment",
  progress_momentum: "Progress Momentum",
  communication_health: "Communication Health",
  productive_engagement: "Productive Engagement",
  knowledge_application: "Knowledge Application",
}

function SkeletonBar() {
  return (
    <div className="space-y-1">
      <div className="h-4 w-32 bg-muted animate-pulse rounded" />
      <div
        data-testid="skeleton-bar"
        className="h-6 bg-muted animate-pulse rounded-md"
      />
    </div>
  )
}

export function HomeostasisSidebar({ sessionId }: HomeostasisSidebarProps) {
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["homeostasis", sessionId],
    queryFn: () => getHomeostasisState({ data: { sessionId } }),
    refetchOnWindowFocus: false,
    retry: 1,
  })

  return (
    <div className="w-[280px] border-l border-border bg-muted/50 p-4 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Homeostasis State</h2>
        {data && (
          <p className="text-xs text-muted-foreground">
            Last updated: {new Date(data.assessedAt).toLocaleTimeString()}
          </p>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBar key={i} />
          ))}
        </div>
      )}

      {error && (
        <div className="space-y-2">
          <p className="text-sm text-destructive">
            Unable to load homeostasis state
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-xs px-2 py-1 bg-muted hover:bg-muted/80 rounded"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && !data && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No assessment yet. Send a message to begin.
        </p>
      )}

      {data && (
        <div className="space-y-3">
          {Object.entries(data.dimensions).map(([key, state]) => (
            <DimensionBar
              key={key}
              label={DIMENSION_LABELS[key] || key}
              state={state}
              method={data.assessmentMethod[key] || "computed"}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test app/components/homeostasis/__tests__/HomeostasisSidebar.test.tsx`

Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add app/components/homeostasis/
git commit -m "feat(ui): add HomeostasisSidebar with 6 dimension display

- Sidebar component with fixed 280px width
- Displays all 6 homeostasis dimensions using DimensionBar
- Loading state with skeleton bars
- Error state with retry button
- Empty state for new sessions
- Shows last update timestamp
- Full test coverage for all states

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: ActivityLevelBadge Component

**Files:**
- Create: `app/components/chat/ActivityLevelBadge.tsx`
- Create: `app/components/chat/__tests__/ActivityLevelBadge.test.tsx`

**Step 1: Write failing tests for ActivityLevelBadge**

Create `app/components/chat/__tests__/ActivityLevelBadge.test.tsx`:

```typescript
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { ActivityLevelBadge } from "../ActivityLevelBadge"

describe("ActivityLevelBadge", () => {
  it("renders Level 0 with gray styling", () => {
    render(<ActivityLevelBadge level={0} />)
    const badge = screen.getByText("L0")
    expect(badge).toHaveClass("bg-gray-100", "text-gray-700")
  })

  it("renders Level 1 with blue styling", () => {
    render(<ActivityLevelBadge level={1} />)
    const badge = screen.getByText("L1")
    expect(badge).toHaveClass("bg-blue-100", "text-blue-700")
  })

  it("renders Level 2 with purple styling", () => {
    render(<ActivityLevelBadge level={2} model="Sonnet" />)
    const badge = screen.getByText("L2")
    expect(badge).toHaveClass("bg-purple-100", "text-purple-700")
  })

  it("renders Level 3 with orange styling and Reflexion label", () => {
    render(<ActivityLevelBadge level={3} model="Sonnet" />)
    const badge = screen.getByText("L3 + Reflexion")
    expect(badge).toHaveClass("bg-orange-100", "text-orange-700")
  })

  it("shows tooltip with model name on hover", async () => {
    render(<ActivityLevelBadge level={2} model="Sonnet" />)
    const badge = screen.getByText("L2")
    expect(badge).toHaveAttribute("title")
    expect(badge.getAttribute("title")).toContain("Sonnet")
  })

  it("shows tooltip without model when model not provided", () => {
    render(<ActivityLevelBadge level={1} />)
    const badge = screen.getByText("L1")
    expect(badge.getAttribute("title")).not.toContain("undefined")
  })

  it("returns null for undefined level", () => {
    const { container } = render(<ActivityLevelBadge level={undefined as any} />)
    expect(container.firstChild).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test app/components/chat/__tests__/ActivityLevelBadge.test.tsx`

Expected: FAIL with "Cannot find module '../ActivityLevelBadge'"

**Step 3: Implement ActivityLevelBadge component**

Create `app/components/chat/ActivityLevelBadge.tsx`:

```typescript
import { cn } from "@/lib/utils"

interface ActivityLevelBadgeProps {
  level: 0 | 1 | 2 | 3 | undefined
  model?: string
}

const LEVEL_CONFIG = {
  0: {
    label: "L0",
    color: "bg-gray-100 text-gray-700",
    description: "Direct execution",
  },
  1: {
    label: "L1",
    color: "bg-blue-100 text-blue-700",
    description: "Pattern-based",
  },
  2: {
    label: "L2",
    color: "bg-purple-100 text-purple-700",
    description: "Reasoning required",
  },
  3: {
    label: "L3 + Reflexion",
    color: "bg-orange-100 text-orange-700",
    description: "Deep reflection",
  },
}

export function ActivityLevelBadge({ level, model }: ActivityLevelBadgeProps) {
  if (level === undefined) return null

  const config = LEVEL_CONFIG[level]
  const tooltip = model
    ? `${config.description} (${model})`
    : config.description

  return (
    <span
      className={cn(
        "text-xs px-2 py-0.5 rounded-full",
        config.color
      )}
      title={tooltip}
    >
      {config.label}
    </span>
  )
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test app/components/chat/__tests__/ActivityLevelBadge.test.tsx`

Expected: PASS (7 tests)

**Step 5: Commit**

```bash
git add app/components/chat/ActivityLevelBadge.tsx app/components/chat/__tests__/ActivityLevelBadge.test.tsx
git commit -m "feat(ui): add ActivityLevelBadge component

- Badge shows activity level (L0-L3)
- Color-coded by level (gray/blue/purple/orange)
- Level 3 shows 'Reflexion' label
- Tooltip with model name and description
- Gracefully handles missing level/model
- Full test coverage

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Update MessageList to Include Activity Level

**Files:**
- Modify: `app/components/chat/MessageList.tsx`
- Modify: `app/components/chat/__tests__/MessageList.test.tsx` (create if doesn't exist)

**Step 1: Write failing test for activityLevel display**

Create or modify `app/components/chat/__tests__/MessageList.test.tsx`:

```typescript
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MessageList } from "../MessageList"

describe("MessageList", () => {
  it("displays activity level badge on assistant messages", () => {
    const messages = [
      {
        id: "msg-1",
        role: "assistant" as const,
        content: "Hello",
        createdAt: "2026-02-07T12:00:00Z",
        activityLevel: 2,
        model: "Sonnet",
      },
    ]

    render(<MessageList messages={messages} />)
    expect(screen.getByText("L2")).toBeInTheDocument()
  })

  it("does not show activity badge on user messages", () => {
    const messages = [
      {
        id: "msg-1",
        role: "user" as const,
        content: "Hello",
        createdAt: "2026-02-07T12:00:00Z",
      },
    ]

    render(<MessageList messages={messages} />)
    expect(screen.queryByText(/L\d/)).not.toBeInTheDocument()
  })

  it("gracefully handles missing activityLevel", () => {
    const messages = [
      {
        id: "msg-1",
        role: "assistant" as const,
        content: "Hello",
        createdAt: "2026-02-07T12:00:00Z",
        model: "Sonnet",
      },
    ]

    render(<MessageList messages={messages} />)
    // Should not crash, badge just not shown
    expect(screen.getByText("Hello")).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test app/components/chat/__tests__/MessageList.test.tsx`

Expected: FAIL - activityLevel badge not rendered

**Step 3: Update ChatMessage interface and MessageList component**

Modify `app/components/chat/MessageList.tsx`:

```typescript
import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { ActivityLevelBadge } from "./ActivityLevelBadge"

export interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  createdAt: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  tokenCount?: number
  activityLevel?: 0 | 1 | 2 | 3  // NEW
}

interface MessageListProps {
  messages: ChatMessage[]
  streaming?: boolean
}

export function MessageList({ messages, streaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on message count or streaming text change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length, messages[messages.length - 1]?.content])

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="space-y-4 max-w-3xl mx-auto">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex",
              msg.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-lg p-3",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground",
              )}
            >
              <p className="whitespace-pre-wrap text-sm">
                {msg.content}
                {streaming && msg.id === "streaming" && (
                  <span className="inline-block w-2 h-4 ml-0.5 bg-current animate-pulse" />
                )}
              </p>
              {msg.role === "assistant" &&
                msg.id !== "streaming" &&
                (msg.inputTokens || msg.outputTokens || msg.activityLevel !== undefined) && (
                  <div className="mt-1 flex gap-2 text-xs text-muted-foreground items-center">
                    {msg.activityLevel !== undefined && (
                      <ActivityLevelBadge level={msg.activityLevel} model={msg.model} />
                    )}
                    {msg.model && <span>{msg.model}</span>}
                    {msg.inputTokens && <span>↑{msg.inputTokens}</span>}
                    {msg.outputTokens && <span>↓{msg.outputTokens}</span>}
                    {msg.tokenCount && <span>({msg.tokenCount} total)</span>}
                  </div>
                )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test app/components/chat/__tests__/MessageList.test.tsx`

Expected: PASS (3 tests)

**Step 5: Run all app tests**

Run: `pnpm test app/`

Expected: All tests passing

**Step 6: Commit**

```bash
git add app/components/chat/
git commit -m "feat(ui): display activity level badges on assistant messages

- Add activityLevel to ChatMessage interface
- Render ActivityLevelBadge for assistant messages
- Position badge with token counts
- Graceful degradation for missing activityLevel
- Add tests for badge display

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Update getSessionMessages to Include activityLevel

**Files:**
- Modify: `server/functions/chat.logic.ts`
- Modify: `server/functions/__tests__/chat.integration.test.ts` (update existing test)

**Step 1: Update existing test to expect activityLevel**

Modify `server/functions/__tests__/chat.integration.test.ts` - find test for `getSessionMessagesLogic` and add assertion:

```typescript
// In existing test "retrieves messages for a session"
const messages = await getSessionMessagesLogic(sessionId)
expect(messages[0]).toHaveProperty("activityLevel")
```

**Step 2: Run test to verify it fails**

Run: `pnpm test server/functions/__tests__/chat.integration.test.ts -t "retrieves messages"`

Expected: FAIL - activityLevel property not present

**Step 3: Modify getSessionMessagesLogic to select activityLevel**

Modify `server/functions/chat.logic.ts` - in `getSessionMessagesLogic` function:

```typescript
export async function getSessionMessagesLogic(sessionId: string) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt))
}
```

No changes needed - `db.select()` already returns all columns including `activityLevel` added in Stage E3.

**Step 4: Verify schema has activityLevel column**

Check `server/db/schema.ts`:

```typescript
export const messages = pgTable("messages", {
  // ... other columns
  activityLevel: integer("activity_level"), // Should exist from Stage E3
})
```

If column doesn't exist, this is a blocker - Stage E3 should have added it.

**Step 5: Run test to verify it passes**

Run: `pnpm test server/functions/__tests__/chat.integration.test.ts -t "retrieves messages"`

Expected: PASS

**Step 6: Run all server tests**

Run: `pnpm test server/`

Expected: All tests passing

**Step 7: Commit**

```bash
git add server/functions/__tests__/chat.integration.test.ts
git commit -m "test: verify activityLevel included in message queries

- Update integration test to assert activityLevel present
- Confirm db.select() returns activityLevel column
- No changes needed to query logic (already selects all columns)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Integrate HomeostasisSidebar into Chat Page

**Files:**
- Modify: `app/routes/chat/$sessionId.tsx`
- Create: `app/routes/__tests__/chat.$sessionId.test.tsx`

**Step 1: Write failing integration test**

Create `app/routes/__tests__/chat.$sessionId.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router"
import { routeTree } from "../../routeTree.gen"
import * as chatFunctions from "../../../server/functions/chat"
import * as homeostasisFunctions from "../../../server/functions/homeostasis"

// Mock server functions
vi.mock("../../../server/functions/chat")
vi.mock("../../../server/functions/homeostasis")

describe("Chat page integration", () => {
  it("displays homeostasis sidebar alongside messages", async () => {
    const mockMessages = [
      {
        id: "msg-1",
        role: "assistant",
        content: "Hello",
        createdAt: new Date(),
        activityLevel: 2,
        model: "Sonnet",
      },
    ]

    const mockHomeostasis = {
      id: "state-1",
      sessionId: "test-session",
      messageId: "msg-1",
      dimensions: {
        knowledge_sufficiency: "HEALTHY",
        certainty_alignment: "HIGH",
        progress_momentum: "LOW",
        communication_health: "HEALTHY",
        productive_engagement: "HEALTHY",
        knowledge_application: "LOW",
      },
      assessmentMethod: {},
      assessedAt: "2026-02-07T12:00:00.000Z",
    }

    vi.mocked(chatFunctions.getSessionMessages).mockResolvedValue(mockMessages)
    vi.mocked(homeostasisFunctions.getHomeostasisState).mockResolvedValue(mockHomeostasis)

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ["/chat/test-session"],
      }),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText("Homeostasis State")).toBeInTheDocument()
      expect(screen.getByText("Knowledge Sufficiency")).toBeInTheDocument()
      expect(screen.getByText("L2")).toBeInTheDocument() // Activity badge
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test app/routes/__tests__/chat.$sessionId.test.tsx`

Expected: FAIL - HomeostasisSidebar not rendered

**Step 3: Integrate HomeostasisSidebar into chat page**

Modify `app/routes/chat/$sessionId.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { ChatInput } from "@/components/chat/ChatInput"
import type { ChatMessage } from "@/components/chat/MessageList"
import { MessageList } from "@/components/chat/MessageList"
import { HomeostasisSidebar } from "@/components/homeostasis/HomeostasisSidebar"
import { getSessionMessages } from "../../../server/functions/chat"

export const Route = createFileRoute("/chat/$sessionId")({
  component: ChatPage,
})

const PROVIDER_MODELS: Record<string, string[]> = {
  ollama: ["llama3.2", "llama3.1", "mistral", "codellama"],
  openrouter: [
    "z-ai/glm-4.5-air:free",
    "anthropic/claude-sonnet-4",
    "google/gemini-2.5-flash",
    "meta-llama/llama-3.1-70b-instruct",
  ],
  "claude-code": ["sonnet", "opus", "haiku"],
}

const PROVIDERS = Object.keys(PROVIDER_MODELS)

function mapRows(
  rows: Awaited<ReturnType<typeof getSessionMessages>>,
): ChatMessage[] {
  return rows.map((r) => ({
    id: r.id,
    role: r.role as "user" | "assistant" | "system",
    content: r.content,
    createdAt:
      r.createdAt instanceof Date
        ? r.createdAt.toISOString()
        : String(r.createdAt),
    model: r.model ?? undefined,
    inputTokens: r.inputTokens ?? undefined,
    outputTokens: r.outputTokens ?? undefined,
    tokenCount: r.tokenCount ?? undefined,
    activityLevel: r.activityLevel ?? undefined,  // NEW
  }))
}

function ChatPage() {
  const { sessionId } = Route.useParams()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [streamingText, setStreamingText] = useState("")
  const [provider, setProvider] = useState("ollama")
  const [model, setModel] = useState("llama3.2")

  useEffect(() => {
    getSessionMessages({ data: { sessionId } }).then((rows) =>
      setMessages(mapRows(rows)),
    )
  }, [sessionId])

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider)
    setModel(PROVIDER_MODELS[newProvider]?.[0] ?? "")
  }

  const handleSend = async (content: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)
    setStreamingText("")

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: content,
          provider,
          model,
        }),
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (!response.body) throw new Error("No response body")

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        fullText += chunk
        setStreamingText(fullText)
      }

      const updated = await getSessionMessages({ data: { sessionId } })
      setMessages(mapRows(updated))
      setStreamingText("")
    } catch (error) {
      console.error("Chat error:", error)
    } finally {
      setLoading(false)
    }
  }

  const displayMessages = streamingText
    ? [
        ...messages,
        {
          id: "streaming",
          role: "assistant" as const,
          content: streamingText,
          createdAt: new Date().toISOString(),
        },
      ]
    : messages

  return (
    <div className="flex h-screen">
      <div className="flex flex-col flex-1">
        <header className="flex items-center justify-between p-4 border-b border-border">
          <h1 className="text-xl font-semibold">Galatea Chat</h1>
          <div className="flex items-center gap-2">
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              disabled={loading}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={loading}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              {(PROVIDER_MODELS[provider] ?? []).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </header>
        <MessageList messages={displayMessages} streaming={!!streamingText} />
        <ChatInput onSend={handleSend} disabled={loading} />
      </div>
      <HomeostasisSidebar sessionId={sessionId} />
    </div>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test app/routes/__tests__/chat.$sessionId.test.tsx`

Expected: PASS

**Step 5: Type check**

Run: `pnpm exec tsc --noEmit`

Expected: 0 errors

**Step 6: Commit**

```bash
git add app/routes/chat/\$sessionId.tsx app/routes/__tests__/
git commit -m "feat(ui): integrate homeostasis sidebar into chat page

- Add HomeostasisSidebar to chat layout
- Map activityLevel from DB to ChatMessage interface
- Flex layout with sidebar on right side
- Integration test for sidebar + messages display
- Type-safe message mapping

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Add Homeostasis Refetch on New Message

**Files:**
- Modify: `app/routes/chat/$sessionId.tsx`
- Modify: `app/components/homeostasis/HomeostasisSidebar.tsx`

**Step 1: Update HomeostasisSidebar to accept refetch trigger**

Currently, HomeostasisSidebar uses TanStack Query internally. We need to trigger refetch when message count changes.

Modify `app/components/homeostasis/HomeostasisSidebar.tsx`:

```typescript
import { useQuery } from "@tanstack/react-query"
import { useEffect } from "react"
import { getHomeostasisState } from "../../server/functions/homeostasis"
import { DimensionBar } from "./DimensionBar"

interface HomeostasisSidebarProps {
  sessionId: string
  messageCount: number  // NEW: Trigger refetch on change
}

// ... rest of component unchanged

export function HomeostasisSidebar({ sessionId, messageCount }: HomeostasisSidebarProps) {
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["homeostasis", sessionId],
    queryFn: () => getHomeostasisState({ data: { sessionId } }),
    refetchOnWindowFocus: false,
    retry: 1,
  })

  // Refetch when message count changes
  useEffect(() => {
    if (messageCount > 0) {
      refetch()
    }
  }, [messageCount, refetch])

  // ... rest of component unchanged
}
```

**Step 2: Update chat page to pass messageCount**

Modify `app/routes/chat/$sessionId.tsx`:

```typescript
// In ChatPage component, after displayMessages definition:

return (
  <div className="flex h-screen">
    <div className="flex flex-col flex-1">
      {/* ... header and MessageList unchanged ... */}
    </div>
    <HomeostasisSidebar sessionId={sessionId} messageCount={messages.length} />
  </div>
)
```

**Step 3: Update tests for new prop**

Modify `app/components/homeostasis/__tests__/HomeostasisSidebar.test.tsx`:

```typescript
// Update all renderWithQuery calls to include messageCount:
renderWithQuery(<HomeostasisSidebar sessionId="test-session" messageCount={0} />)
```

**Step 4: Run tests**

Run: `pnpm test app/components/homeostasis/__tests__/HomeostasisSidebar.test.tsx`

Expected: PASS (all tests)

Run: `pnpm test app/routes/__tests__/chat.$sessionId.test.tsx`

Expected: PASS

**Step 5: Type check**

Run: `pnpm exec tsc --noEmit`

Expected: 0 errors

**Step 6: Commit**

```bash
git add app/components/homeostasis/ app/routes/
git commit -m "feat(ui): refetch homeostasis state on new messages

- Add messageCount prop to HomeostasisSidebar
- Trigger refetch via useEffect when count changes
- Update tests to include messageCount prop
- Ensures sidebar updates after each response

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Manual Testing and Verification

**Files:**
- None (manual testing only)

**Step 1: Start development server**

Run: `pnpm dev`

Expected: Server starts on http://localhost:3000

**Step 2: Create test session and send messages**

1. Navigate to chat page
2. Send message: "What's the weather like?"
3. Verify:
   - Activity badge appears on response (L0, L1, or L2)
   - Homeostasis sidebar shows 6 dimensions
   - Sidebar updates after response completes

**Step 3: Test Level 3 message (if Reflexion triggers)**

1. Send message: "Analyze the trade-offs between microservices and monolithic architecture for a startup with 5 engineers"
2. Verify:
   - "L3 + Reflexion" badge appears
   - Tooltip shows model name
   - Sidebar updates

**Step 4: Test empty state**

1. Create new session
2. Verify sidebar shows: "No assessment yet. Send a message to begin."

**Step 5: Test responsive layout (optional for prototype)**

1. Resize browser to mobile width
2. Verify sidebar behavior (may overflow - acceptable for prototype)

**Step 6: Document findings**

If any visual issues found:
- Screenshot and save to `/tmp/stage-f-visual-review/`
- Note in comments for future styling iteration

**Step 7: Mark manual testing complete**

Document in plan review comment when presenting to architect.

---

## Task 10: Final Integration Test and Documentation

**Files:**
- Create: `tests/integration/stage-f-ui-visualization.test.ts`
- Update: `docs/plans/2026-02-07-stage-f-ui-visualization-design.md` (mark checkboxes)

**Step 1: Write comprehensive integration test**

Create `tests/integration/stage-f-ui-visualization.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest"
import { db } from "../../server/db"
import { homeostasisStates, messages, sessions } from "../../server/db/schema"
import { getHomeostasisState } from "../../server/functions/homeostasis"
import { getSessionMessagesLogic } from "../../server/functions/chat.logic"

describe("Stage F: UI Visualization Integration", () => {
  let testSessionId: string

  beforeEach(async () => {
    // Create test session
    const [session] = await db
      .insert(sessions)
      .values({ name: "Test Session" })
      .returning()
    testSessionId = session.id
  })

  it("full flow: send message → store activity level → store homeostasis → query API", async () => {
    // Step 1: Insert message with activity level
    const [message] = await db
      .insert(messages)
      .values({
        sessionId: testSessionId,
        role: "assistant",
        content: "Test response",
        model: "Sonnet",
        activityLevel: 2,
        tokenCount: 100,
      })
      .returning()

    // Step 2: Insert homeostasis state
    const [homeostasis] = await db
      .insert(homeostasisStates)
      .values({
        sessionId: testSessionId,
        messageId: message.id,
        knowledgeSufficiency: "HEALTHY",
        certaintyAlignment: "HIGH",
        progressMomentum: "LOW",
        communicationHealth: "HEALTHY",
        productiveEngagement: "HEALTHY",
        knowledgeApplication: "LOW",
        assessmentMethod: {
          knowledge_sufficiency: "computed",
          certainty_alignment: "llm",
        },
        assessedAt: new Date(),
      })
      .returning()

    // Step 3: Query messages API (should include activityLevel)
    const messagesResult = await getSessionMessagesLogic(testSessionId)
    expect(messagesResult).toHaveLength(1)
    expect(messagesResult[0].activityLevel).toBe(2)

    // Step 4: Query homeostasis API
    const homeostasisResult = await getHomeostasisState({
      data: { sessionId: testSessionId },
    })
    expect(homeostasisResult).not.toBeNull()
    expect(homeostasisResult?.dimensions.knowledge_sufficiency).toBe("HEALTHY")
    expect(homeostasisResult?.dimensions.certainty_alignment).toBe("HIGH")
  })

  it("handles missing homeostasis state gracefully", async () => {
    const result = await getHomeostasisState({
      data: { sessionId: testSessionId },
    })
    expect(result).toBeNull()
  })

  it("handles missing activity level on old messages", async () => {
    // Insert message without activityLevel (simulates old data)
    await db.insert(messages).values({
      sessionId: testSessionId,
      role: "assistant",
      content: "Old message",
      model: "Sonnet",
      // No activityLevel
    })

    const messagesResult = await getSessionMessagesLogic(testSessionId)
    expect(messagesResult).toHaveLength(1)
    expect(messagesResult[0].activityLevel).toBeUndefined()
  })
})
```

**Step 2: Run integration test**

Run: `pnpm test tests/integration/stage-f-ui-visualization.test.ts`

Expected: PASS (3 tests)

**Step 3: Run all tests**

Run: `pnpm test`

Expected: All tests passing (including new Stage F tests)

**Step 4: Update design document checkboxes**

Modify `docs/plans/2026-02-07-stage-f-ui-visualization-design.md`:

- Mark all "Implementation Notes" checkboxes as complete
- Mark all "Success Criteria" checkboxes as complete
- Add "Implementation Complete" section at bottom:

```markdown
---

## Implementation Complete

**Date:** 2026-02-07
**Commit Range:** [first-commit-hash]...[last-commit-hash]

**Files Created:**
- `server/functions/homeostasis.ts`
- `app/components/homeostasis/HomeostasisSidebar.tsx`
- `app/components/homeostasis/DimensionBar.tsx`
- `app/components/chat/ActivityLevelBadge.tsx`
- 5 test files

**Files Modified:**
- `app/routes/chat/$sessionId.tsx`
- `app/components/chat/MessageList.tsx`

**Test Coverage:**
- Component tests: 21 tests
- Integration tests: 5 tests
- All passing ✅

**Manual Testing:**
- [x] Activity badges display correctly
- [x] Homeostasis sidebar shows 6 dimensions
- [x] Refetch works after new message
- [x] Empty state handled gracefully
- [x] Error state with retry button works

**Known Issues:**
- None blocking MVP
- Styling may need visual review (noted in design doc)

**Ready for Stage G** ✅
```

**Step 5: Type check**

Run: `pnpm exec tsc --noEmit`

Expected: 0 errors

**Step 6: Linter check**

Run: `pnpm biome check .`

Expected: 0 warnings

**Step 7: Final commit**

```bash
git add tests/integration/ docs/plans/
git commit -m "test: add Stage F integration test and mark complete

- Comprehensive integration test for full flow
- Tests message + homeostasis query APIs
- Tests graceful degradation for missing data
- Update design doc with completion status
- All tests passing (26 new tests)

Stage F: UI Visualization COMPLETE ✅

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `pnpm test` - All tests passing
- [ ] `pnpm exec tsc --noEmit` - No type errors
- [ ] `pnpm biome check .` - No lint warnings
- [ ] `pnpm dev` - Server starts successfully
- [ ] Manual testing complete (see Task 9)
- [ ] All 10 tasks committed with clear messages
- [ ] Design document updated with completion status

---

## Notes for Implementation

**Dependencies:**
- No new packages needed (TanStack Query, shadcn/ui already installed)

**Key Decisions:**
- TanStack Query for data fetching (matches existing patterns)
- Fire-and-forget homeostasis may lag - timestamp shown
- Graceful degradation for missing data (prototype priority)
- Styling will need visual review after implementation

**Testing Strategy:**
- Component tests for all new components
- Integration test for full data flow
- Manual testing for visual verification

**Related Skills:**
- Use `@superpowers:test-driven-development` for TDD discipline
- Use `@superpowers:verification-before-completion` before claiming complete
- Use `@superpowers:requesting-code-review` after Task 10

---

**Plan complete and ready for execution** ✅
