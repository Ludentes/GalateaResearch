# SSO Quick Reference for TanStack Start + PostgreSQL

**Last Updated**: March 14, 2026

## Decision Matrix: At a Glance

| Approach | Implementation | Maintenance | Best For | Risk |
|----------|---|---|---|---|
| **OAuth 2.0 (GitHub/GitLab)** | Low | None | Quick MVP, dev team | Vendor lock-in (weak) |
| **Magic Links (Email)** | Low | Low | Internal app, small team | No backup auth method |
| **Better Auth + Sessions** | Low-Medium | Low | Modern, full-featured | Less mature than NextAuth |
| **OIDC + Authentik** | Medium | Medium | Enterprise-ready, SSO | Complex setup, infra overhead |
| **OIDC + Keycloak** | Medium-High | High | Maximum features | Learning curve, resource-heavy |
| **SAML** | Medium-High | Medium | Enterprise legacy | Overkill for small team |
| **WebAuthn/Passkeys** | Medium-High | Medium | Passwordless future | Limited browser support, recovery complex |
| **Session cookies + JWT** | Low | Low | Simple, no IdP | Limited to single app |

---

## Quick Lookup by Scenario

### Scenario 1: "I need SSO working this sprint"

**Recommendation**: OAuth 2.0 (GitHub) or magic links

**Setup time**: 2-4 hours
**Stack**:
- TanStack Start
- GitHub OAuth provider
- Simple session management
- PostgreSQL for user table

**Code example** (conceptual):
```typescript
// Route: /api/auth/github/callback
const { code } = query
const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
  method: "POST",
  headers: { Accept: "application/json" },
  body: JSON.stringify({ client_id, client_secret, code })
})
const { access_token } = await tokenResponse.json()
// Fetch user profile, create session, redirect
```

**Pros**: Dead simple, no IdP to manage
**Cons**: Team must use GitHub, no self-contained auth

---

### Scenario 2: "I want proper SSO but no vendor lock-in"

**Recommendation**: Better Auth + PostgreSQL sessions + (optionally) OAuth

**Setup time**: 1-2 days
**Stack**:
- TanStack Start
- Better Auth library
- PostgreSQL for sessions & user data
- Optional: GitHub OAuth connector within Better Auth

**Why**: Better Auth is actively maintained, designed for modern Node.js, includes plugins for everything (2FA, magic links, social auth), and uses PostgreSQL by default.

**Pros**: Modern, flexible, no vendor dependency
**Cons**: Newer project (less battle-tested than NextAuth)

---

### Scenario 3: "I need enterprise OIDC for future growth"

**Recommendation**: Better Auth (client) + self-hosted Authentik (IdP)

**Setup time**: 3-5 days
**Architecture**:
```
TanStack Start
    ↓
Better Auth (OIDC client)
    ↓
Authentik (self-hosted IdP)
    ↓
PostgreSQL + Redis
```

**Why Authentik over Keycloak**:
- Modern UI (Keycloak console is intimidating)
- Visual flow builder (no YAML needed)
- Smaller resource footprint
- Faster for teams <50 people

**Pros**: Enterprise-ready, full control, OIDC standard
**Cons**: Extra infrastructure (Authentik + Redis), more complex

---

### Scenario 4: "We're a legacy enterprise with SAML requirement"

**Recommendation**: Authentik (SAML mode) or Keycloak

**Setup time**: 5-10 days
**Why this over others**:
- Enterprise applications already ship with SAML client support
- XML assertions are standard in large orgs
- Robust for workforce SSO (HR/payroll systems)

**Pros**: Integrates with enterprise systems (Okta, Ping, AD)
**Cons**: XML is verbose, certificate management is manual, overkill for small teams

---

### Scenario 5: "Passwordless only — no passwords at all"

**Recommendation**: Better Auth + magic links (Phase 1) → WebAuthn/passkeys (Phase 2)

