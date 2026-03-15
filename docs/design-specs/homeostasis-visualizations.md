# Homeostasis Visualizations: Fleet Dashboard Sparklines & Detail Heatmap

**Status**: Design Spec
**Date**: 2026-03-14
**Scope**: Fleet dashboard improvements — agent card sparklines + detail page heatmap
**Implementation**: Pure CSS/SVG, no external charting libraries

---

## Overview

Add three complementary visualizations to the fleet dashboard:

1. **Dimension Sparklines** — On each `AgentCard`, show 7 tiny vertical bars (one per dimension) from the most recent tick. Color-coded: 🟢 GREEN (HEALTHY), 🟡 YELLOW (LOW/HIGH), 🔴 RED (self_preservation:LOW). Quick visual scan of agent health.

2. **Dimension History Heatmap** — On the agent detail page (`/agent/fleet/$agentId`), display a heatmap grid showing the last 20 ticks (rows) × 7 dimensions (columns). Each cell is color-coded. Reveals patterns: "stuck in LOW for 3 ticks?", "self_preservation spiking?", "momentary dip or trend?"

3. **Tick Duration Trend Line** — On the agent detail page, a small line chart showing `durationMs` for the last 20 ticks. Reveals performance patterns: "spikes in processing time?", "consistent slow ticks?", "improving trend?". Pure SVG with grid lines and hover tooltip.

---

## Component Architecture

### Layer 1: Fleet Overview (`/agent/fleet`)

#### `AgentCard` → Extended with Sparklines

**Current structure:**
```tsx
interface AgentCardProps {
  id: string
  name: string
  role: string
  domain: string
  health: string
  lastTick: string | null
}
```

**Enhanced structure:**
```tsx
interface AgentCardProps {
  id: string
  name: string
  role: string
  domain: string
  health: string
  lastTick: string | null
  // NEW: homeostasis snapshot from most recent tick
  homeostasisSnapshot?: HomeostasisState
}
```

#### New Component: `DimensionSparklines`

**Purpose**: Render 7 vertical bars in a single-line SVG.

**Props:**
```tsx
interface DimensionSparklineProps {
  homeostasis: HomeostasisState
  compact?: boolean // if true, smaller bars for tight layouts
}
```

**Output**: Inline SVG, ~80px wide, ~24px tall. No <svg> wrapper needed if we use CSS inline styles.

**Rendering:**
```
[dimension order]
knowledge_sufficiency
certainty_alignment
progress_momentum
communication_health
productive_engagement
knowledge_application
self_preservation

[each bar]
width: 10px
height: varies by state
colors:
  HEALTHY → #22c55e (green-500)
  LOW/HIGH → #eab308 (yellow-500)
  self_preservation:LOW → #ef4444 (red-500)
```

---

### Layer 2: Fleet Detail Page (`/agent/fleet/$agentId`)

#### New Component: `DimensionHistoryHeatmap`

**Purpose**: 20-tick history grid showing dimension state changes over time.

**Props:**
```tsx
interface DimensionHistoryHeatmapProps {
  // Last 20 ticks (oldest → newest, left to right is time progression)
  ticks: TickRecord[]
  agentId: string
}
```

**Data Contract:**
- `ticks` array sorted by timestamp ascending (oldest first)
- Each tick contains `homeostasis: HomeostasisState`
- If fewer than 20 ticks, show what's available

**Grid Layout:**

```
Rows: 20 (ticks)
Cols: 7 (dimensions)
Cell size: 20px × 20px (adjustable)

     KS   CA   PM   CH   PE   KA   SP
T20  🟢  🟢  🟡  🟢  🟢  🟢  🟢   ← newest
T19  🟢  🟢  🟡  🟢  🟢  🟢  🟢
T18  🟢  🟡  🟡  🟢  🟢  🟢  🟢
...
T1   🟡  🔴  🔴  🟡  🟢  🟢  🟢   ← oldest
```

