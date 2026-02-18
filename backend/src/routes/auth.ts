import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/db.js";
import { signToken } from "../lib/jwt.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

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

  if (!user || !(await bcrypt.compare(password, user.password))) {
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
