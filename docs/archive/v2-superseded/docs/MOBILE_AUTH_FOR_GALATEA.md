# Mobile Authorization for Galatea Use Cases

**Recommended approaches for guide kiosk, player kiosk, and admin dashboard**

**Status:** Reference guide | **Updated:** 2026-03-14 | **Scope:** React Native / Expo

---

## Overview

This guide recommends specific auth patterns for three Galatea use cases:

1. **Guide-Controlled Kiosk** — Tablet controlled by human guide, displays content to audience
2. **Kiosk Player App** — Automated playback loop, 24/7 operation, minimal UI
3. **Admin Dashboard** — Mobile version of management interface, user login required

Each has different requirements. No single pattern fits all three.

---

## Use Case 1: Guide-Controlled Kiosk

### Requirements

- Tablet runs under guide's control
- Displays generated content (Galatea-produced scenarios, demos, etc.)
- Network may be unreliable (conference venue WiFi)
- No user login screen (device is authenticated, not person)
- Must survive brief disconnections

### Recommended Pattern: Device Service Account

**Why:** Simple, secure for device-level trust, handles offline gracefully.

### Implementation

#### Step 1: Device Registration (Backend)

```typescript
// backend/routes/api/device/register.post.ts
import { db } from '~/server/db'
import * as crypto from 'crypto'

export const POST = async (event) => {
  const { deviceName, deviceType } = await event.request.json()

  // Generate unique device credentials
  const deviceId = crypto.randomUUID()
  const apiKey = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year

  // Store in DB
  await db.insert(devices).values({
    id: deviceId,
    name: deviceName,
    type: deviceType,
    apiKey: crypto.createHash('sha256').update(apiKey).digest('hex'), // Hash for storage
    expiresAt,
    createdAt: new Date(),
    status: 'active'
  })

  return {
    status: 200,
    body: JSON.stringify({
      deviceId,
      apiKey, // Send unhashed only once to client
      expiresAt: expiresAt.toISOString()
    })
  }
}
```

#### Step 2: Client Setup (First Boot)

```typescript
// app/(kiosk)/startup.tsx
import * as SecureStore from 'expo-secure-store'

export async function registerDevice() {
  try {
    // Call backend registration endpoint
    const response = await fetch('https://api.galatea.dev/api/device/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceName: `Kiosk-${Date.now()}`,
        deviceType: 'guide-tablet'
      })
    })

    const { deviceId, apiKey, expiresAt } = await response.json()

    // Store credentials securely
    await SecureStore.setItemAsync('deviceId', deviceId)
    await SecureStore.setItemAsync('apiKey', apiKey)
    await SecureStore.setItemAsync('apiKeyExpiry', expiresAt)

    console.log('Device registered:', deviceId)
    return { success: true, deviceId }
  } catch (error) {
    console.error('Registration failed:', error)
    return { success: false, error }
  }
}
```

#### Step 3: Initialize Auth on Startup

```typescript
// app/(kiosk)/_layout.tsx
import { useEffect, useState } from 'react'
import { registerDevice } from './startup'
import { initializeDeviceAuth } from '~/lib/device-auth'

export default function KioskLayout() {
  const [authReady, setAuthReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    initializeAuthOnStartup()
  }, [])

  const initializeAuthOnStartup = async () => {
    try {
      // Check if device already has credentials
      const auth = await initializeDeviceAuth()

      if (!auth.deviceId) {
        // First boot, register device
        const registration = await registerDevice()
        if (!registration.success) {
          setError('Failed to register device. Check internet connection.')
          return
        }
      }

      setAuthReady(true)
    } catch (err) {
      setError(`Auth error: ${err.message}`)
      console.error(err)
    }
  }

  if (error) {
    return <OfflineScreen error={error} />
  }

  if (!authReady) {
    return <LoadingScreen />
  }

  return <KioskContent />
}
```

#### Step 4: Device Auth Utilities

