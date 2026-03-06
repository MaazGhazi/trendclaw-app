import { XMLParser } from "fast-xml-parser";
import type { RunType, ScrapedItem, SourceResult } from "../types.js";
import { getUserConfig } from "../user-config.js";

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
  /** Which phase: "global" (static feeds) or "region" (news feeds) */
  phase?: "global" | "region";
}

// ─── Static/global feeds ─────────────────────────────────────────

const FEEDS: FeedConfig[] = [
  // Reddit — RSS is public and unblocked, unlike their API
  {
    name: "Reddit Popular",
    url: "https://old.reddit.com/r/popular/.rss",
    runTypes: ["pulse", "digest", "deep_dive"],
    maxItems: 15,
    phase: "global",
  },
  {
    name: "Reddit Technology",
    url: "https://old.reddit.com/r/technology/.rss",
    runTypes: ["digest", "deep_dive"],
    maxItems: 10,
    phase: "global",
  },
  {
    name: "Reddit Cryptocurrency",
    url: "https://old.reddit.com/r/cryptocurrency/.rss",
    runTypes: ["digest", "deep_dive"],
    maxItems: 10,
    phase: "global",
  },
  {
    name: "Reddit Artificial",
    url: "https://old.reddit.com/r/artificial/.rss",
    runTypes: ["digest", "deep_dive"],
    maxItems: 10,
    phase: "global",
  },
  // Tech news
  {
    name: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    runTypes: ["digest", "deep_dive"],
    maxItems: 10,
    phase: "region",
  },
  {
    name: "The Verge",
    url: "https://www.theverge.com/rss/index.xml",
    runTypes: ["digest", "deep_dive"],
    maxItems: 10,
    phase: "region",
  },
  {
    name: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/index",
    runTypes: ["deep_dive"],
    maxItems: 10,
    phase: "region",
  },
  // Crypto
  {
    name: "CoinDesk",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    runTypes: ["digest", "deep_dive"],
    maxItems: 10,
    phase: "region",
  },
  // Product launches
  {
    name: "Product Hunt",
    url: "https://www.producthunt.com/feed",
    runTypes: ["digest", "deep_dive"],
    maxItems: 10,
    phase: "global",
  },
];

// ─── Niche → subreddit mapping ───────────────────────────────────

const NICHE_SUBREDDITS: Record<string, string[]> = {
  tech: ["programming", "webdev", "software"],
  crypto: ["bitcoin", "defi", "ethfinance"],
  ai: ["machinelearning", "localllama", "openai"],
  gaming: ["gamedev", "indiegaming", "pcgaming"],
  fashion: ["fashion", "streetwear", "femalefashionadvice"],
  food: ["food", "cooking", "recipes"],
  fitness: ["fitness", "bodybuilding", "running"],
  finance: ["personalfinance", "investing", "stocks"],
  saas: ["SaaS", "startups", "entrepreneur"],
  music: ["musicproduction", "WeAreTheMusicMakers", "hiphopheads"],
  art: ["Art", "DigitalArt", "graphic_design"],
  education: ["learnprogramming", "datascience", "OnlineLearning"],
  health: ["health", "nutrition", "mentalhealth"],
  travel: ["travel", "solotravel", "digitalnomad"],
  ecommerce: ["ecommerce", "shopify", "FulfillmentByAmazon"],
  marketing: ["marketing", "socialmedia", "SEO"],
  realestate: ["realestate", "RealEstateInvesting", "firsttimehomebuyer"],
  photography: ["photography", "photocritique", "EditMyRaw"],
  beauty: ["beauty", "MakeupAddiction", "SkincareAddiction"],
  automotive: ["cars", "electricvehicles", "MechanicAdvice"],
  pets: ["dogs", "cats", "Pets"],
  parenting: ["Parenting", "Mommit", "daddit"],
  sports: ["sports", "nba", "soccer"],
};

// ─── Feed fetcher ────────────────────────────────────────────────

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

// ─── Public collectors ───────────────────────────────────────────

/** Collect all static/global+region feeds */
export async function collectAll(runType: RunType): Promise<SourceResult[]> {
  const applicableFeeds = FEEDS.filter((f) => f.runTypes.includes(runType));
  return Promise.all(applicableFeeds.map(fetchFeed));
}

/** Collect only global-phase feeds (Reddit Popular, Product Hunt, etc.) */
export async function collectGlobal(runType: RunType): Promise<SourceResult[]> {
  const feeds = FEEDS.filter((f) => f.runTypes.includes(runType) && f.phase === "global");
  return Promise.all(feeds.map(fetchFeed));
}

/** Collect only region-phase feeds (TechCrunch, The Verge, etc.) */
export async function collectRegion(runType: RunType): Promise<SourceResult[]> {
  const feeds = FEEDS.filter((f) => f.runTypes.includes(runType) && f.phase === "region");
  return Promise.all(feeds.map(fetchFeed));
}

/** Topic-based: scrape subreddits relevant to user's niche + keyword search */
export async function collectByNiche(runType: RunType): Promise<SourceResult[]> {
  const config = getUserConfig();
  const niche = config.niche.toLowerCase();
  const keywords = config.keywords;

  const feeds: FeedConfig[] = [];

  // Add niche-specific subreddits
  const subreddits = NICHE_SUBREDDITS[niche] ?? [];
  for (const sub of subreddits) {
    feeds.push({
      name: `Reddit r/${sub}`,
      url: `https://old.reddit.com/r/${sub}/top/.rss?t=day`,
      runTypes: ["pulse", "digest", "deep_dive"],
      maxItems: 10,
    });
  }

  // Add keyword-based Reddit search feeds
  for (const keyword of keywords.slice(0, 3)) {
    feeds.push({
      name: `Reddit Search: ${keyword}`,
      url: `https://old.reddit.com/search.rss?q=${encodeURIComponent(keyword)}&sort=top&t=day`,
      runTypes: ["pulse", "digest", "deep_dive"],
      maxItems: 10,
    });
  }

  // If no niche subreddits and no keywords, try using niche as search term
  if (feeds.length === 0 && niche && niche !== "tech") {
    feeds.push({
      name: `Reddit Search: ${niche}`,
      url: `https://old.reddit.com/search.rss?q=${encodeURIComponent(niche)}&sort=top&t=day`,
      runTypes: ["pulse", "digest", "deep_dive"],
      maxItems: 15,
    });
  }

  const applicableFeeds = feeds.filter((f) => f.runTypes.includes(runType));
  if (applicableFeeds.length === 0) return [];

  return Promise.all(applicableFeeds.map(fetchFeed));
}
