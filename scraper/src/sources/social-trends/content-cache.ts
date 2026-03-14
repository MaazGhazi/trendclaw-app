import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { createHash } from "crypto";
import type { ScrapedItem } from "../../types.js";

const CACHE_PATH = join(
  process.env.SCRAPER_OUTPUT_DIR ?? join(process.cwd(), "output"),
  ".social-trends-cache.json",
);

// ─── Types ──────────────────────────────────────────────────────

interface PageCacheEntry {
  /** ETag header from last response */
  etag?: string;
  /** Last-Modified header from last response */
  lastModified?: string;
  /** MD5 hashes of items we've already seen from this URL */
  seenHashes: string[];
  /** When we last fetched this URL */
  lastFetchedAt: string;
}

interface FeedCacheEntry {
  /** ISO timestamp of the most recent item we've seen */
  latestItemDate?: string;
  /** Fallback: hashes for items without dates */
  seenHashes: string[];
  /** When we last fetched this feed */
  lastFetchedAt: string;
}

interface CacheData {
  pages: Record<string, PageCacheEntry>;
  feeds: Record<string, FeedCacheEntry>;
}

// Keep hashes for 14 days max to prevent unbounded growth
const MAX_HASHES_PER_URL = 200;

// ─── Cache I/O ──────────────────────────────────────────────────

let cache: CacheData | null = null;

function loadCache(): CacheData {
  if (cache) return cache;
  try {
    cache = JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
    return cache!;
  } catch {
    cache = { pages: {}, feeds: {} };
    return cache;
  }
}

function saveCache(): void {
  if (!cache) return;
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

function hashItem(item: ScrapedItem): string {
  const key = `${item.title}|${item.url ?? ""}`;
  return createHash("md5").update(key).digest("hex");
}

// ─── Page cache (for HTML blog scraping) ────────────────────────

/** Get conditional request headers for a blog page URL */
export function getConditionalHeaders(url: string): Record<string, string> {
  const data = loadCache();
  const entry = data.pages[url];
  if (!entry) return {};

  const headers: Record<string, string> = {};
  if (entry.etag) headers["If-None-Match"] = entry.etag;
  if (entry.lastModified) headers["If-Modified-Since"] = entry.lastModified;
  return headers;
}

/** Store response headers after a successful page fetch */
export function updatePageHeaders(
  url: string,
  etag: string | null,
  lastModified: string | null,
): void {
  const data = loadCache();
  if (!data.pages[url]) {
    data.pages[url] = { seenHashes: [], lastFetchedAt: new Date().toISOString() };
  }
  if (etag) data.pages[url].etag = etag;
  if (lastModified) data.pages[url].lastModified = lastModified;
  data.pages[url].lastFetchedAt = new Date().toISOString();
  saveCache();
}

/** Filter blog items to only those not seen before. Updates the cache. */
export function filterNewPageItems(url: string, items: ScrapedItem[]): ScrapedItem[] {
  const data = loadCache();
  if (!data.pages[url]) {
    data.pages[url] = { seenHashes: [], lastFetchedAt: new Date().toISOString() };
  }
  const entry = data.pages[url];
  const seenSet = new Set(entry.seenHashes);
  const newItems: ScrapedItem[] = [];

  for (const item of items) {
    const hash = hashItem(item);
    if (!seenSet.has(hash)) {
      newItems.push(item);
      seenSet.add(hash);
    }
  }

  // Update stored hashes (keep bounded)
  entry.seenHashes = [...seenSet].slice(-MAX_HASHES_PER_URL);
  entry.lastFetchedAt = new Date().toISOString();
  saveCache();

  return newItems;
}

// ─── Feed cache (for RSS feeds) ────────────────────────────────

/** Filter RSS items to only those newer than what we've seen. Updates the cache. */
export function filterNewFeedItems(feedUrl: string, items: ScrapedItem[]): ScrapedItem[] {
  const data = loadCache();
  if (!data.feeds[feedUrl]) {
    data.feeds[feedUrl] = { seenHashes: [], lastFetchedAt: new Date().toISOString() };
  }
  const entry = data.feeds[feedUrl];

  // Strategy 1: Date-based filtering (primary for RSS)
  const cutoffDate = entry.latestItemDate ? new Date(entry.latestItemDate).getTime() : 0;
  let maxDate = cutoffDate;

  // Strategy 2: Hash-based fallback for items without dates
  const seenSet = new Set(entry.seenHashes);

  const newItems: ScrapedItem[] = [];

  for (const item of items) {
    // Try date-based check first
    if (item.publishedAt) {
      const itemDate = new Date(item.publishedAt).getTime();
      if (!isNaN(itemDate)) {
        if (itemDate > cutoffDate) {
          newItems.push(item);
        }
        if (itemDate > maxDate) {
          maxDate = itemDate;
        }
        continue;
      }
    }

    // Fallback: hash-based check for items without valid dates
    const hash = hashItem(item);
    if (!seenSet.has(hash)) {
      newItems.push(item);
      seenSet.add(hash);
    }
  }

  // Update cache
  if (maxDate > cutoffDate) {
    entry.latestItemDate = new Date(maxDate).toISOString();
  }
  entry.seenHashes = [...seenSet].slice(-MAX_HASHES_PER_URL);
  entry.lastFetchedAt = new Date().toISOString();
  saveCache();

  return newItems;
}
