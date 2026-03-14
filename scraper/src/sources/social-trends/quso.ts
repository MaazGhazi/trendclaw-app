import type { RunType, ScrapedItem, SourceResult } from "../../types.js";
import { fetchPage, stripHtml, cleanHtml, getContentArea, isBoilerplate, makeResult } from "./utils.js";

// https://quso.ai/blog/instagram-reels-trends
// https://quso.ai/blog/hottest-tiktok-trends
//
// Structure: h2 = monthly roundup, h3 = date range, h4 = trend name
// We extract h4 headings (the actual trend names) with their date context from h3.

const PAGES = [
  { url: "https://quso.ai/blog/instagram-reels-trends", platform: "reels" },
  { url: "https://quso.ai/blog/hottest-tiktok-trends", platform: "tiktok" },
];

function extractTrends(html: string, sourceUrl: string, platform: string): ScrapedItem[] {
  const items: ScrapedItem[] = [];
  const content = getContentArea(html);

  // Split by ANY heading (h2-h4) to track context
  const sections = content.split(/<h[2-4][^>]*>/i);
  let currentDateRange = "";

  for (let i = 1; i < sections.length && items.length < 30; i++) {
    const section = sections[i];

    // Determine heading level from closing tag
    const closeMatch = section.match(/^([\s\S]*?)<\/h([2-4])>/i);
    if (!closeMatch) continue;

    const title = stripHtml(closeMatch[1]);
    const level = parseInt(closeMatch[2]);

    if (!title || title.length < 3) continue;

    // h3 = date range — store as context
    if (level === 3) {
      // Date ranges like "March 03 - March 07"
      if (/\w+\s+\d/.test(title)) {
        currentDateRange = title;
      }
      continue;
    }

    // h2 = monthly roundup header — skip
    if (level === 2) continue;

    // h4 = actual trend name
    if (level === 4) {
      if (isBoilerplate(title)) continue;

      // Get description from content after the heading
      const afterHeading = section.slice(closeMatch[0].length);
      const pMatch = afterHeading.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      let description = pMatch ? stripHtml(pMatch[1]).slice(0, 500) : "";

      // Also try to find the plain text if no <p> (some content is in divs)
      if (!description) {
        const textMatch = afterHeading.match(/^([^<]{20,})/);
        if (textMatch) description = stripHtml(textMatch[1]).slice(0, 500);
      }

      items.push({
        title: currentDateRange ? `${title} (${currentDateRange})` : title,
        url: sourceUrl,
        description,
        category: "social-trend",
        extra: {
          platform,
          sourceType: "blog",
          dateRange: currentDateRange || undefined,
        },
      });
    }
  }

  return items;
}

export async function collect(runType: RunType): Promise<SourceResult> {
  const allItems = await Promise.all(
    PAGES.map(async ({ url, platform }) => {
      try {
        const html = await fetchPage(url);
        if (html === null) return [];
        return extractTrends(html, url, platform);
      } catch {
        return [];
      }
    }),
  );

  return makeResult("Quso Trends", allItems.flat());
}
