# TanStack Start Authentication — Quick Reference

**For Galatea Stack:** TanStack Start + PostgreSQL + Drizzle ORM

---

## 1-Minute Summary

| Library | Best For | Cost | Setup Time | Self-Hosted |
|---------|----------|------|------------|-------------|
| **Better Auth** ⭐ | Galatea (hybrid session + JWT) | Free | 30 min | ✅ Yes |
| **Auth.js** | TanStack Start (proven) | Free | 30 min | ✅ Yes |
| **Clerk** | Fastest prototyping | $0.02/MAU | 10 min | ❌ No |
| **Supabase** | All-in-one (DB + auth) | $25/mo | 20 min | ✅ Yes |
| **Authentik** | Self-hosted OIDC provider | Free | 1-2 hrs | ✅ Yes |

---

## 🎯 Recommendation for Galatea

### Primary Choice: **Better Auth**

```bash
npm install better-auth drizzle-orm @tanstack/react-start
```

**Why?**
- ✅ TanStack Start cookies plugin (automatic)
- ✅ Drizzle ORM native adapter
- ✅ Hybrid: sessions (web) + JWT (APIs)
- ✅ Discord OAuth built-in
- ✅ Open-source & self-hostable
- ✅ Lightweight (~300KB)

**Setup Time:** 30-45 minutes

**Cost:** Free

---

## Quick Setup: Better Auth + TanStack Start

### 1. Install

```bash
npm install better-auth
npm install -D @auth/core
```

### 2. Create Auth Handler (`server/auth.ts`)

```typescript
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "@/server/db"

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db),

  plugins: [
    // Automatic cookie handling for TanStack Start
    tanstackStartCookies(),
  ],

  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    },
  },
})

export type Session = typeof auth.$Infer.Session
```

### 3. Create API Handler (`app/routes/api/auth.$.ts`)

```typescript
import { auth } from "@/server/auth"
import { createAPIFileRoute } from "@tanstack/react-start/server"

export const Route = createAPIFileRoute("/api/auth/$")(async ({ request }) => {
  return auth.handler(request)
})
```

### 4. Get Session in Server Functions

```typescript
import { createServerFn } from "@tanstack/react-start"
import { auth } from "@/server/auth"

export const getSession = createServerFn({ method: "GET" })(async () => {
  const headers = getRequestHeaders() // From TanStack
  const session = await auth.api.getSession({ headers })
  return session
})
```

### 5. Protect Routes

```typescript
const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) throw redirect({ to: "/login" })
    return { session }
  },
  component: Dashboard,
})
```

### 6. Login Form

```typescript
const LoginPage = () => {
  const [loading, setLoading] = React.useState(false)

  const handleDiscordLogin = async () => {
    setLoading(true)
    await signIn.social({
      provider: "discord",
      callbackURL: "/dashboard",
    })
  }

  return (
    <div>
      <button onClick={handleDiscordLogin} disabled={loading}>
        {loading ? "Loading..." : "Sign in with Discord"}
      </button>
    </div>
  )
}
```

---

## FAQ

### Q: Can I use JWT tokens for API clients?

**A:** Yes. Better Auth supports both:

```typescript
// Session (HTTP-only cookie) for web
const session = await auth.api.getSession({ headers })

// JWT token for API clients
const token = await auth.createJWT({
  payload: { userId: user.id },
  expiresIn: "15m",
})
```

---

### Q: What about Discord bot integration?

**A:** Better Auth handles user auth. For Discord bot:
1. Better Auth manages team member logins
2. Separate Discord bot token manages bot actions
3. Both use same user database (no duplication)