**Color Encoding:**
```
HEALTHY       → #22c55e (green-500)
LOW           → #eab308 (yellow-500)
HIGH          → #fbbf24 (amber-400, slightly lighter)
self_preservation:LOW → #ef4444 (red-500)
UNKNOWN/NULL  → #d1d5db (gray-300, if data missing)
```

**Hover Behavior:**
- Highlight entire row (tick) → show timestamp + all dimensions at that tick
- Highlight entire column (dimension) → show dimension trend across 20 ticks
- Hover cell → show tooltip: "Dimension Name: STATE @ Tick 12 (15:32:45 UTC)"

---

## Data Flow

### 1. API Enhancement

**Current endpoint**: `GET /api/agent/fleet/{agentId}`

**Response structure (current):**
```json
{
  "spec": {...},
  "operationalContext": {...},
  "recentTicks": [...]
}
```

**Tick record structure (assumed):**
```typescript
interface TickRecord {
  timestamp: string // ISO 8601
  tick_id: string
  agent_id: string
  homeostasis: HomeostasisState
  activity?: {
    type: string
    status: string
  }
  // other fields...
}
```

**No changes needed** — `recentTicks` already contains homeostasis data. Frontend filters to:
- Last 1 tick → for sparklines on card
- Last 20 ticks → for heatmap on detail page

### 2. Frontend Data Slicing

**In `AgentCard` (fleet overview):**
```tsx
// Get most recent tick from fleet API response
const latestTick = agentData.recentTicks?.[0] // or use provided snapshot
export function AgentCard({ homeostasisSnapshot, ... }: AgentCardProps) {
  return (
    <div>
      {/* existing card content */}
      {homeostasisSnapshot && (
        <DimensionSparklines homeostasis={homeostasisSnapshot} />
      )}
    </div>
  )
}
```

**In Agent Detail Page:**
```tsx
const { data } = useQuery(["fleet-agent", agentId], ...)
const ticks = data?.recentTicks ?? [] // Already sorted desc by API

export function AgentDetailPage() {
  return (
    <>
      {/* existing content */}
      <DimensionHistoryHeatmap ticks={ticks.reverse()} agentId={agentId} />
    </>
  )
}
```

---

## Component Implementations

### Component: `DimensionSparklines.tsx`

```typescript
import { memo } from "react"
import type { HomeostasisState } from "server/engine/types"

const DIMENSIONS: Array<keyof HomeostasisState> = [
  "knowledge_sufficiency",
  "certainty_alignment",
  "progress_momentum",
  "communication_health",
  "productive_engagement",
  "knowledge_application",
  "self_preservation",
]

const DIMENSION_LABELS: Record<string, string> = {
  knowledge_sufficiency: "KS",
  certainty_alignment: "CA",
  progress_momentum: "PM",
  communication_health: "CH",
  productive_engagement: "PE",
  knowledge_application: "KA",
  self_preservation: "SP",
}

const STATE_COLORS: Record<string, string> = {
  HEALTHY: "#22c55e",
  LOW: "#eab308",
  HIGH: "#fbbf24",
}

function getBarColor(dim: string, state: string): string {
  if (dim === "self_preservation" && state === "LOW") {
    return "#ef4444"
  }
  return STATE_COLORS[state] ?? "#d1d5db"
}

function getBarHeight(state: string): number {
  // HEALTHY: full height (20px)
  // LOW/HIGH: 70% (14px)
  return state === "HEALTHY" ? 20 : 14
}

interface DimensionSparklineProps {
  homeostasis: HomeostasisState
  compact?: boolean
}

export const DimensionSparklines = memo(
  ({ homeostasis, compact }: DimensionSparklineProps) => {
    const barWidth = compact ? 8 : 10
    const spacing = compact ? 1 : 2
    const totalWidth = DIMENSIONS.length * (barWidth + spacing) - spacing
    const height = compact ? 20 : 24

    return (
      <div className="mt-2 flex items-end gap-0.5">
        <svg
          width={totalWidth}
          height={height}
          viewBox={`0 0 ${totalWidth} ${height}`}
          className="flex-shrink-0"
        >
          {DIMENSIONS.map((dim, idx) => {
            const state = homeostasis[dim]
            const color = getBarColor(dim, state)
            const barHeight = getBarHeight(state)
            const x = idx * (barWidth + spacing)
            const y = height - barHeight

            return (
              <g key={dim}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill={color}
                  rx="1"
                  title={`${DIMENSION_LABELS[dim]}: ${state}`}
                />
              </g>
            )
          })}
        </svg>
        <span className="text-xs text-muted-foreground">
          {Object.values(homeostasis).filter(
            (s) => s === "HEALTHY",
          ).length}/7
        </span>
      </div>
    )
  },
)

DimensionSparklines.displayName = "DimensionSparklines"
```

