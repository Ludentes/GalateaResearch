# SSO Provider Comparison: In-Depth Analysis

**Date**: March 14, 2026
**Stack**: TanStack Start v1, Node.js, PostgreSQL, self-hosted Linux
**Team**: Small (3-10 people)
**Scope**: Internal web app + dashboard, potential future growth

---

## 1. OAuth 2.0 (GitHub, GitLab, Google)

### What It Is
OAuth 2.0 is a **delegation protocol** — it lets users authenticate via an external provider. You don't store passwords; instead, the provider vouches for the user.

### How It Works for TanStack Start

```
User → "Sign in with GitHub" button
   ↓
Redirect to GitHub's OAuth endpoint
   ↓
User logs in on GitHub
   ↓
GitHub redirects back to your callback URL with auth code
   ↓
Your server exchanges code for access token
   ↓
Your server fetches user profile (email, avatar, etc.)
   ↓
Create session in PostgreSQL
   ↓
User is logged in
```

### Implementation Effort

**Low** — 2-4 hours for single provider

Required:
- OAuth app registration (GitHub/GitLab: 5 minutes)
- TanStack Start API route to handle callback
- Simple session management (can be basic cookies)
- PostgreSQL table for users

### PostgreSQL Requirements

```sql
-- Minimal schema
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  oauth_provider TEXT, -- 'github' or 'gitlab'
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

### Pros
- **Dead simple**: No IdP to manage
- **Zero maintenance**: Provider handles everything
- **Developer-friendly**: Dev team already on GitHub/GitLab
- **Fast signup**: Users already logged in on GitHub
- **Works for team**: Internal tool with 3-10 users on same platform

### Cons
- **Single provider dependency**: If GitHub down, can't log in
- **Limited to one platform**: Won't work for external users on different platforms
- **Vendor lock-in**: Tied to GitHub's API and terms
- **No SAML/OIDC**: Can't federate to other systems
- **Scaling limitation**: Doesn't work for 1000+ users with mixed auth needs

### Best For
- **Internal team tools** (dev team already on GitHub)
- **Quick MVP** (need auth before next sprint)
- **Small, homogeneous teams** (everyone uses same provider)
- **Projects that don't need enterprise SSO**

### Maturity & Maintenance
- **Battle-tested**: OAuth is 15+ years old, proven in millions of apps
- **No maintenance**: GitHub/GitLab handle updates
- **Library support**: Passport.js, better-auth, oauth libraries all support it

### TanStack Start Integration
```typescript
// server/routes/api/auth.github.callback.ts (example)
export const POST = handler(async (event) => {
  const { code } = await readBody(event)
  
  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  })
  
  const { access_token } = await tokenRes.json()
  
  // Fetch user from GitHub
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  
  const ghUser = await userRes.json()
  
  // Create or find user in DB
  let user = await db.users.findOne({ oauth_id: ghUser.id })
  if (!user) {
    user = await db.users.create({
      email: ghUser.email,
      name: ghUser.name,
      oauth_provider: "github",
      oauth_id: ghUser.id.toString(),
      avatar_url: ghUser.avatar_url,
    })
  }
  
  // Create session
  const sessionId = generateToken()
  await db.sessions.create({
    id: sessionId,
    user_id: user.id,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  })
  
  // Set cookie & redirect
  setCookie(event, "session_id", sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  })
  
  return { success: true }
})
```

### Cost
- Free for personal use
- GitHub org limits: 3 free, paid for more

---

## 2. Magic Links / Email-Based Passwordless Auth

### What It Is
User enters email → system sends click-once link → click = authenticated. No passwords.

### How It Works

```
User → Enters email
   ↓
System generates crypto-random token (32+ chars)
   ↓
Stores token + expiration in DB (15-30 min TTL)
   ↓
Sends "https://yourapp.com/auth/verify?token=xyz..." via email
   ↓
User clicks link
   ↓
Server validates token (not expired, not used yet)
   ↓
Create session, mark token as used
   ↓
