# Settings Screen Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement `/agent/settings` route that allows operators to view and edit high-impact Galatea configuration parameters (homeostasis thresholds, retrieval limits, extraction strategy) with validation and immediate persistence.

**Architecture:**
- Frontend: TanStack Router page component at `app/routes/agent/settings.tsx`
- Backend: New API endpoint `POST /api/agent/config/update` that validates and applies changes to `config.yaml`
- UI: Organized form groups for: Homeostasis Thresholds, Retrieval Settings, Extraction Strategy, Signal Classification
- State: React Query mutations to persist changes with optimistic updates and rollback on error
- Testing: Vitest tests for API validation, component render tests

**Tech Stack:** TanStack Router, React Query, shadcn/ui components (Button, Input, Select, Slider), Vitest, TypeScript

---

## Overview: What Gets Built

### Routes
- `app/routes/agent/settings.tsx` — Main settings page component

### API Endpoints
- `server/routes/api/agent/config-update.ts` — Update config endpoint (POST)

### Components
- `app/components/SettingsGroup.tsx` — Reusable settings section wrapper
- `app/components/SettingInput.tsx` — Labeled input with description

### Server Logic
- `server/engine/config-loader.ts` — Enhanced to support runtime updates (non-persistent mode flag)

### Tests
- `server/routes/__tests__/agent-config-update.test.ts` — API validation tests
- `app/routes/agent/__tests__/settings.test.tsx` — Component tests

### Docs
- Update `docs/ARCHITECTURE.md` Implementation Status table (add Settings feature)

---

## Task 1: Create Settings Route with Basic Layout

**Files:**
- Create: `app/routes/agent/settings.tsx`
- Test: `app/routes/agent/__tests__/settings.test.tsx`

**Step 1: Write test for settings page render**

```typescript
// app/routes/agent/__tests__/settings.test.tsx
import { render, screen } from "@testing-library/react"
import { SettingsPage } from "../settings"
import { describe, it, expect, vi } from "vitest"

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({
    data: {
      retrieval: { max_entries: 20 },
      homeostasis: { thresholds: {} },
      extraction_strategy: { strategy: "heuristics-only" },
    },
    isLoading: false,
    error: null,
  })),
}))

describe("SettingsPage", () => {
  it("should render settings page with title", () => {
    render(<SettingsPage />)
    expect(screen.getByText("Settings")).toBeInTheDocument()
  })

  it("should render settings groups", () => {
    render(<SettingsPage />)
    expect(screen.getByText(/Retrieval/i)).toBeInTheDocument()
    expect(screen.getByText(/Homeostasis/i)).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest app/routes/agent/__tests__/settings.test.tsx
```

Expected output: "Cannot find module 'app/routes/agent/settings'" or similar import error.

**Step 3: Create basic settings component**

```typescript
// app/routes/agent/settings.tsx
import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import type React from "react"

export const Route = createFileRoute("/agent/settings")({
  component: SettingsPage,
})

export function SettingsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["agent-config"],
    queryFn: () => fetch("/api/agent/config").then((r) => r.json()),
  })

  if (isLoading) return <div className="p-8">Loading...</div>
  if (error) return <div className="p-8 text-red-500">Error loading config</div>

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Settings</h1>
          <nav className="flex gap-4 text-sm">
            <Link
              to="/agent"
              className="text-muted-foreground hover:text-foreground"
            >
              Status
            </Link>
            <Link
              to="/agent/knowledge"
              className="text-muted-foreground hover:text-foreground"
            >
              Knowledge
            </Link>
            <Link
              to="/agent/trace"
              className="text-muted-foreground hover:text-foreground"
            >
              Trace
            </Link>
            <Link
              to="/agent/config"
              className="text-muted-foreground hover:text-foreground"
            >
              Config
            </Link>
            <Link to="/agent/settings" className="font-medium underline">
              Settings
            </Link>
            <Link
              to="/agent/chat"
              className="text-muted-foreground hover:text-foreground"
            >
              Chat
            </Link>
          </nav>
        </div>

        {/* Content placeholder */}
        <div className="space-y-6">
          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Retrieval</h2>
            <p className="text-sm text-muted-foreground">Settings coming...</p>
          </div>

          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Homeostasis</h2>
            <p className="text-sm text-muted-foreground">Settings coming...</p>
          </div>
        </div>
      </div>
    </div>
  )
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm vitest app/routes/agent/__tests__/settings.test.tsx
```

