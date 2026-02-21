import { Router } from "express";
import { prisma } from "../lib/db.js";
import { authenticate } from "../middleware/auth.js";
import { provisionClientCron, deprovisionCron, forceRunCron } from "../lib/openclaw/sync.js";

const router = Router();
router.use(authenticate);

router.get("/", async (req, res) => {
  const clients = await prisma.client.findMany({
    where: { tenantId: req.user!.tenantId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ clients });
});

router.post("/", async (req, res) => {
  const { name, domain, description, linkedinUrl, twitterUrl, facebookUrl, instagramUrl, customUrls, industry, keywords, monitorSignals } = req.body;

  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId } });
  const clientCount = await prisma.client.count({ where: { tenantId: req.user!.tenantId } });

  if (tenant && clientCount >= tenant.maxClients) {
    res.status(403).json({ error: `Client limit reached (${tenant.maxClients})` });
    return;
  }

  const client = await prisma.client.create({
    data: {
      tenantId: req.user!.tenantId,
      name,
      domain: domain || null,
      description: description || null,
      linkedinUrl: linkedinUrl || null,
      twitterUrl: twitterUrl || null,
      facebookUrl: facebookUrl || null,
      instagramUrl: instagramUrl || null,
      customUrls: customUrls || [],
      industry: industry || null,
      keywords: keywords || [],
      monitorSignals: monitorSignals || [],
    },
  });

  // Provision OpenClaw cron job for monitoring
  try {
    const cronJobId = await provisionClientCron(req.user!.tenantId, client);
    if (cronJobId) {
      await prisma.client.update({
        where: { id: client.id },
        data: { cronJobId },
      });
      client.cronJobId = cronJobId;
    }
  } catch (err) {
    console.error("Failed to provision cron job:", err);
    // Client is created, cron can be retried later
  }

  res.status(201).json({ client });
});

router.get("/:id", async (req, res) => {
  const client = await prisma.client.findFirst({
    where: { id: req.params.id, tenantId: req.user!.tenantId },
    include: {
      signals: { orderBy: { detectedAt: "desc" }, take: 20 },
    },
  });

  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.json({ client });
});

router.post("/:id/scan", async (req, res) => {
  const client = await prisma.client.findFirst({
    where: { id: req.params.id, tenantId: req.user!.tenantId },
  });

  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  if (!client.cronJobId) {
    // Try to provision the cron job first
    try {
      const cronJobId = await provisionClientCron(req.user!.tenantId, client);
      if (cronJobId) {
        await prisma.client.update({
          where: { id: client.id },
          data: { cronJobId },
        });
        client.cronJobId = cronJobId;
        // The job runs immediately on creation (wakeMode: "now"), so no need to force-run
        res.json({ ok: true, message: "Monitoring provisioned and scan started" });
        return;
      } else {
        res.status(503).json({ error: "OpenClaw gateway not connected. Cannot start scan." });
        return;
      }
    } catch (err) {
      console.error("Failed to provision cron job for scan:", err);
      res.status(500).json({ error: "Failed to start scan" });
      return;
    }
  }

  try {
    await forceRunCron(client.cronJobId);
    res.json({ ok: true, message: "Scan triggered" });
  } catch (err: any) {
    console.error("Failed to trigger scan:", err);
    res.status(500).json({ error: err.message || "Failed to trigger scan" });
  }
});

router.patch("/:id", async (req, res) => {
  const existing = await prisma.client.findFirst({
    where: { id: req.params.id, tenantId: req.user!.tenantId },
  });

  if (!existing) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const { name, domain, description, linkedinUrl, twitterUrl, facebookUrl, instagramUrl, customUrls, industry, keywords, monitorSignals, isActive } = req.body;

  const client = await prisma.client.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(domain !== undefined && { domain }),
      ...(description !== undefined && { description }),
      ...(linkedinUrl !== undefined && { linkedinUrl }),
      ...(twitterUrl !== undefined && { twitterUrl }),
      ...(facebookUrl !== undefined && { facebookUrl }),
      ...(instagramUrl !== undefined && { instagramUrl }),
      ...(customUrls !== undefined && { customUrls }),
      ...(industry !== undefined && { industry }),
      ...(keywords !== undefined && { keywords }),
      ...(monitorSignals !== undefined && { monitorSignals }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  res.json({ client });
});

router.delete("/:id", async (req, res) => {
  const existing = await prisma.client.findFirst({
    where: { id: req.params.id, tenantId: req.user!.tenantId },
  });

  if (!existing) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  // Deprovision OpenClaw cron job
  if (existing.cronJobId) {
    try {
      await deprovisionCron(existing.cronJobId);
    } catch (err) {
      console.error("Failed to deprovision cron job:", err);
    }
  }

  await prisma.client.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

export default router;