User is logged in
```

### Implementation Effort

**Low-Medium** — 1-2 days including email setup

Required:
- Email sending service (Resend, SendGrid, Nodemailer)
- Token generation + storage
- Verification endpoint
- Session management

### PostgreSQL Requirements

```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE magic_tokens (
  id TEXT PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  email TEXT NOT NULL, -- for when user doesn't exist yet
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Cleanup old tokens
-- DELETE FROM magic_tokens WHERE expires_at < NOW();
```

### Pros
- **No passwords**: Users don't manage passwords, no hashing needed
- **Simple**: Easier to explain than OAuth or OIDC
- **Self-contained**: No external provider dependency
- **Email-based**: Works for anyone with email
- **Perfect for internal use**: Small team, all have company email

### Cons
- **Email dependency**: If email service down, can't log in
- **UX friction**: Extra step (check email, click link)
- **Token security**: Must generate truly random tokens
- **No backup auth**: If user loses email access, needs recovery mechanism
- **Spam risk**: Links in emails get flagged, need good IP reputation

### Best For
- **Internal team tools** (email guaranteed)
- **Small, trusted teams** (no sign-up fraud)
- **Phase 1 of passwordless** (before WebAuthn)
- **Organizations with email mandate** (no personal emails)

### Maturity & Maintenance
- **Proven pattern**: Used by Auth0, Slack, many others
- **Simple**: Less to maintain than full OAuth provider
- **Email service reliability**: Depends on Resend/SendGrid quality

### TanStack Start Integration with Better Auth

```typescript
// Using Better Auth (recommended for magic links)
import { betterAuth } from "better-auth"
import { passwordless } from "better-auth/plugins"

export const auth = betterAuth({
  database: {
    type: "postgres",
    url: process.env.DATABASE_URL,
  },
  plugins: [
    passwordless(),
  ],
  emailAndPassword: {
    enabled: false, // no password auth
  },
})

// Route: POST /api/auth/magic-link/send
const { email } = await readBody(event)
await auth.api.signInWith.magicLink({
  email,
  callbackURL: "http://localhost:13000/auth/verify",
})
return { success: true, message: "Check your email" }

// Route: GET /auth/verify?token=xyz
// Better Auth handles verification automatically
```

### Alternative: Manual Implementation

```typescript
import { randomBytes } from "crypto"

// Send magic link
export const POST = handler(async (event) => {
  const { email } = await readBody(event)
  
  // Find or create user
  let user = await db.users.findOne({ email })
  if (!user) {
    user = await db.users.create({ email, name: null })
  }
  
  // Generate token
  const token = randomBytes(32).toString("hex")
  
  // Store in DB
  await db.magicTokens.create({
    id: generateId(),
    user_id: user.id,
    email,
    token,
    expires_at: new Date(Date.now() + 15 * 60 * 1000), // 15 min
  })
  
  // Send email
  await resend.emails.send({
    from: "auth@galatea.dev",
    to: email,
    subject: "Your login link",
    html: `<a href="http://localhost:13000/auth/verify?token=${token}">Click here to log in</a>`,
  })
  
  return { success: true }
})

// Verify token
export const GET = handler(async (event) => {
  const { token } = getQuery(event)
  
  // Find token
  const magicToken = await db.magicTokens.findOne({ token })
  if (!magicToken) {
    throw createError({ statusCode: 400, statusMessage: "Invalid token" })
  }
  
  // Check expiration
  if (new Date() > magicToken.expires_at) {
    throw createError({ statusCode: 400, statusMessage: "Link expired" })
  }
  
  // Check if already used
  if (magicToken.used_at) {
    throw createError({ statusCode: 400, statusMessage: "Link already used" })
  }
  
  // Mark as used
  await db.magicTokens.update(magicToken.id, { used_at: new Date() })
  
  // Create session
  const sessionId = generateToken()
  await db.sessions.create({
    id: sessionId,
    user_id: magicToken.user_id,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  })
  
  // Set cookie & redirect
  setCookie(event, "session_id", sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  })
  
  return sendRedirect(event, "/dashboard")
})
```

### Cost
- Free if self-hosted email (unlikely)
- Resend: $20-100/month (unlimited sends)
- SendGrid: Free tier (100/day), $20/month (10k/month)
- Nodemailer: Free (if you own SMTP server)

---

## 3. Better Auth (Full-Featured Auth Framework)

### What It Is
A **modern, all-in-one** authentication library for Node.js/TypeScript. Handles sessions, OAuth, magic links, 2FA, WebAuthn, social providers.

### How It Works

Better Auth manages the entire auth flow. You invoke it:

```
User clicks "Sign in with GitHub"
   ↓
