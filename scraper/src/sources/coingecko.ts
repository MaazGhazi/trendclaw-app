import type { RunType, ScrapedItem, SourceResult } from "../types.js";

const BASE = "https://api.coingecko.com/api/v3";

export async function collect(runType: RunType): Promise<SourceResult> {
  const items: ScrapedItem[] = [];

  try {
    // Trending coins
    const trendingRes = await fetch(`${BASE}/search/trending`);
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

    // Top movers by volume (digest and deep dive only)
    if (runType !== "pulse") {
      // Small delay to respect rate limits
      await new Promise((r) => setTimeout(r, 1200));
      const marketsRes = await fetch(
        `${BASE}/coins/markets?vs_currency=usd&order=volume_desc&per_page=15&sparkline=false&price_change_percentage=24h,7d`
      );
      if (marketsRes.ok) {
        const coins = await marketsRes.json();
        for (const c of coins) {
          // Skip if already in trending
          if (items.some((i) => i.title.includes(c.symbol?.toUpperCase()))) continue;
          items.push({
            title: `${c.name} (${c.symbol?.toUpperCase()})`,
            url: `https://www.coingecko.com/en/coins/${c.id}`,
            description: `Price: $${c.current_price} | MCap rank #${c.market_cap_rank}`,
            rank: c.market_cap_rank,
            priceChange: c.price_change_percentage_24h
              ? `${c.price_change_percentage_24h.toFixed(1)}% (24h)`
              : undefined,
            volume: c.total_volume ? `$${Number(c.total_volume).toLocaleString()}` : undefined,
            marketCap: c.market_cap ? `$${Number(c.market_cap).toLocaleString()}` : undefined,
            category: "top_volume",
          });
        }
      }
    }

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
