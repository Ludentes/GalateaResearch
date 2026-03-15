# JWT vs Session-Based Authentication: Comprehensive Comparison

**Date**: 2026-03-15
**Scope**: Architecture decision for Galatea authentication system

---

## Quick Comparison Table

| Aspect | Session-Based | JWT |
|--------|---------------|-----|
| **State** | Stateful (server-side) | Stateless |
| **Storage** | Database/session store | Client-side (token) |
| **Token Size** | Small (session ID) | Large (self-contained) |
| **Revocation** | Immediate | Until expiration |
| **Scalability** | Challenging (database hits per request) | Easy (no server lookup) |
| **Security Control** | Strong (server-managed) | Requires careful implementation |
| **Mobile-Friendly** | Harder (cookies) | Better (headers) |
| **Cross-Domain** | Difficult (cookie restrictions) | Easy (CORS-friendly) |

---

## Session-Based Authentication

### How It Works
1. User logs in with credentials
2. Server creates a session in database/session store
3. Session ID sent to client via HTTP-only cookie
4. Client sends session ID with each request
5. Server validates session ID, looks up user data

### Architecture
```
Client              Server              Store
  |                  |                    |
  |--[credentials]-->|                    |
  |                  |--[create]--------->|
  |<-[Set-Cookie]---|<-[sessionId]-------|
  |                  |
  |--[Cookie]------->|--[validate]------->|
  |<-[response]------|<-[userData]--------|
```

### Advantages
- **Immediate revocation**: Server can invalidate sessions instantly
- **Strong security control**: Server maintains all user state
- **Simple implementation**: Standard, well-understood approach
- **Tight security for sensitive data**: Ideal for banking, healthcare, financial apps
- **CSRF protectable**: Tokens and additional validation mechanisms available

### Disadvantages
- **Scalability bottleneck**: Database hit required for every request
- **Server resource usage**: Each concurrent session consumes memory/storage
- **Load balancing complexity**: Sessions must be shared across servers (sticky sessions or distributed cache)
- **Mobile awkward**: Cookies harder to manage on mobile apps
- **Cross-domain issues**: Cookie restrictions make multi-domain single sign-on complex

### Security Vulnerabilities
- **Session hijacking**: Compromised cookies grant full access
- **CSRF attacks**: Cross-site request forgery if not properly mitigated
- **Session fixation**: Attacker forces known session ID
- **Timeout management**: Balance between security and usability

---

## JWT Authentication

### How It Works
1. User logs in with credentials
2. Server creates JWT token (header.payload.signature)
3. Token sent to client
4. Client sends token in Authorization header with each request
5. Server validates signature, reads payload directly (no database lookup)

### Architecture
```
Client              Server              (No persistent store needed*)
  |                  |
  |--[credentials]-->|
  |<-[JWT token]----|
  |                  |
  |--[Authorization: Bearer JWT]-->|
  |<-[validate signature, read payload]
  |<-[response]----|

  * Optional: token blacklist/revocation cache
```

### Advantages
- **Stateless**: No server-side session storage needed
- **Scalable**: No database lookup required per request
- **Self-contained**: All user info in token (reduces roundtrips)
- **Mobile-friendly**: Works via headers, not cookies
- **Cross-domain**: Supports multi-origin requests (CORS-friendly)
- **Microservices-ready**: Services can validate without shared session store
- **Reduced latency**: No database validation overhead

### Disadvantages
- **Token revocation is hard**: Can't invalidate until expiration without blacklist
- **Token size**: Contains all claims, making it larger than session IDs
- **Payload not encrypted**: Only encoded, readable by anyone
- **Complexity**: More security pitfalls if misconfigured
- **Clock dependency**: Token validity depends on server/client time sync
- **Stolen tokens**: If compromised, no immediate way to stop usage

### Security Vulnerabilities

#### Critical Issues
1. **Lack of Revocation**: Token valid until expiration, even if compromised
   - Mitigation: Implement token blacklist (reintroduces statefulness)
   - Mitigation: Use short expiration + refresh token rotation

2. **Unencrypted Payload**: JWT payload is base64-encoded, not encrypted
   - Never store sensitive data (passwords, SSNs, credit cards)
   - Only include: user ID, roles, non-sensitive claims

3. **Weak/Missing Signature Validation**: Common implementation error
   - Must always verify signature, never skip
   - Reject "none" algorithm
   - Use strong keys (RS256 with public/private keys preferred for multi-service)

4. **Algorithm Confusion**: Accepting "none" or algorithm switching attacks
   - Explicitly specify algorithm in verification
   - Reject tokens with different algorithms than expected

5. **Weak Secret Keys**: HMAC (HS256) vulnerable if key is weak
   - Use strong, randomly generated secrets
   - RS256/ES256 (asymmetric) preferred for multi-service architecture
   - Rotate keys periodically

6. **Transport Vulnerabilities**: Tokens vulnerable in transit without HTTPS
   - Always use HTTPS/TLS
   - Store in secure cookies if possible (HttpOnly flag)
   - Avoid localStorage (XSS exposure)

7. **Token Exposure via XSS**: JavaScript can access and steal tokens
   - If stored in localStorage: vulnerable to XSS
   - If in secure HttpOnly cookie: protected from XSS
   - Implement CSP and XSS protections

---

## Security Comparison

