# Authentication Options Research for Galatea

**Date:** 2026-03-14
**Status:** Comprehensive comparison and recommendation
**Context:** Multi-channel AI agent system with internal dashboard, Discord integration, PWA tablet app, and API access

---

## Executive Summary

Galatea requires authentication that supports:
- **Web dashboard** (internal team, TanStack Start + React 19)
- **Discord bot integration** (external message sources, bot authentication + OAuth)
- **PWA guide app** (tablet control, offline capable)
- **API clients** (kiosk players, external integrations)

**Recommendation:** **Hybrid approach using Better Auth for web + session-based auth** as primary, with **JWT tokens for API clients**. This provides:
- Secure session management via HTTP-only cookies for web clients
- Token-based auth for external clients (Discord, kiosks)
- Single unified authentication infrastructure
- Native PostgreSQL + Drizzle integration
- Excellent Nitro/TanStack Start compatibility

---

## Part 1: Session-Based vs Token-Based Authentication

### Session-Based Authentication

#### How It Works
```
Client Request → Server validates credentials → Creates session in DB
Server sends back: Set-Cookie: sessionId=xyz
Subsequent requests include Cookie header with sessionId
Server verifies session exists in DB → Grants access
```

#### Pros
- **Perfect logout:** Instant revocation by deleting session from database
- **Security:** Session data is server-controlled, not sent to client
- **Stateful management:** Can track concurrent sessions, device history, login locations
- **CSRF protection:** Native through SameSite cookie attributes
- **Browser-friendly:** Works transparently with HTTP-only cookies
- **Reduced token size:** Cookie contains only session ID (typically 32-64 bytes)

#### Cons
- **Database latency:** Every request hits database to validate session (mitigated by in-memory caches like Redis)
- **Scaling complexity:** Distributed systems need shared session store
- **Not ideal for APIs:** Cookies are domain-bound, problematic for cross-domain/mobile scenarios
- **Server storage requirement:** Must maintain session data

#### Best For
- Single-domain web applications (web dashboard, PWA)
- Applications with strong security requirements
- Scenarios needing instant logout/revocation
- Desktop and web browsers

---

### Token-Based Authentication (JWT)

#### How It Works
```
Client sends credentials → Server validates → Creates signed JWT token
Server sends token to client
Client stores token (localStorage/sessionStorage/memory)
Client includes in Authorization header: Authorization: Bearer <token>
Server verifies signature → No database lookup needed (stateless)
```

#### Pros
- **Stateless:** No server-side session storage required
- **Scalability:** Works with load balancers, microservices, serverless
- **API-friendly:** Works across domains, perfect for mobile/SPA
- **Self-contained:** All information in token (user ID, roles, permissions)
- **Smaller database footprint:** No session table bloat
- **Cross-domain:** Can be sent to any domain/service

#### Cons
- **Revocation latency:** Token remains valid until expiration (even if deleted from system)
- **Token size:** Contains full user data, ~500-1000 bytes typically
- **No instant logout:** Must wait for token expiration or implement token blacklist (defeats stateless advantage)
- **Vulnerable to XSS:** If stored in localStorage (can be stolen by malicious JS)
- **Complexity:** Requires manual refresh token management
- **No session tracking:** Can't see how many devices a user is logged in on

#### Best For
- APIs and external clients
- Mobile applications
- Microservices architecture
- Cross-domain access
- Stateless/serverless environments

---

### Hybrid Approach (Recommended for Galatea)

Use **session-based authentication for web (dashboard + PWA)** and **JWT tokens for API clients**.

```
Web Users (dashboard, PWA):
  Login → Server creates session in PostgreSQL
  Response includes Set-Cookie: sessionId=xxx (HTTP-only)
  Browser automatically includes cookie in requests
  Fast validation via in-memory session cache

API Clients (Discord bot, kiosks):
  Login endpoint → Server creates JWT token
  Client stores token
  Client includes in Authorization header
  Server validates signature (stateless)
```

**Benefits:**
- Each client type gets ideal authentication method
- Security strengths of sessions for trusted clients
- Flexibility of tokens for untrusted external clients
- Single unified authentication backend
- PostgreSQL as single source of truth

---

## Part 2: Library/Framework Comparison

### Option 1: Better Auth (RECOMMENDED)

**Project Status:** Active, well-maintained (2026)
**Repository:** github.com/better-auth/better-auth
**Latest Version:** v1.x

#### Overview
Better Auth is a modern authentication library for full-stack applications. Designed specifically for frameworks like Next.js, Nuxt, and now Nitro. It replaces Auth.js/NextAuth.js with improved developer experience and modern patterns.

