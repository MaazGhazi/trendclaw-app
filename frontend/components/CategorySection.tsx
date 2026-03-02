"use client";

import TrendCard from "./TrendCard";

interface Trend {
  title: string;
  description: string;
  why_trending: string;
  momentum: string;
  popularity: { score: number; metric: string; reach: string };
  sources: string[];
  urls: string[];
  first_seen: string | null;
  relevance: string;
}

interface Category {
  name: string;
  trends: Trend[];
}

const categoryColors: Record<string, string> = {
  // Tech & Dev
  "Hacker News": "border-orange-500",
  "GitHub Trending": "border-gray-400",
  "Lobsters": "border-red-500",
  "Dev.to": "border-indigo-400",
  "Product Hunt": "border-orange-400",
  "TechCrunch": "border-green-500",
  "The Verge": "border-purple-500",
  "Ars Technica": "border-orange-600",
  // Crypto & Finance
  "CoinGecko": "border-lime-500",
  "CoinDesk": "border-blue-400",
  // Social & Media
  "Reddit Popular": "border-orange-500",
  "Reddit Technology": "border-blue-500",
  "Reddit Cryptocurrency": "border-yellow-400",
  "Reddit Programming": "border-cyan-500",
  "Bluesky": "border-sky-400",
  "YouTube Trending": "border-red-600",
  "TikTok Trending": "border-pink-500",
  // Search & Reference
  "Google Trends": "border-blue-500",
  "Wikipedia": "border-zinc-300",
  "NewsAPI": "border-emerald-500",
  // Legacy category names (backward compat)
  "Tech & AI": "border-blue-500",
  "Crypto & Finance": "border-yellow-500",
  "Social Media": "border-pink-500",
};

// Deterministic fallback color from source name
const fallbackColors = [
  "border-rose-500", "border-amber-500", "border-teal-500",
  "border-violet-500", "border-cyan-500", "border-fuchsia-500",
];
function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return fallbackColors[Math.abs(h) % fallbackColors.length];
}

export default function CategorySection({ category }: { category: Category }) {
  const borderColor = categoryColors[category.name] || hashColor(category.name);

  return (
    <section className="mb-8">
      <h2
        className={`text-lg font-bold text-zinc-100 mb-4 pl-3 border-l-2 ${borderColor}`}
      >
        {category.name}
        <span className="text-sm font-normal text-zinc-500 ml-2">
          {category.trends.length} {category.trends.length === 1 ? 'trend' : 'trends'}
        </span>
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {category.trends.map((trend) => (
          <TrendCard key={trend.title} trend={trend as never} />
        ))}
      </div>
    </section>
  );
}
