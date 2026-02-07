# Stage F: UI Visualization Design

**Date:** 2026-02-07
**Phase:** Phase 3 - Homeostasis Engine
**Stage:** F - UI Visualization
**Status:** Design Complete, Ready for Implementation

---

## Overview

Create visual representation of Phase 3 psychological state tracking in the chat UI. Display homeostasis balance across 6 dimensions and activity level classification on each message.

**Goals:**
- Make homeostasis state visible to users
- Show activity level classification per message
- Enable monitoring and debugging of Phase 3 components
- Maintain clean UX that doesn't distract from chat

**Tech Stack:**
- Remix (React framework)
- TanStack Query for data fetching
- shadcn/ui components
- Tailwind CSS

---

## Architecture & Data Flow

### Component Architecture

```
app/routes/chat/$sessionId.tsx
├── ChatLayout (new wrapper)
│   ├── MessageList (existing, enhanced)
│   │   └── ActivityLevelBadge (new)
│   └── HomeostasisSidebar (new)
│       └── DimensionBar (new)
└── ChatInput (existing, unchanged)
```

### Data Flow

1. **On Page Load:**
   - Fetch messages (with activityLevel field)
   - Fetch latest homeostasis state

2. **On New Message:**
   - Stream response
   - Refetch messages + homeostasis state

3. **Homeostasis Display:**
   - TanStack Query with queryKey: `['homeostasis', sessionId]`
   - Refetch triggered by message count change
   - Fire-and-forget backend may lag - show timestamp

---

## Component Structure

### HomeostasisSidebar Component

**Location:** `app/components/homeostasis/HomeostasisSidebar.tsx`

**Props:**
```typescript
interface HomeostasisSidebarProps {
  sessionId: string
}
```

**Structure:**
- Header: "Homeostasis State"
- Last Updated: Timestamp
- 6 × DimensionBar components:
  - Knowledge Sufficiency
  - Certainty Alignment
  - Progress Momentum
  - Communication Health
  - Productive Engagement
  - Knowledge Application

**States:**
- Loading: Skeleton bars with shimmer
- Error: "Unable to load homeostasis state" + retry button
- Empty: "No assessment yet. Send a message to begin."
- Success: 6 dimension bars

### DimensionBar Component

**Location:** `app/components/homeostasis/DimensionBar.tsx`

**Props:**
```typescript
interface DimensionBarProps {
  label: string        // "Knowledge Sufficiency"
  state: "LOW" | "HEALTHY" | "HIGH"
  method: "computed" | "llm"
}
```

**Visual Design:**
- Progress bar with 3 colored zones:
  - LOW (0-33%): Yellow background
  - HEALTHY (34-66%): Green background
  - HIGH (67-100%): Blue background
- Indicator dot positioned at zone center:
  - LOW: 16%
  - HEALTHY: 50%
  - HIGH: 83%
- Small badge showing assessment method:
  - "C" for computed
  - "LLM" for llm

### ActivityLevelBadge Component

**Location:** `app/components/chat/ActivityLevelBadge.tsx`

**Props:**
```typescript
interface ActivityLevelBadgeProps {
  level: 0 | 1 | 2 | 3
  model?: string
}
```

**Visual Design:**
- Small pill badge next to message timestamp
- Level-specific colors:
  - Level 0: Gray "L0"
  - Level 1: Blue "L1"
  - Level 2: Purple "L2"
  - Level 3: Orange "L3 + Reflexion"
- Tooltip on hover shows:
  - Model name (e.g., "Sonnet")
  - Activity description (e.g., "Reasoning required")

---

## API Endpoints & Data

### Extend Existing Endpoint

`GET /api/chat/:sessionId/messages`

**Enhancement:** Add `activityLevel` to response (already stored in DB)

```typescript
interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  model?: string
  tokenCount?: number
  inputTokens?: number
  outputTokens?: number
  activityLevel?: 0 | 1 | 2 | 3  // NEW
  createdAt: Date
}
```

### New Endpoint

`GET /api/chat/:sessionId/homeostasis`

**Returns:** Most recent homeostasis state for session

