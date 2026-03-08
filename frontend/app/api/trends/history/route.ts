import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const fileParam = request.nextUrl.searchParams.get("file");

  const supabase = await createClient();

  // If a specific run is requested, return its contents
  if (fileParam) {
    // fileParam could be "pulse-<id>" or just the raw id
    // Extract id: strip leading "type-" prefix (pulse-, digest-, deep_dive-)
    const id = fileParam.replace(/^(pulse|digest|deep_dive)-/, "");

    const { data: row, error } = await supabase
      .from("trend_runs")
      .select("id, run_type, region, data, created_at")
      .eq("id", id)
      .single();

    if (error || !row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      file: `${row.run_type}-${row.id}`,
      data: row.data?.data || row.data,
      region: row.region || "global",
    });
  }

  // List all runs
  try {
    const { data: rows, error } = await supabase
      .from("trend_runs")
      .select("id, run_type, region, data, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ runs: [] });
    }

    const enrichedRuns = (rows || []).map((row) => {
      const data = row.data?.data || row.data;
      const categories = data?.categories || [];
      const trendCount = categories.reduce(
        (sum: number, cat: { trends?: unknown[] }) => sum + (cat.trends?.length || 0),
        0
      );
      const sourcesOk = data?.data_quality?.sources_ok ?? 0;
      const totalItems = data?.data_quality?.total_raw_items ?? 0;
      const failed = trendCount === 0 && sourcesOk === 0;

      return {
        file: `${row.run_type}-${row.id}`,
        type: row.run_type,
        region: row.region || "global",
        created: row.created_at,
        data_quality: {
          sources_ok: sourcesOk,
          total_items: totalItems,
          trend_count: trendCount,
        },
        failed,
      };
    });

    return NextResponse.json({ runs: enrichedRuns });
  } catch {
    return NextResponse.json({ runs: [] });
  }
}