### Session-Based Security
| Threat | Risk | Mitigation |
|--------|------|-----------|
| Session hijacking | High | Regenerate on privilege escalation, HTTPS only |
| CSRF | Medium | CSRF tokens, SameSite cookies |
| Data tampering | Low | Server maintains data, not client |
| Revocation | Strong | Immediate deletion |
| Token theft | Medium | HttpOnly cookies help, but session fixation possible |

### JWT Security
| Threat | Risk | Mitigation |
|--------|------|-----------|
| Token theft | High | If stolen, valid until expiration |
| Payload tampering | Low (if verified) | Cryptographic signature prevents modification |
| Token exposure | High | XSS can leak tokens from localStorage |
| Revocation | Weak | Requires blacklist or short expiration |
| Signature bypass | Critical | Misconfiguration allows "none" algorithm |

---

## Scalability Comparison

### Session-Based
```
Load: 1,000 concurrent users
Session store: ~50MB (50KB per session)
Database hits: 1,000/sec (linear growth)
Bottleneck: Database becomes the single point of contention
Solution: Sticky sessions + Redis, but complicates infrastructure
```

### JWT
```
Load: 1,000 concurrent users
Storage needed: 0 (stateless)
Database hits: ~100/sec (only on permission changes)
Bottleneck: Token validation (cpu-bound, easily parallelizable)
Solution: Horizontal scaling, no shared state needed
```

**Verdict**: JWT wins decisively for scale. Sessions require architectural complexity (sticky sessions, distributed cache) that JWT doesn't.

---

## Use Cases & Recommendations

### Choose **Session-Based** If:
- ✅ Single-domain traditional web app (SPA with same-origin server)
- ✅ Handling highly sensitive data (banking, healthcare, PII)
- ✅ Need instant logout capability
- ✅ Small to medium user base (< 10K concurrent)
- ✅ Simplicity is a priority (standard approach, less edge cases)
- ✅ User data changes frequently (better to read from DB than include in token)

### Choose **JWT** If:
- ✅ Microservices architecture (multiple services validate independently)
- ✅ Mobile apps (headers > cookies)
- ✅ Cross-origin/multi-domain needed (CORS)
- ✅ Stateless scaling required (high concurrency)
- ✅ API-first design (mobile + web clients)
- ✅ Non-sensitive data access (can include in token)

### Hybrid Approach (Best of Both)
Combine session cookies + refresh token pattern:

```
Authentication Flow:
1. POST /login → server creates JWT (short-lived, 15 min)
2. Response includes: Access Token (JWT) + Refresh Token (server-stored)
3. Access Token in Authorization header or secure HttpOnly cookie
4. Refresh Token in HttpOnly cookie (used to get new access token)
5. When access token expires → use refresh token to get new one
6. Logout: invalidate refresh token server-side

Benefits:
- Short-lived JWTs: reduces damage if stolen
- Refresh token revocation: server maintains control
- Scalable: access tokens are stateless
- Secure: tokens short-lived, refresh token protected by HttpOnly
```

---

## For Galatea Specifically

### Current Context
Galatea uses **TanStack Start v1** with **PostgreSQL**, considering **Authentik** for SSO.

### Recommendation: **Hybrid Session + JWT** Pattern

**Why**:
1. **Agent-based access**: Different flows for beta agents (Kirill/Sasha) suggest role-based, server-managed control → sessions help
2. **Sensitive work context**: Agent decisions involve team data, task assignments → session revocation is valuable
3. **Small team scale**: Not facing massive scalability constraints; can afford session store
4. **Single domain**: Galatea is a unified app, not multi-origin

**Implementation**:
- Primary auth: Authentik → session cookies (HTTP-only, SameSite)
- Optional: Add JWT for API routes if needed (with refresh token rotation)
- Session store: PostgreSQL sessions table (Drizzle ORM)
- Invalidation: Immediate on logout, permission changes, security events

```typescript
// Pseudocode
POST /api/auth/login → Authentik OIDC flow
  → Create session in DB
  → Set secure HttpOnly cookie
  → Return to dashboard

DELETE /api/auth/logout → Invalidate session
  → All subsequent requests denied (no token caching confusion)
```

---

## References

- [JWTs vs. sessions: which authentication approach is right for you?](https://stytch.com/blog/jwts-vs-sessions-which-is-right-for-you/)
- [ByteByteGo | Session-based Authentication vs. JWT](https://bytebytego.com/guides/whats-the-difference-between-session-based-authentication-and-jwts/)
- [JWT vs Session authentication · Logto blog](https://blog.logto.io/token-based-authentication-vs-session-based-authentication)
- [Session-Based Authentication vs. JSON Web Tokens (JWTs) in System Design - GeeksforGeeks](https://www.geeksforgeeks.org/system-design/session-based-authentication-vs-json-web-tokens-jwts-in-system-design/)
- [Session vs Token Based Authentication: Cookies, JWT, & Best Practices - Authgear](https://www.authgear.com/post/session-vs-token-authentication)
- [JWT Security Explained: Best Practices and Common Vulnerabilities](https://www.authgear.com/post/jwt-security-best-practices-common-vulnerabilities)
- [OWASP JSON Web Token Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
- [Session-based authentication | SuperTokens](https://supertokens.com/blog/session-based-authentication)
- [Combining the benefits of session tokens and JWTs](https://clerk.com/blog/combining-the-benefits-of-session-tokens-and-jwts)
