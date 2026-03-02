import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

const EXCLUDED_FILES = new Set(["progress.json", "run.lock"]);

export async function GET(request: NextRequest) {
  if (!fs.existsSync(DATA_DIR)) {
    return NextResponse.json({ runs: [] });
  }

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json") && !EXCLUDED_FILES.has(f))
    .sort()
    .reverse();

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

  // Otherwise return the list of runs with enriched data_quality
  const runs = files.map((f) => {
    const filePath = path.join(DATA_DIR, f);
    const stat = fs.statSync(filePath);
    const parts = f.replace(".json", "").split("-");
    const type = parts[0];

    // Try to read data_quality from the file
    let data_quality: { sources_ok: number; total_items: number } | undefined;
    try {
      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (content.data_quality) {
        data_quality = {
          sources_ok: content.data_quality.sources_ok ?? 0,
          total_items: content.data_quality.total_raw_items ?? 0,
        };
      }
    } catch {
      // skip enrichment if file can't be parsed
    }

    return {
      file: f,
      type,
      size: stat.size,
      created: stat.birthtime.toISOString(),
      data_quality,
    };
  });

  return NextResponse.json({ runs });
}
