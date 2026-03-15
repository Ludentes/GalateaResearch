# SSO Provider Comparison for Galatea (TanStack Start v1)

**Date:** 2026-03-14
**Context:** Self-hosted infrastructure (GitLab at gitlab.maugry.ru:2224, Ollama, PostgreSQL 15432, FalkorDB 16379)

---

## Executive Summary

For a TanStack Start v1 application, three implementation paths are viable:

1. **Minimal/Bootstrapped:** Use GitLab's built-in OAuth2 provider + custom backend implementation
2. **Self-Hosted SSO:** Deploy Keycloak or Authentik on your infrastructure
3. **Managed SaaS:** Auth0, AWS Cognito, or Okta for delegated complexity

**Recommendation for your setup:**
- **First choice:** GitLab OAuth2 provider (leverages existing infrastructure, minimal overhead)
- **Second choice:** Keycloak (battle-tested, enterprise-ready, moderate complexity)
- **Growth choice:** Authentik (modern UX, less operational overhead than Keycloak)

---

## Comparison Table: Detailed Overview

| Feature | GitLab OAuth2 | Keycloak | Authentik | Auth0 | AWS Cognito | Okta |
|---------|---|---|---|---|---|---|
| **Hosting** | Self-hosted (existing) | Self-hosted Docker | Self-hosted Docker | SaaS Cloud | SaaS AWS | SaaS Cloud |
| **Auth Methods** | OAuth2 | OAuth2, OIDC, SAML | OAuth2, OIDC, SAML | OAuth2, OIDC, SAML | OAuth2, OIDC | SAML, OAuth2, OIDC |
| **TanStack Start Integration** | Native (custom) | Excellent | Excellent | Excellent | Excellent | Excellent |
| **Node.js Backend** | oidc-spa, Better Auth | All OIDC libraries | All OIDC libraries | sdk-js-auth0 | amazon-cognito-identity-js | okta-sdk-nodejs |
| **User Roles/Permissions** | Basic (org/group) | Advanced (fine-grained) | Advanced (flow-based) | Advanced | Basic/Advanced | Advanced |
| **Setup Complexity (1-10)** | 3-4 | 6-7 | 5-6 | 2 | 2 | 3 |
| **Operational Overhead** | Minimal | High (maintenance) | Moderate | None | Low | Low |
| **DB Requirements** | None (uses GitLab) | PostgreSQL | PostgreSQL + Redis | N/A | N/A | N/A |
| **Free Tier** | Yes (unlimited) | Yes (open-source) | Yes (open-source) | Limited (free tier) | 50k MAU free | Limited (free tier) |
| **Pricing (100k MAU)** | Free | Free | Free | $600-1000/mo | $550/mo | $5000+/mo (enterprise) |
| **Pricing (1M MAU)** | Free | Free | Free | $10000+/mo | $5500/mo | Contact sales |
| **Multi-tenancy** | Not designed | Advanced (realms) | Advanced (tenants) | Built-in | Limited | Built-in |
| **MFA Support** | Basic | Advanced | Advanced | Advanced | Advanced | Advanced |
| **Session Management** | Standard | Excellent | Excellent | Excellent | Excellent | Excellent |

---

## Detailed Provider Analysis

### Option 1: GitLab as OAuth2 Provider (RECOMMENDED FOR BOOTSTRAP)

**When to use:** Team/small org, already using GitLab, want minimal infrastructure

**Setup Process:**
1. Create OAuth application in GitLab Admin panel (or user-level app)
2. Configure Client ID and Secret
3. Implement OAuth2 flow on backend with PKCE
4. Redirect users to `https://gitlab.maugry.ru:2224/oauth/authorize`

**Integration with TanStack Start:**
```typescript
// Backend server route: /src/routes/api/auth/callback.ts
import { z } from "zod";

export const POST = defineServerFn(
  { method: "POST", middleware: [sessionMiddleware] },
  async (req) => {
    const { code, state } = z.object({
      code: z.string(),
      state: z.string(),
    }).parse(await req.json());

    // Exchange code for token with GitLab
    const tokenResponse = await fetch(
      "https://gitlab.maugry.ru:2224/oauth/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: process.env.GITLAB_CLIENT_ID,
          client_secret: process.env.GITLAB_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
          redirect_uri: `${process.env.APP_URL}/auth/callback`,
        }),
      }
    );

    const { access_token } = await tokenResponse.json();

    // Get user profile from GitLab
    const userResponse = await fetch("https://gitlab.maugry.ru:2224/api/v4/user", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const user = await userResponse.json();

    // Store session, return user
    return { user, token: access_token };
  }
);
```

