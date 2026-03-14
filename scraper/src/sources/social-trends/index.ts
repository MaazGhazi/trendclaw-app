import type { RunType, SourceResult } from "../../types.js";
import { collectRssFeeds } from "./rss-feeds.js";
import { filterNewPageItems } from "./content-cache.js";
import * as later from "./later.js";
import * as newEngen from "./new-engen.js";
import * as socialbee from "./socialbee.js";
import * as heyorca from "./heyorca.js";
import * as ramdam from "./ramdam.js";

// ─── HTML blog scrapers ─────────────────────────────────────────

interface BlogSource {
  name: string;
  collect: (rt: RunType) => Promise<SourceResult>;
}

const BLOG_SOURCES: BlogSource[] = [
  { name: "later", collect: later.collect },
  { name: "new-engen", collect: newEngen.collect },
  { name: "socialbee", collect: socialbee.collect },
  { name: "heyorca", collect: heyorca.collect },
  { name: "ramdam", collect: ramdam.collect },
];

// ─── Public API ─────────────────────────────────────────────────

/** Collect all HTML-scraped blog trend pages (deep_dive only) */
export async function collect(runType: RunType): Promise<SourceResult> {
  const results = await Promise.allSettled(
    BLOG_SOURCES.map((s) => s.collect(runType)),
  );

  // Merge all items from fulfilled sources
  const allItems = results
    .filter((r): r is PromiseFulfilledResult<SourceResult> => r.status === "fulfilled")
    .flatMap((r) => r.value.items);

  const errors = results
    .filter((r): r is PromiseFulfilledResult<SourceResult> => r.status === "fulfilled")
    .filter((r) => r.value.status === "error")
    .map((r) => `${r.value.source}: ${r.value.error}`);

  // Item-level dedup for blog pages (catches partial page updates)
  const newItems = filterNewPageItems("__blog_combined__", allItems);

  return {
    source: "Social Trend Blogs",
    status: allItems.length > 0 || newItems.length > 0 ? "ok" : "error",
    error: errors.length > 0 ? errors.join("; ") : undefined,
    items: newItems,
    scrapedAt: new Date().toISOString(),
  };
}

/** Collect all social trend RSS feeds (blogs + newsletters) */
export async function collectRss(runType: RunType): Promise<SourceResult[]> {
  // Date-based dedup is handled inside rss-feeds.ts per feed
  return collectRssFeeds(runType);
}
