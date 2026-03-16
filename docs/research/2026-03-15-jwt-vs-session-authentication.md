# JWT vs Session-Based Authentication: Comprehensive Research

> Last updated: March 2026
> Scope: Modern authentication patterns for Node.js backends with TanStack Start, PostgreSQL, and distributed systems

## Executive Summary

Neither JWT nor session-based authentication alone represents the optimal authentication strategy in 2024-2026. The industry consensus has shifted toward **hybrid approaches** that combine session tokens with stateless validation, balancing security, performance, and operational complexity. This research documents current best practices with specific recommendations for TanStack Start + Node.js + PostgreSQL stacks, including Discord bot/multi-channel authentication scenarios.

---

## Table of Contents

1. [Core Mechanisms](#core-mechanisms)
2. [Storage Architecture](#storage-architecture)
3. [Statelessness: Theory vs Reality](#statelessness-theory-vs-reality)
4. [Security Analysis](#security-analysis)
5. [Scalability Implications](#scalability-implications)
6. [Performance Comparison](#performance-comparison)
7. [User Experience Considerations](#user-experience-considerations)
8. [OAuth2 & OpenID Connect Integration](#oauth2--openid-connect-integration)
9. [Use Case Decision Matrix](#use-case-decision-matrix)
10. [Hybrid Approaches](#hybrid-approaches)
11. [Recommendations for Galatea](#recommendations-for-galatea)

---

## Core Mechanisms

### Session-Based Authentication

**How it works:**

1. User submits credentials (username/password)
2. Server validates credentials against stored password hash
3. Server creates a session object with session ID (typically 128-bit random string)
4. Session ID is stored on server (database, cache, or memory)
5. Session ID returned to client as HTTP-only cookie
6. On subsequent requests, client sends cookie automatically
7. Server retrieves session data using session ID
8. Validation is performed by checking server-side session store

**Key characteristics:**
- Server maintains all session state
- Client holds only an opaque identifier
- Immediate revocation possible
- Stateful architecture

### JWT (JSON Web Tokens)

**How it works:**

1. User submits credentials
2. Server validates credentials
3. Server creates JWT payload with claims (user ID, roles, expiration, etc.)
4. Server signs JWT with private key (or HMAC secret)
5. Complete JWT returned to client (header.payload.signature)
6. Client stores JWT (typically in memory, localStorage, or HTTP-only cookie)
7. On subsequent requests, client includes JWT in Authorization header
8. Server validates signature using public key (or secret)
9. If signature valid and not expired, server trusts embedded claims

**JWT Structure:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

- **Header**: Algorithm and token type
- **Payload**: Claims (user ID, roles, custom data)
- **Signature**: HMAC or RSA signature for integrity verification

**Key characteristics:**
- Stateless validation (no server state required)
- Portable across services
- Cannot be revoked before expiration
- Larger payload size

---

## Storage Architecture

### Session Storage

**Server-Side Storage Options:**

| Storage Method | Latency | Persistence | Scalability | Notes |
|---|---|---|---|---|
| **In-Memory (Node)** | < 1ms | None (process death = loss) | Single node only | Development only |
| **Redis** | 5-10ms | Optional persistence | Horizontal scaling | Most common for production |
| **PostgreSQL** | 10-50ms | Persistent | Moderate scaling | Good for smaller deployments |
| **Memcached** | 5-10ms | No persistence | Horizontal scaling | Session-specific design |

**Redis vs PostgreSQL for Sessions (2024-2025 data):**

Redis remains fastest for session storage:
- Redis: Sub-millisecond latency for get/set operations
- PostgreSQL: 10-50ms latency depending on connection pooling

Recent developments (2025):
- PostgreSQL can use UNLOGGED tables for near-Redis performance
- PostgreSQL approach viable if you're already using it for primary data
- Hybrid approach: Redis for sessions, PostgreSQL for audit/analytics

### Client-Side Storage

**Session Cookies:**
```
Set-Cookie: sessionId=abc123def456;
  Secure;
  HttpOnly;
  SameSite=Strict;
  Path=/;
  Max-Age=604800
```

- Automatically sent with every request
- Protected from XSS via HttpOnly flag
- Protected from CSRF via SameSite attribute
- Respects domain boundaries

**JWT Storage Options:**

| Location | Pros | Cons |
|---|---|---|
| **HTTP-only Cookie** | XSS-safe, automatic transmission | CSRF risk (mitigated with SameSite) |
| **localStorage** | Easy to manage | Vulnerable to XSS |
| **Memory (closure)** | Most secure | Lost on page refresh |
| **sessionStorage** | Intermediate security | Lost on tab close, XSS vulnerable |

**Current best practice:** HTTP-only cookies with SameSite=Strict/Lax

---

## Statelessness: Theory vs Reality

### The JWT Statelessness Promise

JWTs are commonly described as "stateless," but this description requires nuance:

**True stateless aspects:**
- No server-side lookup required for basic signature verification
- Can validate token on any server in a cluster
- No shared state between services in microservices architecture
- Works well for stateless, ephemeral compute (serverless)

**Where "stateless" breaks down:**

1. **Revocation/Logout**: Requires blacklist = state
2. **Token Rotation**: Requires tracking used refresh tokens = state
3. **Permission Changes**: Token claims become stale immediately
4. **Rate Limiting**: Requires tracking user request counts = state
5. **Anomaly Detection**: Requires session tracking = state

**Real-world statelessness assessment:**
```
Truly stateless: ~30% of real applications
Hybrid approaches: ~60% of production deployments
Fully stateful (sessions): ~10% (security-critical domains)
```

### Session Statefulness Reality

Sessions are inherently stateful but can be made more scalable:

1. **Session Replication**: State replicated across cluster nodes
2. **Sticky Sessions**: User routes to same node (reduces scalability)
3. **Centralized Store**: All nodes query shared Redis/cache (adds latency)
4. **Database Sessions**: Persistent but slower

---

## Security Analysis

### JWT Security Vulnerabilities & Mitigations

#### 1. Signature Verification Issues

**Attack:** Attacker modifies token payload without detection
```javascript
// Vulnerable: not verifying signature
const decoded = jwt.decode(token); // No verification!
if (decoded.userId === admin) { /* grant access */ }
```

**Mitigation:**
```javascript
try {
  const decoded = jwt.verify(token, SECRET, {
    algorithms: ['HS256'] // Explicitly allow only expected algorithm
  });
} catch (err) {
  // Token invalid, deny access
}
```

#### 2. None Algorithm Attack (Critical)

**Attack:** Attacker changes algorithm to "none"
```json
{
  "alg": "none",
  "typ": "JWT"
}
.
{
  "userId": "1",
  "role": "admin"
}
.
(empty signature)
```

**Mitigation:**
```javascript
// ✓ Specify allowed algorithms
jwt.verify(token, SECRET, { algorithms: ['HS256'] });

// ✗ Don't allow dynamic algorithm selection
jwt.verify(token, SECRET, { algorithms: token.header.alg });
```

#### 3. Algorithm Confusion Attack (Critical)

**Attack:** Server signs with RS256 (asymmetric), attacker uses HS256 with public key as secret
```javascript
// Server uses public key for verification - WRONG
const publicKey = fs.readFileSync('public.pem');
jwt.verify(token, publicKey, { algorithms: ['HS256', 'RS256'] }); // VULNERABLE!

// If attacker uses HS256 with publicKey as secret, they can forge tokens
```

**Mitigation:**
```javascript
// ✓ Use asymmetric algorithm correctly
jwt.verify(token, publicKey, { algorithms: ['RS256'] }); // Only asymmetric

// ✓ Use symmetric correctly
jwt.verify(token, SECRET, { algorithms: ['HS256'] }); // Only symmetric
```

#### 4. Weak Secret Key (Brute Force)

**Attack:** JWT signed with common secret ("secret", "password", company name)

**Mitigation:**
```javascript
// ✗ Bad
const SECRET = 'password';
const SECRET = 'MyCompanyName';

// ✓ Good - cryptographically strong random
const SECRET = crypto.randomBytes(32); // 256-bit key minimum
// Or use environment-loaded secrets
const SECRET = process.env.JWT_SECRET; // Must be >= 32 bytes
```

#### 5. Cross-Service Relay Attack

**Attack:** Token issued for ServiceA used on ServiceB without "aud" (audience) validation
```javascript
// Vulnerable token - no audience claim
{ userId: 1, exp: 1234567890 }

// ServiceB accepts it
jwt.verify(token, SECRET); // No audience check
```

**Mitigation:**
```javascript
// Token includes audience
{ userId: 1, aud: 'api.service-a.internal', exp: 1234567890 }

// ServiceB validates audience
jwt.verify(token, SECRET, { audience: 'api.service-b.internal' });
// Will reject token issued for ServiceA
```

#### 6. Lack of Expiration ("Expired" Tokens)

**Attack:** Token without "exp" claim valid indefinitely

**Mitigation:**
```javascript
// ✓ Always include short expiration
jwt.sign(
  { userId: user.id, role: user.role },
  SECRET,
  {
    expiresIn: '15m', // 15 minutes for access token
    algorithm: 'HS256'
  }
);
```

#### 7. Token Exposure via Logs/Errors

**Vulnerability:** JWT leaked in error messages, logs, or URLs
```javascript
// ✗ Bad - token visible in logs
console.error('Request failed:', req.headers.authorization);
return res.status(500).json({ token: token, error: 'server error' });

// ✓ Good - never log tokens
const tokenPreview = token.substring(0, 10) + '...';
console.error('Request failed:', tokenPreview);
```

### Session Security Best Practices

#### 1. Session ID Generation

**Best practices (OWASP):**
- Minimum 128 bits entropy (16 bytes)
- Cryptographically random
- No user-identifiable data in session ID
```javascript
// ✓ Good
const sessionId = crypto.randomBytes(16).toString('hex');

// ✗ Bad
const sessionId = userId + Date.now(); // Predictable
```

#### 2. Cookie Security Attributes

```
Set-Cookie: sessionId=abc123def456;
  Secure;           // HTTPS only
  HttpOnly;         // JavaScript cannot access
  SameSite=Strict;  // No cross-site requests
  Path=/;           // Limit to entire site
  Domain=.example.com; // Explicit domain
  Max-Age=3600;     // 1 hour (shorter = more secure)
```

**Attribute meanings:**
- **Secure**: Only transmitted over HTTPS
- **HttpOnly**: Protects against XSS token theft
- **SameSite**: Protects against CSRF
  - `Strict`: Never sent cross-site
  - `Lax`: Sent on top-level navigation
  - `None`: Always sent (requires Secure flag)

#### 3. Session Fixation Prevention

**Attack:** Attacker tricks victim into using attacker-controlled session ID
```
1. Attacker generates session ID: ABC123
2. Attacker tricks victim to login with ?sessionId=ABC123
3. Server reuses ABC123 for victim's session
4. Attacker knows victim's session ID
```

**Mitigation (mandatory):**
```javascript
// ✓ Always regenerate session ID after authentication
app.post('/login', (req, res) => {
  // Validate credentials...

  // Destroy old session
  req.session.destroy();

  // Create NEW session ID
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });

    req.session.userId = user.id;
    res.json({ success: true });
  });
});
```

#### 4. Session Timeout

**2025 Best Practices:**
- **Sensitive data (banking, healthcare)**: 5-15 minutes inactivity
- **Standard authentication**: 15-30 minutes inactivity
- **Low-risk apps**: 1-4 hours inactivity
- **Absolute timeout**: 8-12 hours maximum

```javascript
// Implement session timeout
const SESSION_TIMEOUT = 15 * 60 * 1000; // 15 minutes

app.use(session({
  store: sessionStore,
  cookie: {
    maxAge: SESSION_TIMEOUT,
    httpOnly: true,
    secure: true,
    sameSite: 'strict'
  }
}));
```

### Cross-Request Forgery (CSRF)

Both authentication methods are vulnerable to CSRF if not properly mitigated.

**Session-based CSRF protection:**
```javascript
// Include CSRF token in forms
<form method="POST" action="/transfer">
  <input type="hidden" name="_csrf" value="<%= csrfToken %>">
  <input type="text" name="amount">
</form>

// Validate token on POST/PUT/DELETE
app.post('/transfer', csrfProtection, (req, res) => {
  // Token automatically validated by middleware
  transfer(req.body.amount);
});
```

**JWT CSRF protection:**
- HTTP-only cookies + SameSite=Strict = safe from CSRF
- Reading from Authorization header prevents CSRF (JavaScript-based attacks)
- If storing in localStorage and reading in JavaScript, CSRF still possible via form submission

---

## Scalability Implications

### Distributed Systems & Load Balancing

#### JWT Stateless Advantage

**No sticky sessions required:**
```
Load Balancer
├─ Request 1 → Server A (validates JWT)
├─ Request 2 → Server B (validates JWT)  // Same user, different server - OK
├─ Request 3 → Server C (validates JWT)  // Works because JWT is self-contained
```

**Benefits:**
- Easier horizontal scaling
- No session state replication needed
- Any server can handle any request
- Elasticity (add/remove servers dynamically)

**Microservices advantage:**
```
User → API Gateway (validates JWT)
  ├─→ Service A (reads JWT claims)
  ├─→ Service B (reads JWT claims)
  └─→ Service C (reads JWT claims)
```

Each service independently validates JWT without shared session store.

#### Session State Challenges

**Sticky sessions (less scalable):**
```
Load Balancer
├─ User → Server A (session stored on A)
└─ All user requests → Server A  // Locked to single server
```
Reduces load balancing efficiency.

**Distributed session store (more scalable):**
```
Load Balancer
├─ Request 1 → Server A → Redis (get session)
├─ Request 2 → Server B → Redis (get session)
└─ Request 3 → Server C → Redis (get session)
```

- Requires network hop for every request
- Single point of failure (Redis becomes critical)
- Cache invalidation complexity

### Serverless & Edge Computing

**JWT wins decisively:**
- No persistent state required
- Each function invocation can validate independently
- Works with edge locations/CDN

**Sessions problematic:**
- Lambda functions are ephemeral
- Distributing session state to edge difficult
- Cold starts with session lookup adds latency

---

## Performance Comparison

### Request Latency

**Database overhead per authenticated request:**

| Method | Lookups Required | Latency | Notes |
|---|---|---|---|
| JWT signature validation | 0 | < 2ms | Pure CPU-based validation |
| Session (Redis) | 1 | 5-15ms | Network hop to cache |
| Session (PostgreSQL) | 1 | 15-50ms | Connection pool + query |
| Session (in-process) | 0 | < 1ms | Development only |

**Real-world impact at scale:**

For 1000 requests/sec:
```
JWT:        1000 * 2ms   = 2 seconds CPU
Redis:      1000 * 10ms  = 10 seconds (validation + network)
PostgreSQL: 1000 * 30ms  = 30 seconds (validation + network + query)
```

### Token Size Impact

**Typical JWT token:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
eyJzdWIiOiJ1c2VyLTEyMyIsInJvbGUiOiJhZG1pbiIsIm
VtYWlsIjoiam9obkBleGFtcGxlLmNvbSIsImlhdCI6MTY3O
Tk1NDQ0MCwiZXhwIjoxNjcxOTU0NDQwfQ.
signature...
```

**Size:** 500 bytes - 2KB typical

**Bandwidth impact:**
- 100 daily requests × 1KB average JWT = 100KB per user per day
- 1 million users × 100KB = 100GB daily bandwidth
- Mobile apps: significant battery drain

**Best practices:**
- Keep JWT payload minimal
- Include only: user ID, essential roles, expiration
- Avoid including full user objects, permissions lists, or large strings
- Fetch additional data server-side when needed

### Caching & CPU

**JWT signature validation:**
- HMAC: ~0.1-0.5ms per validation
- RS256: ~1-2ms per validation (slower, requires public key lookup)
- Runs on every request but minimal CPU cost

**Session lookup + deserialization:**
- Redis: network latency dominates
- PostgreSQL: connection pooling, query planning
- Even in-process caching: memory access, deserialization

---

## User Experience Considerations

### Logout & Revocation

#### Sessions: Instant Revocation

```javascript
// Logout immediately invalidates
app.post('/logout', (req, res) => {
  // Delete from store immediately
  sessionStore.destroy(req.sessionID);
  res.clearCookie('sessionId');
  res.json({ loggedOut: true });
});

// Accessing after logout fails immediately
// No lingering access
```

**UX benefit:** Instant account security if compromised

#### JWT: Delayed Revocation

Problem: Token valid until expiration regardless of logout request
```javascript
// Logout sets token on blacklist
app.post('/logout', (req, res) => {
  tokenBlacklist.add(token);
  res.json({ loggedOut: true });
});

// But JWT still valid for 15 minutes
// Requires every request check blacklist = back to sessions!
```

**Solutions:**
1. **Short-lived tokens** (5-15 min expiration): Acceptable risk
2. **Token blacklist** (adds state back): Defeats purpose
3. **Refresh token rotation**: New tokens only issued once

#### Hybrid Solution

```javascript
// Access token: 15 minutes, cannot be revoked immediately
// Refresh token: 7 days, single-use with rotation
// Logout: invalidate refresh token only

POST /logout
→ Delete refresh token from DB
→ Access token still valid until expiration (acceptable window)
→ User cannot get new access token
→ After 15 minutes, complete logout
```

### Cross-Device Authentication

#### Sessions

**Multiple devices, single session:**
```
Device A: Browser Session → Session ID ABC123 (in cookie)
Device B: Mobile → Session ID ABC123 (synced via app)
Device C: Tablet → Session ID ABC123 (synced via app)

Problem: If one device compromised, attacker has all sessions
```

**Ideal approach:**
```
Device A: Session ID ABC123
Device B: Session ID XYZ789 (different)
Device C: Session ID PQR456 (different)

Server tracks all active sessions for user
User can manage/revoke individual sessions
```

**Implementation:**
```javascript
// Track multiple sessions per user
sessionStore.create({
  userId: user.id,
  deviceId: req.headers['device-id'],
  deviceName: 'iPhone 15',
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
  createdAt: new Date(),
  lastActivity: new Date()
});

// User can revoke specific device
POST /account/sessions/:sessionId/revoke
```

#### JWT

**No built-in cross-device support:**
```
// JWT doesn't track sessions
// All devices have valid token until expiration
// No way to revoke single device
```

**Workaround:**
```
// Add "session ID" claim to JWT
{
  userId: user.id,
  sessionId: 'ABC123',  // Device-specific
  exp: 1234567890
}

// Server tracks which sessionIds are valid per user
// Logout revokes specific sessionId only
// User can have multiple valid sessions (one per device)
```

### Token Refresh & Seamless Re-authentication

#### Session Approach

```javascript
// Session automatically extends on activity
app.use((req, res, next) => {
  if (req.session) {
    req.session.touch(); // Update last access time
  }
  next();
});

// User stays logged in indefinitely if active
```

**UX benefit:** No "login again" interruptions for active users

#### JWT Approach

```javascript
// Access token expires (typically 15 minutes)
GET /api/profile
← 401 Unauthorized (token expired)

// Client detects 401, uses refresh token
POST /token/refresh
{ refreshToken: "..." }
← { accessToken: "...", refreshToken: "..." }

// Retry original request with new token
GET /api/profile
← 200 OK
```

**UX impact:**
- Seamless if implemented in interceptors
- Can cause lag if not optimized
- Need to detect expiration before request fails (check exp claim)

**Best practice implementation:**
```javascript
// Client checks token expiration before requests
function shouldRefreshToken(token) {
  const decoded = jwt.decode(token);
  const expiresIn = (decoded.exp * 1000) - Date.now();
  return expiresIn < 5 * 60 * 1000; // Refresh if < 5 min left
}

// Silently refresh in background
if (shouldRefreshToken(accessToken)) {
  const newToken = await refreshAccessToken();
  updateStoredToken(newToken);
}
```

---

## OAuth2 & OpenID Connect Integration

### Where JWT & Sessions Fit in OAuth2/OIDC

#### OAuth2 Grant Types

**Authorization Code Flow** (most common):
```
1. User clicks "Login with Google"
2. Browser redirected to Google's authorization endpoint
3. User consents to share data
4. Redirected back with authorization code
5. Backend exchanges code for tokens:
   {
     "access_token": "jwt_token_here",
     "id_token": "jwt_with_user_info",
     "refresh_token": "opaque_string",
     "expires_in": 3600
   }
6. Backend creates session and stores tokens
```

**Token types from OAuth2:**
- **Access Token** (JWT or opaque): Authorizes API requests
- **ID Token** (JWT): User identity information
- **Refresh Token** (opaque): Obtain new tokens

### OpenID Connect (OIDC)

Built on top of OAuth2, adds identity layer:

```json
// ID Token (always JWT)
{
  "iss": "https://accounts.google.com",
  "aud": "your-client-id",
  "sub": "user-unique-id",
  "email": "user@example.com",
  "email_verified": true,
  "iat": 1234567890,
  "exp": 1234571490
}

// Access Token (may be JWT or opaque)
{
  "iss": "https://accounts.google.com",
  "sub": "user-unique-id",
  "aud": "your-api",
  "scope": "openid profile email",
  "iat": 1234567890,
  "exp": 1234571490
}
```

### Hybrid Architecture: OAuth2 + Session

**Recommended 2024+ pattern:**

```
1. User authenticates via OAuth2 (Google, GitHub, etc.)
2. Backend receives ID token (JWT) and access token
3. Backend validates ID token signature
4. Backend creates session and stores:
   - User profile from ID token
   - Refresh token for future API access
   - Provider-specific user ID
5. Client receives secure session cookie (not JWT)
6. Subsequent requests use session, not JWT

Benefits:
✓ Leverage OAuth provider for authentication (secure)
✓ Use session for session management (flexible revocation)
✓ Store refresh token server-side (can rotate)
✓ Don't send JWT in every request (smaller payload)
```

---

## Use Case Decision Matrix

### When to Use Session-Based Authentication

**Best for:**
1. **Web applications with users logging out regularly**
   - Users expect immediate logout
   - Sensitive data (healthcare, banking, finance)
   - Regulatory requirements (GDPR, HIPAA)

2. **Monolithic architectures**
   - Single application, single database
   - Tightly coupled services
   - Easier session management

3. **User-centric features**
   - Track per-device sessions
   - Show "active now" status
   - Monitor and revoke sessions

4. **Short-lived sessions**
   - Highly sensitive operations
   - High-frequency logout

### When to Use JWT

**Best for:**
1. **API-first / Microservices architectures**
   - Multiple independent services
   - Need service-to-service authentication
   - Stateless validation

2. **Mobile applications**
   - Offline capabilities
   - Cross-platform consistency
   - Self-contained authentication

3. **Serverless & edge computing**
   - Ephemeral function invocations
   - Cannot maintain persistent state
   - CDN/edge location deployment

4. **Server-to-server authentication**
   - Service accounts
   - API keys
   - Machine-to-machine communication

5. **Single-sign-on (SSO) across applications**
   - Multiple independent apps
   - Trust established via JWT signature
   - User authenticates once, accesses many apps

### When to Use Sessions

**Specific advantages:**
- Immediate logout & revocation
- Smaller payload (session ID vs full token)
- Familiar programming model
- Better for regulatory compliance
- Cross-device session management
- Simpler to reason about security

### When to Use JWT

**Specific advantages:**
- Horizontal scaling without sticky sessions
- Microservices communication
- Stateless validation (no DB lookup)
- Works with serverless
- Works with CDN/edge
- Better for APIs

---

## Hybrid Approaches

### Pattern 1: Session with JWT Validation

**Architecture:**
```
Client                   Server
  │                        │
  ├─ Login ─────────────→ Validate credentials
  │                        Create session
  │                        ← Set-Cookie: sessionId
  │
  ├─ GET /api ────────→ Validate session via ID
  │  (Session cookie)     Query session store
  │                        ← 200 with data
```

**Implementation:**
```javascript
// Middleware validates session
app.use((req, res, next) => {
  const sessionId = req.cookies.sessionId;
  if (!sessionId) return res.status(401).json({ error: 'Unauthorized' });

  const session = sessionStore.get(sessionId);
  if (!session || session.expiresAt < Date.now()) {
    return res.status(401).json({ error: 'Session expired' });
  }

  req.user = session.user;
  next();
});
```

**When to use:**
- Pure session applications
- High security requirements
- Need immediate revocation

### Pattern 2: Access Token + Refresh Token (Most Common)

**Architecture:**
```
Client                           Server
  │                                │
  ├─ Login ──────────────────────→ Validate credentials
  │                                Create access token (15m)
  │                                Create refresh token (7d)
  │                                Store refresh token in DB
  │                           ← { accessToken, refreshToken }
  │
  ├─ GET /api (access token)────→ Validate JWT signature
  │                                ← 200 with data
  │
  ├─ (15 min later)
  │  POST /token/refresh ────────→ Validate refresh token
  │  (refresh token)              Check if in DB (not blacklisted)
  │                                Issue new access token
  │                                Rotate refresh token
  │                           ← { accessToken, refreshToken }
  │
  ├─ GET /api (new access token)→ Validate JWT signature
  │                                ← 200 with data
  │
  ├─ Logout ──────────────────→ Mark refresh token as revoked
  │                                ← 200 OK
  │
  ├─ GET /api (old access token)→ Signature valid but...
  │                                Cannot refresh (token revoked)
  │                           ← 401 Unauthorized
```

**Benefits:**
- JWT for fast stateless validation (access token)
- Session for revocation (refresh token)
- Minimal database lookups
- Fine-grained control (logout vs keep logged in)

**Implementation:**
```javascript
// Login
app.post('/login', async (req, res) => {
  const user = await validateCredentials(req.body);

  const accessToken = jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '15m', algorithm: 'HS256' }
  );

  const refreshToken = crypto.randomBytes(32).toString('hex');
  await db.refreshToken.create({
    token: refreshToken,
    userId: user.id,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  });

  res.json({ accessToken, refreshToken });
});

// Validate access token
app.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

// Refresh access token
app.post('/token/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  const stored = await db.refreshToken.findUnique({
    where: { token: refreshToken }
  });

  if (!stored || stored.expiresAt < new Date() || stored.revoked) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }

  const newAccessToken = jwt.sign(
    { userId: stored.userId },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  // Rotate refresh token
  const newRefreshToken = crypto.randomBytes(32).toString('hex');
  await db.refreshToken.update({
    where: { id: stored.id },
    data: { token: newRefreshToken }
  });

  res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
});

// Logout
app.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  await db.refreshToken.update({
    where: { token: refreshToken },
    data: { revoked: true }
  });
  res.json({ loggedOut: true });
});
```

### Pattern 3: Session + Optional JWT for APIs

**Architecture:**

For web browsers:
- HTTP-only session cookie
- Traditional session-based auth

For mobile/external APIs:
- JWT tokens
- Same backend validation

```javascript
// Middleware handles both
app.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  const sessionId = req.cookies.sessionId;

  if (token) {
    // JWT validation
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      res.status(401).json({ error: 'Invalid JWT' });
    }
  } else if (sessionId) {
    // Session validation
    const session = sessionStore.get(sessionId);
    if (!session || session.expiresAt < Date.now()) {
      return res.status(401).json({ error: 'Session expired' });
    }
    req.user = session.user;
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
});
```

---

## Recommendations for Galatea

### Current Stack
- **Frontend**: TanStack Start (React)
- **Backend**: Node.js
- **Database**: PostgreSQL
- **Special requirements**: Discord bot authentication, multi-channel scenarios

### Recommended Architecture: Hybrid Session + JWT

#### Phase 1: Core Web Application (TanStack Start)

**Use Session-Based Authentication:**

```javascript
// config/auth.ts
export const authConfig = {
  sessionSecret: process.env.SESSION_SECRET, // >= 32 bytes
  sessionDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
  cookieOptions: {
    secure: true,
    httpOnly: true,
    sameSite: 'strict',
    path: '/'
  },
  inactivityTimeout: 30 * 60 * 1000 // 30 minutes
};
```

**Rationale:**
- TanStack Start has built-in session support via createServerFn
- Simplifies logout and session management
- Better for future regulatory compliance
- Easier to track per-device sessions

**Implementation pattern:**

```javascript
// server/auth.ts
import { createServerFn } from '@tanstack/start';
import { getWebRequest } from '@tanstack/start';

export const loginUser = createServerFn({ method: 'POST' })(
  async (email: string, password: string) => {
    const user = await db.user.findUnique({ where: { email } });

    if (!user || !await verifyPassword(password, user.passwordHash)) {
      throw new Error('Invalid credentials');
    }

    // Create session
    const req = getWebRequest();
    if (!req) throw new Error('No request context');

    // Use your session middleware to store session
    // This is framework-specific

    return { userId: user.id, email: user.email };
  }
);

export const logoutUser = createServerFn({ method: 'POST' })(
  async () => {
    const req = getWebRequest();
    if (!req) throw new Error('No request context');

    // Destroy session
    // Framework-specific implementation

    return { success: true };
  }
);

export const getSession = createServerFn()(
  async () => {
    const req = getWebRequest();
    if (!req) throw new Error('No request context');

    // Get session from middleware
    // Return user data or null

    return null; // or user object
  }
);
```

#### Phase 2: API & Discord Integration

**Add JWT for Bot/API Access:**

```javascript
// config/jwt.ts
export const jwtConfig = {
  algorithm: 'HS256',
  secret: process.env.JWT_SECRET, // >= 32 bytes
  expiresIn: '15m',
  refreshExpiresIn: '7d'
};
```

**Discord Bot OAuth2 Integration:**

```javascript
// server/discord-auth.ts
export const discordOAuth2Login = createServerFn({ method: 'POST' })(
  async (code: string) => {
    // 1. Exchange code for tokens with Discord
    const tokens = await exchangeDiscordCode(code);

    // 2. Get user info from Discord
    const discordUser = await getDiscordUserInfo(tokens.access_token);

    // 3. Create or update user in database
    const user = await db.user.upsert({
      where: { discordId: discordUser.id },
      create: {
        discordId: discordUser.id,
        username: discordUser.username,
        email: discordUser.email,
        // ... other fields
      },
      update: {
        email: discordUser.email,
        lastDiscordSync: new Date()
      }
    });

    // 4. Create session for web UI
    const req = getWebRequest();
    if (req) {
      // Set session cookie
    }

    // 5. Store Discord refresh token for future API calls
    await db.userToken.upsert({
      where: { userId_provider: { userId: user.id, provider: 'discord' } },
      create: {
        userId: user.id,
        provider: 'discord',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000)
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000)
      }
    });

    return { success: true };
  }
);
```

**For Discord Bot Server Access:**

```javascript
// server/bot-auth.ts
export const getBotAccessToken = createServerFn()(
  async () => {
    const req = getWebRequest();
    if (!req) throw new Error('No request context');

    const user = await getSessionUser(req);
    if (!user) throw new Error('Unauthorized');

    // Get Discord token for this user
    const userToken = await db.userToken.findUnique({
      where: { userId_provider: { userId: user.id, provider: 'discord' } }
    });

    if (!userToken) throw new Error('No Discord connection');

    // Check if token expired, refresh if needed
    if (userToken.expiresAt < new Date()) {
      const newTokens = await refreshDiscordToken(userToken.refreshToken);
      await db.userToken.update({
        where: { id: userToken.id },
        data: {
          accessToken: newTokens.access_token,
          expiresAt: new Date(Date.now() + newTokens.expires_in * 1000)
        }
      });
      return { accessToken: newTokens.access_token };
    }

    return { accessToken: userToken.accessToken };
  }
);
```

**For Multi-Channel Authorization:**

```javascript
// server/discord-channels.ts
export const authorizeChannel = createServerFn({ method: 'POST' })(
  async (guildId: string, channelId: string) => {
    const user = await getSessionUser();
    if (!user) throw new Error('Unauthorized');

    // Check if user has permission in this guild
    const hasPermission = await verifyUserGuildPermission(
      user.id,
      guildId,
      'MANAGE_MESSAGES' // or required permission
    );

    if (!hasPermission) throw new Error('Insufficient permissions');

    // Create or update channel authorization
    await db.channelAuth.upsert({
      where: {
        channelId_userId: {
          channelId: channelId,
          userId: user.id
        }
      },
      create: {
        userId: user.id,
        guildId: guildId,
        channelId: channelId,
        authorizedAt: new Date()
      },
      update: {
        authorizedAt: new Date()
      }
    });

    return { success: true };
  }
);
```

#### Phase 3: Session Storage Strategy

**For Galatea scale (moderate traffic):**

**Option A: PostgreSQL Sessions (Recommended for your stack)**

```javascript
// Use connect-pg-simple or similar
import session from 'express-session';
import pgSession from 'connect-pg-simple';