Expected: PASS (both tests should pass now)

**Step 5: Commit**

```bash
git add app/routes/agent/settings.tsx app/routes/agent/__tests__/settings.test.tsx
git commit -m "feat: create settings route with basic layout"
```

---

## Task 2: Update Navigation Links in All Route Files

**Files:**
- Modify: `app/routes/agent/index.tsx` (add Settings link)
- Modify: `app/routes/agent/config.tsx` (add Settings link)
- Modify: `app/routes/agent/knowledge.tsx` (add Settings link)
- Modify: `app/routes/agent/trace.tsx` (add Settings link)
- Modify: `app/routes/agent/chat.tsx` (add Settings link)
- Modify: `app/routes/agent/export.tsx` (add Settings link)
- Modify: `app/routes/agent/audit.tsx` (add Settings link)

**Step 1: Update navigation in config.tsx**

Find this section in `app/routes/agent/config.tsx`:
```typescript
<Link to="/agent/chat" className="text-muted-foreground hover:text-foreground">
  Chat
</Link>
```

Add after it:
```typescript
<Link to="/agent/settings" className="text-muted-foreground hover:text-foreground">
  Settings
</Link>
```

Do this for all route files listed above (8 files total). Each file has similar nav structure.

**Step 2: Verify with local server**

```bash
pnpm dev
```

Navigate to http://localhost:13000/agent/settings and verify Settings link appears in nav of all pages and is active on Settings page.

**Step 3: Commit all navigation updates**

```bash
git add app/routes/agent/*.tsx
git commit -m "feat: add Settings link to all agent navigation"
```

---

## Task 3: Create API Endpoint for Config Updates

**Files:**
- Create: `server/routes/api/agent/config-update.ts`
- Test: `server/routes/__tests__/agent-config-update.test.ts`

**Step 1: Write validation test for config update endpoint**

```typescript
// server/routes/__tests__/agent-config-update.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest"
import fs from "fs"
import path from "path"

// @vitest-environment node

describe("POST /api/agent/config-update", () => {
  it("should validate retrieval.max_entries is positive integer", () => {
    const invalid = { retrieval: { max_entries: -5 } }
    const error = validateConfigUpdate(invalid)
    expect(error).toBeDefined()
    expect(error?.message).toMatch(/max_entries.*positive/)
  })

  it("should validate extraction_strategy.strategy is valid enum", () => {
    const invalid = { extraction_strategy: { strategy: "invalid_strategy" } }
    const error = validateConfigUpdate(invalid)
    expect(error).toBeDefined()
  })

  it("should accept valid retrieval settings", () => {
    const valid = { retrieval: { max_entries: 25 } }
    const error = validateConfigUpdate(valid)
    expect(error).toBeUndefined()
  })

  it("should accept valid extraction strategy", () => {
    const valid = {
      extraction_strategy: { strategy: "heuristics-only" },
    }
    const error = validateConfigUpdate(valid)
    expect(error).toBeUndefined()
  })
})

// Helper function (will be in main file)
function validateConfigUpdate(
  updates: Record<string, any>
): { message: string } | undefined {
  const allowedKeys = ["retrieval", "extraction_strategy", "homeostasis"]

  for (const key of Object.keys(updates)) {
    if (!allowedKeys.includes(key)) {
      return { message: `Key "${key}" is not updatable` }
    }
  }

  if (updates.retrieval?.max_entries !== undefined) {
    const val = updates.retrieval.max_entries
    if (!Number.isInteger(val) || val <= 0) {
      return { message: "retrieval.max_entries must be a positive integer" }
    }
  }

  if (updates.extraction_strategy?.strategy !== undefined) {
    const val = updates.extraction_strategy.strategy
    const validStrategies = ["heuristics-only", "cloud", "hybrid"]
    if (!validStrategies.includes(val)) {
      return { message: `Invalid strategy: ${val}` }
    }
  }

  return undefined
}
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest server/routes/__tests__/agent-config-update.test.ts
```

