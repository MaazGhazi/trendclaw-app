import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";

const VALID_TYPES = ["pulse", "digest", "deep_dive"];
const DATA_DIR = path.join(process.cwd(), "data");
const LOCK_FILE = path.join(DATA_DIR, "run.lock");

function isLocked(): { locked: boolean; pid?: number; type?: string } {
  if (!fs.existsSync(LOCK_FILE)) return { locked: false };
  try {
    const content = JSON.parse(fs.readFileSync(LOCK_FILE, "utf-8"));
    // Check if the PID is actually still running
    try {
      process.kill(content.pid, 0); // signal 0 = just check if alive
      return { locked: true, pid: content.pid, type: content.type };
    } catch {
      // Process is dead — stale lock
      fs.unlinkSync(LOCK_FILE);
      return { locked: false };
    }
  } catch {
    fs.unlinkSync(LOCK_FILE);
    return { locked: false };
  }
}

export async function GET() {
  const lock = isLocked();
  return NextResponse.json(lock);
}

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

  // Check lock
  const lock = isLocked();
  if (lock.locked) {
    return NextResponse.json(
      { error: `Pipeline already running (${lock.type}, PID ${lock.pid})` },
      { status: 409 }
    );
  }

  const scriptPath = path.join(
    process.env.HOME || "/root",
    "trendclaw-app",
    "deploy",
    "run-pulse.sh"
  );

  // Spawn the pipeline
  const child = execFile(
    "bash",
    [scriptPath, type],
    {
      env: { ...process.env, PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin" },
      timeout: 300_000,
    },
    (error, _stdout, stderr) => {
      // Clean up lock when done
      try { fs.unlinkSync(LOCK_FILE); } catch { /* ignore */ }
      if (error) {
        console.error(`[run] ${type} pipeline error:`, stderr || error.message);
      } else {
        console.log(`[run] ${type} pipeline completed`);
      }
    }
  );

  // Write lock file with PID
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    LOCK_FILE,
    JSON.stringify({ pid: child.pid, type, started: new Date().toISOString() })
  );

  return NextResponse.json(
    { ok: true, type, pid: child.pid, message: `${type} pipeline started` },
    { status: 202 }
  );
}
