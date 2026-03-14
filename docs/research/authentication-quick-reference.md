# Authentication Quick Reference Guide

**For:** Galatea team choosing authentication approach
**Updated:** 2026-03-14

---

## TL;DR: One-Minute Decision Guide

**Use Better Auth + JWT Hybrid**

```
Web Dashboard & PWA → Better Auth (sessions in HTTP-only cookies)
Discord Bot & Kiosks → JWT tokens (stateless, external clients)
```

Setup time: 30 minutes | Cost: $0 | Self-hosted: Yes

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                 GALATEA USERS & CLIENTS                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  TRUSTED CLIENTS (internal team)          EXTERNAL CLIENTS   │
│  ┌──────────────────────────┐             ┌────────────────┐ │
│  │ Web Dashboard            │             │ Discord Bot    │ │
│  │ (React 19 + TanStack)    │             │ (discord.js)   │ │
│  │                          │             │                │ │
│  │ PWA Guide App            │             │ Kiosk Players  │ │
│  │ (Tablet, offline-first)  │             │ (touch UI)     │ │
│  └────────┬─────────────────┘             └────────┬───────┘ │
│           │                                         │          │
│           │ HTTP-ONLY COOKIES                       │ JWT TOKEN │
│           │ (Session-Based)                         │          │
│           │                                         │          │
│           ▼                                         ▼          │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              BETTER AUTH + JWT HYBRID                   │ │
│  ├─────────────────────────────────────────────────────────┤ │
│  │                                                         │ │
│  │  Session Validation                JWT Validation      │ │
│  │  ├─ Browser auto-includes cookie  ├─ Client includes  │ │
│  │  ├─ Server validates in DB        │   Authorization    │ │
│  │  ├─ Instant revocation            │   header           │ │
│  │  └─ SameSite protection           ├─ Server checks     │ │
│  │                                    │   signature        │ │
│  │  PostgreSQL Session Store          │   (stateless)      │ │
│  │  ├─ user table                     │                    │ │
│  │  ├─ session table                  │ JWT Token Store    │ │
│  │  ├─ emailVerified, oauth accounts  │ ├─ Generated on    │ │
│  │  │                                  │   demand          │ │
│  │  Drizzle ORM                       │ ├─ Expires after   │ │
│  │  ├─ Type-safe queries              │   30 days         │ │
│  │  └─ Migrations                     └─────────────────── │ │
│  │                                                         │ │
│  └─────────────────────────────────────────────────────────┘ │
│           │                                   │                │
│           └─────────────┬─────────────────────┘                │
│                         │                                       │
│                         ▼                                       │
│                  PostgreSQL (port 15432)                       │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Comparison: Top 3 Options

### 1. BETTER AUTH (⭐ RECOMMENDED)

```
┌──────────────────────────────────────────┐
│ Better Auth + JWT Hybrid for Galatea     │
├──────────────────────────────────────────┤
│ Setup Time        │ 30 minutes           │
│ Learning Curve    │ Low                  │
│ Nitro Support     │ Native ✅            │
│ TanStack Support  │ Great ✅             │
│ Drizzle Support   │ Excellent ✅         │
│ Password Reset    │ Built-in ✅          │
│ Email Verification│ Built-in ✅          │
│ MFA               │ Built-in ✅          │
│ OAuth Providers   │ 20+ ✅               │
│ Cost              │ FREE ✅              │
│ External Service  │ NO ✅                │
│ Token Support     │ Sessions + JWT ✅    │
└──────────────────────────────────────────┘

Installation:
$ pnpm add better-auth

Files to create:
server/utils/auth.ts
server/routes/api/auth/[...].ts
app/lib/auth.ts
```

### 2. LUCIA AUTH (Alternative if minimal)

```
┌──────────────────────────────────────────┐
│ Lucia Auth (Bare-Bones)                  │
├──────────────────────────────────────────┤
│ Setup Time        │ 2-4 hours            │
│ Learning Curve    │ Medium               │
│ Nitro Support     │ Adapter ✅           │
│ Drizzle Support   │ Excellent ✅         │
│ Password Reset    │ Manual ⚠️            │
│ Email Verification│ Manual ⚠️            │
│ MFA               │ Manual ⚠️            │
│ Cost              │ FREE ✅              │
│
For: Developers who want full control
Against: Need MFA, password reset, email verification
```

