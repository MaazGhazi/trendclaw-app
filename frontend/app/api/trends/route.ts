import { NextRequest, NextResponse } from "next/server";
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
    .filter((f) => f.endsWith(".json") && !f.startsWith("progress") && !f.startsWith("run") && !f.startsWith("queue"))
    .sort()
    .reverse();

  if (files.length > MAX_FILES) {
    for (const file of files.slice(MAX_FILES)) {
      fs.unlinkSync(path.join(DATA_DIR, file));
    }
  }
}

// POST — webhook receiver
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

// GET — return latest trends from JSON files
export async function GET() {
  if (!fs.existsSync(DATA_DIR)) {
    return NextResponse.json({ error: "No trend data yet" }, { status: 404 });
  }

  try {
    const files = fs
      .readdirSync(DATA_DIR)
      .filter((f) => f.endsWith(".json") && !f.startsWith("progress") && !f.startsWith("run") && !f.startsWith("queue"))
      .sort()
      .reverse();

    if (files.length === 0) {
      return NextResponse.json({ error: "No trend data yet" }, { status: 404 });
    }

    const latestFile = files[0];
    const content = fs.readFileSync(path.join(DATA_DIR, latestFile), "utf-8");
    const json = JSON.parse(content);

    return NextResponse.json(
      {
        file: latestFile.replace(".json", ""),
        data: json.data || json,
        region: json.region || "global",
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to read trends", detail: String(e) },
      { status: 500 }
    );
  }
}
