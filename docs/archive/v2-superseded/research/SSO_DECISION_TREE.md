# SSO Decision Tree for Galatea

## Quick Visual Decision Guide

```
START: Do you need auth?
│
├─ YES, need it THIS WEEK
│  └─ GitHub OAuth (2-4 hours)
│     └─ Fastest path
│        └─ Team must be on GitHub
│           └─ If not: Magic Links instead
│
├─ YES, want best practices
│  └─ Magic Links + Better Auth (1-2 days)
│     └─ Recommended primary
│        ├─ Works for anyone with email
│        ├─ Simple token management
│        ├─ PostgreSQL sessions
│        └─ Can add GitHub OAuth later (4h)
│
├─ YES, and need enterprise SSO soon
│  └─ Magic Links NOW (Phase 1, 1-2d)
│     ├─ Gets auth deployed
│     ├─ No blockers
│     └─ Phase 2 (Sprint 3-4): Add Authentik
│
└─ NO, planning ahead
   └─ Read this doc when you need auth
```

---

## Decision Tree by Constraint

### "We need auth by EOD today"

```
Can you spend 2-4 hours?
├─ YES → GitHub OAuth
│        (team all on GitHub? YES → do this)
│        (team not on GitHub? → No, use Magic Links)
└─ NO → delay to tomorrow, use Magic Links
```

### "We want auth without external services"

```
Can you set up email (Resend)?
├─ YES → Magic Links + Better Auth
│        (PostgreSQL stores all state)
└─ NO → GitHub OAuth only
        (or keep plain session cookies, no auth)
```

### "We want future enterprise SSO"

```
Phase 1 (now): Magic Links (1-2d)
Phase 2 (Sprint 3-4): Add GitHub OAuth (4h)
Phase 3 (Sprint 5+): Deploy Authentik (3-5d)
│
└─ Authentik + OIDC bridges to enterprise systems
```

### "We're building a public product"

```
This doc is for INTERNAL tools.

For public auth, see:
├─ Auth0 (SaaS)
├─ Firebase (SaaS)
├─ Supabase (SaaS + self-hosted option)
└─ Better Auth + Multi-provider (open source)
```

---

## Complexity vs Capability

```
Capability (top) vs Effort (left)

            Low            Medium         High
            Effort         Effort         Effort

High ┌──────────────────────────────────────┐
Feat │                        │  Authentik   │
Scope│                        │  + OIDC      │
     │    Magic Links   +     │              │
     │                 GitHub │  Keycloak    │
     │                   │    │  + SAML      │
     │                   │    │              │
Low  └──────────────────────────────────────┘
            Time to implement →
```

**For Galatea** (3-10 person internal team):
- Top-left quadrant: Magic Links + Better Auth
- Bottom-right quadrant: NOT needed

---

## One-Page Recommendation

### Right Now (Sprint 1-2)

```
✓ Magic Links + Better Auth
  - Setup: 1-2 days
  - Cost: $0-20/month (Resend email)
  - Complexity: Low-Medium
  - Flexibility: Very high
  - Self-hosted: Yes
```

**Why**:
- Works for anyone with email
- No external IdP needed
- Simple token lifecycle
- Can add OAuth/WebAuthn later without refactoring

### Later (Sprint 3-4, optional)

```
+ GitHub OAuth (secondary method)
  - Setup: 4-6 hours
  - Cost: $0
  - Reduces friction: Yes (team already on GitHub)
  - Fallback: When Resend is down
```

**Why**:
- Redundancy (magic links fail → use GitHub)
- Team friction (one-click signin)
- No additional IdP

### Future (Sprint 5+, if enterprise)

```
+ Authentik + OIDC (self-hosted IdP)
  - Setup: 3-5 days
  - Cost: $10-30/month (VPS)
  - Complexity: Medium
  - Benefit: Enterprise federation
  - When: Only if customers demand OIDC/SAML
```

**Why**:
- Enterprise-ready
- Self-hosted (data stays internal)
- OIDC is modern standard
- Can integrate other systems later
- Authentik better than Keycloak for small teams

---

## Comparison: Three Scenarios

### Scenario A: Speed Matters (Deploy Auth Today)

```
CHOICE: GitHub OAuth
TIME: 2-4 hours
TRADE: Team must use GitHub (Galatea team does ✓)
RISK: Low (GitHub is always up)
COST: $0
NEXT: Add Magic Links later if needed
```

### Scenario B: Flexibility Matters (Best All-Around)

```
CHOICE: Magic Links + Better Auth
TIME: 1-2 days
TRADE: Need email service (Resend = simple)
RISK: Low (Resend very reliable, has GitHub fallback)
COST: $0-20/month
NEXT: Add GitHub OAuth in 4 hours
```

### Scenario C: Enterprise Matters (Long-Term)