---

### Component: `DimensionHistoryHeatmap.tsx`

```typescript
import { memo, useState } from "react"
import type { HomeostasisState } from "server/engine/types"

interface TickRecord {
  timestamp: string
  tick_id: string
  homeostasis: HomeostasisState
  // other fields...
}

const DIMENSIONS: Array<keyof HomeostasisState> = [
  "knowledge_sufficiency",
  "certainty_alignment",
  "progress_momentum",
  "communication_health",
  "productive_engagement",
  "knowledge_application",
  "self_preservation",
]

const DIMENSION_LABELS: Record<string, string> = {
  knowledge_sufficiency: "Knowledge Sufficiency",
  certainty_alignment: "Certainty Alignment",
  progress_momentum: "Progress Momentum",
  communication_health: "Communication Health",
  productive_engagement: "Productive Engagement",
  knowledge_application: "Knowledge Application",
  self_preservation: "Self-Preservation",
}

const DIMENSION_SHORT: Record<string, string> = {
  knowledge_sufficiency: "KS",
  certainty_alignment: "CA",
  progress_momentum: "PM",
  communication_health: "CH",
  productive_engagement: "PE",
  knowledge_application: "KA",
  self_preservation: "SP",
}

const STATE_COLORS: Record<string, string> = {
  HEALTHY: "#22c55e",
  LOW: "#eab308",
  HIGH: "#fbbf24",
  UNKNOWN: "#d1d5db",
}

function getCellColor(dim: string, state: string): string {
  if (dim === "self_preservation" && state === "LOW") {
    return "#ef4444" // Red alert for self-preservation LOW
  }
  return STATE_COLORS[state] ?? STATE_COLORS.UNKNOWN
}

interface DimensionHistoryHeatmapProps {
  ticks: TickRecord[]
  agentId: string
}

interface Tooltip {
  visible: boolean
  x: number
  y: number
  content: string
}

export const DimensionHistoryHeatmap = memo(
  ({ ticks, agentId }: DimensionHistoryHeatmapProps) => {
    const [hoveredCell, setHoveredCell] = useState<{
      tick: number
      dim: string
    } | null>(null)
    const [hoveredRow, setHoveredRow] = useState<number | null>(null)
    const [tooltip, setTooltip] = useState<Tooltip>({
      visible: false,
      x: 0,
      y: 0,
      content: "",
    })

    const cellSize = 24
    const headerHeight = 32
    const rowLabelWidth = 80
    const columnLabelHeight = 40

    // Take last 20 ticks (newest last)
    const displayTicks = ticks.slice(-20)

    const handleCellHover = (
      tickIdx: number,
      dimIdx: number,
      event: React.MouseEvent,
    ) => {
      const tick = displayTicks[tickIdx]
      const dim = DIMENSIONS[dimIdx]
      const state = tick.homeostasis[dim]
      const timestamp = new Date(tick.timestamp).toLocaleTimeString()

      setHoveredCell({ tick: tickIdx, dim })
      setTooltip({
        visible: true,
        x: event.clientX,
        y: event.clientY - 40,
        content: `${DIMENSION_LABELS[dim]}: ${state} @ ${timestamp}`,
      })
    }

    const handleCellLeave = () => {
      setHoveredCell(null)
      setTooltip({ ...tooltip, visible: false })
    }

    const totalWidth = DIMENSIONS.length * cellSize + rowLabelWidth + 20
    const totalHeight = displayTicks.length * cellSize + columnLabelHeight + 20

    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground mb-2">
          Dimension state history (last {displayTicks.length} ticks, newest → right)
        </div>

        <div className="overflow-x-auto border rounded-lg bg-card p-4">
          <svg
            width={totalWidth}
            height={totalHeight}
            className="min-w-max"
            onMouseLeave={handleCellLeave}
          >
            {/* Column headers (dimension labels) */}
            {DIMENSIONS.map((dim, idx) => (
              <g key={`header-${dim}`}>
                <text
                  x={rowLabelWidth + idx * cellSize + cellSize / 2}
                  y={20}
                  textAnchor="middle"
                  className="text-xs fill-muted-foreground"
                  dominantBaseline="middle"
                >
                  {DIMENSION_SHORT[dim]}
                </text>
              </g>
            ))}

            {/* Row labels (tick times) and cells */}
            {displayTicks.map((tick, tickIdx) => {
              const tickTime = new Date(tick.timestamp).toLocaleTimeString()
              const isHoveredRow = hoveredRow === tickIdx

              return (
                <g key={`row-${tick.tick_id}`}>
                  {/* Row label */}
                  <text
                    x={8}
                    y={columnLabelHeight + tickIdx * cellSize + cellSize / 2}
                    className="text-xs fill-muted-foreground cursor-pointer"
                    onMouseEnter={() => setHoveredRow(tickIdx)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    T{displayTicks.length - tickIdx}
                  </text>

                  {/* Dimension cells */}
                  {DIMENSIONS.map((dim, dimIdx) => {
                    const state = tick.homeostasis[dim]
                    const color = getCellColor(dim, state)
                    const x = rowLabelWidth + dimIdx * cellSize + 2
                    const y = columnLabelHeight + tickIdx * cellSize + 2
                    const size = cellSize - 4
                    const isHovered =
                      hoveredCell?.tick === tickIdx &&
                      hoveredCell?.dim === dim

                    return (
                      <g key={`cell-${tickIdx}-${dim}`}>
                        <rect
                          x={x}
                          y={y}
                          width={size}
                          height={size}
                          fill={color}
                          rx="2"
                          opacity={isHovered ? 1 : 0.8}
                          className="transition-opacity duration-75 cursor-pointer"
                          stroke={
                            isHovered || isHoveredRow ? "#000" : "none"
                          }
                          strokeWidth={isHovered ? 1.5 : 0}
                          onMouseEnter={(e) =>
                            handleCellHover(tickIdx, dimIdx, e)
                          }
                          onMouseLeave={handleCellLeave}
                        />
                      </g>
                    )
                  })}
                </g>
              )
            })}
          </svg>
        </div>

        {/* Tooltip */}
        {tooltip.visible && (
          <div
            className="fixed bg-popover border rounded px-2 py-1 text-xs shadow-lg pointer-events-none z-50"
            style={{
              left: `${tooltip.x}px`,
              top: `${tooltip.y}px`,
              transform: "translateX(-50%)",
            }}
          >
            {tooltip.content}
          </div>
        )}

        {/* Legend */}
        <div className="flex gap-4 text-xs pt-2 border-t">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: "#22c55e" }} />
            HEALTHY
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: "#eab308" }} />
            LOW / HIGH
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: "#ef4444" }} />
            Self-Preservation:LOW
          </div>
        </div>
      </div>
    )
  },
)

DimensionHistoryHeatmap.displayName = "DimensionHistoryHeatmap"
```