Better Auth redirects to GitHub
   ↓
GitHub redirects to Better Auth callback
   ↓
Better Auth fetches user, creates DB entry, session
   ↓
User is authenticated
```

Or for magic links:

```
User enters email
   ↓
Better Auth generates token, sends email
   ↓
User clicks
   ↓
Better Auth verifies, creates session
```

### Implementation Effort

**Low-Medium** — 1 day to integrate with existing TanStack Start

Required:
- Install `better-auth` package
- Configure PostgreSQL connection
- Set environment variables (OAuth app creds)
- Add auth routes

### PostgreSQL Requirements

Better Auth **auto-generates schema** on first run. No manual SQL needed.

Tables created:
- `user` — base user data
- `account` — OAuth/provider accounts
- `session` — active sessions
- `verification` — email verification tokens
- (others depending on plugins)

### Pros
- **Modern library**: Designed for 2024+, actively maintained
- **Flexible**: Supports OAuth, magic links, passkeys, 2FA
- **PostgreSQL-native**: First-class PostgreSQL support
- **Plugins**: Extensible (email verification, organization, roles)
- **TypeScript**: Full type safety
- **No vendor lock-in**: Self-hosted auth logic, runs on your server
- **Replaces NextAuth**: Better Auth is the successor to NextAuth.js

### Cons
- **Newer project**: Less battle-tested than NextAuth
- **Learning curve**: Larger surface area than simple OAuth
- **Plugin ecosystem**: Smaller than NextAuth (but growing)
- **Documentation**: Still evolving

### Best For
- **New projects** wanting modern auth
- **Teams avoiding vendor lock-in**
- **Apps needing multiple auth methods** (OAuth + magic links + passkeys)
- **Future growth**: Has features for scaling (organizations, roles, 2FA)

### Maturity & Maintenance
- **Active development**: GitHub shows regular commits
- **Community**: Growing, but smaller than NextAuth
- **Long-term**: Appears stable, no signs of abandonment

### TanStack Start Integration

```typescript
// server/auth.ts
import { betterAuth } from "better-auth"

export const auth = betterAuth({
  database: {
    type: "postgres",
    url: process.env.DATABASE_URL,
  },
  secret: process.env.BETTER_AUTH_SECRET, // random 32+ char string
  basePath: "/api/auth",
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
  plugins: [
    passwordless(), // for magic links
  ],
})

// server/routes/api/auth/[...all].ts
export const POST = handler(async (event) => {
  return auth.handler(event)
})

export const GET = handler(async (event) => {
  return auth.handler(event)
})

// Client-side (React component)
import { useAuth } from "better-auth/react"

export default function LoginPage() {
  const { signInWith, signOut } = useAuth()
  
  return (
    <div>
      <button onClick={() => signInWith("github")}>
        Sign in with GitHub
      </button>
      <button onClick={() => signInWith("passwordless", { email: "user@example.com" })}>
        Sign in with email
      </button>
    </div>
  )
}
```

### Cost
- Free (open source)
- Hosting: Same as your app

---

## 4. OpenID Connect (OIDC) with Self-Hosted Identity Provider

### Overview

OIDC is a **modern authentication standard** built on OAuth 2.0. A self-hosted IdP (Identity Provider) like Authentik or Keycloak provides OIDC endpoints. Your app (client) redirects to the IdP, which handles login, then redirects back.

```
TanStack Start Client
    ↓
Authentik (self-hosted IdP)
    ↓
