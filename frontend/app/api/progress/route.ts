import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PROGRESS_FILE = path.join(process.cwd(), "data", "progress.json");

export async function GET() {
  if (!fs.existsSync(PROGRESS_FILE)) {
    return NextResponse.json(
      { error: "No pipeline run in progress" },
      { status: 404 }
    );
  }

  try {
    const content = fs.readFileSync(PROGRESS_FILE, "utf-8");
    const data = JSON.parse(content);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to read progress data" },
      { status: 500 }
    );
  }
}