#### Key Features
- ✅ Nitro native integration
- ✅ PostgreSQL + Drizzle ORM support
- ✅ Session-based authentication via HTTP-only cookies
- ✅ OAuth2 and OIDC providers built-in
- ✅ Multi-factor authentication (MFA)
- ✅ Email verification
- ✅ Password management, reset flows
- ✅ Rate limiting
- ✅ Server-side session validation
- ✅ Database joins for performance (2-3x improvement)

#### Architecture with Galatea Stack

```typescript
// server/utils/auth.ts
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "~/server/db" // Drizzle client

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg", // PostgreSQL
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  socialProviders: {
    // OAuth for Discord, Google, GitHub, etc.
    github: {
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    },
  },
  session: {
    // Customize session behavior
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update DB every 24h
    absoluteLifetime: 60 * 60 * 24 * 30, // Expire after 30 days absolute
  },
})
```

#### Integration with TanStack Start

```typescript
// server/routes/auth/[...].ts (Better Auth creates routes auto-magically)
import { auth } from "~/server/utils/auth"

export default defineEventHandler(async (event) => {
  return auth.handler(event)
})

// In TanStack Start route beforeLoad:
export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const session = await getSession() // Helper function
    if (!session?.user) {
      throw redirect({ to: "/login" })
    }
    return { user: session.user }
  },
  component: Dashboard,
})

// Helper in app/lib/auth.ts:
import { useQuery } from "@tanstack/react-query"

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: () => fetch("/api/auth/get-session").then(r => r.json()),
  })
}
```

#### Database Schema
Automatically creates and manages:
- `user` table (id, email, name, emailVerified, image)
- `session` table (id, userId, token, expiresAt, ipAddress, userAgent)
- `account` table (for OAuth providers)
- `verification` table (for email/2FA verification codes)

#### API Endpoints (Auto-generated)
```
POST /api/auth/sign-in          # Login
POST /api/auth/sign-up          # Register
POST /api/auth/sign-out         # Logout
POST /api/auth/reset-password   # Password reset
GET  /api/auth/get-session      # Get current session
POST /api/auth/oauth/<provider> # OAuth callback
```

#### Implementation Complexity
- **Setup time:** 30 minutes (install, configure DB, add routes)
- **Learning curve:** Low (well-documented)
- **Code maintenance:** High (library handles most auth logic)

#### Pros
- ✅ Designed for Nitro/TanStack ecosystem
- ✅ Excellent PostgreSQL + Drizzle integration
- ✅ HTTP-only cookies for security
- ✅ Modern, actively maintained
- ✅ Database joins for 2-3x performance improvement
- ✅ Comprehensive feature set (MFA, OAuth, email verification)
- ✅ Type-safe with TypeScript
- ✅ Minimal configuration required

#### Cons
- ⚠️ Newer project (less battle-tested than NextAuth.js)
- ⚠️ Limited to Nitro/Next.js/Nuxt ecosystem
- ⚠️ No external service option (must self-host auth backend)
- ⚠️ Limited "headless" OAuth support compared to Auth0/Clerk

#### Cost
- Free (open source)

#### When to Choose
- You want native Nitro integration
- You're already using Drizzle + PostgreSQL
- You want session-based auth for web
- You don't want to manage external auth services
- You need fine-grained control over auth logic

---

### Option 2: Lucia Auth

**Project Status:** Stable but low-maintenance (mostly one maintainer)
**Repository:** github.com/lucia-auth/lucia
**Latest Version:** v3

#### Overview
Lucia is a minimal, unopinionated session-based authentication library. Think of it as a low-level building block rather than a full framework. You own the authentication logic entirely.

#### Key Features
- ✅ Pure session-based authentication
- ✅ Database adapter pattern (works with Drizzle)
- ✅ OAuth provider helpers (GitHub, Google, Discord, etc.)
- ✅ Password hashing utilities
- ✅ Session validation & refresh
- ⚠️ No built-in email verification
- ⚠️ No MFA out of the box
- ⚠️ No built-in rate limiting
- ⚠️ No UI components

#### Architecture Example

```typescript
// server/utils/auth.ts
import { Lucia, TimeSpan } from "lucia"
import { DrizzlePostgreSQLAdapter } from "lucia/adapters/drizzle"
import { db } from "~/server/db"
import { Session, User } from "~/server/db/schema"

const adapter = new DrizzlePostgreSQLAdapter(db, Session, User)

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    attributes: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
  },
  sessionExpiresIn: new TimeSpan(7, "d"), // 7 days
})

declare module "lucia" {
  interface Register {
    UserId: typeof User.$inferSelect.id
    DatabaseUserAttributes: typeof User.$inferSelect
  }
}
```

