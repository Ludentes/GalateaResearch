# Expo/React Native Authentication Options Research (2026)

**Date:** 2026-03-14
**Focus:** Current state-of-the-art authentication providers for Expo and React Native applications
**Scope:** Consumer apps, internal team apps, kiosk/service account patterns

---

## Executive Summary

Five major authentication providers dominate the 2026 landscape for Expo/React Native:

| Provider | Best For | Free Tier | Setup | Expo Go |
|----------|----------|-----------|-------|---------|
| **Clerk** | DX, modern UX, consumer apps | 50K MAU | 5 min | ✓ |
| **Firebase** | Google ecosystem, scale | 50K MAU | 10 min | ✓* |
| **Auth0** | Enterprise, SSO | 100 users | 20 min | ✗ |
| **Supabase** | Backend control, open-source | 50K MAU | 5 min | ✓ |
| **AWS Cognito** | AWS ecosystem | 50K MAU | 30 min | ✓* |

**Quick Pick Recommendations:**
- **Consumer app**: Clerk (best UX/DX, native components)
- **Internal team app**: Supabase (open-source, full backend)
- **Enterprise/SSO**: Auth0 (most flexible)
- **Google ecosystem**: Firebase (best integration)
- **AWS ecosystem**: Cognito (if already on AWS)

---

## 1. Clerk

### Overview
Modern authentication platform with first-class Expo support. March 2026 release added native Expo components (AuthView, UserButton, UserProfileView) with SwiftUI/Jetpack Compose backing.

### SDK Quality & React Native Support

**Version:** @clerk/expo v3.0+ with Core-3 Signal API (March 2026)

**Support Level:** ⭐⭐⭐⭐⭐ Excellent
- Dedicated `@clerk/expo` SDK (not JS wrapper)
- Native Expo components with platform-specific UI
- Full React Native New Architecture compatible
- Expo SDK 52+ support
- Three implementation approaches:
  1. Custom flows with React Native components (max control)
  2. OAuth flows via browser (simple, secure)
  3. Native prebuilt components (best UX)

**Recent March 2026 Updates:**
- New native `AuthView` renders full sign-in/sign-up UI natively
- `UserButton` displays avatar + native profile modal
- Google Sign-In available natively via NativeClerkGoogleSignIn TurboModule
- `@clerk/expo/native` components for SwiftUI/Jetpack Compose look/feel

### Setup Complexity

**Complexity:** ⭐⭐ Very Easy

```bash
npx expo install @clerk/expo
# Add to app.json:
{
  "plugins": ["@clerk/expo"]
}
# Done. ~5 minutes total.
```

Features:
- Expo Config Plugin handles native code
- Quickstart example repo on GitHub
- Works immediately in Expo Go for basic flows

### Pricing

| Tier | MAU | Cost | Features |
|------|-----|------|----------|
| **Free** | 50,000 | $0 | Email/password, OAuth, MFA |
| **Pro** | Unlimited | $20+/mo | Email customization, advanced MFA |

Increased from 10K to 50K MAU in 2026 for competitiveness.

### OAuth/Social Login Support

**Coverage:** ~25+ providers including:
- Google, Apple, Facebook, GitHub, Discord, LinkedIn
- Microsoft, Atlassian, Bitbucket, Box, Coinbase, Dropbox
- Custom OIDC provider for others

Setup is one-click in Clerk dashboard.

### Session Management

Automatic:
- Short-lived JWT (auto-refreshed every 60 seconds)
- Refresh via internal session cookies
- `useAuth()` and `useSession()` React hooks
- No manual token handling needed

### Token Handling

**Access Token:**
- Short-lived JWT
- Auto-refreshed by SDK every 60 seconds
- Stored securely in Expo secure storage (platform-backed)

**Refresh Token:**
- Managed internally by Clerk
- Automatic rotation

**Manual Refresh:** Via `getToken(skipCache: true)` when needed

### Offline Capability

**Limited:**
- Requires connectivity for initial auth
- Session tokens cached locally allow ~60 seconds offline operation
- Not suitable for offline-first apps

### Security Features

