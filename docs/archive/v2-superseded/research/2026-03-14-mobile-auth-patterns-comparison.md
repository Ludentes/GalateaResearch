# Mobile Auth Patterns: Comparison Matrix (2026)

**Quick reference for evaluating authorization approaches by use case**

---

## Pattern Comparison Table

| Factor | OAuth 2.0 PKCE | JWT Tokens | Magic Link | Device Service Account | Session-Based |
|--------|---|---|---|---|---|
| **Setup Time** | 3-5 days | 4-6 days | 2-3 days | 1-2 days | 2-3 days |
| **Complexity** | ⭐⭐⭐ Moderate | ⭐⭐⭐ Moderate | ⭐⭐ Simple | ⭐ Very Simple | ⭐⭐ Simple |
| **Security** | ⭐⭐⭐⭐⭐ Excellent | ⭐⭐⭐⭐ High | ⭐⭐⭐⭐ High | ⭐⭐⭐ Medium | ⭐⭐⭐⭐ High |
| **Requires Internet** | YES (init) | YES (init) | YES (code) | YES (device reg) | YES (all) |
| **Offline Support** | ⭐ None | ⭐⭐ Limited | ⭐ None | ⭐⭐⭐ With queue | ⭐ None |
| **Token Refresh** | Auto (SDK) | Manual (401) | N/A | Manual (daily) | Session timeout |
| **Suitable for Kiosk** | ❌ No | ⭐⭐ Possible | ⭐⭐ Possible | ⭐⭐⭐⭐⭐ Yes | ❌ No |
| **Suitable for User Auth** | ⭐⭐⭐⭐⭐ Yes | ⭐⭐⭐⭐ Yes | ⭐⭐⭐⭐ Yes | ❌ No | ⭐⭐⭐ Yes |
| **Biometric Unlock** | YES | YES | YES | NO | NO |
| **Session Persistence** | ✓ SDK manages | Manual (Keychain) | Manual (Keychain) | Manual (Keychain) | Cookie-based |
| **Token Storage** | Keychain + Memory | Refresh: Keychain, Access: Memory | Refresh: Keychain | Keychain | HTTPOnly Cookie |
| **Stateless Server** | YES | YES | NO (tracking) | YES | NO (session DB) |
| **Revocation Support** | YES (immediate) | YES (blacklist) | YES (code expiry) | YES (via API) | YES (delete session) |
| **Mobile-Friendly** | ⭐⭐⭐⭐ Great | ⭐⭐⭐⭐ Great | ⭐⭐⭐ Good | ⭐⭐⭐⭐⭐ Perfect | ⭐⭐⭐ Good |
| **Deep Linking Needed** | YES | Maybe | YES (optional) | NO | NO |
| **MFA Compatible** | YES | YES | NO (link is MFA) | NO | YES |
| **Social Login** | YES (multiple) | YES (custom) | NO | NO | YES (custom) |
| **Battery Impact** | Low | Medium (refresh) | Low | Medium (24/7) | Low |
| **Data Transfer Cost** | Low | Low | Low | High (polling) | Low |

---

## Security Depth: Layer-by-Layer

| Pattern | Layer 0 (LLM Safety) | Layer 1 (Guardrail) | Layer 2 (Hard Rules) | Overall |
|---------|---|---|---|---|
| **OAuth PKCE** | ✓ Password never exposed | ✓ Code challenge | ✓ Scope limits, HTTPS required | ⭐⭐⭐⭐⭐ |
| **JWT** | ✓ Token validation | ⚠️ Requires custom checks | ✓ Refresh token rotation | ⭐⭐⭐⭐ |
| **Magic Link** | ✓ Code single-use | ⚠️ Email intercept risk | ✓ Time expiry | ⭐⭐⭐⭐ |
| **Device Account** | ⚠️ API key exposure | ⚠️ Device compromise | ⚠️ Key rotation needed | ⭐⭐⭐ |
| **Session** | ✓ Server-side state | ✓ HTTPOnly prevents XSS | ⚠️ Scaling requires Redis | ⭐⭐⭐⭐ |

---

## Offline Support: Feature Comparison

| Scenario | OAuth PKCE | JWT | Magic Link | Device Account | Session |
|----------|---|---|---|---|---|
| **Offline: Token Valid** | YES (if cached) | YES (access token) | YES (token cached) | YES (API key) | YES (session cached) |
| **Offline: Token Expired** | NO (refresh fails) | NO (no refresh) | NO (no refresh) | MAYBE (key rotation fail) | NO (no session check) |
| **Offline: New Login** | NO (requires browser) | NO (requires server) | NO (requires email) | NO (requires server) | NO (requires server) |
| **Offline: Queue Requests** | Manual (client code) | Manual (client code) | Manual (client code) | YES (recommended) | Manual (client code) |
| **Cold Start Offline** | ❌ Session lost | ❌ Session lost | ❌ Session lost | ✓ Works (with key) | ❌ Session lost |
| **Graceful Degradation** | Show cached content | Show cached content | Show cached content | Read-only mode | Show cached content |

