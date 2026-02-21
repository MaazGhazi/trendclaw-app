import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { config } from "../config.js";

const router = Router();

router.post("/openclaw", async (req, res) => {
  // Verify webhook token
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${config.openclawWebhookToken}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { action, jobId, status, summary } = req.body;

  if (action !== "finished") {
    res.json({ ok: true, skipped: true });
    return;
  }

  // Look up which tenant/client this job belongs to
  const monitoringJob = await prisma.monitoringJob.findUnique({
    where: { cronJobId: jobId },
  });

  if (!monitoringJob) {
    console.warn(`Received webhook for unknown job: ${jobId}`);
    res.status(404).json({ error: "Unknown job" });
    return;
  }

  // Update job status
  await prisma.monitoringJob.update({
    where: { id: monitoringJob.id },
    data: { lastRunAt: new Date(), lastStatus: status },
  });

  if (status !== "ok" || !summary) {
    res.json({ ok: true, signals: 0 });
    return;
  }

  // Parse signals from agent output
  let signals: Array<{
    type: string;
    title: string;
    summary: string;
    sourceUrl?: string;
    sourceName?: string;
    confidence?: number;
    rawData?: Prisma.InputJsonValue;
  }> = [];

  try {
    let cleaned = summary.trim();
    // Strip markdown code fences (```json ... ``` or ``` ... ```)
    const fenceMatch = cleaned.match(/^```[\w]*\s*\n?([\s\S]*?)\n?\s*```\s*$/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }
    const parsed = JSON.parse(cleaned);
    signals = Array.isArray(parsed) ? parsed : parsed.signals || [];
  } catch {
    console.error(`Failed to parse signal JSON from job ${jobId}:`, summary);
    res.json({ ok: true, signals: 0, error: "Failed to parse summary" });
    return;
  }

  // Store signals
  const created = await prisma.signal.createMany({
    data: signals.map((s) => ({
      tenantId: monitoringJob.tenantId,
      clientId: monitoringJob.jobType === "client" ? monitoringJob.targetId : null,
      nicheId: monitoringJob.jobType === "niche" ? monitoringJob.targetId : null,
      type: s.type,
      title: s.title,
      summary: s.summary,
      sourceUrl: s.sourceUrl || null,
      sourceName: s.sourceName || null,
      confidence: s.confidence ?? 0.5,
      rawData: s.rawData ?? Prisma.JsonNull,
    })),
  });

  res.json({ ok: true, signals: created.count });
});

export default router;