**Phase 1 (this sprint)**: Magic links
- User enters email
- Generates time-limited token (15-30 min)
- Sends link via email (Resend, Nodemailer, SendGrid)
- Click link = verified session

**Phase 2 (next quarter)**: Add WebAuthn
- Use `@simplewebauthn` library
- Still include magic links as fallback
- Biometric/platform authenticator (MacBook Touch ID, Windows Hello, Android face)

**Why this order**:
- Magic links are simple, low-friction entry point
- WebAuthn adds complexity but better UX once established

**Pros**: No passwords = simpler security model, better UX
**Cons**: WebAuthn recovery is complex, email dependency for magic links

---

## PostgreSQL Requirements by Approach

| Approach | Schema Needed | Tables | Indexed Columns |
|---|---|---|---|
| OAuth 2.0 | Yes | `users`, `oauth_accounts` | `oauth_accounts.user_id`, `users.email` |
| Magic Links | Yes | `users`, `magic_tokens` | `magic_tokens.token` (unique), `magic_tokens.expires_at` |
| Better Auth | Yes | Multiple (auto-generated) | Multiple, handled by library |
| Authentik/Dex | No (IdP manages) | N/A | N/A (IdP separate) |
| WebAuthn | Yes | `users`, `passkeys` | `passkeys.user_id`, `passkeys.credential_id` |

---

## Recommended Path for Galatea

**Sprint 1-2 (Immediate)**:
```
☐ Implement magic links + sessions (Better Auth or custom)
☐ PostgreSQL schema for users + sessions
☐ Simple email sending (Resend recommended)
```

**Sprint 3-4 (Optional GitHub OAuth)**:
```
☐ Add OAuth 2.0 GitHub connector
☐ Allow team to "sign in with GitHub"
☐ Keep magic links as fallback
```

**Sprint 5+ (If enterprise SSO needed)**:
```
☐ Deploy Authentik on self-hosted Linux
☐ Configure PostgreSQL + Redis for Authentik
☐ Migrate to OIDC + Better Auth
☐ Keep GitHub OAuth as secondary method
```

---

## Libraries/Tools for TanStack Start

| Tool | Purpose | Status | Recommendation |
|---|---|---|---|
| **Better Auth** | Full auth framework | Active | ✓ Primary choice |
| **oslo** | Auth utilities | Maintenance | ✓ Good for magic links |
| **Lucia v3** | Session management | Archived/Deprecated | ✗ Avoid (archived March 2025) |
| **NextAuth/Auth.js** | Auth framework | Active (merged into Better Auth) | ✓ Alternative if needed |
| **@simplewebauthn** | WebAuthn impl | Active | ✓ For passkeys later |
| **Resend** | Email delivery | Active SaaS | ✓ Recommended for magic links |
| **Authentik** | Self-hosted IdP | Active | ✓ For OIDC Phase 2 |
| **Keycloak** | Enterprise IdP | Active | Overkill for small team |
| **Dex** | Lightweight OIDC | Active | ✓ Lightweight alternative |

---

## Security Checklist

Whatever you choose, ensure:

- [ ] Tokens/sessions expire (15-30 min for sensitive, longer for refresh)
- [ ] HTTPS only (no HTTP in production)
- [ ] CSRF protection (SameSite cookies, CSRF tokens for magic links)
- [ ] Rate limiting on auth endpoints (prevent brute force)
- [ ] Password hashing if using passwords (argon2, scrypt, bcrypt)
- [ ] Email verification before session creation (magic links validate this)
- [ ] Secure token generation (cryptographically random)
- [ ] Session storage encrypted in PostgreSQL (or rely on SSL transport)
- [ ] Audit logging (who logged in when)
- [ ] Account recovery mechanism (backup email, recovery codes)

---

## Next Deep Dives

For detailed analysis, see:
- **2026-03-14-sso-provider-comparison.md** — Full provider breakdown