See: [Galatea architecture](../ARCHITECTURE.md#channel-layer)

---

### Q: How do I add OIDC/Authentik later?

**A:** Just add custom OIDC provider:

```typescript
export const auth = betterAuth({
  // ... existing config
  socialProviders: {
    discord: { /* ... */ },
    custom: {
      id: 'authentik',
      name: 'Authentik',
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

### Q: Does it work offline (PWA)?

**A:** Sessions don't work offline. For offline PWA:

1. **Cache session on app startup** (use TanStack Query)
2. **Queue operations** when offline
3. **Sync when back online**

Better Auth works great for the sync part.

---

### Q: Self-hosted vs Cloud?

**A:**
- **Cloud:** Let Better Auth (Vercel) manage it. Simple, included in Vercel deployment.
- **Self-hosted:** Deploy Better Auth to your infrastructure. Full control, extra maintenance.

For Galatea, **cloud-hosted Better Auth** on Vercel is simplest. Can migrate later if needed.

---

## Comparison: What's the Difference?

### Better Auth vs Auth.js

| Aspect | Better Auth | Auth.js |
|--------|------------|---------|
| **Size** | 300KB | 400KB |
| **Age** | Newer (v1.0 in 2025) | Battle-tested (since 2020) |
| **TanStack** | Native plugin | Manual setup |
| **JWT** | First-class | Secondary |
| **Learning curve** | Easier | Steeper |

**Verdict:** Use **Better Auth** for Galatea.

---

### Better Auth vs Clerk

| Aspect | Better Auth | Clerk |
|--------|------------|-------|
| **Self-hosted** | ✅ Yes | ❌ No |
| **Setup time** | 30 min | 10 min |
| **Pre-built UI** | ❌ No | ✅ Yes (beautiful) |
| **Cost** | Free | $0.02/MAU |
| **Control** | High | Low |

**Verdict:** Clerk if you want UI fast + don't care about self-hosting. Better Auth for Galatea's constraints.

---

### Better Auth vs Custom

| Aspect | Better Auth | Custom |
|--------|------------|--------|
| **Control** | 95% | 100% |
| **Security** | Battle-tested | Error-prone |
| **OAuth setup** | 5 min | 1-2 days |
| **Maintenance** | Low | High |
| **Cost** | Free | Engineering time |

**Verdict:** Always use Better Auth unless you have very unusual requirements.

---

## Environment Variables

```env
# Better Auth
BETTER_AUTH_SECRET=<generated secret>
BETTER_AUTH_URL=http://localhost:3000

# Discord OAuth
DISCORD_CLIENT_ID=<your discord app client id>
DISCORD_CLIENT_SECRET=<your discord app client secret>

# JWT (optional, for API clients)
JWT_SECRET=<generated secret>

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/galatea
```

---

## Checklist: Getting Started

- [ ] Install Better Auth: `npm install better-auth`
- [ ] Create `server/auth.ts` with config
- [ ] Create `/api/auth/$.ts` handler
- [ ] Set up Discord OAuth app (15 min)
- [ ] Add `getSession()` server function
- [ ] Protect routes with `beforeLoad`
- [ ] Test login flow locally
- [ ] Deploy to Vercel/prod
- [ ] Document in team CLAUDE.md

**Total time:** 60-90 minutes

---

## Next Steps

1. **Implement Better Auth** (Phase G)
   - Create auth handler + routes
   - Test with Discord login
   - Add to dashboard

2. **Add JWT tokens for APIs** (Phase G+)
   - Issue tokens in login response
   - Validate in kiosk/external API calls

3. **Optional: Authentik OIDC** (Phase H)
   - Deploy Authentik instance
   - Configure as OIDC provider
   - Add to Better Auth socialProviders

---

## Resources

- [Better Auth Docs](https://better-auth.com/)
- [TanStack Start Auth Guide](https://tanstack.com/start/latest/docs/framework/react/guide/authentication)
- [Better Auth + TanStack Integration](https://better-auth.com/docs/integrations/tanstack)
- [GitHub: Better Auth TanStack Starter](https://github.com/daveyplate/better-auth-tanstack-starter)

---

**See also:** [2026-03-14-tanstack-start-auth-libraries.md](2026-03-14-tanstack-start-auth-libraries.md) for deep dive comparison.
