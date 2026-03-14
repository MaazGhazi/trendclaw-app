import { createHash } from "crypto";
import type { ScrapedItem } from "../../types.js";

/**
 * Supabase-backed item tracking for social trend scraping.
 *
 * On each scrape:
 * 1. Queries existing items by hash to know what's already been seen
 * 2. UPSERTs all items (updates last_seen_at, preserves first_seen_at)
 * 3. Tags each item with isNew + firstSeenAt for the agent
 *
 * Falls back gracefully if Supabase is unavailable.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function hashItem(item: ScrapedItem): string {
  const key = `${item.title}|${item.url ?? ""}`;
  return createHash("md5").update(key).digest("hex");
}

async function supabaseGet(path: string): Promise<any[] | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(`[supabase-cache] GET ${res.status}: ${await res.text()}`);
      return null;
    }
    return res.json();
  } catch (e) {
    console.warn(`[supabase-cache] GET failed: ${e}`);
    return null;
  }
}

async function supabasePost(path: string, body: any[], headers?: Record<string, string>): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`[supabase-cache] POST ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[supabase-cache] POST failed: ${e}`);
    return false;
  }
}

/**
 * Track items in Supabase and tag each with isNew + firstSeenAt.
 * Returns ALL items (tagged), never filters them out.
 * If Supabase is unavailable, returns items untagged.
 */
export async function trackAndTagItems(items: ScrapedItem[]): Promise<ScrapedItem[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log("   ⚠️  Supabase not configured — skipping trend tracking");
    return items;
  }

  if (items.length === 0) return items;

  // 1. Compute hashes for all items
  const itemHashes = new Map<string, ScrapedItem>();
  for (const item of items) {
    itemHashes.set(hashItem(item), item);
  }
  const hashes = [...itemHashes.keys()];

  // 2. Query Supabase for existing items (batch in chunks to avoid URL length limits)
  const existingMap = new Map<string, string>(); // hash → first_seen_at

  for (let i = 0; i < hashes.length; i += 80) {
    const batch = hashes.slice(i, i + 80);
    const query = `social_trend_items?content_hash=in.(${batch.join(",")})&select=content_hash,first_seen_at`;
    const rows = await supabaseGet(query);
    if (rows) {
      for (const row of rows) {
        existingMap.set(row.content_hash, row.first_seen_at);
      }
    }
  }

  // 3. UPSERT all items into Supabase
  //    - Don't send first_seen_at → DB default preserves it for existing rows
  //    - Send last_seen_at → marks item as still active
  const now = new Date().toISOString();
  const upsertRows = hashes.map((hash) => {
    const item = itemHashes.get(hash)!;
    const extra = (item.extra ?? {}) as Record<string, unknown>;
    return {
      content_hash: hash,
      source: (extra.sourceName as string) ?? "Social Trend Blogs",
      title: item.title.slice(0, 500),
      url: item.url ?? null,
      description: item.description?.slice(0, 1000) ?? null,
      platform: (extra.platform as string) ?? null,
      last_seen_at: now,
    };
  });

  // Batch upsert in chunks of 80
  for (let i = 0; i < upsertRows.length; i += 80) {
    const batch = upsertRows.slice(i, i + 80);
    await supabasePost("social_trend_items", batch);
  }

  // 4. Tag items with isNew + firstSeenAt
  let newCount = 0;
  const taggedItems: ScrapedItem[] = items.map((item) => {
    const hash = hashItem(item);
    const isNew = !existingMap.has(hash);
    if (isNew) newCount++;

    return {
      ...item,
      extra: {
        ...item.extra,
        isNew,
        firstSeenAt: existingMap.get(hash) ?? now,
      },
    };
  });

  console.log(`   📊 Supabase: ${newCount} new, ${items.length - newCount} recurring`);
  return taggedItems;
}