PostgreSQL + Redis (backing Authentik)
```

### Why OIDC Over OAuth?

| Aspect | OAuth 2.0 | OIDC |
|--------|----------|------|
| **Purpose** | Delegation (authorization) | Authentication + delegation |
| **Token type** | Access token only | ID token + access token |
| **User info** | Requires extra API call | Included in ID token (JWT) |
| **Standard** | Industry-wide | Newer, modern standard |
| **JSON vs XML** | Doesn't specify | JSON-based (easier) |

**OIDC is better for:**
- Apps that need user identity (not just authorization)
- Multiple clients (web, mobile, desktop) sharing same IdP
- Enterprise SSO scenarios
- Future scaling (easy to add multiple applications)

### Self-Hosted IdP: Authentik vs Keycloak

#### Authentik

**What it is**: Modern, lightweight OIDC/SAML IdP with visual flow builder

**Strengths**:
- Modern UI (admin console is beautiful, not intimidating)
- Visual flow builder (no YAML needed to customize)
- Lower resource footprint (suitable for small deployments)
- Kubernetes-friendly
- Active development
- PostgreSQL + Redis (proven stack)

**Weaknesses**:
- Newer (less battle-tested than Keycloak)
- Smaller plugin ecosystem
- Less documentation

**Resource requirements**:
- CPU: 2+ cores
- RAM: 2-4GB
- Storage: 20GB+ for logs and backups
- Services: PostgreSQL, Redis, Authentik container

**PostgreSQL integration**:
```yaml
# docker-compose.yml (example)
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: example
      POSTGRES_DB: authentik
    volumes:
      - postgres_data:/var/lib/postgresql/data

  authentik:
    image: ghcr.io/goauthentik/server:latest
    depends_on:
      - postgres
    environment:
      AUTHENTIK_POSTGRESQL__HOST: postgres
      AUTHENTIK_POSTGRESQL__NAME: authentik
      AUTHENTIK_POSTGRESQL__USER: postgres
      AUTHENTIK_POSTGRESQL__PASSWORD: example
      AUTHENTIK_REDIS__HOST: redis
```

**Implementation effort**: 3-5 days (including learning OIDC)
- 1 day: Deploy Authentik
- 1 day: PostgreSQL + Redis setup
- 1 day: Configure OIDC app in Authentik
- 2 days: Integrate with TanStack Start

#### Keycloak

**What it is**: Enterprise-grade OIDC/SAML IdP by Red Hat

**Strengths**:
- Battle-tested (used by major enterprises)
- Massive feature set (fine-grained authz, federation, LDAP)
- Rich plugin ecosystem
- Extensive documentation

**Weaknesses**:
- Complexity (console is overwhelming)
- Resource-heavy (Java, 4GB+ RAM recommended)
- Steeper learning curve
- More to maintain

**Resource requirements**:
- CPU: 4+ cores
- RAM: 4-8GB
- Storage: 30GB+
- Services: PostgreSQL, Keycloak (Java), Redis optional

**When to choose**:
- Enterprise with 100+ users
- Existing LDAP/Active Directory federation
- Fine-grained authorization requirements
- Dedicated identity team

**Implementation effort**: 5-10 days (learning curve is significant)

### OIDC Flow in TanStack Start

```
TanStack Start (client)
    ↓
User clicks "Sign in"
    ↓
Redirect to Authentik: https://idp.example.com/authorize?client_id=...
    ↓
User logs in on Authentik (password, MFA, social provider, etc.)
    ↓
Authentik redirects back to callback: https://app.example.com/auth/callback?code=xyz
    ↓
TanStack Start exchanges code for ID token + access token
    ↓
Extract user info from ID token (email, name, roles)
    ↓
Create session in PostgreSQL
    ↓
User is logged in
```

### Implementation Effort

**Medium** — 3-5 days

1. Deploy Authentik (1 day)
2. Configure OIDC app in Authentik (2-4 hours)
3. Integrate with TanStack Start (1-2 days)

### PostgreSQL Requirements

Authentik manages its own PostgreSQL schema (separate from your app).

Your app still needs:
```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  sub TEXT UNIQUE NOT NULL, -- OIDC subject claim
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  roles TEXT[], -- store roles from OIDC token
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  expires_at TIMESTAMP NOT NULL
);
```

### TanStack Start Integration (with Better Auth)

Better Auth has OIDC support:

```typescript
// server/auth.ts
import { betterAuth } from "better-auth"

export const auth = betterAuth({
  database: {
    type: "postgres",
    url: process.env.DATABASE_URL,
  },
  socialProviders: {
    authentik: {
      clientId: process.env.AUTHENTIK_CLIENT_ID!,
      clientSecret: process.env.AUTHENTIK_CLIENT_SECRET!,
      issuer: "https://idp.example.com", // Your Authentik instance
    },
  },
})
```

Or manually with OIDC client library:

```typescript
import { generators } from "openid-client"