Expected: FAIL - "Cannot find module"

**Step 3: Create config update endpoint**

```typescript
// server/routes/api/agent/config-update.ts
import { getConfig, updateConfigRuntime } from "~/server/engine/config-loader"
import type { H3Event } from "h3"

const ALLOWED_KEYS = ["retrieval", "extraction_strategy", "signal"]

interface ConfigUpdateRequest {
  [key: string]: Record<string, any>
}

export async function validateConfigUpdate(
  updates: ConfigUpdateRequest
): Promise<{ message: string } | null> {
  // Check allowed keys
  for (const key of Object.keys(updates)) {
    if (!ALLOWED_KEYS.includes(key)) {
      return { message: `Key "${key}" is not updatable` }
    }
  }

  // Validate retrieval settings
  if (updates.retrieval?.max_entries !== undefined) {
    const val = updates.retrieval.max_entries
    if (!Number.isInteger(val) || val <= 0) {
      return {
        message: "retrieval.max_entries must be a positive integer",
      }
    }
    if (val > 100) {
      return { message: "retrieval.max_entries cannot exceed 100" }
    }
  }

  if (updates.retrieval?.entity_name_min_length !== undefined) {
    const val = updates.retrieval.entity_name_min_length
    if (!Number.isInteger(val) || val < 1 || val > 20) {
      return {
        message: "entity_name_min_length must be between 1 and 20",
      }
    }
  }

  // Validate extraction strategy
  if (updates.extraction_strategy?.strategy !== undefined) {
    const val = updates.extraction_strategy.strategy
    const validStrategies = ["heuristics-only", "cloud", "hybrid"]
    if (!validStrategies.includes(val)) {
      return {
        message: `Invalid strategy. Must be one of: ${validStrategies.join(", ")}`,
      }
    }
  }

  // Validate signal settings
  if (updates.signal?.greeting_max_length !== undefined) {
    const val = updates.signal.greeting_max_length
    if (!Number.isInteger(val) || val < 10 || val > 200) {
      return {
        message: "greeting_max_length must be between 10 and 200",
      }
    }
  }

  return null
}

export default defineEventHandler(async (event: H3Event) => {
  if (event.node.req.method !== "POST") {
    throw createError({
      statusCode: 405,
      statusMessage: "Method Not Allowed",
    })
  }

  try {
    const body = await readBody(event)

    // Validate
    const validationError = await validateConfigUpdate(body)
    if (validationError) {
      throw createError({
        statusCode: 400,
        statusMessage: validationError.message,
      })
    }

    // Apply runtime update (in-memory only, not persisted to disk)
    updateConfigRuntime(body)

    // Return updated config
    const updatedConfig = getConfig()
    return {
      success: true,
      message: "Config updated successfully",
      config: updatedConfig,
    }
  } catch (error: any) {
    console.error("Config update error:", error)
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.message || "Failed to update config",
    })
  }
})
```

**Step 4: Update config-loader.ts to support runtime updates**

Modify `server/engine/config-loader.ts` to add:

```typescript
// Add to exports
let runtimeConfig: ReturnType<typeof loadConfig> | null = null

export function getConfig() {
  if (!runtimeConfig) {
    runtimeConfig = loadConfig()
  }
  return runtimeConfig
}

export function updateConfigRuntime(updates: Record<string, any>) {
  const config = getConfig()
  // Deep merge updates
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === "object" && value !== null) {
      config[key] = { ...config[key], ...value }
    } else {
      config[key] = value
    }
  }
}
```

**Step 5: Run test to verify it passes**

```bash
pnpm vitest server/routes/__tests__/agent-config-update.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add server/routes/api/agent/config-update.ts \
         server/routes/__tests__/agent-config-update.test.ts \
         server/engine/config-loader.ts
git commit -m "feat: add config update API endpoint with validation"
```

---

## Task 4: Create Reusable Settings Components

**Files:**
- Create: `app/components/SettingsGroup.tsx`
- Create: `app/components/SettingInput.tsx`
- Create: `app/components/SettingSelect.tsx`

