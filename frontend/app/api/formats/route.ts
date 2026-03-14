import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("social_trend_items")
    .select("source, title, url, description, platform, first_seen_at, last_seen_at")
    .order("last_seen_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by source
  const bySource: Record<string, typeof data> = {};
  for (const row of data ?? []) {
    if (!bySource[row.source]) bySource[row.source] = [];
    bySource[row.source].push(row);
  }

  // Build response grouped by source with platform counts
  const sources = Object.entries(bySource).map(([name, items]) => {
    const platforms = [...new Set(items.map((i) => i.platform).filter(Boolean))];
    return {
      name,
      platforms,
      itemCount: items.length,
      items: items.map((i) => ({
        title: i.title,
        url: i.url,
        description: i.description,
        platform: i.platform,
        firstSeenAt: i.first_seen_at,
        lastSeenAt: i.last_seen_at,
        isNew:
          new Date(i.first_seen_at).getTime() >
          Date.now() - 7 * 24 * 60 * 60 * 1000, // new if first seen < 7 days ago
      })),
    };
  });

  return NextResponse.json({
    sources,
    totalItems: data?.length ?? 0,
    updatedAt: new Date().toISOString(),
  });
}
