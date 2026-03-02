import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";

const VALID_TYPES = ["pulse", "digest", "deep_dive"];

export async function POST(request: NextRequest) {
  let body: { type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = body.type || "pulse";
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Check if a run is already in progress
  const fs = await import("fs");
  const path = await import("path");
  const progressFile = path.join(process.cwd(), "data", "progress.json");

  if (fs.existsSync(progressFile)) {
    try {
      const content = fs.readFileSync(progressFile, "utf-8");
      const progress = JSON.parse(content);
      if (progress.status === "running") {
        return NextResponse.json(
          { error: "A pipeline run is already in progress", run_id: progress.run_id },
          { status: 409 }
        );
      }
    } catch {
      // If we can't read it, proceed anyway
    }
  }

  // Fire and forget — spawn the pipeline in the background
  const scriptPath = path.join(process.env.HOME || "/root", "trendclaw-app", "deploy", "run-pulse.sh");

  exec(
    `bash "${scriptPath}" ${type}`,
    {
      env: { ...process.env, PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin" },
      timeout: 300_000, // 5 min max
    },
    (error, _stdout, stderr) => {
      if (error) {
        console.error(`[run] ${type} pipeline error:`, stderr || error.message);
      } else {
        console.log(`[run] ${type} pipeline completed`);
      }
    }
  );

  return NextResponse.json({ ok: true, type, message: `${type} pipeline started` }, { status: 202 });
}
