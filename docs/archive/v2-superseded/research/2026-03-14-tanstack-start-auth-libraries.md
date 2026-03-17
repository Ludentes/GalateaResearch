# TanStack Start Authentication Libraries Research

**Date:** 2026-03-14
**Status:** Comprehensive library and integration comparison
**Context:** Galatea stack (TanStack Start v1, PostgreSQL, Drizzle ORM, self-hosted infrastructure)

---

## Executive Summary

For Galatea's **hybrid authentication needs** (web dashboard + PWA + Discord + API clients):

| Requirement | Best Fit | Alternative |
|-------------|----------|-------------|
| **Primary web auth** | Better Auth (with TanStack plugin) | Auth.js |
| **API token support** | Better Auth (JWT + session plugin) | Custom implementation |
| **Self-hosted option** | Better Auth self-hosted + Authentik OIDC | Custom + Authentik |
| **Drizzle integration** | Better Auth (native adapter) | Supabase (no Drizzle needed) |
| **Enterprise SSO** | Authentik (self-hosted) | Clerk or Auth0 (cloud) |
| **Easiest setup** | Clerk (but SaaS-locked) | Supabase (bundled backend) |

**Recommendation for Galatea:** **Better Auth + TanStack Start cookies plugin** as primary solution:
- ✅ Native Drizzle ORM support
- ✅ Session + JWT token support for hybrid architecture
- ✅ TanStack Start cookies plugin handles SSR cookie management automatically
- ✅ Can be self-hosted (open-source)
- ✅ Integrates with Authentik via OAuth for federated identity
- ✅ Lightweight (~300KB tree-shakeable)

---

## Part 1: TanStack Start Authentication Architecture

### Native Capabilities

TanStack Start comes with **built-in session management** that doesn't require external libraries for basic auth:

```typescript
// TanStack Start native session API
import { useSession } from '@tanstack/react-start/server'

// In root layout or middleware
const session = await useSession({
  name: 'galatea-session',
  password: process.env.SESSION_SECRET!, // Required for production
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  },
})
```

**Pros:**
- Zero external dependencies
- Type-safe with TypeScript generics
- Server functions handle sessions automatically
- Works with any database (Drizzle, Prisma, etc.)

**Cons:**
- Requires manual password hashing (bcrypt, argon2)
- Manual OAuth/OAuth 2.0 integration needed
- No pre-built UI components
- Session lookup adds database latency per request

**When to use:** Early prototypes, simple internal tools, fully custom implementations.

---

## Part 2: Production-Ready Libraries

### 1. Better Auth (⭐ Recommended for Galatea)

**Overview:** Modern authentication library built for full-stack JavaScript with first-class TanStack Start support.

**Key Facts:**
- Open-source (MIT license)
- ~300KB tree-shaken
- Maintains Auth.js (formerly NextAuth) after acquisition
- Active development with frequent updates
- Excellent TypeScript support
- **v1.0.0 released 2025**

#### TanStack Start Integration

```typescript
// 1. Setup Better Auth handler at server/api/auth/$.ts
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "@/server/db"
import { NextRequest } from "next/server"

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db),
  plugins: [
    // TanStack Start specific cookie handling
    tanstackStartCookies(),
  ],
  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    },
    github: { /* optional */ },
  },
})

// 2. Use in server functions
import { createServerFn } from '@tanstack/react-start'

export const getSession = createServerFn({ method: 'GET' })(async () => {
  const session = await auth.api.getSession({
    headers: getRequestHeaders(),
  })
  return session
})

// 3. Protected routes via beforeLoad
const protectedRoute = {
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: '/login' })
    }
    return { session }
  },
}
```

#### Database Support (Native Drizzle)

```typescript
// Better Auth automatically creates these Drizzle tables:
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  name: text('name'),
  image: text('image'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull(),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  accountId: text('account_id').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refreshToken: text('refresh_token'),
  accessToken: text('access_token'),
  expiresAt: timestamp('expires_at'),
  tokenType: text('token_type'),
  scope: text('scope'),
  idToken: text('id_token'),
  sessionState: text('session_state'),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
})
```

#### JWT + Session Hybrid (for API clients)

```typescript
// Better Auth supports both simultaneously
export const auth = betterAuth({
  // ... config
  session: {
    provider: "database",  // Store sessions in DB (immediate logout)
    cookieCache: {
      enabled: true,       // Cache session in memory (reduce DB hits)
    }
  },
  // Enable JWT for API clients
  jwtSecret: process.env.JWT_SECRET,
  plugins: [
    tanstackStartCookies(),
    // Custom JWT plugin for API clients
    {
      id: "jwt-api",
      hooks: {
        "after:signIn": async (ctx) => {
          // Issue JWT for API access
          const token = jwt.sign({ userId: ctx.user.id }, process.env.JWT_SECRET, {
            expiresIn: "15m",
          })
          return {
            ...ctx,
            data: { ...ctx.data, apiToken: token },
          }
        }
      }
    }
  ]
})
```

