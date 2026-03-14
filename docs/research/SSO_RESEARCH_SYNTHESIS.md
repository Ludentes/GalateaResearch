# SSO Research Synthesis: Recommendations for Galatea

**Date**: March 14, 2026
**Project**: Galatea (TanStack Start v1, PostgreSQL, self-hosted, 3-10 person team)
**Status**: Complete research synthesis with actionable recommendations

---

## Executive Summary

For **Galatea's internal dashboard** with a small dev team, adopt a **phased approach**:

1. **Sprint 1-2 (Now)**: Magic links + GitHub OAuth with PostgreSQL sessions
2. **Sprint 3-4**: Add secondary passwordless methods (WebAuthn optional)
3. **Sprint 5+ (Future)**: Self-hosted Authentik + OIDC if enterprise growth occurs

**Recommended primary choice: Magic Links + Better Auth library**
- Setup: 1-2 days
- Zero external infrastructure (Resend for email only)
- Works for distributed teams
- Simple token lifecycle management
- PostgreSQL sessions for persistence

---

## 1. Comparison Table: Option × Complexity × Self-Hosted × Integration Effort

| Approach | Implementation | Maintenance | Self-Hosted? | Token/Session Mgmt | Integration Effort | Best For |
|----------|---|---|---|---|---|---|
| **OAuth 2.0 (GitHub)** | Low (2-4h) | None | No | Minimal | 2-4 hours | Quick MVP, team already on GitHub |
| **Magic Links (Email)** | Low-Medium (1-2d) | Low | Mostly | Simple tokens + DB | 1-2 days | Internal team, passwordless, flexible |
| **Better Auth + Sessions** | Low-Medium (1-2d) | Low | Mostly | Abstracted by library | 1-2 days | Modern, full-featured, no vendor lock-in |
| **OIDC + Authentik** | Medium (3-5d) | Medium | Yes | Token + OIDC flow | 3-5 days | Enterprise-ready, future-proof, self-hosted |
| **OIDC + Keycloak** | Medium-High (5-10d) | High | Yes | OIDC + complex features | 5-10 days | Large orgs, SAML + OIDC, over-engineered for small team |
| **SAML** | Medium-High (5-10d) | Medium | Depends | XML assertions | 5-10 days | Legacy enterprise, HR/payroll integration |
| **WebAuthn/Passkeys** | Medium-High (3-5d) | Medium | Mostly | Credential assertion | 3-5 days | Passwordless future, high UX, complex recovery |
| **Session Cookies + JWT** | Low (2-4h) | Low | Yes | Custom logic | 2-4 hours | Single-app deployments, no federation needed |

---

## 2. Top 2-3 Recommendations with Reasoning

### ✓ RECOMMENDATION 1: Magic Links + Better Auth (PRIMARY)

**What**: Passwordless auth via email links + Better Auth library + PostgreSQL sessions

**Stack**:
```
TanStack Start v1 (frontend)
    ↓
Better Auth library (backend)
    ↓
PostgreSQL (session storage + user data)
    ↓
Resend (email delivery)
```

**Implementation Timeline**: 1-2 days

**PostgreSQL Schema**:
```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE magic_links (
  id TEXT PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Cleanup index for expired tokens
CREATE INDEX idx_magic_links_expires_at ON magic_links(expires_at);
```

**Why This**:
1. **No passwords** — eliminates password hashing/reset burden
2. **Flexible** — works for anyone with email (contractors, external partners later)
3. **Future-proof** — Better Auth supports adding OAuth, WebAuthn later without architecture change
4. **Self-contained** — email service is the only external dependency (Resend, SendGrid, Nodemailer all work)
5. **Small team friendly** — no IdP infrastructure to manage
6. **PostgreSQL native** — leverages existing stack

