import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

const EXCLUDED_FILES = new Set(["progress.json", "run.lock"]);

// Parse type and timestamp from filename like "deep_dive-2026-03-02T05-12-31-084Z.json"
function parseFilename(f: string) {
  const base = f.replace(".json", "");
  // Type is everything before the first YYYY pattern
  const match = base.match(/^(.+?)-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/);
  if (!match) return { type: base.split("-")[0], timestamp: "" };
  const [, type, y, mo, d, h, mi, s, ms] = match;
  return { type, timestamp: `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}Z` };
}

export async function GET(request: NextRequest) {
  if (!fs.existsSync(DATA_DIR)) {
    return NextResponse.json({ runs: [] });
  }

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json") && !EXCLUDED_FILES.has(f));

  const fileParam = request.nextUrl.searchParams.get("file");

  // If a specific file is requested, return its contents
  if (fileParam) {
    const safeName = path.basename(fileParam);
    const filePath = path.join(DATA_DIR, safeName);
    if (!fs.existsSync(filePath) || !safeName.endsWith(".json") || EXCLUDED_FILES.has(safeName)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const content = fs.readFileSync(filePath, "utf-8");
    return NextResponse.json({ file: safeName, data: JSON.parse(content) });
  }

  // Build enriched run list
  const runs = files.map((f) => {
    const filePath = path.join(DATA_DIR, f);
    const stat = fs.statSync(filePath);
    const { type, timestamp } = parseFilename(f);

    let data_quality: { sources_ok: number; total_items: number; trend_count: number } | undefined;
    let failed = false;
    try {
      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const categories = content.categories || [];
      const trendCount = categories.reduce(
        (sum: number, cat: { trends?: unknown[] }) => sum + (cat.trends?.length || 0),
        0
      );
      const sourcesOk = content.data_quality?.sources_ok ?? 0;
      const totalItems = content.data_quality?.total_raw_items ?? 0;

      data_quality = {
        sources_ok: sourcesOk,
        total_items: totalItems,
        trend_count: trendCount,
      };

      // Mark as failed if parse error or zero trends with zero sources
      failed = !!content.parse_error || (trendCount === 0 && sourcesOk === 0);
    } catch {
      failed = true;
    }

    return {
      file: f,
      type,
      size: stat.size,
      created: timestamp || stat.birthtime.toISOString(),
      data_quality,
      failed,
    };
  });

  // Sort by timestamp descending (newest first)
  runs.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());

  return NextResponse.json({ runs });
}