```typescript
// lib/device-auth.ts
import * as SecureStore from 'expo-secure-store'
import NetInfo from '@react-native-community/netinfo'

export interface DeviceAuth {
  deviceId: string
  apiKey: string
  expiresAt: string
}

export async function initializeDeviceAuth(): Promise<DeviceAuth | null> {
  try {
    const deviceId = await SecureStore.getItemAsync('deviceId')
    const apiKey = await SecureStore.getItemAsync('apiKey')
    const expiresAt = await SecureStore.getItemAsync('apiKeyExpiry')

    if (!deviceId || !apiKey || !expiresAt) {
      return null
    }

    // Check if expired
    if (new Date(expiresAt) < new Date()) {
      console.warn('API key expired, needs refresh')
      return null
    }

    return { deviceId, apiKey, expiresAt }
  } catch (error) {
    console.error('Failed to load device auth:', error)
    return null
  }
}

export async function getDeviceAuth(): Promise<DeviceAuth> {
  const auth = await initializeDeviceAuth()
  if (!auth) {
    throw new Error('Device not authenticated')
  }
  return auth
}

export async function makeAuthenticatedRequest(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const auth = await getDeviceAuth()
  const isOnline = (await NetInfo.fetch()).isConnected

  const headers = {
    ...options.headers,
    'X-Device-ID': auth.deviceId,
    Authorization: `Bearer ${auth.apiKey}`
  }

  try {
    const response = await fetch(url, { ...options, headers })
    return response
  } catch (error) {
    if (!isOnline) {
      console.log('Offline, request queued')
      // Handle offline in next section
    }
    throw error
  }
}
```

#### Step 5: Handle Offline (Request Queue)

```typescript
// lib/offline-queue.ts
import AsyncStorage from '@react-native-async-storage/async-storage'

export interface QueuedRequest {
  id: string
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers: Record<string, string>
  body?: string
  timestamp: number
  retries: number
}

export class OfflineQueue {
  private queue: QueuedRequest[] = []
  private processing = false
  private readonly STORAGE_KEY = 'offlineQueue'

  async initialize() {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEY)
      this.queue = stored ? JSON.parse(stored) : []
    } catch (error) {
      console.error('Failed to load queue:', error)
    }
  }

  async add(request: Omit<QueuedRequest, 'id' | 'timestamp' | 'retries'>) {
    const item: QueuedRequest = {
      ...request,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      retries: 0
    }

    this.queue.push(item)
    await this.persist()
    console.log(`Queued request: ${request.url}`)
  }

  async flush() {
    if (this.processing || this.queue.length === 0) return

    this.processing = true

    const toProcess = [...this.queue]
    const succeeded: string[] = []
    const failed: string[] = []

    for (const request of toProcess) {
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body
        })

        if (response.ok) {
          succeeded.push(request.id)
          console.log(`Synced: ${request.url}`)
        } else if (response.status >= 500) {
          // Server error, retry later
          failed.push(request.id)
        } else {
          // Client error, discard
          succeeded.push(request.id)
          console.warn(`Discarding failed request: ${request.url} (${response.status})`)
        }
      } catch (error) {
        failed.push(request.id)
        console.warn(`Sync failed: ${request.url}`, error)
      }
    }

    // Remove succeeded requests from queue
    this.queue = this.queue.filter(r => !succeeded.includes(r.id))

    // Increment retry count for failed
    this.queue = this.queue.map(r =>
      failed.includes(r.id) ? { ...r, retries: r.retries + 1 } : r
    )

    // Remove requests with too many retries
    this.queue = this.queue.filter(r => r.retries < 5)

    await this.persist()
    this.processing = false

    console.log(`Queue sync complete: ${succeeded.length} succeeded, ${this.queue.length} remaining`)
  }

  private async persist() {
    try {
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.queue))
    } catch (error) {
      console.error('Failed to persist queue:', error)
    }
  }

  async clear() {
    this.queue = []
    await AsyncStorage.removeItem(this.STORAGE_KEY)
  }
}

// Initialize globally
export const offlineQueue = new OfflineQueue()
```

#### Step 6: Network Detection & Auto-Sync

```typescript
// app/(kiosk)/_layout.tsx (updated)
import NetInfo from '@react-native-community/netinfo'
import { offlineQueue } from '~/lib/offline-queue'

export default function KioskLayout() {
  // ... existing code ...

  useEffect(() => {
    // Listen for network changes
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      if (state.isConnected && !state.isInternetReachable) {
        console.log('Connected to network, syncing offline queue...')
        await offlineQueue.flush()
      }
    })

    return () => unsubscribe()
  }, [])

  // ... rest of component ...
}
```

#### Step 7: Make Authenticated Requests

```typescript
// lib/api-client.ts
import { makeAuthenticatedRequest } from './device-auth'
import { offlineQueue } from './offline-queue'
import NetInfo from '@react-native-community/netinfo'

export async function fetchContent(contentId: string) {
  const state = await NetInfo.fetch()

  try {
    const response = await makeAuthenticatedRequest(
      `https://api.galatea.dev/api/content/${contentId}`,
      { method: 'GET' }
    )

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    if (!state.isConnected) {
      console.log('Offline, returning cached content')
      return await getCachedContent(contentId)
    }
    throw error
  }
}

