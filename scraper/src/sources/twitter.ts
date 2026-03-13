import { newPage, safeClosePage } from "./browser.js";
import type { RunType, ScrapedItem, SourceResult } from "../types.js";
import { getUserConfig } from "../user-config.js";

// trends24.in country slugs
const REGION_TO_SLUG: Record<string, string> = {
  US: "united-states",
  GB: "united-kingdom",
  CA: "canada",
  AU: "australia",
  IN: "india",
  DE: "germany",
  FR: "france",
  JP: "japan",
  BR: "brazil",
  MX: "mexico",
  ZA: "south-africa",
  NG: "nigeria",
  SG: "singapore",
  PH: "philippines",
  ID: "indonesia",
  KR: "south-korea",
  TR: "turkey",
  AR: "argentina",
  CO: "colombia",
  IT: "italy",
  ES: "spain",
};

export async function collect(_runType: RunType): Promise<SourceResult> {
  const items: ScrapedItem[] = [];
  const page = await newPage();

  const region = getUserConfig().region;
  const slug = REGION_TO_SLUG[region];
  const url = slug
    ? `https://trends24.in/${slug}/`
    : "https://trends24.in/";

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
    await page.waitForTimeout(3000 + Math.random() * 2000);

    // trends24.in: multiple .trend-card divs ordered newest-first.
    // Each card has an <ol> with ranked <li><a> trend links.
    // We grab the first card (current hour) only.
    const trendLinks = await page.$$(
      ".trend-card:first-of-type ol li a, " +
      "ol.trend-card__list:first-of-type li a"
    );

    for (const el of trendLinks.slice(0, 30)) {
      try {
        const title = (await el.textContent())?.trim() ?? "";
        if (title.length < 2) continue;

        items.push({
          title,
          url: `https://x.com/search?q=${encodeURIComponent(title)}&src=trend_click`,
          description: "Trending on X (Twitter)",
          category: title.startsWith("#") ? "hashtag" : "topic",
        });
      } catch {
        // ok
      }
    }

    // Fallback: if selectors missed, grab all hashtag-like links on the page
    if (items.length === 0) {
      const allLinks = await page.$$eval("ol li a", (els) =>
        els
          .map((a) => a.textContent?.trim() ?? "")
          .filter((t) => t.length > 1)
          .slice(0, 30)
      );
      for (const title of allLinks) {
        items.push({
          title,
          url: `https://x.com/search?q=${encodeURIComponent(title)}&src=trend_click`,
          description: "Trending on X (Twitter)",
          category: title.startsWith("#") ? "hashtag" : "topic",
        });
      }
    }
  } finally {
    await safeClosePage(page);
  }

  return {
    source: "X (Twitter) Trends",
    status: items.length > 0 ? "ok" : "error",
    error: items.length === 0 ? `No trends found on trends24.in for region: ${region}` : undefined,
    items,
    scrapedAt: new Date().toISOString(),
  };
}
