import type { RunType, ScrapedItem, SourceResult } from "../types.js";

const BASE = "https://api.coingecko.com/api/v3";

export async function collect(runType: RunType): Promise<SourceResult> {
  const items: ScrapedItem[] = [];

  try {
    // Trending coins
    const trendingRes = await fetch(`${BASE}/search/trending`, { signal: AbortSignal.timeout(15_000) });
    if (trendingRes.ok) {
      const data = await trendingRes.json();
      for (const coin of data.coins ?? []) {
        const c = coin.item;
        items.push({
          title: `${c.name} (${c.symbol})`,
          url: `https://www.coingecko.com/en/coins/${c.id}`,
          description: `Market cap rank #${c.market_cap_rank ?? "N/A"}`,
          rank: c.market_cap_rank,
          score: c.score,
          priceChange: c.data?.price_change_percentage_24h
            ? `${c.data.price_change_percentage_24h.usd?.toFixed(1)}%`
            : undefined,
          volume: c.data?.total_volume ? `$${c.data.total_volume.usd}` : undefined,
          category: "trending",
        });
      }
    }

    // Cap at 10 items total
    if (items.length > 10) items.length = 10;

    return {
      source: "CoinGecko",
      status: "ok",
      items,
      scrapedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      source: "CoinGecko",
      status: "error",
      error: String(e),
      items,
      scrapedAt: new Date().toISOString(),
    };
  }
}