#### Database Schema (Manual)
You create the schema yourself:
```typescript
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  // Custom fields you add
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => user.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
})
```

#### Implementation Complexity
- **Setup time:** 2-4 hours (design schema, implement sign-in/sign-up/sign-out, handle tokens)
- **Learning curve:** Medium (requires understanding session management)
- **Code maintenance:** High (you own the auth logic)

#### Pros
- ✅ Minimal, unopinionated (you have full control)
- ✅ Works great with Drizzle + PostgreSQL
- ✅ No external dependencies (besides database)
- ✅ Good OAuth provider helpers
- ✅ Session-based (secure, revocable)
- ✅ Lightweight

#### Cons
- ⚠️ Very minimal feature set (no MFA, email verification, rate limiting)
- ⚠️ You must implement everything else (password reset, email confirmation)
- ⚠️ Small project (one maintainer, slower updates)
- ⚠️ Less ecosystem integration than Better Auth
- ⚠️ Steeper learning curve for beginners
- ⚠️ No TanStack Start specific helpers

#### Cost
- Free (open source)

#### When to Choose
- You want minimal, bare-bones authentication
- You enjoy owning all the logic
- You need a specific custom authentication flow
- You're building something non-standard
- You want to understand every line of auth code

---

### Option 3: Auth.js (NextAuth.js)

**Project Status:** Being superseded by Better Auth
**Repository:** github.com/nextauthjs/next-auth
**Latest Version:** v5

#### Overview
Auth.js is the industry standard for Next.js authentication, now positioned as framework-agnostic. However, it's being transitioned toward Better Auth for new projects.

#### Key Features
- ✅ Extensive OAuth provider support (50+ providers)
- ✅ Multiple database adapters
- ✅ Email provider support
- ✅ Callback-based customization
- ✅ JWT and session modes
- ⚠️ Primarily designed for Next.js
- ⚠️ Migration to v5 recommended for new projects

#### Pros
- ✅ Extremely mature and battle-tested
- ✅ Extensive provider ecosystem
- ✅ Comprehensive documentation
- ✅ Works with Nitro (but awkward)

#### Cons
- ⚠️ Overly complex for simple use cases
- ⚠️ Not optimized for Nitro
- ⚠️ Being phased out in favor of Better Auth
- ⚠️ v5 migration required for new projects
- ⚠️ Less TypeScript-friendly than Better Auth

#### Cost
- Free (open source)

#### When to Choose
- You're migrating an existing NextAuth.js application
- You need access to 50+ OAuth providers
- You absolutely need the battle-tested maturity
- (Otherwise: prefer Better Auth)

---

### Option 4: Clerk (Managed Service)

**Project Status:** Commercial SaaS, actively developed
**Website:** clerk.com
**Pricing:** Free tier + $99-499/mo production

#### Overview
Clerk is a managed authentication platform. They host the entire auth system—you integrate via SDKs and webhooks.

#### Key Features
- ✅ No auth backend to build/maintain
- ✅ Pre-built UI components
- ✅ Multi-factor authentication
- ✅ OAuth with 30+ providers
- ✅ Email & SMS verification
- ✅ Session management
- ✅ User management dashboard
- ✅ TanStack Start integration (`@clerk/tanstack-react-start`)

#### Architecture
```typescript
// Minimal code needed
import { ClerkProvider, SignedIn, SignedOut, UserButton } from "@clerk/react"

export function App() {
  return (
    <ClerkProvider publishableKey="pk_xxx">
      <SignedOut>
        <SignInButton />
      </SignedOut>
      <SignedIn>
        <UserButton />
      </SignedIn>
    </ClerkProvider>
  )
}
```

#### Implementation Complexity
- **Setup time:** 1-2 hours (config + integrate UI)
- **Learning curve:** Very low (mostly configuration)
- **Code maintenance:** Very low (managed service)

#### Pros
- ✅ Zero backend auth code
- ✅ Pre-built, beautiful UI
- ✅ Professional support
- ✅ SOC2 certified
- ✅ TanStack Start compatible
- ✅ Instant multi-device session management

#### Cons
- ⚠️ Monthly cost ($99-499)
- ⚠️ External dependency (vendor lock-in)
- ⚠️ Less control over authentication logic
- ⚠️ Not suitable for internal team-only apps (licensing)
- ⚠️ Data goes to external service

#### Cost
- **Free tier:** Up to 10,000 monthly active users
- **Production:** $99-499/month

#### When to Choose
- You want zero auth backend overhead
- You're building a B2B SaaS (their marketing focus)
- You don't mind external service dependency
- You have budget for managed service

---

