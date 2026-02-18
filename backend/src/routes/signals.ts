import { Router } from "express";
import { prisma } from "../lib/db.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

router.get("/", async (req, res) => {
  const { clientId, type, from, to, limit = "50", offset = "0" } = req.query;

  const where: Record<string, unknown> = { tenantId: req.user!.tenantId };

  if (clientId) where.clientId = clientId as string;
  if (type) where.type = type as string;
  if (from || to) {
    where.detectedAt = {
      ...(from && { gte: new Date(from as string) }),
      ...(to && { lte: new Date(to as string) }),
    };
  }

  const [signals, total] = await Promise.all([
    prisma.signal.findMany({
      where,
      orderBy: { detectedAt: "desc" },
      take: Math.min(parseInt(limit as string, 10), 100),
      skip: parseInt(offset as string, 10),
      include: { client: { select: { id: true, name: true } } },
    }),
    prisma.signal.count({ where }),
  ]);

  res.json({ signals, total });
});

export default router;
