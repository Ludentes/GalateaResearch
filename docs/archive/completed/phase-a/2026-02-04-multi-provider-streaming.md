# Multi-Provider LLM System with Streaming

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Replace hardcoded Anthropic provider with configurable multi-provider system (Ollama, OpenRouter, Claude Code Agent SDK) with streaming responses and token usage reporting.

**Architecture:** Provider factory reads env vars, returns AI SDK `LanguageModel`. Streaming via `streamText()` + API route. Frontend consumes stream via fetch + ReadableStream. Token usage saved to DB and displayed in UI.

**Tech Stack:** AI SDK v6, `ai-sdk-ollama`, `@openrouter/ai-sdk-provider`, `ai-sdk-provider-claude-code` (or `@anthropic-ai/claude-agent-sdk` fallback), Nitro API routes

---

## Context

### Current State
- `server/functions/chat.logic.ts` — Provider-agnostic, accepts `LanguageModel`, uses non-streaming `generateText()`
- `server/functions/chat.ts` — Hardcoded to `@ai-sdk/anthropic`
- `app/routes/chat/$sessionId.tsx` — Non-streaming chat UI, calls server functions
- DB `messages` table has `tokenCount` column (single integer)
- Integration tests prove Ollama works with `chat.logic.ts`

### Reference Implementations
- **ContextForgeTS** (`/home/newub/w/ContextLibrary/ContextForgeTS/convex/claudeNode.ts`):
  - Uses `@anthropic-ai/claude-agent-sdk` `query()` directly
  - `includePartialMessages: true` for streaming, `maxTurns: 1`, `allowedTools: []`
  - Stream events: `type: "stream_event"` → `event.type: "content_block_delta"` → `delta.type: "text_delta"`
  - Result message: `usage.input_tokens`, `usage.output_tokens`, `total_cost_usd`
  - System prompt: passed via `options.systemPrompt`
  - Messages formatted as XML: `<system>...</system><user>...</user><assistant>...</assistant>`
  - `pathToClaudeCodeExecutable: getClaudeCodePath()` with fallback resolution
- **ContextForge Python** (`/home/newub/w/ContextLibrary/ContextForge/backend/`):
  - Uses Vercel AI SDK v5 SSE protocol: `text-start`, `text-delta`, `text-end`, `finish`
  - Frontend uses `@ai-sdk/react` `useChat()` hook
  - FastAPI `StreamingResponse` with SSE formatting
  - Claude Code via `ClaudeSDKClient` with stdin-based prompts
  - Token tracking per-block and per-session

### Target File Structure
```
server/
  providers/
    config.ts              — reads + validates env vars
    ollama.ts              — thin wrapper around ai-sdk-ollama
    openrouter.ts          — thin wrapper around @openrouter/ai-sdk-provider
    claude-code.ts         — wrapper (community package or custom Agent SDK)
    index.ts               — factory: getModel() → { model, modelName }
    __tests__/
      config.unit.test.ts
      factory.unit.test.ts
      claude-code.unit.test.ts
  functions/
    chat.logic.ts          — add streamMessageLogic() alongside existing sendMessageLogic()
    chat.ts                — rewire to use provider factory
  routes/
    api/
      chat.post.ts         — Nitro streaming endpoint (POST /api/chat)
```

### Env Vars (new)
```bash
LLM_PROVIDER=ollama                    # ollama | openrouter | claude-code
LLM_MODEL=llama3.2                     # provider-specific model name
OLLAMA_BASE_URL=http://localhost:11434  # optional, default shown
OPENROUTER_API_KEY=sk-or-...           # required when provider=openrouter
# ANTHROPIC_API_KEY already exists      # required when provider=claude-code
```

**Default:** Ollama with llama3.2 (free, local, no config needed)

### Design Decisions
1. **Streaming via `streamText()` from AI SDK v6.** All three providers support `doStream()` through their AI SDK wrappers. `streamText()` gives us streaming + token usage in one call.
2. **Nitro API route for streaming.** TanStack Start server functions serialize to JSON — not suitable for streaming. Use a Nitro event handler (`server/routes/api/chat.post.ts`) that returns `result.toTextStreamResponse()`. Fallback: if TanStack Start server functions support returning `Response` objects, use that instead.
3. **Custom fetch + ReadableStream on client** (not `useChat()`). Our messages are DB-driven (server manages history). `useChat()` manages its own state which conflicts. Simple fetch + stream reader gives us full control.
4. **Community `ai-sdk-provider-claude-code`** as primary Claude Code wrapper. If unavailable, implement custom `LanguageModelV3` wrapper using `@anthropic-ai/claude-agent-sdk` `query()` — see Appendix A for reference code based on ContextForgeTS patterns.
5. **Add `inputTokens` + `outputTokens` columns** to messages table. Keep existing `tokenCount` as total. All providers report usage through AI SDK's `streamText()` → `onFinish({ usage })`.

