"use client";

import { useState } from "react";
import type { HistoryRun } from "@/lib/types";
import { TYPE_LABELS, TYPE_COLORS } from "@/lib/types";

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

export default function HistoryTab({ runs, loading, onViewRun }: HistoryTabProps) {
  const [filter, setFilter] = useState("all");

  const filtered =
    filter === "all" ? runs : runs.filter((r) => r.type === filter);

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
      <div className="flex items-center gap-2 mb-4">
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
        <span className="text-xs text-zinc-600 ml-2">
          {filtered.length} run{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-zinc-500 text-sm">No runs found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-zinc-900/50">
                <th className="text-left px-3 py-2 text-zinc-500 font-medium">
                  Type
                </th>
                <th className="text-left px-3 py-2 text-zinc-500 font-medium">
                  Timestamp
                </th>
                <th className="text-right px-3 py-2 text-zinc-500 font-medium">
                  Items
                </th>
                <th className="text-right px-3 py-2 text-zinc-500 font-medium">
                  Sources
                </th>
                <th className="text-right px-3 py-2 text-zinc-500 font-medium">
                  Size
                </th>
                <th className="text-right px-3 py-2 text-zinc-500 font-medium">
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {filtered.map((run) => (
                <tr
                  key={run.file}
                  className="hover:bg-zinc-800/30 transition-colors cursor-pointer"
                  onClick={() => onViewRun(run.file)}
                >
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-medium ${TYPE_COLORS[run.type] || "bg-zinc-800 text-zinc-300 border-zinc-700"}`}
                    >
                      {TYPE_LABELS[run.type] || run.type}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-zinc-400">
                    {new Date(run.created).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2.5 text-right text-zinc-400">
                    {run.data_quality?.total_items ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-zinc-400">
                    {run.data_quality?.sources_ok != null
                      ? `${run.data_quality.sources_ok} OK`
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-zinc-500">
                    {(run.size / 1024).toFixed(1)}KB
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="text-blue-400 hover:text-blue-300">
                      View
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
