"use client";

import { TYPE_LABELS } from "@/lib/types";
import type { TrendData, ProgressData } from "@/lib/types";
import { formatAge } from "@/lib/hooks";

interface SystemHealthStripProps {
  latestData: TrendData | null;
  progress: ProgressData | null;
  elapsed: string;
}

export default function SystemHealthStrip({
  latestData,
  progress,
  elapsed,
}: SystemHealthStripProps) {
  const isRunning = progress?.status === "running";

  return (
    <div className="flex items-center gap-4 px-3 py-2 mb-4 rounded-lg bg-zinc-900/50 border border-zinc-800/50 text-xs text-zinc-500">
      {/* Pipeline status */}
      <div className="flex items-center gap-1.5">
        <span
          className={`h-2 w-2 rounded-full ${
            isRunning
              ? "bg-blue-400 animate-pulse"
              : progress?.status === "failed"
                ? "bg-red-400"
                : "bg-zinc-600"
          }`}
        />
        <span className={isRunning ? "text-blue-400" : ""}>
          {isRunning
            ? `Running ${TYPE_LABELS[progress.type] || progress.type}... ${elapsed}`
            : "Idle"}
        </span>
      </div>

      <span className="text-zinc-700">|</span>

      {/* Sources health */}
      {latestData && (
        <>
          <span>
            {latestData.data_quality.sources_ok}/
            {latestData.data_quality.sources_ok +
              latestData.data_quality.sources_failed.length}{" "}
            sources OK
          </span>
          <span className="text-zinc-700">|</span>
        </>
      )}

      {/* Last run age */}
      {latestData && (
        <>
          <span>
            Last run: {formatAge(latestData.timestamp)} (
            {TYPE_LABELS[latestData.type]?.split(" ")[0].toLowerCase() ||
              latestData.type}
            )
          </span>
          <span className="text-zinc-700">|</span>
        </>
      )}

      {/* Item count */}
      {latestData && (
        <span>{latestData.data_quality.total_raw_items} items</span>
      )}

      {!latestData && <span>No data yet</span>}
    </div>
  );
}
