# SSO Research Index

Comprehensive research on Single Sign-On (SSO) solutions for TanStack Start application with PostgreSQL backend on self-hosted Linux infrastructure.

**Research Date**: March 14, 2026
**Project**: Galatea (TanStack Start v1, PostgreSQL, self-hosted)
**Team Size**: Small (internal web app + dashboard)

## Quick Start

1. **Have 2-4 hours?** → Read **SSO_QUICK_REFERENCE.md** (Scenario 1)
2. **Have 1-2 days?** → Read **SSO_QUICK_REFERENCE.md** (Scenario 2)
3. **Deep dive?** → Read **2026-03-14-sso-provider-comparison.md**

## Core Research Documents

| Document | Purpose | Audience | Time to Read |
|----------|---------|----------|------|
| **[SSO_QUICK_REFERENCE.md](SSO_QUICK_REFERENCE.md)** | Decision matrix, scenario-based recommendations | Product/tech leads | 15 min |
| **[2026-03-14-sso-provider-comparison.md](2026-03-14-sso-provider-comparison.md)** | Detailed analysis of 7 approaches, code examples | Engineers | 45 min |

## Key Findings Summary

### Recommended Path for Galatea

**For immediate implementation (this sprint)**:
- **OAuth 2.0 (GitHub)** or **Magic Links**
- Time: 2-4 hours
- PostgreSQL: user table + sessions
- Zero external infrastructure

**For scalable auth (next sprint)**:
- **Better Auth** + PostgreSQL sessions
- Time: 1-2 days
- Modern, flexible, supports OAuth + magic links + passkeys
- No vendor lock-in

**For enterprise SSO (Q3/Q4)**:
- **Better Auth (client)** + **Authentik (IdP)**
- Time: 3-5 days
- OIDC-based, self-hosted, ready for 100+ users
- PostgreSQL + Redis

### Decision Logic

```
Need auth today?
├─ Yes, quick → GitHub OAuth (2-4h) or Magic Links (1-2d)
└─ No, planning ahead?
   ├─ Small team, simple needs → Magic Links (1-2d)
   ├─ Want flexibility → Better Auth (1d)
   └─ Enterprise growth → Better Auth + Authentik (3-5d later)
```

### Why This Path

1. **Better Auth**: Modern, actively maintained, Node.js-first
2. **Authentik vs Keycloak**: Simpler UX for small teams (visual flow builder)
3. **Self-hosted**: Data stays internal, aligns with Linux infrastructure
4. **PostgreSQL**: Already in stack, proven

---

## Stack Alignment Checklist

| Component | Choice | Status |
|-----------|--------|--------|
| Framework | TanStack Start v1 | Already selected |
| Database | PostgreSQL | Already deployed (port 15432) |
| Auth library | Better Auth (primary) | Modern, recommended |
| IdP | None (OAuth) initially → Authentik later | Phased approach |
| Session storage | PostgreSQL | Leverages existing DB |
| Passwordless | Magic links first | Simplest UX |
| Protocol future | OIDC (not SAML) | Modern, JSON-based |

---

## Comparison at a Glance

### By Implementation Effort

| Effort | Options |
|--------|---------|
| **Low (2-4h)** | OAuth 2.0, Session cookies |
| **Low-Medium (1-2d)** | Magic links, Better Auth |
| **Medium (3-5d)** | OIDC + Authentik, WebAuthn |
| **High (5-10d)** | SAML, Keycloak |

### By Maintenance Burden

| Burden | Options |
|--------|---------|
| **None** | OAuth 2.0 (provider managed) |
| **Low** | Magic links, Better Auth, WebAuthn |
| **Medium** | OIDC + Authentik, Keycloak |
| **High** | Custom session + JWT |

### By Enterprise Readiness

| Level | Options |
|-------|---------|
| **MVP** | OAuth 2.0, Magic links, Better Auth |
| **Scaling** | Better Auth + Authentik, OIDC |
| **Enterprise** | Authentik, Keycloak, SAML |

---

## Technology Recommendations

### Libraries for Node.js/TanStack