### Option 5: DIY with TanStack Start Sessions

**Project Status:** Framework feature (not a library)
**Documentation:** tanstack.com/start/docs/framework/react/guide/authentication

#### Overview
TanStack Start provides session management as a framework feature. You can implement authentication using TanStack's built-in session utilities without a separate library.

#### Architecture
```typescript
// server/routes/api/auth/login.post.ts
import { setSession } from "~/server/sessions" // TanStack session utility

export default defineEventHandler(async (event) => {
  const { email, password } = await readBody(event)

  // Validate credentials
  const user = await db.user.findUnique({ where: { email } })
  if (!user) return sendError(event, createError({ status: 401 }))

  // Set session cookie
  await setSession(event, { userId: user.id, email: user.email })

  return { success: true }
})
```

#### Implementation Complexity
- **Setup time:** 4-8 hours (implement login, logout, session validation, password hashing)
- **Learning curve:** Medium (must understand HTTP sessions, cookies)
- **Code maintenance:** High (you maintain all logic)

#### Pros
- ✅ Zero external dependencies
- ✅ Full control
- ✅ Minimal code (for basic auth)
- ✅ Great for learning

#### Cons
- ⚠️ You must implement everything (password reset, email verification, OAuth, MFA)
- ⚠️ No ecosystem support (tools, UI components)
- ⚠️ Easy to get security details wrong
- ⚠️ Not recommended for production without deep security expertise
- ⚠️ No multi-provider support

#### Cost
- Free

#### When to Choose
- This is NOT recommended for Galatea (too many features needed)
- Only if you're building something extremely simple
- If you want to learn how auth works internally

---

## Part 3: Multi-User & API Access Patterns

### Internal Dashboard (Web Users)

**Requirements:**
- Multiple team members logging in
- Session-based (easy logout, instant revocation)
- Protected routes in TanStack Router
- Role-based access (admin, developer, viewer)

**Solution with Better Auth:**
```typescript
// Create users in Better Auth admin panel or via API
// Each user gets session via HTTP-only cookie
// TanStack Router protects routes:

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const res = await fetch("/api/auth/get-session")
    const session = await res.json()

    if (!session.user) {
      throw redirect({ to: "/login" })
    }

    if (session.user.role !== "admin" && session.user.role !== "dev") {
      throw new Error("Unauthorized")
    }

    return { user: session.user }
  },
})
```

### Discord Bot Integration

**Requirements:**
- Bot acts on behalf of team (not user-based)
- Authenticates via bot token OR OAuth token
- API calls from Discord bot to Galatea backend

**Solution:**

**Option A: Bot Token (Recommended)**
```typescript
// Discord.js already has bot token authentication
// Just validate token on each API request to Galatea

// In Galatea API:
export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, "authorization")
  if (authHeader !== `Bearer ${process.env.DISCORD_BOT_TOKEN}`) {
    throw createError({ status: 401, message: "Invalid bot token" })
  }
  // Proceed with request
})

// In Discord bot:
const config = {
  token: process.env.DISCORD_BOT_TOKEN,
  // ...
}

client.on("messageCreate", async (msg) => {
  const response = await fetch("https://galatea.local/api/agent/messages", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: msg.content }),
  })
})
```

**Option B: OAuth Token (For multi-bot scenarios)**
```typescript
// Use Discord OAuth to get user token, store in DB
// Bot can act on behalf of authenticated Discord users

const auth = betterAuth({
  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
    },
  },
})

// Endpoint to start Discord OAuth flow:
POST /api/auth/oauth/discord

// Callback returns user session + Discord access token
// Store token in user_metadata or separate table
// Bot uses stored token for API calls
```

### PWA Guide App (Tablet)

**Requirements:**
- Web-based PWA (React 19 in TanStack Start)
- Offline capability (service workers)
- Same authentication as dashboard (shared sessions)
- Syncs with server when online

**Solution:**
```typescript
// PWA uses same session-based auth as dashboard
// Service worker caches auth status + UI

// In service-worker.ts:
self.addEventListener("fetch", (event) => {
  if (event.request.url.includes("/api/auth/get-session")) {
    // Cache session for offline access
    return event.respondWith(
      caches.open("auth-cache").then((cache) => {
        return fetch(event.request).then((response) => {
          cache.put(event.request, response.clone())
          return response
        })
      })
    )
  }
})

// In React component:
function useOfflineAuth() {
  const isOnline = useOnlineStatus()
  const [cachedSession, setCachedSession] = useState(null)

  useEffect(() => {
    if (!isOnline && cachedSession) {
      // Use cached auth when offline
      return
    }

    // Fetch fresh auth when online
    fetch("/api/auth/get-session")
      .then(r => r.json())
      .then(setCachedSession)
  }, [isOnline])

  return cachedSession
}
```

