# Phase 1: Foundation — Progress Tracker

**Plan:** [2026-02-04-phase1-foundation.md](./2026-02-04-phase1-foundation.md)
**Started:** 2026-02-04
**Branch:** main

---

## Scope Notes

**Auth (Better Auth):** Was in the original architecture but was **never installed or implemented**. Deferred indefinitely — single-user local dev doesn't need authentication. The `BETTER_AUTH_SECRET` env var was removed from `.env.example`. Revisit only if multi-user or remote access becomes a requirement.

---

## Tasks

| # | Task | Status | Commit | Notes |
|---|------|--------|--------|-------|
| 1 | Scaffold TanStack Start Project | DONE | `15dadf8` | Verified: dev server works, page renders. Port changed to 13000. Path alias `~/*` → fix to `@/*` in Task 2. |
| 2 | Biome + TypeScript Strict Config | DONE | `8c7d9ea` | Biome 2.3.14, path alias `@/*`, strict TS settings. Code formatted to double quotes/no semicolons. |
| 3 | Tailwind CSS + shadcn/ui + UI Components | DONE | `2d62c5d` | All 6 UI components copied, Tailwind theme working, type errors fixed. |
| 4 | Vitest + Playwright Test Config | DONE | `23415e3` | Vitest 4.0, Playwright 1.58, 2/2 Button tests pass. |
| 5 | Docker Compose Infrastructure | DONE | `578242e` | Ports remapped to 15432/16379/11883/19001 (avoid Langfuse/Umka). All healthy. |
| 6 | Drizzle ORM Setup + Schema | DONE | `ce7aefd` | 4 tables pushed, verified in DBeaver. DB name is `postgres` (default), galatea tables inside. |
| 7 | Database + FalkorDB Integration Tests | DONE | `35fa36b` | 8/8 tests pass. FalkorDB Browser on 13001. |
| 8 | Seed Data | DONE | `1e53177` | 2 personas, 2 preprompts. Idempotent seed. |
| 9 | Chat Server Function + AI SDK | DONE | `791ad64` | Refactored to chat.logic.ts + thin wrapper. 3 unit + 1 integration test (Ollama). 12/12 pass. |
| 10 | Chat UI | DONE | `f5ba919` | Basic streaming chat with message history. Later extended with provider switcher, token display (see Bonus). |
| 11 | End-to-End Foundation Verification | DONE | `360d899` | All 3 providers (ollama, openrouter, claude-code) verified streaming. 27/27 tests, 0 TS errors, 0 lint issues. |
| B1 | Multi-Provider System | DONE | `de1a0a1` | 3 providers (ollama, openrouter, claude-code) with config, factory, wrappers. TDD with 4 unit tests. |
| B2 | Streaming API Route | DONE | `4a4a8e8` | Nitro `POST /api/chat` with `streamText()` + `toTextStreamResponse()`. Token tracking (input/output). |
| B3 | Streaming Chat UI | DONE | `b095ff9` | Client-side `ReadableStream` reader, streaming cursor, token display per message. |
| B4 | Provider Switcher UI | DONE | `23d7067` | Runtime provider/model switching via dropdowns in chat header. No server restart needed. |
| B5 | Langfuse Observability | DONE | `6fb90ac` | OTel-based tracing via Nitro plugin. Auto-enables when `LANGFUSE_SECRET_KEY` + `LANGFUSE_PUBLIC_KEY` set. |
| B6 | Nitro serverDir Fix | DONE | `42c27fc` | Added `serverDir: "server"` to Nitro vite plugin — required for route discovery in `server/routes/`. |
| B7 | Nitro Plugin Export Fix | DONE | `360d899` | Nitro plugins must `export default () => {}`, not run top-level code. |

## Verification Log

### Task 1: Scaffold TanStack Start Project
- **Commit:** `15dadf8`
- **Human verified:** YES — dev server opens, white bg, blue Home link
- **Post-verification fix:** Port 3000 → 13000 (Langfuse occupies 3000)
- **Issues deferred:** Path alias `~/*` → `@/*` (Task 2)

