"use client";

import { TYPE_LABELS, TYPE_COLORS, TYPE_BUTTON_COLORS } from "@/lib/types";
import type { TrendData } from "@/lib/types";
import AuthButton from "./AuthButton";

interface DashboardHeaderProps {
  latestData: TrendData | null;
  latestFile: string;
  runningType: string | null;
  runMessage: string;
  region?: string | null;
  onTriggerRun: (type: string) => void;
  onRefresh: () => void;
}

export default function DashboardHeader({
  latestData,
  latestFile,
  runningType,
  runMessage,
  region,
  onTriggerRun,
  onRefresh,
}: DashboardHeaderProps) {
  return (
    <header className="mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-zinc-100">TrendClaw</h1>
          {region && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-800">
              {region}
            </span>
          )}
          {latestData && (
            <p className="text-xs text-zinc-500 mt-1">
              <span
                className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-medium mr-2 ${TYPE_COLORS[latestData.type] || "bg-zinc-800 text-zinc-300 border-zinc-700"}`}
              >
                {TYPE_LABELS[latestData.type] || latestData.type}
              </span>
              {new Date(latestData.timestamp).toLocaleString()}
              <span className="text-zinc-600 ml-2">{latestFile}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onRefresh}
            className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md text-zinc-300 transition-colors"
          >
            Refresh
          </button>
          <AuthButton />
        </div>
      </div>

      {/* Run buttons */}
      <div className="flex items-center gap-2 mt-3">
        <span className="text-xs text-zinc-600 mr-1">Run:</span>
        {(["pulse", "digest", "deep_dive"] as const).map((type) => (
          <button
            key={type}
            onClick={() => onTriggerRun(type)}
            disabled={runningType !== null}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${TYPE_BUTTON_COLORS[type]}`}
          >
            {runningType === type ? (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
                Starting...
              </span>
            ) : (
              TYPE_LABELS[type]
            )}
          </button>
        ))}
        {runMessage && (
          <span className="text-xs text-zinc-400 ml-2">{runMessage}</span>
        )}
      </div>
    </header>
  );
}