### API Clients (Kiosk Players)

**Requirements:**
- External clients (kioskos, third-party apps)
- No browser environment (no cookies)
- Token-based authentication
- Per-client rate limiting
- Permanent tokens or refreshable tokens

**Solution with JWT:**

```typescript
// Issue JWT token to kiosk at setup time
export default defineEventHandler(async (event) => {
  const { clientId, clientSecret } = await readBody(event)

  // Validate credentials (registered in DB)
  const client = await db.apiClient.findUnique({ where: { clientId } })
  if (!client || client.secret !== clientSecret) {
    throw createError({ status: 401 })
  }

  // Issue JWT token
  const token = await jwt.sign(
    { clientId, type: "api" },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  )

  return { token }
})

// Kiosk stores token, includes in every request:
// Authorization: Bearer <jwt_token>

// Backend validates JWT:
export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, "authorization")
  const token = authHeader?.replace("Bearer ", "")

  if (!token) throw createError({ status: 401 })

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    event.context.client = decoded
  } catch (err) {
    throw createError({ status: 401, message: "Invalid token" })
  }
})

// Rate limiting per client:
export default defineEventHandler(async (event) => {
  const clientId = event.context.client.clientId
  const key = `ratelimit:${clientId}`

  const count = await redis.incr(key)
  if (count === 1) {
    await redis.expire(key, 60) // Reset every minute
  }

  if (count > 100) {
    throw createError({ status: 429, message: "Rate limited" })
  }
})
```

**Alternative: Permanent API Keys**
```typescript
// Generate random API key for kiosk at setup
const apiKey = crypto.randomUUID()

// Store with metadata
await db.apiKey.create({
  data: {
    key: apiKey,
    clientId: "kiosk-1",
    rateLimit: 100, // per minute
    createdAt: new Date(),
  },
})

// Kiosk includes in header:
// Authorization: Bearer <api_key>

// Backend validates:
export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, "authorization")
  const key = authHeader?.replace("Bearer ", "")

  const apiKey = await db.apiKey.findUnique({ where: { key } })
  if (!apiKey) throw createError({ status: 401 })

  event.context.client = { clientId: apiKey.clientId }
})
```

---

## Part 4: PWA Offline Considerations

### Challenge: Offline Authentication

PWAs need to work offline, but authentication typically requires server validation. Here's how to handle it:

#### Approach 1: Cache Session, Validate When Online

```typescript
// Store session in IndexedDB (survives offline)
import { openDB } from "idb"

async function cacheSession(session: Session) {
  const db = await openDB("galatea")
  await db.put("session", { ...session, cachedAt: Date.now() })
}

// On app startup
async function initAuth() {
  // Try to fetch fresh session
  try {
    const response = await fetch("/api/auth/get-session")
    const session = await response.json()
    cacheSession(session)
    return session
  } catch (err) {
    // Offline: use cached session
    const db = await openDB("galatea")
    const cached = await db.get("session", "current")
    if (cached) {
      return cached
    }
    // No cached session, show login
    throw new Error("Not authenticated")
  }
}
```

#### Approach 2: Service Worker Caching

```typescript
// In service-worker.ts
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)

  // For auth endpoints, use cache-first strategy
  if (url.pathname.includes("/api/auth/")) {
    return event.respondWith(
      caches.open("auth-v1").then((cache) => {
        return cache.match(event.request).then((response) => {
          if (response) return response // Return cached

          return fetch(event.request)
            .then((response) => {
              cache.put(event.request, response.clone())
              return response
            })
            .catch(() => {
              // Offline: return cached or error
              return cache.match(event.request) ||
                new Response("Offline", { status: 503 })
            })
        })
      })
    )
  }
})
```

#### Approach 3: Device Token (No Server Verification Offline)

```typescript
// On successful login, store device token locally
async function login(email: string, password: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
  const { sessionId, deviceToken } = await response.json()

  // Store device token (browser/local validation)
  localStorage.setItem("deviceToken", deviceToken)

  // When offline, validate using local signature
  function validateOfflineToken() {
    const token = localStorage.getItem("deviceToken")
    return verifySignature(token) // Client-side validation
  }
}
```

#### Recommended for Galatea

Use **Approach 1 (Cache + Validate When Online)**:
- Cache session in IndexedDB after successful login
- When offline, use cached session with visual indicator: "Offline mode - read-only"
- When online, validate and refresh session
- Disable write operations when offline or in read-only mode

