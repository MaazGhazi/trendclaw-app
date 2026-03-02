"use client";

import { useState, useEffect } from "react";
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
  "Hacker News": "border-orange-500",
  "GitHub Trending": "border-gray-400",
  "Lobsters": "border-red-500",
  "Dev.to": "border-indigo-400",
  "Product Hunt": "border-orange-400",
  "TechCrunch": "border-green-500",
  "The Verge": "border-purple-500",
  "Ars Technica": "border-orange-600",
  "CoinGecko": "border-lime-500",
  "CoinDesk": "border-blue-400",
  "Reddit Popular": "border-orange-500",
  "Reddit Technology": "border-blue-500",
  "Reddit Cryptocurrency": "border-yellow-400",
  "Reddit Programming": "border-cyan-500",
  "Reddit Artificial": "border-violet-500",
  "Bluesky": "border-sky-400",
  "YouTube Trending": "border-red-600",
  "TikTok Creative Center": "border-pink-500",
  "TikTok Trending": "border-pink-500",
  "Google Trends": "border-blue-500",
  "Wikipedia": "border-zinc-300",
  "Wikipedia Most Viewed": "border-zinc-300",
  "NewsAPI": "border-emerald-500",
  "Tech & AI": "border-blue-500",
  "Crypto & Finance": "border-yellow-500",
  "Social Media": "border-pink-500",
};

const fallbackColors = [
  "border-rose-500",
  "border-amber-500",
  "border-teal-500",
  "border-violet-500",
  "border-cyan-500",
  "border-fuchsia-500",
];
function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return fallbackColors[Math.abs(h) % fallbackColors.length];
}

export interface ExpandSignal {
  open: boolean;
  v: number;
}

export default function CategorySection({
  category,
  expandSignal,
}: {
  category: Category;
  expandSignal?: ExpandSignal;
}) {
  const [open, setOpen] = useState(false);
  const borderColor =
    categoryColors[category.name] || hashColor(category.name);

  useEffect(() => {
    if (expandSignal && expandSignal.v > 0) {
      setOpen(expandSignal.open);
    }
  }, [expandSignal]);

  return (
    <section className="mb-1">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 py-2 px-3 border-l-2 ${borderColor} hover:bg-zinc-800/30 rounded-r transition-colors text-left`}
      >
        <svg
          className={`w-3 h-3 text-zinc-500 shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5l7 7-7 7"
          />
        </svg>
        <span className="text-sm font-semibold text-zinc-200">
          {category.name}
        </span>
        <span className="text-xs text-zinc-500 tabular-nums">
          {category.trends.length}
        </span>
        {!open && category.trends.length > 0 && (
          <span className="text-xs text-zinc-600 truncate ml-1 hidden sm:inline">
            {category.trends
              .slice(0, 3)
              .map((t) => t.title)
              .join(" · ")}
          </span>
        )}
      </button>

      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5 mt-1.5 ml-5 mb-3">
          {category.trends.map((trend) => (
            <TrendCard key={trend.title} trend={trend as never} />
          ))}
        </div>
      )}
    </section>
  );
}