#### Strengths for Galatea

| Need | How Better Auth Solves It |
|------|---------------------------|
| **Web dashboard + PWA** | Session-based auth with secure HTTP-only cookies |
| **Discord integration** | Built-in Discord OAuth provider; plug in creds |
| **API clients (kiosks)** | Supports JWT tokens + refresh tokens simultaneously |
| **Drizzle ORM** | Native adapter; zero manual table definition |
| **Multi-tenant** | User roles/permissions via standard account fields |
| **Self-hosted** | Open-source; can run locally or on self-hosted infra |
| **Token rotation** | Built-in refresh token rotation with configurable TTL |
| **Logout revocation** | Session in DB → instant invalidation |
| **PostgreSQL** | Native PostgreSQL support (not limited to any DB) |

#### Weaknesses

- Requires setup of Discord OAuth app (minor friction)
- Cookies plugin is TanStack-specific (learn once, use once)
- Ecosystem still maturing (v1.0 is recent)
- Smaller community than Auth.js/NextAuth

#### Cost

**Free.** Open-source MIT license. Can self-host or use Vercel deployment.

---

### 2. Auth.js (NextAuth v5)

**Overview:** Established authentication library for Next.js/TanStack Start. Maintained by Better Auth team.

**Key Facts:**
- Open-source (ISC license)
- Battle-tested (used by thousands)
- Now part of Better Auth ecosystem
- **v5 released 2024** (modern rewrite)
- TypeScript-first
- Larger ecosystem than Better Auth

#### TanStack Start Example (from official docs)

```typescript
// app/routes/api/auth/$.ts
import { auth } from "@/server/auth"

export const handler = ({ request }) => {
  return auth(request)
}
```

#### Drizzle Adapter

```typescript
import { DrizzleAdapter } from "@auth/drizzle-adapter"

export const auth = Auth({
  adapter: DrizzleAdapter(db),
  secret: process.env.AUTH_SECRET,
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
    }),
  ],
})
```

#### Strengths for Galatea

| Aspect | Rating | Notes |
|--------|--------|-------|
| **TanStack Start support** | ⭐⭐⭐⭐⭐ | Official example available |
| **Drizzle integration** | ⭐⭐⭐⭐ | Official adapter, well-maintained |
| **JWT support** | ⭐⭐⭐ | Possible but not primary flow |
| **Self-hosted** | ⭐⭐⭐ | Open-source, can self-host |
| **Community** | ⭐⭐⭐⭐⭐ | Large ecosystem, many tutorials |
| **Maturity** | ⭐⭐⭐⭐⭐ | Used in production by many |

#### Weaknesses

- More opinionated than Better Auth (less flexible)
- Larger bundle size (~400KB vs Better Auth ~300KB)
- JWT handling is secondary concern (designed for sessions)
- OAuth provider list is large but adds weight

#### Cost

**Free.** Open-source. Self-hostable.

---

### 3. Clerk

**Overview:** Enterprise-grade authentication with pre-built UI components. SaaS-only, no self-hosting.

**Key Facts:**
- Commercial SaaS (freemium pricing)
- Pre-built React components (copypaste-ready)
- 10,000 MAUs free, then $0.02/MAU
- Best-in-class DX for rapid prototyping
- **TanStack Start quickstart available**
- Not self-hostable

#### Setup (Simplest)

```bash
npm install @clerk/tanstack-react-start
```

```typescript
// Root layout
import { ClerkProvider } from '@clerk/tanstack-react-start'

export default function RootLayout() {
  return (
    <ClerkProvider>
      <Outlet />
    </ClerkProvider>
  )
}

// Protected route
import { useAuth } from '@clerk/tanstack-react-start'

const ProtectedPage = () => {
  const { isLoaded, userId } = useAuth()

  if (!isLoaded) return <div>Loading...</div>
  if (!userId) return <RedirectToSignIn />

  return <div>Authenticated content</div>
}
```

#### Strengths for Galatea