```typescript
// In React component
function useAuthWithOfflineSupport() {
  const [session, setSession] = useState(null)
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  useEffect(() => {
    initAuth().then(setSession)
  }, [isOffline])

  return { session, isOffline, canWrite: !isOffline }
}
```

---

## Part 5: Migration Path from Current Public Access

### Current State
- Galatea API is currently **unauthenticated**
- All endpoints publicly accessible
- No user concept

### Migration Strategy: Phased Rollout

#### Phase 1: Add Authentication Layer (Non-Breaking)

```typescript
// Add optional auth header support
export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, "authorization")

  if (authHeader) {
    // Validate token/session
    try {
      event.context.user = validateAuth(authHeader)
    } catch (err) {
      return sendError(event, createError({ status: 401 }))
    }
  } else {
    // Allow public access (for now)
    event.context.user = null
  }

  // Log unauthenticated access
  if (!event.context.user) {
    console.warn(`Unauthenticated access: ${event.node.req.method} ${event.node.req.url}`)
  }
})
```

**Status:** Backward compatible. Unauthenticated requests still work.

#### Phase 2: Add Dashboard with Authentication

```typescript
// New internal-only routes
export default defineEventHandler(async (event) => {
  const session = await getSession(event)

  if (!session?.user) {
    throw redirect({ to: "/login" })
  }

  // Internal dashboard only
  return { authenticated: true, user: session.user }
})
```

**Status:** New authenticated routes alongside public API.

#### Phase 3: Add API Keys for External Clients

```typescript
// Create API key system for Discord bot, kioskos
// Each external client registers and gets a key

await db.apiKey.create({
  data: {
    name: "Discord Bot",
    key: crypto.randomUUID(),
    clientId: "discord-bot",
    rateLimit: 100,
  },
})

// Clients include key in requests
// curl -H "Authorization: Bearer <key>" https://galatea.local/api/...
```

**Status:** External clients transition to API keys.

#### Phase 4: Deprecate Public Access (Optional)

```typescript
// Once all clients use auth, add rate limiting to unauthenticated requests
export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, "authorization")

  if (!authHeader) {
    // Rate limit unauthenticated: 10 req/min from IP
    const rateLimit = await checkRateLimit(event.node.req.socket.remoteAddress, 10, 60)
    if (!rateLimit.allowed) {
      throw createError({ status: 429, message: "Rate limited - use API key" })
    }
  }
})
```

**Status:** Unauthenticated access still works but heavily rate-limited.

#### Phase 5: Require Authentication (Breaking)

```typescript
// Require auth for all endpoints
export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, "authorization")
  const session = await getSession(event)

  if (!authHeader && !session) {
    throw createError({ status: 401, message: "Authentication required" })
  }
})
```

**Status:** Breaking change. All clients must use authentication.

### Timeline
- **Week 1:** Phase 1 (add optional auth)
- **Week 2-4:** Phase 2 (build dashboard, test auth)
- **Week 4:** Phase 3 (issue API keys to external clients)
- **Month 2:** Phase 4 (rate limit public access)
- **Month 3:** Phase 5 (require auth)

---

## Part 6: Comparison Table

| Aspect | Better Auth | Lucia Auth | Auth.js | Clerk | DIY |
|--------|------------|-----------|---------|-------|-----|
| **Setup Time** | 30 min | 2-4 hours | 1-2 hours | 1-2 hours | 4-8 hours |
| **Learning Curve** | Low | Medium | Medium | Very Low | Medium-High |
| **Nitro Integration** | ✅ Native | ⚠️ Adapter | ⚠️ Partial | ✅ SDK | ✅ Manual |
| **TanStack Start** | ✅ Great | ⚠️ Good | ✅ Good | ✅ Great | ✅ Good |
| **PostgreSQL** | ✅ Excellent | ✅ Excellent | ✅ Good | ✅ Supported | ✅ Manual |
| **Drizzle ORM** | ✅ Native | ✅ Native | ⚠️ Adapter | N/A | ✅ Manual |
| **Session-Based** | ✅ Default | ✅ Only | ✅ Both | ✅ Yes | ✅ Manual |
| **Token-Based (JWT)** | ⚠️ Via sessions | ❌ No | ✅ Yes | ⚠️ Limited | ✅ Manual |
| **OAuth Providers** | 20+ | Helpers only | 50+ | 30+ | Manual |
| **Email Verification** | ✅ Built-in | ❌ Manual | ✅ Built-in | ✅ Built-in | ❌ Manual |
| **MFA Support** | ✅ Built-in | ❌ Manual | ✅ Built-in | ✅ Built-in | ❌ Manual |
| **Rate Limiting** | ✅ Built-in | ❌ Manual | ❌ Manual | ✅ Built-in | ❌ Manual |
| **Password Reset** | ✅ Built-in | ❌ Manual | ✅ Built-in | ✅ Built-in | ❌ Manual |
| **UI Components** | ❌ No | ❌ No | ❌ No | ✅ Pre-built | ❌ No |
| **Cost** | Free | Free | Free | Free/$99-499 | Free |
| **External Service** | ❌ No | ❌ No | ❌ No | ✅ Yes | ❌ No |
| **Vendor Lock-in** | Low | Low | Low | High | None |
| **Type Safety** | ✅ Excellent | ✅ Excellent | ✅ Good | ✅ Good | Manual |
| **Maintenance Burden** | Low | Medium | Medium | Very Low | High |
| **Community Size** | Growing | Small | Large | Large | N/A |
| **Production Ready** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ If done right |