**How it works**:
```
User visits app → clicks "Sign In" → enters email
    ↓
Server generates crypto-random token (32 chars)
    ↓
Stores token + user email in magic_links table (15-30 min expiry)
    ↓
Sends: "https://yourapp/auth/verify?token=xyz..." via Resend
    ↓
User clicks link
    ↓
Server validates token (exists, not expired, not used)
    ↓
Creates session in sessions table
    ↓
Sets HttpOnly SameSite cookie
    ↓
User is authenticated
```

**Code Example** (TanStack Start + Better Auth):
```typescript
// server/auth.ts
import { betterAuth } from "better-auth"
import { passwordless } from "better-auth/plugins"

export const auth = betterAuth({
  database: {
    type: "postgres",
    url: process.env.DATABASE_URL,
  },
  basePath: "/api/auth",
  plugins: [
    passwordless({
      email: {
        sendVerificationEmail: async (url, email) => {
          // Use Resend for email
          await resend.emails.send({
            from: "auth@galatea.dev",
            to: email,
            subject: "Sign in to Galatea",
            html: `<a href="${url}">Click here to sign in</a>`,
          })
        },
      },
    }),
  ],
})

// Route: POST /api/auth/sign-in/email
export async function signInWithEmail(email: string) {
  return await auth.api.signInWith.email({ email })
}

// Route: GET /auth/verify?token=xyz
// Better Auth handles this automatically
```

**Pros**:
- No password security burden
- Works with any email provider
- Simple UX (especially for small teams)
- PostgreSQL handles all state
- Easy to add OAuth/WebAuthn later

**Cons**:
- Email service must be reliable (Resend recommended for uptime)
- Slight UX friction (check email, click link)
- Requires email verification (adds validation step)
- Backup auth method recommended (GitHub OAuth)

**Timeline**: ~40 hours (1 developer, 1-2 days including testing)

---

### ✓ RECOMMENDATION 2: OAuth 2.0 (GitHub) + Sessions (BACKUP)

**What**: GitHub OAuth for quick signup + PostgreSQL sessions

**Stack**:
```
TanStack Start v1
    ↓
GitHub OAuth API
    ↓
PostgreSQL (user + session tables)
```

**Implementation Timeline**: 2-4 hours

**When to use**: **Right now** if you need auth working today (Recommendation 1 is still better, but OAuth is faster)

**PostgreSQL Schema**:
```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  oauth_provider TEXT,    -- 'github', 'gitlab', etc.
  oauth_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**How it works**:
```
User clicks "Sign in with GitHub"
    ↓
Redirects to GitHub OAuth authorization
    ↓
GitHub redirects back with auth code
    ↓
Your server exchanges code for access token (backend-to-backend)
    ↓
Fetches user profile (email, avatar, etc.)
    ↓
Creates or finds user in DB
    ↓
Creates session
    ↓
Sets session cookie
```

**Code Example** (TanStack Start):
```typescript
// server/routes/api/auth/github/callback.ts
export const POST = handler(async (event) => {
  const { code, state } = getQuery(event)

  // Validate state for CSRF protection
  const storedState = getCookie(event, "oauth_state")
  if (state !== storedState) {
    throw createError({ statusCode: 403, statusMessage: "Invalid state" })
  }

  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  })

  const { access_token, error } = await tokenRes.json()
  if (error) {
    throw createError({ statusCode: 401, statusMessage: "OAuth failed" })
  }

  // Fetch user from GitHub
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${access_token}` },
  })

  const ghUser = await userRes.json()

  // Create or find user
  let user = await db.users.findOne({
    oauth_provider: "github",
    oauth_id: ghUser.id.toString(),
  })

  if (!user) {
    user = await db.users.create({
      email: ghUser.email,
      name: ghUser.name,
      avatar_url: ghUser.avatar_url,
      oauth_provider: "github",
      oauth_id: ghUser.id.toString(),
    })
  }

  // Create session
  const sessionId = crypto.randomUUID()
  await db.sessions.create({
    id: sessionId,
    user_id: user.id,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  })

  // Set secure session cookie
  setCookie(event, "session_id", sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  })

  // Redirect to dashboard
  return sendRedirect(event, "/agent")
})
```