**Pros:**
- Zero infrastructure overhead (uses existing GitLab)
- No additional database/Redis required
- Free and unlimited users
- Full control over authentication logic
- Can leverage GitLab org structure for permissions
- Access tokens valid for 2 hours, refresh tokens available

**Cons:**
- Manual OAuth2 implementation (error-prone if not careful)
- Limited built-in features (no MFA flows, flows, etc.)
- User experience depends entirely on your UI
- No advanced session management out of box
- Requires good PKCE/CSRF implementation

**Authentication Methods:** OAuth2 only
**Setup Complexity:** 3-4/10
**Token Management:** 2-hour access tokens + refresh tokens
**Recommended Libraries:** Better Auth, oidc-spa (OIDC client), or manual with `openid-client`

**Tradeoff:** Minimal infrastructure vs. feature completeness. You own all the UX and logic.

---

### Option 2: Keycloak (RECOMMENDED FOR SELF-HOSTED)

**When to use:** Need advanced IAM, multi-tenancy, complex permissions, enterprise features

**Docker Compose Setup:**
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16.2
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: changeme
    volumes:
      - postgres_data:/var/lib/postgresql/data

  keycloak:
    image: quay.io/keycloak/keycloak:latest
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: changeme
      KC_HOSTNAME: keycloak.yourdomain.com
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
    ports:
      - "8080:8080"
    depends_on:
      - postgres
    volumes:
      - keycloak_data:/opt/keycloak/data

volumes:
  postgres_data:
  keycloak_data:
```

**Integration with TanStack Start:**
Use Better Auth with Keycloak provider or implement OIDC directly:

```typescript
// With Better Auth
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  database: {
    type: "postgres",
    url: process.env.DATABASE_URL,
  },
  plugins: [
    keycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
      issuer: "https://keycloak.yourdomain.com/realms/master",
    }),
  ],
});
```

**Pros:**
- Battle-tested (used by enterprises globally)
- Advanced multi-tenancy with realms
- Fine-grained access control (RBAC)
- SAML, OAuth2, OIDC all supported
- Excellent session management
- Token introspection and validation
- Strong community (32k+ GitHub stars)
- Can federate with GitLab as identity provider

**Cons:**
- High operational overhead (needs dedicated DevOps attention)
- Complex admin UI (steep learning curve)
- Resource-intensive (Java-based)
- Requires PostgreSQL separate from app database
- Heavy for small teams
- Migration/backup complexity

**Authentication Methods:** OAuth2, OIDC, SAML
**Setup Complexity:** 6-7/10
**Pricing:** Free (open-source)
**DB Requirements:** PostgreSQL (separate from app)
**Infrastructure:** ~2GB RAM minimum recommended
**Operational Cost:** High (monitoring, updates, security patches)

**Tradeoff:** Maximum features and maturity vs. operational burden. Best for teams with dedicated DevOps.

---

### Option 3: Authentik (MODERN ALTERNATIVE TO KEYCLOAK)

**When to use:** Want self-hosted power with modern UX, Kubernetes-friendly

**Docker Compose Setup:**
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16.2
    environment:
      POSTGRES_DB: authentik
      POSTGRES_USER: authentik
      POSTGRES_PASSWORD: changeme
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  authentik_server:
    image: ghcr.io/goauthentik/server:latest
    environment:
      AUTHENTIK_POSTGRESQL__HOST: postgres
      AUTHENTIK_POSTGRESQL__NAME: authentik
      AUTHENTIK_POSTGRESQL__USER: authentik
      AUTHENTIK_POSTGRESQL__PASSWORD: changeme
      AUTHENTIK_REDIS__HOST: redis
      AUTHENTIK_SECRET_KEY: ${SECRET_KEY}
    ports:
      - "9000:9000"
    depends_on:
      - postgres
      - redis

  authentik_worker:
    image: ghcr.io/goauthentik/server:latest
    command: worker
    environment:
      AUTHENTIK_POSTGRESQL__HOST: postgres
      AUTHENTIK_POSTGRESQL__NAME: authentik
      AUTHENTIK_POSTGRESQL__USER: authentik
      AUTHENTIK_POSTGRESQL__PASSWORD: changeme
      AUTHENTIK_REDIS__HOST: redis
      AUTHENTIK_SECRET_KEY: ${SECRET_KEY}
    depends_on:
      - postgres
      - redis

volumes:
  postgres_data:
  redis_data:
```