---

## Part 7: Recommended Architecture for Galatea

### Stack Selection: Better Auth + JWT Hybrid

```
┌─────────────────────────────────────────────────────────────┐
│                   GALATEA AUTHENTICATION                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Web Users (Dashboard + PWA)                                 │
│  ├── Login form → /api/auth/sign-in                          │
│  ├── Server creates session in PostgreSQL                    │
│  ├── Response includes Set-Cookie: sessionId (HTTP-only)     │
│  ├── Browser auto-includes cookie in requests                │
│  ├── TanStack Router validates session before loading routes │
│  └── Logout: DELETE /api/auth/sign-out (revokes session)     │
│                                                               │
│  Discord Bot & External Clients                             │
│  ├── Register client → Issue JWT token                       │
│  ├── Token includes: { clientId, type: "api", exp: ... }     │
│  ├── Client includes: Authorization: Bearer <token>          │
│  ├── Server validates signature (stateless)                  │
│  └── Token expires after 30 days                             │
│                                                               │
│  PWA Offline                                                  │
│  ├── Cache session in IndexedDB after login                  │
│  ├── Service worker: cache-first for /api/auth/*             │
│  ├── Offline: use cached session, read-only mode             │
│  └── Online: sync and refresh auth state                     │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Structure

```
server/
├── utils/
│   ├── auth.ts              # Better Auth instance
│   ├── jwt.ts               # JWT token generation/validation
│   └── rate-limit.ts        # Rate limiting middleware
├── routes/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── [...].ts     # Better Auth routes (sign-in, sign-out, etc.)
│   │   │   └── api-key.post.ts  # Issue API keys for external clients
│   │   ├── agent/
│   │   │   ├── messages.post.ts # Requires auth header or session
│   │   │   ├── tick.post.ts
│   │   │   └── ...
│   │   └── health.get.ts    # No auth (status page)
│   └── middleware/
│       ├── auth.ts          # Attach user to event context
│       └── rate-limit.ts    # Rate limiting per client
├── db/
│   ├── schema.ts            # Includes Better Auth tables
│   └── seed.ts
└── ...

app/
├── routes/
│   ├── login.tsx            # Login form (public)
│   ├── dashboard.tsx        # Protected (beforeLoad checks session)
│   └── guide.tsx            # PWA guide (protected)
├── lib/
│   ├── auth.ts              # useSession hook, session queries
│   └── offline.ts           # IndexedDB caching, offline detection
└── ...
```

### Database Schema (Better Auth + Custom)

```typescript
// Automatically created by Better Auth
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  emailVerified: timestamp("email_verified"),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => user.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
})

// Custom additions
export const apiKey = pgTable("api_key", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  key: text("key").notNull().unique(),
  clientId: text("client_id").notNull(), // "discord-bot", "kiosk-1", etc.
  rateLimit: integer("rate_limit").default(100), // per minute
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"), // Optional expiration
})

export const apiKeyAccess = pgTable("api_key_access", {
  id: text("id").primaryKey(),
  apiKeyId: text("api_key_id").references(() => apiKey.id),
  method: text("method"), // GET, POST, etc.
  path: text("path"),     // /api/agent/messages, etc.
  timestamp: timestamp("timestamp").defaultNow(),
})
```

### Environment Variables

```env
# Better Auth
BETTER_AUTH_SECRET=your-secret-key
BETTER_AUTH_URL=http://localhost:13000

# JWT for API tokens
JWT_SECRET=your-jwt-secret

# OAuth providers (optional)
GITHUB_ID=xxx
GITHUB_SECRET=xxx
DISCORD_CLIENT_ID=xxx
DISCORD_CLIENT_SECRET=xxx

# Database
DATABASE_URL=postgres://user:pass@localhost:5432/galatea

