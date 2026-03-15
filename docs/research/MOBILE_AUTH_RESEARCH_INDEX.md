# Mobile Authorization Research Index

**Comprehensive research on mobile auth patterns, offline-first architecture, and Galatea-specific recommendations**

---

## Documents Overview

### 1. **2026-03-14-mobile-authorization-comprehensive.md** (36 KB)
**Deep-dive technical reference**

Covers all five common authorization patterns with detailed analysis:
- OAuth 2.0 with PKCE (standard for user auth)
- JWT token-based (best for control + offline)
- Magic link authentication (quick, passwordless)
- Session-based auth (web-first pattern)
- Multi-factor authentication (TOTP, SMS, passkeys)

**Key sections:**
- Part 2: Mobile-specific considerations (offline, token storage, deep linking, battery efficiency)
- Part 3: Implementation complexity vs security tradeoffs (quick approaches vs hardened)
- Part 5: Offline-first architecture with WatermelonDB pattern
- Part 7: Security checklist (token storage, lifecycle, monitoring)
- Part 9: Quick-start templates (device service account, OAuth PKCE, offline queue)

**Best for:** Architecture decisions, security review, detailed pattern evaluation

---

### 2. **2026-03-14-mobile-auth-patterns-comparison.md** (13 KB)
**Quick-reference comparison matrices**

Structured comparisons across multiple dimensions:
- Pattern comparison table (OAuth vs JWT vs Magic Link vs Device Account vs Session)
- Security depth (layer-by-layer analysis)
- Offline support strategies ranked
- Use case matrices (device-based vs user-based)
- Implementation cost breakdown
- Token lifetime recommendations

**Key sections:**
- Quick decision rules (when to choose each pattern)
- Checklist before choosing (readiness assessment)
- Red flags & gotchas (common mistakes)
- Migration path (from simple MVP to enterprise)

**Best for:** Quick decisions, cost estimates, comparing trade-offs

---

### 3. **guides/MOBILE_AUTH_FOR_GALATEA.md** (20 KB)
**Actionable implementation guide for Galatea use cases**

Specific recommendations + code samples for three scenarios:

**Use Case 1: Guide-Controlled Kiosk**
- Pattern: Device Service Account (simple, offline-friendly)
- Implementation: Device registration → credential storage → offline queue
- Code: Registration endpoint, SecureStore setup, offline queue with sync

**Use Case 2: Kiosk Player App**
- Pattern: JWT with Scheduled Refresh (24/7 uptime)
- Implementation: Token refresh loop, error reporting, graceful handling
- Code: Initialization, scheduled refresh, content fetch with fallback

**Use Case 3: Admin Dashboard (Mobile)**
- Pattern: OAuth 2.0 PKCE + Biometric Unlock (standard, secure)
- Implementation: OAuth flow, biometric unlock, auto-refresh on foreground
- Code: OAuth initialization, biometric flow, API client with retry

**Each use case includes:**
- Requirements analysis
- Why that pattern
- Step-by-step implementation
- Testing checklist
- Troubleshooting guide

**Best for:** Starting implementation, copy-paste code examples, testing strategies

---

### 4. **2026-03-14-expo-mobile-authentication-research.md**
*Referenced from existing docs*

Provider-specific deep dive (Clerk, Firebase, Auth0, Supabase, Cognito). See existing document for:
- Current state-of-the-art (March 2026)
- Provider comparison table
- Pros/cons of each
- Setup complexity
- Expo Go compatibility

**Best for:** Evaluating managed auth services (if choosing provider route)

---

## Quick Navigation

### By Question

**"Which pattern should I use?"**
→ Start: `2026-03-14-mobile-auth-patterns-comparison.md` (Decision Rules section)

**"How do I implement auth for [use case]?"**
→ Start: `guides/MOBILE_AUTH_FOR_GALATEA.md` (match your use case)

**"What are the security implications?"**
→ Start: `2026-03-14-mobile-authorization-comprehensive.md` (Part 7 Security Checklist)