---

### Component: `TickDurationTrendLine.tsx`

```typescript
import { memo, useState } from "react"

interface TickRecord {
  timestamp: string
  tick_id: string
  durationMs: number
  // other fields...
}

interface TickDurationTrendLineProps {
  ticks: TickRecord[]
  agentId: string
}

interface Tooltip {
  visible: boolean
  x: number
  y: number
  content: string
}

const GRID_LINES = 5 // Number of horizontal reference lines

function getColor(theme: "light" | "dark"): string {
  return theme === "dark" ? "#93c5fd" : "#3b82f6" // blue-400 / blue-500
}

function getGridColor(theme: "light" | "dark"): string {
  return theme === "dark" ? "#374151" : "#e5e7eb" // gray-700 / gray-200
}

function getAxisColor(theme: "light" | "dark"): string {
  return theme === "dark" ? "#6b7280" : "#9ca3af" // gray-500 / gray-400
}

function getTextColor(theme: "light" | "dark"): string {
  return theme === "dark" ? "#d1d5db" : "#6b7280" // gray-300 / gray-500
}

export const TickDurationTrendLine = memo(
  ({ ticks, agentId }: TickDurationTrendLineProps) => {
    const [hoveredPoint, setHoveredPoint] = useState<number | null>(null)
    const [tooltip, setTooltip] = useState<Tooltip>({
      visible: false,
      x: 0,
      y: 0,
      content: "",
    })

    // Take last 20 ticks
    const displayTicks = ticks.slice(-20)

    if (displayTicks.length === 0) {
      return (
        <div className="text-xs text-muted-foreground p-4 text-center">
          No tick data available
        </div>
      )
    }

    // Get theme from document class
    const isDarkMode = document.documentElement.classList.contains("dark")
    const theme = isDarkMode ? "dark" : "light"

    const padding = 40
    const width = 520
    const height = 200
    const graphWidth = width - padding * 2
    const graphHeight = height - padding * 2

    // Find min and max duration
    const durations = displayTicks.map((t) => t.durationMs)
    const minDuration = Math.min(...durations)
    const maxDuration = Math.max(...durations)
    const durationRange = maxDuration - minDuration || 1

    // Scale function: map durationMs to pixel height
    const scaleY = (durationMs: number): number => {
      return height - padding - ((durationMs - minDuration) / durationRange) * graphHeight
    }

    // X-axis scale: map tick index to pixel position
    const scaleX = (idx: number): number => {
      return padding + (idx / (displayTicks.length - 1)) * graphWidth
    }

    // Build SVG path data for line chart
    const pathData = displayTicks
      .map((tick, idx) => {
        const x = scaleX(idx)
        const y = scaleY(tick.durationMs)
        return `${idx === 0 ? "M" : "L"} ${x} ${y}`
      })
      .join(" ")

    const handlePointHover = (idx: number, event: React.MouseEvent) => {
      const tick = displayTicks[idx]
      const timestamp = new Date(tick.timestamp).toLocaleTimeString()

      setHoveredPoint(idx)
      setTooltip({
        visible: true,
        x: event.clientX,
        y: event.clientY - 40,
        content: `Tick ${displayTicks.length - idx}: ${tick.durationMs}ms @ ${timestamp}`,
      })
    }

    const handlePointLeave = () => {
      setHoveredPoint(null)
      setTooltip({ ...tooltip, visible: false })
    }

    // Calculate Y-axis labels
    const yAxisLabels = Array.from({ length: GRID_LINES + 1 }, (_, i) => {
      return minDuration + (durationRange / GRID_LINES) * i
    })

    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground mb-2">
          Tick duration (last {displayTicks.length} ticks)
        </div>

        <div className="border rounded-lg bg-card p-4 overflow-x-auto">
          <svg
            width={width}
            height={height}
            className="min-w-max"
            onMouseLeave={handlePointLeave}
          >
            {/* Grid lines (horizontal) */}
            {yAxisLabels.map((_, idx) => {
              const y = padding + (idx / GRID_LINES) * graphHeight
              return (
                <g key={`gridline-${idx}`}>
                  <line
                    x1={padding}
                    y1={y}
                    x2={width - padding}
                    y2={y}
                    stroke={getGridColor(theme)}
                    strokeWidth={idx === 0 ? 1.5 : 0.5}
                    strokeDasharray={idx === 0 ? "0" : "3,3"}
                    opacity={idx === 0 ? 1 : 0.5}
                  />
                </g>
              )
            })}

            {/* Y-axis */}
            <line
              x1={padding}
              y1={padding}
              x2={padding}
              y2={height - padding}
              stroke={getAxisColor(theme)}
              strokeWidth={1.5}
            />

            {/* X-axis */}
            <line
              x1={padding}
              y1={height - padding}
              x2={width - padding}
              y2={height - padding}
              stroke={getAxisColor(theme)}
              strokeWidth={1.5}
            />

            {/* Y-axis labels */}
            {yAxisLabels.map((label, idx) => {
              const y = padding + (idx / GRID_LINES) * graphHeight
              return (
                <g key={`yaxis-${idx}`}>
                  <text
                    x={padding - 8}
                    y={y}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="text-xs fill-current"
                    fill={getTextColor(theme)}
                  >
                    {Math.round(label)}ms
                  </text>
                </g>
              )
            })}

            {/* X-axis labels (tick indices) */}
            {displayTicks.map((_, idx) => {
              // Show every 3rd or 4th label to avoid crowding
              if (idx % 4 !== 0 && idx !== displayTicks.length - 1) return null
              const x = scaleX(idx)
              return (
                <g key={`xaxis-${idx}`}>
                  <text
                    x={x}
                    y={height - padding + 14}
                    textAnchor="middle"
                    className="text-xs fill-current"
                    fill={getTextColor(theme)}
                  >
                    T{displayTicks.length - idx}
                  </text>
                </g>
              )
            })}

            {/* Line chart */}
            <path
              d={pathData}
              fill="none"
              stroke={getColor(theme)}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data points (circles on hover) */}
            {displayTicks.map((tick, idx) => {
              const x = scaleX(idx)
              const y = scaleY(tick.durationMs)
              const isHovered = hoveredPoint === idx

              return (
                <g key={`point-${idx}`}>
                  {/* Invisible larger circle for hover detection */}
                  <circle
                    cx={x}
                    cy={y}
                    r={6}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={(e) => handlePointHover(idx, e)}
                    onMouseLeave={handlePointLeave}
                  />

                  {/* Visible circle on hover */}
                  {isHovered && (
                    <>
                      <circle
                        cx={x}
                        cy={y}
                        r={4}
                        fill={getColor(theme)}
                        opacity={1}
                      />
                      {/* Vertical guide line */}
                      <line
                        x1={x}
                        y1={height - padding}
                        x2={x}
                        y2={y}
                        stroke={getColor(theme)}
                        strokeWidth={1}
                        strokeDasharray="2,2"
                        opacity={0.5}
                      />
                    </>
                  )}
                </g>
              )
            })}
          </svg>
        </div>

        {/* Tooltip */}
        {tooltip.visible && (
          <div
            className="fixed bg-popover border rounded px-2 py-1 text-xs shadow-lg pointer-events-none z-50"
            style={{
              left: `${tooltip.x}px`,
              top: `${tooltip.y}px`,
              transform: "translateX(-50%)",
            }}
          >
            {tooltip.content}
          </div>
        )}

        {/* Stats */}
        <div className="flex gap-4 text-xs pt-2 border-t">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Min:</span>
            <span className="font-mono">{Math.round(minDuration)}ms</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Max:</span>
            <span className="font-mono">{Math.round(maxDuration)}ms</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Avg:</span>
            <span className="font-mono">
              {Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)}
              ms
            </span>
          </div>
        </div>
      </div>
    )
  },
)

TickDurationTrendLine.displayName = "TickDurationTrendLine"
```