**Integration with TanStack Start:**
```typescript
// Using OIDC provider (standard approach)
import { Issuer } from "openid-client";

const issuer = await Issuer.discover(
  "https://authentik.yourdomain.com/application/o"
);
const client = new issuer.Client({
  client_id: process.env.AUTHENTIK_CLIENT_ID,
  client_secret: process.env.AUTHENTIK_CLIENT_SECRET,
  redirect_uris: [`${process.env.APP_URL}/auth/callback`],
});
```

**Pros:**
- Modern admin UI with visual flow builder
- Cleaner code/architecture than Keycloak (Python)
- Policy-driven access control (very flexible)
- Better Kubernetes integration
- Visual authentication flows (no code needed for customization)
- ~20k GitHub stars (rapidly growing)
- Excellent documentation
- Recently removing Redis requirement (simplifies setup)

**Cons:**
- Newer project (less battle-tested than Keycloak)
- Smaller community than Keycloak
- Still requires PostgreSQL + Redis (2025.10+ removes Redis)
- Python-based (different operational model than Java)
- Less mature SAML support vs Keycloak

**Authentication Methods:** OAuth2, OIDC, SAML
**Setup Complexity:** 5-6/10
**Pricing:** Free (open-source), commercial support available
**DB Requirements:** PostgreSQL + Redis (removing Redis in latest)
**Infrastructure:** ~1GB RAM minimum
**Operational Cost:** Moderate (simpler than Keycloak)

**Tradeoff:** Modern developer experience vs. community maturity. Best for teams that like visual workflows.

---

### Option 4: Auth0 (MANAGED SAAS)

**When to use:** Want zero ops, need advanced compliance features, B2C focus

**Setup:**
1. Create Auth0 tenant
2. Register application
3. Add redirect URIs
4. Get Client ID/Secret
5. Integrate with Better Auth or auth.js

```typescript
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  plugins: [
    auth0Provider({
      clientId: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      domain: process.env.AUTH0_DOMAIN,
    }),
  ],
});
```

**Pros:**
- Zero operational overhead
- Excellent developer experience
- Great documentation
- Built-in compliance (SOC2, HIPAA)
- Advanced MFA options
- Strong customer support

**Cons:**
- Expensive at scale ($20k+/month for 1M users)
- Vendor lock-in
- Feature-rich but complex pricing tiers
- Requires cloud connectivity

**Pricing:** Free tier limited, then $600-1000/month for basic plans
**Setup Complexity:** 2/10
**Authentication Methods:** OAuth2, OIDC, SAML, custom flows

**Tradeoff:** Simplicity and features vs. cost at scale.

---

### Option 5: AWS Cognito (COST-EFFECTIVE SAAS)

**When to use:** Hosting on AWS, need massive scale, cost-sensitive

**Pricing Model:**
- Free: 50,000 MAU
- $0.0055 per additional MAU
- At 1M MAU: ~$5,500/month

**Pros:**
- Cheapest at massive scale
- Integrates well with AWS ecosystem
- Good for B2C applications
- Simple, predictable pricing

**Cons:**
- Basic UX requires heavy customization
- Less control than self-hosted
- AWS-locked (no multi-cloud)
- Learning curve steeper than Auth0

**Setup Complexity:** 2/10
**Authentication Methods:** OAuth2, OIDC
**Pricing:** Per-MAU model

**Tradeoff:** Raw cost savings vs. operational complexity.

---

### Option 6: Okta (ENTERPRISE SAAS)

**When to use:** Enterprise deployments, SAML requirements, complex org structures

**Pricing:** Enterprise only, typically $5,000+/month minimum

**Pros:**
- Industry standard for enterprise
- Advanced org structures
- Excellent support
- Multiple protocol support

**Cons:**
- Expensive
- Overkill for small teams
- Complex setup

