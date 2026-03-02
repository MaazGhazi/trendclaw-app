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
  "Tech & AI": "border-blue-500",
  "Crypto & Finance": "border-yellow-500",
  "Social Media": "border-pink-500",
};

export default function CategorySection({ category }: { category: Category }) {
  const borderColor = categoryColors[category.name] || "border-zinc-500";

  return (
    <section className="mb-8">
      <h2
        className={`text-lg font-bold text-zinc-100 mb-4 pl-3 border-l-2 ${borderColor}`}
      >
        {category.name}
        <span className="text-sm font-normal text-zinc-500 ml-2">
          {category.trends.length} trends
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
