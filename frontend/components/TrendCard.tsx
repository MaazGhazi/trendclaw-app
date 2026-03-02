"use client";

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
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-zinc-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
      <span className="text-xs text-zinc-400">{score}</span>
    </div>
  );
}

export default function TrendCard({ trend }: { trend: Trend }) {
  return (
    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4 hover:border-zinc-600 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-semibold text-zinc-100 text-sm leading-tight">
          {trend.title}
        </h3>
        <span
          className={`text-xs font-mono whitespace-nowrap ${momentumColors[trend.momentum] || "text-zinc-400"}`}
        >
          {momentumIcons[trend.momentum]} {trend.momentum}
        </span>
      </div>

      <p className="text-xs text-zinc-400 mb-2 leading-relaxed">
        {trend.description}
      </p>

      {trend.why_trending && (
        <p className="text-xs text-zinc-500 mb-3 italic">
          {trend.why_trending}
        </p>
      )}

      <div className="flex items-center justify-between mb-2">
        <ScoreBar score={trend.popularity.score} />
        <span
          className={`text-xs px-1.5 py-0.5 rounded ${
            trend.popularity.reach === "high"
              ? "bg-green-900/40 text-green-400"
              : trend.popularity.reach === "medium"
                ? "bg-yellow-900/40 text-yellow-400"
                : "bg-zinc-700 text-zinc-400"
          }`}
        >
          {trend.popularity.reach}
        </span>
      </div>

      {trend.popularity.metric && (
        <p className="text-[10px] text-zinc-500 mb-3 font-mono leading-relaxed">
          {trend.popularity.metric}
        </p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {trend.sources.map((src) => (
            <span
              key={src}
              className="text-[10px] px-1.5 py-0.5 bg-zinc-700/50 text-zinc-400 rounded"
            >
              {src}
            </span>
          ))}
        </div>
        {trend.urls.length > 0 && (
          <a
            href={trend.urls[0]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-blue-400 hover:text-blue-300"
          >
            link
          </a>
        )}
      </div>
    </div>
  );
}
