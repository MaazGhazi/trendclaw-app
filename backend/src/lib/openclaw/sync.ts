import type { Client } from "@prisma/client";
import { prisma } from "../db.js";
import { openclawClient } from "./client.js";
import { buildClientMonitoringPrompt } from "./prompts.js";

const BACKEND_WEBHOOK_URL = process.env.BACKEND_URL
  ? `${process.env.BACKEND_URL}/api/webhooks/openclaw`
  : "http://localhost:4000/api/webhooks/openclaw";

export async function provisionClientCron(tenantId: string, client: Client): Promise<string | null> {
  if (!openclawClient.isConnected()) {
    console.warn("OpenClaw not connected, skipping cron provisioning");
    return null;
  }

  const jobName = `tc:${tenantId}:${client.id}:client`;
  const prompt = buildClientMonitoringPrompt(client);

  const result = (await openclawClient.request("cron.add", {
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
  })) as { job: { id: string } };

  const cronJobId = result.job.id;

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