---

## Tasks

### Task 1: Install Dependencies

**Files:** `package.json`

```bash
cd /home/newub/w/galatea

# Move ai-sdk-ollama from devDeps to deps
pnpm remove ai-sdk-ollama && pnpm add ai-sdk-ollama

# Add provider packages
pnpm add @openrouter/ai-sdk-provider

# Try community Claude Code wrapper first
pnpm add ai-sdk-provider-claude-code

# If ai-sdk-provider-claude-code is not on npm, install Agent SDK directly instead:
# pnpm add @anthropic-ai/claude-agent-sdk

# Note: Do NOT remove @ai-sdk/anthropic yet (chat.ts still imports it until Task 5)
```

**Verify:** `pnpm exec tsc --noEmit`

**Commit:** `feat: add multi-provider LLM dependencies`

---

### Task 2: Provider Config + Factory + Wrappers (TDD)

**Files to create:**
- `server/providers/config.ts`
- `server/providers/ollama.ts`
- `server/providers/openrouter.ts`
- `server/providers/claude-code.ts`
- `server/providers/index.ts`
- `server/providers/__tests__/config.unit.test.ts`
- `server/providers/__tests__/factory.unit.test.ts`
- `server/providers/__tests__/claude-code.unit.test.ts`

#### Config (TDD)

**Test** (`server/providers/__tests__/config.unit.test.ts`):

```typescript
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

describe("LLM Provider Config", () => {
  const originalEnv = process.env

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  it("defaults to ollama with llama3.2", async () => {
    delete process.env.LLM_PROVIDER
    delete process.env.LLM_MODEL
    const { getLLMConfig } = await import("../config")
    const config = getLLMConfig()
    expect(config.provider).toBe("ollama")
    expect(config.model).toBe("llama3.2")
  })

  it("reads LLM_PROVIDER and LLM_MODEL from env", async () => {
    process.env.LLM_PROVIDER = "openrouter"
    process.env.LLM_MODEL = "anthropic/claude-sonnet-4"
    const { getLLMConfig } = await import("../config")
    const config = getLLMConfig()
    expect(config.provider).toBe("openrouter")
    expect(config.model).toBe("anthropic/claude-sonnet-4")
  })

  it("throws when LLM_PROVIDER is invalid", async () => {
    process.env.LLM_PROVIDER = "gpt4all"
    const { getLLMConfig } = await import("../config")
    expect(() => getLLMConfig()).toThrow("Unknown LLM_PROVIDER")
  })

  it("throws when openrouter missing API key", async () => {
    process.env.LLM_PROVIDER = "openrouter"
    delete process.env.OPENROUTER_API_KEY
    const { getLLMConfig } = await import("../config")
    expect(() => getLLMConfig()).toThrow("OPENROUTER_API_KEY")
  })

  it("throws when claude-code missing ANTHROPIC_API_KEY", async () => {
    process.env.LLM_PROVIDER = "claude-code"
    delete process.env.ANTHROPIC_API_KEY
    const { getLLMConfig } = await import("../config")
    expect(() => getLLMConfig()).toThrow("ANTHROPIC_API_KEY")
  })
})
```

**Implementation** (`server/providers/config.ts`):

