import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const supabase = await createClient();
  const { error } = await supabase.from("trend_runs").insert({
    run_type: (body.type as string) || "pulse",
    region: (body.region as string) || "global",
    data: body,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

// GET — return latest trends from Supabase
export async function GET() {
  try {
    const supabase = await createClient();

    const { data: row, error } = await supabase
      .from("trend_runs")
      .select("id, run_type, region, data, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !row) {
      return NextResponse.json({ error: "No trend data yet" }, { status: 404 });
    }

    return NextResponse.json({
      file: `${row.run_type}-${row.id}`,
      data: row.data?.data || row.data,
      region: row.region || "global",
    });
  } catch {
    return NextResponse.json({ error: "Failed to read trends" }, { status: 500 });
  }
}