**Setup Complexity:** 3/10 (managed service)
**Pricing:** Enterprise (contact sales)
**Authentication Methods:** OAuth2, OIDC, SAML

**Tradeoff:** Enterprise maturity vs. massive cost.

---

## Scenario-Based Recommendations

### Scenario 1: Bootstrapping New Product (Galatea Early Beta)

**Your Situation:** Small team, want to validate product-market fit quickly, existing GitLab

**Recommended Stack:**
1. **Primary:** GitLab OAuth2 provider
2. **Implementation:** Custom OAuth2 flow + Better Auth for session management
3. **Why:**
   - Zero infrastructure overhead
   - Full control over UX
   - Can iterate quickly
   - No operational burden
   - Free forever

**Implementation Time:** 3-4 hours
**Operational Overhead:** Minimal (just code maintenance)
**Cost:** Free

**Next Step Trigger:** When you need >1000 users or advanced permission system

---

### Scenario 2: Growing Team with Compliance Needs

**Your Situation:** 50-100 users, need role-based access control, multiple services

**Recommended Stack:**
1. **Primary:** Keycloak (self-hosted)
2. **Database:** Existing PostgreSQL (separate realm/database)
3. **Integration:** Better Auth or direct OIDC
4. **Why:**
   - Advanced RBAC fits your agent model (beki/besa roles)
   - Can integrate with GitLab as identity source
   - Supports multiple applications
   - Zero vendor lock-in
   - Proven in production

**Implementation Time:** 1-2 weeks (including Docker setup, SSL, monitoring)
**Operational Overhead:** Moderate (weekly backups, monthly updates)
**Cost:** Free (but ~$2-3k/year in infrastructure)
**Hosting:** Can run on same self-hosted infrastructure as FalkorDB

---

### Scenario 3: Scale-First Product (1M+ Users Expected)

**Your Situation:** Building for massive scale, need performance guarantees

**Recommended Stack:**
1. **Primary:** AWS Cognito OR Auth0 (if on-AWS is acceptable)
2. **Why:**
   - Linear cost scaling
   - Zero ops burden
   - Built-in redundancy
   - Compliance features

**Implementation Time:** 1-2 days
**Operational Overhead:** None
**Cost:** $5,500-10,000/month at scale
**Hosting:** Cloud-native (AWS or global CDN)

---

### Scenario 4: Enterprise Self-Hosted (Complex Requirements)

**Your Situation:** Regulated industry, need SAML federation, complex org hierarchy

**Recommended Stack:**
1. **Primary:** Authentik (if you prefer modern UX) or Keycloak (if you need maximum features)
2. **Federation:** Connect to corporate SAML IdP
3. **Why:**
   - Full self-hosted control
   - SAML federation support
   - Advanced access policies
   - Can audit everything locally

**Implementation Time:** 2-4 weeks (architecture + setup + testing)
**Operational Overhead:** High (dedicated team)
**Cost:** Free software + $30-50k/year infrastructure/ops
**Hosting:** On-premises or private cloud

---

## Integration Quick Reference

### TanStack Start + Node.js Compatible Libraries

| Provider | Recommended Library | Setup Time | Maturity |
|----------|-------------------|-----------|----------|
| GitLab OAuth2 | `openid-client` + manual | 2-4 hours | High |
| Keycloak | Better Auth + OIDC | 1-2 hours | Very High |
| Authentik | `openid-client` + standard OIDC | 1-2 hours | High |
| Auth0 | Better Auth + auth0 plugin | 30 min | Very High |
| AWS Cognito | Better Auth + cognito plugin | 30 min | High |
| Okta | okta-sdk-nodejs + OIDC | 1 hour | Very High |

### Better Auth (Recommended for TanStack Start)

**Why Better Auth?**
- Purpose-built for TanStack Router
- Handles cookies automatically with `tanstackStartCookies` plugin
- Supports OIDC, OAuth2, social logins
- Type-safe with Zod validation
- Works with existing databases (Drizzle ORM)
- Minimal configuration

```typescript
// app/server/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  plugins: [
    betterAuth.tanstackStartCookies(),
  ],
});
```

---

## Migration Path

If you start with **GitLab OAuth2** and later want to upgrade to **Keycloak/Authentik**:

