# Setting Up Better Auth with TanStack Start

**Target Audience**: Developers implementing auth for Galatea
**Time Estimate**: 1-2 days for full implementation
**Prerequisites**: Node.js, TanStack Start v1, PostgreSQL running

---

## Phase 1: Installation & Setup (30 minutes)

### Step 1: Install Better Auth

```bash
cd /home/newub/w/galatea
pnpm add better-auth
pnpm add @better-auth/core # if not included
```

### Step 2: Create Auth Server Instance

Create `/home/newub/w/galatea/server/auth.ts`:

```typescript
import { betterAuth } from "better-auth"

export const auth = betterAuth({
  database: {
    type: "postgres",
    url: process.env.DATABASE_URL,
  },
  secret: process.env.BETTER_AUTH_SECRET,
  basePath: "/api/auth",
  
  // Enable email/password (optional for Phase 1)
  emailAndPassword: {
    enabled: false, // disable for now, use magic links instead
  },
  
  // OAuth providers (add GitHub for quick MVP)
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
    },
    // Add GitLab later if needed
    // gitlab: {
    //   clientId: process.env.GITLAB_CLIENT_ID || "",
    //   clientSecret: process.env.GITLAB_CLIENT_SECRET || "",
    // },
  },
})
```

### Step 3: Create Auth Routes

Create `/home/newub/w/galatea/server/routes/api/auth/[...all].ts`:

```typescript
import { auth } from "~/server/auth"

export const POST = (event) => auth.handler(event)
export const GET = (event) => auth.handler(event)
```

### Step 4: Environment Variables

Add to `.env.local`:

```bash
# Database (already configured)
DATABASE_URL=postgres://user:password@localhost:15432/galatea

# Better Auth
BETTER_AUTH_SECRET=your-random-32-char-secret-here-change-this

# GitHub OAuth (get from github.com/settings/developers)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# Allowed origins
BETTER_AUTH_ORIGIN=http://localhost:13000
```

**Generate secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Phase 2: OAuth 2.0 (GitHub) - The Quick Win

### Step 1: Create GitHub OAuth Application

