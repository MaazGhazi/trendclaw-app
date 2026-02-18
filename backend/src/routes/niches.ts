import { Router } from "express";
import { prisma } from "../lib/db.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

router.get("/", async (req, res) => {
  const niches = await prisma.contentNiche.findMany({
    where: { tenantId: req.user!.tenantId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ niches });
});

router.post("/", async (req, res) => {
  const { name, keywords, sources } = req.body;

  if (!name || !keywords?.length) {
    res.status(400).json({ error: "name and keywords are required" });
    return;
  }

  const niche = await prisma.contentNiche.create({
    data: {
      tenantId: req.user!.tenantId,
      name,
      keywords,
      sources: sources || [],
    },
  });

  res.status(201).json({ niche });
});

router.patch("/:id", async (req, res) => {
  const existing = await prisma.contentNiche.findFirst({
    where: { id: req.params.id, tenantId: req.user!.tenantId },
  });

  if (!existing) {
    res.status(404).json({ error: "Niche not found" });
    return;
  }

  const { name, keywords, sources } = req.body;
  const niche = await prisma.contentNiche.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(keywords !== undefined && { keywords }),
      ...(sources !== undefined && { sources }),
    },
  });

  res.json({ niche });
});

router.delete("/:id", async (req, res) => {
  const existing = await prisma.contentNiche.findFirst({
    where: { id: req.params.id, tenantId: req.user!.tenantId },
  });

  if (!existing) {
    res.status(404).json({ error: "Niche not found" });
    return;
  }

  await prisma.contentNiche.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

export default router;