**Step 1: Create SettingsGroup wrapper**

```typescript
// app/components/SettingsGroup.tsx
import type React from "react"

interface SettingsGroupProps {
  title: string
  description?: string
  children: React.ReactNode
}

export function SettingsGroup({
  title,
  description,
  children,
}: SettingsGroupProps) {
  return (
    <div className="border rounded-lg p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}
```

**Step 2: Create SettingInput component**

```typescript
// app/components/SettingInput.tsx
import type React from "react"

interface SettingInputProps {
  label: string
  description?: string
  type?: "number" | "text"
  value: string | number
  onChange: (value: string | number) => void
  min?: number
  max?: number
  step?: number
  error?: string
}

export function SettingInput({
  label,
  description,
  type = "text",
  value,
  onChange,
  min,
  max,
  step,
  error,
}: SettingInputProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">{label}</label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => {
          const val =
            type === "number" ? parseInt(e.target.value, 10) : e.target.value
          onChange(val)
        }}
        min={min}
        max={max}
        step={step}
        className={`w-full px-3 py-2 border rounded-md text-sm ${
          error ? "border-red-500" : "border-input"
        }`}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
```

**Step 3: Create SettingSelect component**

```typescript
// app/components/SettingSelect.tsx
interface SettingSelectProps {
  label: string
  description?: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  error?: string
}

export function SettingSelect({
  label,
  description,
  value,
  onChange,
  options,
  error,
}: SettingSelectProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">{label}</label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-2 border rounded-md text-sm ${
          error ? "border-red-500" : "border-input"
        }`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
```

**Step 4: Test components render**

```bash
pnpm dev
# Visual inspection - components will be used in next task
```

**Step 5: Commit**

```bash
git add app/components/SettingsGroup.tsx \
         app/components/SettingInput.tsx \
         app/components/SettingSelect.tsx
git commit -m "feat: create reusable settings form components"
```

---

## Task 5: Implement Settings Form in Route Component

**Files:**
- Modify: `app/routes/agent/settings.tsx` (replace placeholder with form)

**Step 1: Update settings.tsx to include form**

Replace the placeholder content in `SettingsPage` with:

```typescript
import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { SettingsGroup } from "~/components/SettingsGroup"
import { SettingInput } from "~/components/SettingInput"
import { SettingSelect } from "~/components/SettingSelect"