```typescript
interface HomeostasisStateResponse {
  id: string
  sessionId: string
  messageId: string
  dimensions: {
    knowledge_sufficiency: "LOW" | "HEALTHY" | "HIGH"
    certainty_alignment: "LOW" | "HEALTHY" | "HIGH"
    progress_momentum: "LOW" | "HEALTHY" | "HIGH"
    communication_health: "LOW" | "HEALTHY" | "HIGH"
    productive_engagement: "LOW" | "HEALTHY" | "HIGH"
    knowledge_application: "LOW" | "HEALTHY" | "HIGH"
  }
  assessmentMethod: Record<string, "computed" | "llm">
  assessedAt: Date
}
```

**Implementation:**
- Location: `app/routes/api.chat.$sessionId.homeostasis.ts`
- Query: `SELECT * FROM homeostasis_states WHERE session_id = $1 ORDER BY assessed_at DESC LIMIT 1`
- Returns: 200 with state, or 404 if no assessment yet

### TanStack Query Hooks

**Location:** `app/hooks/useHomeostasisState.ts`

```typescript
function useHomeostasisState(sessionId: string) {
  return useQuery({
    queryKey: ['homeostasis', sessionId],
    queryFn: () => fetch(`/api/chat/${sessionId}/homeostasis`).then(r => r.json()),
    refetchOnWindowFocus: false,
    retry: 1
  })
}
```

**Refetch Trigger:** Message count change (detected in existing messages query)

**Note:** Prototype API design. Will need reexamination in future iteration.

---

## Styling & UX

### HomeostasisSidebar Styling