**"How does offline work?"**
→ Start: `2026-03-14-mobile-authorization-comprehensive.md` (Part 5 Offline-First)

**"What's the cost/timeline?"**
→ Start: `2026-03-14-mobile-auth-patterns-comparison.md` (Implementation Cost Breakdown)

**"Which auth provider should I use?"**
→ Start: `2026-03-14-expo-mobile-authentication-research.md` (Provider comparison)

---

### By Use Case

**Guide Kiosk (device, offline, no login screen)**
→ `guides/MOBILE_AUTH_FOR_GALATEA.md` → Use Case 1
→ Pattern: Device Service Account
→ Complexity: Simple
→ Time: 2-3 days

**Player Kiosk (24/7, automated, headless)**
→ `guides/MOBILE_AUTH_FOR_GALATEA.md` → Use Case 2
→ Pattern: JWT with Scheduled Refresh
→ Complexity: Moderate
→ Time: 2-3 days

**Admin Dashboard (user auth, mobile, occasional use)**
→ `guides/MOBILE_AUTH_FOR_GALATEA.md` → Use Case 3
→ Pattern: OAuth PKCE + Biometric
→ Complexity: Moderate
→ Time: 3-5 days

---

### By Technical Topic

| Topic | Document | Section |
|-------|----------|---------|
| OAuth 2.0 flow | Comprehensive | Part 1 Pattern 1 |
| JWT tokens | Comprehensive | Part 1 Pattern 2 |
| Magic links | Comprehensive | Part 1 Pattern 4 |
| Token storage security | Comprehensive | Part 2.2 |
| Token refresh strategies | Comprehensive | Part 2.3 |
| Session persistence | Comprehensive | Part 2.4 |
| Deep linking | Comprehensive | Part 2.5 |
| Offline architecture | Comprehensive | Part 5 |
| Offline queue implementation | MOBILE_AUTH_FOR_GALATEA | Use Case 1 Step 5 |
| Security checklist | Comprehensive | Part 7 |
| Device registration | MOBILE_AUTH_FOR_GALATEA | Use Case 1 Step 1-2 |
| Biometric unlock | MOBILE_AUTH_FOR_GALATEA | Use Case 3 |

---

## Key Findings Summary

### Offline-First is Hard

**Finding:** No major provider (Firebase, Supabase, Auth0, Cognito) handles offline session restoration well.

**Why:** SDK tries to refresh token while offline, fails, clears session. User must re-authenticate when online.

**Solution:** Custom implementation with token caching + validation before refresh.

---

### Device Auth ≠ User Auth

**Finding:** Kiosk and player apps need device-level auth, not user login.

**Why:** Device is trusted system; person operating it is not authenticated entity.

**Pattern:** API Key (long-lived) or Device Service Account (renewable), not OAuth.

---

### Token Storage is Critical

**Finding:** AsyncStorage is plaintext and compromisable within minutes on rooted device.

**Why:** Device backups, USB debugging, app repackaging all expose AsyncStorage.

**Pattern:** Keychain (iOS) or Keystore (Android) for refresh tokens; memory only for access tokens.

---

### Biometric Unlocking Adds UX Without Sacrificing Security

**Finding:** Biometric on top of OAuth doesn't compromise security; only adds convenience.

**Pattern:** Login with OAuth once → biometric unlock on subsequent opens → refresh token on foreground.

---

### Deep Linking is Fragile

**Finding:** OAuth deep linking requires exact URL match across dev/prod builds.

**Why:** One character wrong = auth fails silently.

**Pattern:** Use browser-based OAuth (safer) or carefully manage schemes in eas.json.

---

## Recommendations Summary

### For Guide Kiosk
- ✅ **Device Service Account** — Simple, offline-friendly
- Offline via request queue ✓
- No user login screen ✓
- Credentials stored securely ✓