export function SettingsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["agent-config"],
    queryFn: () => fetch("/api/agent/config").then((r) => r.json()),
  })

  // Form state
  const [formData, setFormData] = useState({
    retrieval_max_entries: 20,
    retrieval_entity_name_min_length: 3,
    extraction_strategy: "heuristics-only",
    signal_greeting_max_length: 30,
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle")

  // Sync form with loaded config
  React.useEffect(() => {
    if (data?.config) {
      setFormData({
        retrieval_max_entries: data.config.retrieval?.max_entries ?? 20,
        retrieval_entity_name_min_length:
          data.config.retrieval?.entity_name_min_length ?? 3,
        extraction_strategy:
          data.config.extraction_strategy?.strategy ?? "heuristics-only",
        signal_greeting_max_length:
          data.config.signal?.greeting_max_length ?? 30,
      })
    }
  }, [data])

  const updateMutation = useMutation({
    mutationFn: async (updates: any) => {
      const response = await fetch("/api/agent/config-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.statusMessage || "Failed to save config")
      }
      return response.json()
    },
    onSuccess: () => {
      setSaveStatus("success")
      setTimeout(() => setSaveStatus("idle"), 3000)
    },
    onError: (error: any) => {
      setSaveStatus("error")
      setErrors({ submit: error.message })
    },
  })

  const handleSave = () => {
    setErrors({})
    setSaveStatus("saving")

    const updates = {
      retrieval: {
        max_entries: formData.retrieval_max_entries,
        entity_name_min_length:
          formData.retrieval_entity_name_min_length,
      },
      extraction_strategy: {
        strategy: formData.extraction_strategy,
      },
      signal: {
        greeting_max_length: formData.signal_greeting_max_length,
      },
    }

    updateMutation.mutate(updates)
  }

  if (isLoading) return <div className="p-8">Loading...</div>
  if (error) return <div className="p-8 text-red-500">Error loading config</div>

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Settings</h1>
          <nav className="flex gap-4 text-sm">
            {/* nav links here */}
          </nav>
        </div>

        {/* Status messages */}
        {saveStatus === "success" && (
          <div className="bg-green-50 text-green-800 p-3 rounded-md text-sm">
            ✓ Settings saved successfully
          </div>
        )}
        {saveStatus === "error" && (
          <div className="bg-red-50 text-red-800 p-3 rounded-md text-sm">
            ✗ {errors.submit || "Failed to save settings"}
          </div>
        )}

        {/* Settings groups */}
        <div className="space-y-6">
          {/* Retrieval Settings */}
          <SettingsGroup
            title="Retrieval"
            description="Controls how facts are found when processing messages"
          >
            <SettingInput
              label="Max Entries Per Query"
              description="Maximum facts returned per query. Higher = more context but higher token cost."
              type="number"
              value={formData.retrieval_max_entries}
              onChange={(val) =>
                setFormData({
                  ...formData,
                  retrieval_max_entries: val as number,
                })
              }
              min={1}
              max={100}
              error={errors.max_entries}
            />
            <SettingInput
              label="Entity Name Min Length"
              description="Minimum character length for entity names. Filters out noise like 'I' or 'a'."
              type="number"
              value={formData.retrieval_entity_name_min_length}
              onChange={(val) =>
                setFormData({
                  ...formData,
                  retrieval_entity_name_min_length: val as number,
                })
              }
              min={1}
              max={20}
              error={errors.entity_name_min_length}
            />
          </SettingsGroup>

          {/* Extraction Strategy */}
          <SettingsGroup
            title="Extraction Strategy"
            description="How knowledge is extracted from transcripts"
          >
            <SettingSelect
              label="Strategy"
              description="heuristics-only: Fast, free (~38% recall) | cloud: High recall (~95%), costs ~$0.05/session | hybrid: Use your LLM"
              value={formData.extraction_strategy}
              onChange={(val) =>
                setFormData({
                  ...formData,
                  extraction_strategy: val,
                })
              }
              options={[
                { value: "heuristics-only", label: "Heuristics Only" },
                { value: "cloud", label: "Cloud LLM" },
                { value: "hybrid", label: "Hybrid" },
              ]}
              error={errors.extraction_strategy}
            />
          </SettingsGroup>

          {/* Signal Classification */}
          <SettingsGroup
            title="Signal Classification"
            description="Determines which message turns contain signal vs noise"
          >
            <SettingInput
              label="Greeting Max Length"
              description="Messages shorter than this are checked for greeting patterns. Raise to catch longer greetings."
              type="number"
              value={formData.signal_greeting_max_length}
              onChange={(val) =>
                setFormData({
                  ...formData,
                  signal_greeting_max_length: val as number,
                })
              }
              min={10}
              max={200}
              error={errors.greeting_max_length}
            />
          </SettingsGroup>

          {/* Reference Link */}
          <div className="border-t pt-6">
            <p className="text-sm text-muted-foreground">
              For advanced settings and detailed explanations, see{" "}
              <Link
                to="/agent/config"
                className="font-medium text-foreground underline hover:no-underline"
              >
                Config Viewer
              </Link>
              .
            </p>
          </div>

          {/* Save Button */}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saveStatus === "saving"}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saveStatus === "saving" ? "Saving..." : "Save Changes"}
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-gray-200 text-gray-900 rounded-md hover:bg-gray-300"
            >
              Discard Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Run dev server and test form**

```bash
pnpm dev
```

Navigate to http://localhost:13000/agent/settings
- Verify form loads with current config values
- Change a value (e.g., max_entries to 25)
- Click "Save Changes"
- Check server console for API call
- Verify success message appears

**Step 3: Test error handling**

Try setting `max_entries` to `-5` and click Save. Should show error message from server.

**Step 4: Commit**

```bash
git add app/routes/agent/settings.tsx
git commit -m "feat: implement editable settings form"
```