# External clients
DISCORD_BOT_TOKEN=your-bot-token
```

### API Usage Examples

#### Web Dashboard (Session)
```typescript
// In TanStack Start server function
export const getSessionAction = createServerFn({
  handler: async (context) => {
    return await getSession()
  },
})

// In React component
function Dashboard() {
  const session = useQuery(getSessionAction)

  if (!session.data?.user) {
    return <Navigate to="/login" />
  }

  return <div>Welcome, {session.data.user.email}</div>
}
```

#### Discord Bot (JWT)
```typescript
// Send message to Galatea API
const token = process.env.DISCORD_BOT_JWT_TOKEN

await fetch("http://localhost:13000/api/agent/messages", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    agentId: "dev-1",
    message: "Check the build status",
  }),
})
```

#### Kiosk Player (API Key)
```typescript
// Store API key from setup
const apiKey = "sk_xxx_yyy_zzz"

// Request control action
await fetch("http://localhost:13000/api/agent/messages", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    agentId: "guide-1",
    message: "Next slide",
  }),
})
```

---

## Part 8: Implementation Roadmap

### Week 1: Setup & Core Auth
- [ ] Install Better Auth, JWT library
- [ ] Create database schema (Better Auth + custom tables)
- [ ] Create `/api/auth/[...]` routes (Better Auth)
- [ ] Create `/api/auth/api-key` endpoint
- [ ] Create middleware for session/token validation
- [ ] Write tests for auth flow

### Week 2: Web Frontend
- [ ] Create login page (form + email)
- [ ] Integrate TanStack Router with session checks
- [ ] Create `useSession` hook for React
- [ ] Protect dashboard routes
- [ ] Add logout button

### Week 3: PWA Offline
- [ ] Add IndexedDB caching for session
- [ ] Create service worker with auth caching
- [ ] Add offline mode detection
- [ ] Show "offline" badge in UI
- [ ] Disable write operations when offline

### Week 4: API Clients
- [ ] Create JWT token generation for Discord bot
- [ ] Update Discord bot to use JWT token
- [ ] Create API key management UI
- [ ] Issue API keys to kiosk clients
- [ ] Update API endpoints to validate tokens

### Week 5: Testing & Docs
- [ ] Integration tests: login → session → protected route
- [ ] Integration tests: JWT token → API call
- [ ] E2E tests: Discord bot → API
- [ ] Document API authentication
- [ ] Write client library for API calls

---

## Summary & Recommendation

### For Galatea, Choose: **Better Auth + JWT Hybrid**

**Why:**
1. **Perfect fit:** Native Nitro integration, works great with TanStack Start
2. **PostgreSQL + Drizzle:** Designed for your stack
3. **Security:** HTTP-only cookies, session-based for web
4. **Flexibility:** Same library handles web sessions + can issue JWT for APIs
5. **Low overhead:** 30 minute setup, built-in email verification, MFA, password reset
6. **Community:** Growing, actively maintained, modern patterns
7. **Cost:** Free, no external service dependency

### Alternative If You Need...

- **Maximum simplicity (just web):** Lucia Auth
- **Zero auth backend code:** Clerk ($99-500/month)
- **50+ OAuth providers:** Auth.js (but transition to Better Auth)
- **Full control, learning project:** DIY (not recommended)

### Quick Wins to Start
1. Install Better Auth: `pnpm add better-auth`
2. Add schema to Drizzle
3. Create `/api/auth/[...]` routes
4. Add login page
5. Protect dashboard routes
6. Deploy, onboard team

---

## Sources

- [Authentication | TanStack Start React Docs](https://tanstack.com/start/latest/docs/framework/react/guide/authentication)
- [TanStack Start Authentication Patterns](https://tanstack.com/start/latest/docs/framework/react/examples/start-basic-auth)
- [Nitro Integration | Better Auth](https://better-auth.com/docs/integrations/nitro)
- [Drizzle ORM Adapter | Better Auth](https://better-auth.com/docs/adapters/drizzle)
- [JWTs vs. sessions: which authentication approach is right for you? | Stytch](https://stytch.com/blog/jwts-vs-sessions-which-is-right-for-you/)
- [Session vs Token Based Authentication | Authgear](https://www.authgear.com/post/session-vs-token-authentication)
- [Offline storage for PWAs | LogRocket Blog](https://blog.logrocket.com/offline-storage-for-pwas/)
- [How to Make Your PWA Work Offline | Simicart](https://simicart.com/blog/pwa-offline/)
- [OAuth2 - Discord Documentation](https://discord.com/developers/docs/topics/oauth2)
- [Top 5 authentication solutions for secure TanStack Start apps in 2026 | WorkOS](https://workos.com/blog/top-authentication-solutions-tanstack-start-2026)