| Library | Use | Status | Recommendation |
|---------|-----|--------|---|
| **Better Auth** | Full auth framework | Active | ✓ Primary |
| **oslo** | Auth utilities | Maintained | ✓ Secondary |
| **@simplewebauthn** | WebAuthn/passkeys | Active | ✓ Phase 2 |
| **Lucia v3** | Session mgmt | Archived (Mar 2025) | ✗ Avoid |
| **Passport.js** | Auth middleware | Legacy | Marginal |
| **Resend** | Email delivery | SaaS | ✓ For magic links |

### Self-Hosted IdPs (if Phase 2+)

| IdP | Effort | Best For | Status |
|-----|--------|----------|--------|
| **Authentik** | Medium | Small teams, OIDC | ✓ Recommended |
| **Keycloak** | High | Enterprise, both OIDC+SAML | Over-engineered for small team |
| **Dex** | Medium | Lightweight OIDC | Good alternative if minimal features |

---

## Security Checklist

Regardless of approach, verify:

- [ ] HTTPS only in production
- [ ] CSRF protection (SameSite cookies, CSRF tokens)
- [ ] Rate limiting on auth endpoints
- [ ] Secure token generation (32+ chars, crypto.random)
- [ ] Token/session expiration (15-30 min sensitive, longer for refresh)
- [ ] Email verification for magic links
- [ ] Password hashing (argon2, scrypt, bcrypt) if using passwords
- [ ] Audit logging (who/when authenticated)
- [ ] Account recovery mechanism
- [ ] Refresh token rotation (if using JWT)

---

## PostgreSQL Planning

All approaches use PostgreSQL for either:
1. **App-side tables**: users, sessions (for OAuth, magic links, basic auth)
2. **IdP-side**: Authentik/Keycloak manages schema (separate instance)

Typical starter schema:

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

-- Index for cleanup queries
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

---

## Next Steps for Implementation

### Phase 1: Immediate (This Sprint)

```markdown
- [ ] Choose: GitHub OAuth or Magic Links
- [ ] Set up environment variables
- [ ] Create PostgreSQL schema
- [ ] Implement auth routes in TanStack Start
- [ ] Test happy path + edge cases (token expiry, invalid input)
- [ ] Document secrets rotation process
```

### Phase 2: Optional (Next Sprint)

```markdown
- [ ] If started with OAuth: add Magic Links as fallback
- [ ] If started with Magic Links: add GitHub OAuth option
- [ ] Implement logout
- [ ] Add password reset (if passwords used)
- [ ] Set up monitoring (auth endpoint metrics)
```

### Phase 3: Enterprise Ready (Later)

```markdown
- [ ] Deploy Authentik on self-hosted Linux
- [ ] Configure PostgreSQL + Redis for Authentik
- [ ] Set up OIDC app in Authentik
- [ ] Integrate Better Auth with Authentik OIDC
- [ ] Migrate users to federated identity
- [ ] Keep OAuth/magic links as secondary methods
```

---

## Key Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Protocol (long-term) | OIDC (not SAML) | Modern, JSON, easier for small team |
| IdP (if needed) | Authentik (not Keycloak) | Simpler UI, visual flows, lower resource use |
| Auth library | Better Auth (not NextAuth/Lucia) | Modern, actively maintained, Node-first |
| Session storage | PostgreSQL (not Redis alone) | Persistent, already deployed |
| Passwordless preference | Magic links first → WebAuthn later | Simpler entry point, phased approach |
| Vendor dependency | Self-hosted where possible | Data control, aligns with Linux infrastructure |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Email service down (magic links) | Keep GitHub OAuth as fallback |
| Authentik down (OIDC) | Sessions continue to work, fallback to magic links |
| PostgreSQL down | All auth methods fail (fundamental) |
| New team member can't log in | Magic links work, slower but no dependency |
| OAuth rate limits | Low risk for 3-10 person team |

---

## Related Documentation

For specific implementation, see:
- **[SETTING_UP_BETTERAUTH_TANSTACK.md](SETTING_UP_BETTERAUTH_TANSTACK.md)** (if created)
- **[docs/plans/](../plans)** — Architecture decisions
- **[docs/ARCHITECTURE.md](../ARCHITECTURE.md)** — System overview

---

**Tags**: #authentication #sso #oidc #oauth #passwordless #tanstack #better-auth #authentik #postgres

Last Updated: March 14, 2026