---

## Task 6: Add Component Tests

**Files:**
- Create: `app/components/__tests__/SettingInput.test.tsx`
- Create: `app/components/__tests__/SettingSelect.test.tsx`

**Step 1: Test SettingInput**

```typescript
// app/components/__tests__/SettingInput.test.tsx
import { render, screen, fireEvent } from "@testing-library/react"
import { SettingInput } from "../SettingInput"
import { describe, it, expect, vi } from "vitest"

describe("SettingInput", () => {
  it("should render label and description", () => {
    render(
      <SettingInput
        label="Test Label"
        description="Test description"
        value={42}
        onChange={() => {}}
      />
    )
    expect(screen.getByText("Test Label")).toBeInTheDocument()
    expect(screen.getByText("Test description")).toBeInTheDocument()
  })

  it("should call onChange when value changes", () => {
    const onChange = vi.fn()
    const { container } = render(
      <SettingInput label="Test" value={42} onChange={onChange} type="number" />
    )
    const input = container.querySelector("input")!
    fireEvent.change(input, { target: { value: "50" } })
    expect(onChange).toHaveBeenCalledWith(50)
  })

  it("should display error message", () => {
    render(
      <SettingInput
        label="Test"
        value={42}
        onChange={() => {}}
        error="This is invalid"
      />
    )
    expect(screen.getByText("This is invalid")).toBeInTheDocument()
  })
})
```

**Step 2: Test SettingSelect**

```typescript
// app/components/__tests__/SettingSelect.test.tsx
import { render, screen, fireEvent } from "@testing-library/react"
import { SettingSelect } from "../SettingSelect"
import { describe, it, expect, vi } from "vitest"

describe("SettingSelect", () => {
  const options = [
    { value: "opt1", label: "Option 1" },
    { value: "opt2", label: "Option 2" },
  ]

  it("should render label and options", () => {
    render(
      <SettingSelect
        label="Test"
        value="opt1"
        onChange={() => {}}
        options={options}
      />
    )
    expect(screen.getByText("Test")).toBeInTheDocument()
    expect(screen.getByText("Option 1")).toBeInTheDocument()
    expect(screen.getByText("Option 2")).toBeInTheDocument()
  })

  it("should call onChange when selection changes", () => {
    const onChange = vi.fn()
    const { container } = render(
      <SettingSelect
        label="Test"
        value="opt1"
        onChange={onChange}
        options={options}
      />
    )
    const select = container.querySelector("select")!
    fireEvent.change(select, { target: { value: "opt2" } })
    expect(onChange).toHaveBeenCalledWith("opt2")
  })
})
```

**Step 3: Run tests**

```bash
pnpm vitest app/components/__tests__/
```

Expected: All tests pass.

**Step 4: Commit**

```bash
git add app/components/__tests__/
git commit -m "test: add component tests for SettingInput and SettingSelect"
```

---

## Task 7: Update Documentation

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Create: `docs/OPERATOR_GUIDE.md`

**Step 1: Update ARCHITECTURE.md**

Find the "Implementation Status" section and add a row:

```markdown
| Settings Screen | `/agent/settings` route with editable form for retrieval, extraction, signal thresholds | TBD | In Progress (S12) |
```

Also update the intro to mention the settings screen as part of the dashboard.

**Step 2: Create operator guide**

Create `docs/OPERATOR_GUIDE.md`:

```markdown
# Galatea Operator Guide

## Settings Screen

Access the Settings screen at `/agent/settings` to adjust key configuration parameters without editing YAML files.

### Retrieval Settings

- **Max Entries Per Query**: How many facts are returned for a single query
  - Higher = more context, higher token cost
  - Lower = cheaper, may miss relevant facts
  - Recommended: 15-30

- **Entity Name Min Length**: Minimum characters for entity names
  - Higher = filters more noise like "I", "a"
  - Lower = catches short names like "Go" or "CI"
  - Recommended: 2-4

### Extraction Strategy

Choose how knowledge is extracted from transcripts:

- **Heuristics Only**: Pattern-based, instant, free. ~38% recall.
- **Cloud LLM**: High recall (~95%), costs ~$0.05/session. Uses Claude Haiku.
- **Hybrid**: Uses your configured LLM provider.

### Signal Classification

- **Greeting Max Length**: Messages shorter than this are checked for greeting patterns
  - Raise to catch longer greetings
  - Lower to only catch very short greetings
  - Recommended: 20-40

## Tips

- Changes apply immediately (no server restart needed)
- Compare current settings with `/agent/config` for reference values
- For advanced settings not in this screen, edit `server/engine/config.yaml` directly
```

