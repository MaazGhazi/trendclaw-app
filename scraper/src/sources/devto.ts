import type { RunType, ScrapedItem, SourceResult } from "../types.js";
import { getUserConfig } from "../user-config.js";

/** Niche → Dev.to tag mapping */
const NICHE_TAGS: Record<string, string> = {
  tech: "webdev",
  crypto: "blockchain",
  ai: "ai",
  gaming: "gamedev",
  saas: "saas",
  finance: "fintech",
  marketing: "marketing",
  design: "design",
  devops: "devops",
  mobile: "mobile",
  security: "security",
  data: "datascience",
  ml: "machinelearning",
  cloud: "cloud",
  frontend: "frontend",
  backend: "backend",
};

/** Global: top Dev.to articles (no topic filter) */
export async function collect(runType: RunType): Promise<SourceResult> {
  try {
    const perPage = runType === "pulse" ? 10 : 20;
    const res = await fetch(
      `https://dev.to/api/articles?top=1&per_page=${perPage}`,
      { headers: { "User-Agent": "TrendClaw/1.0" } }
    );
    if (!res.ok) throw new Error(`Dev.to API returned ${res.status}`);
    const articles = await res.json();

    const items: ScrapedItem[] = articles.map((a: any) => ({
      title: a.title,
      url: a.url,
      description: a.description,
      score: a.public_reactions_count,
      comments: a.comments_count,
      views: a.page_views_count ?? undefined,
      publishedAt: a.published_at,
      extra: { tags: a.tag_list, user: a.user?.username, readingTime: a.reading_time_minutes },
    }));

    return {
      source: "Dev.to",
      status: "ok",
      items,
      scrapedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      source: "Dev.to",
      status: "error",
      error: String(e),
      items: [],
      scrapedAt: new Date().toISOString(),
    };
  }
}

/** Topic-based: Dev.to articles filtered by user's niche tag */
export async function collectByKeywords(runType: RunType): Promise<SourceResult> {
  const config = getUserConfig();

  // Find a matching Dev.to tag from niche or keywords
  let tag = NICHE_TAGS[config.niche.toLowerCase()];
  if (!tag && config.keywords.length > 0) {
    // Try keywords as tags directly
    tag = config.keywords[0].toLowerCase().replace(/\s+/g, "");
  }
  if (!tag) {
    tag = config.niche.toLowerCase().replace(/\s+/g, "");
  }

  try {
    const perPage = runType === "pulse" ? 10 : 20;
    const res = await fetch(
      `https://dev.to/api/articles?tag=${encodeURIComponent(tag)}&top=1&per_page=${perPage}`,
      { headers: { "User-Agent": "TrendClaw/1.0" } }
    );
    if (!res.ok) throw new Error(`Dev.to tag API returned ${res.status}`);
    const articles = await res.json();

    const items: ScrapedItem[] = articles.map((a: any) => ({
      title: a.title,
      url: a.url,
      description: a.description,
      score: a.public_reactions_count,
      comments: a.comments_count,
      views: a.page_views_count ?? undefined,
      publishedAt: a.published_at,
      category: `tag:${tag}`,
      extra: { tags: a.tag_list, user: a.user?.username, readingTime: a.reading_time_minutes },
    }));

    return {
      source: `Dev.to [${tag}]`,
      status: "ok",
      items,
      scrapedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      source: `Dev.to [${tag}]`,
      status: "error",
      error: String(e),
      items: [],
      scrapedAt: new Date().toISOString(),
    };
  }
}