- **MFA:** TOTP (authenticator apps) + SMS
- **Passwordless:** Email verification, Magic Links, Passkeys (native support via @clerk/expo/native)
- **Advanced:** Fraud detection, Device verification
- **Token Security:** Secure enclave support, no AsyncStorage

### Community & Documentation

**Maturity:** ⭐⭐⭐⭐⭐ Excellent
- Dedicated Expo documentation with working examples
- Official GitHub Expo Quickstart repo (`clerk/clerk-expo-quickstart`)
- Medium community tutorials
- Active Slack community
- Blog: "Using Clerk in React Native"
- GitHub issues actively maintained

**References:**
- [Clerk Expo Quickstart](https://clerk.com/docs/expo/getting-started/quickstart)
- [Expo Documentation - Using Clerk](https://docs.expo.dev/guides/using-clerk/)

---

## 2. Firebase Authentication

### Overview
Google's authentication platform. Offers both JavaScript SDK (pure JS) and React Native Firebase SDK (native bindings). Excellent free tier, largest community.

### SDK Quality & React Native Support

**SDK Options (choose one):**

**1. Firebase JS SDK** (`firebase@^12.0.0+`)
- Pure JavaScript
- Works in Expo Go
- No native dependencies
- Smaller bundle
- Recommended for beginners

**2. React Native Firebase** (native)
- Wraps Android/iOS native SDKs
- Better performance
- Requires EAS build (not Expo Go)
- More powerful features

**Support Level:** ⭐⭐⭐⭐ Good

**Requirements:**
- Expo SDK 53+
- Firebase 12+ (for JS SDK)
- React Native Firebase library maintained separately

### Setup Complexity

**Complexity:** ⭐⭐⭐ Moderate

```bash
# JS SDK approach (simpler)
npx expo install firebase

# Or React Native Firebase (requires build)
eas build --platform ios
eas build --platform android
```

Setup includes:
- Google Cloud project creation
- Firebase project initialization
- Config file (GOOGLE_APPLICATION_CREDENTIALS)
- EXPO_PUBLIC_ environment variables

Estimated time: 10-15 minutes.

### Pricing

| Tier | MAU | Cost | Features |
|------|-----|------|----------|
| **Free** | 50,000 | $0 | Email, Magic Links, basic OAuth |
| **Identity Platform** | - | $0-$ | TOTP/SMS MFA, SAML, OIDC |

**Important:** TOTP MFA requires paid Identity Platform tier (starts free for dev, paid for production features).

### OAuth/Social Login Support

**Coverage:** 20+ providers:
- Google, Apple, Facebook, Twitter, GitHub, Microsoft, LinkedIn
- Custom via OpenID Connect (Identity Platform required)
- Phone authentication (SMS)

### Session Management

- Uses native SDK persistence (Keychain/Keystore on iOS/Android)
- Session state checked at app startup via `onAuthStateChanged()`
- Handles automatic token refresh
- Works with local storage (AsyncStorage)

### Token Handling

**ID Token:**
- JWT identifying user
- Issued on auth

**Refresh Token:**
- Opaque token
- Managed internally by Firebase
- Automatic refresh handled by SDK

**No Manual Token Management:** SDK handles all refresh logic.

### Offline Capability

**Limited with Known Issues:**
- Database (Firestore/Realtime): Full offline support with sync
- Authentication: No offline auth for new logins
- Session persistence: Works if previously authenticated, but fails on offline cold start

**Critical Issue (February 2026):** If user:
1. Closes app while authenticated
2. Goes offline/loses connectivity
3. Reopens app

Session is lost even if JWT stored locally. This is a Firebase JS SDK limitation.

### Security Features

- **MFA:** TOTP (requires Identity Platform) + SMS
- **Passwordless:** Magic Links (email-only)
- **Advanced:** Phone authentication, Session revocation
- **Token Security:** Managed by SDK, no AsyncStorage exposure

### Community & Documentation

**Maturity:** ⭐⭐⭐⭐ Strong
- Official Firebase + Expo documentation
- React Native Firebase library actively maintained
- Largest community (millions of users)
- Multiple Medium/blog tutorials
- Large Stack Overflow support base

**References:**
- [Using Firebase - Expo Docs](https://docs.expo.dev/guides/using-firebase/)
- [React Native Firebase Auth](https://rnfirebase.io/auth/usage)

---

## 3. Auth0

### Overview
Enterprise-grade authentication with SSO, SAML, flexible MFA. Requires development build (not Expo Go compatible). Most powerful for enterprise scenarios.

### SDK Quality & React Native Support

**Version:** react-native-auth0 v5.0.0 (current, March 2026)

**Requirements:**
- React 19+
- React Native 0.78.0+
- Expo 53+
- Native modules (TurboModule spec)
- Development build (EAS required)

**Support Level:** ⭐⭐⭐⭐ Excellent
- Dedicated `react-native-auth0` SDK
- Full React Native New Architecture support (v5.0.0+)
- Bridgeless compatible
- Actively maintained

**Critical Limitation:** Not compatible with Expo Go. Requires:
- Custom development client, OR
- EAS production build

### Setup Complexity

**Complexity:** ⭐⭐⭐⭐ Complex (most complex of all)

```bash
pnpm add react-native-auth0

# In app.json, add config plugin:
{
  "plugins": ["react-native-auth0"]
}

# Set bundleIdentifier & package name in app.json
# iOS: iOS deployment target minimum 14.0

# Build via EAS
eas build --platform ios
eas build --platform android
```

Estimated time: 20-30 minutes with EAS setup.

### Pricing

| Tier | Users | Cost | SSO |
|------|-------|------|-----|
| **Free** | 100 | Free | ✗ |
| **Pro** | Unlimited | $15+/mo | ✓ |

Free tier is smallest among competitors (100 vs 50K MAU).

### OAuth/Social Login Support

**Coverage:** 30+ providers
- Google, Apple, Facebook, GitHub, LinkedIn, Microsoft
- Enterprise: Okta, Microsoft Entra, SAML-compatible providers
- Custom provider via configuration

Universal Login handles all complexity.

### Session Management

- Uses `useAuth0()` React hook
- Manages via secure browser flow (not deep linking)
- State management via hook API
- Full control over token handling

### Token Handling

**Access Token:**
- JWT issued by Auth0
- Retrieved via `getCredentials()`

**Refresh Token:**
- Rotated on each use (best practice)
- Manual access needed

**Philosophy:** Developers have full control; no auto-magic.

### Offline Capability

**Very Limited:** Requires active connection. No offline auth support.

### Security Features

- **MFA:** TOTP (Google Authenticator, Duo), SMS, Push notifications
- **Passwordless:** Email magic links, SMS one-time codes
- **Advanced:** SAML, OpenID Connect, SSO, Risk-based authentication
- **Guardian:** Dedicated MFA service with frictionless UX
- **Compliance:** SOC 2, HIPAA-ready

Most comprehensive enterprise security features.

### Community & Documentation

**Maturity:** ⭐⭐⭐⭐ Strong (but less Expo-specific)
- Official quickstart for Expo
- Community forums active
- Enterprise-grade documentation (dense)
- GitHub repo actively maintained
- Fewer Expo tutorials than Clerk/Supabase

### Gotchas with Expo

- Cannot test in Expo Go; must use development build
- Requires native code compilation (slow iteration)
- Best for production-ready apps, not prototyping

**References:**
- [Auth0 Expo Quickstart](https://auth0.com/docs/quickstart/native/react-native-expo/interactive)
- [react-native-auth0 GitHub](https://github.com/auth0/react-native-auth0)

---

## 4. Supabase Auth

### Overview
Open-source authentication as part of full backend platform. PostgreSQL-native with row-level security. Pure JavaScript SDK means Expo Go compatibility.

### SDK Quality & React Native Support

**Version:** @supabase/supabase-js v2.0+ with React Native support

**Support Level:** ⭐⭐⭐⭐ Good
- Pure JavaScript SDK (no native dependencies)
- Works with Expo Go immediately
- Full Expo SDK support
- Requires polyfills for React Native:
  - `@react-native-async-storage/async-storage`
  - `react-native-url-polyfill`

### Setup Complexity

**Complexity:** ⭐⭐ Very Easy

```bash
npx expo install \
  @supabase/supabase-js \
  @react-native-async-storage/async-storage \
  react-native-url-polyfill

# Add to .env:
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=xxx

# That's it. Works in Expo Go.
```

Estimated time: 5-10 minutes.

### Pricing

| Tier | MAU | Storage | Cost | Auto-pause |
|------|-----|---------|------|-----------|
| **Free** | 50,000 | 500 MB | $0 | After 7 days inactivity |
| **Pro** | 100,000 | 8 GB | $25/mo | None |

**Critical Limitation:** Free tier projects auto-pause after 7 days of inactivity. Unsuitable for production apps requiring 24/7 uptime.

### OAuth/Social Login Support

**Coverage:** 15+ providers:
- Google, Apple, GitHub, LinkedIn, Discord, Spotify, Twitch
- Email/password, Magic links, Phone auth (SMS)
- Custom OAuth provider support
- SAML (team plan+)

### Session Management

Event-based with AsyncStorage:
```typescript
persistSession: true
autoRefreshToken: true
detectSessionInUrl: false

// Event listener stops refresh when app backgrounded
// Restarts when foreground
```

Session stored in AsyncStorage; `onAuthStateChange()` listener for state updates.

### Token Handling

**Access Token:**
- Short-lived JWT
- Expires in 1 hour (default)

**Refresh Token:**
- Long-lived, stored in AsyncStorage
- Manual refresh via `auth.refreshSession()`

**Important Security Note:** AsyncStorage is plaintext. Production apps MUST override storage to use secure storage (react-native-keychain).

### Offline Capability

**Known Issues:**
- Session not persisted when app starts offline
- `autoRefresh` fails → session eventually cleared
- Documented issue: Session lost if app starts without connectivity

**Workarounds:**
1. Implement offline state detection, disable refresh when offline
2. Use WatermelonDB for offline-first with later Supabase sync
3. Store JWT in secure storage, check expiry before refresh

**Better Alternative:** Supabase + WatermelonDB for true offline-first architecture with eventual consistency.

### Security Features

- **MFA:** TOTP via authenticator apps
- **Passwordless:** Magic links, phone auth (SMS)
- **Advanced:** Row-level security (RLS) via PostgreSQL
- **Database:** PostgreSQL with full data privacy controls
- **Advantage:** Can lock down data access at database layer

### Community & Documentation

**Maturity:** ⭐⭐⭐⭐ Strong (open-source friendly)
- Excellent React Native/Expo guides (official)
- Tutorial: "Build a User Management App with Expo"
- Medium articles with step-by-step examples
- Starter projects on GitHub (`expo-supabase-starter`)
- Open-source culture, transparent roadmap
- Active Discord community

**Unique Advantage:** Fully open-source, self-hosting option available.

**References:**
- [Supabase Auth React Native Guide](https://supabase.com/docs/guides/auth/quickstarts/react-native)
- [Using Supabase - Expo Docs](https://docs.expo.dev/guides/using-supabase/)
- [Supabase Blog - React Native Authentication](https://supabase.com/blog/react-native-authentication)

---

## 5. AWS Cognito

### Overview
AWS's identity and access management service. Most complex setup but powerful for AWS-integrated applications. Requires AWS Amplify wrapper.

### SDK Quality & React Native Support

**SDK:** AWS Amplify + AWS Cognito backend

**Support Level:** ⭐⭐⭐ Adequate
- JavaScript-based Amplify SDK
- Works with Expo but requires custom dev build for advanced features
- Full New Architecture compatible
- Growing 2026 support, but still more complex than competitors

### Setup Complexity

**Complexity:** ⭐⭐⭐⭐ Very Complex

```bash
# Create AWS account + Cognito user pool (AWS Console)
# Create Cognito Identity Pool
# Create IAM policies
# Install Amplify
npm install aws-amplify

# Configure app
# Amplify.configure({ Auth: {...} })
```

Estimated time: 30-45 minutes including AWS console navigation.

### Pricing

| Tier | MAU | Cost | Features |
|------|-----|------|----------|
| **Free** | 50,000 | $0 | Basic auth |
| **Scale** | - | Usage-based | Advanced features |

Additional costs: Lambda invocations, data transfer. Can get expensive with advanced auth flows.

### OAuth/Social Login Support

**Flexible:**
- Configure any OAuth provider via Cognito Identity Providers
- Google, Facebook, Apple, custom OIDC
- Enterprise providers (Okta, Azure AD)

### Session Management

- Amplify manages via Cognito tokens
- Context/useState pattern common in examples
- `Auth.currentAuthenticatedUser()` for session check
- More manual than Clerk/Firebase

### Token Handling

**Access Token:**
- JWT issued by Cognito
- Short-lived

**ID Token:**
- User claims JWT

**Refresh Token:**
- Opaque Cognito token

**Critical Security Note (February 2026):** Never store tokens in AsyncStorage. Use device secure enclave/Keystore.

### Offline Capability

**Very Limited:** Requires AWS connectivity. No offline auth support.

### Security Features

- **MFA:** TOTP, SMS, Hardware tokens
- **Passwordless:** Phone, email verification
- **Advanced:** SAML, OpenID Connect, Lambda custom auth flows
- **Compliance:** SOC 2, HIPAA, PCI-DSS capable
- **Best for:** Enterprise compliance requirements

### Community & Documentation

**Maturity:** ⭐⭐⭐ Adequate (enterprise-focused)
- AWS documentation comprehensive but dense
- Amplify docs with Expo mentions
- Fewer community tutorials than competitors
- GitHub examples available
- Less Expo-specific content
- Better for teams already in AWS ecosystem

**References:**
- [AWS Cognito React Native Integration](https://oneuptime.com/blog/post/2026-02-12-cognito-authentication-mobile-app/view)

---

## Comparison Table

| Feature | Clerk | Firebase | Auth0 | Supabase | Cognito |
|---------|-------|----------|-------|----------|---------|
| **Setup Time** | 5 min | 10 min | 20 min | 5 min | 30+ min |
| **Complexity** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **Free Tier MAU** | 50K | 50K | 100 | 50K | 50K |
| **Expo Go Support** | ✓ | ✓ JS SDK | ✗ | ✓ | ✓ mostly |
| **Native Components** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | - | ⭐⭐ |
| **Offline Auth** | ⭐ | ⭐ | ⭐ | ⭐ | ⭐ |
| **Session Offline Grace** | ~60s | Buggy | None | Issues | None |
| **OAuth Providers** | 25+ | 20+ | 30+ | 15+ | Configurable |
| **MFA: TOTP** | ✓ | ⚠️ | ✓ | ✓ | ✓ |
| **MFA: SMS** | ✓ | ⚠️ | ✓ | ✓ | ✓ |
| **Passwordless** | Email, Magic, Passkeys | Magic | Magic | Magic, Phone | Phone, Email |
| **Token Type** | JWT (managed) | JWT | JWT | JWT | JWT + opaque |
| **Developer UX** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Documentation** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **React Native New Arch** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Community Size** | Growing | Largest | Large | Medium | Medium |
| **Self-Hosting** | ✗ | ✗ | ✗ | ✓ | ✗ |
| **Best For** | Consumer DX | Google, Scale | Enterprise | Backend Control | AWS Only |

⚠️ = Requires paid tier

---

## Expo-Specific Gotchas & Solutions

### 1. Expo Go Limitations

**The Problem:** Expo Go is a sandbox that cannot support:
- Native modules
- OAuth deep linking (some cases)
- Passkeys
- Native Google Sign-In
- Custom native code

**Solution Strategy by Provider:**

| Provider | Expo Go | Dev Build | Production |
|----------|---------|-----------|-----------|
| Clerk | ✓ Browser OAuth | ✓ Native components | ✓ Full features |
| Firebase JS | ✓ Full support | ✓ Full | ✓ Full |
| Firebase Native | ✗ | ✓ | ✓ |
| Auth0 | ✗ | ✓ | ✓ |
| Supabase | ✓ Full support | ✓ Full | ✓ Full |
| Cognito | ✓ Most features | ✓ Full | ✓ Full |

**Best Practice:** Start development in Expo Go for speed. Switch to development build (via EAS) only when adding provider-specific native features.

### 2. Token Storage Security (Critical)

**The Problem:** AsyncStorage is plaintext and searchable from:
- Device backups (iOS/Android)
- Rooted/jailbroken phones
- USB debugging
- App repackaging

**Evidence (2026):** OneUptime security blog confirms tokens stolen from AsyncStorage in minutes on rooted devices.

**Current Best Practice:**
```typescript
// NEVER do this:
AsyncStorage.setItem('authToken', token) // ❌ Insecure

// DO this instead:
import * as SecureStore from 'expo-secure-store'
// or
import { setGenericPassword } from 'react-native-keychain'

// Token Storage Strategy:
// - Access Token: Memory (cleared on app close)
// - Refresh Token: Secure storage (Keychain/Keystore)
```

**Libraries for Secure Storage:**
- **react-native-keychain** — Best for Keychain/Keystore, biometric support
- **expo-secure-store** — Expo wrapper, simpler API
- **react-native-sensitive-info** — Modern Nitro modules, metadata-rich

**Provider Defaults:**
- Clerk: ✓ Uses secure storage
- Firebase: ✓ Managed by SDK
- Auth0: ✓ Returns token to client; must implement secure storage
- Supabase: ✗ Examples use AsyncStorage (override!)
- Cognito: ⚠️ Guide recommends avoiding AsyncStorage

### 3. Offline Authentication Cold Start

**The Problem:** Firebase and Supabase lose session if:
1. App authenticates while online
2. User closes app
3. Device goes offline
4. App reopens

Session state is cleared before auth service can restore it.

**Provider Behavior:**

| Provider | Offline Restart | Workaround |
|----------|-----------------|-----------|
| Clerk | ~60s grace period | Good |
| Firebase JS | Session lost (known bug) | Use React Native Firebase |
| Firebase Native | Better handling | Recommended for offline |
| Auth0 | Session lost | Not suitable for offline-first |
| Supabase | Session lost (documented) | Use WatermelonDB |
| Cognito | Session lost | Not suitable for offline-first |

**Solution for Offline-First Apps:**
- Supabase + WatermelonDB (offline database with sync)
- Or: Custom backend with explicit JWT caching
- Or: Check token validity before attempting refresh

### 4. Deep Linking & OAuth Callbacks

**The Problem:** OAuth requires redirect URI matching:
- Exact scheme (`exp://`, `custom://`)
- Exact domain
- Exact path

**Expo Solutions:**
- Set `deepLinking` in `app.json`
- EAS builds can use different schemes per profile
- Development builds support custom scheme via `eas.json`

**Provider Differences:**

| Provider | Deep Linking | Browser OAuth | Recommendation |
|----------|--------------|---------------|-----------------|
| Clerk | Auto via plugin | ✓ | Auto-handled |
| Firebase | Manual setup | Via `signInWithCredential` | Manual config |
| Auth0 | Requires exact match | Via browser | Use browser approach |
| Supabase | Via browser (better) | ✓ | Browser-based (safer) |
| Cognito | Flexible | ✓ | Either works |

**Best Practice:** Use browser-based OAuth when possible (Supabase approach) rather than deep linking. Safer and simpler.

### 5. Native Module Version Mismatch

**The Problem:** Auth SDKs sometimes pin specific React Native versions.

**2026 Status:** Most have adapted to React Native New Architecture:
- **Auth0 v5.0.0**: Requires React 19+, React Native 0.78.0+
- **Clerk v3.0+**: Compatible across versions
- **Firebase**: Compatible with both architectures
- **Supabase**: Pure JS, no version conflicts
- **Cognito**: Works across versions

**Solution:** Use EAS build; it handles dependency resolution automatically.

### 6. API Key Exposure in Bundles

**The Problem:** Environment variables in React Native are bundled in app binary.

**Solution Pattern:**
- Only use `EXPO_PUBLIC_` for non-sensitive (domain, IDs)
- Never embed API secrets
- Keep secrets on backend only
- Use BFF (Backend-for-Frontend) pattern

**All Providers Handle This Correctly:** They don't require embedding API secrets in client.

---

## Use-Case Recommendations

### Consumer App (User Authentication)

**Priority:** User experience, social login, scale to millions

**Recommendation:** **Clerk** (primary) or **Firebase** (secondary)

**Why Clerk:**
- Best native UI components (no WebView delays)
- Easiest setup (5 min)
- Modern passkey support (March 2026)
- Generous free tier (50K MAU)
- Best developer experience
- Fastest iteration cycle

**Why Firebase Alternative:**
- Same free tier size (50K MAU)
- Better if using Firebase database/functions
- Larger community for Q&A
- Better offline persistence (React Native Firebase)

**Implementation Path:**
1. Start in Expo Go with browser OAuth
2. Test basic flows
3. Move to dev build for native components (if desired)
4. Deploy via EAS

**Estimated Time:** 3-5 days to MVP

---

### Internal Team App

**Priority:** Quick setup, simplicity, control over backend, open-source

**Recommendation:** **Supabase** (primary) or **Firebase** (secondary)

**Why Supabase:**
- Open-source (can self-host)
- Full PostgreSQL backend included
- Expo Go compatible (no build needed)
- Row-level security for team data
- Data remains in your control
- Excellent for internal tools

**Why Firebase Alternative:**
- Dead simple setup
- Excellent Firestore integration
- Google Cloud ecosystem
- Larger community

**Implementation Path:**
1. Create Supabase project
2. Set env vars
3. Test in Expo Go immediately
4. Add row-level security as needed

**Estimated Time:** 2-3 days to MVP

---

### Kiosk/Guide App (Service Account / Device Auth)

**Special Considerations:**

Service account authentication is not typical for mobile. Standard approaches:

#### Option 1: No User Auth (Device Registered)
- App runs as fixed device account
- Backend controls access
- OAuth authentication once, token stored securely
- Refresh token server-side

**Recommendation:** Supabase or Firebase

**Implementation:**
```typescript
// On first app launch:
const { session, error } = await supabase.auth.signInWithPassword({
  email: 'kiosk-device-123@internal.company.com',
  password: process.env.EXPO_PUBLIC_KIOSK_PASSWORD
})

// Store refresh token securely
await SecureStore.setItemAsync('refreshToken', session.refresh_token)

// Daily refresh via background task
```

#### Option 2: Device Code Auth
- User enters code to register device
- Backend maps code to device ID
- Simple JWT-based auth

**Recommendation:** Custom backend or Supabase

#### Option 3: API Key Auth
- Device has embedded API key
- Simpler than OAuth
- Risk: Key compromise

**Recommendation:** Custom backend only

**For Kiosk Best Setup:**
- Supabase + custom device registration flow
- Or: Simple JWT backend + secure token storage
- Refresh token daily via background task
- No user interaction needed after setup

**Estimated Time:** 3-4 days to MVP

---

## Token Storage & Security Best Practices (2026)

### Recommended Token Strategy

```
Access Token:
  Duration: 15 minutes
  Storage: Memory only (cleared on app close)
  Use: All API requests
  Rotation: Not needed (short-lived)

Refresh Token:
  Duration: 7-30 days
  Storage: Device secure enclave (Keychain/Keystore)
  Use: Obtain new access token
  Rotation: Each use (new refresh token issued with new access token)
```

### Implementation Pattern

```typescript
// 1. On login
const { session } = await auth.signIn(email, password)

// 2. Store refresh token securely
await SecureStore.setItemAsync('refreshToken', session.refresh_token)

// 3. Keep access token in memory
const accessTokenRef = useRef(session.access_token)

// 4. On API request
const response = await fetch('/api/data', {
  headers: {
    Authorization: `Bearer ${accessTokenRef.current}`
  }
})

// 5. If 401, refresh
if (response.status === 401) {
  const refreshToken = await SecureStore.getItemAsync('refreshToken')
  const { access_token, refresh_token } = await auth.refreshSession(refreshToken)

  accessTokenRef.current = access_token
  await SecureStore.setItemAsync('refreshToken', refresh_token)

  // Retry request
  return fetch(...headers with new token)
}

// 6. On logout
await SecureStore.deleteItemAsync('refreshToken')
accessTokenRef.current = null
```

### Secure Token Libraries

**Option 1: expo-secure-store** (Recommended for Expo)
```typescript
import * as SecureStore from 'expo-secure-store'

await SecureStore.setItemAsync('token', value)
const token = await SecureStore.getItemAsync('token')
```

**Option 2: react-native-keychain** (More features)
```typescript
import * as Keychain from 'react-native-keychain'

await Keychain.setGenericPassword('username', token)
const credentials = await Keychain.getGenericPassword()
```

**Option 3: react-native-sensitive-info** (Modern)
```typescript
import RNSensitiveInfo from 'react-native-sensitive-info'

await RNSensitiveInfo.setItem('token', value)
const token = await RNSensitiveInfo.getItem('token')
```

### HTTP Client Integration

**With TanStack Query (Recommended):**
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Retry on 401 with token refresh
        if (error.status === 401) {
          return failureCount < 1
        }
        return failureCount < 3
      }
    }
  }
})
```

**With Axios Interceptors:**
```typescript
axios.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      const refreshToken = await SecureStore.getItemAsync('refreshToken')
      const { access_token } = await auth.refreshSession(refreshToken)

      error.config.headers.Authorization = `Bearer ${access_token}`
      return axios(error.config)
    }
    return Promise.reject(error)
  }
)
```

### Security Checklist

- [ ] Never store tokens in AsyncStorage
- [ ] Use Keychain/Keystore for refresh tokens
- [ ] Keep access tokens in memory only
- [ ] Implement token rotation (new refresh token per refresh)
- [ ] Use HTTPS exclusively (automatic with Expo + HTTPS APIs)
- [ ] Implement certificate pinning for critical APIs (optional but recommended)
- [ ] Detect rooted/jailbroken devices (optional but recommended)
- [ ] Log all token rotation events for audit trails
- [ ] Clear all tokens completely on logout
- [ ] Validate token expiry before use
- [ ] Handle concurrent token refresh requests (prevent race conditions via mutex)

---

## Decision Matrix (Quick Reference)

### For Maximum Developer Speed & UX
**Clerk** → 5 min setup, Expo Go works, browser or native OAuth, modern patterns, excellent docs

### For Maximum Flexibility & Backend Control
**Supabase** → Full PostgreSQL backend, row-level security, open-source, Expo Go friendly

### For Enterprise/SSO Requirements
**Auth0** → Most flexible enterprise features, SAML, advanced MFA, requires dev build

### For Google Ecosystem Integration
**Firebase** → Firestore/Functions integration, largest free tier, good docs, largest community

### For AWS Ecosystem Integration
**Cognito** → AWS integration, expensive at scale, most complex, not recommended unless all-in on AWS

---

## Summary Table: One-Page Cheat Sheet

```
Provider    | Mins | Free MAU | Expo Go | Best Feature    | Gotcha
------------|------|----------|---------|-----------------|----------
Clerk       | 5    | 50K      | ✓       | Native UI       | None major
Firebase    | 10   | 50K      | ✓*      | Google eco      | Offline bugs
Auth0       | 20   | 100      | ✗       | Enterprise SSO  | Dev build only
Supabase    | 5    | 50K      | ✓       | Full backend    | Auto-pause free
Cognito     | 30   | 50K      | ✓*      | AWS integration | Very complex

✓  = Works fine
✗  = Doesn't work
✓* = Works with caveats (offline issues, some limitations)
```

---

## Additional Resources

### Official Expo Authentication Guide
[Authentication in Expo and React Native apps](https://docs.expo.dev/develop/authentication/)

### Token Security Best Practices (2026)
[How to Secure React Native Apps with JWT and Refresh Tokens](https://oneuptime.com/blog/post/2026-01-15-react-native-jwt-refresh-tokens/view)

[How to Secure Sensitive Data with React Native Keychain](https://oneuptime.com/blog/post/2026-01-15-react-native-keychain-security/view)

### React Native Security Fundamentals
[React Native Security Docs](https://reactnative.dev/docs/security)

### Token Architecture & Design
[JWT.io — JWT Introduction](https://jwt.io)

### Offline-First Architecture
[Building Offline-First Apps with Expo, Supabase & WatermelonDB](https://www.themorrow.digital/blog/building-offline-first-app-with-expo-supabase-and-watermelondb-authentication)

---

**Last Updated:** 2026-03-14
**Status:** Current as of March 2026
**Focus Area:** Expo + React Native mobile authentication
**Applicability:** All use cases (consumer, internal, kiosk)