```
Phase 1: Magic Links (as Scenario B)
Phase 2: Add GitHub OAuth (4 hours)
Phase 3: Deploy Authentik + OIDC (when customers ask)

TIMELINE: Phase 1-2 this month, Phase 3 Q3-Q4
RISK: Low (phase incrementally, prove each step)
COST: $0-50/month (Resend + Authentik VPS)
```

---

## What NOT to Do

| Approach | Why Not | When to Reconsider |
|----------|---------|---|
| Keycloak | Overkill, high resource use | Team >100 people |
| SAML | Enterprise legacy, verbose XML | Customer demands it |
| Custom JWT | Manual token mgmt, more bugs | Never (use Better Auth) |
| Lucia v3 | Archived March 2025 | Not available |
| Firebase Auth | Vendor lock-in | Public app needing scaling |
| Auth0 | SaaS, expensive | Team >100 people OR time critical |

---

## PostgreSQL Schema (All Approaches Start Here)

```sql
-- Phase 1: Magic Links or GitHub OAuth

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- For magic links specifically:
CREATE TABLE magic_links (
  id TEXT PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- For GitHub OAuth specifically:
CREATE TABLE oauth_accounts (
  id TEXT PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT, -- 'github', 'gitlab', etc.
  provider_account_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Cleanup indexes
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_magic_links_expires_at ON magic_links(expires_at);
CREATE INDEX idx_oauth_accounts_user_id ON oauth_accounts(user_id);
```

---

## Implementation Checklist

### Magic Links (Phase 1)

- [ ] PostgreSQL schema (users, sessions, magic_links)
- [ ] Better Auth installed + configured
- [ ] Resend account created (free tier fine)
- [ ] POST /api/auth/sign-in (email input)
- [ ] GET /auth/verify?token=xyz (verification)
- [ ] Session middleware (check session cookie)
- [ ] Logout endpoint (clear session)
- [ ] Tests (token generation, expiry, one-time use)
- [ ] Deployed to staging

### GitHub OAuth (Phase 1.5, optional)

- [ ] GitHub OAuth app registered
- [ ] POST /api/auth/github (redirect)
- [ ] POST /api/auth/github/callback (token exchange)
- [ ] oauth_accounts table
- [ ] Account linking (email deduplication)
- [ ] Tests (callback, token exchange, user creation)
- [ ] Deployed to staging

### Authentik + OIDC (Phase 2-3, future)

- [ ] Authentik deployed (docker/self-hosted)
- [ ] PostgreSQL + Redis for Authentik
- [ ] OIDC application created in Authentik
- [ ] Better Auth configured with OIDC provider
- [ ] OIDC flow tested (redirect, token, userinfo)
- [ ] User migration plan (existing users → OIDC)

---

## Estimate vs Actual (Reality Check)

| Task | Estimate | Reality | Notes |
|------|----------|---------|-------|
| GitHub OAuth setup | 2-4h | 2-4h | Fast, straightforward |
| Magic Links setup | 1-2d | 1-2d | Token generation + email |
| Better Auth integration | 4-8h | 4-8h | Good docs, library handles most |
| Testing + edge cases | 4-8h | 6-12h | Token expiry, one-time use, race conditions |
| Authentik deployment | 3-5d | 3-5d | Learning curve on first deploy |
| Documentation | 2-4h | 4-8h | Security checklist, runbook |

**Total for Phase 1**: ~3-5 days (1 developer)
**Total for Phase 1-2**: ~4-6 days (1 developer)
**Total for Phase 1-3**: ~10-14 days (1 developer, phased)

---

## Security Audit Checklist

Before shipping, verify:

### Cryptography
- [ ] `crypto.randomBytes()` for token generation
- [ ] 32+ character tokens
- [ ] 15-30 minute TTL
- [ ] One-time use enforcement

### HTTP
- [ ] HTTPS only (no HTTP)
- [ ] HSTS header set
- [ ] Secure cookie flag

### Cookies
- [ ] HttpOnly (no JS access)
- [ ] SameSite=Lax
- [ ] Secure (HTTPS only)

### Database
- [ ] Expired sessions cleaned (cron job)
- [ ] Unique email constraint
- [ ] Index on expires_at (for cleanup)
- [ ] Audit log of logins

### Rate Limiting
- [ ] Auth endpoints limited (5 attempts/min)
- [ ] Magic link generation limited (3/hour per email)
- [ ] OAuth callback limited

### Monitoring
- [ ] Failed login logging
- [ ] Auth endpoint metrics
- [ ] Alerts set up

---

## Cost Comparison

```
Magic Links + Better Auth:
├─ Resend: $0-20/month (100 free/day, $0.04/email)
└─ Server: Existing (no new infra)
   TOTAL: $0-20/month

GitHub OAuth:
└─ Free forever
   TOTAL: $0/month

Authentik + OIDC (Phase 3):
├─ VPS: $10-50/month
├─ PostgreSQL: Existing or $5-10/month
├─ Redis: $5-10/month (included in many VPS)
└─ Resend: $0-20/month (still needed for email)
   TOTAL: $20-60/month (modest for enterprise)

Auth0/Okta:
├─ Free tier: 1 app, limited features
└─ Paid: $25-500+/month
   TOTAL: Expensive, vendor lock-in
```