export async function reportEvent(eventData: any) {
  const state = await NetInfo.fetch()

  try {
    const response = await makeAuthenticatedRequest(
      'https://api.galatea.dev/api/events',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
      }
    )

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
  } catch (error) {
    if (!state.isConnected) {
      // Queue for later
      await offlineQueue.add({
        url: 'https://api.galatea.dev/api/events',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
      })
      console.log('Event queued for sync')
    } else {
      throw error
    }
  }
}
```

### Testing Checklist

```
□ Device Registration
  ├─ First boot registers successfully
  ├─ Credentials stored in Keychain
  └─ Second boot uses stored credentials

□ Authenticated Requests
  ├─ Normal requests include auth headers
  ├─ Invalid key returns 401
  └─ Expired key requests refresh

□ Offline Behavior
  ├─ Requests queue when offline
  ├─ Queue persists across app restart
  ├─ Queue flushes when online
  └─ Failed requests retry (with backoff)

□ Security
  ├─ API key not logged to console
  ├─ API key only visible on registration
  ├─ Key rotates after 1 year
  └─ Compromised key can be revoked via API
```

---

## Use Case 2: Kiosk Player App

### Requirements

- Automated video/content playback
- Runs 24/7 without interruption
- Minimal UI (may be headless)
- Refresh tokens to avoid session loss
- Monitor for failures remotely

### Recommended Pattern: JWT with Scheduled Refresh

**Why:** Stateless, predictable, good for always-on scenarios.

### Implementation (High-Level)

```typescript
// Configuration
const TOKEN_CONFIG = {
  refreshInterval: 60 * 60 * 1000, // 1 hour
  accessTokenTTL: 24 * 60 * 60 * 1000, // 24 hours
  retryMaxAttempts: 5,
  retryBackoff: 2000 // 2 seconds
}

// On app start
const initializePlayer = async () => {
  const refreshToken = await SecureStore.getItemAsync('refreshToken')

  if (!refreshToken) {
    // First deployment, get initial token
    const { accessToken, refreshToken: newRefreshToken } = await loginDevice()
    storeTokens(accessToken, newRefreshToken)
  } else {
    // Existing deployment, refresh token
    const { accessToken } = await refreshAccessToken(refreshToken)
    storeAccessTokenInMemory(accessToken)
  }

  // Start playback
  startContentLoop()

  // Schedule token refresh
  scheduleTokenRefresh()
}

// Scheduled refresh
const scheduleTokenRefresh = () => {
  setInterval(async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync('refreshToken')
      const { accessToken, refreshToken: newRefreshToken } = await refreshAccessToken(refreshToken)

      storeAccessTokenInMemory(accessToken)
      await SecureStore.setItemAsync('refreshToken', newRefreshToken)

      await reportSuccess('Token refreshed')
    } catch (error) {
      await reportError('Token refresh failed', error)
    }
  }, TOKEN_CONFIG.refreshInterval)
}

// Content playback with auth
const fetchAndPlayContent = async () => {
  const accessToken = getAccessTokenFromMemory()

  const response = await fetch('https://api.galatea.dev/api/content/current', {
    headers: { Authorization: `Bearer ${accessToken}` }
  })

  if (response.status === 401) {
    // Token expired, refresh and retry
    const newAccessToken = await forceTokenRefresh()
    return fetchAndPlayContent() // Retry
  }

  const content = await response.json()
  playContent(content)
}

// Error reporting
const reportError = async (message: string, error: any) => {
  try {
    await fetch('https://api.galatea.dev/api/device-logs', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: await getDeviceId(),
        level: 'error',
        message,
        error: error.message,
        timestamp: new Date().toISOString()
      })
    })
  } catch (err) {
    console.error('Failed to report error:', err)
  }
}
```

---

## Use Case 3: Admin Dashboard (Mobile)

### Requirements

- User login (not device)
- Create/edit/delete operations
- Occasional use (not always-on)
- Biometric unlock convenience
- OAuth provider preferred

### Recommended Pattern: OAuth 2.0 PKCE + Biometric Unlock

**Why:** Standard, secure, good UX, works with multiple providers.

### Implementation (High-Level)

```typescript
// OAuth initialization
import * as AuthSession from 'expo-auth-session'
import * as SecureStore from 'expo-secure-store'

const discovery = {
  authorizationEndpoint: 'https://auth.example.com/oauth/authorize',
  tokenEndpoint: 'https://auth.example.com/oauth/token'
}

