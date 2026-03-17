# Mobile Authorization Patterns & Architecture (2026)

**Date:** 2026-03-14
**Scope:** Mobile application authorization (iOS/Android/React Native)
**Focus:** Offline-first considerations, token management, multi-use-case strategies
**Updated:** Synthesizes industry patterns with Galatea use-case specifics

---

## Executive Summary

Mobile authorization in 2026 is fragmented across 5 major provider ecosystems, each optimized for different tradeoffs. This guide synthesizes:

1. **Common patterns** — OAuth 2.0 + PKCE, JWT tokens, session management
2. **Key mobile considerations** — Offline capability, secure storage, deep linking, battery efficiency
3. **Implementation complexity vs security tradeoffs** — Quick wins vs hardened approaches
4. **Use-case specifics** — Guide kiosk (device auth), player kiosk (headless), admin dashboard (user auth)
5. **Offline-first architecture** — When auth fails, what continues working?

**Key Finding:** No single provider solves offline-first mobile auth well. Firebase and Supabase have known issues. Custom backends with JWT + secure storage offer better control for offline scenarios.

---

## Part 1: Common Authorization Patterns

### Pattern 1: OAuth 2.0 with PKCE (Proof Key for Code Exchange)

**Why it's standard for native apps:**
- User never hands password to app (app only gets code)
- Code exchanged server-side for token
- Prevents man-in-the-middle attacks
- Works with deep linking / browser-based flows

**Flow:**

```
1. App opens browser to auth provider
2. User logs in at provider
3. Browser redirects to app with authorization code
4. App exchanges code for tokens (with PKCE code_verifier)
5. Tokens cached locally
6. Subsequent requests use token
```

**Pros:**
- Secure by design (password never leaves provider)
- Works with any OAuth provider (Google, Apple, GitHub, etc.)
- Browser handles UI (not your problem)

**Cons:**
- Requires internet connection for initial auth
- Browser-based flow creates delay (~2-5 seconds)
- Deep linking setup required (scheme, domain, path matching)
- Token refresh must be handled manually

**Implementation Complexity:** ⭐⭐⭐ Moderate
**Security:** ⭐⭐⭐⭐⭐ High
**Offline Support:** ⭐ None (requires initial connectivity)

---

### Pattern 2: JWT Token-Based Auth

**Core concept:** Short-lived access token + long-lived refresh token

```
Access Token (15 min):
  - Short lifetime
  - Stored in memory only
  - Sent with every request
  - Can't revoke individual tokens

Refresh Token (7-30 days):
  - Long lifetime
  - Stored in secure enclave (Keychain/Keystore)
  - Used to obtain new access tokens
  - Can be rotated on each refresh
```

**Typical flow:**

```
Login:
  POST /auth/login { email, password }
  ← { accessToken, refreshToken, expiresIn }

  Store: refreshToken → Keychain
          accessToken → Memory

API Request:
  GET /api/data
  Header: Authorization: Bearer {accessToken}

  Response: 200 OK ✓
  Response: 401 Unauthorized ✓
    → GET /auth/refresh { refreshToken }
    ← { accessToken, refreshToken }
    → Retry original request

Logout:
  DELETE /auth/session
  Clear: Memory (accessToken) + Keychain (refreshToken)
```

**Pros:**
- Stateless (no session database needed)
- Atomic revocation (just stop accepting token)
- Scalable (any server can verify JWT signature)
- Works offline (can validate token expiry locally)

**Cons:**
- Token can't be revoked until expiry (except via blacklist)
- Refresh token must be stored securely (Keychain, not AsyncStorage)
- Requires clock synchronization between client and server
- Refresh race conditions (multiple simultaneous requests)

**Implementation Complexity:** ⭐⭐⭐ Moderate
**Security:** ⭐⭐⭐⭐ High (if refresh tokens secured)
**Offline Support:** ⭐⭐ Partial (access token usable offline if not expired)

---

### Pattern 3: Session-Based Auth

**Core concept:** Server maintains session state; client stores session ID

```
Login:
  POST /auth/login { email, password }
  Server: Create session, store in Redis/DB
  ← Set-Cookie: sessionId=abc123; HttpOnly; Secure

API Request:
  GET /api/data
  Header: Cookie: sessionId=abc123
  Server: Check Redis → valid? ✓

Logout:
  POST /auth/logout
  Server: Delete session
  Client: Cookie cleared by HttpOnly flag
```

**Pros:**
- Simple to understand (session = logged-in state)
- Server controls everything (can revoke immediately)
- HttpOnly cookies prevent JavaScript access (XSS protection)
- Works with stateless API (CORS + credential mode)

