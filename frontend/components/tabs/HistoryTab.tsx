"use client";

import { useState } from "react";
import type { HistoryRun } from "@/lib/types";
import { TYPE_LABELS, TYPE_COLORS } from "@/lib/types";
import { formatAge } from "@/lib/hooks";

interface HistoryTabProps {
  runs: HistoryRun[];
  loading: boolean;
  onViewRun: (file: string) => void;
}

const filterOptions = [
  { value: "all", label: "All" },
  { value: "pulse", label: "Pulse" },
  { value: "digest", label: "Digest" },
  { value: "deep_dive", label: "Deep Dive" },
];

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(0)}KB`;
}

export default function HistoryTab({ runs, loading, onViewRun }: HistoryTabProps) {
  const [filter, setFilter] = useState("all");

  const filtered =
    filter === "all" ? runs : runs.filter((r) => r.type === filter);

  // Separate successful and failed runs
  const successful = filtered.filter((r) => !r.failed);
  const failedCount = filtered.filter((r) => r.failed).length;

  const [showFailed, setShowFailed] = useState(false);
  const displayed = showFailed ? filtered : successful;

  if (loading) {
    return (
      <div className="text-center py-12">
        <span className="text-zinc-500 text-sm">Loading history...</span>
      </div>
    );
  }

  return (
    <div>
      {/* Filter row */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {filterOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
              filter === opt.value
                ? "bg-zinc-700 border-zinc-600 text-zinc-100"
                : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <span className="text-xs text-zinc-600 ml-auto">
          {successful.length} successful run{successful.length !== 1 ? "s" : ""}
          {failedCount > 0 && (
            <button
              onClick={() => setShowFailed(!showFailed)}
              className="ml-2 text-zinc-500 hover:text-zinc-400 underline underline-offset-2"
            >
              {showFailed ? "hide" : "show"} {failedCount} failed
            </button>
          )}
        </span>
      </div>

      {displayed.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-zinc-500 text-sm">No runs found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((run) => {
            const dq = run.data_quality;
            const isFailed = run.failed;

            return (
              <button
                key={run.file}
                onClick={() => !isFailed && onViewRun(run.file)}
                disabled={isFailed}
                className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
                  isFailed
                    ? "bg-zinc-900/30 border-zinc-800/50 opacity-50 cursor-not-allowed"
                    : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50 cursor-pointer"
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Type badge */}
                  <span
                    className={`inline-block px-2 py-0.5 rounded border text-[10px] font-medium shrink-0 ${
                      TYPE_COLORS[run.type] || "bg-zinc-800 text-zinc-300 border-zinc-700"
                    }`}
                  >
                    {TYPE_LABELS[run.type] || run.type}
                  </span>

                  {/* Timestamp */}
                  <span className="text-sm text-zinc-300">
                    {formatTimestamp(run.created)}
                  </span>

                  {/* Relative time */}
                  <span className="text-xs text-zinc-600">
                    {formatAge(run.created)}
                  </span>

                  {/* Failed badge */}
                  {isFailed && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-950/50 text-red-400 border border-red-900/50">
                      Failed
                    </span>
                  )}

                  {/* Stats (right side) */}
                  <div className="ml-auto flex items-center gap-4 text-xs">
                    {!isFailed && dq && (
                      <>
                        <span className="text-zinc-400">
                          <span className="text-zinc-200 font-medium">{dq.trend_count}</span> trends
                        </span>
                        <span className="text-zinc-500">
                          {dq.sources_ok} sources
                        </span>
                        {run.size != null && (
                          <span className="text-zinc-600">
                            {formatSize(run.size)}
                          </span>
                        )}
                      </>
                    )}
                    {!isFailed && (
                      <span className="text-blue-400 text-xs">
                        View &rarr;
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
