import { XMLParser } from "fast-xml-parser";
import type { RunType, ScrapedItem, SourceResult } from "../types.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

interface FeedConfig {
  name: string;
  url: string;
  /** Which run types to include this feed in */
  runTypes: RunType[];
  maxItems: number;
}

const FEEDS: FeedConfig[] = [
  // Reddit — RSS is public and unblocked, unlike their API
  {
    name: "Reddit Popular",
    url: "https://old.reddit.com/r/popular/.rss",
    runTypes: ["pulse", "digest", "deep_dive"],
    maxItems: 15,
  },
  {
    name: "Reddit Technology",
    url: "https://old.reddit.com/r/technology/.rss",
    runTypes: ["digest", "deep_dive"],
    maxItems: 10,
  },
  {
    name: "Reddit Cryptocurrency",
    url: "https://old.reddit.com/r/cryptocurrency/.rss",
    runTypes: ["digest", "deep_dive"],
    maxItems: 10,
  },
  {
    name: "Reddit Artificial",
    url: "https://old.reddit.com/r/artificial/.rss",
    runTypes: ["digest", "deep_dive"],
    maxItems: 10,
  },
  // Tech news
  {
    name: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    runTypes: ["digest", "deep_dive"],
    maxItems: 10,
  },
  {
    name: "The Verge",
    url: "https://www.theverge.com/rss/index.xml",
    runTypes: ["digest", "deep_dive"],
    maxItems: 10,
  },
  {
    name: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/index",
    runTypes: ["deep_dive"],
    maxItems: 10,
  },
  // Crypto
  {
    name: "CoinDesk",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    runTypes: ["digest", "deep_dive"],
    maxItems: 10,
  },
  // Product launches
  {
    name: "Product Hunt",
    url: "https://www.producthunt.com/feed",
    runTypes: ["digest", "deep_dive"],
    maxItems: 10,
  },
];

async function fetchFeed(feed: FeedConfig): Promise<SourceResult> {
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": "TrendClaw/1.0 (trend monitoring)" },
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
          description: stripHtml(entry.description ?? entry["content:encoded"] ?? ""),
          publishedAt: entry.pubDate ?? entry.published,
        };
      }
      // Atom
      const link = Array.isArray(entry.link)
        ? entry.link.find((l: any) => l["@_rel"] === "alternate")?.["@_href"] ?? entry.link[0]?.["@_href"]
        : entry.link?.["@_href"] ?? entry.link;
      return {
        title: typeof entry.title === "string" ? entry.title : entry.title?.["#text"] ?? "",
        url: link,
        description: stripHtml(entry.summary ?? entry.content ?? ""),
        publishedAt: entry.updated ?? entry.published,
      };
    });

    return {
      source: feed.name,
      status: "ok",
      items,
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

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export async function collectAll(runType: RunType): Promise<SourceResult[]> {
  const applicableFeeds = FEEDS.filter((f) => f.runTypes.includes(runType));
  // Fetch all applicable feeds in parallel
  return Promise.all(applicableFeeds.map(fetchFeed));
}