### For Player Kiosk
- ✅ **JWT with Scheduled Refresh** — Predictable for 24/7
- Automatic token refresh every hour ✓
- Monitor failures remotely ✓
- Handle token expiry gracefully ✓

### For Admin Dashboard
- ✅ **OAuth PKCE + Biometric** — Industry standard
- Biometric unlock on foreground ✓
- Auto-refresh before expiry ✓
- Works with any OAuth provider ✓

---

## Implementation Complexity Ranking

| Pattern | MVP | Balanced | Enterprise |
|---------|-----|----------|-----------|
| **Device Service Account** | 2-3 days | 3-4 days | 4-5 days (+ monitoring) |
| **JWT** | 3-4 days | 4-6 days | 5-7 days (+ MFA) |
| **OAuth PKCE** | 3-5 days | 4-6 days | 6-8 days (+ MFA) |
| **Magic Link** | 2-3 days | 3-4 days | 4-5 days (+ MFA) |
| **Session-Based** | 2-3 days | 3-4 days | 4-5 days (+ Redis) |

---

## Security Depth Progression

```
Layer 0: LLM guardrails (free, built-in)
  └─ Handles: General harmful content, basic injection resistance

Layer 0.5: Local guardrail model (Ollama, optional)
  └─ Handles: Specialized safety classification independent of Layer 0

Layer 1: Homeostasis / soft safety (domain-aware)
  └─ Handles: Social engineering, gradual boundary erosion, context-dependent risks

Layer 2: Hard guardrails (deterministic)
  └─ Handles: Workspace boundaries, branch restrictions, trust levels

Client Side: Token storage + validation
  └─ Handles: Secure storage (Keychain), token expiry checking, offline fallback

Server Side: Token rotation + monitoring
  └─ Handles: Refresh token rotation, audit logging, anomaly detection
```

---

## Decision Tree (TL;DR)

```
START: Mobile auth for what?

├─ Device-based (kiosk, player, hardware)
│  ├─ Offline critical? → Device Service Account + Queue
│  └─ Offline not critical? → JWT + Scheduled Refresh
│
├─ User-based (consumer app, admin dashboard)
│  ├─ Quick MVP? → Magic Link
│  ├─ Standard pattern? → OAuth PKCE
│  └─ Full control? → Custom JWT Backend
│
└─ Don't know yet?
   → Read: 2026-03-14-mobile-auth-patterns-comparison.md
     (Decision Rules section)
```

---

## References to Other Galatea Docs

- `docs/ARCHITECTURE.md` — Trust matrix, safety layers, hard blocks
- `docs/plans/2026-03-11-beta-simulation-design.md` — User models, personas
- `docs/memory/MEMORY.md` — Decision patterns for auth (from memory folder)

---

## Files in This Series

```
docs/research/
├── 2026-03-14-mobile-authorization-comprehensive.md (36 KB)
├── 2026-03-14-mobile-auth-patterns-comparison.md (13 KB)
├── MOBILE_AUTH_RESEARCH_INDEX.md (this file)
│
docs/guides/
└── MOBILE_AUTH_FOR_GALATEA.md (20 KB)

docs/research/ (existing)
└── 2026-03-14-expo-mobile-authentication-research.md
```

**Total:** 69 KB of focused mobile auth research

---

## How to Use This Research

1. **First visit:** Read this index (you're here)
2. **Decision phase:** Read `mobile-auth-patterns-comparison.md`
3. **Design phase:** Read `mobile-authorization-comprehensive.md`
4. **Implementation phase:** Read `guides/MOBILE_AUTH_FOR_GALATEA.md` (for your use case)
5. **Troubleshooting:** Use troubleshooting sections in MOBILE_AUTH_FOR_GALATEA.md

---

**Last Updated:** 2026-03-14
**Status:** Current, ready for reference
**Coverage:** OAuth, JWT, Magic Link, Device Service Accounts, Session-Based Auth
**Scope:** Mobile (iOS/Android), React Native, Expo
**Use Cases:** Kiosk, Player, Admin Dashboard, Consumer Apps
