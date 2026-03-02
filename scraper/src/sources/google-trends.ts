import { newPage } from "./browser.js";
import type { RunType, ScrapedItem, SourceResult } from "../types.js";

export async function collect(_runType: RunType): Promise<SourceResult> {
  const items: ScrapedItem[] = [];

  try {
    const page = await newPage();

    // Navigate to Google Trends trending page
    await page.goto("https://trends.google.com/trending?geo=US", {
      waitUntil: "networkidle",
      timeout: 45000,
    });

    // Wait for content to load
    await page.waitForTimeout(3000 + Math.random() * 2000);

    // Try to extract trending searches
    // Google Trends uses dynamic class names, so we look for common patterns
    const trendElements = await page.$$("div[class*='feed-item'], tr[class*='enOdEe'], div[class*='details']");

    if (trendElements.length === 0) {
      // Fallback: try getting all visible text links that look like trend entries
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

    // Also try extracting the trending searches via the page's JSON data
    const pageContent = await page.content();
    const jsonMatch = pageContent.match(/trendingSearches.*?(\[[\s\S]*?\])/);
    if (jsonMatch) {
      try {
        // This is a best-effort JSON extraction
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

    await page.close();

    return {
      source: "Google Trends",
      status: items.length > 0 ? "ok" : "error",
      error: items.length === 0 ? "Could not parse trends (possible bot block)" : undefined,
      items,
      scrapedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      source: "Google Trends",
      status: "error",
      error: String(e),
      items,
      scrapedAt: new Date().toISOString(),
    };
  }
}