```typescript
export type LLMProvider = "ollama" | "openrouter" | "claude-code"

const VALID_PROVIDERS: readonly string[] = ["ollama", "openrouter", "claude-code"]

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  ollama: "llama3.2",
  openrouter: "anthropic/claude-sonnet-4",
  "claude-code": "sonnet",
}

export interface LLMConfig {
  provider: LLMProvider
  model: string
  ollamaBaseUrl: string
  openrouterApiKey?: string
  anthropicApiKey?: string
}

export function getLLMConfig(): LLMConfig {
  const provider = process.env.LLM_PROVIDER || "ollama"
  if (!VALID_PROVIDERS.includes(provider)) {
    throw new Error(`Unknown LLM_PROVIDER: "${provider}". Valid: ${VALID_PROVIDERS.join(", ")}`)
  }
  const typed = provider as LLMProvider
  const model = process.env.LLM_MODEL || DEFAULT_MODELS[typed]
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434"
  const openrouterApiKey = process.env.OPENROUTER_API_KEY
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY

  if (typed === "openrouter" && !openrouterApiKey)
    throw new Error("OPENROUTER_API_KEY is required when LLM_PROVIDER=openrouter")
  if (typed === "claude-code" && !anthropicApiKey)
    throw new Error("ANTHROPIC_API_KEY is required when LLM_PROVIDER=claude-code")

  return { provider: typed, model, ollamaBaseUrl, openrouterApiKey, anthropicApiKey }
}
```

#### Provider Wrappers

**Ollama** (`server/providers/ollama.ts`):
```typescript
import type { LanguageModel } from "ai"
import { ollama } from "ai-sdk-ollama"

export function createOllamaModel(modelId: string, _baseUrl: string): LanguageModel {
  return ollama(modelId) as LanguageModel
}
```
> Check if `ai-sdk-ollama` exports `createOllama({ baseURL })`. If so, use it to honor `OLLAMA_BASE_URL`. Otherwise, `ai-sdk-ollama` reads from env automatically.

**OpenRouter** (`server/providers/openrouter.ts`):
```typescript
import type { LanguageModel } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"

export function createOpenRouterModel(modelId: string, apiKey: string): LanguageModel {
  const provider = createOpenRouter({ apiKey })
  return provider(modelId) as LanguageModel
}
```

**Claude Code** (`server/providers/claude-code.ts`):
```typescript
// Primary: community package
import type { LanguageModel } from "ai"
import { claudeCode } from "ai-sdk-provider-claude-code"

export function createClaudeCodeModel(modelId: string): LanguageModel {
  return claudeCode(modelId) as LanguageModel
}
```
> **If `ai-sdk-provider-claude-code` is not on npm or fails**, use the custom wrapper in Appendix A instead, which directly uses `@anthropic-ai/claude-agent-sdk` `query()` with streaming support.

**Claude Code test** (`server/providers/__tests__/claude-code.unit.test.ts`):
```typescript
// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("ai-sdk-provider-claude-code", () => ({
  claudeCode: vi.fn().mockReturnValue({
    specificationVersion: "v3",
    provider: "claude-code",
    modelId: "sonnet",
    doGenerate: vi.fn(),
    doStream: vi.fn(),
  }),
}))

describe("Claude Code Provider", () => {
  it("creates a model", async () => {
    const { createClaudeCodeModel } = await import("../claude-code")
    const model = createClaudeCodeModel("sonnet")
    expect(model).toBeDefined()
  })
})
```

#### Factory (TDD)

**Test** (`server/providers/__tests__/factory.unit.test.ts`):
```typescript
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../ollama", () => ({
  createOllamaModel: vi.fn().mockReturnValue({ provider: "mock-ollama" }),
}))
vi.mock("../openrouter", () => ({
  createOpenRouterModel: vi.fn().mockReturnValue({ provider: "mock-openrouter" }),
}))
vi.mock("../claude-code", () => ({
  createClaudeCodeModel: vi.fn().mockReturnValue({ provider: "mock-claude-code" }),
}))

describe("getModel factory", () => {
  const originalEnv = process.env

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  it("returns ollama model by default", async () => {
    delete process.env.LLM_PROVIDER
    const { getModel } = await import("../index")
    const { model, modelName } = getModel()
    expect(modelName).toBe("llama3.2")
    expect(model).toBeDefined()
  })

  it("returns openrouter when configured", async () => {
    process.env.LLM_PROVIDER = "openrouter"
    process.env.LLM_MODEL = "anthropic/claude-sonnet-4"
    process.env.OPENROUTER_API_KEY = "sk-or-test"
    const { getModel } = await import("../index")
    const { modelName } = getModel()
    expect(modelName).toBe("anthropic/claude-sonnet-4")
  })

  it("returns claude-code when configured", async () => {
    process.env.LLM_PROVIDER = "claude-code"
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    const { getModel } = await import("../index")
    const { modelName } = getModel()
    expect(modelName).toBe("sonnet")
  })
})
```

