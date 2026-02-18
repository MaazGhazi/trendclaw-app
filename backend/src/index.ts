import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config.js";
import { errorHandler } from "./middleware/error.js";
import { openclawClient } from "./lib/openclaw/client.js";

import authRoutes from "./routes/auth.js";
import clientRoutes from "./routes/clients.js";
import nicheRoutes from "./routes/niches.js";
import signalRoutes from "./routes/signals.js";
import reportRoutes from "./routes/reports.js";
import dashboardRoutes from "./routes/dashboard.js";
import webhookRoutes from "./routes/webhooks.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/niches", nicheRoutes);
app.use("/api/signals", signalRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/webhooks", webhookRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    openclawConnected: openclawClient.isConnected(),
  });
});

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`TrendClaw backend running on port ${config.port}`);
});

// Connect to OpenClaw gateway (non-blocking)
openclawClient.connect().catch((err) => {
  console.warn("Initial OpenClaw connection failed (will retry):", err.message);
});