### 3. CLERK (Alternative if managed)

```
┌──────────────────────────────────────────┐
│ Clerk (Managed SaaS)                     │
├──────────────────────────────────────────┤
│ Setup Time        │ 1-2 hours            │
│ Learning Curve    │ Very Low             │
│ UI Components     │ Pre-built ✅         │
│ Password Reset    │ Built-in ✅          │
│ Email Verification│ Built-in ✅          │
│ MFA               │ Built-in ✅          │
│ Cost              │ Free/$99-500mo       │
│ External Service  │ YES (vendor lock-in) │
│
For: Want zero backend work, have budget
Against: Costs money, external service dependency
```

---

## Authentication Flows at a Glance

### Web User (Dashboard)

```
1. User visits dashboard
   ↓
2. Click "Login"
   ↓
3. Form → POST /api/auth/sign-in (email, password)
   ↓
4. Server validates credentials
   ↓
5. Server creates session in PostgreSQL
   ↓
6. Response: Set-Cookie: sessionId=abc123; HttpOnly; SameSite=Strict
   ↓
7. Browser stores cookie (hidden from JS)
   ↓
8. Browser navigates to /dashboard
   ↓
9. TanStack Router checks: GET /api/auth/get-session
   ↓
10. Cookie auto-included in request
   ↓
11. Server finds session in DB, returns user data
   ↓
12. TanStack Router allows access to /dashboard
   ↓
13. User sees dashboard
```

### Discord Bot (API Client)

```
1. Setup: Register bot in Galatea
   ↓
2. Server generates JWT token
   ↓
3. Token stored in DISCORD_BOT_JWT_TOKEN env var
   ↓
4. Discord bot receives message: "@galatea check build"
   ↓
5. Discord bot sends: POST /api/agent/messages
   Headers: Authorization: Bearer <jwt_token>
   Body: { message: "check build" }
   ↓
6. Server validates JWT signature
   ↓
7. No DB lookup needed (stateless)
   ↓
8. Server executes request
```

### PWA App Offline

```
1. User opens PWA, is logged in
   ↓
2. Service worker caches session in IndexedDB
   ↓
3. Internet goes down (offline)
   ↓
4. App detects offline: navigator.onLine === false
   ↓
5. Reads cached session from IndexedDB
   ↓
6. Shows "OFFLINE MODE - READ-ONLY" banner
   ↓
7. User can browse, but write buttons are disabled
   ↓
8. When online again:
   - App refreshes session from server
   - Disables "offline" banner
   - Re-enables write buttons
```

---

## Implementation Checklist

### Minimum for MVP (Days 1-2)

- [ ] Install Better Auth
- [ ] Create database schema
- [ ] Create `/api/auth/sign-in` route
- [ ] Create `/api/auth/sign-out` route
- [ ] Create login page (form)
- [ ] Protect dashboard route with session check
- [ ] Add logout button

**Result:** Basic web authentication working

### Complete (Days 3-5)

- [ ] Add `/api/auth/sign-up` (user registration)
- [ ] Add email verification flow
- [ ] Add password reset flow
- [ ] Create `useSession` React hook
- [ ] Protect all dashboard routes
- [ ] Create API key generation endpoint
- [ ] Document API authentication for Discord bot

**Result:** Full feature auth + API support

### Polish (Days 6-7)

- [ ] Add IndexedDB caching for PWA
- [ ] Add service worker with auth caching
- [ ] Add offline mode detection
- [ ] Write integration tests
- [ ] Write E2E tests
- [ ] Document auth architecture

**Result:** Production-ready authentication

---

## Which to Choose?

### Choose BETTER AUTH if:
- ✅ You want native Nitro/TanStack support
- ✅ You're already using PostgreSQL + Drizzle
- ✅ You want security best practices (HTTP-only cookies)
- ✅ You want instant logout/revocation
- ✅ You need OAuth, email verification, MFA
- ✅ You don't want to manage external services
- ✅ You want type-safe database queries
- ✅ You want to support both web users + API clients

