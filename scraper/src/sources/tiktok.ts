import { newPage, safeClosePage } from "./browser.js";
import type { RunType, ScrapedItem, SourceResult } from "../types.js";
import { getUserConfig } from "../user-config.js";

// ---------------------------------------------------------------------------
// Endpoint definitions
// ---------------------------------------------------------------------------

type EndpointType = "hashtag" | "music" | "creator" | "video";

interface EndpointConfig {
  type: EndpointType;
  path: string;
  refererSlug: string;
  mapItem: (entry: Record<string, any>) => ScrapedItem;
}

const ENDPOINTS: EndpointConfig[] = [
  {
    type: "hashtag",
    path: "/popular/hashtag/list",
    refererSlug: "hashtag",
    mapItem: (e) => ({
      title: `#${e.hashtag_name}`,
      views: e.publish_cnt ?? undefined,
      description: e.video_views
        ? `${formatCount(e.video_views)} video views`
        : undefined,
      category: "hashtag",
    }),
  },
  {
    type: "music",
    path: "/popular/music/list",
    refererSlug: "music",
    mapItem: (e) => ({
      title: e.song_name ?? e.title ?? "Unknown Song",
      description: e.author ? `by ${e.author}` : undefined,
      views: e.play_cnt ?? e.video_cnt ?? undefined,
      category: "song",
      extra: {
        duration: e.duration,
        ...(e.album_name ? { album: e.album_name } : {}),
      },
    }),
  },
  {
    type: "creator",
    path: "/popular/creator/list",
    refererSlug: "creator",
    mapItem: (e) => ({
      title: e.nickname ?? e.creator_name ?? e.unique_id ?? "Unknown Creator",
      url: e.unique_id
        ? `https://www.tiktok.com/@${e.unique_id}`
        : undefined,
      description: e.follower_cnt
        ? `${formatCount(e.follower_cnt)} followers`
        : undefined,
      views: e.like_cnt ?? undefined,
      category: "creator",
      extra: {
        ...(e.unique_id ? { username: e.unique_id } : {}),
        ...(e.follower_cnt ? { followers: e.follower_cnt } : {}),
      },
    }),
  },
  {
    type: "video",
    path: "/popular/video/list",
    refererSlug: "video",
    mapItem: (e) => ({
      title: e.title ?? e.text ?? "Untitled Video",
      url: e.video_link ?? e.item_url ?? undefined,
      views: e.play_cnt ?? e.view_cnt ?? undefined,
      description: buildVideoDescription(e),
      category: "video",
      extra: {
        ...(e.like_cnt ? { likes: e.like_cnt } : {}),
        ...(e.comment_cnt ? { comments: e.comment_cnt } : {}),
        ...(e.share_cnt ? { shares: e.share_cnt } : {}),
      },
    }),
  },
];

function buildVideoDescription(e: Record<string, any>): string | undefined {
  const parts: string[] = [];
  if (e.like_cnt) parts.push(`${formatCount(e.like_cnt)} likes`);
  if (e.comment_cnt) parts.push(`${formatCount(e.comment_cnt)} comments`);
  if (e.share_cnt) parts.push(`${formatCount(e.share_cnt)} shares`);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

// Which endpoints to hit per run type
const ENDPOINTS_BY_RUN_TYPE: Record<RunType, EndpointType[]> = {
  pulse: ["hashtag"],
  digest: ["hashtag", "music", "video"],
  deep_dive: ["hashtag", "music", "creator", "video"],
};

// ---------------------------------------------------------------------------
// API fetcher (generic for all endpoints)
// ---------------------------------------------------------------------------

async function fetchEndpoint(config: EndpointConfig): Promise<ScrapedItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const region = getUserConfig().region;

  try {
    const res = await fetch(
      `https://ads.tiktok.com/creative_radar_api/v1${config.path}?page=1&limit=20&period=7&country_code=${region}`,
      {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
          Accept: "application/json",
          Referer: `https://ads.tiktok.com/business/creativecenter/inspiration/popular/${config.refererSlug}/pc/en`,
        },
      }
    );
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`TikTok ${config.type} API returned ${res.status}`);
    const data = await res.json();

    if (data.code !== 0 || !data.data?.list) {
      throw new Error(`TikTok ${config.type} API error: ${data.msg ?? "no data"}`);
    }

    return data.data.list.slice(0, 20).map(config.mapItem);
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Playwright fallback (hashtags only)
// ---------------------------------------------------------------------------