**Setup**:
1. Go to https://github.com/settings/developers/oauth-apps
2. Create new OAuth app
3. Set Authorization callback URL: `https://yourapp.com/api/auth/github/callback`
4. Copy Client ID + Client Secret to `.env`

**Pros**:
- Fastest implementation (2-4 hours)
- Zero email service dependency
- Works instantly for GitHub-based teams
- No IdP needed
- GitHub handles security

**Cons**:
- **Team must be on GitHub** (won't work for external users)
- Vendor lock-in (GitHub dependency)
- Single provider only (add GitLab OAuth separately if needed)
- Can't SSO across multiple systems (no OIDC)

**Timeline**: ~3-4 hours (1 developer)

**CRITICAL**: Use as **secondary method alongside magic links**, not as primary. GitHub being down = no one can log in.

---

### ✓ RECOMMENDATION 3: Better Auth + GitHub OAuth + Magic Links (HYBRID)

**What**: Best of both worlds — magic links (primary) + GitHub OAuth (quick signup) + Better Auth (modern library)

**Stack**:
```
TanStack Start v1
    ↓
Better Auth (abstraction layer)
    ├── Magic Links (primary passwordless)
    ├── GitHub OAuth (secondary)
    └── WebAuthn (future, optional)
    ↓
PostgreSQL (all state)
    ↓
Resend (magic link emails)
```

**Implementation Timeline**: 1-2 days

**Why this combination**:
- **Primary**: Magic links (works when GitHub is down)
- **Secondary**: GitHub OAuth (fast signup for team)
- **Future**: Add WebAuthn without architecture change
- **Modern**: Better Auth actively maintained, excellent for Node.js

**How it works**:

```
Sign In Screen
    ├─ "Sign in with Magic Link" → Email → Token → Verify
    └─ "Sign in with GitHub" → Redirect → OAuth → Verify

Both routes → PostgreSQL session → Dashboard
```

**Code Example**:
```typescript
// server/auth.ts
import { betterAuth } from "better-auth"
import { passwordless } from "better-auth/plugins"

export const auth = betterAuth({
  database: {
    type: "postgres",
    url: process.env.DATABASE_URL,
  },
  basePath: "/api/auth",
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
  },
  plugins: [
    passwordless({
      email: {
        sendVerificationEmail: async (url, email) => {
          await resend.emails.send({
            from: "auth@galatea.dev",
            to: email,
            subject: "Sign in to Galatea",
            html: `<a href="${url}">Click here to sign in</a>`,
          })
        },
      },
    }),
  ],
})
```

**Client Component** (TanStack Start React):
```typescript
// app/components/LoginForm.tsx
import { useSignInFlow } from "~/hooks/useAuth"

export function LoginForm() {
  const { signInWithEmail, signInWithGitHub, isLoading } = useSignInFlow()

  return (
    <div className="space-y-4">
      <input type="email" placeholder="Email" id="email" />

      <button onClick={() => signInWithEmail((document.getElementById("email") as HTMLInputElement).value)}>
        Sign in with Magic Link
      </button>

      <button onClick={() => signInWithGitHub()}>
        Sign in with GitHub
      </button>
    </div>
  )
}
```

**Pros**:
- **Redundancy**: Magic links work when GitHub is down
- **Flexibility**: Users pick their preferred method
- **Future-proof**: Add WebAuthn, SAML, OIDC later via Better Auth
- **Modern**: Better Auth is actively maintained and Node.js-first
- **Self-contained**: No vendor lock-in (can migrate IdP later)

**Cons**:
- Slightly more complex setup than single method
- Requires email service (acceptable risk with Resend)
- GitHub OAuth still only for GitHub users (mitigated by magic links)

**Timeline**: ~40-50 hours (1-2 days for experienced dev, includes testing)

---

## 3. Detailed Analysis: Each Approach

### OAuth 2.0 (General: GitHub, GitLab, Google)

**Complexity**: Low
**Self-Hosted**: No (relies on provider)
**Token Management**: Provider handles tokens
**Best For**: Dev teams, quick MVP

**Trade-offs**:
- **Fast to implement**: 2-4 hours
- **No infrastructure**: Provider manages everything
- **Single provider dependency**: If GitHub down, can't log in
- **Team-specific**: Won't work for external users
- **No true SSO**: Just delegated authentication

**Security**:
- OAuth 2.0 spec is battle-tested
- HTTPS + PKCE recommended (both standard)
- State parameter prevents CSRF
- Access tokens are short-lived

**Database**: Minimal (users + oauth_accounts)

**Scalability**: Fine for 10-1000 users

**Migration Path**: Can add magic links later without changing OAuth routes

---

### Magic Links / Email-Based Passwordless Auth

**Complexity**: Low-Medium
**Self-Hosted**: Yes (Resend is optional)
**Token Management**: Simple tokens + DB
**Best For**: Internal teams, passwordless-first

**Trade-offs**:
- **Universal**: Works for anyone with email
- **Simple UX**: "Click to log in"
- **Email dependency**: Must have reliable email service
- **Token management burden**: You store + validate tokens
- **No password database**: No hashing needed

**Security**:
- Token must be crypto-random (32+ chars)
- Token TTL: 15-30 minutes (short-lived)
- One-time use only (check `used_at` flag)
- Email must be verified (you control the verification link)
- Rate limiting on token generation (prevent spam)

**Database**: users + magic_links + sessions (simple schema)

**Scalability**: Fine for 10-10,000 users (token cleanup needed)

**Email Services**:
- **Resend** (recommended): Modern, good uptime, free tier
- **SendGrid**: Reliable, more enterprise
- **Nodemailer**: Self-hosted, requires SMTP server

**Migration Path**: Add WebAuthn later (Recommendation 5)

---

### Better Auth + Sessions

**Complexity**: Low-Medium
**Self-Hosted**: Yes
**Token Management**: Abstracted by library
**Best For**: Modern Node.js projects needing flexibility

**Trade-offs**:
- **Modern**: Actively maintained, Node.js-first
- **Flexible**: Supports magic links, OAuth, WebAuthn, SAML, OIDC all in one library
- **Less battle-tested**: Newer than NextAuth, but rapidly gaining adoption
- **PostgreSQL required**: No SQLite support (fine for production)

**Security**:
- Better Auth handles crypto, token generation, CSRF
- Built-in rate limiting
- Secure by default (HttpOnly cookies, SameSite)

**Database**: Managed by Better Auth (creates tables automatically)

**Scalability**: Enterprise-ready, used by startups scaling to 100k+ users

**Maturity**:
- GitHub: https://github.com/better-auth/better-auth
- ~3 years old, actively maintained
- Good community, responsive maintainers
- Cleaner API than NextAuth

**Migration Path**: Can swap providers without code changes

---

### OIDC + Authentik (Self-Hosted)

**Complexity**: Medium
**Self-Hosted**: Yes
**Token Management**: OIDC flow (tokens + refresh tokens)
**Best For**: Enterprise growth, future SSO federation

**Trade-offs**:
- **Enterprise-ready**: OIDC is standard, works with other systems
- **Full control**: Self-hosted on your infrastructure
- **Infra overhead**: Requires Authentik + Redis + PostgreSQL (separate from app)
- **More complex**: More moving parts, more to learn
- **Overkill for MVP**: Worth doing in Phase 2-3, not Phase 1

**Architecture**:
```
TanStack Start
    ↓ (OIDC client)
Better Auth
    ↓
Authentik (self-hosted OIDC provider)
    ↓
PostgreSQL + Redis (Authentik's DB + cache)
```

**Why Authentik over Keycloak**:
- **Simpler UI**: Keycloak console is overwhelming
- **Visual flows**: Flow builder (no YAML)
- **Lower resource use**: Runs in <2GB RAM
- **Faster onboarding**: Graphical configuration
- **Smaller learning curve**: Authentik docs are clearer

**Deployment**:
```bash
docker run -d \
  -p 9000:9000 \
  -e PG_PASS=postgres \
  -e AUTHENTIK_BOOTSTRAP_TOKEN=token123 \
  ghcr.io/goauthentik/server:latest
```

**Database**: Authentik manages its own PostgreSQL schema (separate from app DB)

**Scalability**: 10-10,000 users easily (with monitoring)

**Timeline**: 3-5 days (includes learning Authentik, configuring flows, testing)

**When to implement**: Sprint 5+, only if enterprise growth planned

---

### OIDC + Keycloak

**Complexity**: High
**Self-Hosted**: Yes
**Token Management**: Full OIDC flow
**Best For**: Large enterprises, maximum flexibility

**Trade-offs**:
- **Most flexible**: Supports OIDC, SAML, LDAP, federation
- **Over-engineered for small teams**: Designed for 10,000+ users
- **Steep learning curve**: Admin console is complex
- **Resource-heavy**: Needs 4+ GB RAM, JVM overhead
- **More to maintain**: More components, more failure modes

**Why NOT for Galatea**:
- Team is 3-10 people
- Keycloak admin console has 100+ options (95% unused)
- Java/JVM adds operational burden
- Overkill for Phase 1-2

**Recommendation**: Only adopt if team grows >50 people AND needs SAML

---

### SAML 2.0

**Complexity**: Medium-High
**Self-Hosted**: Depends
**Token Management**: XML assertions
**Best For**: Enterprise legacy systems

**Trade-offs**:
- **Enterprise standard**: Large orgs already ship SAML clients
- **XML complexity**: Verbose, certificates, metadata, encryption
- **Manual certificate management**: Keys expire, need rotation
- **Not for passwordless**: SAML is credential-based
- **Overkill for small teams**: Designed for HR/payroll integration

**Use SAML only if**:
- You need to integrate with Okta, Ping Identity, Active Directory
- Customers require SAML SSO
- Team already knows SAML

**Recommendation**: Skip for MVP. Add in Phase 4+ if enterprise customers demand it.

---

### WebAuthn / Passkeys

**Complexity**: Medium-High
**Self-Hosted**: Mostly
**Token Management**: Cryptographic assertions
**Best For**: Passwordless future, high-security environments

**Trade-offs**:
- **Next-generation**: No passwords, biometric auth (Touch ID, Face ID)
- **Browser support**: Excellent (99% of users), but recovery is hard
- **Recovery UX**: "Forgot my passkey" is more complex than "Forgot password"
- **Setup friction**: First-time registration requires device setup
- **Not mature yet**: Still evolving (new features regularly)

**Phased Adoption** (Recommended):
```
Phase 1: Magic links (simple, universal entry point)
    ↓ (after 1-2 sprints)
Phase 2: Add WebAuthn as secondary (with magic links backup)
    ↓ (later, optional)
Phase 3: Consider passkey-only (if UX research supports it)
```

**Library**: `@simplewebauthn`
```typescript
import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server"

// Registration
const options = generateRegistrationOptions({
  rpID: "galatea.dev",
  rpName: "Galatea",
  userID: user.id,
  userName: user.email,
})

// Verification
const verification = await verifyRegistrationResponse({
  response: registrationData,
  expectedChallenge,
  expectedRPID: "galatea.dev",
})
```

**Timeline**: 3-5 days (implementation is straightforward, but testing edge cases takes time)

**When to use**: Phase 2-3, as secondary auth method

---

### Session Cookies + JWT (Custom)

**Complexity**: Low
**Self-Hosted**: Yes
**Token Management**: Manual
**Best For**: Simple single-app deployments

**Trade-offs**:
- **Simple**: Just cookies + sessions
- **Limited**: Can't federate to other systems
- **Manual burden**: You implement expiry, refresh, revocation
- **No true SSO**: Single app only
- **Not recommended**: Better Auth abstracts this better

**Recommendation**: Avoid. Use Better Auth or OAuth instead. Manual JWT introduces more bugs.

---

## 4. Red Flags and Gotchas

### Gotcha 1: Email Service Reliability (Magic Links)

**Risk**: If email service down, can't log in

**Mitigation**:
- Use Resend (very reliable, 99.99% uptime)
- Keep GitHub OAuth as fallback
- Monitor email service health
- Set up alerts for delivery failures

---

### Gotcha 2: Token Expiration Edge Case (Magic Links)

**Risk**: User clicks link after 30 min expiry → "Invalid link" error

**Mitigation**:
- TTL = 30 min (good default)
- Show countdown timer in email
- Handle expired token gracefully (re-send email button)
- Don't silently fail — tell user what happened

---

### Gotcha 3: OAuth Rate Limits (GitHub)

**Risk**: Large deployments hit GitHub API rate limits

**Mitigation**:
- Small teams (<100 users) are fine
- Cache user profiles for 24h
- GitHub allows 5,000 requests/hour per token
- For Galatea (internal tool), irrelevant

---

### Gotcha 4: Database Connection Pool (Sessions)

**Risk**: High concurrency (many users logging in) exhausts connection pool

**Mitigation**:
- PostgreSQL connection pool: size = 20 (default)
- For internal tool, fine
- If scaling: use PgBouncer for connection pooling

---

### Gotcha 5: Token Reuse / Replay Attack (Magic Links)

**Risk**: Attacker captures link, uses it multiple times

**Mitigation**:
- Mark token as `used_at` immediately after verification
- Reject any subsequent attempts with same token
- One-time use only (enforced in schema: `WHERE used_at IS NULL`)
- Keep `created_at` for audit trail

---

### Gotcha 6: CSRF on OAuth Callback (GitHub/OAuth)

**Risk**: Attacker tricks user into clicking forged OAuth callback

**Mitigation**:
- Use `state` parameter (part of OAuth 2.0 spec)
- Generate random state, store in session
- Validate state matches on callback
- Better Auth handles this automatically

---

### Gotcha 7: Session Fixation (All Methods)

**Risk**: Attacker tricks user into using attacker's session

**Mitigation**:
- Generate new session after authentication (not reuse)
- Use HttpOnly cookies (can't be accessed by JS)
- Use SameSite=Lax (prevents CSRF)
- Set secure flag in production (HTTPS only)

```typescript
setCookie(event, "session_id", newSessionId, {
  httpOnly: true,      // ← Can't be stolen via XSS
  secure: isProd,      // ← HTTPS only
  sameSite: "lax",     // ← CSRF protection
  maxAge: 30 * 86400,  // ← 30 days
})
```

---

### Gotcha 8: Email Verification Not Done (Magic Links)

**Risk**: Bot signs up with fake email, session is valid

**Mitigation**:
- Magic links ARE email verification (user must click link sent to email)
- No fake email possible (attacker can't send email or receive link)
- This is actually a strength of magic links

---

### Gotcha 9: Secrets Leaking (.env files)

**Risk**: `GITHUB_CLIENT_SECRET` committed to git

**Mitigation**:
- `.env` in `.gitignore` (required)
- Use `.env.example` with placeholder values
- CI/CD: inject secrets via GitHub Actions / GitLab CI environment variables
- Rotate secrets if leaked

---

### Gotcha 10: Mixing Multiple Auth Methods Without Deduplication

**Risk**: Same user signs up with email, then GitHub → Two accounts

**Mitigation**:
- When user signs in with GitHub, check if email exists
- Link accounts intelligently (merge or prompt user)
- Database constraint: `UNIQUE(email)` across all auth methods
- Better Auth handles this; manual implementations often don't

---

## 5. Pragmatic Implementation Plan for Galatea

### Phase 1: This Sprint (Days 1-2)

**Goal**: Deploy magic links + sessions

```
Task 1: PostgreSQL schema (users + magic_links + sessions tables)
Task 2: Create auth routes in TanStack Start (/api/auth/*)
Task 3: Magic link email sending (use Resend)
Task 4: Session validation middleware
Task 5: Test happy path + edge cases
Task 6: Deploy to staging
```

**Time**: ~2 days (1 developer)

**Result**: Internal team can log in via magic links

---

### Phase 1.5: Next Week (Optional: Add GitHub OAuth)

**Goal**: Add GitHub OAuth as secondary method

```
Task 1: Register GitHub OAuth app
Task 2: Add OAuth callback route
Task 3: Link GitHub account to existing user
Task 4: Test backup login (GitHub when Resend is down)
```

**Time**: ~4-6 hours

**Result**: "Sign in with GitHub" option available

---

### Phase 2: Sprint 3-4 (Future: Optional WebAuthn)

**Goal**: Add passkeys as secondary passwordless method

```
Task 1: Register WebAuthn credentials in DB
Task 2: Add registration flow (device setup)
Task 3: Add authentication flow (tap device)
Task 4: Fallback to magic links if device fails
```

**Time**: ~3-5 days

**Result**: Users can choose magic links or passkeys

---

### Phase 3: Sprint 5+ (If Enterprise Growth)

**Goal**: Deploy Authentik + OIDC for future federation

```
Task 1: Deploy Authentik on self-hosted Linux
Task 2: Configure PostgreSQL + Redis for Authentik
Task 3: Create OIDC app in Authentik UI
Task 4: Integrate Better Auth with Authentik OIDC
Task 5: Test OIDC flow end-to-end
```

**Time**: ~3-5 days

**Result**: Enterprise-ready OIDC provider running; can federate to other systems

---

## 6. Security Checklist (All Approaches)

Before launch, verify:

### Cryptography
- [ ] Token generation uses `crypto.randomBytes()` (not Math.random())
- [ ] Tokens are 32+ characters (sufficient entropy)
- [ ] Token TTL is 15-30 minutes (short-lived)
- [ ] Refresh tokens are rotated (if using JWT)

### HTTP/Network
- [ ] HTTPS only (no HTTP in production)
- [ ] HSTS header set (`Strict-Transport-Security`)
- [ ] No mixed HTTP/HTTPS

### Cookies (Session-Based Auth)
- [ ] HttpOnly flag set (prevents JS access)
- [ ] Secure flag set (HTTPS only)
- [ ] SameSite=Lax (CSRF protection)
- [ ] Domain set correctly (prevent subdomain hijacking)

### Database
- [ ] Expired sessions cleaned up regularly (cron job)
- [ ] User passwords hashed with argon2/scrypt (if using passwords)
- [ ] Database encrypted at rest (storage-level encryption)
- [ ] Audit log of logins (timestamp, IP, method)

### Rate Limiting
- [ ] Auth endpoints rate-limited (max 5 attempts/min per IP)
- [ ] Magic link generation rate-limited (max 3/hour per email)
- [ ] OAuth callback rate-limited (prevent token exhaustion)

### OAuth Specific
- [ ] State parameter validated (CSRF protection)
- [ ] Access tokens stored server-side (never exposed to frontend)
- [ ] Refresh tokens rotated (new token on each use)

### Email (Magic Links)
- [ ] Email verification is encrypted (TLS)
- [ ] Links are one-time use (check `used_at` flag)
- [ ] Links are single-purpose (can't reuse for other actions)
- [ ] Email service has DKIM/SPF (prevent spoofing)

### Account Recovery
- [ ] Account recovery mechanism documented
- [ ] Backup email address stored (if primary fails)
- [ ] Recovery codes generated (if using WebAuthn)

### Monitoring
- [ ] Auth endpoint response times logged
- [ ] Failed login attempts logged
- [ ] Alerts set up (unusual activity, service down)
- [ ] Audit trail accessible to admins

---

## 7. Cost Analysis

| Approach | Upfront | Monthly | Comments |
|----------|---------|---------|----------|
| **Magic Links (Resend)** | 0 | $0-20 | Resend free tier: 100 emails/day, $0.04/email after |
| **GitHub OAuth** | 0 | 0 | Free forever |
| **Better Auth** | 0 | 0 | Open source |
| **Authentik (self-hosted)** | 0 | Server costs | ~$10-30/mo for small VPS |
| **Keycloak (self-hosted)** | 0 | Server costs | ~$30-50/mo (needs more RAM) |
| **Auth0 / Okta / Firebase** | 0 | $25-500+ | SaaS, vendor lock-in |

**Recommendation**: Stick with open-source + Resend. Total cost = $0-20/month for small team.

---

## 8. Final Decision Matrix

| Need | Solution | Effort | Risk | Cost |
|------|----------|--------|------|------|
| **Auth by EOW** | GitHub OAuth | 2-4h | Low | $0 |
| **Auth this sprint** | Magic Links + Better Auth | 1-2d | Low | $0-20 |
| **Auth + flexibility** | Magic Links + GitHub OAuth | 1-2d | Low | $0-20 |
| **Enterprise ready (Phase 2)** | Better Auth + Authentik | 3-5d | Medium | $10-30 |
| **Maximum features (Phase 3+)** | Keycloak + SAML | 5-10d | High | $30-50 |

**Recommendation for Galatea: Magic Links + Better Auth, with GitHub OAuth as backup**

---

## 9. Implementation Quickstart

### Minimal: GitHub OAuth (2-4 hours)

1. Register GitHub OAuth app
2. Create `POST /api/auth/github/callback` route
3. Add users + sessions tables
4. Set session cookie
5. Done

### Recommended: Magic Links + Better Auth (1-2 days)

1. Add Better Auth to `package.json`
2. Configure with PostgreSQL
3. Enable passwordless plugin
4. Create `/auth/sign-in` and `/auth/verify` routes
5. Hook up Resend for email
6. Test token lifecycle (generation, expiry, one-time use)
7. Deploy

### Enterprise: Authentik + OIDC (3-5 days, Phase 2+)

1. Deploy Authentik container
2. Configure PostgreSQL + Redis
3. Set up OIDC application in Authentik
4. Configure Better Auth OIDC provider
5. Test end-to-end
6. Keep magic links as fallback

---

## 10. Related Documentation

- **[SSO_QUICK_REFERENCE.md](SSO_QUICK_REFERENCE.md)** — Decision matrix by scenario
- **[2026-03-14-sso-provider-comparison.md](2026-03-14-sso-provider-comparison.md)** — Detailed provider analysis
- **[SETTING_UP_BETTERAUTH_TANSTACK.md](SETTING_UP_BETTERAUTH_TANSTACK.md)** — Step-by-step Better Auth setup (if created)

---

## Summary & Next Actions

1. **Adopt Magic Links + Better Auth as primary strategy**
   - Implementation: 1-2 days
   - Cost: $0-20/month
   - Risk: Low
   - Flexibility: High

2. **Add GitHub OAuth as secondary (optional, Phase 1.5)**
   - Implementation: 4-6 hours
   - Cost: $0
   - Risk: Low
   - Benefit: Fast signup, single sign-on for team

3. **Plan Authentik + OIDC for Phase 2-3 (if enterprise growth)**
   - Implementation: 3-5 days
   - Cost: $10-30/month
   - Risk: Medium
   - Benefit: Enterprise-ready, self-hosted, federable

4. **Defer WebAuthn to Phase 2-3**
   - It's nice-to-have, not must-have
   - Magic links are sufficient passwordless solution
   - Add once magic links proven stable

5. **Do NOT use Keycloak for MVP**
   - Overengineered
   - High learning curve
   - High resource cost
   - Authentik is better for small teams

---

**Document Status**: Complete
**Last Updated**: March 14, 2026
**Tags**: #authentication #sso #oauth #passwordless #better-auth #tanstack #postgres #oidc