// Redirect to Authentik
export const GET = handler(async (event) => {
  const state = generators.random()
  const nonce = generators.random()
  
  const authUrl = new URL("https://idp.example.com/authorize")
  authUrl.searchParams.set("client_id", process.env.AUTHENTIK_CLIENT_ID!)
  authUrl.searchParams.set("redirect_uri", "http://localhost:13000/auth/callback")
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("scope", "openid profile email")
  authUrl.searchParams.set("state", state)
  authUrl.searchParams.set("nonce", nonce)
  
  // Store state/nonce in session
  setCookie(event, "oidc_state", state, { httpOnly: true, sameSite: "lax" })
  setCookie(event, "oidc_nonce", nonce, { httpOnly: true, sameSite: "lax" })
  
  return sendRedirect(event, authUrl.toString())
})

// Callback handler
export const POST = handler(async (event) => {
  const { code } = await readBody(event)
  const state = getCookie(event, "oidc_state")
  
  // Verify state matches
  
  // Exchange code for tokens
  const tokenRes = await fetch("https://idp.example.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: process.env.AUTHENTIK_CLIENT_ID!,
      client_secret: process.env.AUTHENTIK_CLIENT_SECRET!,
      redirect_uri: "http://localhost:13000/auth/callback",
    }).toString(),
  })
  
  const { id_token, access_token } = await tokenRes.json()
  
  // Decode JWT (verify signature)
  const decoded = jwt.verify(id_token, process.env.AUTHENTIK_PUBLIC_KEY!)
  
  // Create/update user
  let user = await db.users.findOne({ sub: decoded.sub })
  if (!user) {
    user = await db.users.create({
      sub: decoded.sub,
      email: decoded.email,
      name: decoded.name,
    })
  }
  
  // Create session
  const sessionId = generateToken()
  await db.sessions.create({
    id: sessionId,
    user_id: user.id,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  })
  
  setCookie(event, "session_id", sessionId, { httpOnly: true, secure: true })
  
  return { success: true }
})
```

### Pros
- **Enterprise-ready**: Supports multiple apps (federation)
- **Standards-based**: OIDC is industry standard
- **Full control**: Self-hosted, data stays internal
- **Flexible**: Add new clients easily
- **Future-proof**: OIDC is where enterprise is moving

### Cons
- **Infrastructure overhead**: Need to manage Authentik + PostgreSQL + Redis
- **Setup complexity**: Authentik/Keycloak require learning
- **Maintenance**: Updates, monitoring, backups
- **Overkill for MVP**: Unnecessary complexity if you're just 3 people
- **Reliability**: If Authentik down, can't log in (though sessions continue)

### Best For
- **Enterprise growth plans** (100+ users in future)
- **Multiple applications** needing shared auth
- **SAML requirement** (compliance, large orgs)
- **Regulatory mandates** (healthcare, finance)
- **Organizations with dedicated ops/infra team**

### Maturity & Maintenance
- **Authentik**: Active, improving, growing adoption
- **Keycloak**: Battle-tested for 10+ years, enterprise-grade

---

## 5. SAML 2.0

### What It Is
SAML is an **older, XML-based** SSO standard. Primarily used in enterprise for workforce SSO (HR systems, CRM, etc.).

### Protocol Differences vs OIDC

| SAML | OIDC |
|------|------|
| XML assertions | JSON web tokens (JWT) |
| POST/Redirect Binding | HTTP Redirect + POST |
| Manual certificate management | Automatic key rotation (jwks_uri) |
| Verbose (kilobytes) | Compact (bytes) |
| 15+ years old | Modern (2014+) |

### When to Use SAML

You need SAML when:
1. **Enterprise mandate**: Customer requires SAML 2.0 support
2. **LDAP federation**: Connecting to Active Directory
3. **Legacy systems**: HR/payroll systems ship with SAML client
4. **Compliance**: Healthcare/finance regulations reference SAML

### When NOT to Use SAML

- **Small teams**: Use OAuth or magic links
- **Mobile-first**: OIDC is better
- **Cloud-native**: OIDC is simpler
- **No enterprise customers**: Skip it

### Implementation Effort

**High** — 5-10 days

- Certificate management complexity
- XML parsing/generation
- Binding mechanics (POST, Redirect)
- Debugging is harder (binary assertions in SAML)

### Self-Hosted SAML IdPs

Both Authentik and Keycloak support SAML:

```yaml
# Authentik: Configure as SAML provider
Provider Type: SAML
Entity ID: https://idp.example.com/api/v3/providers/saml/acs/
Binding: POST
Assertion Encryption: Yes
```

### PostgreSQL Requirements

Same as OIDC (IdP manages its own DB).

### Pros
- **Enterprise-standard**: Every large org knows SAML
- **Robust**: 15+ years of proven use
- **Assertion encryption**: Built-in (vs OIDC token encryption is optional)

### Cons
- **XML verbosity**: Large payloads
- **Certificate management**: Manual key rotation
- **Debugging**: Harder than JSON
- **Development complexity**: Fewer Node.js libraries
- **Not mobile-friendly**: OIDC is better

### Node.js SAML Libraries

- `passport-saml` — Passport strategy for SAML
- `saml2-js` — SAML library
- `xml-crypto` — XML signing/encryption

### Best For
- **Enterprise SaaS** serving Fortune 500 customers
- **Regulated industries** (healthcare, finance, government)
- **LDAP/AD federation** requirement
- **Organizations with dedicated security/IAM teams**

---

## 6. WebAuthn / Passkeys

### What It Is
**Passwordless biometric/hardware authentication** using WebAuthn standard. Users authenticate with fingerprint, face recognition, security key, or platform authenticator.

### How It Works

```
User enrolls (first time):
  → Creates passkey in authenticator (MacBook, iPhone, Windows, USB key)
  → Server stores public key
  
