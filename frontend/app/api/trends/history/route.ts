import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const runId = request.nextUrl.searchParams.get("file");

  // If a specific run is requested, return its contents
  if (runId) {
    // Extract UUID from the "type-uuid" format
    const id = runId.includes("-") ? runId.substring(runId.indexOf("-") + 1) : runId;

    const { data, error } = await supabase
      .from("trend_runs")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      file: `${data.run_type}-${data.id}`,
      data: data.data,
      region: data.region,
    });
  }

  // List all runs (RLS filters by user's region)
  const { data: runs, error } = await supabase
    .from("trend_runs")
    .select("id, region, run_type, created_at, data")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }

  const enrichedRuns = (runs || []).map((run) => {
    const categories = run.data?.categories || [];
    const trendCount = categories.reduce(
      (sum: number, cat: { trends?: unknown[] }) => sum + (cat.trends?.length || 0),
      0
    );
    const sourcesOk = run.data?.data_quality?.sources_ok ?? 0;
    const totalItems = run.data?.data_quality?.total_raw_items ?? 0;
    const failed = !!run.data?.parse_error || (trendCount === 0 && sourcesOk === 0);

    return {
      file: `${run.run_type}-${run.id}`,
      type: run.run_type,
      region: run.region,
      created: run.created_at,
      data_quality: {
        sources_ok: sourcesOk,
        total_items: totalItems,
        trend_count: trendCount,
      },
      failed,
    };
  });

  return NextResponse.json({ runs: enrichedRuns });
}
