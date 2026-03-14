import type { RunType, SourceResult } from "../../types.js";
import { trackAndTagItems } from "./supabase-cache.js";
import * as ramdam from "./ramdam.js";
import * as later from "./later.js";
import * as quso from "./quso.js";
import * as socialbee from "./socialbee.js";
import * as socialpilot from "./socialpilot.js";
import * as bluebear from "./bluebear.js";

// ─── Source registry ────────────────────────────────────────────

interface BlogSource {
  name: string;
  collect: (rt: RunType) => Promise<SourceResult>;
}

const SOURCES: BlogSource[] = [
  { name: "ramdam", collect: ramdam.collect },
  { name: "later", collect: later.collect },
  { name: "quso", collect: quso.collect },
  { name: "socialbee", collect: socialbee.collect },
  { name: "socialpilot", collect: socialpilot.collect },
  { name: "bluebear", collect: bluebear.collect },
];

// ─── Public API ─────────────────────────────────────────────────

/**
 * Collect all social trend blog pages.
 *
 * - Runs all sources in parallel (HTTP 304 skips unchanged pages)
 * - Tracks items in Supabase (new vs recurring)
 * - Tags each item with isNew + firstSeenAt for the agent
 * - Always passes ALL items through (frontend keeps showing trends)
 */
export async function collect(runType: RunType): Promise<SourceResult> {
  const results = await Promise.allSettled(
    SOURCES.map((s) => s.collect(runType)),
  );

  const fulfilled = results
    .filter((r): r is PromiseFulfilledResult<SourceResult> => r.status === "fulfilled");

  // Tag each item with its source name for Supabase storage
  const allItems = fulfilled.flatMap((r) =>
    r.value.items.map((item) => ({
      ...item,
      extra: { ...item.extra, sourceName: r.value.source },
    })),
  );

  const errors = fulfilled
    .filter((r) => r.value.status === "error")
    .map((r) => `${r.value.source}: ${r.value.error}`);

  // Log per-source counts
  for (const r of fulfilled) {
    const icon = r.value.status === "ok" ? "✅" : "❌";
    console.log(`   ${icon} ${r.value.source}: ${r.value.items.length} items`);
  }

  // Track in Supabase and tag new vs recurring
  const taggedItems = await trackAndTagItems(allItems);

  return {
    source: "Social Trend Blogs",
    status: taggedItems.length > 0 ? "ok" : "error",
    error: errors.length > 0 ? errors.join("; ") : undefined,
    items: taggedItems,
    scrapedAt: new Date().toISOString(),
  };
}