User logs in:
  → Clicks "Sign in with passkey"
  → Browser prompts for biometric/PIN
  → Authenticator signs challenge
  → Server verifies signature
  → User is logged in
```

### No Passwords Involved

Passkeys use **public-key cryptography**:
- User's authenticator (device) stores private key
- Server stores public key
- Server sends cryptographic challenge
- Device signs challenge with private key
- Server verifies signature

### Implementation Effort

**Medium-High** — 3-5 days for Phase 2 (after magic links)

Recommended approach:
1. **Phase 1**: Implement magic links (1-2 days)
2. **Phase 2**: Add WebAuthn (3-5 days later)
3. **Keep both**: Don't remove magic links; users without passkeys fall back

### PostgreSQL Requirements

```sql
CREATE TABLE passkeys (
  id TEXT PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  credential_id BYTEA UNIQUE NOT NULL,
  public_key BYTEA NOT NULL,
  sign_count BIGINT DEFAULT 0,
  transports TEXT[], -- 'usb', 'ble', 'nfc', 'internal'
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP
);
```

### Complexity

The actual WebAuthn is complex:
- **Registration**: User creates credential, server verifies attestation
- **Authentication**: User signs challenge, server verifies signature
- **Recovery**: If user loses device, needs backup (recovery codes, email)

### TanStack Start Integration

Use `@simplewebauthn` library (recommended):

```typescript
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server"

// 1. Start registration
export const POST = handler(async (event) => {
  const { email } = await readBody(event)
  
  const user = await db.users.findOne({ email })
  
  const options = await generateRegistrationOptions({
    rpID: "example.com",
    rpName: "Galatea",
    userID: Buffer.from(user.id.toString()),
    userName: user.email,
    userDisplayName: user.name || user.email,
    attestationType: "direct",
  })
  
  // Store challenge temporarily
  setCookie(event, "registration_challenge", options.challenge, {
    httpOnly: true,
  })
  
  return options
})

// 2. Verify & complete registration
export const POST = handler(async (event) => {
  const { credential, email } = await readBody(event)
  const challenge = getCookie(event, "registration_challenge")
  
  const user = await db.users.findOne({ email })
  
  const verification = await verifyRegistrationResponse({
    response: credential,
    expectedChallenge: challenge,
    expectedOrigin: "https://example.com",
    expectedRPID: "example.com",
  })
  
  if (verification.verified && verification.registrationInfo) {
    // Store passkey
    await db.passkeys.create({
      id: generateId(),
      user_id: user.id,
      credential_id: Buffer.from(
        verification.registrationInfo.credentialID,
        "utf-8"
      ),
      public_key: Buffer.from(
        verification.registrationInfo.credentialPublicKey,
        "utf-8"
      ),
    })
  }
  
  return { success: verification.verified }
})

