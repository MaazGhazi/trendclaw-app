"use client";

import { useState } from "react";
import type { TrendData } from "@/lib/types";
import CategorySection from "@/components/CategorySection";
import type { ExpandSignal } from "@/components/CategorySection";
import DataQuality from "@/components/DataQuality";

interface TrendsTabProps {
  data: TrendData | null;
  error: string;
  viewingFile?: string | null;
  onBackToLatest?: () => void;
}

const directionStyle: Record<string, { icon: string; color: string }> = {
  up: { icon: "↑", color: "text-green-400" },
  down: { icon: "↓", color: "text-red-400" },
  new: { icon: "★", color: "text-purple-400" },
};

export default function TrendsTab({
  data,
  error,
  viewingFile,
  onBackToLatest,
}: TrendsTabProps) {
  const [expandCmd, setExpandCmd] = useState<ExpandSignal>({ open: false, v: 0 });

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-zinc-500 text-sm">{error}</p>
        <p className="text-zinc-600 text-xs mt-2">
          POST trend data to /api/trends to get started
        </p>
      </div>
    );
  }

  if (!data) return null;

  const totalTrends = data.categories.reduce(
    (sum, cat) => sum + cat.trends.length,
    0,
  );

  const handleToggleAll = () => {
    setExpandCmd((prev) => ({ open: !prev.open, v: prev.v + 1 }));
  };

  return (
    <>
      {/* Historical run banner */}
      {viewingFile && onBackToLatest && (
        <div className="flex items-center gap-3 mb-4 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
          <span className="text-xs text-zinc-400">
            Viewing:{" "}
            <span className="text-zinc-200 font-medium">
              {data.type} from{" "}
              {new Date(data.timestamp).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </span>
          <button
            onClick={onBackToLatest}
            className="text-xs text-blue-400 hover:text-blue-300 underline"
          >
            Back to Latest
          </button>
        </div>
      )}

      <DataQuality quality={data.data_quality} />

      {/* Overview strip: summary + movers/signals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
        {/* Summary */}
        <div className="lg:col-span-2 bg-zinc-800/40 border border-zinc-700/40 rounded-lg p-3">
          <p className="text-xs text-zinc-400 leading-relaxed">
            {data.summary}
          </p>
        </div>

        {/* Top Movers + Signals */}
        <div className="bg-zinc-800/40 border border-zinc-700/40 rounded-lg p-3">
          {data.top_movers.length > 0 && (
            <div className="space-y-1">
              {data.top_movers.slice(0, 5).map((m) => {
                const s = directionStyle[m.direction] || directionStyle.new;
                return (
                  <div key={m.title} className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-mono ${s.color}`}>
                      {s.icon}
                    </span>
                    <span className="text-xs text-zinc-300 truncate">
                      {m.title}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {data.signals.emerging.length > 0 && (
            <div className="mt-2 pt-2 border-t border-zinc-700/30">
              <div className="flex flex-wrap gap-1">
                {data.signals.emerging.map((s) => (
                  <span
                    key={s}
                    className="text-[10px] px-1.5 py-0.5 bg-green-900/30 text-green-400 rounded"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {data.signals.fading.length > 0 && (
            <div className="mt-2 pt-2 border-t border-zinc-700/30">
              <div className="flex flex-wrap gap-1">
                {data.signals.fading.map((s) => (
                  <span
                    key={s}
                    className="text-[10px] px-1.5 py-0.5 bg-red-900/30 text-red-400 rounded"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {data.top_movers.length === 0 &&
            data.signals.emerging.length === 0 &&
            data.signals.fading.length === 0 && (
              <p className="text-xs text-zinc-600">No movers or signals</p>
            )}
        </div>
      </div>

      {/* Sources header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-zinc-500">
          {totalTrends} trend{totalTrends !== 1 ? "s" : ""} across{" "}
          {data.categories.length} source
          {data.categories.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={handleToggleAll}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {expandCmd.open ? "Collapse all" : "Expand all"}
        </button>
      </div>

      {/* Categories accordion */}
      <div>
        {data.categories.map((cat) => (
          <CategorySection
            key={cat.name}
            category={cat}
            expandSignal={expandCmd}
          />
        ))}
      </div>
    </>
  );
}