const store = new pgSession({
  pool: pgPool,
  tableName: 'session',
  ttl: 7 * 24 * 60 * 60 // 7 days
});

app.use(session({
  store: store,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));
```

**Schema:**
```sql
CREATE TABLE "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  PRIMARY KEY ("sid")
)
WITH (OIDS=FALSE);
CREATE INDEX "IDX_session_expire" ON "session" ("expire");
```

**Benefits:**
- Persistent across restarts
- No external dependencies (already have PostgreSQL)
- Can query sessions (useful for admin features)
- Can set TTL for automatic cleanup

**Option B: Redis (If you scale significantly)**

```javascript
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

const redisClient = createClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT
});

const store = new RedisStore({ client: redisClient });

app.use(session({
  store: store,
  secret: process.env.SESSION_SECRET,
  // ... same config
}));
```

**When to migrate:**
- Traffic > 10,000 concurrent sessions
- Session lookup latency becomes bottleneck
- Need sub-millisecond response times

---

## Security Checklist for Implementation

### JWT Implementation

- [ ] Always verify signature with explicit algorithm: `jwt.verify(token, secret, { algorithms: ['HS256'] })`
- [ ] Always include expiration: `expiresIn: '15m'`
- [ ] Use cryptographically strong secret (>= 32 bytes, >= 256 bits)
- [ ] Set audience claim for cross-service validation: `aud: 'api.service-a'`
- [ ] Never log or expose JWT tokens
- [ ] Keep payload minimal (user ID, essential roles only)
- [ ] Use HTTPS for all token transmission
- [ ] Implement refresh token rotation
- [ ] For logout: invalidate refresh tokens, not access tokens

### Session Implementation

- [ ] Generate session IDs with >= 128 bits entropy
- [ ] Store session data server-side only
- [ ] Always set secure cookie attributes:
  - [ ] `Secure` flag (HTTPS only)
  - [ ] `HttpOnly` flag (no JavaScript access)
  - [ ] `SameSite=Strict` (no cross-site transmission)
- [ ] Regenerate session ID after login (prevent fixation)
- [ ] Implement inactivity timeout (15-30 minutes for sensitive apps)
- [ ] Implement absolute timeout (8-12 hours maximum)
- [ ] Track session metadata (IP, user agent, device)
- [ ] Allow users to view and revoke sessions
- [ ] Implement CSRF protection (tokens or SameSite=Strict)

### Both Methods

- [ ] Use HTTPS for all authentication
- [ ] Implement rate limiting on login endpoints
- [ ] Hash passwords with bcrypt or Argon2 (never store plaintext)
- [ ] Log authentication events (failed logins, logouts)
- [ ] Implement account lockout after failed attempts
- [ ] Use MFA for sensitive operations
- [ ] Validate email address before full authentication
- [ ] Regular security audits of authentication code

---

## References & Sources

### General Authentication

1. [JWTs vs. sessions: which authentication approach is right for you? - Stytch](https://stytch.com/blog/jwts-vs-sessions-which-is-right-for-you/)
2. [Combining the benefits of session tokens and JWTs - Clerk](https://clerk.com/blog/combining-the-benefits-of-session-tokens-and-jwts)
3. [JWT vs Session authentication · Logto blog](https://blog.logto.io/token-based-authentication-vs-session-based-authentication)

### JWT Security

1. [JWTs Under the Microscope: How Attackers Exploit Authentication - Traceable](https://www.traceable.ai/blog-post/jwts-under-the-microscope-how-attackers-exploit-authentication-and-authorization-weaknesses)
2. [JWT Vulnerabilities List 2026 - Red Sentry](https://redsentry.com/resources/blog/jwt-vulnerabilities-list-2026-security-risks-mitigation-guide)
3. [JWT attacks - PortSwigger Web Security Academy](https://portswigger.net/web-security/jwt)
4. [Another JWT Algorithm Confusion Vulnerability: CVE-2024-54150](https://pentesterlab.com/blog/another-jwt-algorithm-confusion-cve-2024-54150)

### Session Security (OWASP)

1. [Session Management - OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
2. [Authentication - OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
3. [Session Fixation Protection - OWASP Foundation](https://owasp.org/www-community/controls/Session_Fixation_Protection)
4. [Cross-Site Request Forgery Prevention - OWASP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

### Scalability & Performance

1. [REST Constraint #3: Going Stateless for Scalability](https://www.woodruff.dev/rest-constraint-3-going-stateless-for-scalability/)
2. [Stateful Vs Stateless Architecture - GeeksforGeeks](https://www.geeksforgeeks.org/system-design/stateful-vs-stateless-architecture/)
3. [JWT Revocation Strategies: When Stateless Tokens Need State](https://www.michal-drozd.com/en/blog/jwt-revocation-strategies/)

### Refresh Tokens

1. [What Are Refresh Tokens and How to Use Them Securely - Auth0](https://auth0.com/blog/refresh-tokens-what-are-they-and-when-to-use-them/)
2. [Refresh Token Rotation: Best Practices for Developers](https://www.serverion.com/uncategorized/refresh-token-rotation-best-practices-for-developers/)
3. [Auth.js | Refresh Token Rotation](https://authjs.dev/guides/refresh-token-rotation)

### OAuth2 & OpenID Connect

1. [The Complete Guide to OAuth 2.0, OpenID Connect, and JWT - Medium](https://medium.com/@shubhamatucsd/the-complete-guide-to-oauth-2-0-openid-connect-and-jwt-token-verification-f2516c196f3b)
2. [JWT, OAuth, OIDC, SAML: Auth Protocol Technical Guide](https://guptadeepak.com/demystifying-jwt-oauth-oidc-and-saml-a-technical-guide/)
3. [OpenID Connect explained - connect2id](https://connect2id.com/learn/openid-connect)

### TanStack Start Authentication

1. [Authentication | TanStack Start React Docs](https://tanstack.com/start/latest/docs/framework/react/guide/authentication)
2. [TanStack Start Integration | Better Auth](https://better-auth.com/docs/integrations/tanstack)
3. [Top 5 authentication solutions for TanStack Start in 2026 - WorkOS](https://workos.com/blog/top-authentication-solutions-tanstack-start-2026)

### Discord Bot OAuth2

1. [OAuth2 - Discord Developer Documentation](https://docs.discord.com/developers/topics/oauth2)
2. [OAuth2 | discord.js Guide](https://discordjs.guide/legacy/oauth2/oauth2)
3. [Discord Bot Dashboard with OAuth2 (Nextjs)](https://dev.to/clxrityy/discord-bot-dashboard-authentication-nextjs-1ecg)

### Token Size & Performance

1. [Understanding JWT Token Size & URL Safety](https://webdesignpenarth.co.uk/2025/08/07/why-jwt-token-size-and-url-safety-matters/)
2. [JWT Access Token Payload — Keep It Lean!](https://medium.com/@sandrodz/json-web-tokens-jwt-payload-keep-it-lean-825fd4b78e2a)
3. [What Is the Maximum Size of a JWT Token?](https://www.w3tutorials.net/blog/what-is-the-maximum-size-of-jwt-token/)

### Session vs Database Storage

1. [Redis Vs PostgreSQL - Key Differences - Airbyte](https://airbyte.com/data-engineering-resources/redis-vs-postgresql)
2. [Redis is fast - I'll cache in Postgres](https://dizzy.zone/2025/09/24/Redis-is-fast-Ill-cache-in-Postgres/)
3. [I Replaced Redis with PostgreSQL (And It's Faster)](https://dev.to/polliog/i-replaced-redis-with-postgresql-and-its-faster-4942)

### Logout & Revocation

1. [How to Invalidate a JWT Token After Logout - Descope](https://www.descope.com/blog/post/jwt-logout-risks-mitigations)
2. [Why JWTs Valid After Logout: A Pentester's Guide](https://medium.com/@dr34mb0y/why-jwts-valid-after-logout-a-pentesters-guide-to-testing-and-securing-tokens-6fb232fe57d9)
3. [Invalidating JWT Access Tokens on Logout: Solutions](https://2coffee.dev/en/articles/what-solutions-are-there-to-invalidate-jwt-tokens-when-a-user-logs-out)

---

## Conclusion

The authentication landscape in 2024-2026 has matured beyond the "JWT vs Sessions" dichotomy. The industry consensus favors **hybrid approaches** that leverage the strengths of each:

- **Sessions** for web applications with immediate revocation needs
- **Access tokens (JWT)** for stateless API validation
- **Refresh tokens** for secure token rotation
- **OAuth2/OIDC** for delegated authentication

For Galatea specifically:
1. Use **PostgreSQL-backed sessions** for the TanStack Start web UI
2. Add **refresh token rotation** for any API access
3. Integrate **Discord OAuth2** for bot authentication
4. Store **Discord access tokens** server-side for API calls
5. Implement **per-device session tracking** for multi-channel scenarios

This approach provides:
- Security through short-lived tokens and server-side revocation
- Performance through stateless access token validation
- Scalability without architectural complexity
- Clear audit trail via PostgreSQL session storage