---

## When to Escalate to Next Phase

### Phase 1 → Phase 2 (Magic Links → Add GitHub OAuth)

Escalate when:
- [ ] Magic links working 2+ weeks without issues
- [ ] Team asking for one-click signin
- [ ] You want redundancy (GitHub backup if Resend down)

Effort: 4-6 hours

### Phase 2 → Phase 3 (OAuth → Enterprise OIDC)

Escalate when:
- [ ] Customer demands OIDC or SAML
- [ ] Team grows >50 people
- [ ] Need to SSO with other systems (HR, Slack, etc.)
- [ ] Planning enterprise expansion (Q3-Q4)

Effort: 3-5 days (includes learning Authentik)

### Phase 3 → Phase 4 (OIDC → SAML)

Escalate when:
- [ ] Enterprise customers require SAML
- [ ] Integration with Active Directory needed
- [ ] Workforce SSO with Okta/Ping required

Effort: 5-10 days (XML is complex, but standard)

---

## Reference: Tech Stack Choice

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | TanStack Start v1 | Already selected |
| Database | PostgreSQL | Already deployed |
| Auth library | Better Auth | Modern, flexible, Node.js-first |
| Passwordless | Magic links (first) + OAuth (second) | Simple → Complex escalation |
| IdP | Authentik (if needed) | Self-hosted, simpler than Keycloak |
| Email | Resend | Modern, reliable, simple |
| Protocol (future) | OIDC (not SAML) | Modern, JSON-based, easier |

---

## Go/No-Go Decision for Each Phase

### Phase 1: Magic Links (GO)
- [ ] Required for product launch
- [ ] Low risk (simple token model)
- [ ] Proven pattern (Slack, Auth0 use it)
- [ ] Decision: **APPROVED for Sprint 1-2**

### Phase 2: GitHub OAuth (GO if no blockers)
- [ ] Nice to have (reduces friction)
- [ ] Low risk (OAuth 2.0 is standard)
- [ ] Time flexible (can defer to Sprint 3)
- [ ] Decision: **APPROVED for Sprint 1.5 (optional)**

### Phase 3: Authentik + OIDC (CONDITIONAL)
- [ ] Only if enterprise SSO needed
- [ ] Medium risk (more infrastructure)
- [ ] High effort (3-5 days)
- [ ] Decision: **DEFER to Phase 2-3 (conditional)**

### Phase 4: SAML (NOT FOR MVP)
- [ ] Only if customer explicitly requires it
- [ ] High effort (5-10 days)
- [ ] Can be bolted on later
- [ ] Decision: **DEFER to Phase 4+ (do not start now)**

---

## FAQ

**Q: Can we start with just GitHub OAuth?**
A: Yes, 2-4 hours. But you'll want to add magic links later (non-GitHub team members, fallback if GitHub down).

**Q: What if Resend is down?**
A: Magic links fail. Keep GitHub OAuth as fallback. Or use Nodemailer with self-hosted SMTP.

**Q: Do we need Authentik right now?**
A: No. Use Better Auth + PostgreSQL sessions first. Add Authentik only if enterprise SSO needed (Phase 3+).

**Q: Is Lucia/NextAuth still good?**
A: Lucia archived March 2025. NextAuth → better-auth merger in progress. Use Better Auth (actively maintained).

**Q: Can we use Firebase Auth?**
A: Not recommended for internal tools (vendor lock-in). Use Better Auth + open source instead.

**Q: What if we change providers later?**
A: Better Auth abstracts providers. You can swap OAuth, magic links, OIDC without rewriting app code.

**Q: Do we need rate limiting?**
A: Yes, minimal (5 attempts/min on auth endpoints). Prevents brute force.

**Q: How long until tokens expire?**
A: Magic links: 15-30 minutes. Sessions: 7-30 days. Refresh tokens: 30-90 days.

**Q: Can users recover lost access?**
A: Magic links: re-send email. Passkeys: backup email + recovery codes. Plan this before shipping.

---

## Additional Resources

- Better Auth docs: https://better-auth.com/docs
- Authentik docs: https://docs.goauthentik.io/
- OIDC 101: https://openid.net/connect/
- OAuth 2.0 spec: https://datatracker.ietf.org/doc/html/rfc6749

---

**Decision Made**: Implement Phase 1 (Magic Links + Better Auth) in Sprint 1-2
**Next Review**: After Phase 1 deployed and stable (Week 2-3)
**Document**: SSO_RESEARCH_SYNTHESIS.md (full details)

Last Updated: March 14, 2026
