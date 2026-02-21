import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config.js";
import { errorHandler } from "./middleware/error.js";
import { openclawClient } from "./lib/openclaw/client.js";
import { prisma } from "./lib/db.js";
import { listCronJobs, getCronRuns, getCronStatus } from "./lib/openclaw/sync.js";

import authRoutes from "./routes/auth.js";
import clientRoutes from "./routes/clients.js";
import nicheRoutes from "./routes/niches.js";
import signalRoutes from "./routes/signals.js";
import reportRoutes from "./routes/reports.js";
import dashboardRoutes from "./routes/dashboard.js";
import webhookRoutes from "./routes/webhooks.js";

const app = express();

app.use(helmet());
app.use(cors({
  origin: config.corsOrigin.includes(",")
    ? config.corsOrigin.split(",").map((s) => s.trim())
    : config.corsOrigin,
}));
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/niches", nicheRoutes);
app.use("/api/signals", signalRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/webhooks", webhookRoutes);

// Health check with diagnostics
app.get("/api/health", async (_req, res) => {
  const [jobCount, signalCount, recentSignals, recentJobs] = await Promise.all([
    prisma.monitoringJob.count(),
    prisma.signal.count(),
    prisma.signal.findMany({
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, type: true, title: true, createdAt: true, clientId: true },
    }),
    prisma.monitoringJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { cronJobId: true, jobType: true, targetId: true, lastRunAt: true, lastStatus: true },
    }),
  ]);

  res.json({
    status: "ok",
    openclawConnected: openclawClient.isConnected(),
    webhookTokenConfigured: !!(config.openclawWebhookToken && config.openclawWebhookToken !== "change-me-in-production"),
    backendUrl: process.env.BACKEND_URL || "(not set)",
    monitoringJobs: jobCount,
    totalSignals: signalCount,
    recentSignals,
    recentJobs,
  });
});

// Diagnostic endpoint — query OpenClaw directly for cron job status
app.get("/api/debug/openclaw", async (_req, res) => {
  try {
    const [cronStatus, cronJobs] = await Promise.all([
      getCronStatus().catch((e: any) => ({ error: e.message })),
      listCronJobs().catch((e: any) => ({ error: e.message })),
    ]);

    // For each job, get recent runs
    const jobs = (cronJobs as any)?.jobs || [];
    const jobRuns: Record<string, unknown> = {};
    for (const job of jobs.slice(0, 10)) {
      try {
        jobRuns[job.id] = await getCronRuns(job.id);
      } catch (e: any) {
        jobRuns[job.id] = { error: e.message };
      }
    }

    res.json({
      connected: openclawClient.isConnected(),
      cronStatus,
      cronJobs: jobs.map((j: any) => ({
        id: j.id,
        name: j.name,
        enabled: j.enabled,
        delivery: j.delivery,
        lastRun: j.lastRunAt,
      })),
      jobRuns,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message, connected: openclawClient.isConnected() });
  }
});

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`TrendClaw backend running on port ${config.port}`);
});

// Connect to OpenClaw gateway (non-blocking)
openclawClient.connect().catch((err) => {
  console.warn("Initial OpenClaw connection failed (will retry):", err.message);
});
