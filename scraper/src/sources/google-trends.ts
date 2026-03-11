import { XMLParser } from "fast-xml-parser";
import { newPage, safeClosePage } from "./browser.js";
import type { RunType, ScrapedItem, SourceResult } from "../types.js";
import { getUserConfig } from "../user-config.js";

async function collectViaRSS(): Promise<ScrapedItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const region = getUserConfig().region;

  try {
    const res = await fetch(`https://trends.google.com/trending/rss?geo=${region}`, {
      signal: controller.signal,
      headers: { "User-Agent": "TrendClaw/1.0 (trend monitoring)" },
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`RSS returned ${res.status}`);
    const xml = await res.text();

    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml);

    const items: ScrapedItem[] = [];
    const channel = parsed?.rss?.channel;
    if (!channel) throw new Error("No RSS channel found");

    const rssItems = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : [];

    for (const entry of rssItems.slice(0, 20)) {
      const title = entry.title ?? "";
      if (title.length < 2) continue;
      items.push({
        title,
        url: entry.link ?? undefined,
        description: entry["ht:news_item"]?.["ht:news_item_title"] ?? undefined,
        views: entry["ht:approx_traffic"]
          ? parseInt(String(entry["ht:approx_traffic"]).replace(/[^0-9]/g, ""), 10) || undefined
          : undefined,
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
    const region = getUserConfig().region;
    await page.goto(`https://trends.google.com/trending?geo=${region}`, {
      waitUntil: "networkidle",
      timeout: 45000,
    });

    await page.waitForTimeout(3000 + Math.random() * 2000);

    const trendElements = await page.$$("div[class*='feed-item'], tr[class*='enOdEe'], div[class*='details']");

    if (trendElements.length === 0) {
      const allLinks = await page.$$eval("a", (links) =>
        links
          .filter((a) => {
            const text = a.textContent?.trim() ?? "";
            const href = a.getAttribute("href") ?? "";
            return text.length > 3 && text.length < 100 && href.includes("/trends/");
          })
          .map((a) => ({
            title: a.textContent?.trim() ?? "",
            url: a.getAttribute("href") ?? "",
          }))
          .slice(0, 20)
      );
      for (const link of allLinks) {
        items.push({
          title: link.title,
          url: link.url.startsWith("http") ? link.url : `https://trends.google.com${link.url}`,
        });
      }
    } else {
      for (const el of trendElements.slice(0, 20)) {
        try {
          const text = (await el.textContent())?.trim() ?? "";
          if (text.length > 2 && text.length < 200) {
            items.push({ title: text.split("\n")[0].trim() });
          }
        } catch {
          // ok
        }
      }
    }

    const pageContent = await page.content();
    const jsonMatch = pageContent.match(/trendingSearches.*?(\[[\s\S]*?\])/);
    if (jsonMatch) {
      try {
        const text = jsonMatch[1];
        const titles = text.match(/"title":\s*"([^"]+)"/g) ?? [];
        for (const t of titles.slice(0, 20)) {
          const title = t.replace(/"title":\s*"/, "").replace(/"$/, "");
          if (!items.some((i) => i.title === title)) {
            items.push({ title });
          }
        }
      } catch {
        // ok
      }
    }
  } finally {
    await safeClosePage(page);
  }

  return items;
}

export async function collect(_runType: RunType): Promise<SourceResult> {
  let items: ScrapedItem[] = [];
  let method = "rss";

  // Try RSS first (fast, no browser needed)
  try {
    items = await collectViaRSS();
  } catch (rssErr) {
    // Fall back to Playwright scraping
    method = "playwright";
    try {
      items = await collectViaPlaywright();
    } catch (pwErr) {
      return {
        source: "Google Trends",
        status: "error",
        error: `RSS failed: ${String(rssErr)}; Playwright failed: ${String(pwErr)}`,
        items: [],
        scrapedAt: new Date().toISOString(),
      };
    }
  }

  return {
    source: "Google Trends",
    status: items.length > 0 ? "ok" : "error",
    error: items.length === 0 ? `No trends found via ${method}` : undefined,
    items,
    scrapedAt: new Date().toISOString(),
  };
}
