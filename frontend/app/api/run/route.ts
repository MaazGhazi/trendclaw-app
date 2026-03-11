import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";

const VALID_TYPES = ["pulse", "digest", "deep_dive"];
const DATA_DIR = path.join(process.cwd(), "data");
const LOCK_FILE = path.join(DATA_DIR, "run.lock");
const QUEUE_FILE = path.join(DATA_DIR, "queue.json");

// ─── Types ───────────────────────────────────────────────────────────────────

interface QueuedJob {
  id: string;
  type: string;
  queued_at: string;
  queued_by?: string;
}

interface CompletedJob {
  id: string;
  type: string;
  started_at: string;
  completed_at: string;
  duration_s: number;
  status: "completed" | "failed";
}

interface RunningJob {
  id: string;
  type: string;
  pid: number;
  started_at: string;
}

interface QueueState {
  queued: QueuedJob[];
  completed: CompletedJob[];
}

// ─── Queue helpers ───────────────────────────────────────────────────────────

function readQueue(): QueueState {
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      return JSON.parse(fs.readFileSync(QUEUE_FILE, "utf-8"));
    }
  } catch { /* corrupt file */ }
  return { queued: [], completed: [] };
}

function writeQueue(state: QueueState): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(state, null, 2));
}

function getRunning(): RunningJob | null {
  if (!fs.existsSync(LOCK_FILE)) return null;
  try {
    const content = JSON.parse(fs.readFileSync(LOCK_FILE, "utf-8"));
    // Check if the PID is actually still alive
    try {
      process.kill(content.pid, 0);
      return {
        id: content.id || `${content.type}-${content.pid}`,
        type: content.type,
        pid: content.pid,
        started_at: content.started,
      };
    } catch {
      // Process is dead — stale lock, clean up
      fs.unlinkSync(LOCK_FILE);
      return null;
    }
  } catch {
    try { fs.unlinkSync(LOCK_FILE); } catch { /* ignore */ }
    return null;
  }
}

// ─── Start a pipeline job ────────────────────────────────────────────────────

function startJob(jobId: string, type: string): number {
  const scriptPath = path.join(
    process.cwd(),
    "..",
    "deploy",
    "run-pulse.sh"
  );

  const startedAt = new Date().toISOString();

  const child = execFile(
    "bash",
    [scriptPath, type],
    {
      env: { ...process.env, PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin" },
      timeout: 600_000, // 10 min
    },
    (error, _stdout, stderr) => {
      const completedAt = new Date().toISOString();
      const durationS = Math.round((Date.now() - new Date(startedAt).getTime()) / 1000);

      if (error) {
        console.error(`[run] ${type} pipeline error:`, stderr || error.message);
      } else {
        console.log(`[run] ${type} pipeline completed (${durationS}s)`);
      }

      // Record completion
      const queue = readQueue();
      queue.completed.unshift({
        id: jobId,
        type,
        started_at: startedAt,
        completed_at: completedAt,
        duration_s: durationS,
        status: error ? "failed" : "completed",
      });
      // Keep last 50 completed
      queue.completed = queue.completed.slice(0, 50);

      // Dispatch next from queue (if any)
      if (queue.queued.length > 0) {
        const next = queue.queued.shift()!;
        writeQueue(queue);
        console.log(`[queue] Dispatching next job: ${next.type} (${next.id})`);
        const nextPid = startJob(next.id, next.type);
        // Update lock with new job
        fs.writeFileSync(
          LOCK_FILE,
          JSON.stringify({ id: next.id, pid: nextPid, type: next.type, started: new Date().toISOString() })
        );
      } else {
        writeQueue(queue);
        // No more jobs — remove lock
        try { fs.unlinkSync(LOCK_FILE); } catch { /* ignore */ }
      }
    }
  );

  return child.pid!;
}

// ─── GET /api/run — queue status ─────────────────────────────────────────────

export async function GET() {
  const running = getRunning();
  const queue = readQueue();

  return NextResponse.json({
    running,
    queued: queue.queued,
    completed: queue.completed.slice(0, 20),
  });
}

// ─── POST /api/run — trigger or queue a pipeline ─────────────────────────────

export async function POST(request: NextRequest) {
  let body: { type?: string; user_id?: string };
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

  const jobId = `${type}-${Date.now()}`;
  const running = getRunning();

  if (running) {
    // Pipeline already running — add to queue
    const queue = readQueue();

    // Prevent duplicate queue entries (same type already queued)
    const alreadyQueued = queue.queued.find((j) => j.type === type);
    if (alreadyQueued) {
      return NextResponse.json(
        {
          ok: true,
          queued: true,
          position: queue.queued.indexOf(alreadyQueued) + 1,
          message: `${type} already in queue (position ${queue.queued.indexOf(alreadyQueued) + 1})`,
        },
        { status: 202 }
      );
    }

    queue.queued.push({
      id: jobId,
      type,
      queued_at: new Date().toISOString(),
      queued_by: body.user_id,
    });
    writeQueue(queue);

    const position = queue.queued.length;
    console.log(`[queue] ${type} queued at position ${position} (${jobId})`);

    return NextResponse.json(
      {
        ok: true,
        queued: true,
        position,
        id: jobId,
        message: `${type} queued (position ${position}). Currently running: ${running.type}`,
      },
      { status: 202 }
    );
  }

  // No pipeline running — start immediately
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const pid = startJob(jobId, type);

  // Write lock file
  fs.writeFileSync(
    LOCK_FILE,
    JSON.stringify({ id: jobId, pid, type, started: new Date().toISOString() })
  );

  console.log(`[run] ${type} pipeline started (PID ${pid}, ${jobId})`);

  return NextResponse.json(
    { ok: true, queued: false, type, pid, id: jobId, message: `${type} pipeline started` },
    { status: 202 }
  );
}