### Task 9: Chat Server Function + AI SDK
- **Commit:** `791ad64`
- **Human verified:** YES — 12/12 tests pass in VS Code test explorer
- **Notes:** Extracted logic into chat.logic.ts for testability. Used ai-sdk-ollama for integration tests. Added VS Code Vitest settings.

### Task 8: Seed Data
- **Commit:** `1e53177`
- **Human verified:** YES — 2 personas, 2 preprompts in DBeaver
- **Notes:** Added select-before-insert for personas (no unique constraint on name)

### Task 7: Database + FalkorDB Integration Tests
- **Commits:** `28db299`, `35fa36b` (FalkorDB Browser port)
- **Human verified:** YES — 8/8 tests, FalkorDB Browser works (user: `default`, no password)

### Task 6: Drizzle ORM Setup + Schema
- **Commit:** `ce7aefd`
- **Human verified:** YES — 4 tables confirmed in DBeaver
- **Notes:** DBeaver needs DB set to `postgres` (default), galatea tables are in public schema

### Task 5: Docker Compose Infrastructure
- **Commit:** `578242e`
- **Human verified:** YES — all 3 containers healthy
- **Notes:** Ports remapped (15432, 16379, 11883, 19001) to avoid Langfuse/Umka conflicts

### Task 4: Vitest + Playwright Test Config
- **Commit:** `23415e3`
- **Human verified:** YES — 2/2 tests green

### Task 3: Tailwind CSS + shadcn/ui + UI Components
- **Commits:** Task 3 commit + `2d62c5d` (type fixes)
- **Human verified:** YES — centered page, styled button, theme colors working
- **Notes:** Fixed client.tsx/ssr.tsx to match TanStack Start v1.158 API (StartClient takes no props, createStartHandler uses defaultStreamHandler)

### Task 2: Biome + TypeScript Strict Config
- **Commit:** `8c7d9ea`
- **Human verified:** YES — noted pre-existing type errors in client.tsx/__root.tsx (TanStack Start v1.158 types), will resolve with routing work
- **Biome schema note:** Migrated to v2.3.14 schema (plan had v2.0.0)

### Task 10: Chat UI
- **Commit:** `f5ba919`
- **Human verified:** YES — basic chat with message history, session creation from index page
- **Notes:** Initial version used TanStack Start server functions for `sendMessage`. Later replaced with Nitro streaming route.

### Task 11: End-to-End Foundation Verification
- **Commit:** `360d899` (final commit after all fixes)
- **Human verified:** YES — all 3 providers streaming, 27/27 tests, 0 TS errors, 0 lint issues
- **Notes:** Verified ollama (local), openrouter (z-ai/glm-4.5-air:free), claude-code (sonnet) all stream correctly through the UI.

### Bonus: Multi-Provider Streaming System
- **Commits:** `de1a0a1` → `f10029d` → `4a4a8e8` → `a6ddac3` → `b095ff9` → `42c27fc` → `23d7067` → `6fb90ac` → `360d899`
- **Human verified:** YES — "All 3 providers work."
- **Notes:** Extended well beyond original plan. Added:
  - Multi-provider factory with runtime switching (ollama, openrouter, claude-code)
  - Nitro API route for streaming (`POST /api/chat`)
  - Client-side `ReadableStream` consumption (not `useChat()`)
  - Token tracking (input/output/total) per message
  - Provider/model selector dropdowns in chat header
  - Langfuse OTel observability (auto-enables with env vars)

### Key Lessons Learned
- **Nitro `serverDir`:** Must set `serverDir: "server"` in `nitro()` vite plugin config — without it, `scanDirs` is empty and routes in `server/routes/` won't be discovered.
- **Nitro plugins:** Must `export default () => {}`, not run top-level code.
- **h3 v2:** `createError` is deprecated → use `new HTTPError(message, { status })`.
- **AI SDK v6:** Usage fields are `inputTokens`/`outputTokens` (not `promptTokens`/`completionTokens`).
- **`streamText()` is NOT async:** Do not `await` it. Returns synchronously.
- **TanStack Start server functions serialize to JSON:** Not suitable for streaming — use Nitro API routes instead.

---

*Updated: 2026-02-04*