1. Keep GitLab OAuth2 as fallback
2. Deploy Keycloak/Authentik alongside
3. Add both providers to your app
4. Let users test new auth before switching
5. Migrate existing users gradually
6. Deprecate GitLab auth (keep for 6+ months)

**This approach allows zero downtime migration.**

---

## Security Considerations

### OAuth2 Best Practices (for all options):
- Always use PKCE (Proof Key for Code Exchange)
- Implement CSRF protection with state parameter
- Use secure, httpOnly cookies for tokens
- Validate tokens server-side on every request
- Implement refresh token rotation
- Set appropriate token expiry (15-60 min for access, 7-30 days for refresh)

### Self-Hosted Specific:
- Run behind reverse proxy with TLS
- Keep PostgreSQL on private network
- Regular backups (daily for Keycloak/Authentik)
- Monitor disk space (logs can grow quickly)
- Update promptly (security patches)

### SaaS Specific:
- Review privacy policy regularly
- Understand data residency
- Test disaster recovery procedures
- Monitor API quotas

---

## Decision Tree

```
START: "Need SSO for Galatea?"
  │
  ├─→ "Small team, want to launch fast?"
  │    └─→ "YES" → GitLab OAuth2 (Option 1) ✓
  │    └─→ "NO" → Continue
  │
  ├─→ "Need advanced roles/permissions now?"
  │    └─→ "YES" → Keycloak (Option 2) ✓
  │    └─→ "NO" → Continue
  │
  ├─→ "Want simpler setup than Keycloak?"
  │    └─→ "YES" → Authentik (Option 3) ✓
  │    └─→ "NO" → Continue
  │
  ├─→ "Expect 1M+ users?"
  │    └─→ "YES" → AWS Cognito (Option 5) ✓
  │    └─→ "NO" → Continue
  │
  ├─→ "Can afford vendor lock-in?"
  │    └─→ "YES" → Auth0 (Option 4) ✓
  │    └─→ "NO" → Continue
  │
  └─→ "Need enterprise SAML federation?"
       └─→ "YES" → Okta (Option 6) ✓
       └─→ "NO" → Keycloak (Option 2) ✓
```

---

## References & Further Reading

- [TanStack Start Authentication Guide](https://tanstack.com/start/latest/docs/framework/react/guide/authentication)
- [Better Auth TanStack Integration](https://better-auth.com/docs/integrations/tanstack)
- [Keycloak Documentation](https://www.keycloak.org/)
- [Authentik Documentation](https://docs.goauthentik.io/)
- [GitLab OAuth2 Provider](https://docs.gitlab.com/integration/oauth_provider/)
- [OAuth 2.0 for Browser-Based Apps (IETF RFC)](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps)
- [OIDC SPA for TanStack Start](https://docs.oidc-spa.dev/integration-guides/tanstack-router-start/tanstack-start)

---

## Appendix: Environment Variables

### GitLab OAuth2
```bash
GITLAB_CLIENT_ID=your_client_id
GITLAB_CLIENT_SECRET=your_client_secret
GITLAB_REDIRECT_URI=https://your-app.com/auth/callback
GITLAB_OAUTH_URL=https://gitlab.maugry.ru:2224
```

### Keycloak
```bash
KEYCLOAK_URL=https://keycloak.yourdomain.com
KEYCLOAK_REALM=master
KEYCLOAK_CLIENT_ID=your-app
KEYCLOAK_CLIENT_SECRET=your_client_secret
KEYCLOAK_REDIRECT_URI=https://your-app.com/auth/callback
```

### Authentik
```bash
AUTHENTIK_URL=https://authentik.yourdomain.com
AUTHENTIK_CLIENT_ID=your_client_id
AUTHENTIK_CLIENT_SECRET=your_client_secret
AUTHENTIK_REDIRECT_URI=https://your-app.com/auth/callback
```

### Auth0
```bash
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your_client_id
AUTH0_CLIENT_SECRET=your_client_secret
AUTH0_REDIRECT_URI=https://your-app.com/auth/callback
```

### AWS Cognito
```bash
COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_xxxxx
COGNITO_CLIENT_ID=your_client_id
COGNITO_CLIENT_SECRET=your_client_secret
COGNITO_REDIRECT_URI=https://your-app.com/auth/callback
```

---

**Last Updated:** 2026-03-14
**Status:** Ready for implementation
**Next Step:** Choose approach based on scenario above, then create implementation plan