---

## Integration Points

### 1. Update `AgentCard.tsx`

```tsx
// Current imports
import { Link } from "@tanstack/react-router"
+ import { DimensionSparklines } from "./DimensionSparklines"
+ import type { HomeostasisState } from "../../server/engine/types"

interface AgentCardProps {
  id: string
  name: string
  role: string
  domain: string
  health: string
  lastTick: string | null
+ homeostasisSnapshot?: HomeostasisState
}

export function AgentCard({
  id,
  name,
  role,
  domain,
  health,
  lastTick,
+ homeostasisSnapshot,
}: AgentCardProps) {
  // ... existing code ...

  return (
    <Link to="/agent/fleet/$agentId" params={{ agentId: id }} className="...">
      <div className="...">
        {/* existing content */}
      </div>
+     {homeostasisSnapshot && (
+       <DimensionSparklines homeostasis={homeostasisSnapshot} compact />
+     )}
    </Link>
  )
}
```

### 2. Update `fleet/index.tsx` (Fleet Overview)

```tsx
// Pass homeostasis snapshot to AgentCard
const latestHomeostasis = agent.latestTick?.homeostasis

<AgentCard
  key={agent.id}
  {...agent}
+ homeostasisSnapshot={latestHomeostasis}
/>
```

### 3. Update `fleet/$agentId.tsx` (Agent Detail)

