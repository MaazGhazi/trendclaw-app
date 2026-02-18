import { Router } from "express";
import { prisma } from "../lib/db.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

router.get("/", async (req, res) => {
  const { limit = "20", offset = "0" } = req.query;

  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: { reportDate: "desc" },
      take: Math.min(parseInt(limit as string, 10), 50),
      skip: parseInt(offset as string, 10),
      select: {
        id: true,
        title: true,
        reportDate: true,
        status: true,
        signalCount: true,
        generatedAt: true,
        createdAt: true,
      },
    }),
    prisma.report.count({ where: { tenantId: req.user!.tenantId } }),
  ]);

  res.json({ reports, total });
});

router.get("/:id", async (req, res) => {
  const report = await prisma.report.findFirst({
    where: { id: req.params.id, tenantId: req.user!.tenantId },
    include: {
      reportSignals: {
        include: {
          signal: {
            include: { client: { select: { id: true, name: true } } },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!report) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  res.json({ report });
});

router.post("/generate", async (req, res) => {
  const tenantId = req.user!.tenantId;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check if report already exists for today
  const existing = await prisma.report.findFirst({
    where: { tenantId, reportDate: today },
  });

  if (existing) {
    res.json({ report: existing, message: "Report already exists for today" });
    return;
  }

  // Get today's signals
  const signals = await prisma.signal.findMany({
    where: {
      tenantId,
      detectedAt: { gte: today },
    },
    include: { client: { select: { id: true, name: true } } },
  });

  // Create a pending report — actual AI synthesis will be done by OpenClaw
  const report = await prisma.report.create({
    data: {
      tenantId,
      title: `Daily Report — ${today.toISOString().split("T")[0]}`,
      reportDate: today,
      status: signals.length > 0 ? "pending" : "empty",
      signalCount: signals.length,
    },
  });

  // Link signals to report
  if (signals.length > 0) {
    await prisma.reportSignal.createMany({
      data: signals.map((signal, i) => ({
        reportId: report.id,
        signalId: signal.id,
        section: signal.type,
        sortOrder: i,
      })),
    });

    // TODO: Trigger OpenClaw agent for report synthesis
  }

  res.status(201).json({ report });
});

export default router;