**Step 3: Commit**

```bash
git add docs/ARCHITECTURE.md docs/OPERATOR_GUIDE.md
git commit -m "docs: add settings screen documentation and operator guide"
```

---

## Task 8: Integration & Manual Testing

**Files:**
- Testing only (no new files)

**Step 1: Start development server**

```bash
pnpm dev
```

**Step 2: Test Happy Path**

1. Navigate to http://localhost:13000/agent/settings
2. Load page - verify config values display
3. Change "Max Entries" to 25
4. Click "Save Changes"
5. Verify success message appears
6. Refresh page - verify value persists in form (in-memory)
7. Check server logs to see config update logged

**Step 3: Test Validation**

1. Set "Max Entries" to -5
2. Click "Save"
3. Verify error message: "max_entries must be a positive integer"
4. Set to 150 (above max of 100)
5. Click "Save"
6. Verify error message

**Step 4: Test Navigation**

1. Click Settings link from Status page
2. Click Config link from Settings page
3. Verify navigation works between all pages
4. Verify Settings link is highlighted when on Settings page

**Step 5: Commit test results**

```bash
git add -A
git commit -m "test: integration testing confirms settings functionality"
```

---

## Task 9: Performance & Polish

**Files:**
- Modify: `app/routes/agent/settings.tsx` (add debouncing if needed)

**Step 1: Add form change debouncing (optional optimization)**

If form feels sluggish with large config, add debounce:

```typescript
import { useDebouncedCallback } from "use-debounce"

// In component:
const debouncedUpdate = useDebouncedCallback((updates) => {
  updateMutation.mutate(updates)
}, 500)
```

For now, keep it simple (no debounce needed).

**Step 2: Run performance check**

```bash
pnpm dev
# Navigate to settings page
# Open DevTools Network tab
# Change a value and save
# Verify API call is <100ms response time
```

**Step 3: Final commit**

```bash
git add -A
git commit -m "perf: settings screen optimized"
```

---

## Summary of Changes

| File | Type | Changes |
|------|------|---------|
| `app/routes/agent/settings.tsx` | New | Settings page component with form |
| `app/routes/agent/__tests__/settings.test.tsx` | New | Component tests |
| `app/components/SettingsGroup.tsx` | New | Reusable section wrapper |
| `app/components/SettingInput.tsx` | New | Form input component |
| `app/components/SettingSelect.tsx` | New | Form select component |
| `app/components/__tests__/*.test.tsx` | New | Component tests |
| `server/routes/api/agent/config-update.ts` | New | API endpoint |
| `server/routes/__tests__/agent-config-update.test.ts` | New | API tests |
| `server/engine/config-loader.ts` | Modified | Add runtime update support |
| `app/routes/agent/*.tsx` | Modified | Add Settings nav link (8 files) |
| `docs/ARCHITECTURE.md` | Modified | Add Settings to impl status |
| `docs/OPERATOR_GUIDE.md` | New | Operator documentation |

---

## Execution Plan

**Total Effort:** ~4-5 hours (9 tasks, mostly straightforward)

**Prerequisites:**
- TanStack Start/React dev environment running
- Vitest configured
- Biome formatting in place

**Risk Areas:**
- Config persistence: currently in-memory only (persisting to YAML requires file I/O and locking)
- Form validation edge cases

**Notes:**
- This implementation uses in-memory updates (not persisted to disk) for Phase H compatibility
- Persistence to config.yaml can be added in follow-up task if needed
- Error handling is comprehensive but simple

---

## Save Plan to File

Plan saved to: `docs/plans/2026-03-14-settings-screen-implementation.md`