```tsx
+ import { DimensionHistoryHeatmap } from "../../../components/agent/DimensionHistoryHeatmap"
+ import { TickDurationTrendLine } from "../../../components/agent/TickDurationTrendLine"

export function AgentDetailPage() {
  const { agentId } = Route.useParams()
  const { data, isLoading, error } = useQuery([...])

  return (
    <div className="...">
      {/* existing sections */}

+     <section className="space-y-6">
+       <div>
+         <h2 className="text-lg font-semibold mb-4">
+           Tick Duration Trend (Last 20 Ticks)
+         </h2>
+         <TickDurationTrendLine
+           ticks={data?.recentTicks ?? []}
+           agentId={agentId}
+         />
+       </div>
+
+       <div>
+         <h2 className="text-lg font-semibold mb-2">
+           Dimension History (Last 20 Ticks)
+         </h2>
+         <DimensionHistoryHeatmap
+           ticks={data?.recentTicks ?? []}
+           agentId={agentId}
+         />
+       </div>
+     </section>
    </div>
  )
}
```

### 4. API Response Enhancement (optional)

The current API already returns `recentTicks` with homeostasis data. No changes needed. If optimizing, consider:

```typescript
// In fleet overview API
const latestTick = recentTicks[0]
return {
  agents: [
    {
      ...agentData,
+     latestTick: latestTick // or just homeostasisSnapshot
    }
  ]
}
```

