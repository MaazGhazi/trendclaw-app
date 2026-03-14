import type { RunType, ScrapedItem, SourceResult } from "../../types.js";
import { fetchPage, stripHtml, cleanHtml, isBoilerplate, makeResult } from "./utils.js";

// https://socialbee.com/blog/instagram-trends/
//
// Structure: h2 = date headers like "(February 20, 2026) Instagram trends"
//            h3 = individual trend names like "Hurt the paper", "Born to…, forced to…"
// Headings are multiline in the HTML (content spans multiple lines inside the tag).

const URL = "https://socialbee.com/blog/instagram-trends/";

function extractTrends(html: string): ScrapedItem[] {
  const items: ScrapedItem[] = [];
  const cleaned = cleanHtml(html);

  // Split by h2 or h3 opening tags
  const sections = cleaned.split(/<h[23][^>]*>/i);

  let currentDate = "";

  for (let i = 1; i < sections.length && items.length < 30; i++) {
    const section = sections[i];
    const headingMatch = section.match(/^([\s\S]*?)<\/h[23]>/i);
    if (!headingMatch) continue;

    const title = stripHtml(headingMatch[1]);
    if (!title || title.length < 3) continue;

    // Check if this is a date header like "(February 20, 2026) Instagram trends"
    const dateMatch = title.match(/\(([^)]+\d{4})\)/);
    if (dateMatch) {
      currentDate = dateMatch[1];
      continue;
    }

    if (isBoilerplate(title)) continue;

    // This is an actual trend name — get description from following <p>
    const afterHeading = section.slice(headingMatch[0].length);
    const pMatch = afterHeading.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const description = pMatch ? stripHtml(pMatch[1]).slice(0, 500) : "";

    items.push({
      title: currentDate ? `${title} (${currentDate})` : title,
      url: URL,
      description,
      category: "social-trend",
      extra: {
        platform: "reels",
        sourceType: "blog",
        date: currentDate || undefined,
      },
    });
  }

  return items;
}

export async function collect(runType: RunType): Promise<SourceResult> {
  try {
    const html = await fetchPage(URL);
    if (html === null) {
      return { source: "SocialBee Instagram Trends", status: "ok", items: [], scrapedAt: new Date().toISOString() };
    }
    return makeResult("SocialBee Instagram Trends", extractTrends(html));
  } catch (e) {
    return { source: "SocialBee Instagram Trends", status: "error", error: String(e), items: [], scrapedAt: new Date().toISOString() };
  }
}