**Layout:**
- Fixed width: 280px
- Right sidebar (doesn't push content)
- Background: `bg-muted/50` (subtle, non-intrusive)
- Border left: `border-l border-border`
- Padding: `p-4`
- Sticky positioning on scroll

**Responsive:**
- Desktop (≥1024px): Always visible
- Tablet/Mobile (<1024px): Hidden by default, toggle button to show overlay

### DimensionBar Styling

**Progress Bar:**
- Height: 24px
- Three-zone gradient background:
  - 0-33%: `bg-yellow-100` with `border-yellow-500` (LOW zone)
  - 34-66%: `bg-green-100` with `border-green-500` (HEALTHY zone)
  - 67-100%: `bg-blue-100` with `border-blue-500` (HIGH zone)
- Indicator: Dot positioned at zone center with matching border color
- Rounded corners: `rounded-md`

**Label:**
- Above bar: `text-sm font-medium`
- Method badge: `text-xs bg-muted px-1.5 py-0.5 rounded`

### ActivityLevelBadge Styling

**Badge:**
- Inline with message timestamp
- Size: `text-xs px-2 py-0.5 rounded-full`
- Colors:
  - L0: `bg-gray-100 text-gray-700`
  - L1: `bg-blue-100 text-blue-700`
  - L2: `bg-purple-100 text-purple-700`
  - L3: `bg-orange-100 text-orange-700`

**Tooltip (shadcn/ui):**
- Shows model name + activity description
- Example: "Level 2 (Sonnet) - Reasoning required"

### Loading States

- Skeleton bars for homeostasis with shimmer effect
- Fade-in animation on data load
- Empty state: Centered message "Assessment will appear after first message"

**Note:** Styling will need visual review and adjustment after implementation.

---

## Error Handling & Edge Cases

### Homeostasis Query Errors

**404 (No assessment yet):**
- Display: "No homeostasis assessment yet. Send a message to begin."
- State: Not an error, expected for new sessions

**500 (Server error):**
- Display: "Unable to load homeostasis state"
- Retry button available
- Console warning logged

**Network failure:**
- TanStack Query automatic retry (1 attempt)
- Fallback to cached data if available
- Show stale data with warning indicator

### Activity Level Edge Cases

**Missing activityLevel on message:**
- Occurs for messages created before Phase 3
- Fallback: Don't show badge (graceful degradation)
- No error thrown

**Level 3 with missing model:**
- Should not happen (always set in Stage E)
- Fallback: Show "L3" without model in tooltip

### Race Conditions

**New message arrives during homeostasis fetch:**
- TanStack Query handles via queryKey invalidation
- Message count change triggers refetch
- No manual synchronization needed

**Multiple rapid messages:**
- Fire-and-forget homeostasis may lag behind messages
- Display: Show last available assessment
- Note: "Assessment from [timestamp]" shows lag if >5s

### Empty States

**New session (no messages):**
- Homeostasis sidebar: "Send your first message"
- No error, just informational

**Session with messages but homeostasis skipped:**
- Occurs when `classification.skipHomeostasis = true`
- Display: Last available state, or "Not assessed for this message type"

### Graceful Degradation

All visualization is **non-blocking**:
- Chat continues to work if homeostasis endpoint fails
- Activity badges are additive - message display unchanged if missing
- Sidebar collapse available if needed

---

## Testing Strategy

### Component Tests

**HomeostasisSidebar.test.tsx:**
- [ ] Renders loading state with skeleton bars
- [ ] Displays 6 dimension bars when data loads
- [ ] Shows empty state when no assessment exists
- [ ] Handles error state with retry button
- [ ] Displays correct timestamp

**DimensionBar.test.tsx:**
- [ ] Renders all 3 states (LOW, HEALTHY, HIGH)
- [ ] Shows correct color zones
- [ ] Positions indicator correctly (16%, 50%, 83%)
- [ ] Displays method badge (C vs LLM)
- [ ] Label text correct

**ActivityLevelBadge.test.tsx:**
- [ ] Renders all 4 levels (0, 1, 2, 3)
- [ ] Shows correct colors per level
- [ ] Tooltip displays model name
- [ ] Gracefully handles missing level (no render)
- [ ] Gracefully handles missing model (shows level only)

### Integration Tests

**chat.$sessionId.test.tsx:**
- [ ] Fetches messages with activityLevel field
- [ ] Fetches homeostasis state on load
- [ ] Refetches homeostasis after new message
- [ ] Handles 404 homeostasis gracefully
- [ ] Activity badges appear on assistant messages

### API Route Tests

**api.chat.$sessionId.homeostasis.test.ts:**
- [ ] Returns latest homeostasis state
- [ ] Returns 404 when no state exists
- [ ] Validates sessionId parameter
- [ ] Handles database errors gracefully

### Manual Testing Checklist

- [ ] Send Level 0-3 messages, verify badges appear
- [ ] Verify homeostasis sidebar updates after each message
- [ ] Test responsive layout (desktop/mobile)
- [ ] Verify color zones are visually distinct
- [ ] Check tooltip on activity badge hover
- [ ] Test with session that has no homeostasis data
- [ ] Verify graceful degradation when endpoint fails

---

## Implementation Notes

### Files to Create

1. `app/components/homeostasis/HomeostasisSidebar.tsx`
2. `app/components/homeostasis/DimensionBar.tsx`
3. `app/components/chat/ActivityLevelBadge.tsx`
4. `app/hooks/useHomeostasisState.ts`
5. `app/routes/api.chat.$sessionId.homeostasis.ts`
6. Component test files (5 files)

### Files to Modify

1. `app/routes/chat/$sessionId.tsx` - Add ChatLayout wrapper, integrate sidebar
2. `app/components/chat/MessageList.tsx` - Add ActivityLevelBadge to assistant messages
3. Existing messages API route - Add activityLevel to SELECT

### Dependencies

All dependencies already installed:
- TanStack Query (already in use)
- shadcn/ui (already in use)
- Tailwind CSS (already in use)

No new package installations required.

---

## Success Criteria

- [ ] Homeostasis sidebar displays 6 dimensions with correct states
- [ ] Activity level badges appear on all assistant messages (L0-L3)
- [ ] Refetch works after sending new message
- [ ] All component tests passing
- [ ] All integration tests passing
- [ ] Graceful degradation verified (sidebar/badges fail gracefully)
- [ ] Responsive layout works on mobile
- [ ] Performance: No noticeable lag in chat experience

---

## Future Enhancements (Post-Prototype)

**API Improvements:**
- Add pagination for homeostasis history
- Add filtering by dimension or time range
- Consider WebSocket for real-time updates

**UX Improvements:**
- Click dimension to see historical trend
- Expandable details showing assessment reasoning
- Visual indicators for rapid state changes
- Guidance suggestions inline when imbalanced

**Performance:**
- Consider debouncing refetch on rapid messages
- Cache homeostasis state in localStorage
- Optimize query invalidation strategy

---

**Design validated and ready for implementation** ✅
