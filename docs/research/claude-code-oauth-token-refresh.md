# Claude Code OAuth Token Refresh

**Date:** 2026-03-16
**Status:** Researched, not yet implemented

## Problem

When Galatea spawns Claude Code Haiku subprocesses for L2 assessments or dogfood scenarios, they authenticate using the OAuth token stored in `~/.claude/.credentials.json`. After ~8 hours (or if the main Claude Code session refreshes the token first), these subprocesses get 401 errors:

```
OAuth token has expired. Please obtain a new token or refresh your existing token.
```

The 3-level fallback (Haiku → Ollama → L1) handles this for L2 assessments, but dogfood scenarios that use Claude Code as the main LLM adapter fail completely — "no language model available".

## Credentials File

**Location:** `~/.claude/.credentials.json`

```json
{
  "claudeAiOauth": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresAt": 1773705934297,
    "scopes": ["user:inference", "user:mcp_servers", "user:profile", "user:sessions:claude_code"],
    "subscriptionType": "max",
    "rateLimitTier": "default_claude_max_5x"
  }
}
```

- `expiresAt` is a Unix timestamp in milliseconds
- Tokens last ~8 hours from login
- Both `accessToken` and `refreshToken` are present

## OAuth Refresh Endpoint

**URL:** `POST https://platform.claude.com/v1/oauth/token`

**Content-Type:** `application/x-www-form-urlencoded` (NOT JSON)

**Client ID:** `9d1c250a-e61b-44d9-88ed-5944d1962f5e` (extracted from Claude Code v2.1.76 binary)

**Request:**
```
grant_type=refresh_token
refresh_token=<refresh_token_from_credentials>
client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e
```

**Response (JSON):**
```json
{
  "access_token": "new_access_token",
  "refresh_token": "new_refresh_token",
  "expires_in": 28800
}
```

## Implementation Sketch

```typescript
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

const CREDENTIALS_PATH = join(homedir(), ".claude", ".credentials.json")
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
const REFRESH_URL = "https://platform.claude.com/v1/oauth/token"

export async function refreshClaudeToken(): Promise<boolean> {
  const creds = JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"))
  const oauth = creds.claudeAiOauth
  if (!oauth?.refreshToken) return false

  const response = await fetch(REFRESH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: oauth.refreshToken,
      client_id: CLIENT_ID,
    }),
  })

  if (!response.ok) return false

  const data = await response.json()
  creds.claudeAiOauth = {
    ...oauth,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2))
  return true
}
```

## Critical Caveats

1. **Refresh tokens are single-use.** Using a refresh token invalidates the old one server-side. If the main Claude Code CLI session refreshes simultaneously, you get a race condition. See [#24317](https://github.com/anthropics/claude-code/issues/24317).

2. **File locking required.** Multiple processes reading/writing `~/.claude/.credentials.json` simultaneously need mutual exclusion. Use `flock` or equivalent.

3. **Refresh tokens expire after inactivity.** Extended idle periods invalidate the refresh token server-side — no periodic refresh prevents this.

4. **Claude Code handles its own refresh internally.** The CLI binary does auth/refresh automatically for interactive sessions. The issue only affects spawned subprocesses that read a stale credentials file.

## Alternative: `apiKeyHelper`

Claude Code supports `CLAUDE_CODE_API_KEY_HELPER_TTL_MS` (default 5 minutes) which calls a configured shell script to get a fresh API key. This is the official way to inject dynamic credentials for automated workflows:

```bash
# Helper script that refreshes and outputs the token
#!/bin/bash
python3 -c "
import json
creds = json.load(open('$HOME/.claude/.credentials.json'))
print(creds['claudeAiOauth']['accessToken'])
"
```

## Recommended Approach for Galatea

**Short-term (current):** The 3-level fallback (Haiku → Ollama → L1) handles expired tokens for L2 assessments. Dogfood scenarios should be run within ~2 hours of server start to avoid token expiration.

**Medium-term:** Add retry-with-refresh logic at the `generateText` call sites in `homeostasis-engine.ts`:
1. Catch 401 errors
2. Call `refreshClaudeToken()`
3. Retry the `generateText` call once
4. Use file locking to prevent race conditions with running Claude Code sessions

**Long-term:** Use the `apiKeyHelper` mechanism or switch to a proper API key (not OAuth) once Anthropic supports it for Claude Code subscriptions.

## References

- [Claude Code Authentication docs](https://code.claude.com/docs/en/authentication)
- [OAuth token refresh race condition #24317](https://github.com/anthropics/claude-code/issues/24317)
- [OAuth token expiration not handled #12879](https://github.com/anthropics/claude-code/issues/12879)
- [opencode-anthropic-auth source](https://github.com/anomalyco/opencode-anthropic-auth/blob/master/index.mjs)
- [How to Dynamically Change API Key](https://aiengineerguide.com/til/dynamically-change-api-key-in-claude-code/)
