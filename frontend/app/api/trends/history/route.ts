import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(request: NextRequest) {
  const DATA_DIR = path.join(process.cwd(), "data");
  const runId = request.nextUrl.searchParams.get("file");

  // If a specific run is requested, return its contents
  if (runId) {
    const filename = `${runId}.json`;
    const filepath = path.join(DATA_DIR, filename);

    if (!fs.existsSync(filepath)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    try {
      const content = fs.readFileSync(filepath, "utf-8");
      const json = JSON.parse(content);
      return NextResponse.json({
        file: runId,
        data: json.data || json,
        region: json.region || "global",
      });
    } catch {
      return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
    }
  }

  // List all runs from JSON files
  if (!fs.existsSync(DATA_DIR)) {
    return NextResponse.json({ runs: [] });
  }

  try {
    const files = fs
      .readdirSync(DATA_DIR)
      .filter((f) => f.endsWith(".json") && !f.startsWith("progress") && !f.startsWith("run") && !f.startsWith("queue"))
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(DATA_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .map((f) => f.name);

    const enrichedRuns = files.map((file) => {
      try {
        const content = fs.readFileSync(path.join(DATA_DIR, file), "utf-8");
        const json = JSON.parse(content);
        const categories = json.data?.categories || json.categories || [];
        const trendCount = categories.reduce(
          (sum: number, cat: { trends?: unknown[] }) => sum + (cat.trends?.length || 0),
          0
        );
        const sourcesOk = json.data?.data_quality?.sources_ok ?? json.data_quality?.sources_ok ?? 0;
        const totalItems = json.data?.data_quality?.total_raw_items ?? json.data_quality?.total_raw_items ?? 0;
        const failed = !!json.parse_error || (trendCount === 0 && sourcesOk === 0);

        return {
          file: file.replace(".json", ""),
          type: json.type || file.split("-")[0],
          region: json.region || "global",
          created: json.created_at || new Date(fs.statSync(path.join(DATA_DIR, file)).mtime).toISOString(),
          data_quality: {
            sources_ok: sourcesOk,
            total_items: totalItems,
            trend_count: trendCount,
          },
          failed,
        };
      } catch {
        return null;
      }
    }).filter(Boolean);

    return NextResponse.json({ runs: enrichedRuns });
  } catch {
    return NextResponse.json({ runs: [] });
  }
}
