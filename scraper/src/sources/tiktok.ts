import { newPage } from "./browser.js";
import type { RunType, ScrapedItem, SourceResult } from "../types.js";

export async function collect(_runType: RunType): Promise<SourceResult> {
  const items: ScrapedItem[] = [];

  try {
    const page = await newPage();

    // TikTok Creative Center - publicly accessible trending hashtags
    await page.goto(
      "https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en",
      { waitUntil: "networkidle", timeout: 45000 }
    );

    // Wait for JS rendering
    await page.waitForTimeout(4000 + Math.random() * 3000);

    // Scroll down to trigger lazy loading
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(1500);

    // Try to extract trending hashtags
    // The page structure can change, so we try multiple selectors
    const rows = await page.$$(
      "tr[class*='Row'], div[class*='hashtag-card'], div[class*='CardPc']"
    );

    for (const row of rows.slice(0, 20)) {
      try {
        const text = (await row.textContent())?.trim() ?? "";
        if (text.length < 5) continue;

        // Try to extract hashtag name and view count
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

    // Fallback: extract from page source if DOM parsing fails
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

    await page.close();

    return {
      source: "TikTok Creative Center",
      status: items.length > 0 ? "ok" : "error",
      error: items.length === 0 ? "Could not parse TikTok trends (possible bot block)" : undefined,
      items,
      scrapedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      source: "TikTok Creative Center",
      status: "error",
      error: String(e),
      items,
      scrapedAt: new Date().toISOString(),
    };
  }
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
