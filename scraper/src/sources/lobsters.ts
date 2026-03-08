import type { RunType, ScrapedItem, SourceResult } from "../types.js";

export async function collect(runType: RunType): Promise<SourceResult> {
  try {
    const limit = runType === "pulse" ? 10 : 25;
    const res = await fetch("https://lobste.rs/hottest.json", { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Lobsters returned ${res.status}`);
    const stories = await res.json();

    const items: ScrapedItem[] = stories.slice(0, limit).map((s: any) => ({
      title: s.title,
      url: s.url || s.comments_url,
      description: s.tags?.join(", "),
      score: s.score,
      comments: s.comment_count,
      publishedAt: s.created_at,
      extra: { submitter: s.submitter_user?.username, tags: s.tags },
    }));

    return {
      source: "Lobsters",
      status: "ok",
      items,
      scrapedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      source: "Lobsters",
      status: "error",
      error: String(e),
      items: [],
      scrapedAt: new Date().toISOString(),
    };
  }
}