---

## Use Case Matrix: Best Pattern for Each Scenario

### Device-Based (Kiosk, Player, Embedded)

```
┌─────────────────────┬──────────────────────┬────────────────┬──────────┐
│ Scenario            │ Best Pattern         │ Runner-Up      │ Score    │
├─────────────────────┼──────────────────────┼────────────────┼──────────┤
│ Guide Kiosk         │ Device Service Acct  │ JWT + Queue    │ 9.5/10   │
│ Player (24/7)       │ Device Service Acct  │ JWT Scheduled  │ 9/10     │
│ Vending Machine     │ Device Service Acct  │ API Key        │ 9/10     │
│ Smart TV            │ Device Service Acct  │ JWT + Offline  │ 8.5/10   │
│ POS Terminal        │ Device Service Acct  │ OAuth (device) │ 9/10     │
└─────────────────────┴──────────────────────┴────────────────┴──────────┘
```

### User-Based (Authentication Required)

```
┌─────────────────────┬──────────────────────┬────────────────┬──────────┐
│ Scenario            │ Best Pattern         │ Runner-Up      │ Score    │
├─────────────────────┼──────────────────────┼────────────────┼──────────┤
│ Consumer App        │ OAuth PKCE (Google)  │ Magic Link     │ 9.5/10   │
│ Team App (Internal) │ Magic Link           │ OAuth          │ 8.5/10   │
│ Admin Dashboard     │ OAuth PKCE + Biom    │ JWT Custom     │ 9/10     │
│ SaaS App            │ OAuth PKCE           │ JWT Custom     │ 9/10     │
│ Freelancer Tool     │ Magic Link           │ OAuth          │ 8/10     │
│ Enterprise (SSO)    │ SAML OAuth           │ Magic Link     │ 9/10     │
└─────────────────────┴──────────────────────┴────────────────┴──────────┘
```

---

## Implementation Cost Breakdown

### Device Service Account Pattern
**Total Cost: ~$1-2K + 2-3 days dev**

| Phase | Effort | Cost |
|-------|--------|------|
| Backend setup (device registration) | 4-8 hours | $600-1200 |
| Token generation + storage | 2-4 hours | $300-600 |
| Client implementation | 4-8 hours | $600-1200 |
| Offline queue (optional) | 4-8 hours | $600-1200 |
| Testing + deployment | 4-8 hours | $600-1200 |
| **Total** | **18-36 hours** | **$1.7-3.4K** |

### OAuth PKCE Pattern
**Total Cost: ~$3-5K + 3-5 days dev**

| Phase | Effort | Cost |
|-------|--------|------|
| OAuth provider setup | 2-4 hours | $300-600 |
| App integration (PKCE flow) | 8-12 hours | $1200-1800 |
| Deep linking (various schemes) | 4-6 hours | $600-900 |
| Biometric unlock (optional) | 4-8 hours | $600-1200 |
| Testing (multiple providers) | 6-10 hours | $900-1500 |
| **Total** | **24-40 hours** | **$3.6-6K** |

### Magic Link Pattern
**Total Cost: ~$1.5-3K + 2-3 days dev**

| Phase | Effort | Cost |
|-------|--------|------|
| Email service (Resend, SendGrid) | 2-4 hours | $300-600 |
| Backend logic (code generation, validation) | 4-8 hours | $600-1200 |
| Client implementation | 4-8 hours | $600-1200 |
| Link routing + deeplink | 4-6 hours | $600-900 |
| Testing | 4-6 hours | $600-900 |
| **Total** | **18-32 hours** | **$2.7-4.8K** |

---

## Token Lifetime Recommendations

### By Pattern and Use Case

| Pattern | Use Case | Access Token | Refresh Token | Refresh Strategy |
|---------|----------|---|---|---|
| **OAuth PKCE** | Consumer | 1 hour (SDK) | 30 days | Auto by SDK |
| **OAuth PKCE** | Admin | 15 min | 7 days | On 401 + foreground |
| **JWT** | Kiosk | 24 hours | 30 days | Daily scheduled |
| **JWT** | Admin | 15 min | 7 days | On 401 + schedule |
| **Magic Link** | Consumer | Session (8 hours) | - | On link click |
| **Device Account** | Kiosk | 30 days | - | Monthly or demand |
| **Session** | Web | Browser session | - | Server timeout |

---

## Offline Support Strategies Ranked

