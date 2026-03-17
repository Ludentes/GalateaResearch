# HomeostasisSparkline Component

A minimal, dark-mode compatible visualization of homeostasis state across 7 dimensions using pure TailwindCSS.

## Overview

Renders 7 tiny horizontal bars representing each dimension of agent homeostasis:
- **Green** (HEALTHY): Balanced, no intervention needed
- **Yellow** (HIGH): Over-indexed, may need rebalancing
- **Red** (LOW): Needs attention, triggers guidance

## Features

- **7 Dimensions**: Knowledge Sufficiency, Certainty Alignment, Progress Momentum, Communication Health, Productive Engagement, Knowledge Application, Self-Preservation
- **Dark Mode**: Built-in dark mode support via Tailwind dark: utilities
- **Pure CSS**: No charting libraries, SVG, or external dependencies
- **Compact Mode**: Optional smaller sizing for tight layouts
- **Configurable Labels**: Show/hide dimension labels
- **Health Summary**: Displays count of healthy dimensions (e.g., "5/7 healthy")

## Basic Usage

```tsx
import { HomeostasisSparkline } from "@/components/agent/HomeostasisSparkline"
import type { HomeostasisState } from "server/engine/types"

export function AgentDashboard({ homeostasis }: { homeostasis: HomeostasisState }) {
  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold mb-3">Agent Health</h3>
      <HomeostasisSparkline homeostasis={homeostasis} />
    </div>
  )
}
```

## Props

```typescript
interface HomeostasisSparklineProps {
  homeostasis: HomeostasisState
  compact?: boolean      // Default: false. Smaller bars and font
  showLabels?: boolean   // Default: true. Show dimension abbreviations
}
```

## Examples

### Full Size with Labels (Default)

```tsx
<HomeostasisSparkline
  homeostasis={homeostasis}
/>
```

Output:
```
KS ▰▰▰▰▰▰▰▰▰▰ (HEALTHY)
CA ▰▰▰▰▰ (LOW)
PM ▰▰▰▰▰▰▰▰▰▰ (HEALTHY)
CH ▰▰▰▰▰▰▰ (HIGH)
PE ▰▰▰▰▰▰▰▰▰▰ (HEALTHY)
KA ▰▰▰▰▰▰▰▰▰▰ (HEALTHY)
SP ▰▰▰▰▰▰▰▰▰▰ (HEALTHY)

5/7 healthy
```

### Compact Mode (Smaller)

```tsx
<HomeostasisSparkline
  homeostasis={homeostasis}
  compact
/>
```

Renders with:
- Smaller bar height (h-1 vs h-1.5)
- Smaller font (text-[9px] vs text-xs)
- Tighter spacing

### Without Labels

```tsx
<HomeostasisSparkline
  homeostasis={homeostasis}
  showLabels={false}
/>
```

Renders bars without dimension abbreviations, useful for ultra-compact layouts.

## Styling

All colors use TailwindCSS classes with dark mode support:

| State | Color | Light | Dark |
|-------|-------|-------|------|
| HEALTHY | Green | bg-green-500 | dark:bg-green-600 |
| HIGH | Yellow | bg-yellow-500 | dark:bg-yellow-600 |
| LOW | Red | bg-red-500 | dark:bg-red-600 |

Labels and summary text use gray colors that adapt to dark mode:
- `text-gray-700 dark:text-gray-300` for labels
- `text-gray-600 dark:text-gray-400` for summary text

## Integration with AgentCard

```tsx
import { AgentCard } from "@/components/agent/AgentCard"
import { HomeostasisSparkline } from "@/components/agent/HomeostasisSparkline"

export function AgentListItem({
  agent,
  latestHomeostasis,
}: {
  agent: Agent
  latestHomeostasis: HomeostasisState
}) {
  return (
    <div className="border rounded p-4">
      <h3 className="font-semibold">{agent.name}</h3>
      <p className="text-sm text-muted-foreground">{agent.role}</p>
      <div className="mt-3">
        <HomeostasisSparkline
          homeostasis={latestHomeostasis}
          compact
        />
      </div>
    </div>
  )
}
```

## Tooltip Behavior

Hover over any bar to see the dimension name and state:

```
Title: "KS: HEALTHY"
```

## Accessibility

- **Semantic HTML**: Uses standard `<div>` elements with proper structure
- **Keyboard Navigation**: Titles available via focus for screen readers
- **Color Contrast**: WCAG AA compliant for all color combinations
- **Minimal Layout**: Reduces cognitive load with visual hierarchy

## Testing

The component includes comprehensive tests covering:

- Rendering all 7 dimensions
- Correct health count calculation
- Tooltip functionality
- Compact and normal modes
- Label visibility toggle
- All dimension states (HEALTHY, LOW, HIGH)

Run tests:

```bash
pnpm test app/components/agent/__tests__/HomeostasisSparkline.test.tsx
```

## Performance

- **Size**: ~2KB minified component + tests
- **Render**: Pure CSS, no computations on render (memoizable)
- **Updates**: Only re-renders when `homeostasis` prop changes