1. Go to [github.com/settings/developers](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: Galatea Dev
   - **Homepage URL**: http://localhost:13000
   - **Authorization callback URL**: http://localhost:13000/api/auth/callback/github
4. Copy Client ID & Client Secret to `.env.local`

### Step 2: Add GitHub to Auth Config

In `server/auth.ts`, uncomment GitHub:

```typescript
socialProviders: {
  github: {
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  },
}
```

### Step 3: Create Login Page

Create `/home/newub/w/galatea/app/routes/auth.login.tsx`:

```typescript
import { useAuth } from "better-auth/react"
import { useState } from "react"

export default function LoginPage() {
  const { signInWith, isLoading } = useAuth()
  const [error, setError] = useState<string | null>(null)

  const handleGitHubSignIn = async () => {
    try {
      setError(null)
      await signInWith("github", {
        callbackURL: "/dashboard",
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed")
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-3xl font-bold">Galatea</h1>
      <p className="text-gray-600">Sign in to continue</p>

      {error && (
        <div className="w-80 p-4 bg-red-50 border border-red-200 rounded text-red-700">
          {error}
        </div>
      )}

      <button
        onClick={handleGitHubSignIn}
        disabled={isLoading}
        className="w-80 px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 disabled:opacity-50"
      >
        {isLoading ? "Signing in..." : "Sign in with GitHub"}
      </button>

      <p className="text-xs text-gray-500 mt-8">
        Internal dev tool. GitHub account required.
      </p>
    </div>
  )
}
```

### Step 4: Protect Routes (Middleware)

Create `/home/newub/w/galatea/server/middleware/auth.ts`:

```typescript
import { auth } from "~/server/auth"
import { defineEventHandler } from "h3"

export const authMiddleware = defineEventHandler(async (event) => {
  const session = await auth.api.getSession({
    headers: event.headers,
  })

  if (!session) {
    throw createError({
      statusCode: 401,
      statusMessage: "Not authenticated",
    })
  }

  // Attach user to event
  event.user = session.user
})
```

### Step 5: Test GitHub OAuth

```bash
pnpm dev
# Visit http://localhost:13000/auth/login
# Click "Sign in with GitHub"
# Should redirect to GitHub, then back to app
```

---

## Phase 2B: Magic Links (Email-Based Auth)

If you prefer magic links over OAuth:

### Step 1: Install Magic Links Plugin

```bash
pnpm add @better-auth/plugins
```

### Step 2: Configure in Auth Server

Update `/home/newub/w/galatea/server/auth.ts`:

```typescript
import { betterAuth } from "better-auth"
import { passwordless } from "@better-auth/plugins"
import { sendEmail } from "~/server/email" // we'll create this

export const auth = betterAuth({
  database: {
    type: "postgres",
    url: process.env.DATABASE_URL,
  },
  secret: process.env.BETTER_AUTH_SECRET,
  basePath: "/api/auth",
  
  plugins: [
    passwordless({
      sendEmail: async ({ email, url, token }) => {
        // Send email with magic link
        await sendEmail({
          to: email,
          subject: "Your login link",
          html: `
            <p>Click the link below to sign in:</p>
            <a href="${url}">Sign in to Galatea</a>
            <p>Or paste this code: ${token}</p>
            <p>Link expires in 15 minutes.</p>
          `,
        })
      },
    }),
  ],

  emailAndPassword: {
    enabled: false,
  },

  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
    },
  },
})
```

### Step 3: Set Up Email Service

Create `/home/newub/w/galatea/server/email.ts`:

Using Resend (recommended for development):

```bash
pnpm add resend
```

```typescript
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}) {
  const result = await resend.emails.send({
    from: "auth@galatea.dev",
    to,
    subject,
    html,
  })

  if (result.error) {
    throw new Error(`Email send failed: ${result.error.message}`)
  }

  return result
}
```

For local development without Resend, use Nodemailer:

```bash
pnpm add nodemailer
pnpm add -D @types/nodemailer
```

```typescript
import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
})

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM || "auth@galatea.dev",
    to,
    subject,
    html,
  })
}
```

### Step 4: Create Magic Link Login Page

Update `/home/newub/w/galatea/app/routes/auth.login.tsx`:

```typescript
import { useAuth } from "better-auth/react"
import { useState } from "react"

export default function LoginPage() {
  const { signInWith, isLoading } = useAuth()
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setError(null)
      await signInWith("passwordless", {
        email,
        callbackURL: "/dashboard",
      })
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send link")
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6">
      <h1 className="text-3xl font-bold">Galatea</h1>

      {sent ? (
        <div className="w-80 p-4 bg-green-50 border border-green-200 rounded text-green-700">
          Check your email for login link ({email})
        </div>
      ) : (
        <>
          <p className="text-gray-600">Sign in with email or GitHub</p>

          {error && (
            <div className="w-80 p-4 bg-red-50 border border-red-200 rounded text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleMagicLink} className="w-80 flex flex-col gap-4">
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? "Sending..." : "Send magic link"}
            </button>
          </form>

          <div className="w-80 relative my-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or</span>
            </div>
          </div>

          <button
            onClick={async () => {
              try {
                await signInWith("github", { callbackURL: "/dashboard" })
              } catch (err) {
                setError(err instanceof Error ? err.message : "GitHub sign in failed")
              }
            }}
            className="w-80 px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
          >
            Sign in with GitHub
          </button>
        </>
      )}
    </div>
  )
}
```

### Step 5: Update Environment Variables

```bash
# Email (if using Resend)
RESEND_API_KEY=your_resend_api_key

# Or if using Nodemailer/SMTP
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@example.com
SMTP_PASSWORD=your_password
SMTP_FROM=auth@galatea.dev
```

---

## Phase 3: Protected Routes & Sessions

### Step 1: Get Current User

```typescript
import { useAuth } from "better-auth/react"

export default function Dashboard() {
  const { data: session } = useAuth()

  if (!session) {
    return <div>Loading...</div>
  }

  return (
    <div>
      <h1>Welcome, {session.user.name || session.user.email}</h1>
      <img src={session.user.image} alt={session.user.name} className="w-12 h-12 rounded-full" />
    </div>
  )
}
```

### Step 2: Server-Side Protected Routes

```typescript
import { defineEventHandler } from "h3"
import { auth } from "~/server/auth"

export default defineEventHandler(async (event) => {
  const session = await auth.api.getSession({
    headers: event.headers,
  })

  if (!session) {
    throw createError({
      statusCode: 401,
      statusMessage: "Not authenticated",
    })
  }

  // session.user is available
  console.log("User:", session.user.email)

  return { message: "Protected data" }
})
```

### Step 3: Sign Out

```typescript
import { useAuth } from "better-auth/react"

export function SignOutButton() {
  const { signOut } = useAuth()

  return (
    <button
      onClick={async () => {
        await signOut({
          fetchOptions: {
            onSuccess: () => {
              // Redirect to login
              window.location.href = "/auth/login"
            },
          },
        })
      }}
    >
      Sign Out
    </button>
  )
}
```

---

## Phase 4: Database Schema (Auto-Generated)

Better Auth creates tables automatically on first run:

```sql
-- View generated tables (after first run)
\dt # in PostgreSQL

-- Better Auth creates:
-- - public.user
-- - public.account
-- - public.session
-- - public.verification (for email verification)
-- - And others depending on plugins
```

To manually initialize if needed:

```bash
# Better Auth handles this automatically, but you can force it:
node -e "
import { auth } from './server/auth.ts'
await auth.createUser({ email: 'test@example.com' })
"
```

---

## Phase 5: Testing

### Test OAuth Flow

```bash
# 1. Start dev server
pnpm dev

# 2. Visit http://localhost:13000/auth/login
# 3. Click GitHub button
# 4. Should see GitHub login, then callback
# 5. Should see user dashboard
```

### Test Magic Links

```bash
# 1. Visit http://localhost:13000/auth/login
# 2. Enter email address
# 3. Check email (or logs if using Nodemailer)
# 4. Click link (or enter token)
# 5. Should be logged in
```

### Test Protected Route

```bash
# From browser console:
const res = await fetch('/api/protected', {
  headers: { 'Authorization': `Bearer ${session?.token}` }
})
console.log(await res.json())
```

---

## Phase 6: Monitoring & Logs

### Monitor Auth Endpoints

Better Auth logs to console. For production, integrate with Langfuse:

```typescript
// In server/auth.ts
export const auth = betterAuth({
  // ... other config
  
  hooks: {
    after: async (event) => {
      // Log all auth events
      console.log(`[Auth] ${event.name}`, {
        user: event.data?.user?.email,
        provider: event.data?.provider,
      })
    },
  },
})
```

### Check Session Validity

```bash
# Query PostgreSQL directly
SELECT * FROM session WHERE "userId" = '...';
```

---

## Troubleshooting

### "BETTER_AUTH_SECRET is required"

```bash
# Generate and add to .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### "Cannot connect to database"

```bash
# Verify DATABASE_URL is correct
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

### "GitHub OAuth returns 401"

1. Check Client ID & Secret match GitHub settings
2. Verify callback URL is exactly: `http://localhost:13000/api/auth/callback/github`
3. Check OAuth app is not suspended

### "Magic link not arriving"

1. Check Resend/SMTP credentials
2. Look for email in spam folder
3. Check server logs for errors: `pnpm dev` output

---

## Next: Phase 3+ Features (Future)

Once basic auth works:

- [ ] Add 2FA (TOTP)
- [ ] Add WebAuthn/passkeys
- [ ] Add organization support
- [ ] Add role-based access control
- [ ] Integrate with Authentik for OIDC (Q3/Q4)

---

**For issues or questions**, see:
- Better Auth docs: https://better-auth.com
- GitHub issues: https://github.com/better-auth/better-auth