**Implementation** (`server/providers/index.ts`):
```typescript
import type { LanguageModel } from "ai"
import { createClaudeCodeModel } from "./claude-code"
import { getLLMConfig } from "./config"
import { createOllamaModel } from "./ollama"
import { createOpenRouterModel } from "./openrouter"

export function getModel(): { model: LanguageModel; modelName: string } {
  const config = getLLMConfig()
  switch (config.provider) {
    case "ollama":
      return { model: createOllamaModel(config.model, config.ollamaBaseUrl), modelName: config.model }
    case "openrouter":
      return { model: createOpenRouterModel(config.model, config.openrouterApiKey!), modelName: config.model }
    case "claude-code":
      return { model: createClaudeCodeModel(config.model), modelName: config.model }
  }
}
```

**Run all provider tests:**
```bash
pnpm vitest run server/providers/
```

**Commit:** `feat: add multi-provider system with config, factory, and wrappers`

---

### Task 3: Schema Migration — Add Token Columns

**Files:**
- Modify: `server/db/schema.ts`

Add `inputTokens` and `outputTokens` columns to the `messages` table:

```typescript
// In messages table definition, add alongside existing tokenCount:
inputTokens: integer("input_tokens"),
outputTokens: integer("output_tokens"),
```

Keep existing `tokenCount` column (backward compatible). New columns are nullable.

**Push schema:**
```bash
pnpm db:push
```

**Verify in DBeaver:** messages table now has `input_tokens` and `output_tokens` columns.

**Commit:** `feat: add input/output token columns to messages table`

---

### Task 4: Streaming Chat Logic + API Route

**Files:**
- Modify: `server/functions/chat.logic.ts` — add `streamMessageLogic()`
- Create: `server/routes/api/chat.post.ts` — Nitro streaming endpoint
- Create: `server/functions/__tests__/chat-stream.unit.test.ts`

#### Streaming Logic

Add to `server/functions/chat.logic.ts` (keep existing `sendMessageLogic` intact):

```typescript
import { streamText } from "ai"  // Add to existing imports

/**
 * Stream a message response in a chat session.
 *
 * Stores user message, builds context, calls streamText().
 * The onFinish callback saves the assistant response + token usage to DB.
 * Returns the StreamTextResult for the API route to consume.
 */
export async function streamMessageLogic(
  sessionId: string,
  message: string,
  model: LanguageModel,
  modelName: string,
) {
  // Store user message
  await db.insert(messages).values({
    sessionId,
    role: "user",
    content: message,
  })

  // Get conversation history
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt))

  // Get active preprompts
  const activePrompts = await db
    .select()
    .from(preprompts)
    .where(eq(preprompts.active, true))
    .orderBy(asc(preprompts.priority))

  const systemPrompt = activePrompts.map((p) => p.content).join("\n\n")

  // Stream response
  const result = streamText({
    model,
    system: systemPrompt,
    messages: history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    onFinish: async ({ text, usage }) => {
      await db.insert(messages).values({
        sessionId,
        role: "assistant",
        content: text,
        model: modelName,
        tokenCount: usage.totalTokens,
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
      })
    },
  })

  return result
}
```

#### Streaming API Route

Create `server/routes/api/chat.post.ts`:

```typescript
import { defineEventHandler, readBody } from "h3"
import { getModel } from "../../providers"
import { streamMessageLogic } from "../../functions/chat.logic"

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { sessionId, message } = body as { sessionId: string; message: string }

  if (!sessionId || !message) {
    throw createError({ statusCode: 400, message: "sessionId and message required" })
  }

  const { model, modelName } = getModel()
  const result = await streamMessageLogic(sessionId, message, model, modelName)

  // Return as plain text stream
  return result.toTextStreamResponse()
})
```

> **If Nitro event handlers at `server/routes/` don't work** with TanStack Start, try:
> 1. Move to `app/routes/api/chat.ts` using TanStack Start file-based API routes
> 2. Or use a server function returning `new Response(result.textStream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })`
> 3. Verify which approach TanStack Start v1.158 supports

#### Unit Test