// 3. Authenticate with passkey
export const POST = handler(async (event) => {
  const { email } = await readBody(event)
  
  const user = await db.users.findOne({ email })
  const passkeys = await db.passkeys.find({ user_id: user.id })
  
  const options = await generateAuthenticationOptions({
    rpID: "example.com",
    allowCredentials: passkeys.map((pk) => ({
      id: pk.credential_id,
      type: "public-key",
      transports: pk.transports as AuthenticatorTransport[],
    })),
  })
  
  setCookie(event, "auth_challenge", options.challenge, { httpOnly: true })
  
  return options
})

// 4. Verify authentication
export const POST = handler(async (event) => {
  const { credential, email } = await readBody(event)
  const challenge = getCookie(event, "auth_challenge")
  
  const user = await db.users.findOne({ email })
  const passkey = await db.passkeys.findOne({
    credential_id: credential.id,
  })
  
  const verification = await verifyAuthenticationResponse({
    response: credential,
    expectedChallenge: challenge,
    expectedOrigin: "https://example.com",
    expectedRPID: "example.com",
    credential: {
      id: passkey.credential_id,
      publicKey: passkey.public_key,
      counter: passkey.sign_count,
    },
  })
  
  if (verification.verified) {
    // Update counter
    await db.passkeys.update(passkey.id, {
      sign_count: verification.authenticationInfo?.newSignCount || 0,
      last_used_at: new Date(),
    })
    
    // Create session
    const sessionId = generateToken()
    await db.sessions.create({
      id: sessionId,
      user_id: user.id,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    
    setCookie(event, "session_id", sessionId, { httpOnly: true, secure: true })
  }
  
  return { success: verification.verified }
})
```

### Browser Support

| Browser | Support |
|---------|---------|
| Chrome 67+ | Yes |
| Firefox 60+ | Yes |
| Safari 13+ (macOS), 16+ (iOS) | Yes (platform authenticators) |
| Edge 18+ | Yes |
| Internet Explorer | No |

**Platform authenticators** (built-in):
- macOS: Touch ID
- Windows: Windows Hello
- iOS: Face ID / Touch ID
- Android: Fingerprint / Face ID

**Hardware authenticators**:
- YubiKey
- Google Titan
- Windows key (if enrolled)

### Pros
- **No passwords**: Most secure future-proof auth
- **Phishing-resistant**: Can't reuse credential on wrong site (origin binding)
- **User-friendly**: Biometric is faster than password
- **Standards-based**: WebAuthn is W3C standard

### Cons
- **Recovery complexity**: If user loses device, needs recovery mechanism
- **Browser support**: Not IE, limited mobile
- **Enrollment friction**: User must own compatible device
- **Backup/recovery**: Needs secondary auth method
- **Implementation complexity**: Lots of crypto, need `@simplewebauthn`

### Best For
- **Phase 2 feature** (after passwords/magic links established)
- **Security-conscious organizations**
- **Users with compatible devices**
- **Phishing-vulnerable environments** (healthcare, finance)

### Recommended Approach

**Layered authentication**:
1. Magic links (Phase 1) — works for everyone
2. WebAuthn (Phase 2) — upgrade for those with passkeys
3. Recovery codes — for when user loses device

---

## 7. Traditional Session Cookies + JWT (No IdP)

### What It Is
Users log in with email/password. You manage authentication directly. Sessions stored in PostgreSQL or JWT tokens signed by your server.

### How It Works (JWT)

```
User submits email + password
   ↓
Server validates password (argon2, scrypt, bcrypt)
   ↓
Server generates JWT: header.payload.signature
   ↓
Sends JWT in response
   ↓
Client stores in localStorage or cookie
   ↓
Client includes JWT in subsequent requests
   ↓
Server verifies signature
   ↓
User is authenticated
```

### Implementation Effort

**Low** — 1-2 days

You're managing everything yourself:
- User creation
- Password hashing
- Session/token generation
- Token verification

### PostgreSQL Requirements

```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, -- bcrypt/argon2
  name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Optional: if using session cookies instead of JWT
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL
);
```

### Code Example

```typescript
import { hash, verify } from "@node-rs/argon2"

// Sign up
export const POST = handler(async (event) => {
  const { email, password } = await readBody(event)
  
  // Hash password
  const passwordHash = await hash(password)
  
  // Create user
  const user = await db.users.create({
    email,
    password_hash: passwordHash,
  })
  
  return { success: true, userId: user.id }
})

// Sign in
export const POST = handler(async (event) => {
  const { email, password } = await readBody(event)
  
  const user = await db.users.findOne({ email })
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: "Invalid email" })
  }
  
  // Verify password
  const valid = await verify(user.password_hash, password)
  if (!valid) {
    throw createError({ statusCode: 401, statusMessage: "Invalid password" })
  }
  
  // Create session
  const sessionId = generateToken()
  await db.sessions.create({
    id: sessionId,
    user_id: user.id,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  })
  
  setCookie(event, "session_id", sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  })
  
  return { success: true, sessionId }
})

