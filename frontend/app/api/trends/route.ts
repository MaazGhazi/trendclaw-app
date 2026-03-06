import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const MAX_FILES = 100;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function pruneOldFiles() {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("progress") && !f.startsWith("run"))
    .sort()
    .reverse();

  if (files.length > MAX_FILES) {
    for (const file of files.slice(MAX_FILES)) {
      fs.unlinkSync(path.join(DATA_DIR, file));
    }
  }
}

// POST — webhook receiver (kept for backward compatibility)
export async function POST(request: NextRequest) {
  const token = process.env.OPENCLAW_HOOKS_TOKEN;
  if (token) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${token}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = (body.type as string) || "pulse";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${type}-${timestamp}.json`;

  ensureDataDir();
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(body, null, 2));
  pruneOldFiles();

  return NextResponse.json({ ok: true, file: filename }, { status: 201 });
}

// GET — return latest trends for the logged-in user's region
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // RLS policy filters by user's region automatically
  const { data, error } = await supabase
    .from("trend_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "No trend data yet" }, { status: 404 });
  }

  return NextResponse.json({
    file: `${data.run_type}-${data.id}`,
    data: data.data,
    region: data.region,
  });
}
