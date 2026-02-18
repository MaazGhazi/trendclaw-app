import { Router } from "express";
import { prisma } from "../lib/db.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

router.get("/stats", async (req, res) => {
  const tenantId = req.user!.tenantId;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [clientCount, activeClientCount, signalCountToday, signalCountTotal, latestReport, recentSignals] =
    await Promise.all([
      prisma.client.count({ where: { tenantId } }),
      prisma.client.count({ where: { tenantId, isActive: true } }),
      prisma.signal.count({ where: { tenantId, detectedAt: { gte: today } } }),
      prisma.signal.count({ where: { tenantId } }),
      prisma.report.findFirst({
        where: { tenantId },
        orderBy: { reportDate: "desc" },
        select: { id: true, title: true, reportDate: true, status: true, signalCount: true },
      }),
      prisma.signal.findMany({
        where: { tenantId },
        orderBy: { detectedAt: "desc" },
        take: 10,
        include: { client: { select: { id: true, name: true } } },
      }),
    ]);

  res.json({
    clientCount,
    activeClientCount,
    signalCountToday,
    signalCountTotal,
    latestReport,
    recentSignals,
  });
});

export default router;
