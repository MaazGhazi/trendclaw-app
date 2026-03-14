import { XMLParser } from "fast-xml-parser";
import type { RunType, ScrapedItem, SourceResult } from "../../types.js";
import { stripHtml } from "./utils.js";
import { filterNewFeedItems } from "./content-cache.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

interface FeedConfig {
  name: string;
  url: string;
  runTypes: RunType[];
  maxItems: number;
}

// ─── Daily blogs (digest + deep_dive) ───────────────────────────

const DAILY_FEEDS: FeedConfig[] = [
  {
    name: "Social Media Examiner",
    url: "https://www.socialmediaexaminer.com/feed/",
    runTypes: ["digest", "deep_dive"],
    maxItems: 10,
  },
  {
    name: "Hootsuite Blog",
    url: "https://blog.hootsuite.com/feed/",
    runTypes: ["digest", "deep_dive"],
    maxItems: 10,
  },
  {
    name: "Buffer Blog",
    url: "https://buffer.com/resources/feed",
    runTypes: ["digest", "deep_dive"],
    maxItems: 10,
  },
  {
    name: "Tubefilter",
    url: "https://www.tubefilter.com/feed/",
    runTypes: ["digest", "deep_dive"],
    maxItems: 10,
  },
  {
    name: "Sprout Social",
    url: "https://sproutsocial.com/insights/feed/",
    runTypes: ["digest", "deep_dive"],
    maxItems: 10,
  },
  {
    name: "HubSpot Marketing",
    url: "https://blog.hubspot.com/marketing/rss.xml",
    runTypes: ["digest", "deep_dive"],
    maxItems: 10,
  },
  {
    name: "Planable Blog",
    url: "https://planable.io/blog/feed/",
    runTypes: ["digest", "deep_dive"],
    maxItems: 10,
  },
];

// ─── Weekly creator coach newsletters (deep_dive only) ──────────

const WEEKLY_FEEDS: FeedConfig[] = [
  {
    name: "ICYMI by Lia Haberman",
    url: "https://liahaberman.substack.com/feed",
    runTypes: ["deep_dive"],
    maxItems: 5,
  },
  {
    name: "The Publish Press",
    url: "https://publishpress.substack.com/feed",
    runTypes: ["deep_dive"],
    maxItems: 5,
  },
  {
    name: "CreatorIQ",
    url: "https://www.creatoriq.com/blog/rss.xml",
    runTypes: ["deep_dive"],
    maxItems: 5,
  },
];

const ALL_FEEDS = [...DAILY_FEEDS, ...WEEKLY_FEEDS];

// ─── Feed fetcher ───────────────────────────────────────────────

async function fetchFeed(feed: FeedConfig): Promise<SourceResult> {
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": "TrendClaw/1.0 (trend monitoring)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`RSS returned ${res.status}`);

    const xml = await res.text();
    const parsed = parser.parse(xml);

    // Handle both RSS 2.0 and Atom feeds
    let entries: any[] = [];
    if (parsed.rss?.channel?.item) {
      entries = Array.isArray(parsed.rss.channel.item)
        ? parsed.rss.channel.item
        : [parsed.rss.channel.item];
    } else if (parsed.feed?.entry) {
      entries = Array.isArray(parsed.feed.entry)
        ? parsed.feed.entry
        : [parsed.feed.entry];
    }

    const items: ScrapedItem[] = entries.slice(0, feed.maxItems).map((entry: any) => {
      // RSS 2.0
      if (entry.title && entry.link && !entry["@_href"]) {
        return {
          title: typeof entry.title === "string" ? entry.title : entry.title?.["#text"] ?? "",
          url: entry.link,
          description: stripHtml(entry.description ?? entry["content:encoded"] ?? "").slice(0, 300),
          publishedAt: entry.pubDate ?? entry.published,
          category: "social-trend",
        };
      }
      // Atom
      const link = Array.isArray(entry.link)
        ? entry.link.find((l: any) => l["@_rel"] === "alternate")?.["@_href"] ?? entry.link[0]?.["@_href"]
        : entry.link?.["@_href"] ?? entry.link;
      return {
        title: typeof entry.title === "string" ? entry.title : entry.title?.["#text"] ?? "",
        url: link,
        description: stripHtml(entry.summary ?? entry.content ?? "").slice(0, 300),
        publishedAt: entry.updated ?? entry.published,
        category: "social-trend",
      };
    });

    // Filter to only new items (date-based + hash fallback)
    const newItems = filterNewFeedItems(feed.url, items);

    return {
      source: feed.name,
      status: "ok",
      items: newItems,
      scrapedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      source: feed.name,
      status: "error",
      error: String(e),
      items: [],
      scrapedAt: new Date().toISOString(),
    };
  }
}

// ─── Public collector ───────────────────────────────────────────

/** Collect all social trend RSS feeds applicable to this run type */
export async function collectRssFeeds(runType: RunType): Promise<SourceResult[]> {
  const applicable = ALL_FEEDS.filter((f) => f.runTypes.includes(runType));
  if (applicable.length === 0) return [];
  return Promise.all(applicable.map(fetchFeed));
}