const [request, response, promptAsync] = AuthSession.useAuthRequest(
  {
    clientId: process.env.EXPO_PUBLIC_OAUTH_CLIENT_ID!,
    redirectUrl: AuthSession.getRedirectUrl(),
    scopes: ['openid', 'profile', 'email']
  },
  discovery
)

// Login flow
const handleLogin = async () => {
  const result = await promptAsync()

  if (result.type === 'success') {
    const { accessToken, refreshToken } = await exchangeCode(result.params.code)

    await SecureStore.setItemAsync('refreshToken', refreshToken)
    storeAccessTokenInMemory(accessToken)

    return { success: true }
  }

  return { success: false }
}

// Biometric unlock on app foreground
useAppState((state) => {
  if (state === 'active') {
    attemptBiometricUnlock()
  }
})

const attemptBiometricUnlock = async () => {
  const result = await BiometricAuthentication.authenticateAsync({
    fallback: 'passcode'
  })

  if (result.success) {
    // User authenticated, refresh token if needed
    const refreshToken = await SecureStore.getItemAsync('refreshToken')
    if (refreshToken && isTokenExpiring()) {
      const { accessToken } = await refreshAccessToken(refreshToken)
      storeAccessTokenInMemory(accessToken)
    }
    showAppContent()
  } else {
    showLoginScreen()
  }
}

// API calls with auto-refresh
const apiClient = {
  async request(url: string, options: RequestInit = {}) {
    const accessToken = getAccessTokenFromMemory()

    let response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${accessToken}`
      }
    })

    if (response.status === 401) {
      // Try to refresh
      const refreshToken = await SecureStore.getItemAsync('refreshToken')
      const { accessToken: newToken } = await refreshAccessToken(refreshToken)
      storeAccessTokenInMemory(newToken)

      // Retry
      response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${newToken}`
        }
      })
    }

    return response
  }
}
```

---

## Summary Recommendation Table

| Aspect | Guide Kiosk | Player Kiosk | Admin Dashboard |
|--------|---|---|---|
| **Auth Pattern** | Device Service Account | JWT Scheduled Refresh | OAuth PKCE + Biometric |
| **Token Storage** | Keychain | Keychain | Keychain + Memory |
| **Offline Support** | Queue + sync | Token cache | Not needed |
| **Setup Complexity** | Simple | Moderate | Moderate |
| **Security Level** | Good | Good | Excellent |
| **Implementation Time** | 2-3 days | 2-3 days | 3-5 days |
| **Maintenance** | Low | Medium (monitoring) | Low |

---

## Common Pitfalls to Avoid

```
✓ DO:
  ├─ Use Keychain for token storage
  ├─ Validate token expiry locally
  ├─ Queue requests when offline
  ├─ Log token errors for monitoring
  ├─ Rotate tokens periodically
  └─ Test with network disabled

✗ DON'T:
  ├─ Store tokens in AsyncStorage
  ├─ Log tokens to console
  ├─ Hardcode client secret in app
  ├─ Skip certificate validation
  ├─ Ignore offline scenarios
  └─ Assume WiFi is always available
```

---

## Troubleshooting

### Problem: "401 Unauthorized" after app restart

**Causes:**
1. Refresh token expired
2. Refresh token not stored securely
3. Token not refreshed on startup

**Solution:**
- Check `SecureStore` has token
- Validate token expiry before use
- Call refresh endpoint on app start

---

### Problem: Offline requests lost

**Cause:**
- Queue not persisting to disk
- AsyncStorage cleared on logout

**Solution:**
- Use `AsyncStorage.setItem()` to persist queue
- Don't clear queue on logout (only on sync success)

---

### Problem: Deep linking not working (OAuth)

**Causes:**
1. Redirect URI doesn't match provider config
2. App scheme not registered in `app.json`
3. Different URL for dev vs production

**Solution:**
- Verify exact URL in OAuth provider dashboard
- Set `deepLinking.prefixes` in `app.json`
- Use different schemes per build profile in `eas.json`

---

## References

- [2026-03-14-mobile-authorization-comprehensive.md](../research/2026-03-14-mobile-authorization-comprehensive.md)
- [2026-03-14-mobile-auth-patterns-comparison.md](../research/2026-03-14-mobile-auth-patterns-comparison.md)
- [2026-03-14-expo-mobile-authentication-research.md](../research/2026-03-14-expo-mobile-authentication-research.md)

---

**Last Updated:** 2026-03-14
**Status:** Ready for implementation
**Target:** Galatea mobile apps (Expo / React Native)