**Cons:**
- Requires session storage on server (doesn't scale horizontally without shared Redis)
- Cookies don't work well with mobile (need explicit cookie handling)
- Requires HTTPS (cookies sent over HTTP are vulnerable)
- More stateful architecture

**Implementation Complexity:** ⭐⭐ Simple
**Security:** ⭐⭐⭐⭐ High (if HTTPS + HttpOnly)
**Offline Support:** ⭐ None (requires server validation)

---

### Pattern 4: Passwordless / Magic Link

**Core concept:** No password. Instead, email link or SMS code.

```
Request Auth:
  POST /auth/passwordless { email }
  Server: Generate 6-digit code + 10 min expiry
  Email: "Your code: 123456"

Verify Code:
  POST /auth/verify { email, code }
  ← { accessToken, refreshToken }

Or via link:
  Email: "Click here: https://app.com/verify?token=xyz"
  Browser: Redirects to app with token embedded
  App: Extracts token, stores in Keychain
```

**Pros:**
- No password to remember or reset
- Higher security (less credential exposure)
- Good UX (simpler than password entry)
- Works with biometric unlock (iOS FaceID, Android fingerprint)

**Cons:**
- Requires email/SMS delivery (can fail, delay)
- Code entry is 1-2 extra steps vs password
- Session linking required (ensure code is single-use)
- Biometric alone isn't auth (still requires some proof)

**Implementation Complexity:** ⭐⭐ Simple (provider handles delivery)
**Security:** ⭐⭐⭐⭐ High
**Offline Support:** ⭐ None

---

### Pattern 5: Multi-Factor Authentication (MFA)

**Standard flows (2026):**

```
1. TOTP (Time-based One-Time Password)
   - Authenticator app (Google Authenticator, Authy)
   - User scans QR, enters 6 digits every 30s
   - Highest security (biometric + something you know)

2. SMS
   - Server sends code via SMS
   - User enters code in app
   - Medium security (phone can be SIM-swapped)

3. Passkeys (iOS 16+, Android 15+)
   - Biometric unlock + public key encryption
   - No password, no backup codes
   - Strongest (if device is secure)

4. Push Approval
   - Server sends push notification
   - User taps "approve" in authenticator app
   - Good UX (no code entry)
```

**Pros:**
- Dramatically reduces account takeover (2 factors)
- Works with any password (if password compromised, account still safe)
- Passkeys eliminate password entirely

**Cons:**
- Extra step in login (slower UX)
- TOTP requires app to be pre-installed
- SMS unreliable (spam filters, SIM swap)
- Passkeys require OS support (recent devices only)

**Implementation Complexity:** ⭐⭐⭐ Moderate
**Security:** ⭐⭐⭐⭐⭐ Very High
**Offline Support:** ⭐ None

---

## Part 2: Key Mobile Considerations

### 1. Offline-First Scenarios

**The Challenge:**
User opens app → no internet → should app work?

| Scenario | Requirement | Solution |
|----------|-----------|----------|
| **Previously authenticated** | Session should persist | Cache refresh token + validate offline |
| **Cold start offline** | Session lost | Impossible without prior auth |
| **Intermittent connectivity** | Graceful degradation | Queue writes, sync on reconnect |
| **Airplane mode** | Full offline work | Local-first DB, eventual sync |

**Implementation Pattern:**

```typescript
// On app startup
const refreshToken = await SecureStore.getItemAsync('refreshToken')
const lastAccessToken = useRef<string | null>(null)

if (refreshToken) {
  // Try to refresh if online
  if (isOnline) {
    try {
      const { accessToken } = await api.refreshSession(refreshToken)
      lastAccessToken.current = accessToken
    } catch (err) {
      // Network error, but have old token
      console.log('Refresh failed, using cached token')
    }
  }
  // If offline or refresh failed, try to use old token
  // (might be expired, but try anyway)
}

// API interceptor
api.interceptor.onRequest((config) => {
  if (lastAccessToken.current) {
    config.headers.Authorization = `Bearer ${lastAccessToken.current}`
  }
})

api.interceptor.onError((error) => {
  if (error.status === 401) {
    if (isOnline) {
      // Token expired and we have internet, refresh
      return refreshTokenAndRetry()
    } else {
      // Token expired and offline, show offline message
      return handleOfflineAuth()
    }
  }
})
```

**Firebase Issue (February 2026):**
Firebase JS SDK loses session if app:
1. Authenticates while online
2. Closes
3. Device goes offline
4. App reopens

Session destroyed before SDK can restore it. **Workaround:** Store token manually, bypass SDK session restoration.

**Supabase Issue:**
Same behavior documented. **Workaround:** Use WatermelonDB for offline-first with eventual sync.

---

### 2. Token Storage Security

**Critical Rule:** Never use AsyncStorage for sensitive tokens.

```typescript
// ❌ NEVER DO THIS
AsyncStorage.setItem('authToken', token)  // Plain text, searchable

// ✓ DO THIS INSTEAD
import * as SecureStore from 'expo-secure-store'
await SecureStore.setItemAsync('refreshToken', token)
```

**Why AsyncStorage is insecure:**
- Plain text stored in app's documents directory
- Accessible via:
  - Device backups (iTunes, iCloud)
  - USB debugging (with ADB shell)
  - Rooted/jailbroken devices
  - App repackaging

**Token Storage Best Practice:**

```
Access Token:
  ├─ Lifetime: 15 minutes
  ├─ Storage: Memory only (useRef, not state)
  ├─ Why: Token in memory is cleared on app close
  └─ Lost if app crashes: OK (user just re-authenticates)

Refresh Token:
  ├─ Lifetime: 7-30 days
  ├─ Storage: Device secure enclave (Keychain/Keystore)
  ├─ Why: Encrypted, device-locked, survives app crashes
  └─ Lost if device reset: Expected (user re-authenticates)
```

**Secure Storage Libraries:**

| Library | Pros | Cons |
|---------|------|------|
| **expo-secure-store** | Simplest, Expo-native | Limited features |
| **react-native-keychain** | Rich features, biometric | More setup |
| **react-native-sensitive-info** | Modern Nitro modules | Less mature |

```typescript
// Using expo-secure-store
import * as SecureStore from 'expo-secure-store'

const saveToken = async (refreshToken: string) => {
  await SecureStore.setItemAsync('refreshToken', refreshToken)
}

const loadToken = async () => {
  const token = await SecureStore.getItemAsync('refreshToken')
  return token
}

const clearToken = async () => {
  await SecureStore.deleteItemAsync('refreshToken')
}
```

---

### 3. Token Refresh Strategies

**Goal:** Keep access token fresh without constant requests.

**Strategy 1: Refresh on 401 (Reactive)**

```typescript
// Simple, but adds latency
api.interceptor.response((error) => {
  if (error.status === 401) {
    // Token expired, refresh now
    const newToken = await refreshToken()
    // Retry with new token
  }
})
```

**Pros:** Only refreshes when needed
**Cons:** Adds latency to first request after expiry

---

**Strategy 2: Scheduled Refresh (Proactive)**

```typescript
// Refresh every 12 minutes (before 15 min expiry)
useEffect(() => {
  const interval = setInterval(async () => {
    const newToken = await refreshToken()
    lastAccessToken.current = newToken
  }, 12 * 60 * 1000)

  return () => clearInterval(interval)
}, [])
```

**Pros:** No latency, always have fresh token
**Cons:** Battery drain, unnecessary requests when idle

---

**Strategy 3: Hybrid (Refresh on App Foreground + Scheduled)**

```typescript
const refreshIfNeeded = async () => {
  const now = Date.now()
  const expiresAt = getTokenExpiry()
  const timeUntilExpiry = expiresAt - now

  // Refresh if within 5 minutes of expiry
  if (timeUntilExpiry < 5 * 60 * 1000) {
    await refreshToken()
  }
}

// On app foreground
useAppState((state) => {
  if (state === 'active') {
    refreshIfNeeded()
  }
})

// Also refresh on schedule (every 10 min) if app in foreground
useEffect(() => {
  if (appState === 'active') {
    const interval = setInterval(refreshIfNeeded, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }
}, [appState])
```

**Best Practice (2026):** Hybrid approach. Refresh on foreground + slow schedule for always-on apps (kiosk, player).

---

### 4. Session Persistence Across App Restarts

**Problem:** App closes → how to know if user is still logged in?

**Solution Pattern:**

```typescript
// App startup: check if valid session exists
const initializeAuth = async () => {
  const refreshToken = await SecureStore.getItemAsync('refreshToken')

  if (!refreshToken) {
    // No session
    return { isAuthenticated: false }
  }

  // Have refresh token, try to get fresh access token
  try {
    if (isOnline()) {
      const { accessToken } = await api.refreshSession(refreshToken)
      lastAccessToken.current = accessToken
      return { isAuthenticated: true }
    } else {
      // Offline but have refresh token, try old access token
      // (user might have to re-auth when online)
      return { isAuthenticated: true, offline: true }
    }
  } catch (error) {
    // Refresh failed (network or token expired)
    // Clear session
    await SecureStore.deleteItemAsync('refreshToken')
    return { isAuthenticated: false }
  }
}

// In app entry point (App.tsx or _layout.tsx)
export default function RootLayout() {
  const [auth, setAuth] = useState<AuthState | null>(null)

  useEffect(() => {
    initializeAuth().then(setAuth)
  }, [])

  if (auth === null) return <SplashScreen />

  return auth.isAuthenticated ? <AppStack /> : <AuthStack />
}
```

---

### 5. Deep Linking & OAuth Callbacks

**The Problem:** OAuth provider redirects to `exp://app.example.com/callback?code=xyz`. App must intercept this.

**Solution:**

```json
// app.json
{
  "scheme": "myapp",
  "deepLinking": {
    "enabled": true,
    "prefixes": ["exp://", "myapp://", "https://app.example.com"]
  }
}
```

**EAS-specific:**

```json
// eas.json
{
  "build": {
    "preview": {
      "ios": {
        "scheme": "exp://preview.eas.dev",
        "redirectUrl": "https://auth.example.com/callback"
      }
    },
    "production": {
      "ios": {
        "scheme": "myapp",
        "redirectUrl": "https://auth.example.com/callback"
      }
    }
  }
}
```

**Key concern for kiosk:** Deep linking must match exactly what auth provider expects. Any mismatch = auth fails silently.

---

### 6. Battery & Network Efficiency

**Mobile-specific constraints:**
- Battery drain from constant background refresh
- Cellular data quota
- WiFi sleeping when screen off

**Best Practice:**

```typescript
// Only refresh when:
// 1. App in foreground (user will notice if token is bad)
// 2. Network connected (no point refreshing offline)
// 3. Battery not low (< 20%)

useAppState(async (state) => {
  if (state === 'active' && isNetworkOnline && batteryLevel > 0.2) {
    await refreshIfNeeded()
  }
})

// For kiosk (always-on): be more aggressive
// For consumer app: be lazy
```

---

## Part 3: Implementation Complexity vs Security Tradeoffs

### Quick/Simple Approaches

**Approach A: Passwordless + Expo SecureStore**
- Email magic link auth
- Token stored in Keychain
- Automatic refresh on 401
- **Complexity:** ⭐⭐ Simple
- **Security:** ⭐⭐⭐⭐ Good
- **Time to MVP:** 2-3 days

```typescript
// 1. Send magic link
await auth.sendMagicLink(email)

// 2. User clicks link, app opens with token embedded
// 3. Extract token from deep link
const token = route.params?.token

// 4. Store and use
await SecureStore.setItemAsync('refreshToken', token)
```

---

**Approach B: API Key Auth (for Service Accounts)**
- Device registers with API key
- Key stored in secure storage
- No refresh needed (key is long-lived)
- **Complexity:** ⭐ Very simple
- **Security:** ⭐⭐⭐ Medium (key compromise)
- **Time to MVP:** 1 day

```typescript
// Perfect for: kiosk devices, service accounts
const API_KEY = await SecureStore.getItemAsync('apiKey')

fetch('/api/data', {
  headers: { Authorization: `Bearer ${API_KEY}` }
})
```

---

### Balanced Approaches

**Approach C: OAuth 2.0 PKCE + JWT Tokens**
- Standard OAuth flow
- Access + Refresh tokens
- Secure by industry standard
- **Complexity:** ⭐⭐⭐ Moderate
- **Security:** ⭐⭐⭐⭐⭐ Excellent
- **Time to MVP:** 3-5 days

```typescript
// 1. Auth provider (Google, GitHub, etc.)
// 2. Exchange code for tokens
const { accessToken, refreshToken } = await exchangeCode(code)

// 3. Store refresh token securely
await SecureStore.setItemAsync('refreshToken', refreshToken)

// 4. Use access token in requests
// 5. Refresh on 401
```

---

**Approach D: Custom Backend + JWT**
- Full control over auth logic
- Can implement offline features
- Flexible token strategy
- **Complexity:** ⭐⭐⭐⭐ Complex
- **Security:** ⭐⭐⭐⭐ High (if implemented carefully)
- **Time to MVP:** 4-6 days

```typescript
// 1. Implement custom login
POST /auth/login { email, password }
← { accessToken, refreshToken }

// 2. Token lifecycle
// Access: 15 min
// Refresh: 30 days
// Rotation: New refresh token on each refresh

// 3. Client-side
// Access: Memory
// Refresh: Keychain
// Refresh interval: On 401 + app foreground
```

---

### Secure/Hardened Approaches

**Approach E: Enterprise + MFA**
- OAuth 2.0 PKCE
- Multi-factor auth (TOTP + SMS)
- Token rotation
- Audit logging
- **Complexity:** ⭐⭐⭐⭐⭐ Very complex
- **Security:** ⭐⭐⭐⭐⭐ Maximum
- **Time to MVP:** 1-2 weeks

---

## Part 4: Use-Case Specific Recommendations

### Use Case 1: Guide-Controlled Kiosk

**Requirements:**
- Tablet runs app controlled by human guide
- App displays content to audience
- Guide doesn't "log in" (kiosk is device, not user)
- Must survive network interruptions (WiFi unreliable)

**Recommended Pattern: Device Service Account**

```typescript
// 1. At manufacture/first boot:
//    Backend generates device ID + API key
//    Store in secure storage

// 2. App startup:
const deviceId = await SecureStore.getItemAsync('deviceId')
const apiKey = await SecureStore.getItemAsync('apiKey')

// 3. Every request uses device credentials (not user)
fetch('/api/guide-content', {
  headers: {
    'X-Device-ID': deviceId,
    Authorization: `Bearer ${apiKey}`
  }
})

// 4. Offline: Queue requests if no network
//    Sync when connection returns
const cache = new RequestQueue('offline-requests')
if (!isOnline) {
  cache.add({ url: '/api/event', method: 'POST', data: {...} })
} else {
  await cache.flush()
}
```

**Why this approach:**
- No user login screen needed
- Device is trusted (not person)
- API key simple and long-lived
- Handles offline via request queue
- Keys can be revoked if device stolen

**Complexity:** ⭐⭐ Simple
**Security:** ⭐⭐⭐ Medium (API key risk, but device is controlled)
**Offline Support:** ⭐⭐⭐ Good (with queue)

---

### Use Case 2: Kiosk Player App

**Requirements:**
- App plays videos/content in loop
- No user interaction (or minimal buttons)
- May be headless (no UI)
- Runs 24/7

**Recommended Pattern: Long-Lived Token + Auto-Refresh**

```typescript
// Similar to guide kiosk, but with automatic refresh
// 1. Initial auth (once per deployment)
//    Deploy with hardcoded credentials or config file

// 2. Store refresh token
const refreshToken = await SecureStore.setItemAsync('refreshToken', token)

// 3. App startup
const accessToken = await getAccessToken()
if (!accessToken) {
  // Refresh if missing or expired
  const newToken = await refreshSession()
  storeAccessTokenInMemory(newToken)
}

// 4. Background refresh (for 24/7 uptime)
useEffect(() => {
  // Refresh every 1 hour
  const interval = setInterval(async () => {
    try {
      const newToken = await refreshSession()
      storeAccessTokenInMemory(newToken)
    } catch (err) {
      // Refresh failed, but token still valid for ~15 min
      // Log to remote monitoring
      await reportError(err)
    }
  }, 60 * 60 * 1000)

  return () => clearInterval(interval)
}, [])

// 5. Content fetch
fetch('/api/content', {
  headers: { Authorization: `Bearer ${accessToken}` }
})
  .then(r => r.json())
  .then(content => playContent(content))
  .catch(err => handleError(err, isOffline))
```

**Why this approach:**
- Automatic refresh prevents downtime
- Single API key per app instance
- Can monitor refresh failures remotely
- Survives network blips

**Complexity:** ⭐⭐⭐ Moderate
**Security:** ⭐⭐⭐⭐ Good
**Offline Support:** ⭐⭐ Partial (token cache + queue)

---

### Use Case 3: Admin Dashboard (Mobile Version)

**Requirements:**
- User authentication (not device)
- Can create/edit/delete resources
- Might be secondary device (phone for quick actions)
- Occasional use (unlike kiosk)

**Recommended Pattern: OAuth 2.0 PKCE + Biometric Unlock**

```typescript
// 1. Initial OAuth login
const { code, state } = generatePKCE()
openBrowserAsync('https://auth.example.com/oauth?code_challenge=...')

// User logs in...
// Browser redirects to: myapp://callback?code=xyz&state=abc

// 2. Exchange code for tokens
const { accessToken, refreshToken } = await exchangeCode(code)

// 3. Store refresh token
await SecureStore.setItemAsync('refreshToken', refreshToken)
storeAccessTokenInMemory(accessToken)

// 4. Biometric unlock for repeat access
useBiometrics(async () => {
  // When user opens app again, ask for biometric
  const isAuthorized = await requestBiometricAuth()

  if (isAuthorized) {
    // Refresh token still valid, use it
    const newAccessToken = await refreshSession()
    storeAccessTokenInMemory(newAccessToken)
    showAppContent()
  } else {
    // Biometric failed, require re-login
    requireOAuthLogin()
  }
})

// 5. Use access token
fetch('/api/resources', {
  method: 'POST',
  body: JSON.stringify({ name: 'New Item' }),
  headers: { Authorization: `Bearer ${accessToken}` }
})
  .then(r => {
    if (r.status === 401) {
      // Token expired, refresh and retry
      return refreshAndRetry()
    }
    return r
  })
```

**Why this approach:**
- Industry-standard OAuth (familiar to users)
- Biometric adds convenience without sacrificing security
- Works with any OAuth provider
- Handles token refresh automatically
- Good UX (user logs in once, biometric thereafter)

**Complexity:** ⭐⭐⭐ Moderate
**Security:** ⭐⭐⭐⭐⭐ Excellent
**Offline Support:** ⭐ None (user auth required)

---

## Part 5: Offline-First Architecture

### The Problem

Most auth systems assume connectivity:
1. User logs in while online
2. Closes app
3. Device goes offline
4. App reopens
5. Session lost

Why? The SDK tries to refresh the token while offline, fails, clears the session.

### Solution: Local Token Caching + Fallback

```typescript
// Storage layer
interface CachedAuth {
  accessToken?: string      // May be expired
  refreshToken: string      // Stored in Keychain
  accessTokenExpiry?: number
  refreshTokenExpiry: number
  lastSuccessfulRefresh: number
}

// On app startup
const restoreSession = async (): Promise<{ authenticated: boolean; offline: boolean }> => {
  const cached = await loadCachedAuth()

  if (!cached) {
    return { authenticated: false, offline: false }
  }

  // Check if refresh token is still valid (not expired)
  if (cached.refreshTokenExpiry < Date.now()) {
    // Refresh token expired, user must re-login
    await clearCachedAuth()
    return { authenticated: false, offline: false }
  }

  // Have valid refresh token, try to get new access token
  if (isOnline()) {
    try {
      const { accessToken } = await api.refreshSession(cached.refreshToken)
      await saveCachedAuth({ ...cached, accessToken, accessTokenExpiry: Date.now() + 15 * 60 * 1000 })
      return { authenticated: true, offline: false }
    } catch (err) {
      // Network error during refresh
      console.log('Refresh failed, using cached token')
      return { authenticated: true, offline: true }
    }
  } else {
    // Offline, use cached access token if not expired
    if (cached.accessToken && cached.accessTokenExpiry && cached.accessTokenExpiry > Date.now()) {
      return { authenticated: true, offline: true }
    } else {
      // Access token expired, can't proceed offline
      return { authenticated: false, offline: true }
    }
  }
}

// In API interceptor
api.interceptor.response((error) => {
  if (error.status === 401 && isOnline()) {
    // Token expired and we have network, refresh
    return refreshAndRetry(error.config)
  } else if (error.status === 401 && !isOnline()) {
    // Token expired and offline, show error
    showError('Session expired. Connect to internet and try again.')
    return Promise.reject(error)
  }
})
```

### The WatermelonDB Approach (True Offline-First)

For apps that need to work fully offline (no API calls), use **WatermelonDB** with eventual sync:

```typescript
// WatermelonDB + Supabase = offline-first with cloud sync
import { Database } from '@nozbe/watermelon'
import { synchronize } from '@nozbe/watermelon/sync'

const db = new Database({
  actionsEnabled: true
})

// Work offline
await db.write(async () => {
  const task = await tasksCollection.create(task => {
    task.title = 'New task'
    task._status = 'created'  // Marked for sync
  })
})

// When online, sync
useNetworkState((state) => {
  if (state.isConnected && lastSyncTime < Date.now() - 60000) {
    synchronize({
      database: db,
      pullChanges: async ({ lastPulledAt }) => {
        const response = await api.sync({ lastPulledAt })
        return response
      },
      pushChanges: async ({ changes }) => {
        await api.sync({ changes })
      }
    })
  }
})
```

**Tradeoff:** More complexity, but true offline capability.

---

## Part 6: Comparison Table (Pattern × Use Case)

| Pattern | Guide Kiosk | Player Kiosk | Admin Dashboard |
|---------|-------------|--------------|-----------------|
| **Device Service Account** | ⭐⭐⭐⭐⭐ Perfect | ⭐⭐⭐⭐⭐ Perfect | ❌ Wrong (not user) |
| **API Key Auth** | ⭐⭐⭐⭐ Good | ⭐⭐⭐⭐ Good | ❌ Wrong (not user) |
| **OAuth 2.0 + PKCE** | ❌ Overkill | ❌ Overkill | ⭐⭐⭐⭐⭐ Perfect |
| **JWT + Custom Backend** | ⭐⭐⭐⭐ Good | ⭐⭐⭐⭐ Good | ⭐⭐⭐⭐ Good |
| **Magic Link** | ⭐⭐⭐ OK (if user-driven) | ❌ Not applicable | ⭐⭐⭐ OK (fast) |
| **Session + Cookies** | ❌ Bad mobile fit | ❌ Bad mobile fit | ⭐⭐⭐ OK |
| **Passwordless + Biometric** | ⭐⭐⭐ OK | ❌ Not applicable | ⭐⭐⭐⭐ Good |

---

## Part 7: Security Checklist

### Token Storage
- [ ] Never use AsyncStorage for sensitive data
- [ ] Use Keychain (iOS) or Keystore (Android)
- [ ] Access tokens in memory only
- [ ] Refresh tokens encrypted in secure storage
- [ ] Clear all tokens on logout

### Token Lifecycle
- [ ] Access tokens short-lived (15 min)
- [ ] Refresh tokens long-lived (7-30 days)
- [ ] Refresh tokens rotated on each use
- [ ] Token expiry validated before use
- [ ] Automatic refresh on 401 status

### API Security
- [ ] HTTPS always (no HTTP)
- [ ] Certificate pinning for critical APIs
- [ ] Authorization header format: `Bearer {token}`
- [ ] Token not logged or exposed in error messages
- [ ] Token not sent in URL query params

### Offline Handling
- [ ] Graceful degradation (cache when offline)
- [ ] Requests queued if offline
- [ ] Queue flushed on reconnect
- [ ] Stale data handled (show timestamp)
- [ ] Conflict resolution defined (last-write-wins, etc.)

### Session Management
- [ ] Session persisted across app restart
- [ ] Logout clears all credentials
- [ ] Biometric binding (if used) validated on unlock
- [ ] Lock timeout (auto-logout after X minutes idle)
- [ ] Device-based session (kiosk) separate from user session

### Monitoring & Audit
- [ ] Token refresh failures logged
- [ ] 401 errors tracked
- [ ] Offline duration monitored
- [ ] Auth success/failure rate metrics
- [ ] Suspicious activity alerts (multiple 401s, etc.)

---

## Part 8: Implementation Decision Tree

```
START: Which use case?

├─ Device-based (kiosk, player)
│  ├─ Needs offline? YES → API Key + Request Queue
│  └─ Needs offline? NO → API Key + Background Refresh
│
├─ User-based (admin dashboard, consumer app)
│  ├─ Complex auth (SAML, MFA)? YES → OAuth 2.0 PKCE
│  ├─ Simple auth? YES → Magic Link
│  └─ Control needed? → Custom JWT Backend
│
└─ Hybrid (both device and user)
   ├─ Split concern: Device auth for content, User auth for edits
   ├─ Two separate tokens: apiKey + userToken
   └─ Clear trust boundaries in code
```

---

## Part 9: Quick Start Templates

### Template 1: Device Service Account (Kiosk)

```typescript
// 1. types.ts
export interface DeviceAuth {
  deviceId: string
  apiKey: string
  apiKeyExpiry: number
}

// 2. auth.ts
import * as SecureStore from 'expo-secure-store'

export const initializeDeviceAuth = async (): Promise<{ success: boolean; offline: boolean }> => {
  try {
    const auth = await SecureStore.getItemAsync('deviceAuth')

    if (!auth) {
      // First time, need to register with backend
      return { success: false, offline: !isOnline() }
    }

    const deviceAuth = JSON.parse(auth) as DeviceAuth

    // Check if API key expired
    if (deviceAuth.apiKeyExpiry < Date.now()) {
      // Refresh needed
      if (isOnline()) {
        const newAuth = await api.refreshDeviceAuth(deviceAuth.deviceId)
        await SecureStore.setItemAsync('deviceAuth', JSON.stringify(newAuth))
      }
    }

    return { success: true, offline: !isOnline() }
  } catch (err) {
    console.error('Auth init failed', err)
    return { success: false, offline: !isOnline() }
  }
}

// 3. api.ts
export const createAuthenticatedAPI = async () => {
  const authStr = await SecureStore.getItemAsync('deviceAuth')
  const auth = JSON.parse(authStr!) as DeviceAuth

  return {
    get: (url: string) => fetch(url, {
      headers: {
        'X-Device-ID': auth.deviceId,
        Authorization: `Bearer ${auth.apiKey}`
      }
    }),
    post: (url: string, data: any) => fetch(url, {
      method: 'POST',
      headers: {
        'X-Device-ID': auth.deviceId,
        Authorization: `Bearer ${auth.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
  }
}
```

---

### Template 2: OAuth 2.0 PKCE (Admin Dashboard)

```typescript
// 1. auth.ts
import * as WebBrowser from 'expo-web-browser'
import * as AuthSession from 'expo-auth-session'
import * as SecureStore from 'expo-secure-store'

