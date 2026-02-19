import { Router } from "express";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../lib/db.js";
import { signToken } from "../lib/jwt.js";
import { authenticate } from "../middleware/auth.js";
import { config } from "../config.js";

const router = Router();
const googleClient = new OAuth2Client(config.googleClientId);

router.post("/register", async (req, res) => {
  const { email, password, name, tenantName } = req.body;

  if (!email || !password || !tenantName) {
    res.status(400).json({ error: "email, password, and tenantName are required" });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const slug = tenantName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const existingTenant = await prisma.tenant.findUnique({ where: { slug } });
  if (existingTenant) {
    res.status(409).json({ error: "Tenant name already taken" });
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const tenant = await prisma.tenant.create({
    data: { name: tenantName, slug },
  });

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name: name || null,
      role: "admin",
      tenantId: tenant.id,
    },
  });

  const token = signToken({
    userId: user.id,
    tenantId: tenant.id,
    email: user.email,
    role: user.role,
  });

  res.status(201).json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
  });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { tenant: true },
  });

  if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signToken({
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
  });

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    tenant: { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug },
  });
});

// Google OAuth
router.post("/google", async (req, res) => {
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

router.get("/me", authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { tenant: true },
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    tenant: { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug, plan: user.tenant.plan },
  });
});

export default router;