| Aspect | Rating | Notes |
|--------|--------|-------|
| **Setup speed** | ⭐⭐⭐⭐⭐ | Fastest path to login form |
| **Pre-built UI** | ⭐⭐⭐⭐⭐ | Professional UI out-of-box |
| **TanStack Start** | ⭐⭐⭐⭐ | Official support + examples |
| **Discord OAuth** | ⭐⭐⭐⭐ | Automatic provider support |
| **User management** | ⭐⭐⭐⭐⭐ | Dashboard, permissions, roles |
| **Enterprise SSO** | ⭐⭐⭐⭐⭐ | SAML, OIDC (premium feature) |

#### Weaknesses for Galatea

- **No self-hosting** — violates your infrastructure preference
- **Vendor lock-in** — UI components tightly coupled to Clerk
- **Cost scales** — 100,000 MAUs = $2,000/month
- **Data residency** — User data stored on Clerk servers
- **Not suitable** for Discord bot + internal kiosk scenario

#### Cost

```
Free:      10,000 MAUs
Paid:      $0.02 per MAU (after free tier)
At scale:  100,000 MAUs = $2,000/month
```

**Verdict for Galatea:** ❌ Not recommended (self-hosting requirement).

---

### 4. Supabase Auth

**Overview:** Bundled authentication + database backend. Good if migrating from another provider.

**Key Facts:**
- Open-source (Apache 2.0 for library, proprietary for hosting)
- Freemium SaaS + self-hostable
- Includes PostgreSQL database + auth + realtime
- Built on PostgreSQL + PostgREST
- JWT-based (stateless)
- 50,000 MAUs free tier

#### Setup with TanStack Start

```typescript
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
)

// In server function
import { createServerFn } from '@tanstack/react-start'

export const signUp = createServerFn({ method: 'POST' })(async (email, password) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  })
  return { data, error }
})
```

#### Strengths for Galatea