| Strategy | Implementation | Offline Duration | Complexity | Use Case |
|----------|---|---|---|---|
| **Cache + Queue** | ⭐⭐⭐⭐ Good | 2-4 hours (token TTL) | Medium | Device auth + retry |
| **Local SQLite Sync** | ⭐⭐⭐⭐⭐ Best | Indefinite | High | True offline-first |
| **Token Fallback** | ⭐⭐ Basic | Token TTL (~15min) | Low | Simple read-only |
| **Service Worker** | ⭐⭐⭐ Good | ~ 30 min (cache) | Medium | Web only |
| **Realm/SQLite** | ⭐⭐⭐⭐ Good | ~ 1 week (local) | High | Complex data |

---

## Quick Decision Rules

**Choose OAuth PKCE if:**
- User authentication needed
- Multiple social login options desired
- Enterprise/consumer app
- Willing to handle deep linking complexity

**Choose JWT if:**
- Full control over backend needed
- Custom auth flow required
- Offline support important
- Want to avoid dependency on provider

**Choose Magic Link if:**
- Fast implementation critical
- User friction acceptable (email step)
- Passwordless preferred
- Email delivery reliable

**Choose Device Service Account if:**
- Device/kiosk auth (not user)
- Long-lived token OK
- Single device identity
- Offline support needed (with queue)

**Choose Session-Based if:**
- Web-first app (not mobile primary)
- Server-side state OK
- Scaling not a concern
- Cookie handling acceptable

---

## Checklist: Before You Choose

```
AUTHENTICATION READINESS CHECKLIST
==================================

□ Network Reliability
  ├─ How often do users lose connectivity?
  ├─ Can app queue requests (async)?
  └─ Is read-only acceptable offline?

□ User Expectations
  ├─ How often do users restart app?
  ├─ Will they notice slow auth?
  └─ Do they have password manager?

□ Security Requirements
  ├─ Need MFA support?
  ├─ Social login required?
  ├─ Enterprise SSO needed?
  └─ Compliance requirements (SOC2, HIPAA)?

□ Development Resources
  ├─ How much time available?
  ├─ Team familiarity with OAuth?
  ├─ Can support external dependencies?
  └─ Testing capacity (multiple providers)?

□ Infrastructure
  ├─ Building custom backend?
  ├─ Using managed service?
  ├─ Need token refresh endpoint?
  └─ How to scale auth service?

□ Long-term Vision
  ├─ Will this support multi-device?
  ├─ Plan for device management (kiosk fleet)?
  ├─ Need audit logs?
  └─ Future compliance requirements?
```

---

## Red Flags & Gotchas

| Pattern | Red Flag | Mitigation |
|---------|----------|-----------|
| **OAuth PKCE** | Deep link misconfiguration → silent failure | Test on real devices, multiple schemes |
| **OAuth PKCE** | Browser UI slowdown (WebView) | Use `expo-web-browser` (native browser) |
| **JWT** | Token expiry not validated → expired token used | Check expiry locally before use |
| **Magic Link** | Email rate-limited or spammed → user locked out | Implement backoff + alternative auth |
| **Device Account** | API key leaked → device compromised | Rotation every 3-6 months + monitoring |
| **Device Account** | No user identity → hard to debug → user identity → hard to debug issues | Log device ID + IP for forensics |

---

## Migration Path: From Simple to Secure

```
Phase 1 (Week 1): Quick MVP
└─ Magic Link + Keychain
   └─ 2-3 days, basic security, good UX
   └─ Limitation: Email required

       ↓ (if email unreliable or SSO needed)

Phase 2 (Week 2-3): Scale
└─ OAuth PKCE + Biometric
   └─ 3-5 days, standard pattern, good security
   └─ Limitation: Deep linking complexity

       ↓ (if offline critical)

Phase 3 (Week 3-4): Enterprise
└─ OAuth PKCE + MFA + Token Rotation
   └─ Add TOTP, SMS, Passkeys
   └─ Limitation: Implementation effort

       ↓ (if custom control needed)

Phase 4 (Week 4+): Custom Backend
└─ JWT + WatermelonDB (offline) + Custom MFA
   └─ Full control, offline, flexible
   └─ Limitation: Maintenance burden
```

---

## Cost-Benefit Matrix

```
                    Low Cost  Medium Cost  High Cost
High Security       JWT       OAuth PKCE   Enterprise
Medium Security     Magic Link OAuth PKCE  Custom
Low Security        API Key   Magic Link   N/A
```

**Sweet Spot:** OAuth PKCE + Magic Link (depends on use case)

---

**Last Updated:** 2026-03-14
**Format:** Quick-reference comparison table
**Use:** Helping decide which auth pattern fits your use case