```typescript
// server/functions/__tests__/chat-stream.unit.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

// Mock AI SDK streamText
vi.mock("ai", async () => {
  const actual = await vi.importActual("ai")
  return {
    ...actual,
    streamText: vi.fn().mockReturnValue({
      textStream: (async function* () {
        yield "Hello "
        yield "from "
        yield "stream"
      })(),
      text: Promise.resolve("Hello from stream"),
      usage: Promise.resolve({ promptTokens: 10, completionTokens: 5, totalTokens: 15 }),
      toTextStreamResponse: vi.fn().mockReturnValue(new Response("Hello from stream")),
    }),
    generateText: vi.fn().mockResolvedValue({
      text: "Mocked AI response",
      usage: { totalTokens: 42 },
    }),
  }
})

describe("streamMessageLogic", () => {
  // Similar setup to existing chat.unit.test.ts (DB connection, cleanup)
  // Test that:
  // 1. User message is saved to DB
  // 2. streamText is called with correct params
  // 3. Return value has textStream and toTextStreamResponse
})
```

**Run tests:**
```bash
pnpm vitest run server/functions/__tests__/
```

**Commit:** `feat: add streaming chat logic and API route`

---

### Task 5: Rewire chat.ts + .env.example + Remove @ai-sdk/anthropic

**Files:**
- Modify: `server/functions/chat.ts`
- Modify: `.env.example`
- Modify: `package.json` (remove @ai-sdk/anthropic)

**Update `server/functions/chat.ts`:**

```typescript
import { createServerFn } from "@tanstack/react-start"
import { getModel } from "../providers"
import {
  createSessionLogic,
  getSessionMessagesLogic,
  sendMessageLogic,
} from "./chat.logic"

// Non-streaming fallback (kept for backward compatibility / simple calls)
export const sendMessage = createServerFn({ method: "POST" })
  .inputValidator((input: { sessionId: string; message: string }) => input)
  .handler(async ({ data }) => {
    const { model, modelName } = getModel()
    return sendMessageLogic(data.sessionId, data.message, model, modelName)
  })

export const createSession = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string }) => input)
  .handler(async ({ data }) => {
    return createSessionLogic(data.name)
  })

export const getSessionMessages = createServerFn({ method: "GET" })
  .inputValidator((input: { sessionId: string }) => input)
  .handler(async ({ data }) => {
    return getSessionMessagesLogic(data.sessionId)
  })
```

**Remove @ai-sdk/anthropic:**
```bash
pnpm remove @ai-sdk/anthropic
```

**Update `.env.example`** — replace the `# LLM` section:
```bash
# LLM Provider (ollama | openrouter | claude-code)
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2
OLLAMA_BASE_URL=http://localhost:11434
# OPENROUTER_API_KEY=sk-or-...
# ANTHROPIC_API_KEY=sk-ant-...
```

**Verify:**
```bash
pnpm exec tsc --noEmit
pnpm vitest run
```

**Commit:** `feat: rewire chat.ts to provider factory, remove @ai-sdk/anthropic`

---

### Task 6: Streaming Chat UI + Token Display

**Files:**
- Modify: `app/routes/chat/$sessionId.tsx`
- Modify: `app/components/chat/MessageList.tsx` (add token display)

**Update ChatPage to use streaming:**

```typescript
// app/routes/chat/$sessionId.tsx
// Key changes:
// 1. handleSend uses fetch() to POST to /api/chat streaming endpoint
// 2. Read stream with ReadableStream reader
// 3. Update UI as chunks arrive
// 4. After stream completes, refresh messages from DB (includes token counts)

const handleSend = async (content: string) => {
  // Optimistic: show user message immediately
  const userMsg = {
    id: crypto.randomUUID(),
    role: "user" as const,
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
      body: JSON.stringify({ sessionId, message: content }),
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

    // Stream done — refresh messages from DB (includes token counts)
    const updated = await getSessionMessages({ data: { sessionId } })
    setMessages(/* map updated rows */)
    setStreamingText("")
  } catch (error) {
    console.error("Chat error:", error)
  } finally {
    setLoading(false)
  }
}
```

**Add streaming message display** — while streaming, show a temporary assistant message with the accumulating text and a pulsing indicator.

**Add token display to MessageList** — after each assistant message, show token usage if available:

```typescript
// In MessageList, for assistant messages:
{msg.role === "assistant" && (msg.inputTokens || msg.outputTokens) && (
  <span className="text-xs text-muted-foreground">
    {msg.inputTokens && `↑${msg.inputTokens}`}
    {msg.outputTokens && ` ↓${msg.outputTokens}`}
    {msg.tokenCount && ` (${msg.tokenCount} total)`}
  </span>
)}
```

