# Adding Google OAuth to TrendClaw

## Overview

Adds "Sign in with Google" alongside existing email/password auth. Uses Google Identity Services (GIS) popup flow — no redirect URI needed on the droplet.

---

## Step 1: Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create or select a project
3. Go to **APIs & Services > Credentials > Create Credentials > OAuth 2.0 Client ID**
4. Application type: **Web application**
5. Authorized JavaScript origins:
   - Your Vercel URL (e.g. `https://trendclaw.vercel.app`)
   - `http://localhost:3000` (for local dev)
6. No redirect URI needed
7. Copy the **Client ID** — you'll use it in both frontend and backend

---

## Step 2: Backend Changes

### 2a. Install dependency

```bash
ssh root@143.110.218.58
cd /opt/trendclaw/backend
npm install google-auth-library
```

### 2b. Update Prisma schema

Edit `backend/prisma/schema.prisma` — update the `User` model:

```diff
 model User {
   id        String   @id @default(uuid()) @db.Uuid
   tenantId  String   @map("tenant_id") @db.Uuid
   email     String   @unique
-  password  String
+  password  String?
   name      String?
   role      String   @default("member")
   avatarUrl String?  @map("avatar_url")
+  provider  String   @default("email")
+  googleId  String?  @unique @map("google_id")
   createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz

   tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

   @@map("users")
 }
```

Then push the schema:

```bash
cd /opt/trendclaw/backend
npx prisma db push
```

### 2c. Add config

In `backend/src/config.ts`, add to the config object:

```typescript
googleClientId: process.env.GOOGLE_CLIENT_ID || "",
```

### 2d. Add Google auth route

In `backend/src/routes/auth.ts`, add at the top:

```typescript
import { OAuth2Client } from "google-auth-library";

const googleClient = new OAuth2Client(config.googleClientId);
```

Then add this route (after the existing login route):

```typescript
// Google OAuth
router.post("/google", async (req: Request, res: Response) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      res.status(400).json({ error: "credential is required" });
      return;
    }

    // Verify the Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: config.googleClientId,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email || !payload.sub) {
      res.status(400).json({ error: "Invalid Google token" });
      return;
    }

    const { sub: googleId, email, name, picture } = payload;

    // Check if user exists by googleId
    let user = await prisma.user.findUnique({
      where: { googleId },
      include: { tenant: true },
    });

    if (!user) {
      // Check by email (user may have registered with email/password first)
      const existingUser = await prisma.user.findUnique({
        where: { email },
        include: { tenant: true },
      });

      if (existingUser) {
        // Link Google to existing email user
        user = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            googleId,
            provider: "google",
            avatarUrl: existingUser.avatarUrl || picture || null,
          },
          include: { tenant: true },
        });
      }
    }

    if (!user) {
      // New user — auto-create tenant + user
      const baseName = name || email.split("@")[0];
      const slug = baseName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      let finalSlug = slug;
      const existingTenant = await prisma.tenant.findUnique({
        where: { slug },
      });
      if (existingTenant) {
        finalSlug = `${slug}-${Date.now().toString(36)}`;
      }

      const tenant = await prisma.tenant.create({
        data: { name: `${baseName}'s Org`, slug: finalSlug },
      });

      user = await prisma.user.create({
        data: {
          email,
          name: name || null,
          role: "admin",
          tenantId: tenant.id,
          provider: "google",
          googleId,
          avatarUrl: picture || null,
        },
        include: { tenant: true },
      });
    }

    // Issue JWT
    const token = signToken({
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug,
      },
    });
  } catch (error) {
    console.error("Google auth error:", error);
    res.status(401).json({ error: "Google authentication failed" });
  }
});
```

### 2e. Fix login route (handle Google-only users)

In the login route, change the password check from:

```typescript
if (!user || !(await bcrypt.compare(password, user.password))) {
```

To:

```typescript
if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
```

### 2f. Set env var and deploy

```bash
# Add to .env on droplet
echo 'GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID_HERE"' >> /opt/trendclaw/backend/.env

# Rebuild and restart
cd /opt/trendclaw/backend
npm run build
pm2 restart trendclaw-backend
```

---

## Step 3: Frontend Changes

### 3a. Add Google script to auth layout

In `frontend/src/app/(auth)/layout.tsx` (or create one), add:

```tsx
import Script from "next/script";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      {children}
    </>
  );
}
```

### 3b. Add `loginWithGoogle` to auth context

In `frontend/src/lib/auth.tsx`, add to the `AuthState` type:

```typescript
loginWithGoogle: (credential: string) => Promise<void>;
```

Add the implementation inside the AuthProvider:

```typescript
const loginWithGoogle = useCallback(async (credential: string) => {
  const data = await api.post<{ token: string; user: User; tenant: Tenant }>(
    "/api/auth/google",
    { credential }
  );
  api.setToken(data.token);
  setUser(data.user);
  setTenant(data.tenant);
}, []);
```

Add `loginWithGoogle` to the provider value object.

### 3c. Create GoogleSignInButton component

Create `frontend/src/components/google-sign-in-button.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (element: HTMLElement, config: any) => void;
        };
      };
    };
  }
}

export function GoogleSignInButton() {
  const { loginWithGoogle } = useAuth();
  const router = useRouter();
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      if (window.google && buttonRef.current) {
        clearInterval(interval);
        window.google.accounts.id.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          callback: async (response: { credential: string }) => {
            try {
              await loginWithGoogle(response.credential);
              router.push("/");
            } catch (err) {
              console.error("Google sign-in failed:", err);
            }
          },
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: "outline",
          size: "large",
          width: "100%",
          text: "signin_with",
        });
      }
    }, 100);

    return () => clearInterval(interval);
  }, [loginWithGoogle, router]);

  return <div ref={buttonRef} className="w-full" />;
}
```

### 3d. Add to login and register pages

In both `login/page.tsx` and `register/page.tsx`, add after the submit button:

```tsx
import { GoogleSignInButton } from "@/components/google-sign-in-button";

{/* After the submit <Button> */}
<div className="relative my-4">
  <div className="absolute inset-0 flex items-center">
    <span className="w-full border-t" />
  </div>
  <div className="relative flex justify-center text-xs uppercase">
    <span className="bg-card px-2 text-muted-foreground">or</span>
  </div>
</div>
<GoogleSignInButton />
```

### 3e. Set env var

Add to `frontend/.env.local`:

```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id-here
```

And set the same in Vercel project settings.

---

## Quick Checklist

- [ ] Create Google OAuth Client ID in Cloud Console
- [ ] Backend: `npm install google-auth-library`
- [ ] Backend: Update Prisma schema (password optional, add provider + googleId)
- [ ] Backend: `npx prisma db push` on droplet
- [ ] Backend: Add `googleClientId` to config.ts
- [ ] Backend: Add `POST /api/auth/google` route
- [ ] Backend: Fix login null password check
- [ ] Backend: Set `GOOGLE_CLIENT_ID` env var, rebuild, restart pm2
- [ ] Frontend: Add GIS script tag
- [ ] Frontend: Add `loginWithGoogle` to auth context
- [ ] Frontend: Create `GoogleSignInButton` component
- [ ] Frontend: Add button to login + register pages
- [ ] Frontend: Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in .env.local + Vercel