---

## Visual Style & Accessibility

### Colors (Tailwind palette)

| State | Color | Hex | Tailwind |
|-------|-------|-----|----------|
| HEALTHY | Green | #22c55e | green-500 |
| LOW | Yellow | #eab308 | yellow-500 |
| HIGH | Amber | #fbbf24 | amber-400 |
| Self-Preservation:LOW | Red | #ef4444 | red-500 |
| Unknown/Missing | Gray | #d1d5db | gray-300 |

### Contrast & Accessibility

- **Min cell size:** 20px × 20px (Heatmap), 10px (Sparklines)
- **Hover states:** Subtle border highlight + tooltip
- **Color + shape:** Self-preservation:LOW is both red AND different (wider in some designs, or checkered pattern)
- **Tooltip:** Essential for heatmap cells; always on hover

### Dark Mode

All components use `document.documentElement.classList.contains("dark")` to detect theme and adjust colors dynamically:

**Dimension Sparklines & Heatmap** (no change needed — uses solid colors)

**Tick Duration Trend Line** (theme-aware):
```typescript
// Light Mode
--line-color: #3b82f6 (blue-500)
--grid-color: #e5e7eb (gray-200)
--axis-color: #9ca3af (gray-400)
--text-color: #6b7280 (gray-500)

// Dark Mode
--line-color: #93c5fd (blue-400)
--grid-color: #374151 (gray-700)
--axis-color: #6b7280 (gray-500)
--text-color: #d1d5db (gray-300)
```

