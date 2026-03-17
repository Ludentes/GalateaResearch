# Screenshot / Image Support in Agent Messaging Pipeline

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow PMs to send screenshots (from Discord) that agents can see and act on — e.g. "this hero section is too dark, lighten it."

**Architecture:** Extend `ChannelMessage.content` from `string` to `string | ContentBlock[]`. Images flow as base64 content blocks through the pipeline, unpacked only when building the LLM prompt. Everything else uses a `getTextContent()` helper.

**Tech Stack:** Anthropic SDK `MessageParam` format, Claude Code Agent SDK `SDKUserMessage`, base64-encoded images.

---

## Type Changes

### `server/agent/types.ts`

```typescript
export interface TextBlock {
  type: "text"
  text: string
}

export interface ImageBlock {
  type: "image"
  source: {
    type: "base64"
    media_type: "image/png" | "image/jpeg" | "image/webp" | "image/gif"
    data: string
  }
}

export type ContentBlock = TextBlock | ImageBlock
export type MessageContent = string | ContentBlock[]

// ChannelMessage.content changes from string to MessageContent

export function getTextContent(content: MessageContent): string {
  if (typeof content === "string") return content
  return content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
}
```

## Inject API

`server/routes/api/agent/inject.post.ts` — Accept `content` as `string | ContentBlock[]`. Validate image blocks have `source.type`, `media_type`, and `data` fields.

## Pipeline — What sees images vs text

| Component | Sees images? | Uses |
|-----------|:---:|-----|
| Inject API | Yes | Accepts and stores them |
| Tick routing | No | `getTextContent()` |
| Fact retrieval | No | `getTextContent()` |
| Homeostasis assessment | No | `getTextContent()` |
| Claude Code respond (chat) | **Yes** | Raw `msg.content` → Anthropic format |
| Work arc (delegate) | **Yes** | Raw `msg.content` → adapter |
| Operational history | No | `getTextContent()` — images are transient |
| Dispatcher (outbound) | No | Text only |

~20 call sites switch from `msg.content` to `getTextContent(msg.content)`.

## LLM Prompt Building

### Chat path: `claude-code-respond.ts`

`runClaudeCodeRespond()` changes `userMessage: string` → `userMessage: MessageContent`.

When content is `ContentBlock[]`, convert to `SDKUserMessage` with Anthropic content blocks:
```typescript
{
  role: "user",
  content: [
    { type: "text", text: "Fix the hero section:" },
    { type: "image", source: { type: "base64", media_type: "image/png", data: "..." } }
  ]
}
```

Pass via `query({ prompt: asyncIterable<SDKUserMessage> })` instead of `query({ prompt: string })`.

### Delegate path: `tick.ts` work arc

Extend `executeWorkArc()` task description from `string` to `MessageContent`. The adapter converts to the appropriate format when calling the SDK.

## Scenario

L225 dogfood scenario: capture a real screenshot from the running agenttestproject site, base64-encode it, embed in YAML, send as a task asking the agent to change visual styling.

## Out of Scope

- Image storage/caching (images are transient per-request)
- Image support in outbound messages (agents respond with text)
- Telegram/Discord bot channel adapters (use same inject API)
- Image in operational history (text summary only)

## Implementation Order

1. Types + `getTextContent()` helper + tests
2. Inject API validation
3. Migrate all `msg.content` reads to `getTextContent()`
4. `claude-code-respond.ts` multimodal prompt building
5. Work arc multimodal task description
6. Merge agenttestproject MRs, run site, capture screenshot
7. Write and run L225 scenario