async function collectViaPlaywright(): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const page = await newPage();

  try {
    await page.goto(
      "https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en",
      { waitUntil: "networkidle", timeout: 45000 }
    );

    await page.waitForTimeout(4000 + Math.random() * 3000);
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(1500);

    const rows = await page.$$(
      "tr[class*='Row'], div[class*='hashtag-card'], div[class*='CardPc']"
    );

    for (const row of rows.slice(0, 20)) {
      try {
        const text = (await row.textContent())?.trim() ?? "";
        if (text.length < 5) continue;

        const lines = text
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        const title = lines.find((l) => l.startsWith("#")) ?? lines[0];
        const viewsLine = lines.find(
          (l) => l.includes("views") || l.includes("posts") || /\d+[KMB]/.test(l)
        );

        items.push({
          title: title ?? text.slice(0, 80),
          description: viewsLine,
          views: parseViewCount(viewsLine),
          category: "hashtag",
        });
      } catch {
        // ok
      }
    }

    if (items.length === 0) {
      const content = await page.content();
      const hashtagMatches = content.match(/#\w+/g) ?? [];
      const unique = [...new Set(hashtagMatches)].slice(0, 20);
      for (const tag of unique) {
        if (tag.length > 2) {
          items.push({ title: tag, category: "hashtag" });
        }
      }
    }
  } finally {
    await safeClosePage(page);
  }

  return items;
}

// ---------------------------------------------------------------------------
// Main collector
// ---------------------------------------------------------------------------

export async function collect(runType: RunType): Promise<SourceResult> {
  const endpointTypes = ENDPOINTS_BY_RUN_TYPE[runType];
  const configs = ENDPOINTS.filter((e) => endpointTypes.includes(e.type));

  // Fetch all applicable endpoints in parallel
  const results = await Promise.allSettled(configs.map((c) => fetchEndpoint(c)));

  const items: ScrapedItem[] = [];
  const errors: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      items.push(...result.value);
    } else {
      errors.push(`${configs[i].type}: ${String(result.reason)}`);
    }
  }

  // If all API calls failed, try Playwright fallback for hashtags
  if (items.length === 0) {
    try {
      const pwItems = await collectViaPlaywright();
      if (pwItems.length > 0) {
        return {
          source: "TikTok Creative Center",
          status: "ok",
          items: pwItems,
          scrapedAt: new Date().toISOString(),
        };
      }
    } catch (pwErr) {
      errors.push(`playwright: ${String(pwErr)}`);
    }

    return {
      source: "TikTok Creative Center",
      status: "error",
      error: errors.join("; "),
      items: [],
      scrapedAt: new Date().toISOString(),
    };
  }

  // Partial or full success
  return {
    source: "TikTok Creative Center",
    status: "ok",
    error: errors.length > 0 ? `Partial failures: ${errors.join("; ")}` : undefined,
    items,
    scrapedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function parseViewCount(text?: string): number | undefined {
  if (!text) return undefined;
  const match = text.match(/([\d.]+)\s*([KMB])/i);
  if (!match) return undefined;
  const num = parseFloat(match[1]);
  const suffix = match[2].toUpperCase();
  const multiplier = suffix === "K" ? 1_000 : suffix === "M" ? 1_000_000 : 1_000_000_000;
  return Math.round(num * multiplier);
}