// Verify session
export const middleware = handler(async (event) => {
  const sessionId = getCookie(event, "session_id")
  
  const session = await db.sessions.findOne({ id: sessionId })
  if (!session || new Date() > session.expires_at) {
    throw createError({ statusCode: 401, statusMessage: "Not authenticated" })
  }
  
  // Attach user to event
  event.user = await db.users.findOne({ id: session.user_id })
})
```

### Pros
- **Simplest**: No external IdP, full control
- **Self-contained**: No vendor dependency
- **Works everywhere**: Web, mobile, desktop
- **Session persistence**: Store in DB, survive server restarts

### Cons
- **Password burden**: Users must create/remember passwords
- **Security burden**: Must hash correctly, handle reset tokens securely
- **No SSO**: Each app has separate login
- **Scaling limitation**: Doesn't work for federated identity (multiple apps)

### Best For
- **MVP/prototype**: Quick auth setup
- **Single application**: No federation needed
- **Internal tool**: Small team, high trust

---

## Comparison Table

| Feature | OAuth 2.0 | Magic Links | Better Auth | OIDC + Authentik | SAML | WebAuthn | Sessions + JWT |
|---------|-----------|-------------|-------------|------------------|------|----------|---|
| **Setup time** | 2-4h | 1-2d | 1d | 3-5d | 5-10d | 3-5d | 1-2d |
| **PostgreSQL needed** | Yes (user table) | Yes | Yes (auto) | Yes (separate) | Yes (separate) | Yes | Yes |
| **External dependency** | GitHub/GitLab | Email service | None | PostgreSQL+Redis | PostgreSQL+Redis | None | None |
| **No passwords** | Yes | Yes | Optional | Optional | Optional | Yes | No |
| **Enterprise-ready** | No | No | Medium | Yes | Yes | Medium | No |
| **Multiple apps SSO** | No | No | No | Yes | Yes | No | No |
| **Mobile-friendly** | Yes | Yes (email) | Yes | Yes | No | Varies | Yes |
| **Self-hosted** | N/A (provider) | Yes | Yes | Yes (IdP) | Yes (IdP) | Yes | Yes |
| **Vendor lock-in** | Medium | None | None | None | None | None | None |
| **Browser support** | All | All | All | All | All | Modern | All |
| **Maintenance** | None | Low | Low | Medium | Medium | Low | Medium |
| **Learning curve** | Low | Low | Medium | High | High | High | Low |

---

## Recommendation Summary

### For MVP (This Sprint)

Use **OAuth 2.0 (GitHub)** or **Magic Links**:
- 2-4 hours to deploy
- No IdP to manage
- PostgreSQL only
- Dead simple

### For Scalable Auth

Use **Better Auth + PostgreSQL**:
- 1 day to integrate
- Modern library, actively maintained
- Supports OAuth, magic links, passkeys plugins
- No vendor lock-in

### For Enterprise SSO (Future)

Use **Better Auth (client) + Authentik (IdP)**:
- 3-5 days to deploy
- Supports OIDC + SAML
- Self-hosted, full control
- Ready for 100+ users

### If Absolutely Need SAML

Use **Authentik in SAML mode** (not Keycloak for small team):
- Simpler than Keycloak
- PostgreSQL + Redis
- Visual configuration

---

## Next Steps

1. **Choose based on timeline**: OAuth (this sprint) vs Better Auth (next sprint)
2. **Plan Phase 2**: Add magic links if starting with OAuth
3. **Document secrets**: OAuth app creds, BETTER_AUTH_SECRET, database URL
4. **Set up monitoring**: Auth endpoint latency, failure rates
5. **Plan recovery**: Password reset, account recovery (email backup, recovery codes)

---

**Tags**: #authentication #sso #oidc #oauth #self-hosted #tanstack #better-auth #authentik #keycloak #saml #webauthn
