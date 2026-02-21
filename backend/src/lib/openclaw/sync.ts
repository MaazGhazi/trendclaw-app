import type { Client } from "@prisma/client";
import { prisma } from "../db.js";
import { openclawClient } from "./client.js";
import { buildClientMonitoringPrompt } from "./prompts.js";

const BACKEND_WEBHOOK_URL = process.env.BACKEND_URL
  ? `${process.env.BACKEND_URL}/api/webhooks/openclaw`
  : "http://localhost:4000/api/webhooks/openclaw";

export async function provisionClientCron(tenantId: string, client: Client): Promise<string | null> {
  console.log("[sync] Provisioning cron for client:", client.name, client.id);
  console.log("[sync] OpenClaw connected:", openclawClient.isConnected());
  console.log("[sync] Webhook URL:", BACKEND_WEBHOOK_URL);

  if (!openclawClient.isConnected()) {
    console.warn("[sync] OpenClaw not connected, skipping cron provisioning");
    return null;
  }

  const jobName = `tc:${tenantId}:${client.id}:client`;
  const prompt = buildClientMonitoringPrompt(client);
  console.log("[sync] Job name:", jobName);
  console.log("[sync] Prompt length:", prompt.length);

  const result = await openclawClient.request("cron.add", {
    name: jobName,
    description: `Monitor ${client.name} for buying signals`,
    enabled: true,
    schedule: { kind: "every", everyMs: 12 * 60 * 60 * 1000 }, // every 12h
    sessionTarget: "isolated",
    wakeMode: "now", // run immediately on creation
    payload: {
      kind: "agentTurn",
      message: prompt,
    },
    delivery: {
      mode: "webhook",
      to: BACKEND_WEBHOOK_URL,
    },
  }) as Record<string, unknown>;

  console.log("cron.add response:", JSON.stringify(result));

  const cronJobId = (result as any)?.id;
  if (!cronJobId) {
    console.error("Could not extract cron job ID from response:", result);
    return null;
  }

  // Track the monitoring job
  await prisma.monitoringJob.create({
    data: {
      tenantId,
      cronJobId,
      jobType: "client",
      targetId: client.id,
      schedule: "every:12h",
    },
  });

  return cronJobId;
}

export async function forceRunCron(cronJobId: string): Promise<void> {
  if (!openclawClient.isConnected()) {
    throw new Error("OpenClaw gateway not connected");
  }

  console.log("[sync] Force-running cron job:", cronJobId);
  const result = await openclawClient.request("cron.run", {
    jobId: cronJobId,
    mode: "force",
  });
  console.log("[sync] cron.run response:", JSON.stringify(result));
}

export async function listCronJobs(): Promise<unknown> {
  if (!openclawClient.isConnected()) {
    throw new Error("OpenClaw gateway not connected");
  }
  return openclawClient.request("cron.list", { includeDisabled: true });
}

export async function getCronRuns(cronJobId: string): Promise<unknown> {
  if (!openclawClient.isConnected()) {
    throw new Error("OpenClaw gateway not connected");
  }
  return openclawClient.request("cron.runs", { id: cronJobId, limit: 10 });
}

export async function getCronStatus(): Promise<unknown> {
  if (!openclawClient.isConnected()) {
    throw new Error("OpenClaw gateway not connected");
  }
  return openclawClient.request("cron.status", {});
}

export async function deprovisionCron(cronJobId: string): Promise<void> {
  if (openclawClient.isConnected()) {
    try {
      await openclawClient.request("cron.remove", { id: cronJobId });
    } catch (err) {
      console.error("Failed to remove cron job from OpenClaw:", err);
    }
  }

  await prisma.monitoringJob.deleteMany({ where: { cronJobId } });
}