All SVG text and axes use `className="text-xs fill-current"` to inherit theme colors from CSS.

---

## Performance Considerations

### Sparklines

- **Rendered inline** in `AgentCard` — no external library calls
- **SVG footprint:** ~0.5KB per card (tiny)
- **Re-render:** Only when `homeostasisSnapshot` changes (via memo)

### Heatmap

- **Grid size:** 20 rows × 7 cols = 140 cells
- **SVG rendering:** Fast; single <svg> element with <rect> children
- **Hover logic:** State-based (hoveredCell, hoveredRow); no DOM mutations
- **Optimization:** Use `useMemo` if ticks array is large

---

## Testing Strategy

### Unit Tests

1. **DimensionSparklines**
   - Renders all 7 dimensions
   - Colors correct per state
   - Compact mode reduces size

2. **DimensionHistoryHeatmap**
   - Renders last 20 ticks (or fewer if unavailable)
   - Cell colors match dimension states
   - Hover shows correct tooltip
   - Row/column highlighting works

3. **TickDurationTrendLine**
   - Renders with valid tick data
   - Shows min/max/avg duration stats
   - Hover reveals tooltip with timestamp
   - Vertical guide line appears on hover
   - Dark mode colors render correctly
   - Handles edge cases (single tick, very large/small durations)

### Integration Tests

1. **AgentCard with sparklines**
   - Sparklines appear when `homeostasisSnapshot` provided
   - No sparklines when undefined

2. **Agent detail page**
   - Heatmap loads with API data
   - Sorting correct (oldest → newest, left to right)

### Visual Regression

- Compare snapshots of sparklines grid (all state combinations)
- Compare heatmap with known tick sequences

---

## Future Enhancements

1. **Dimension Trends:** Click a dimension column → see that dimension's state over 100+ ticks
2. **Auto-zoom:** If heatmap > 30 ticks, expand vertically with scroll
3. **Incident Markers:** Flag ticks where self_preservation dropped to LOW
4. **Custom Time Range:** "Last 1 hour", "Last 24 hours" toggle
5. **Export:** PNG snapshot of heatmap for reports/alerts
6. **Real-time:** WebSocket updates to sparklines without full page refresh

---

## File Locations

```
app/
├── components/
│   └── agent/
│       ├── AgentCard.tsx                (updated)
│       ├── DimensionSparklines.tsx      (new)
│       ├── DimensionHistoryHeatmap.tsx  (new)
│       └── TickDurationTrendLine.tsx    (new)
└── routes/
    └── agent/
        └── fleet/
            ├── index.tsx                (updated)
            └── $agentId.tsx             (updated)

server/
└── engine/
    └── types.ts                         (no changes needed)
```

---

## Summary

| Feature | Sparklines | Heatmap | Trend Line |
|---------|-----------|---------|-----------|
| Location | Agent cards (fleet grid) | Agent detail page | Agent detail page |
| Data | 1 tick (latest) | 20 ticks | 20 ticks (durationMs) |
| Metric | Homeostasis dimensions | Homeostasis dimensions | Tick processing time |
| Dimensions | All 7 | All 7 | Single metric (durationMs) |
| Chart Type | Vertical bars | Grid cells | Line graph with grid |
| Cell Size | 10px wide, variable height | 20px × 20px | 520px × 200px (adjustable) |
| Interaction | None (visual only) | Hover for tooltip + row/col highlight | Hover for point detail + stats |
| Time span | Latest tick only | Last ~N × tickInterval duration | Last ~N × tickInterval duration |
| Dark Mode | Native colors | Native colors | Dynamic theme-aware colors |
| Use case | Quick scan of agent health | Understand dimension patterns over time | Detect performance trends/spikes |