const discovery = {
  authorizationEndpoint: 'https://auth.example.com/oauth/authorize',
  tokenEndpoint: 'https://auth.example.com/oauth/token',
  revocationEndpoint: 'https://auth.example.com/oauth/revoke'
}

const [request, response, promptAsync] = AuthSession.useAuthRequest(
  {
    clientId: 'your-client-id',
    redirectUrl: AuthSession.getRedirectUrl(),
    scopes: ['openid', 'profile', 'email'],
    responseType: 'code'
  },
  discovery
)

const login = async () => {
  const result = await promptAsync()

  if (result.type === 'success' && result.params.code) {
    const { accessToken, refreshToken } = await exchangeCode(
      result.params.code,
      result.params.state
    )

    await SecureStore.setItemAsync('refreshToken', refreshToken)
    setAccessToken(accessToken)
  }
}

// 2. api.ts
let accessToken: string | null = null

export const setAccessToken = (token: string) => {
  accessToken = token
}

export const apiFetch = async (url: string, options: RequestInit = {}) => {
  let response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (response.status === 401) {
    // Token expired, try refresh
    const refreshToken = await SecureStore.getItemAsync('refreshToken')
    if (refreshToken) {
      const newToken = await refreshAccessToken(refreshToken)
      accessToken = newToken

      // Retry
      response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${newToken}`
        }
      })
    }
  }

  return response
}
```

---

### Template 3: Offline-First with Local Queue

```typescript
// 1. offline-queue.ts
export class OfflineQueue {
  private queue: RequestItem[] = []
  private processing = false

  add(item: RequestItem) {
    this.queue.push(item)
    this.save()
  }

  async flush() {
    if (this.processing) return
    this.processing = true

    while (this.queue.length > 0) {
      const item = this.queue[0]

      try {
        await fetch(item.url, item.options)
        this.queue.shift()
        this.save()
      } catch (err) {
        // Network still unavailable, stop trying
        break
      }
    }

    this.processing = false
  }

  private save() {
    AsyncStorage.setItem('offlineQueue', JSON.stringify(this.queue))
  }
}

// 2. usage
const queue = new OfflineQueue()

useNetworkState((state) => {
  if (state.isConnected) {
    queue.flush()
  }
})

export const apiFetch = async (url: string, options: RequestInit) => {
  try {
    return await fetch(url, options)
  } catch (err) {
    if (!isOnline()) {
      queue.add({ url, options })
      return { ok: false, offline: true }
    }
    throw err
  }
}
```

---

## Summary: One-Page Cheat Sheet

```
╔════════════════════════════════════════════════════════════════════╗
║                    MOBILE AUTH AT A GLANCE                         ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  DEVICE-BASED (Kiosk, Player)          USER-BASED (Dashboard)    ║
║  ────────────────────────────────────   ──────────────────────   ║
║  Auth Method: API Key                   Auth Method: OAuth PKCE   ║
║  Token: Long-lived (30 days)            Token: Short-lived (15m)  ║
║  Storage: Keychain                      Storage: Memory + Keychain║
║  Refresh: Daily or on rotation          Refresh: On 401 + schedule║
║  Offline: Queue + sync                  Offline: Not applicable   ║
║  Biometric: No                          Biometric: Yes (optional) ║
║                                                                    ║
║  GOLDEN RULES:                                                     ║
║  1. Never store tokens in AsyncStorage                            ║
║  2. Access token = memory only                                    ║
║  3. Refresh token = Keychain/Keystore                             ║
║  4. Refresh on 401 + app foreground                               ║
║  5. Clear all tokens on logout                                    ║
║  6. Queue requests when offline                                   ║
║  7. Log token failures for monitoring                             ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
```

---

## Related Documents

- [2026-03-14-expo-mobile-authentication-research.md](2026-03-14-expo-mobile-authentication-research.md) — Provider deep-dive (Clerk, Firebase, Auth0, Supabase, Cognito)
- [authentication-quick-reference.md](authentication-quick-reference.md) — Quick lookup table
- [2026-03-14-sso-provider-comparison.md](2026-03-14-sso-provider-comparison.md) — OAuth provider evaluation

---

**Last Updated:** 2026-03-14
**Status:** Current
**Focus:** Mobile auth patterns, offline architecture, use-case specifics
**Applicability:** iOS, Android, React Native, Expo