> **Note:** The message type needs updating to include `inputTokens`, `outputTokens`, `tokenCount`, and `model` fields from the DB schema.

**Commit:** `feat: streaming chat UI with token usage display`

---

### Task 7: Full Verification

**Run full suite:**
```bash
pnpm exec biome check --write .
pnpm exec tsc --noEmit
pnpm vitest run
```

**Manual test with Ollama:**
1. Ensure Ollama is running locally with `llama3.2` model
2. Set `LLM_PROVIDER=ollama` in `.env.local` (or leave unset — defaults to Ollama)
3. Start dev server: `pnpm dev`
4. Open http://localhost:13000
5. Create new chat, send a message
6. **Verify streaming:** Text should appear incrementally (not all at once)
7. **Verify token display:** After response completes, token counts should appear
8. Send a second message — verify conversation history works

**Commit:** `chore: format and verify streaming multi-provider system`

---

## Summary

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Modify | Add providers, move ollama, remove @ai-sdk/anthropic |
| `server/providers/config.ts` | Create | Env var reading + validation |
| `server/providers/ollama.ts` | Create | Ollama wrapper |
| `server/providers/openrouter.ts` | Create | OpenRouter wrapper |
| `server/providers/claude-code.ts` | Create | Claude Code wrapper |
| `server/providers/index.ts` | Create | Factory: `getModel()` |
| `server/providers/__tests__/*.ts` | Create | Config (5), factory (3), claude-code (1) tests |
| `server/db/schema.ts` | Modify | Add `inputTokens`, `outputTokens` columns |
| `server/functions/chat.logic.ts` | Modify | Add `streamMessageLogic()` |
| `server/functions/chat.ts` | Modify | Replace Anthropic with `getModel()` |
| `server/routes/api/chat.post.ts` | Create | Streaming API endpoint |
| `server/functions/__tests__/chat-stream.unit.test.ts` | Create | Stream logic tests |
| `app/routes/chat/$sessionId.tsx` | Modify | Streaming UI + fetch reader |
| `app/components/chat/MessageList.tsx` | Modify | Token usage display |
| `.env.example` | Modify | Multi-provider env vars |

---

## Appendix A: Custom Claude Code Agent SDK Wrapper (Fallback)

If `ai-sdk-provider-claude-code` is not available on npm or doesn't work, implement a custom `LanguageModelV3` wrapper based on the ContextForgeTS reference at `/home/newub/w/ContextLibrary/ContextForgeTS/convex/claudeNode.ts`:

