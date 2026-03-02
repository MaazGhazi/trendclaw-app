import { newPage } from "./browser.js";
import type { RunType, ScrapedItem, SourceResult } from "../types.js";

async function collectViaAPI(): Promise<ScrapedItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(
      "https://ads.tiktok.com/creative_radar_api/v1/popular/hashtag/list?page=1&limit=20&period=7&country_code=US",
      {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
          "Accept": "application/json",
          "Referer": "https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en",
        },
      }
    );
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`TikTok API returned ${res.status}`);
    const data = await res.json();

    if (data.code !== 0 || !data.data?.list) {
      throw new Error(`TikTok API error: ${data.msg ?? "no data"}`);
    }

    const items: ScrapedItem[] = [];
    for (const entry of data.data.list.slice(0, 20)) {
      items.push({
        title: `#${entry.hashtag_name}`,
        views: entry.publish_cnt ?? undefined,
        description: entry.video_views ? `${formatCount(entry.video_views)} video views` : undefined,
        category: "hashtag",
      });
    }

    return items;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

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
    await page.close();
  }

  return items;
}

export async function collect(_runType: RunType): Promise<SourceResult> {
  let items: ScrapedItem[] = [];
  let method = "api";

  // Try Creative Center API first (fast, no browser needed)
  try {
    items = await collectViaAPI();
  } catch (apiErr) {
    // Fall back to Playwright scraping
    method = "playwright";
    try {
      items = await collectViaPlaywright();
    } catch (pwErr) {
      return {
        source: "TikTok Creative Center",
        status: "error",
        error: `API failed: ${String(apiErr)}; Playwright failed: ${String(pwErr)}`,
        items: [],
        scrapedAt: new Date().toISOString(),
      };
    }
  }

  return {
    source: "TikTok Creative Center",
    status: items.length > 0 ? "ok" : "error",
    error: items.length === 0 ? `No trends found via ${method}` : undefined,
    items,
    scrapedAt: new Date().toISOString(),
  };
}

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
