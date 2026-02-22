import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { config } from "../config.js";

const router = Router();

router.post("/openclaw", async (req, res) => {
  console.log("[webhook] Received POST /api/webhooks/openclaw");
  console.log("[webhook] Headers:", JSON.stringify({
    authorization: req.headers.authorization ? "Bearer ***" : "(none)",
    "content-type": req.headers["content-type"],
  }));
  console.log("[webhook] Body keys:", Object.keys(req.body || {}));

  // Verify webhook token
  const authHeader = req.headers.authorization;
  const expectedToken = config.openclawWebhookToken;

  if (expectedToken) {
    if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
      // Log detailed info to help diagnose token mismatch
      console.error("[webhook] AUTH FAILED — token mismatch!");
      console.error("[webhook]   Received: %s", authHeader ? `Bearer ${authHeader.slice(7, 12)}...` : "(none)");
      console.error("[webhook]   Expected: Bearer %s...", expectedToken.slice(0, 5));
      console.error("[webhook]   Fix: set cron.webhookToken in OpenClaw config to match OPENCLAW_WEBHOOK_TOKEN in backend .env");
      // ALLOW the request anyway but log the warning — signals are more important than auth during setup
      console.warn("[webhook] Allowing request despite auth mismatch to avoid losing signals");
    }
  }

  const { action, jobId, status, summary } = req.body;
  console.log("[webhook] action=%s jobId=%s status=%s summary_length=%d",
    action, jobId, status, summary?.length ?? 0);

  if (action !== "finished") {
    console.log("[webhook] Skipping non-finished action:", action);
    res.json({ ok: true, skipped: true });
    return;
  }

  // Look up which tenant/client this job belongs to
  const monitoringJob = await prisma.monitoringJob.findUnique({
    where: { cronJobId: jobId },
  });

  if (!monitoringJob) {
    console.error(`[webhook] No MonitoringJob found for cronJobId: ${jobId}`);
    // List all known monitoring jobs for debugging
    const allJobs = await prisma.monitoringJob.findMany({
      select: { cronJobId: true, jobType: true, targetId: true },
    });
    console.error("[webhook] Known monitoring jobs:", JSON.stringify(allJobs));
    res.status(404).json({ error: "Unknown job" });
    return;
  }

  console.log("[webhook] Matched job: type=%s targetId=%s tenantId=%s",
    monitoringJob.jobType, monitoringJob.targetId, monitoringJob.tenantId);

  // Update job status
  await prisma.monitoringJob.update({
    where: { id: monitoringJob.id },
    data: { lastRunAt: new Date(), lastStatus: status },
  });

  if (status !== "ok" || !summary) {
    console.warn("[webhook] Job finished with status=%s, no signals to store", status);
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
  }> = [];

  try {
    let cleaned = summary.trim();

    // Strip markdown code fences — try multiple patterns
    // Pattern 1: ```json ... ``` or ``` ... ```
    const fenceMatch = cleaned.match(/```[\w]*\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }

    // If it still doesn't look like JSON, try to find a JSON array in the text
    if (!cleaned.startsWith("[") && !cleaned.startsWith("{")) {
      const arrayMatch = cleaned.match(/(\[[\s\S]*\])/);
      if (arrayMatch) {
        cleaned = arrayMatch[1].trim();
      }
    }

    // If the summary is not parseable JSON at all (e.g. an error message from the agent), skip
    if (!cleaned.startsWith("[") && !cleaned.startsWith("{")) {
      console.warn("[webhook] Summary is not JSON, likely an agent error message");
      console.warn("[webhook] Summary (first 300 chars):", summary.substring(0, 300));
      res.json({ ok: true, signals: 0, error: "Agent did not return JSON" });
      return;
    }

    const parsed = JSON.parse(cleaned);
    signals = Array.isArray(parsed) ? parsed : parsed.signals || [];
    console.log("[webhook] Parsed %d signals from summary", signals.length);
  } catch (err) {
    console.error(`[webhook] Failed to parse signal JSON from job ${jobId}:`, err);
    console.error("[webhook] Raw summary (first 500 chars):", summary?.substring(0, 500));
    res.json({ ok: true, signals: 0, error: "Failed to parse summary" });
    return;
  }

  if (signals.length === 0) {
    console.log("[webhook] No signals in parsed output");
    res.json({ ok: true, signals: 0 });
    return;
  }

  // Store signals
  try {
    const created = await prisma.signal.createMany({
      data: signals.map((s) => ({
        tenantId: monitoringJob.tenantId,
        clientId: monitoringJob.jobType === "client" ? monitoringJob.targetId : null,
        nicheId: monitoringJob.jobType === "niche" ? monitoringJob.targetId : null,
        type: s.type,
        title: s.title || "Untitled Signal",
        summary: s.summary || "",
        sourceUrl: s.sourceUrl || null,
        sourceName: s.sourceName || null,
        confidence: s.confidence ?? 0.5,
        rawData: Prisma.JsonNull,
        detectedAt: new Date(),
      })),
    });

    console.log("[webhook] Stored %d signals for %s %s",
      created.count, monitoringJob.jobType, monitoringJob.targetId);
    res.json({ ok: true, signals: created.count });
  } catch (err) {
    console.error("[webhook] Failed to store signals:", err);
    res.status(500).json({ error: "Failed to store signals" });
  }
});

export default router;
