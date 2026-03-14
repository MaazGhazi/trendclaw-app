import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";

/**
 * HTTP-level cache for blog page fetching.
 * Stores ETag and Last-Modified headers per URL so fetchPage()
 * can send conditional requests and skip unchanged pages (304).
 */

const CACHE_PATH = join(
  process.env.SCRAPER_OUTPUT_DIR ?? join(process.cwd(), "output"),
  ".social-trends-cache.json",
);

interface PageCacheEntry {
  etag?: string;
  lastModified?: string;
  lastFetchedAt: string;
}

type CacheData = Record<string, PageCacheEntry>;

let cache: CacheData | null = null;

function loadCache(): CacheData {
  if (cache) return cache;
  try {
    cache = JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
    return cache!;
  } catch {
    cache = {};
    return cache;
  }
}

function saveCache(): void {
  if (!cache) return;
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

/** Get conditional request headers for a URL (If-None-Match / If-Modified-Since) */
export function getConditionalHeaders(url: string): Record<string, string> {
  const data = loadCache();
  const entry = data[url];
  if (!entry) return {};

  const headers: Record<string, string> = {};
  if (entry.etag) headers["If-None-Match"] = entry.etag;
  if (entry.lastModified) headers["If-Modified-Since"] = entry.lastModified;
  return headers;
}

/** Store response headers after a successful fetch (for next conditional request) */
export function updatePageHeaders(
  url: string,
  etag: string | null,
  lastModified: string | null,
): void {
  const data = loadCache();
  data[url] = {
    etag: etag ?? undefined,
    lastModified: lastModified ?? undefined,
    lastFetchedAt: new Date().toISOString(),
  };
  saveCache();
}
