import type { ScrapedItem } from "../../types.js";
import { getConditionalHeaders, updatePageHeaders } from "./content-cache.js";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Fetch a page's HTML with browser-like headers and 15s timeout.
 * Uses If-Modified-Since / If-None-Match to skip unchanged pages.
 * Returns null if page hasn't changed (304), HTML string otherwise.
 */
export async function fetchPage(url: string): Promise<string | null> {
  const conditionalHeaders = getConditionalHeaders(url);

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      ...conditionalHeaders,
    },
    signal: AbortSignal.timeout(15_000),
  });

  // 304 Not Modified — page hasn't changed since last fetch
  if (res.status === 304) return null;

  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);

  // Store response cache headers for next request
  updatePageHeaders(
    url,
    res.headers.get("etag"),
    res.headers.get("last-modified"),
  );

  return res.text();
}

/** Strip HTML tags and decode common entities */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#8217;/g, "\u2019")
    .replace(/&#8220;/g, "\u201C")
    .replace(/&#8221;/g, "\u201D")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove script, style, nav, header, footer blocks from HTML */
export function cleanHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "");
}

/** Try to extract main content area, falling back to cleaned full HTML */
export function getContentArea(html: string): string {
  const cleaned = cleanHtml(html);

  // Try <article> first, then <main>
  const articleMatch = cleaned.match(/<article[\s\S]*<\/article>/i);
  if (articleMatch) return articleMatch[0];

  const mainMatch = cleaned.match(/<main[\s\S]*<\/main>/i);
  if (mainMatch) return mainMatch[0];

  // Look for common content wrapper class names
  const contentMatch = cleaned.match(/<div[^>]*class="[^"]*(?:post-content|entry-content|article-content|blog-content|page-content|rich-text)[^"]*"[\s\S]*?(?=<div[^>]*class="[^"]*(?:sidebar|footer|related))/i);
  if (contentMatch) return contentMatch[0];

  return cleaned;
}

const BOILERPLATE_TERMS = [
  "table of contents", "about the author", "related posts", "share this",
  "leave a comment", "subscribe", "newsletter sign", "final thoughts",
  "conclusion", "wrapping up", "frequently asked", "faq", "faqs",
  "join the community", "join the pod", "no card required",
  "out of post ideas", "network integrations", "pricing",
  "social media scheduling", "social listening", "analytics",
  "our work", "our creator network", "influencer marketing platform",
  "full-service programs", "get started", "sign up", "log in",
  "contact us", "resources", "featured", "popular posts",
  "more instagram resources", "read more articles",
  "ready to participate", "free social media calendar",
];

export function isBoilerplate(title: string): boolean {
  const lower = title.toLowerCase();
  if (lower.length < 4 || lower.length > 200) return true;
  for (const term of BOILERPLATE_TERMS) {
    if (lower === term || lower.includes(term)) return true;
  }
  // Skip single words
  if (lower.split(/\s+/).length <= 1) return true;
  return false;
}

/**
 * Extract trend items from blog HTML using h2/h3 headings + following <p>.
 * Handles multiline headings (SocialBee pattern).
 */
export function extractHeadings(
  html: string,
  sourceUrl: string,
  platform?: string,
  maxItems = 30,
): ScrapedItem[] {
  const items: ScrapedItem[] = [];
  const content = getContentArea(html);

  // Split by h2/h3 opening tags
  const sections = content.split(/<h[23][^>]*>/i);

  for (let i = 1; i < sections.length && items.length < maxItems; i++) {
    const section = sections[i];

    // Extract heading text (everything before closing tag — /s for multiline)
    const headingMatch = section.match(/^([\s\S]*?)<\/h[23]>/i);
    if (!headingMatch) continue;

    const title = stripHtml(headingMatch[1]).slice(0, 200);
    if (!title || isBoilerplate(title)) continue;

    // Get first paragraph after the heading as description
    const afterHeading = section.slice(headingMatch[0].length);
    const pMatch = afterHeading.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const description = pMatch ? stripHtml(pMatch[1]).slice(0, 500) : "";

    items.push({
      title,
      url: sourceUrl,
      description,
      category: "social-trend",
      extra: {
        platform: platform ?? "social",
        sourceType: "blog",
      },
    });
  }

  return items;
}

/** Build a standard SourceResult */
export function makeResult(
  source: string,
  items: ScrapedItem[],
  error?: string,
) {
  return {
    source,
    status: (items.length > 0 ? "ok" : "error") as "ok" | "error",
    error: items.length === 0 ? error ?? "No trends extracted" : undefined,
    items,
    scrapedAt: new Date().toISOString(),
  };
}

/** Build an empty OK result (page unchanged / 304) */
export function makeUnchangedResult(source: string) {
  return {
    source,
    status: "ok" as const,
    items: [] as ScrapedItem[],
    scrapedAt: new Date().toISOString(),
  };
}