### Choose LUCIA AUTH if:
- ⚠️ You want to learn how authentication works
- ⚠️ You want ultra-minimal code
- ⚠️ You don't need email verification / MFA
- ⚠️ You're comfortable implementing password reset yourself

### Choose CLERK if:
- 💰 You have budget for managed service ($99-500/month)
- 💰 You want zero backend auth code
- 💰 You want pre-built beautiful UI
- 💰 You want professional support
- (Not recommended for Galatea: internal-only app, vendor lock-in)

---

## File Structure for Better Auth

```
galatea/
├── server/
│   ├── utils/
│   │   ├── auth.ts                    ← Better Auth instance
│   │   └── jwt.ts                     ← JWT token helpers
│   ├── routes/
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── [...].ts           ← Auto-generated by Better Auth
│   │   │   │   └── api-key.post.ts    ← Issue API keys
│   │   │   ├── agent/
│   │   │   │   ├── messages.post.ts   ← Requires session or JWT
│   │   │   │   └── ...
│   │   │   └── health.get.ts          ← No auth needed
│   │   └── middleware/
│   │       ├── auth.ts                ← Validate session/token
│   │       └── rate-limit.ts          ← Rate limiting
│   ├── db/
│   │   ├── schema.ts                  ← Includes Better Auth tables
│   │   ├── seed.ts
│   │   └── migrations/
│   └── ...
│
├── app/
│   ├── routes/
│   │   ├── login.tsx                  ← Login form (public)
│   │   ├── dashboard.tsx              ← Protected route
│   │   └── guide.tsx                  ← PWA guide (protected)
│   ├── lib/
│   │   ├── auth.ts                    ← useSession hook
│   │   ├── offline.ts                 ← Offline auth caching
│   │   └── api-client.ts              ← API fetch helpers
│   └── ...
│
├── docs/
│   ├── AUTHENTICATION.md               ← User guide
│   └── AUTHENTICATION_API.md            ← API docs for Discord/Kiosk
│
└── .env.example
    BETTER_AUTH_SECRET=xxx
    BETTER_AUTH_URL=http://localhost:13000
    JWT_SECRET=xxx
```

---

## Environmental Variables Needed

```bash
# Better Auth
BETTER_AUTH_SECRET=generate-random-secret-32-chars-min
BETTER_AUTH_URL=http://localhost:13000

# JWT for API tokens
JWT_SECRET=another-random-secret-32-chars-min

# OAuth (optional, for future)
GITHUB_ID=
GITHUB_SECRET=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=

# Database (existing)
DATABASE_URL=postgres://user:pass@localhost:15432/galatea

# External clients
DISCORD_BOT_JWT_TOKEN=<generated-on-first-run>
```

---

## Cost Comparison

| Option | Setup | Monthly | Annual | Notes |
|--------|-------|---------|--------|-------|
| Better Auth | 30 min | $0 | $0 | Best for Galatea |
| Lucia Auth | 2-4 hours | $0 | $0 | DIY, minimal |
| Auth.js | 1-2 hours | $0 | $0 | Legacy, complex |
| Clerk | 1-2 hours | $99-500 | $1,200-6,000 | Managed |

---

## Next Steps

1. **Read** the full research: `/docs/research/2026-03-14-authentication-options-research.md`
2. **Review** with team on security requirements
3. **Decide** Better Auth for web + JWT for APIs? (recommended)
4. **Create** issue: "Implement authentication layer"
5. **Estimate** 5-7 days for MVP + polish
6. **Build** following the implementation checklist

---

## Key Resources

- [Better Auth Documentation](https://better-auth.com)
- [Better Auth Nitro Integration](https://better-auth.com/docs/integrations/nitro)
- [Better Auth Drizzle Adapter](https://better-auth.com/docs/adapters/drizzle)
- [TanStack Start Authentication](https://tanstack.com/start/latest/docs/framework/react/guide/authentication)
- [JWT.io - Learn JWT](https://jwt.io)
- [OWASP Session Management](https://owasp.org/www-community/attacks/Session_fixation)