| Aspect | Rating | Notes |
|--------|--------|-------|
| **All-in-one** | ⭐⭐⭐⭐ | Auth + DB in one package |
| **Self-hostable** | ⭐⭐⭐⭐ | Full open-source deployment |
| **PostgreSQL** | ⭐⭐⭐⭐⭐ | Uses PostgreSQL (you already have it) |
| **JWT support** | ⭐⭐⭐⭐⭐ | Primary flow, perfect for APIs |
| **Real-time** | ⭐⭐⭐⭐ | Built-in (though you're using FalkorDB) |
| **Cost** | ⭐⭐⭐⭐⭐ | 50K MAUs free; $25/month minimum |

#### Weaknesses for Galatea

- **Overkill** — You already have PostgreSQL + Drizzle. Supabase brings its own DB
- **Dependency increase** — Adds another managed service to maintain
- **Drizzle conflict** — Supabase expects to manage schema; Drizzle is your ORM
- **PostgREST layer** — Adds an abstraction; you want direct DB access
- **Not recommended** — Architectural mismatch with your stack

#### Cost

```
Free tier:     50,000 MAUs
Paid:          $25/month (per project)
Self-hosted:   Free (infrastructure costs only)
```

**Verdict for Galatea:** ⚠️ Not recommended (architectural mismatch; you already have PostgreSQL + Drizzle).

---

### 5. WorkOS AuthKit

**Overview:** B2B-focused authentication with enterprise SSO. Growing alternative to Auth0.

**Key Facts:**
- Commercial SaaS only (no self-hosting)
- Enterprise-grade (SAML, OIDC, SCIM)
- No free tier (requires contact for pricing)
- **TanStack Start SDK available**
- Ideal for SaaS selling to other businesses

#### Setup

```bash
npm install @workos/authkit-tanstack-react-start
```

```typescript
import { AuthKitProvider } from '@workos/authkit-tanstack-react-start'

export default function RootLayout() {
  return (
    <AuthKitProvider clientId={process.env.WORKOS_CLIENT_ID}>
      <Outlet />
    </AuthKitProvider>
  )
}
```

#### Strengths

- Excellent for B2B SaaS
- Enterprise SSO out-of-box
- Strong API for programmatic access
- Professional support

#### Weaknesses for Galatea

- **No self-hosting** — SaaS-only
- **Expensive** — No pricing published (request quote)
- **Overkill** — Galatea is internal + Discord integration, not B2B SaaS
- **Wrong target** — Better Auth or Authentik fits better

**Verdict for Galatea:** ❌ Not recommended (self-hosting requirement, cost).

---

## Part 3: Self-Hosted & Federated Options

### Authentik (OIDC/OAuth Provider)

**Overview:** Self-hosted identity provider. Can be used as OAuth provider with any auth library.

**Architecture:**
```
TanStack Start App
    ↓
Better Auth or Auth.js with OIDC provider config
    ↓
Authentik (self-hosted OAuth 2.0 server)
    ↓
PostgreSQL (you provide)
```

#### Integration with Better Auth

```typescript
export const auth = betterAuth({
  // ... other config
  socialProviders: {
    custom: {
      id: 'authentik',
      name: 'Authentik',
      clientId: process.env.AUTHENTIK_CLIENT_ID,
      clientSecret: process.env.AUTHENTIK_CLIENT_SECRET,
      authorizationUrl: 'https://authentik.example.com/application/o/authorize/',
      tokenUrl: 'https://authentik.example.com/application/o/token/',
      userInfoUrl: 'https://authentik.example.com/application/o/userinfo/',
    }
  }
})
```

#### Strengths for Galatea

| Aspect | Value |
|--------|-------|
| **Self-hosted** | ✅ Yes |
| **Infrastructure control** | ✅ Full |
| **OIDC/OAuth** | ✅ Yes (works with Better Auth) |
| **Cost** | ✅ Free (open-source) |
| **Complexity** | ⚠️ Medium (Docker + maintenance) |
| **Scalability** | ✅ Good (Python-based, lightweight) |

#### Weaknesses

- Extra deployment to maintain (Authentik instance)
- Adds operational overhead (backups, updates)
- Not first-class integration (uses standard OAuth flow)
- Learning curve for Authentik configuration

#### Cost

**Free.** Open-source (Apache 2.0). Infrastructure costs only.

---

### Keycloak (OIDC/OAuth Provider)

**Overview:** Red Hat's enterprise identity platform. More complex than Authentik.

#### Strengths

- Enterprise-grade (SAML, OIDC, LDAP, Kerberos)
- Mature ecosystem (since 2014)
- Fine-grained access control (ABAC)
- Supports complex hierarchies

#### Weaknesses for Galatea

- **Overkill** — Enterprise features you don't need
- **Heavy** — Resource-intensive (Java-based)
- **Complex** — Steep learning curve
- **Not recommended** — Authentik is lighter and sufficient

**Verdict for Galatea:** ⚠️ Use Authentik instead (lighter, simpler, same capabilities).

---

## Part 4: Custom Implementation (Baseline)

### When to Build Your Own

Only if you need **absolute control** and have **significant auth complexity**. For Galatea:

```typescript
// server/auth/session.ts
import { createHash, randomBytes } from 'crypto'
import { hash, verify } from 'argon2'
import { db } from '@/server/db'

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex')
  const hashedToken = createHash('sha256').update(token).digest('hex')

  const session = await db.insert(session).values({
    userId,
    token: hashedToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  })

  return token // Send to client in HTTP-only cookie
}

export async function validateSession(token: string) {
  const hashedToken = createHash('sha256').update(token).digest('hex')

  const session = await db.query.session.findFirst({
    where: eq(session.token, hashedToken),
  })

  if (!session || session.expiresAt < new Date()) {
    return null
  }

  return session.userId
}
```

#### Strengths

- ✅ Total control
- ✅ No external dependencies
- ✅ Customizable to Galatea's homeostasis needs

#### Weaknesses

- ❌ Requires expertise (password hashing, token generation, CSRF, etc.)
- ❌ Easy to get security wrong (timing attacks, weak randomness)
- ❌ Manual OAuth integration (Discord, Authentik, etc.)
- ❌ No pre-built tools

**Verdict:** **Not recommended as primary solution.** Use Better Auth + extend as needed.

---

## Part 5: Decision Matrix

| Requirement | Better Auth | Auth.js | Clerk | Supabase | Authentik |
|------------|------------|---------|-------|----------|-----------|
| **TanStack Start** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | N/A |
| **Drizzle ORM** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | N/A |
| **Self-hosted** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ❌ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Discord OAuth** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ (via proxy) |
| **JWT tokens** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ (native) |
| **Cost** | Free | Free | $0.02/MAU | $25/mo | Free |
| **Setup speed** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Complexity** | Low | Low | Very Low | Medium | High |

---

## Recommendation for Galatea

### Primary: Better Auth (Hybrid)

**Configuration:**
```typescript
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "@/server/db"

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  secret: process.env.BETTER_AUTH_SECRET,

  // 1. Database layer (Drizzle)
  database: drizzleAdapter(db),

  // 2. Session management (for web dashboard + PWA)
  session: {
    provider: "database",
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5-min cache
    }
  },

  // 3. TanStack Start integration
  plugins: [
    tanstackStartCookies(),
  ],

  // 4. OAuth providers (Discord + optional others)
  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    },
  },

  // 5. JWT for API clients (kiosks, external integrations)
  jwtSecret: process.env.JWT_SECRET,

  // 6. Optional: OIDC provider (Authentik for federated identity)
  // Add custom OIDC provider config if using Authentik
})
```

**Why this choice:**

| Reason | Impact |
|--------|--------|
| TanStack Start first-class support | Native cookie plugin handles SSR seamlessly |
| Drizzle ORM native adapter | Zero manual table setup, Galatea owns schema |
| Hybrid (session + JWT) | Web sessions for dashboard, JWTs for kiosks/Discord |
| Open-source & self-hostable | Aligns with infrastructure preferences |
| Discord OAuth built-in | Direct integration with beta Kirill integration |
| Lightweight | Minimal bundle bloat (~300KB) |
| Active maintenance | v1.0+ stable, Better Auth team behind it |

### Secondary: Add Authentik Later (Optional Phase H)

Once internal dashboard is stable, add Authentik for:
- Federated identity (OIDC provider)
- SSO across Galatea + external services
- Self-hosted user directory (no cloud dependency)

```typescript
// Enhanced config with Authentik OIDC
export const auth = betterAuth({
  // ... all above config
  socialProviders: {
    discord: { /* ... */ },
    custom: {
      id: 'authentik',
      name: 'Authentik OIDC',
      clientId: process.env.AUTHENTIK_CLIENT_ID,
      clientSecret: process.env.AUTHENTIK_CLIENT_SECRET,
      authorizationUrl: `${process.env.AUTHENTIK_URL}/application/o/authorize/`,
      tokenUrl: `${process.env.AUTHENTIK_URL}/application/o/token/`,
      userInfoUrl: `${process.env.AUTHENTIK_URL}/application/o/userinfo/`,
    }
  }
})
```

---

## Implementation Checklist

### Phase G (Current): Better Auth + TanStack Start

- [ ] Install Better Auth + TanStack plugin
- [ ] Configure Drizzle adapter
- [ ] Set up Discord OAuth app
- [ ] Create `/api/auth/$.ts` handler
- [ ] Configure session middleware in root layout
- [ ] Implement login/logout routes
- [ ] Add protected route guards (beforeLoad)
- [ ] Test with dashboard team
- [ ] Document flow in ARCHITECTURE.md

### Phase H (Future): Enhanced Auth

- [ ] Add JWT tokens for kiosk API clients
- [ ] Implement token refresh flow
- [ ] Optional: Deploy Authentik for OIDC
- [ ] Optional: Enable multi-tenant user roles
- [ ] Document in playbooks/

---

## Resources

### Official Documentation
- [TanStack Start Authentication Guide](https://tanstack.com/start/latest/docs/framework/react/guide/authentication)
- [Better Auth Documentation](https://better-auth.com/)
- [Better Auth + TanStack Integration](https://better-auth.com/docs/integrations/tanstack)

### Examples & Tutorials
- [Better Auth + TanStack Starter (GitHub)](https://github.com/daveyplate/better-auth-tanstack-starter)
- [Minimal TanStack Start + Better Auth + Drizzle Template](https://dev.to/jqueryscript/a-minimal-tanstack-start-template-with-better-auth-drizzle-orm-4mei)
- [TanStack Start Basic Auth Example (Official)](https://tanstack.com/start/latest/docs/framework/react/examples/start-basic-auth)
- [TanStack Start + Auth.js Example (Official)](https://tanstack.com/start/latest/docs/framework/react/examples/start-basic-authjs)

### Comparison Articles
- [Top 5 Authentication Solutions for TanStack Start 2026](https://workos.com/blog/top-authentication-solutions-tanstack-start-2026)
- [Clerk vs Supabase Auth Comparison](https://www.getmonetizely.com/articles/clerk-vs-supabase-auth-how-to-choose-the-right-authentication-service-for-your-budget)
- [TanStack Start Authentication with Keycloak/OIDC](https://medium.com/@othmane.outama/tanstack-start-authentication-with-oidc-oauth-2-0-keycloak-example-2a2177824d7c)

---

## Related Documents

- [2026-03-14-authentication-options-research.md](2026-03-14-authentication-options-research.md) — Session vs JWT architecture
- [SSO_PROVIDER_COMPARISON.md](SSO_PROVIDER_COMPARISON.md) — Authentik vs Keycloak vs Authelia
- [2026-03-14-mobile-auth-patterns-comparison.md](2026-03-14-mobile-auth-patterns-comparison.md) — Auth for PWA/Expo apps

---

**Next Step:** Review recommendation with team, then proceed with Better Auth implementation in Phase G.
