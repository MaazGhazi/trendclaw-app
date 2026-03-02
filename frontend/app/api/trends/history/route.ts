import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

export async function GET(request: NextRequest) {
  if (!fs.existsSync(DATA_DIR)) {
    return NextResponse.json({ runs: [] });
  }

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();

  const fileParam = request.nextUrl.searchParams.get("file");

  // If a specific file is requested, return its contents
  if (fileParam) {
    const filePath = path.join(DATA_DIR, fileParam);
    if (!fs.existsSync(filePath) || !fileParam.endsWith(".json")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const content = fs.readFileSync(filePath, "utf-8");
    return NextResponse.json({ file: fileParam, data: JSON.parse(content) });
  }

  // Otherwise return the list of runs
  const runs = files.map((f) => {
    const stat = fs.statSync(path.join(DATA_DIR, f));
    const parts = f.replace(".json", "").split("-");
    const type = parts[0];
    return {
      file: f,
      type,
      size: stat.size,
      created: stat.birthtime.toISOString(),
    };
  });

  return NextResponse.json({ runs });
}
