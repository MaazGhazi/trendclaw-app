"use client";

import { useState } from "react";

interface Trend {
  title: string;
  description: string;
  why_trending: string;
  momentum: "rising" | "peaking" | "stable" | "declining" | "new";
  popularity: {
    score: number;
    metric: string;
    reach: "high" | "medium" | "low";
  };
  sources: string[];
  urls: string[];
  first_seen: string | null;
  relevance: "high" | "medium" | "low";
}

const momentumColors: Record<string, string> = {
  rising: "text-green-400",
  viral: "text-emerald-300",
  peaking: "text-yellow-400",
  stable: "text-blue-400",
  falling: "text-red-400",
  declining: "text-red-400",
  new: "text-purple-400",
};

const momentumIcons: Record<string, string> = {
  rising: "^",
  viral: "^^",
  peaking: ">>",
  stable: "~",
  falling: "v",
  declining: "v",
  new: "*",
};

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-green-500"
      : score >= 60
        ? "bg-yellow-500"
        : score >= 40
          ? "bg-orange-500"
          : "bg-red-500";

  return (
    <div className="flex items-center gap-1">
      <div className="w-10 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
      <span className="text-[10px] text-zinc-500">{score}</span>
    </div>
  );
}

export default function TrendCard({ trend }: { trend: Trend }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = !!(
    trend.description ||
    trend.why_trending ||
    trend.popularity.metric
  );

  return (
    <div
      className={`bg-zinc-800/40 border border-zinc-700/40 rounded px-3 py-2 transition-colors ${
        hasDetails ? "cursor-pointer hover:border-zinc-600" : ""
      }`}
      onClick={() => hasDetails && setExpanded(!expanded)}
    >
      {/* Compact header — always visible */}
      <div className="flex items-center gap-2 min-w-0">
        <h3 className="font-medium text-zinc-200 text-xs leading-tight flex-1 truncate">
          {trend.title}
        </h3>
        <span
          className={`text-[10px] font-mono shrink-0 ${momentumColors[trend.momentum] || "text-zinc-400"}`}
        >
          {momentumIcons[trend.momentum]} {trend.momentum}
        </span>
        <ScoreBar score={trend.popularity.score} />
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-zinc-700/30 space-y-1">
          {trend.description && (
            <p className="text-xs text-zinc-400 leading-relaxed">
              {trend.description}
            </p>
          )}
          {trend.why_trending && (
            <p className="text-xs text-zinc-500 italic">
              {trend.why_trending}
            </p>
          )}
          {trend.popularity.metric && (
            <p className="text-[10px] text-zinc-500 font-mono">
              {trend.popularity.metric}
            </p>
          )}
          <div className="flex items-center gap-1 flex-wrap pt-0.5">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                trend.popularity.reach === "high"
                  ? "bg-green-900/30 text-green-400"
                  : trend.popularity.reach === "medium"
                    ? "bg-yellow-900/30 text-yellow-400"
                    : "bg-zinc-700/50 text-zinc-400"
              }`}
            >
              {trend.popularity.reach} reach
            </span>
            {trend.sources.map((src) => (
              <span
                key={src}
                className="text-[10px] px-1 py-0.5 bg-zinc-700/50 text-zinc-500 rounded"
              >
                {src}
              </span>
            ))}
            {trend.urls.length > 0 && (
              <a
                href={trend.urls[0]}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] text-blue-400 hover:text-blue-300 ml-auto"
              >
                link &rarr;
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