```typescript
// server/providers/claude-code.ts (fallback — custom Agent SDK wrapper)
import type { LanguageModel } from "ai"
import { query as claudeQuery } from "@anthropic-ai/claude-agent-sdk"
import { execSync } from "child_process"
import * as fs from "fs"
import * as os from "os"

/** Locate Claude Code CLI executable (mirrors ContextForgeTS pattern) */
function getClaudeCodePath(): string | undefined {
  if (process.env.CLAUDE_CODE_PATH) return process.env.CLAUDE_CODE_PATH
  try {
    const result = execSync("which claude", { encoding: "utf8", timeout: 3000 })
    const path = result.trim()
    if (path && fs.existsSync(path)) return path
  } catch { /* not found */ }
  const home = os.homedir()
  for (const p of [`${home}/.local/bin/claude`, "/usr/local/bin/claude", "/usr/bin/claude"]) {
    try { if (fs.existsSync(p)) return p } catch { /* skip */ }
  }
  return undefined
}

/** Format messages as XML prompt (mirrors ContextForgeTS formatMessagesAsPrompt) */
function formatPrompt(
  prompt: Array<{ role: string; content: string | Array<{ type: string; text?: string }> }>,
): { systemPrompt: string; userPrompt: string } {
  let systemPrompt = ""
  const parts: string[] = []
  for (const msg of prompt) {
    const text = typeof msg.content === "string"
      ? msg.content
      : msg.content.filter((c) => c.type === "text").map((c) => c.text).join("\n")
    if (msg.role === "system") {
      systemPrompt = text
    } else if (msg.role === "user") {
      parts.push(`<user>\n${text}\n</user>`)
    } else if (msg.role === "assistant") {
      parts.push(`<assistant>\n${text}\n</assistant>`)
    }
  }
  return { systemPrompt, userPrompt: parts.join("\n\n") }
}

export function createClaudeCodeModel(modelId: string): LanguageModel {
  return {
    specificationVersion: "v3",
    provider: "claude-code",
    modelId,

    async doGenerate(options) {
      const { systemPrompt, userPrompt } = formatPrompt(options.prompt)
      let responseText = ""
      let inputTokens: number | undefined
      let outputTokens: number | undefined

      for await (const message of claudeQuery({
        prompt: userPrompt,
        options: {
          model: modelId as "opus" | "sonnet" | "haiku",
          maxTurns: 1,
          allowedTools: [],
          systemPrompt,
          pathToClaudeCodeExecutable: getClaudeCodePath(),
        },
      })) {
        const msgType = (message as Record<string, unknown>).type as string
        if (msgType === "assistant") {
          const msg = message as Record<string, unknown>
          const msgContent = msg.message as Record<string, unknown> | undefined
          const content = msgContent?.content as Array<Record<string, unknown>> | undefined
          if (content) {
            for (const block of content) {
              if (block.type === "text" && typeof block.text === "string")
                responseText += block.text
            }
          }
        }
        if (msgType === "result") {
          const msg = message as Record<string, unknown>
          const usage = msg.usage as Record<string, unknown> | undefined
          if (usage) {
            inputTokens = usage.input_tokens as number | undefined
            outputTokens = usage.output_tokens as number | undefined
          }
        }
      }

      return {
        text: responseText,
        finishReason: "stop" as const,
        usage: { inputTokens, outputTokens },
        rawCall: { rawPrompt: userPrompt, rawSettings: {} },
      }
    },

    async doStream(options) {
      const { systemPrompt, userPrompt } = formatPrompt(options.prompt)
      let inputTokens: number | undefined
      let outputTokens: number | undefined

      // Create a TransformStream to bridge async generator → ReadableStream
      const { readable, writable } = new TransformStream()
      const writer = writable.getWriter()
      const encoder = new TextEncoder()

      // Process in background
      ;(async () => {
        try {
          for await (const message of claudeQuery({
            prompt: userPrompt,
            options: {
              model: modelId as "opus" | "sonnet" | "haiku",
              maxTurns: 1,
              allowedTools: [],
              systemPrompt,
              pathToClaudeCodeExecutable: getClaudeCodePath(),
              includePartialMessages: true,
            },
          })) {
            const msgType = (message as Record<string, unknown>).type as string

            // Handle streaming deltas (ContextForgeTS pattern)
            if (msgType === "stream_event") {
              const event = (message as Record<string, unknown>).event as Record<string, unknown> | undefined
              if (event && event.type === "content_block_delta") {
                const delta = event.delta as Record<string, unknown> | undefined
                if (delta && delta.type === "text_delta" && typeof delta.text === "string") {
                  await writer.write(encoder.encode(
                    JSON.stringify({ type: "text-delta", textDelta: delta.text }) + "\n"
                  ))
                }
              }
            }

            // Capture usage from result
            if (msgType === "result") {
              const msg = message as Record<string, unknown>
              const usage = msg.usage as Record<string, unknown> | undefined
              if (usage) {
                inputTokens = usage.input_tokens as number | undefined
                outputTokens = usage.output_tokens as number | undefined
              }
            }
          }

          // Send finish event with usage
          await writer.write(encoder.encode(
            JSON.stringify({
              type: "finish",
              finishReason: "stop",
              usage: { inputTokens, outputTokens },
            }) + "\n"
          ))
        } catch (err) {
          await writer.write(encoder.encode(
            JSON.stringify({ type: "error", error: String(err) }) + "\n"
          ))
        } finally {
          await writer.close()
        }
      })()

      return {
        stream: readable,
        rawCall: { rawPrompt: userPrompt, rawSettings: {} },
      }
    },
  } as LanguageModel
}
```

> **Note:** The `doStream()` return type requires careful alignment with the `LanguageModelV3` spec. The exact structure of stream parts (`text-delta`, `finish`, etc.) must match what `streamText()` expects. Verify against the AI SDK source or use the community provider as reference. If `doStream()` proves too complex, implement only `doGenerate()` and throw from `doStream()` — streaming will fall back to non-streaming mode.

Install Agent SDK if using this fallback:
```bash
pnpm add @anthropic-ai/claude-agent-sdk
```
