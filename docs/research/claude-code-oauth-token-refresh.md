# Claude Code OAuth Token Refresh — SDK Auth Architecture

**Date:** 2026-03-16 (updated after SDK source analysis)
**Status:** Root cause identified, fix implemented

## Problem

When Galatea spawns Claude Code SDK subprocesses (for both L2 assessments and dogfood task execution), they get 401 "OAuth token has expired" errors — even when the credentials file shows the token has hours remaining.

## Root Cause: Token Rotation Race Condition

The Claude Agent SDK does NOT do its own auth. It spawns the full `cli.js` binary as a child process. The child reads `~/.claude/.credentials.json` on startup.

**The race:**
1. Our server spawns an SDK subprocess → subprocess reads `accessToken_v1` from file
2. The interactive Claude Code session (or another subprocess) refreshes its token
3. Refresh is single-use: old `accessToken_v1` is **revoked server-side**
4. Our subprocess tries to use `accessToken_v1` → 401 "expired"

The `expiresAt` field is a **local estimate**, not authoritative. The server may revoke a token at any time via rotation.

## SDK Auth Architecture (from minified source analysis)

### How the SDK authenticates

The `query()` function in `sdk.mjs` spawns `cli.js` as a child process. All auth lives in `cli.js`.

**Auth priority (in `cli.js`):**
1. `process.env.CLAUDE_CODE_OAUTH_TOKEN` — if set, use directly (no file read)
2. `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR` — fd-based token passing
3. `~/.claude/.credentials.json` — file-based, with memoization cache

### Token refresh inside cli.js

- Refresh triggered 5 minutes before `expiresAt` (`Date.now() + 300000 >= expiresAt`)
- Uses file locking (`flock`) on `~/.claude` directory to coordinate between processes
- After acquiring lock, re-reads file (checks if another process already refreshed)
- Calls `POST https://platform.claude.com/v1/oauth/token` with `grant_type=refresh_token`
- **Refresh tokens are single-use** — the old one is invalidated

### 401 handling inside cli.js

On 401, the SDK clears its memoized token cache and checks if the file has a newer token (another process may have refreshed). If yes, retries with the new token. If no, forces a refresh.

### CLAUDE_CODE_SSE_PORT

**Not related to auth.** Used by IDE integration to find running Claude Code instances for VS Code extension communication.

## Credentials File

**Location:** `~/.claude/.credentials.json`

```json
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat01-...",
    "refreshToken": "sk-ant-ort01-...",
    "expiresAt": 1773705934297,
    "scopes": ["user:inference", "user:mcp_servers", "user:profile", "user:sessions:claude_code"]
  }
}
```

**Important:** OAuth tokens can ONLY be used via the SDK/CLI subprocess, NOT via direct API calls to `api.anthropic.com`. The API returns "OAuth authentication is currently not supported" for direct bearer token usage.

The **usage endpoint** `https://api.anthropic.com/api/oauth/usage` works with OAuth tokens (requires `anthropic-beta: oauth-2025-04-20` header).

## OAuth Refresh Endpoint

**URL:** `POST https://platform.claude.com/v1/oauth/token`
**Content-Type:** `application/x-www-form-urlencoded`
**Client ID:** `9d1c250a-e61b-44d9-88ed-5944d1962f5e`
**Required header:** `User-Agent: claude-code/...` (Cloudflare blocks requests without it)

```
grant_type=refresh_token
refresh_token=<refresh_token>
client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e
```

## Fix: `CLAUDE_CODE_OAUTH_TOKEN` env var

**Implemented in `server/agent/coding-adapter/claude-code-adapter.ts`.**

The adapter reads the OAuth token fresh from the credentials file right before each `query()` call and passes it via `CLAUDE_CODE_OAUTH_TOKEN` in the subprocess env. This bypasses the race condition because:

1. The token is read at spawn time (not minutes earlier)
2. It's passed directly via env, so the subprocess doesn't re-read the file
3. If the token was just refreshed by the interactive session, we get the fresh one

```typescript
function readFreshOAuthToken(): string | undefined {
  try {
    const credPath = join(homedir(), ".claude", ".credentials.json")
    const creds = JSON.parse(readFileSync(credPath, "utf-8"))
    return creds.claudeAiOauth?.accessToken
  } catch {
    return undefined
  }
}

// In getCleanEnv():
const token = readFreshOAuthToken()
if (token) {
  env.CLAUDE_CODE_OAUTH_TOKEN = token
}
```

The adapter also has auth retry: if the first attempt returns a 401 (as a "success" result with auth error text), it waits 3s and retries once. This handles the narrow window where a refresh happens between our file read and the API call.

## Remaining Risks

1. **Interactive session refreshes during subprocess execution.** If a subprocess runs for minutes and the interactive session refreshes mid-run, the subprocess's in-memory token gets revoked. The SDK's internal 401 handler should catch this and re-read the file.

2. **Multiple agents running simultaneously.** Each agent spawn reads the file independently. If one agent's subprocess triggers a refresh that invalidates another agent's in-flight token, the 401 handler in `cli.js` should recover.

3. **`/login` doesn't update credentials file.** The Claude Code `/login` command may update the in-memory session without writing to the file. The fix: after `/login`, either restart the server or manually run `curl` to refresh the file token.

## Alternative Approaches (for future)

- **`ANTHROPIC_API_KEY`** — Static API key from Console. No rotation, no race. Requires separate Console subscription.
- **`apiKeyHelper` script** — Official mechanism for dynamic credentials. CLI calls a shell script to get fresh token, with configurable TTL (`CLAUDE_CODE_API_KEY_HELPER_TTL_MS`, default 5min).
- **Separate `CLAUDE_CONFIG_DIR`** — Isolate agent sessions from interactive sessions. Each uses its own credentials file.

## References

- SDK source: `node_modules/@anthropic-ai/claude-agent-sdk/{sdk.mjs,cli.js}`
- ContextForge example: `/home/newub/w/ContextLibrary/ContextForgeTS/convex/claudeNode.ts`
- [Claude Code Authentication docs](https://code.claude.com/docs/en/authentication)
